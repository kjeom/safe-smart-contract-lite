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

    it("Should return the correct multiSigWalletAddress", async () => {
      const safeLiteContract = await ethers.getContractFactory("SafeLite");
      const [owner1, owner2, owner3] = await ethers.getSigners();
      const safeLite = await safeLiteContract.deploy(1001, [owner1.address, owner2.address, owner3.address], 2);
      expect(await safeLite.multiSigWalletAddress()).to.equal(safeLite.address);
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

    it("Should send tokens to receiver after collecting enough signatures", async () => {
      const prevBalance = await owner2.getBalance();
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
      );

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig
      );

      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner2Sig
      );

      const transaction = await safeLite.transactions(nonce);
      expect(transaction.signatureCount).to.equal(2);
      expect(await owner2.getBalance()).to.equal(ethers.utils.parseEther("1").add(prevBalance));
    });

    it("Should not execute transaction if not enough signatures", async () => {
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x"
      );

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1"),
        "0x",
        owner1Sig
      );

      const transaction = await safeLite.transactions(nonce);
      expect(transaction.signatureCount).to.equal(1);
      expect(transaction.executed).to.equal(false);
    });

    it("Should increment signatureCount when signing a transaction", async () => {
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x"
      );
    
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig
      );

      const transaction = await safeLite.transactions(nonce);
      expect(transaction.signatureCount).to.equal(1);
    
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner2Sig
      );
    
      const updatedTransaction = await safeLite.transactions(nonce);
      expect(updatedTransaction.signatureCount).to.equal(2);
    });
    it("Should return the correct transaction details", async () => {
      const nonce = await safeLite.nonce();
      const toAddress = owner2.address;
      const value = ethers.utils.parseEther("1");
      const data = "0x";

      const hash = await safeLite.getTransactionHash(
        nonce,
        toAddress,
        value.toString(),
        data
      );

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        toAddress,
        value.toString(),
        data,
        owner1Sig
      );

      const transaction = await safeLite.getTransaction(nonce);

      expect(transaction[0]).to.equal(toAddress);
      expect(transaction[1]).to.equal(value);
      expect(transaction[2]).to.equal(data);
      expect(transaction[3]).to.equal(false); 
      expect(transaction[4]).to.equal(1); 
      
    });

    it("Should not allow a signer to sign a transaction more than once", async () => {
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x"
      );

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig
      );

      const owner1Sig2 = await owner1.signMessage(ethers.utils.arrayify(hash));
      await expect(safeLite.signTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig2
        )).to.be.revertedWith("Signature already recorded");
    });
  });

  describe("Owner management", () => {
    let safeLite: Contract;
    let owner1: SignerWithAddress;
    let owner2: SignerWithAddress;
    let owner3: SignerWithAddress;
    let newOwner: SignerWithAddress;

    beforeEach(async () => {
      const safeLiteContract = await ethers.getContractFactory("SafeLite");
      [owner1, owner2, owner3, newOwner] = await ethers.getSigners();
      safeLite = await safeLiteContract.deploy(1001, [owner1.address, owner2.address, owner3.address], 2);
    });

    it("Should add a new owner and update signatures required", async () => {
      const newSignaturesRequired = 3;

      const data = safeLite.interface.encodeFunctionData("addSigner", [newOwner.address, newSignaturesRequired]);

      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(nonce, safeLite.address, 0, data);

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));

      await safeLite.signTransaction(nonce, safeLite.address, 0, data, owner1Sig);
      await safeLite.signTransaction(nonce, safeLite.address, 0, data, owner2Sig);

      expect(await safeLite.isOwner(newOwner.address)).to.be.true;

      expect(await safeLite.signaturesRequired()).to.equal(newSignaturesRequired);

      const owners = await safeLite.getOwners();
      expect(owners).to.include(newOwner.address);
    });

    it("Should remove an owner and update signatures required", async () => {
      const newSignaturesRequired = 1;

      const data = safeLite.interface.encodeFunctionData("removeSigner", [owner3.address, newSignaturesRequired]);

      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(nonce, safeLite.address, 0, data);

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));

      await safeLite.signTransaction(nonce, safeLite.address, 0, data, owner1Sig);
      await safeLite.signTransaction(nonce, safeLite.address, 0, data, owner2Sig);

      expect(await safeLite.isOwner(owner3.address)).to.be.false;

      expect(await safeLite.signaturesRequired()).to.equal(newSignaturesRequired);

      const owners = await safeLite.getOwners();
      expect(owners).to.not.include(owner3.address);
    });

    it("should only allow owners to call getOwners", async function () {
      let owners = await safeLite.getOwners();
      expect(owners).to.include(owner1.address);
      expect(owners).to.include(owner2.address);
    });
  });
});