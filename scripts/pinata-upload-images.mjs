#!/usr/bin/env node
/**
 * Upload BaseForge NFT artwork (identity.svg + agent.svg) to IPFS via Pinata.
 *
 * Output: prints IPFS CIDs. Save them to .env as:
 *   IPFS_IDENTITY_IMAGE_CID=...
 *   IPFS_AGENT_IMAGE_CID=...
 *
 * Then the metadata API will use ipfs://<cid> for the `image` field.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}

const env = { ...loadEnv(resolve(__dirname, "../.env")), ...process.env };
const API_KEY = env.pinata_api_key || env.PINATA_API_KEY;
const SECRET = env.Pinata_Secret || env.PINATA_SECRET;
const JWT = env.pinata_jwt || env.PINATA_JWT;

if (!JWT && !(API_KEY && SECRET)) {
  console.error("Need either pinata_jwt OR (pinata_api_key + Pinata_Secret) in .env");
  process.exit(1);
}

function authHeaders() {
  if (API_KEY && SECRET) {
    return { pinata_api_key: API_KEY, pinata_secret_api_key: SECRET };
  }
  return { Authorization: `Bearer ${JWT}` };
}

async function pinFile(filePath, name) {
  const buf = readFileSync(filePath);
  const blob = new Blob([buf], { type: "image/svg+xml" });
  const fd = new FormData();
  fd.append("file", blob, name);
  fd.append("pinataMetadata", JSON.stringify({ name: `baseforge-${name}` }));
  fd.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${await res.text()}`);
  return await res.json();
}

const identityPath = resolve(__dirname, "../web/public/nft/identity.svg");
const agentPath = resolve(__dirname, "../web/public/nft/agent.svg");

console.log("⚡ Pinning identity.svg…");
const id = await pinFile(identityPath, "identity.svg");
console.log(`  CID: ${id.IpfsHash}  (${id.PinSize} bytes)`);

console.log("⚡ Pinning agent.svg…");
const ag = await pinFile(agentPath, "agent.svg");
console.log(`  CID: ${ag.IpfsHash}  (${ag.PinSize} bytes)`);

console.log(`
✅ Done. Add to .env:

IPFS_IDENTITY_IMAGE_CID=${id.IpfsHash}
IPFS_AGENT_IMAGE_CID=${ag.IpfsHash}

Public gateway URLs:
  ${id.IpfsHash}: https://gateway.pinata.cloud/ipfs/${id.IpfsHash}
  ${ag.IpfsHash}: https://gateway.pinata.cloud/ipfs/${ag.IpfsHash}
`);
