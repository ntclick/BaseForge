/**
 * BaseScan API client for log scanning.
 * Alchemy free tier limits eth_getLogs to 10 blocks; BaseScan has no such limit.
 */

const BASESCAN_KEY = process.env.BASESCAN_API_KEY ?? "";
const BASESCAN_API = "https://api.etherscan.io/v2/api";
const BASE_CHAIN_ID = 8453;

export type EtherscanLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;        // hex
  transactionHash: string;
  logIndex: string;           // hex
};

export async function getLogsViaBaseScan(opts: {
  address: string;
  fromBlock: bigint | string;
  toBlock?: bigint | string;
  topic0?: string;
  topic1?: string;            // indexed address
}): Promise<EtherscanLog[]> {
  if (!BASESCAN_KEY) {
    console.warn("[basescan] BASESCAN_API_KEY not set — log scan unavailable");
    return [];
  }
  const params = new URLSearchParams({
    chainid: String(BASE_CHAIN_ID),
    module: "logs",
    action: "getLogs",
    address: opts.address,
    fromBlock: String(opts.fromBlock),
    toBlock: opts.toBlock ? String(opts.toBlock) : "latest",
    apikey: BASESCAN_KEY,
  });
  if (opts.topic0) {
    params.set("topic0", opts.topic0);
    if (opts.topic1) {
      params.set("topic1", opts.topic1);
      params.set("topic0_1_opr", "and");
    }
  }

  try {
    const res = await fetch(`${BASESCAN_API}?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[basescan] HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    // status="1" with result array, status="0" + message="No records found" is OK
    if (json.status !== "1") {
      if (typeof json.message === "string" && json.message.includes("No records")) {
        return [];
      }
      console.warn("[basescan] error:", json.message, json.result);
      return [];
    }
    return (json.result ?? []) as EtherscanLog[];
  } catch (err) {
    console.warn("[basescan] fetch failed:", err);
    return [];
  }
}

/** Pad an address to a 32-byte topic value (left-padded with zeros). */
export function addressToTopic(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}
