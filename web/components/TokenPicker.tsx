"use client";

import { useEffect, useState } from "react";

export type Token = {
  id: string;
  coingecko_id: string;
  symbol: string;
  name: string;
  image_url: string | null;
  market_cap_rank: number | null;
  current_price: number | null;
  binance_symbol: string | null;
  has_futures: boolean;
};

export function TokenPicker({
  value,
  onChange,
}: {
  value: Token | null;
  onChange: (t: Token | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/tokens?q=${encodeURIComponent(query)}&limit=30`);
        const data = await r.json();
        setTokens(data.tokens ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  if (value && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-bg border border-border rounded-md px-3 py-2 hover:border-gray-500 text-left"
      >
        {value.image_url && <img src={value.image_url} alt="" className="w-6 h-6 rounded-full" />}
        <div className="flex-1">
          <div className="font-medium">
            {value.symbol} <span className="text-gray-500 text-xs">· {value.name}</span>
          </div>
          {value.current_price && (
            <div className="text-xs text-gray-500">
              ${value.current_price.toFixed(value.current_price < 1 ? 6 : 2)} · rank #{value.market_cap_rank}
              {value.has_futures && <span className="ml-2 text-emerald-400">⚡ futures</span>}
            </div>
          )}
        </div>
        <span className="text-xs text-gray-500">change</span>
      </button>
    );
  }

  return (
    <div className="border border-border bg-bg rounded-md">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search 200+ tokens (e.g. BTC, AERO, ethereum)…"
        className="w-full bg-transparent border-b border-border px-3 py-2 text-sm focus:outline-none"
      />
      <div className="max-h-72 overflow-y-auto">
        {loading && <div className="text-xs text-gray-500 px-3 py-2">Searching…</div>}
        {!loading && tokens.length === 0 && (
          <div className="text-xs text-gray-500 px-3 py-2">No tokens found.</div>
        )}
        {tokens.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onChange(t);
              setOpen(false);
              setQuery("");
            }}
            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface text-left"
          >
            {t.image_url && <img src={t.image_url} alt="" className="w-5 h-5 rounded-full" />}
            <span className="text-sm font-medium w-16">{t.symbol}</span>
            <span className="text-xs text-gray-400 flex-1 truncate">{t.name}</span>
            <span className="text-[10px] text-gray-500">#{t.market_cap_rank}</span>
            {t.has_futures && <span className="text-[10px] text-emerald-400">⚡</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
