"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect } from "wagmi";
import { WALLET_META } from "@/lib/wagmi";

interface Props {
  onClose: () => void;
}

function getWalletMeta(connector: { id: string; name: string }) {
  // Try id first (covers coinbaseWalletSDK, metaMask, okxWallet, trustWallet, injected, walletConnect)
  const byId = WALLET_META[connector.id];
  if (byId) return byId;

  // Fallback: name-based detection (in case wagmi changes connector.id)
  const lower = connector.name.toLowerCase();
  if (lower.includes("coinbase")) return WALLET_META.coinbaseWalletSDK;
  if (lower.includes("metamask")) return WALLET_META.metaMask;
  if (lower.includes("okx"))      return WALLET_META.okxWallet;
  if (lower.includes("trust"))    return WALLET_META.trustWallet;
  if (lower.includes("walletconnect")) return WALLET_META.walletConnect;

  return { name: connector.name || "Browser Wallet", icon: "/wallets/injected.svg" };
}

export function WalletModal({ onClose }: Props) {
  const { connectors, connect, isPending, variables } = useConnect();
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Portal needs mount on client (avoid SSR issues)
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Dedup logic:
  //  1. The generic injected() connector duplicates whatever target wallet
  //     currently owns window.ethereum (often OKX, MetaMask, etc.). Drop it
  //     whenever ANY specific connector exists.
  //  2. Beyond that, dedup by resolved wallet name so the same wallet never
  //     appears twice (covers cases where two specific connectors collapse
  //     to the same brand).
  const hasSpecific = connectors.some((c) => c.id !== "injected" && c.id !== "walletConnect");
  const seenName = new Set<string>();
  const displayed = connectors.filter((c) => {
    if (c.id === "injected" && hasSpecific) return false;
    const meta = getWalletMeta(c);
    const nameKey = meta.name.toLowerCase();
    if (seenName.has(nameKey)) return false;
    seenName.add(nameKey);
    return true;
  });

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        ref={ref}
        className="bg-surface border border-border rounded-xl w-full max-w-sm p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base">Connect wallet</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-white text-xl leading-none w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-border"
          >
            ×
          </button>
        </div>

        <div className="space-y-2">
          {displayed.map((connector) => {
            const meta = getWalletMeta(connector);
            const loading = isPending && variables?.connector === connector;
            return (
              <button
                key={connector.id}
                onClick={() => {
                  connect({ connector });
                  onClose();
                }}
                disabled={isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-bg hover:bg-border transition-colors disabled:opacity-50 text-left"
              >
                <img
                  src={meta.icon}
                  alt={meta.name}
                  width={32}
                  height={32}
                  loading="eager"
                  decoding="async"
                  className="rounded-md shrink-0 w-8 h-8"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/wallets/injected.svg";
                  }}
                />
                <span className="flex-1 text-sm font-medium">{meta.name}</span>
                {loading && (
                  <span className="text-xs text-gray-500 animate-pulse">Connecting…</span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-gray-600 text-center mt-4">
          By connecting you agree to use on Base mainnet only.
        </p>
      </div>
    </div>,
    document.body,
  );
}
