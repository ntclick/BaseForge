import { createPublicClient, http, toEventSelector, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { AGENT_ADDRESS, AGENT_ABI, IDENTITY_ADDRESS, IDENTITY_ABI } from "./contracts";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Default RPC for general reads (Alchemy is fine for this)
export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || undefined),
});

// Public Base RPC has a 10k block range for getLogs.
// Alchemy free tier limits to 10 blocks, so we use this for log scans (chunked).
const LOG_SCAN_RPC = "https://mainnet.base.org";
const LOG_CHUNK_SIZE = 9_500n;     // safe under 10k

const logsClient = createPublicClient({
  chain: base,
  transport: http(LOG_SCAN_RPC),
});

/** Scan getLogs in chunks of LOG_CHUNK_SIZE blocks to bypass RPC range limits. */
async function chunkedGetLogs<T>(opts: {
  address: `0x${string}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: any;
  fromBlock: bigint;
}): Promise<T[]> {
  const latest = await logsClient.getBlockNumber();
  const all: T[] = [];
  for (let from = opts.fromBlock; from <= latest; from += LOG_CHUNK_SIZE + 1n) {
    const to = from + LOG_CHUNK_SIZE > latest ? latest : from + LOG_CHUNK_SIZE;
    try {
      const logs = await logsClient.getLogs({
        address: opts.address,
        event: opts.event,
        args: opts.args,
        fromBlock: from,
        toBlock: to,
      });
      all.push(...(logs as unknown as T[]));
    } catch (err) {
      console.warn(`[onchain] chunk ${from}-${to} failed:`, err);
    }
  }
  return all;
}

const AGENT_MINTED_EVENT = parseAbiItem(
  "event AgentMinted(address indexed wallet, uint256 indexed tokenId, string configHash)",
);
const IDENTITY_MINTED_EVENT = parseAbiItem(
  "event IdentityMinted(address indexed wallet, uint256 indexed tokenId)",
);

const AGENT_MINTED_TOPIC = toEventSelector(AGENT_MINTED_EVENT);
const IDENTITY_MINTED_TOPIC = toEventSelector(IDENTITY_MINTED_EVENT);

/** Block at which BaseForgeAgent was deployed — set NEXT_PUBLIC_AGENT_DEPLOY_BLOCK to bound the log scan. */
const FROM_BLOCK = BigInt(process.env.NEXT_PUBLIC_AGENT_DEPLOY_BLOCK || process.env.AGENT_DEPLOY_BLOCK || "0");

const ERC721_TOKEN_URI_ABI = [
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
] as const;

export type NftMetadata = {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
};

export type AgentNft = {
  tokenId: string;
  configHash: string | null;
  tokenURI: string | null;
  metadata: NftMetadata | null;
};

export type IdentityNft = {
  tokenId: string;
  tokenURI: string | null;
  metadata: NftMetadata | null;
};

const META_API_BASE = process.env.NEXT_PUBLIC_META_API_BASE
  || process.env.NEXT_PUBLIC_APP_URL
  || "http://localhost:3013";

/** Resolve URIs:
 *  - Real https: pass through
 *  - Real ipfs:// with valid CID: ipfs gateway
 *  - Placeholder ipfs://baseforge-{type}/N: rewrite to our metadata API
 */
function resolveURI(uri: string): string {
  if (uri.startsWith("ipfs://baseforge-identity/")) {
    const id = uri.slice("ipfs://baseforge-identity/".length);
    return `${META_API_BASE}/api/nft/identity/${id}`;
  }
  if (uri.startsWith("ipfs://baseforge-agent/")) {
    const id = uri.slice("ipfs://baseforge-agent/".length);
    return `${META_API_BASE}/api/nft/agent/${id}`;
  }
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

async function fetchMetadata(uri: string | null): Promise<NftMetadata | null> {
  if (!uri) return null;
  const resolved = resolveURI(uri);
  try {
    const res = await fetch(resolved, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[onchain] metadata ${res.status} for`, resolved);
      return null;
    }
    return (await res.json()) as NftMetadata;
  } catch (err) {
    console.warn("[onchain] metadata fetch failed for", resolved, err);
    return null;
  }
}

/** Return tokenIds the wallet currently owns (mints + still owner). Uses BaseScan API
 *  to bypass Alchemy's free-tier 10-block getLogs limit. */
export async function getAgentTokensOf(wallet: Address): Promise<bigint[]> {
  if (AGENT_ADDRESS === ZERO) return [];
  const target = wallet.toLowerCase() as Address;

  console.log("[onchain] scanning AgentMinted logs for", target, "from block", FROM_BLOCK.toString());
  const logs = await chunkedGetLogs<{ args: { tokenId?: bigint } }>({
    address: AGENT_ADDRESS,
    event: AGENT_MINTED_EVENT,
    args: { wallet: target },
    fromBlock: FROM_BLOCK,
  });

  const mintedIds = Array.from(
    new Set(logs.map((l) => l.args.tokenId).filter((x): x is bigint => x !== undefined)),
  );
  console.log(`[onchain] found ${mintedIds.length} mint event(s) for wallet`);
  if (mintedIds.length === 0) return [];

  const owners = await Promise.all(
    mintedIds.map((id) =>
      publicClient
        .readContract({ address: AGENT_ADDRESS, abi: AGENT_ABI, functionName: "ownerOf", args: [id] })
        .catch(() => null as Address | null),
    ),
  );
  const owned = mintedIds.filter((_, i) => owners[i] && (owners[i] as string).toLowerCase() === target);
  console.log(`[onchain] ${owned.length}/${mintedIds.length} still owned by wallet`);
  return owned;
}

