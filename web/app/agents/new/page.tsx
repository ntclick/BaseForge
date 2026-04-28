"use client";

import { useEffect, useRef, useState } from "react";
import { decodeEventLog } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { AGENT_ABI, AGENT_ADDRESS, IDENTITY_ABI, IDENTITY_ADDRESS } from "@/lib/contracts";
import { targetChain } from "@/lib/wagmi";
import { TokenPicker, type Token } from "@/components/TokenPicker";
import { BotTokenInput, type BotInfo } from "@/components/BotTokenInput";

const ALERT_OPTIONS: { id: string; label: string; desc: string; needsFutures?: boolean }[] = [
  { id: "trade_size", label: "Large trades", desc: "Whale buys/sells over your USD threshold" },
  { id: "volume_spike", label: "Volume spike", desc: "Volume jumps Nx the rolling average" },
  { id: "rsi_extreme", label: "RSI extremes", desc: "Oversold (<30) or overbought (>70)" },
  { id: "ema_cross", label: "EMA cross", desc: "EMA20/50 crossover (trend shift)" },
  { id: "bb_touch", label: "Bollinger touch", desc: "Price hits upper or lower band" },
  { id: "macd_cross", label: "MACD cross", desc: "Bullish/bearish momentum cross" },
  { id: "news", label: "News mentions", desc: "Token appears in major crypto news" },
  { id: "funding_rate", label: "Funding rate", desc: "Spike in perpetual funding (long/short squeeze risk)", needsFutures: true },
];

type Step = "connect" | "identity" | "notify" | "prompt" | "agent" | "done";

type ParseResult = {
  name: string;
  token_symbol: string;
  enabled_alerts: string[];
  thresholds: Record<string, number>;
};

