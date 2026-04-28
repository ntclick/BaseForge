import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "";

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({ appName: "BaseForge", chainId: base.id }),
    // Specific wallet targets — wagmi detects these via window.<name>
    injected({ target: "metaMask" }),
    injected({ target: "okxWallet" }),
    injected({ target: "trustWallet" }),
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

/** Display metadata for the connect modal, keyed by connector.id */
export const WALLET_META: Record<string, { name: string; icon: string }> = {
  coinbaseWalletSDK: { name: "Coinbase Wallet", icon: "/wallets/coinbase.svg" },
  metaMask:          { name: "MetaMask",         icon: "/wallets/metamask.svg" },
  okxWallet:         { name: "OKX Wallet",        icon: "/wallets/okx.svg" },
  trustWallet:       { name: "Trust Wallet",      icon: "/wallets/trust.svg" },
  injected:          { name: "Browser Wallet",    icon: "/wallets/injected.svg" },
  walletConnect:     { name: "WalletConnect",     icon: "/wallets/walletconnect.svg" },
};
