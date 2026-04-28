"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect } from "wagmi";
import { WALLET_META } from "@/lib/wagmi";

interface Props {
  onClose: () => void;
}

function getWalletMeta(connector: { id: string; name: string }) {
  const byId = WALLET_META[connector.id];
  if (byId) return byId;
  const lower = connector.name.toLowerCase();
  if (lower.includes("coinbase")) return WALLET_META.coinbaseWalletSDK;
  if (lower.includes("metamask")) return WALLET_META.metaMask;
  if (lower.includes("okx"))      return WALLET_META.okxWallet;
  if (lower.includes("trust"))    return WALLET_META.trustWallet;
  if (lower.includes("walletconnect")) return WALLET_META.walletConnect;
  return { name: connector.name || "Browser Wallet", icon: "/wallets/injected.svg" };
}

/** Detect if a specific wallet's provider is actually installed. */
function isInstalled(connectorId: string): boolean {
  if (typeof window === "undefined") return true;
  // SDK-based connectors (Coinbase, WalletConnect) always available
  if (connectorId === "coinbaseWalletSDK" || connectorId === "coinbaseWallet") return true;
  if (connectorId === "walletConnect") return true;

  type EthProvider = { isMetaMask?: boolean; isCoinbaseWallet?: boolean; isTrust?: boolean; isOkxWallet?: boolean };
  const w = window as unknown as {
    ethereum?: EthProvider & { providers?: EthProvider[] };
    okxwallet?: unknown;
    okexchain?: unknown;
    trustwallet?: unknown;
    trustWallet?: unknown;
    trust?: unknown;
  };

  // Helper: when multiple wallets share window.ethereum, they often expose
  // .providers[] array — search both the root and the array for the flag.
  const hasFlag = (flag: keyof EthProvider): boolean => {
    if (w.ethereum?.[flag]) return true;
    if (Array.isArray(w.ethereum?.providers)) {
      return w.ethereum.providers.some((p) => !!p?.[flag]);
    }
    return false;
  };

  switch (connectorId) {
    case "metaMask":
    case "metaMaskSDK":
      return hasFlag("isMetaMask");
    case "okxWallet":
    case "okx":
      return !!w.okxwallet || !!w.okexchain || hasFlag("isOkxWallet");
    case "trustWallet":
    case "trust":
      return !!w.trustwallet || !!w.trustWallet || !!w.trust || hasFlag("isTrust");
    case "injected":
      return !!w.ethereum;
    default:
      return true;
  }
}

function installLink(connectorId: string): string | null {
  switch (connectorId) {
    case "metaMask":
    case "metaMaskSDK":
      return "https://metamask.io/download/";
    case "okxWallet":
    case "okx":
      return "https://www.okx.com/web3";
    case "trustWallet":
    case "trust":
      return "https://trustwallet.com/download";
    default:
      return null;
  }
}

export function WalletModal({ onClose }: Props) {
  const { connectors, connect, isPending, variables, error: connectError, reset } = useConnect();
  const { isConnected } = useAccount();
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Auto-close on successful connection
  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

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

  const friendlyError = (() => {
    if (!connectError) return null;
    const msg = connectError.message || "";
    if (/reject|denied|user (cancelled|canceled)/i.test(msg)) return "Connection rejected in wallet.";
    if (/provider not found|no provider|not installed|provider undefined|connectorNotConnected/i.test(msg)) {
      return "This wallet's extension isn't installed (or is locked). Click the Install link, or unlock the extension and try again.";
    }
    if (/chain.*mismatch|switch chain|wrong network/i.test(msg)) return "Switch to Base mainnet in your wallet, then try again.";
    return msg.slice(0, 200);
  })();

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

        {friendlyError && (
          <div className="mb-3 text-xs text-red-300 border border-red-900 bg-red-950 rounded-md p-2 flex items-start gap-2">
            <span className="shrink-0">⚠️</span>
            <span className="flex-1 break-words">{friendlyError}</span>
            <button onClick={() => { reset(); setPendingId(null); }} className="text-red-400 hover:text-red-200 shrink-0">×</button>
          </div>
        )}

        <div className="space-y-2">
          {displayed.map((connector) => {
            const meta = getWalletMeta(connector);
            const installed = isInstalled(connector.id);
            const link = installLink(connector.id);
            const loading = (isPending && variables?.connector === connector) || pendingId === connector.id;

            return (
              <div key={connector.id}>
                <button
                  onClick={() => {
                    if (!installed && link) {
                      window.open(link, "_blank", "noopener");
                      return;
                    }
                    setPendingId(connector.id);
                    reset();
                    connect({ connector });
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
                    onError={(e) => { (e.target as HTMLImageElement).src = "/wallets/injected.svg"; }}
                  />
                  <span className="flex-1 text-sm font-medium">{meta.name}</span>
                  {loading ? (
                    <span className="text-xs text-emerald-400 animate-pulse">Connecting…</span>
                  ) : !installed && link ? (
                    <span className="text-[10px] uppercase tracking-wider text-amber-400">Install ↗</span>
                  ) : null}
                </button>
              </div>
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
