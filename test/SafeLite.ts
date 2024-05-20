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

    // 업데이트 1 테스트 케이스. multiSigWallet 지갑 주소 확인
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

    // 업데이트 2 테스트 케이스. 서명을 개별로 하고, 서명이 requiredSignatures보다 충족하면 트랜잭션 실행
    it("Should send tokens to receiver after collecting enough signatures", async () => {
      const prevBalance = await owner2.getBalance();
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
      );

      // Owner 1 트랜잭션 사인
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig
      );

      // Owner 2 트랜잭션 사인
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
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

    // 서명이 충족되지 않으면 트랜잭션이 실행되지 않아야 함
    it("Should not execute transaction if not enough signatures", async () => {
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x"
      );

      // Owner 1 트랜잭션 사인
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1"),
        "0x",
        owner1Sig
      );

      // 트랜잭션 실행됐는지 확인
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
    
      // Owner 1 signs the transaction
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig
      );
    
      // Check that signatureCount is incremented
      const transaction = await safeLite.transactions(nonce);
      expect(transaction.signatureCount).to.equal(1);
    
      // Owner 2 signs the transaction
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner2Sig
      );
    
      // Check that signatureCount is incremented again
      const updatedTransaction = await safeLite.transactions(nonce);
      expect(updatedTransaction.signatureCount).to.equal(2);
    });
    it("Should return the correct transaction details", async () => {
      const nonce = await safeLite.nonce();
      const toAddress = owner2.address;
      const value = ethers.utils.parseEther("1");
      const data = "0x";

      // Transaction 생성 및 서명
      const hash = await safeLite.getTransactionHash(
        nonce,
        toAddress,
        value.toString(),
        data
      );

      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
        nonce,
        toAddress,
        value.toString(),
        data,
        owner1Sig
      );

      // 트랜잭션 정보 확인
      const transaction = await safeLite.getTransaction(nonce);

      expect(transaction[0]).to.equal(toAddress);
      expect(transaction[1]).to.equal(value);
      expect(transaction[2]).to.equal(data);
      expect(transaction[3]).to.equal(false); // 아직 실행되지 않음
      expect(transaction[4]).to.equal(1); // 서명 수는 1이어야 함
      
    });

    // 테스트 케이스 추가, 한 사람이 3번하는 것과 같은 중복테스트.
    it("Should not allow a signer to sign a transaction more than once", async () => {
      const nonce = await safeLite.nonce();
      const hash = await safeLite.getTransactionHash(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x"
      );

      // Owner 1 signs the transaction
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      await safeLite.initiateOrSignTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig
      );

      // Owner 1 signs the transaction again
      const owner1Sig2 = await owner1.signMessage(ethers.utils.arrayify(hash));
      await expect(safeLite.initiateOrSignTransaction(
        nonce,
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        owner1Sig2
        )).to.be.revertedWith("Signature already recorded");
    });
  });
});