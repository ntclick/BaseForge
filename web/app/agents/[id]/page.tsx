"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAccount, useChainId, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { AGENT_ABI, AGENT_ADDRESS } from "@/lib/contracts";
import { targetChain } from "@/lib/wagmi";

const ALERT_OPTIONS = [
  { id: "trade_size",   label: "Large trades",    desc: "Whale buys/sells over threshold" },
  { id: "volume_spike", label: "Volume spike",     desc: "Volume Nx the rolling average" },
  { id: "rsi_extreme",  label: "RSI extremes",     desc: "Oversold / overbought" },
  { id: "ema_cross",    label: "EMA cross",        desc: "EMA20/50 crossover" },
  { id: "bb_touch",     label: "Bollinger touch",  desc: "Price hits upper/lower band" },
  { id: "macd_cross",   label: "MACD cross",       desc: "Bullish / bearish momentum" },
  { id: "news",         label: "News mentions",    desc: "Token appears in crypto news" },
  { id: "funding_rate", label: "Funding rate",     desc: "Perpetual funding spike", needsFutures: true },
];

type AgentConfig = {
  trade_size_usd: number;
  volume_multiplier: number;
  rsi_oversold: number;
  rsi_overbought: number;
  funding_rate_threshold: number;
  enabled_alerts: string[];
  report_interval_minutes?: number;
};

const REPORT_INTERVAL_OPTIONS = [
  { value: 0,    label: "Off (event-driven only)" },
  { value: 5,    label: "Every 5 minutes" },
  { value: 15,   label: "Every 15 minutes" },
  { value: 30,   label: "Every 30 minutes" },
  { value: 60,   label: "Every 1 hour" },
  { value: 240,  label: "Every 4 hours" },
  { value: 720,  label: "Every 12 hours" },
  { value: 1440, label: "Every 24 hours" },
];

type Agent = {
  id: string;
  name: string;
  token_symbol: string;
  status: string;
  config: AgentConfig;
  created_at: string;
  nft_token_id: string | null;
};

type AlertRow = {
  id: string;
  type: string;
  severity: string;
  title: string;
  detail: string | null;
  created_at: string;
};

const SEV: Record<string, string> = {
  info: "text-sky-400",
  warn: "text-amber-400",
  critical: "text-rose-400",
};

