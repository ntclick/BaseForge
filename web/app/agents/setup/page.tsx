"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { TokenPicker, type Token } from "@/components/TokenPicker";

const ALERT_OPTIONS: { id: string; label: string; desc: string; needsFutures?: boolean }[] = [
  { id: "trade_size",   label: "Large trades",     desc: "Whale buys/sells over your USD threshold" },
  { id: "volume_spike", label: "Volume spike",     desc: "Volume jumps Nx the rolling average" },
  { id: "rsi_extreme",  label: "RSI extremes",     desc: "Oversold (<30) or overbought (>70)" },
  { id: "ema_cross",    label: "EMA cross",        desc: "EMA20/50 crossover" },
  { id: "bb_touch",     label: "Bollinger touch",  desc: "Price hits upper or lower band" },
  { id: "macd_cross",   label: "MACD cross",       desc: "Bullish/bearish momentum cross" },
  { id: "news",         label: "News mentions",    desc: "Token appears in major crypto news" },
  { id: "funding_rate", label: "Funding rate",     desc: "Spike in perpetual funding", needsFutures: true },
];

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <SetupContent />
    </Suspense>
  );
}

function SetupContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenId = params.get("tokenId");
  const { address } = useAccount();

  const [chatId, setChatId] = useState("");
  const [token, setToken] = useState<Token | null>(null);
  const [enabledAlerts, setEnabledAlerts] = useState<string[]>(["trade_size", "volume_spike"]);
  const [tradeSize, setTradeSize] = useState(50_000);
  const [volMult, setVolMult] = useState(3);
  const [rsiOver, setRsiOver] = useState(70);
  const [rsiUnder, setRsiUnder] = useState(30);
  const [fundingThreshold, setFundingThreshold] = useState(0.05);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill chatId from existing user record (if any)
  useEffect(() => {
    if (!address) return;
    fetch(`/api/users?wallet=${address}`)
      .then((r) => r.json())
      .then(({ user }) => {
        if (user?.telegram_chat_id) setChatId(user.telegram_chat_id);
      })
      .catch(() => {});
  }, [address]);

  if (!tokenId) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold">Missing tokenId</h1>
        <p className="text-sm text-gray-400">
          This page is for completing setup of an already-minted Agent NFT. Use{" "}
          <Link href="/agents/new" className="underline text-white">/agents/new</Link>{" "}
          to mint a fresh agent instead.
        </p>
      </div>
    );
  }

  async function handleSave() {
    if (!token || !address) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address.toLowerCase(),
          telegram_chat_id: chatId || undefined,
          parsed: {
            name: `${token.symbol} alerts`,
            token_symbol: token.symbol,
            enabled_alerts: enabledAlerts,
            thresholds: {
              trade_size_usd: tradeSize,
              volume_multiplier: volMult,
              rsi_oversold: rsiUnder,
              rsi_overbought: rsiOver,
              funding_rate_threshold: fundingThreshold,
            },
          },
          nft_token_id: tokenId,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-xs text-gray-500 hover:text-white">← Dashboard</Link>
        <h1 className="text-2xl font-semibold mt-1">
          Set up Agent <span className="text-gray-500 font-mono text-base">#{tokenId}</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          You&apos;ve already minted this NFT on Base. Configure it here — no re-mint needed.
        </p>
      </div>

      {error && (
        <div className="text-red-400 text-sm border border-red-800 bg-red-950 rounded p-3">{error}</div>
      )}

      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Notify</h2>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider">Telegram Chat ID</label>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="e.g. 123456789 — get it from @userinfobot"
            className="mt-1 w-full bg-bg border border-border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Token</h2>
        <TokenPicker value={token} onChange={setToken} />
      </section>

      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Alert types</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {ALERT_OPTIONS.map((opt) => {
            const disabled = opt.needsFutures && token && !token.has_futures;
            const checked = enabledAlerts.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex items-start gap-2 border rounded-md p-2 ${disabled ? "opacity-40 cursor-not-allowed border-border" : checked ? "border-emerald-700 bg-emerald-950 cursor-pointer" : "border-border bg-bg cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!!disabled}
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

      <section className="border border-border bg-surface rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Thresholds</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Num label="Trade size $" value={tradeSize} onChange={setTradeSize} step={1000} />
          <Num label="Volume Nx" value={volMult} onChange={setVolMult} step={0.5} />
          <Num label="RSI oversold" value={rsiUnder} onChange={setRsiUnder} step={1} />
          <Num label="RSI overbought" value={rsiOver} onChange={setRsiOver} step={1} />
          <Num label="Funding rate %" value={fundingThreshold} onChange={setFundingThreshold} step={0.01} />
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={!token || saving || enabledAlerts.length === 0}
        className="bg-emerald-500 text-black px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save & start monitoring"}
      </button>
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
        className="mt-1 w-full bg-bg border border-border rounded-md px-2 py-1.5 text-sm text-white font-mono"
      />
    </label>
  );
}
