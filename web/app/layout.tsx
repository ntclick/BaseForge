import type { Metadata, Viewport } from "next";
import { Web3Provider } from "@/components/Web3Provider";
import { HeaderNav } from "@/components/HeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BaseForge — Real-time Base ecosystem alerts",
  description: "Token monitoring + AI-generated trade alerts for Base.",
  applicationName: "BaseForge",
  manifest: "/manifest.webmanifest",
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
      <body suppressHydrationWarning>
        <Web3Provider>
          <HeaderNav />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        </Web3Provider>
      </body>
    </html>
  );
}
