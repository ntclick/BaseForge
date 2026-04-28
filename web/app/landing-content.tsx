"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = { identities: number; agents: number; alerts: number };
type TopToken = { symbol: string; agents: number };

export function LandingContent() {
  const [stats, setStats] = useState<Stats>({ identities: 0, agents: 0, alerts: 0 });
  const [topTokens, setTopTokens] = useState<TopToken[]>([]);

  useEffect(() => {
    fetch("/api/showcase")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats ?? { identities: 0, agents: 0, alerts: 0 });
        setTopTokens(data.topTokens ?? []);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-10 sm:space-y-16 py-2 sm:py-8">
      {/* Hero */}
      <section className="text-center space-y-3 sm:space-y-4">
        <div className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-widest text-emerald-300 bg-emerald-950 border border-emerald-900 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live on Base mainnet
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
          Mint your trading agent.
          <br className="hidden sm:inline" />{" "}
          <span className="text-emerald-400">Own it on Base.</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base px-2">
          Each agent is an NFT. Plain-English rules · Real-time Binance signals · Alerts to <em>your</em> Telegram bot.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 pt-2 px-4 sm:px-0">
          <Link
            href="/agents/new"
            className="bg-white text-black px-5 py-3 sm:py-2.5 rounded-md font-medium hover:bg-gray-200 text-center"
          >
            Mint your first agent →
          </Link>
          <Link
            href="/dashboard"
            className="border border-border px-5 py-3 sm:py-2.5 rounded-md hover:bg-surface text-center"
          >
            View dashboard
          </Link>
        </div>
      </section>

      {/* On-chain stats */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3 max-w-2xl mx-auto">
        <Stat label="Identities" value={stats.identities} subtitle="soulbound" />
        <Stat label="Agents" value={stats.agents} subtitle="on Base" />
        <Stat label="Alerts" value={stats.alerts} subtitle="dispatched" />
      </section>

      {/* Hottest monitored tokens */}
      {topTokens.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-semibold">Most monitored tokens</h2>
          <div className="flex flex-wrap gap-2">
            {topTokens.map((t) => (
              <div
                key={t.symbol}
                className="border border-border bg-surface rounded-md px-3 py-2 flex items-center gap-2 hover:border-gray-600"
              >
                <span className="text-sm font-semibold">{t.symbol}</span>
                <span className="text-[11px] text-gray-500">{t.agents} {t.agents === 1 ? "agent" : "agents"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      <section className="grid sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { t: "1️⃣ Mint Identity NFT", d: "Soulbound. One per wallet. Free (gas only). Unlocks agent minting." },
          { t: "2️⃣ Mint Agent NFT", d: "Each agent = 1 NFT. Bring your own Telegram bot, bring your own LLM key." },
          { t: "3️⃣ Alerts to your bot", d: "Real-time Binance trades + indicators + news, pushed via your Telegram." },
        ].map((f) => (
          <div key={f.t} className="border border-border rounded-lg p-4 bg-surface">
            <div className="font-medium text-sm sm:text-base">{f.t}</div>
            <div className="text-xs sm:text-sm text-gray-400 mt-1">{f.d}</div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="text-center space-y-3 border border-emerald-900 bg-gradient-to-r from-emerald-950 to-bg rounded-xl p-5 sm:p-8">
        <h3 className="text-lg sm:text-xl font-semibold">Your agent. On-chain. Forever.</h3>
        <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
          NFTs you can transfer, sell, or hold. Your config lives on Base, your bot stays in your hands.
        </p>
        <Link
          href="/agents/new"
          className="inline-block bg-emerald-500 text-black px-5 py-2.5 rounded-md font-medium hover:bg-emerald-400"
        >
          Mint now →
        </Link>
      </section>
    </div>
  );
}

function Stat({ label, value, subtitle }: { label: string; value: number; subtitle: string }) {
  return (
    <div className="border border-border bg-surface rounded-lg p-3 sm:p-4 text-center">
      <div className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight font-mono">{value.toLocaleString()}</div>
      <div className="text-[11px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">{label}</div>
      <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-600">{subtitle}</div>
    </div>
  );
}
