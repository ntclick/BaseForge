"use client";

import { useState } from "react";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { targetChain } from "@/lib/wagmi";
import { WalletModal } from "./WalletModal";

function shorten(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [showModal, setShowModal] = useState(false);

  if (isConnected) {
    const wrongChain = chainId !== targetChain.id;
    if (wrongChain) {
      return (
        <button
          onClick={() => switchChain({ chainId: targetChain.id })}
          disabled={isSwitching}
          className="text-xs bg-amber-500 text-black rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {isSwitching ? "Switching…" : "Switch to Base"}
        </button>
      );
    }
    return (
      <button
        onClick={() => disconnect()}
        className="text-xs bg-surface border border-border rounded-md px-3 py-1.5 hover:bg-border flex items-center gap-1.5"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        {shorten(address)} · Base
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-xs bg-white text-black rounded-md px-3 py-1.5 font-medium"
      >
        Connect wallet
      </button>
      {showModal && <WalletModal onClose={() => setShowModal(false)} />}
    </>
  );
}
