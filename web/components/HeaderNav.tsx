"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents/new", label: "New agent" },
  { href: "/settings", label: "Settings" },
] as const;

export function HeaderNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className="border-b border-border sticky top-0 z-40 bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="font-semibold text-xl sm:text-2xl tracking-tight shrink-0 flex items-center gap-3">
          <img src="/logo.png" alt="" width={80} height={80} className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
          BaseForge
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-5 lg:gap-6 text-sm text-gray-300 items-center">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hover:text-white transition-colors ${pathname === l.href ? "text-white" : ""}`}
            >
              {l.label}
            </Link>
          ))}
          <WalletButton />
        </nav>

        {/* Mobile: wallet pill + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <WalletButton />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="w-9 h-9 inline-flex items-center justify-center border border-border rounded-md hover:bg-surface"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-border bg-bg">
          <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-2.5 rounded-md hover:bg-surface ${pathname === l.href ? "bg-surface text-white" : "text-gray-300"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
