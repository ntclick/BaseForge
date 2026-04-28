"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { supabaseBrowser } from "@/lib/supabase";

type AgentRow = {
  id: string;
  name: string;
  tokenSymbol: string;
  status: string;
  config: Record<string, number | string | string[] | undefined>;
  alerts: AlertRow[];
  tokenId?: string | null;
  onchain?: boolean;
  unindexed?: boolean;
  tokenURI?: string | null;
  image?: string;
};

type IdentityNft = {
  tokenId: string;
  tokenURI: string | null;
  metadata: { name?: string; image?: string; description?: string } | null;
};

type AlertRow = {
  id: string;
  type: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string | null;
  createdAt: string;
};

const SEV = { info: "text-sky-400", warn: "text-amber-400", critical: "text-rose-400" } as const;

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [identity, setIdentity] = useState<IdentityNft | null>(null);
  const [feed, setFeed] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch agents + identity NFT when wallet connects
  useEffect(() => {
    if (!address) { setAgents([]); setIdentity(null); return; }
    setLoading(true);
    fetch(`/api/agents?wallet=${address}`)
      .then((r) => r.json())
      .then(({ agents, identity }) => {
        console.log("[dashboard] loaded NFTs", { identity, agentCount: agents?.length ?? 0 });
        setAgents(agents ?? []);
        setIdentity(identity ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [address]);

  // Seed feed from most recent alerts across all agents
  useEffect(() => {
    const all = agents.flatMap((a) => a.alerts ?? []);
    all.sort((x, y) => (x.createdAt > y.createdAt ? -1 : 1));
    setFeed(all.slice(0, 30));
  }, [agents]);

  // Supabase realtime subscription for new alerts
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb
      .channel("alerts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "baseforge", table: "alerts" },
        (payload) => {
          const row = payload.new as AlertRow;
          setFeed((prev) => [row, ...prev].slice(0, 50));
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 sm:gap-6">
      <section className="space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-semibold">Your agents</h1>
          <Link href="/agents/new" className="text-xs sm:text-sm bg-white text-black px-3 py-1.5 rounded-md font-medium shrink-0">
            + New agent
          </Link>
        </div>

        {identity && <IdentityCard identity={identity} />}

        {!isConnected && (
          <p className="text-gray-400 text-sm">Connect your wallet to see your agents.</p>
        )}

        {isConnected && loading && (
          <p className="text-gray-500 text-sm">Loading…</p>
        )}

        {isConnected && !loading && agents.length === 0 && (
          <div className="border border-border bg-surface rounded-lg p-8 text-center text-gray-500 text-sm">
            No agents yet.{" "}
            <Link href="/agents/new" className="text-white underline">Create one →</Link>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onStatusChange={async (status) => {
              await fetch(`/api/agents/${a.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
              });
              setAgents((prev) =>
                prev.map((x) => (x.id === a.id ? { ...x, status } : x))
              );
            }} />
          ))}
        </div>
      </section>

      <aside className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-gray-500">Live feed</h2>
        {feed.length === 0 ? (
          <div className="border border-border bg-surface rounded-lg p-4 text-gray-500 text-sm">
            No alerts yet — feed updates in real-time.
          </div>
        ) : (
          <div className="border border-border bg-surface rounded-lg divide-y divide-border max-h-[70vh] overflow-y-auto">
            {feed.map((e) => (
              <div key={e.id} className="px-3 py-2 text-sm flex gap-3 items-start">
                <span className="text-gray-500 font-mono text-xs w-12 shrink-0 pt-0.5">
                  {fmtTime(e.createdAt)}
                </span>
                <span className={`${SEV[e.severity]} font-medium shrink-0 w-5`}>
                  {e.severity === "critical" ? "🚨" : e.severity === "warn" ? "⚠️" : "🔔"}
                </span>
                <span className="text-gray-300 flex-1 leading-tight">{e.title}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function AgentCard({
  agent,
  onStatusChange,
}: {
  agent: AgentRow;
  onStatusChange: (s: string) => void;
}) {
  const cfg = agent.config as {
    enabled_alerts?: string[];
    trade_size_usd?: number;
    volume_multiplier?: number;
    rsi_oversold?: number;
    rsi_overbought?: number;
    funding_rate_threshold?: number;
  };
  const enabledAlerts = cfg.enabled_alerts ?? [];
  const isActive = agent.status === "active";
  const lastAlert = agent.alerts?.[0];
  const alertCount24h = agent.alerts?.length ?? 0;

  return (
    <article className="border border-border bg-surface rounded-lg p-4 space-y-3 hover:border-gray-600 transition-colors">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* NFT thumbnail */}
          <img
            src={ipfsToHttp(agent.image)}
            alt={`Agent NFT #${agent.tokenId}`}
            className="w-12 h-12 rounded-md shrink-0 border border-border bg-bg"
            onError={(e) => { (e.target as HTMLImageElement).src = "/nft/agent.svg"; }}
          />
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-2">
              {agent.name}
              {agent.tokenId && (
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">#{agent.tokenId}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {agent.tokenSymbol}/USDT
              {cfg.trade_size_usd ? <> · ≥${(Number(cfg.trade_size_usd) / 1000).toFixed(0)}k</> : null}
              {cfg.volume_multiplier ? <> · {cfg.volume_multiplier}× vol</> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
              isActive
                ? "bg-emerald-900 text-emerald-300"
                : agent.status === "transferred"
                ? "bg-amber-900 text-amber-300"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {agent.status}
          </span>
          {agent.unindexed && (
            <span
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-900 text-sky-300"
              title="Minted on-chain — not yet configured in this dashboard"
            >
              On-chain only
            </span>
          )}
        </div>
      </header>

      {enabledAlerts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {enabledAlerts.map((e) => (
            <span key={e} className="text-[10px] uppercase tracking-wider bg-border px-1.5 py-0.5 rounded">
              ✓ {e.replace("_", " ")}
            </span>
          ))}
        </div>
      )}

      {lastAlert ? (
        <div className="text-xs text-gray-400 border-t border-border pt-2">
          <span className="text-gray-500">Last alert:</span> {lastAlert.title}
          <div className="text-[10px] text-gray-600 mt-0.5">
            {new Date(lastAlert.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {alertCount24h > 1 && <> · {alertCount24h} recent</>}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-600 border-t border-border pt-2">
          No alerts yet — monitoring…
        </div>
      )}

      <footer className="flex justify-between items-center pt-1">
        {agent.unindexed ? (
          <span className="text-xs text-gray-500">Not configured yet</span>
        ) : (
          <button
            onClick={() => onStatusChange(isActive ? "paused" : "active")}
            className="text-xs text-gray-400 hover:text-white"
          >
            {isActive ? "⏸ Pause" : "▶ Resume"}
          </button>
        )}
        <Link
          href={
            agent.unindexed
              ? (`/agents/setup?tokenId=${agent.tokenId}` as never)
              : (`/agents/${agent.id}` as never)
          }
          className="text-xs bg-white text-black px-3 py-1 rounded-md font-medium hover:bg-gray-200"
        >
          {agent.unindexed ? "Set up →" : "Configure →"}
        </Link>
      </footer>
    </article>
  );
}

function ipfsToHttp(url: string | undefined | null): string {
  if (!url) return "/nft/agent.svg";
  if (url.startsWith("ipfs://")) return `https://gateway.pinata.cloud/ipfs/${url.slice(7)}`;
  return url;
}

function IdentityCard({ identity }: { identity: IdentityNft }) {
  const img = ipfsToHttp(identity.metadata?.image) || "/nft/identity.svg";
  return (
    <div className="border border-emerald-900 bg-gradient-to-r from-emerald-950 to-bg rounded-lg p-3 flex items-center gap-3">
      <img
        src={img}
        alt="Identity NFT"
        className="w-10 h-10 rounded-md shrink-0 border border-emerald-900"
        onError={(e) => { (e.target as HTMLImageElement).src = "/nft/identity.svg"; }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {identity.metadata?.name ?? `BaseForge Identity #${identity.tokenId}`}
          <span className="text-[10px] uppercase tracking-wider bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded">
            verified
          </span>
        </div>
        <div className="text-[11px] text-gray-500 truncate">
          {identity.metadata?.description ?? "Soulbound · enables agent minting"}
        </div>
      </div>
      {identity.tokenURI && (
        <a
          href={identity.tokenURI.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${identity.tokenURI.slice(7)}` : identity.tokenURI}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-gray-500 hover:text-white"
        >
          metadata ↗
        </a>
      )}
    </div>
  );
}
