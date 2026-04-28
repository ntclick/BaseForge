import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";

describe("BaseForgeIdentity", () => {
  async function deploy() {
    const identity = await hre.viem.deployContract("BaseForgeIdentity", ["ipfs://placeholder/"]);
    const [owner, alice, bob] = await hre.viem.getWalletClients();
    return { identity, owner, alice, bob };
  }

  it("mints exactly one NFT per wallet", async () => {
    const { identity, alice } = await deploy();
    await identity.write.mint({ account: alice.account });
    const tokenId = await identity.read.tokenOf([getAddress(alice.account.address)]);
    expect(tokenId).to.equal(1n);
  });

  it("reverts on second mint from same wallet", async () => {
    const { identity, alice } = await deploy();
    await identity.write.mint({ account: alice.account });
    await expect(identity.write.mint({ account: alice.account })).to.be.rejectedWith("AlreadyMinted");
  });

  it("issues sequential ids across wallets", async () => {
    const { identity, alice, bob } = await deploy();
    await identity.write.mint({ account: alice.account });
    await identity.write.mint({ account: bob.account });
    expect(await identity.read.tokenOf([getAddress(bob.account.address)])).to.equal(2n);
  });

  it("blocks transfers (soulbound)", async () => {
    const { identity, alice, bob } = await deploy();
    await identity.write.mint({ account: alice.account });
    await expect(
      identity.write.transferFrom(
        [getAddress(alice.account.address), getAddress(bob.account.address), 1n],
        { account: alice.account },
      ),
    ).to.be.rejectedWith("Soulbound");
  });
});
