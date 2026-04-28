import type { Metadata, Viewport } from "next";
import { Web3Provider } from "@/components/Web3Provider";
import { HeaderNav } from "@/components/HeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BaseForge — Real-time Base ecosystem alerts",
  description: "Token monitoring + AI-generated trade alerts for Base.",
  applicationName: "BaseForge",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
    ],
    apple: { url: "/logo.png", sizes: "180x180" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BaseForge",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    title: "BaseForge — Real-time Base ecosystem alerts",
    description: "Mint your trading agent. Own it on Base.",
    type: "website",
    images: [{ url: "/logo-512.png", width: 512, height: 512, alt: "BaseForge" }],
  },
  twitter: {
    card: "summary",
    images: ["/logo-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Base App verifier looks for this tag — keep at the very top of <head>
            so simple crawlers find it without parsing the whole document. */}
        <meta name="base:app_id" content="69f0c295bf0a75fdec18c287" />
        {/* Preload wallet icons so the connect modal opens with no flash */}
        <link rel="preload" as="image" href="/wallets/coinbase.png" />
        <link rel="preload" as="image" href="/wallets/metamask.svg" />
        <link rel="preload" as="image" href="/wallets/okx.png" />
        <link rel="preload" as="image" href="/wallets/trust.png" />
      </head>
      <body suppressHydrationWarning>
        <Web3Provider>
          <HeaderNav />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        </Web3Provider>
      </body>
    </html>
  );
}