// Module-level cache for full mint scans (60s TTL) — log scans are expensive
// over many block chunks, but mints are rare so 1-min stale data is fine.
type ScanCache<T> = { ts: number; data: T };
const SCAN_TTL_MS = 60_000;
let _identityScan: ScanCache<unknown[]> | null = null;
let _agentScan: ScanCache<{ args: { tokenId?: bigint; wallet?: string } }[]> | null = null;

async function _getAllIdentityMints() {
  const now = Date.now();
  if (_identityScan && now - _identityScan.ts < SCAN_TTL_MS) return _identityScan.data;
  if (IDENTITY_ADDRESS === ZERO) return [];
  const data = await chunkedGetLogs({ address: IDENTITY_ADDRESS, event: IDENTITY_MINTED_EVENT, fromBlock: FROM_BLOCK });
  _identityScan = { ts: now, data };
  return data;
}

async function _getAllAgentMints() {
  const now = Date.now();
  if (_agentScan && now - _agentScan.ts < SCAN_TTL_MS) return _agentScan.data;
  if (AGENT_ADDRESS === ZERO) return [];
  const data = await chunkedGetLogs<{ args: { tokenId?: bigint; wallet?: string } }>({
    address: AGENT_ADDRESS,
    event: AGENT_MINTED_EVENT,
    fromBlock: FROM_BLOCK,
  });
  _agentScan = { ts: now, data };
  return data;
}

/** Counts total mints (across all wallets) — used by showcase landing page. */
export async function getTotalMintCounts(): Promise<{ identities: number; agents: number }> {
  const [identityLogs, agentLogs] = await Promise.all([_getAllIdentityMints(), _getAllAgentMints()]);
  console.log(`[onchain] mint counts → identities=${identityLogs.length} agents=${agentLogs.length}`);
  return { identities: identityLogs.length, agents: agentLogs.length };
}

/** Return the most recent N AgentMinted events with wallet+tokenId. */
export async function getRecentAgentMints(limit = 12): Promise<Array<{ tokenId: bigint; wallet: string }>> {
  const logs = await _getAllAgentMints();
  return logs
    .slice(-limit)
    .reverse()
    .map((l) => ({
      tokenId: l.args.tokenId as bigint,
      wallet: l.args.wallet as string,
    }))
    .filter((x) => x.tokenId !== undefined && x.wallet);
}

/** Read on-chain configHash pointer for a token. Returns null on revert. */
export async function getAgentConfigHash(tokenId: bigint): Promise<string | null> {
  if (AGENT_ADDRESS === ZERO) return null;
  try {
    return (await publicClient.readContract({
      address: AGENT_ADDRESS,
      abi: AGENT_ABI,
      functionName: "configHash",
      args: [tokenId],
    })) as string;
  } catch {
    return null;
  }
}

/** Get tokenURI for an Agent NFT and fetch its metadata. */
export async function getAgentNft(tokenId: bigint): Promise<AgentNft> {
  if (AGENT_ADDRESS === ZERO) {
    return { tokenId: tokenId.toString(), configHash: null, tokenURI: null, metadata: null };
  }
  const [configHash, tokenURI] = await Promise.all([
    getAgentConfigHash(tokenId),
    publicClient
      .readContract({ address: AGENT_ADDRESS, abi: ERC721_TOKEN_URI_ABI, functionName: "tokenURI", args: [tokenId] })
      .catch((err) => {
        console.warn("[onchain] agent tokenURI failed for", tokenId.toString(), err);
        return null as string | null;
      }),
  ]);
  console.log(`[onchain] agent #${tokenId} → tokenURI=${tokenURI}`);
  const metadata = await fetchMetadata(tokenURI);
  return { tokenId: tokenId.toString(), configHash, tokenURI, metadata };
}

/** Identity NFT — return tokenId of the wallet's Identity (0 if none). */
export async function getIdentityTokenId(wallet: Address): Promise<bigint> {
  if (IDENTITY_ADDRESS === ZERO) return 0n;
  try {
    return (await publicClient.readContract({
      address: IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "tokenOf",
      args: [wallet],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/** Identity NFT + metadata. */
export async function getIdentityNft(wallet: Address): Promise<IdentityNft | null> {
  const tokenId = await getIdentityTokenId(wallet);
  if (tokenId === 0n) return null;

  const tokenURI = await publicClient
    .readContract({ address: IDENTITY_ADDRESS, abi: ERC721_TOKEN_URI_ABI, functionName: "tokenURI", args: [tokenId] })
    .catch((err) => {
      console.warn("[onchain] identity tokenURI failed:", err);
      return null as string | null;
    });
  console.log(`[onchain] identity #${tokenId} for ${wallet} → tokenURI=${tokenURI}`);
  const metadata = await fetchMetadata(tokenURI);
  return { tokenId: tokenId.toString(), tokenURI, metadata };
}
