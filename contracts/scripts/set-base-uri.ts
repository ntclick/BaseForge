// Update baseURI on the deployed Identity + Agent contracts so wallets,
// OpenSea, etc. can fetch metadata from our HTTPS endpoint.
//
// Prereq: DEPLOYER_PRIVATE_KEY in ../.env, deployer is contract owner.
//
// Usage:
//   META_BASE_URL=https://baseforge.app npx hardhat run scripts/set-base-uri.ts --network baseMainnet

import hre from "hardhat";

const META_BASE = process.env.META_BASE_URL ?? "https://baseforge.app";

const IDENTITY = process.env.IDENTITY_ADDRESS ?? "0x8c134df21b0ce82e6e0a2fef6715e3525ccc4759";
const AGENT = process.env.AGENT_ADDRESS ?? "0xa7e0c1e5a08a0174ab92caaf95e9d6a46edaed3b";

async function main() {
  console.log(`Setting baseURI to ${META_BASE} on ${hre.network.name}\n`);

  const identity = await hre.viem.getContractAt("BaseForgeIdentity", IDENTITY as `0x${string}`);
  const agent = await hre.viem.getContractAt("BaseForgeAgent", AGENT as `0x${string}`);

  const idURI = `${META_BASE}/api/nft/identity/`;
  const agURI = `${META_BASE}/api/nft/agent/`;

  console.log(`Identity → ${idURI}`);
  const tx1 = await identity.write.setBaseURI([idURI]);
  console.log(`  tx: ${tx1}`);

  console.log(`Agent    → ${agURI}`);
  const tx2 = await agent.write.setBaseURI([agURI]);
  console.log(`  tx: ${tx2}`);

  console.log(`\n✓ Done. Wallets/marketplaces will now resolve tokenURI to your metadata API.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