const ICON: Record<string, string> = {
  info: "🔔",
  warn: "⚠️",
  critical: "🚨",
};

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onBase = chainId === targetChain.id;
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfig, setPendingConfig] = useState<AgentConfig | null>(null);
  const [serviceStatus, setServiceStatus] = useState<{ online: boolean; reason?: string } | null>(null);

  useEffect(() => {
    fetch("/api/agent-service/status")
      .then((r) => r.json())
      .then(setServiceStatus)
      .catch(() => setServiceStatus({ online: false, reason: "fetch failed" }));
  }, []);

  // Sign updateConfig() on the BaseForgeAgent contract
  const {
    writeContractAsync,
    data: updateTx,
    isPending: isSignPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } =
    useWaitForTransactionReceipt({ hash: updateTx });

  // Surface wagmi errors to the UI
  useEffect(() => {
    if (writeError) {
      console.error("[edit] writeContract error:", writeError);
      setError(`Sign failed: ${writeError.message}`);
      setPendingConfig(null);
    }
  }, [writeError]);
  useEffect(() => {
    if (receiptError) {
      console.error("[edit] receipt error:", receiptError);
      setError(`Tx failed: ${receiptError.message}`);
      setPendingConfig(null);
    }
  }, [receiptError]);

  // Editable fields
  const [enabledAlerts, setEnabledAlerts] = useState<string[]>([]);
  const [tradeSize, setTradeSize] = useState(50_000);
  const [volMult, setVolMult] = useState(3);
  const [rsiOver, setRsiOver] = useState(70);
  const [rsiUnder, setRsiUnder] = useState(30);
  const [fundingThreshold, setFundingThreshold] = useState(0.05);
  const [reportInterval, setReportInterval] = useState(0);

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then(({ agent, alerts: a }) => {
        setAgent(agent);
        setAlerts(a ?? []);
        const cfg: AgentConfig = agent?.config ?? {};
        setEnabledAlerts(cfg.enabled_alerts ?? []);
        setTradeSize(cfg.trade_size_usd ?? 50_000);
        setVolMult(cfg.volume_multiplier ?? 3);
        setRsiOver(cfg.rsi_overbought ?? 70);
        setRsiUnder(cfg.rsi_oversold ?? 30);
        setFundingThreshold(cfg.funding_rate_threshold ?? 0.05);
        setReportInterval(cfg.report_interval_minutes ?? 0);
      })
      .catch(() => setError("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!agent) return;
    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }
    if (!onBase) {
      setError("Switch to Base mainnet to sign.");
      return;
    }
    if (!agent.nft_token_id) {
      setError("This agent has no on-chain NFT token id — cannot sign update.");
      return;
    }
    setError(null);
    const newConfig: AgentConfig = {
      trade_size_usd: tradeSize,
      volume_multiplier: volMult,
      rsi_oversold: rsiUnder,
      rsi_overbought: rsiOver,
      funding_rate_threshold: fundingThreshold,
      enabled_alerts: enabledAlerts,
      report_interval_minutes: reportInterval,
    };
    const configHash = btoa(JSON.stringify({
      name: agent.name,
      token_symbol: agent.token_symbol,
      enabled_alerts: enabledAlerts,
      thresholds: {
        trade_size_usd: tradeSize,
        volume_multiplier: volMult,
        rsi_oversold: rsiUnder,
        rsi_overbought: rsiOver,
        funding_rate_threshold: fundingThreshold,
      },
    })).slice(0, 80);

    console.log("[edit] signing updateConfig", {
      tokenId: agent.nft_token_id,
      configHashLen: configHash.length,
      address,
    });

    setPendingConfig(newConfig);
    try {
      const hash = await writeContractAsync({
        address: AGENT_ADDRESS,
        abi: AGENT_ABI,
        functionName: "updateConfig",
        args: [BigInt(agent.nft_token_id), configHash],
      });
      console.log("[edit] tx submitted", hash);
    } catch (err) {
      console.error("[edit] writeContractAsync threw:", err);
      const msg = err instanceof Error ? err.message : String(err);
      // User rejection in wallet shows up here
      if (/reject|denied|cancelled/i.test(msg)) {
        setError("Transaction rejected in wallet.");
      } else {
        setError(`Sign failed: ${msg}`);
      }
      setPendingConfig(null);
    }
  }

  // After on-chain confirmation, persist to DB
  useEffect(() => {
    if (!isConfirmed || !pendingConfig) return;
    (async () => {
      setSaving(true);
      try {
        const r = await fetch(`/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: pendingConfig, enabled_alerts: pendingConfig.enabled_alerts }),
        });
        if (!r.ok) throw new Error(await r.text());
        setAgent((prev) => prev ? { ...prev, config: pendingConfig } : prev);
        setSaved(true);
        setPendingConfig(null);
        resetWrite();
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "DB save failed");
      } finally {
        setSaving(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  async function toggleStatus() {
    if (!agent) return;
    const next = agent.status === "active" ? "paused" : "active";
    const r = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (r.ok) setAgent((prev) => prev ? { ...prev, status: next } : prev);
  }

  async function deleteAgent() {
    if (!confirm(`Delete agent "${agent?.name}"? This cannot be undone.`)) return;
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    window.location.href = "/dashboard";
  }

  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"ok" | "fail" | null>(null);
  async function sendTest() {
    setTesting(true);
    setTestStatus(null);
    try {
      const r = await fetch(`/api/agents/${id}/test`, { method: "POST" });
      const data = await r.json();
      setTestStatus(r.ok && data.ok ? "ok" : "fail");
      if (!r.ok) setError(data.error ?? "test failed");
    } catch (e) {
      setTestStatus("fail");
      setError(e instanceof Error ? e.message : "test error");
    } finally {
      setTesting(false);
      setTimeout(() => setTestStatus(null), 4000);
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;
  if (!agent) return <p className="text-red-400 text-sm">{error ?? "Agent not found"}</p>;

  const isActive = agent.status === "active";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-white mb-1 block">← Dashboard</Link>
          <h1 className="text-2xl font-semibold">{agent.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{agent.token_symbol}/USDT · Base</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap justify-end">
          <span className={`text-xs px-2 py-0.5 rounded ${isActive ? "bg-emerald-900 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
            {agent.status}
          </span>
          <button
            onClick={sendTest}
            disabled={testing}
            className="text-xs border border-emerald-800 text-emerald-300 rounded-md px-3 py-1.5 hover:bg-emerald-950 disabled:opacity-50"
            title="Fire a test alert via your bot — works any time"
          >
            {testing ? "Sending…" : testStatus === "ok" ? "✓ Sent!" : testStatus === "fail" ? "✗ Failed" : "📨 Test alert"}
          </button>
          <button
            onClick={toggleStatus}
            className="text-xs border border-border rounded-md px-3 py-1.5 hover:bg-border"
          >
            {isActive ? "Pause" : "Resume"}
          </button>
          <button
            onClick={deleteAgent}
            className="text-xs border border-red-900 text-red-400 rounded-md px-3 py-1.5 hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm border border-red-800 bg-red-950 rounded p-3">{error}</div>}

      {serviceStatus && !serviceStatus.online && (
        <div className="border border-amber-900 bg-amber-950 text-amber-300 rounded-lg p-3 text-xs space-y-1">
          <div className="font-medium">⚠️ Live monitor offline</div>
          <p className="text-amber-200/80">
            Your agent is saved on-chain and config is up to date, but the BaseForge monitoring
            service is not reachable right now — real-time alerts won&apos;t fire until it&apos;s online.
            Test alerts via the button above still work (they call Telegram directly).
          </p>
          {serviceStatus.reason && <p className="text-amber-500/60">Reason: {serviceStatus.reason}</p>}
        </div>
      )}

      {/* How it works */}
      <details className="border border-border bg-surface rounded-lg p-4 text-sm">
        <summary className="cursor-pointer font-medium hover:text-emerald-300">
          ⏱ When does this run?
        </summary>
        <ul className="mt-3 space-y-1.5 text-xs text-gray-400 list-disc pl-5">
          <li><strong className="text-gray-200">Real-time (instant):</strong> Large trades + volume spikes — fired the moment Binance WebSocket emits a matching event.</li>
          <li><strong className="text-gray-200">Per-candle:</strong> RSI / EMA / Bollinger / MACD recompute on each closed 1-minute candle.</li>
          <li><strong className="text-gray-200">Funding rate:</strong> Binance pushes mark price every 1s on perpetual futures.</li>
          <li><strong className="text-gray-200">News:</strong> CoinGecko news polled every 5 minutes.</li>
          <li><strong className="text-gray-200">Dedup:</strong> Same alert type won&apos;t fire more than once per 30 seconds.</li>
          <li className="text-emerald-400">Use <em>📨 Test alert</em> to verify your setup any time.</li>
        </ul>
      </details>

      {/* Alert types */}
      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Alert types</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {ALERT_OPTIONS.map((opt) => {
            const checked = enabledAlerts.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex items-start gap-2 border rounded-md p-2 cursor-pointer ${checked ? "border-emerald-700 bg-emerald-950" : "border-border bg-bg"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setEnabledAlerts((prev) =>
                      e.target.checked ? [...prev, opt.id] : prev.filter((x) => x !== opt.id)
                    )
                  }
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] text-gray-500">{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Thresholds */}
      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Thresholds</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Num label="Trade size $" value={tradeSize} onChange={setTradeSize} step={1000} />
          <Num label="Volume Nx" value={volMult} onChange={setVolMult} step={0.5} />
          <Num label="RSI oversold" value={rsiUnder} onChange={setRsiUnder} step={1} />
          <Num label="RSI overbought" value={rsiOver} onChange={setRsiOver} step={1} />
          <Num label="Funding rate %" value={fundingThreshold} onChange={setFundingThreshold} step={0.01} />
        </div>

        <div className="pt-2 border-t border-border">
          <label className="text-xs text-gray-500 uppercase tracking-wider block">
            Periodic snapshot
          </label>
          <select
            value={reportInterval}
            onChange={(e) => setReportInterval(Number(e.target.value))}
            className="mt-1 w-full bg-bg border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
          >
            {REPORT_INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            Send a market snapshot via your bot on a schedule, even when no alerts fire.
            Real-time event alerts always run regardless.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {!isConnected ? (
            <button disabled className="bg-gray-800 text-gray-500 px-4 py-2 rounded-md text-sm font-medium">
              Connect wallet to save
            </button>
          ) : !onBase ? (
            <button
              onClick={() => switchChain({ chainId: targetChain.id })}
              disabled={isSwitching}
              className="bg-amber-500 text-black px-4 py-2 rounded-md text-sm font-medium"
            >
              {isSwitching ? "Switching…" : "Switch to Base"}
            </button>
          ) : (
            <button
              onClick={save}
              disabled={isSignPending || isConfirming || saving || !agent.nft_token_id}
              className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              title={!agent.nft_token_id ? "Agent has no on-chain token id" : ""}
            >
              {isSignPending
                ? "Confirm in wallet…"
                : isConfirming
                ? "Waiting for tx…"
                : saving
                ? "Saving…"
                : saved
                ? "✓ Saved on-chain"
                : "Sign & save"}
            </button>
          )}
          {updateTx && !isConfirmed && (
            <a
              href={`https://basescan.org/tx/${updateTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-white font-mono underline"
            >
              tx ↗
            </a>
          )}
          <p className="text-[11px] text-gray-500">
            Each save updates the on-chain configHash — costs gas.
          </p>
        </div>
      </section>

      {/* Recent alerts */}
      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Recent alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-gray-500">No alerts yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((a) => (
              <div key={a.id} className="py-2 flex gap-3 items-start text-sm">
                <span className="shrink-0">{ICON[a.severity] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${SEV[a.severity] ?? ""}`}>{a.title}</div>
                  {a.detail && <div className="text-xs text-gray-500 truncate">{a.detail}</div>}
                </div>
                <span className="text-[11px] text-gray-600 shrink-0">
                  {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <label className="text-xs text-gray-500 block">
      {label}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full bg-bg border border-border rounded-md px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-gray-500"
      />
    </label>
  );
}
