import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const sortSignatures = (signers: string[], signatures: string[]): string[] => {
  const combined = signers.map((address, i) => ({ address, signature: signatures[i] }));
  combined.sort((a, b) => a.address.localeCompare(b.address));
  return combined.map((x) => x.signature);
};

describe("SafeLite", () => {
  describe("Deployment", () => {
    it("Should return Owner event with address and isOwner for each owner", async () => {
      const safeLiteContract = await ethers.getContractFactory("SafeLite");
      const [owner1, owner2, owner3] = await ethers.getSigners();
      const safeLite = await safeLiteContract.deploy(1001, [owner1.address, owner2.address, owner3.address], 2);
      await expect(safeLite.deployTransaction)
        .to.emit(safeLite, "Owner")
        .withArgs(owner1.address, true)
        .to.emit(safeLite, "Owner")
        .withArgs(owner2.address, true)
        .to.emit(safeLite, "Owner")
        .withArgs(owner3.address, true);
    });
  });

  describe("execute transaction", () => {
    let safeLite: Contract;
    let owner1:SignerWithAddress;
    let owner2:SignerWithAddress; 
    let owner3:SignerWithAddress;
    
    beforeEach(async () => {
      const safeLiteContract = await ethers.getContractFactory("SafeLite");
      [owner1, owner2, owner3] = await ethers.getSigners();
      safeLite = await safeLiteContract.deploy(1001, [owner1.address, owner2.address, owner3.address], 2);
      await owner1.sendTransaction({
        to: safeLite.address,
        value: ethers.utils.parseEther("1.0"),
      });
    });

    it("Recovered signature should equal to each signer address", async () => {
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        await owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      const owner3Sig = await owner3.signMessage(ethers.utils.arrayify(hash));
      expect(await safeLite.recover(hash, owner1Sig)).to.equal(owner1.address);
      expect(await safeLite.recover(hash, owner2Sig)).to.equal(owner2.address);
      expect(await safeLite.recover(hash, owner3Sig)).to.equal(owner3.address);
    });

    it("Should send tokens to receiver", async () => {
      const prevBalance = await owner2.getBalance();
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      await safeLite.executeTransaction(
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        sortSignatures([owner1.address, owner2.address], [owner1Sig, owner2Sig]),
      );
      expect(await owner2.getBalance()).to.equal(ethers.utils.parseEther("1").add(prevBalance));
    });

    it("Adding the new signer should return Owner event", async () => {
      const owner4 = await ethers.Wallet.createRandom();
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("addSigner", [owner4.address, 3]),
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash)); // utils . arrayify ( hexStringOrBigNumberOrArrayish )   =>   Uint8Array
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      const tx = await safeLite.executeTransaction(
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("addSigner", [owner4.address, 3]), // interface.encodeFunctionData( fragment [ , values ] ) ⇒ string< DataHexString >
        sortSignatures([owner1.address, owner2.address], [owner1Sig, owner2Sig]),
      );
      await expect(tx).to.emit(safeLite, "Owner").withArgs(owner4.address, true);
    });

    it("Removing the existing signer should return Owner event", async () => {
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("removeSigner", [owner3.address, 1]),
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      const tx = await safeLite.executeTransaction(
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("removeSigner", [owner3.address, 1]),
        sortSignatures([owner1.address, owner2.address], [owner1Sig, owner2Sig]),
      );
      await expect(tx).to.emit(safeLite, "Owner").withArgs(owner3.address, false);
    });

    it("Upadting the required signatures should make the signaturesRequired changed", async () => {
      const newSignaturesRequired = 1;
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("updateSignaturesRequired", [newSignaturesRequired]),
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      const tx = await safeLite.executeTransaction(
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("updateSignaturesRequired", [newSignaturesRequired]),
        sortSignatures([owner1.address, owner2.address], [owner1Sig, owner2Sig]),
      );
      expect(await safeLite.signaturesRequired()).to.equal(newSignaturesRequired);
    });
  });
});
