import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";

describe("BaseForgeAgent", () => {
  async function deploy() {
    const identity = await hre.viem.deployContract("BaseForgeIdentity", ["ipfs://placeholder/"]);
    const agent = await hre.viem.deployContract("BaseForgeAgent", [identity.address, "ipfs://agent/"]);
    const [owner, alice, bob] = await hre.viem.getWalletClients();
    return { identity, agent, owner, alice, bob };
  }

  it("rejects mint if caller has no Identity", async () => {
    const { agent, alice } = await deploy();
    await expect(agent.write.mint(["bafy..."], { account: alice.account })).to.be.rejectedWith("IdentityRequired");
  });

  it("mints when caller holds Identity", async () => {
    const { identity, agent, alice } = await deploy();
    await identity.write.mint({ account: alice.account });
    await agent.write.mint(["bafy..."], { account: alice.account });
    expect(await agent.read.ownerOf([1n])).to.equal(getAddress(alice.account.address));
    expect(await agent.read.configHash([1n])).to.equal("bafy...");
  });

  it("allows transfer (not soulbound)", async () => {
    const { identity, agent, alice, bob } = await deploy();
    await identity.write.mint({ account: alice.account });
    await agent.write.mint(["bafy..."], { account: alice.account });
    await agent.write.transferFrom(
      [getAddress(alice.account.address), getAddress(bob.account.address), 1n],
      { account: alice.account },
    );
    expect(await agent.read.ownerOf([1n])).to.equal(getAddress(bob.account.address));
  });

  it("only owner can update config", async () => {
    const { identity, agent, alice, bob } = await deploy();
    await identity.write.mint({ account: alice.account });
    await agent.write.mint(["v1"], { account: alice.account });
    await expect(agent.write.updateConfig([1n, "v2"], { account: bob.account })).to.be.rejected;
    await agent.write.updateConfig([1n, "v2"], { account: alice.account });
    expect(await agent.read.configHash([1n])).to.equal("v2");
  });
});
