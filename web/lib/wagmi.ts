import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "";

/** Build injected() with explicit provider lookup against multiple known
 *  global namespaces a wallet may inject under. wagmi's built-in target
 *  string sometimes misses (e.g. OKX uses `window.okxwallet` lowercase
 *  while the camelCase `okxWallet` flag may not be set). */
type EthereumLike = { isMetaMask?: boolean; isCoinbaseWallet?: boolean; isTrust?: boolean; isOkxWallet?: boolean };
type WindowWithWallets = {
  ethereum?: EthereumLike & { providers?: EthereumLike[] };
  okxwallet?: EthereumLike;
  okxWallet?: EthereumLike;
  trustwallet?: EthereumLike;
  trustWallet?: EthereumLike;
  trust?: EthereumLike;
};

function pickProvider(predicate: (p: EthereumLike) => boolean, ...globals: (keyof WindowWithWallets)[]): EthereumLike | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as WindowWithWallets;
  // Direct globals first (e.g. window.okxwallet)
  for (const g of globals) {
    const v = w[g] as EthereumLike | undefined;
    if (v && predicate(v)) return v;
    if (v && !predicate(v) && v) return v;          // exists but missing flag — still return
  }
  // EIP-1193 multi-provider: window.ethereum.providers[]
  if (Array.isArray(w.ethereum?.providers)) {
    const found = w.ethereum.providers.find(predicate);
    if (found) return found;
  }
  // Single window.ethereum
  if (w.ethereum && predicate(w.ethereum)) return w.ethereum;
  return undefined;
}

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Coinbase: Smart Wallet (passkey, no extension needed) + EOA extension fallback.
    coinbaseWallet({
      appName: "BaseForge",
      appLogoUrl: "/logo.png",
      preference: "all",
    }),
    // Custom targets — explicit window namespace + provider flag detection.
    injected({
      target: () => ({
        id: "metaMask",
        name: "MetaMask",
        provider: pickProvider((p) => !!p.isMetaMask) as never,
      }),
    }),
    injected({
      target: () => ({
        id: "okxWallet",
        name: "OKX Wallet",
        provider: pickProvider((p) => !!p.isOkxWallet, "okxwallet", "okxWallet") as never,
      }),
    }),
    injected({
      target: () => ({
        id: "trustWallet",
        name: "Trust Wallet",
        provider: pickProvider((p) => !!p.isTrust, "trustwallet", "trustWallet", "trust") as never,
      }),
    }),
    injected(),                       // fallback: any other injected provider
    ...(WC_PROJECT_ID && WC_PROJECT_ID !== "replace-me"
      ? [walletConnect({ projectId: WC_PROJECT_ID, showQrModal: true })]
      : []),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});

export const targetChain = base;

/** Display metadata for the connect modal, keyed by connector.id (with aliases). */
export const WALLET_META: Record<string, { name: string; icon: string }> = {
  // Coinbase Wallet (multiple id variants across wagmi versions)
  coinbaseWalletSDK: { name: "Coinbase Wallet", icon: "/wallets/coinbase.png" },
  coinbaseWallet:    { name: "Coinbase Wallet", icon: "/wallets/coinbase.png" },
  // MetaMask (SVG from Wikimedia)
  metaMask:          { name: "MetaMask",         icon: "/wallets/metamask.svg" },
  metaMaskSDK:       { name: "MetaMask",         icon: "/wallets/metamask.svg" },
  // OKX
  okxWallet:         { name: "OKX Wallet",       icon: "/wallets/okx.png" },
  okx:               { name: "OKX Wallet",       icon: "/wallets/okx.png" },
  // Trust
  trustWallet:       { name: "Trust Wallet",     icon: "/wallets/trust.png" },
  trust:             { name: "Trust Wallet",     icon: "/wallets/trust.png" },
  // Generic
  injected:          { name: "Browser Wallet",   icon: "/wallets/injected.svg" },
  walletConnect:     { name: "WalletConnect",    icon: "/wallets/walletconnect.svg" },
};
