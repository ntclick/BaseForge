// Deploy BaseForgeIdentity then BaseForgeAgent (which references Identity).
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=... pnpm --filter contracts deploy:sepolia
//   DEPLOYER_PRIVATE_KEY=... pnpm --filter contracts deploy:mainnet
//
// After deploy, run `pnpm verify:<network> <ADDRESS> <CTOR_ARGS>` for BaseScan verification.

import hre from "hardhat";

const IDENTITY_BASE_URI = process.env.IDENTITY_BASE_URI ?? "ipfs://baseforge-identity/";
const AGENT_BASE_URI = process.env.AGENT_BASE_URI ?? "ipfs://baseforge-agent/";

async function main() {
  const network = hre.network.name;
  console.log(`\n→ Deploying to ${network}\n`);

  const identity = await hre.viem.deployContract("BaseForgeIdentity", [IDENTITY_BASE_URI]);
  console.log(`BaseForgeIdentity → ${identity.address}`);

  const agent = await hre.viem.deployContract("BaseForgeAgent", [identity.address, AGENT_BASE_URI]);
  console.log(`BaseForgeAgent    → ${agent.address}`);

  console.log(`\nVerify with:`);
  console.log(`  pnpm --filter contracts verify:${network} ${identity.address} "${IDENTITY_BASE_URI}"`);
  console.log(`  pnpm --filter contracts verify:${network} ${agent.address} ${identity.address} "${AGENT_BASE_URI}"`);

  console.log(`\nAdd to .env:`);
  console.log(`  NEXT_PUBLIC_IDENTITY_ADDRESS=${identity.address}`);
  console.log(`  NEXT_PUBLIC_AGENT_ADDRESS=${agent.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