export default function NewAgentPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const onBase = chainId === targetChain.id;
  const [step, setStep] = useState<Step>("connect");
  const [error, setError] = useState<string | null>(null);

  const [chatId, setChatId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"form" | "ai">("form");
  const [prompt, setPrompt] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Form-mode state
  const [token, setToken] = useState<Token | null>(null);
  const [enabledAlerts, setEnabledAlerts] = useState<string[]>(["trade_size", "volume_spike"]);
  const [tradeSize, setTradeSize] = useState(10_000);
  const [volMult, setVolMult] = useState(2);
  const [rsiOver, setRsiOver] = useState(70);
  const [rsiUnder, setRsiUnder] = useState(30);
  const [fundingThreshold, setFundingThreshold] = useState(0.03);
  const [reportInterval, setReportInterval] = useState(0);

  function buildFormConfig(): ParseResult | null {
    if (!token) return null;
    return {
      name: `${token.symbol} alerts`,
      token_symbol: token.symbol,
      enabled_alerts: enabledAlerts,
      thresholds: {
        trade_size_usd: tradeSize,
        volume_multiplier: volMult,
        rsi_oversold: rsiUnder,
        rsi_overbought: rsiOver,
        funding_rate_threshold: fundingThreshold,
        report_interval_minutes: reportInterval,
      },
    };
  }

  // ── Identity NFT ─────────────────────────────────────────────────────────
  const { data: identityTokenId, refetch: refetchIdentity } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "tokenOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const hasIdentity = typeof identityTokenId === "bigint" && identityTokenId > 0n;

  const { writeContract: mintIdentity, data: identityTx, isPending: identityPending } = useWriteContract();
  const { isLoading: identityConfirming, isSuccess: identityConfirmed } =
    useWaitForTransactionReceipt({ hash: identityTx });

  useEffect(() => {
    if (identityConfirmed) refetchIdentity();
  }, [identityConfirmed, refetchIdentity]);

  // ── Agent NFT ─────────────────────────────────────────────────────────────
  const { writeContract: mintAgent, data: agentTx, isPending: agentPending } = useWriteContract();
  const { data: agentReceipt, isLoading: agentConfirming, isSuccess: agentConfirmed } =
    useWaitForTransactionReceipt({ hash: agentTx });

  /** Extract tokenId from the AgentMinted event in the receipt logs. */
  function extractTokenId(): string | undefined {
    if (!agentReceipt) return undefined;
    for (const log of agentReceipt.logs) {
      if (log.address.toLowerCase() !== AGENT_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: AGENT_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "AgentMinted") {
          return (decoded.args as { tokenId: bigint }).tokenId.toString();
        }
      } catch {
        // not the event we want, skip
      }
    }
    return undefined;
  }

  // Persist to DB after on-chain confirmation (or immediately in devMode)
  const didSave = useRef(false);
  async function persistAgent(txHash?: string, tokenId?: string) {
    if (!parsed || didSave.current) return;
    const wallet = address ?? "0xdev0000000000000000000000000000000000dev";
    didSave.current = true;
    setSaving(true);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: wallet.toLowerCase(),
          telegram_chat_id: chatId || undefined,
          telegram_bot_token: botToken || undefined,
          telegram_bot_username: botUsername || undefined,
          email: email || undefined,
          parsed,
          prompt,
          nft_tx_hash: txHash,
          nft_token_id: tokenId,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setStep("done");
    } catch (e) {
      setError(String(e));
      didSave.current = false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!agentConfirmed || !agentTx || !agentReceipt) return;
    const tokenId = extractTokenId();
    persistAgent(agentTx, tokenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConfirmed, agentTx, agentReceipt]);

  // devMode: contracts not yet deployed — skip Identity + Agent NFT steps but still require wallet
  const devMode = !AGENT_ADDRESS || AGENT_ADDRESS === "0x0000000000000000000000000000000000000000";

  // ── Step transitions ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) { setStep("connect"); return; }
    if (isConnected && !onBase) { setStep("connect"); return; } // keep on connect step, show switch banner
    if (devMode) {
      if (step === "connect" || step === "identity") setStep("notify");
      return;
    }
    if (!hasIdentity) setStep("identity");
    else if (step === "connect" || step === "identity") setStep("notify");
  }, [isConnected, onBase, hasIdentity, step, devMode]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleParse() {
    setError(null);
    setParsing(true);
    try {
      const r = await fetch("/api/agents/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, llm_key: llmKey || undefined }),
      });
      if (!r.ok) throw new Error(await r.text());
      const result = await r.json();
      setParsed(result);
      setStep("agent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "parse failed");
    } finally {
      setParsing(false);
    }
  }

  function handleMintAgent() {
    if (!parsed) return;
    setError(null);
    didSave.current = false;
    if (devMode) {
      // No contracts deployed → skip mint, persist directly
      persistAgent();
      return;
    }
    const configHash = btoa(JSON.stringify(parsed)).slice(0, 80);
    mintAgent({
      address: AGENT_ADDRESS,
      abi: AGENT_ABI,
      functionName: "mint",
      args: [configHash],
    });
  }

  // Build the list of stepper entries dynamically — skip pre-reqs that are already satisfied
  const stepperEntries: { id: Step; label: string }[] = [];
  if (!isConnected || !onBase) stepperEntries.push({ id: "connect", label: "Connect" });
  if (!devMode && !hasIdentity) stepperEntries.push({ id: "identity", label: "Identity NFT" });
  stepperEntries.push({ id: "notify", label: "Notify" });
  stepperEntries.push({ id: "prompt", label: "Prompt" });
  stepperEntries.push({ id: "agent", label: "Mint Agent" });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">New agent</h1>
          {devMode && (
            <span className="text-[10px] uppercase tracking-wider bg-amber-900 text-amber-300 px-2 py-0.5 rounded">
              dev mode (no NFT)
            </span>
          )}
          {hasIdentity && !devMode && (
            <span className="text-[10px] uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-900 px-2 py-0.5 rounded">
              ✓ Identity ready
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">
          {devMode
            ? "Contracts not deployed — running in dev mode."
            : hasIdentity
            ? "Each agent is its own NFT — mint as many as you need, each runs an independent task."
            : "Each agent is its own NFT on Base. You need a free Identity NFT first (one-time)."}
        </p>
      </header>

      <Stepper entries={stepperEntries} current={step} />

      {error && (
        <div className="text-red-400 text-sm border border-red-800 bg-red-950 rounded p-3">{error}</div>
      )}

      {step === "connect" && (
        <Card title="Connect your wallet">
          {!isConnected ? (
            <p className="text-sm text-gray-400">Use the Connect wallet button in the header.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-amber-400">
                You&apos;re connected but on the wrong network. BaseForge runs on Base mainnet.
              </p>
              <button
                onClick={() => switchChain({ chainId: targetChain.id })}
                disabled={isSwitching}
                className="bg-amber-500 text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {isSwitching ? "Switching…" : "Switch to Base"}
              </button>
            </div>
          )}
        </Card>
      )}

      {step === "identity" && (
        <Card title="Mint your Identity NFT (free, gas only)">
          <p className="text-sm text-gray-400">
            Soulbound. One per wallet. Unlocks the free tier (1 active agent).
          </p>
          <button
            onClick={() =>
              mintIdentity({ address: IDENTITY_ADDRESS, abi: IDENTITY_ABI, functionName: "mint", args: [] })
            }
            disabled={identityPending || identityConfirming}
            className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {identityPending ? "Confirm in wallet…" : identityConfirming ? "Waiting for confirmation…" : "Mint Identity"}
          </button>
        </Card>
      )}

      {step === "notify" && (
        <NotifyStep
          chatId={chatId}
          email={email}
          setEmail={setEmail}
          onLinked={(info) => {
            setChatId(info.chat_id);
            setBotToken(info.bot_token);
            setBotUsername(info.bot_username);
          }}
          onContinue={() => setStep("prompt")}
        />
      )}

      {step === "prompt" && (
        <Card title="Pick a token & alerts">
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setMode("form")}
              className={`px-3 py-1 rounded-md ${mode === "form" ? "bg-white text-black" : "bg-border text-gray-400"}`}
            >
              Form
            </button>
            <button
              onClick={() => setMode("ai")}
              className={`px-3 py-1 rounded-md ${mode === "ai" ? "bg-white text-black" : "bg-border text-gray-400"}`}
            >
              AI prompt
            </button>
          </div>

          {mode === "form" && (
            <>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Token</label>
                <div className="mt-1">
                  <TokenPicker value={token} onChange={setToken} />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">Alerts</label>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {ALERT_OPTIONS.map((opt) => {
                    const disabled = opt.needsFutures && token && !token.has_futures;
                    const checked = enabledAlerts.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-start gap-2 border rounded-md p-2 ${disabled ? "opacity-40 cursor-not-allowed border-border" : checked ? "border-emerald-700 bg-emerald-950" : "border-border bg-bg cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!!disabled}
                          onChange={(e) => {
                            setEnabledAlerts((prev) =>
                              e.target.checked ? [...prev, opt.id] : prev.filter((x) => x !== opt.id),
                            );
                          }}
                          className="mt-1"
                        />
                        <div>
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-[11px] text-gray-500">
                            {opt.desc}
                            {opt.needsFutures && token && !token.has_futures && " (no futures market)"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <NumField label="Trade size $" value={tradeSize} onChange={setTradeSize} step={1000} />
                <NumField label="Volume Nx" value={volMult} onChange={setVolMult} step={0.5} />
                <NumField label="RSI under" value={rsiUnder} onChange={setRsiUnder} step={1} />
                <NumField label="RSI over" value={rsiOver} onChange={setRsiOver} step={1} />
                <NumField label="Funding % threshold" value={fundingThreshold} onChange={setFundingThreshold} step={0.01} />
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block">
                  Periodic snapshot
                </label>
                <select
                  value={reportInterval}
                  onChange={(e) => setReportInterval(Number(e.target.value))}
                  className="mt-1 w-full bg-bg border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                >
                  <option value={0}>Off (only fire on events)</option>
                  <option value={5}>Every 5 minutes</option>
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every 1 hour</option>
                  <option value={240}>Every 4 hours</option>
                  <option value={720}>Every 12 hours</option>
                  <option value={1440}>Every 24 hours</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Send a market snapshot on schedule (in addition to real-time alerts).
                </p>
              </div>

              <button
                onClick={() => {
                  const cfg = buildFormConfig();
                  if (cfg) {
                    setParsed(cfg);
                    setStep("agent");
                  }
                }}
                disabled={!token || enabledAlerts.length === 0}
                className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                Continue
              </button>
            </>
          )}

          {mode === "ai" && (
            <>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Alert me when AERO volume is 3x average, RSI drops below 30, and funding rate spikes above 0.05%."
                className="w-full bg-bg border border-border rounded-md p-3 font-mono text-sm focus:outline-none focus:border-gray-500"
              />
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-300">Bring your own LLM key (optional)</summary>
                <input
                  type="password"
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  placeholder="sk-… (OpenAI), sk-ant-… (Claude), or Kimi key"
                  className="mt-2 w-full bg-bg border border-border rounded-md px-3 py-2 text-sm font-mono"
                />
                <p className="mt-1 text-[11px]">If empty, server uses Kimi (Moonshot) by default.</p>
              </details>
              <button
                onClick={handleParse}
                disabled={!prompt.trim() || parsing}
                className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {parsing ? "Parsing…" : "Generate from prompt"}
              </button>
            </>
          )}
        </Card>
      )}

      {step === "agent" && parsed && (
        <Card title="Mint your Agent NFT">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Detected</div>
          <div className="font-semibold">{parsed.name}</div>
          <div className="text-sm">
            <span className="text-gray-400">Token:</span> {parsed.token_symbol}/USDT
          </div>
          <div className="flex flex-wrap gap-1">
            {parsed.enabled_alerts.map((a) => (
              <span key={a} className="text-[10px] uppercase tracking-wider bg-border px-1.5 py-0.5 rounded">
                ✓ {a.replace("_", " ")}
              </span>
            ))}
          </div>
          <pre className="text-xs text-gray-400 bg-bg p-2 rounded border border-border overflow-x-auto">
            {JSON.stringify(parsed.thresholds, null, 2)}
          </pre>
          <button
            onClick={handleMintAgent}
            disabled={agentPending || agentConfirming || saving}
            className="bg-emerald-500 text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {agentPending ? "Confirm in wallet…" : agentConfirming ? "Waiting for tx…" : saving ? "Saving…" : devMode ? "Create agent (dev)" : "Mint Agent NFT"}
          </button>
        </Card>
      )}

      {step === "done" && (
        <DoneStep parsed={parsed} agentTx={agentTx} />
      )}
    </div>
  );
}

function DoneStep({ parsed, agentTx }: { parsed: ParseResult | null; agentTx?: `0x${string}` }) {
  const [secs, setSecs] = useState(3);
  useEffect(() => {
    if (secs <= 0) {
      window.location.href = "/dashboard";
      return;
    }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  return (
    <Card title="✓ Agent live">
      <p className="text-sm text-gray-400">
        Your agent is monitoring {parsed?.token_symbol}/USDT and will push alerts to Telegram.
      </p>
      {agentTx && (
        <p className="text-xs text-gray-500 font-mono break-all">
          Tx: <a href={`https://basescan.org/tx/${agentTx}`} target="_blank" rel="noopener noreferrer" className="hover:text-white underline">{agentTx.slice(0, 10)}…{agentTx.slice(-6)}</a>
        </p>
      )}
      <a href="/dashboard" className="text-emerald-400 underline text-sm">
        Open dashboard now (auto in {secs}s) →
      </a>
    </Card>
  );
}

function Stepper({ entries, current }: { entries: { id: Step; label: string }[]; current: Step }) {
  const idx = entries.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-2 text-xs flex-wrap">
      {entries.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-full grid place-items-center text-[10px] ${
              i < idx ? "bg-emerald-500 text-black" : i === idx ? "bg-white text-black" : "bg-border text-gray-500"
            }`}
          >
            {i < idx ? "✓" : i + 1}
          </span>
          <span className={i === idx ? "text-white" : "text-gray-500"}>{s.label}</span>
          {i < entries.length - 1 && <span className="text-gray-700">·</span>}
        </li>
      ))}
    </ol>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
}) {
  return (
    <label className="text-xs text-gray-500 block">
      {label}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full bg-bg border border-border rounded-md px-2 py-1 text-sm text-white font-mono"
      />
    </label>
  );
}

function NotifyStep({
  chatId,
  email,
  setEmail,
  onLinked,
  onContinue,
}: {
  chatId: string;
  email: string;
  setEmail: (v: string) => void;
  onLinked: (info: BotInfo) => void;
  onContinue: () => void;
}) {
  return (
    <Card title="Bring your own Telegram bot">
      <p className="text-xs text-gray-500">
        BaseForge sends alerts via <em>your</em> bot — you own it, you control it.
        Same model as bringing your own LLM key.
      </p>

      <BotTokenInput onLinked={onLinked} />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-gray-600">also (optional)</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email (optional, sent via Resend)"
        className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm"
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onContinue}
          className="bg-white text-black px-4 py-2 rounded-md text-sm font-medium"
        >
          {chatId || email ? "Continue" : "Skip & continue"}
        </button>
        {!chatId && !email && (
          <p className="text-[11px] text-gray-500">
            No notify channel — alerts will only show in dashboard.
          </p>
        )}
      </div>
    </Card>
  );
}
