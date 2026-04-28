import type { Address } from "viem";

export const IDENTITY_ADDRESS = (process.env.NEXT_PUBLIC_IDENTITY_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const AGENT_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;

export const IDENTITY_ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOf", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "IdentityMinted",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

export const AGENT_ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "configHash_", type: "string" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "updateConfig", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "configHash_", type: "string" }], outputs: [] },
  { type: "function", name: "configHash", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  {
    type: "event",
    name: "AgentMinted",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "configHash", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentConfigUpdated",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "configHash", type: "string", indexed: false },
    ],
  },
] as const;
