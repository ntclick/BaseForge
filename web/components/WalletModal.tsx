"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useConnect } from "wagmi";
import { WALLET_META } from "@/lib/wagmi";

interface Props {
  onClose: () => void;
}

function getWalletMeta(connectorId: string, connectorName: string) {
  const meta = WALLET_META[connectorId];
  if (meta) return meta;
  // Fallback: use connector name + injected icon
  return { name: connectorName, icon: "/wallets/injected.svg" };
}

export function WalletModal({ onClose }: Props) {
  const { connectors, connect, isPending, variables } = useConnect();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  // Deduplicate: prefer specific connectors over generic "injected"
  const seen = new Set<string>();
  const displayed = connectors.filter((c) => {
    // Skip duplicate injected if a named wallet already claimed it
    const key = c.id === "injected" ? "injected" : c.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={ref}
        className="bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base">Connect wallet</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-2">
          {displayed.map((connector) => {
            const meta = getWalletMeta(connector.id, connector.name);
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
                <Image
                  src={meta.icon}
                  alt={meta.name}
                  width={32}
                  height={32}
                  className="rounded-md shrink-0"
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
    </div>
  );
}
