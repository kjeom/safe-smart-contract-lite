import { expect } from "chai";
import { Contract, Signer } from "ethers";
import { ethers } from "hardhat";

// 주어진 서명, 생성한 주소 정렬
const sortSignatures = (signers: string[], signatures: string[]): string[] => {
  const combined = signers.map((address, i) => ({ address, signature: signatures[i] }));
  combined.sort((a, b) => a.address.localeCompare(b.address));
  return combined.map((x) => x.signature);
};

// SafeLite 스마트계약 테스트
describe("SafeLite", () => {
  // 계약 배포와 관련된 테스트 정의
  describe("Deployment", () => {
    it("Should return Owner event with address and isOwner for each owner", async () => {
      // 인스턴스 생성
      const safeLiteContract = await ethers.getContractFactory("SafeLite");
      const [owner1, owner2, owner3] = await ethers.getSigners();
      console.log(safeLiteContract.signer.getAddress());
      // 계약 배포하고 각 소유자에 대한 이벤트 확인
      const safeLiteDeployTx = await safeLiteContract.deploy(1001, [owner1.address, owner2.address, owner3.address], 2);
      expect(safeLiteDeployTx)
        .to.emit(safeLiteDeployTx, "Owner")
        .withArgs(owner1.address, true)
        .to.emit(safeLiteDeployTx, "Owner")
        .withArgs(owner2.address, true)
        .to.emit(safeLiteDeployTx, "Owner")
        .withArgs(owner3.address, true);
    });
  });

  // 트랜잭션 실행과 관련된 테스트 정의
  describe("execute transaction", () => {
    let safeLite: Contract;
    let owner1, owner2, owner3;

    beforeEach(async () => {
      // 게약 배포
      const safeLiteContract = await ethers.getContractFactory("SafeLite");
      [owner1, owner2, owner3] = await ethers.getSigners();
      safeLite = await safeLiteContract.deploy(1001, [owner1.address, owner2.address, owner3.address], 2);
      // 일부 송금 수행
      await owner1.sendTransaction({
        to: safeLite.address,
        value: ethers.utils.parseEther("1.0"),
      });
    });

    // 테스트 서명 검증 + 서명 생성 주소 확인
    it("Recovered signature should equal to each signer address", async () => {
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        await owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
      ); // 해시 생성

      // 해시를 바이트 배열 형식으로 변환하고 서명
      const arrifiedHash = ethers.utils.arrayify(hash);
      const owner1Sig = await owner1.signMessage(arrifiedHash);
      const owner2Sig = await owner2.signMessage(arrifiedHash);
      const owner3Sig = await owner3.signMessage(arrifiedHash);

      // 해시와 서명으로 부터 공개키 추출 후 주소와 비교
      expect(await safeLite.recover(hash, owner1Sig)).to.equal(owner1.address);
      expect(await safeLite.recover(hash, owner2Sig)).to.equal(owner2.address);
      expect(await safeLite.recover(hash, owner3Sig)).to.equal(owner3.address);
    });

    // 트랜잭션 실행 후 수신자에게 토큰 전송했는지 확인
    it("Should send tokens to receiver", async () => {
      const prevBalance = await owner2.getBalance(); // 유저2의 잔액

      // 해시 생성 및 유저1과 유저2 서명
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));

      // 트랜잭션 시행 후 유저2의 잔액이 일정량 늘었는지 확인
      await safeLite.executeTransaction(
        owner2.address,
        ethers.utils.parseEther("1").toString(),
        "0x",
        sortSignatures([owner1.address, owner2.address], [owner1Sig, owner2Sig]),
      );
      expect(await owner2.getBalance()).to.equal(ethers.utils.parseEther("1").add(prevBalance));
    });

    // 새로운 서명자를 추가하는 트랜잭션이 잘 수행되었는지 확인
    it("Adding the new signer should return Owner event", async () => {
      const owner4 = await ethers.Wallet.createRandom(); // 유저4 생성

      // 유저4 추가에 대한 해시 생성 및 유저1 유저2 서명
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("addSigner", [owner4.address, 3]),
      );
      const owner1Sig = await owner1.signMessage(ethers.utils.arrayify(hash));
      const owner2Sig = await owner2.signMessage(ethers.utils.arrayify(hash));

      // 트랜잭션 시행 후 Owner이벤트가 나오는지 확인
      const tx = await safeLite.executeTransaction(
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("addSigner", [owner4.address, 3]),
        sortSignatures([owner1.address, owner2.address], [owner1Sig, owner2Sig]),
      );
      expect(tx).to.emit(tx, "Owner").withArgs(owner4.address, true);
    });

    // 기존 서명자를 제거하는 트랜잭션이 잘 수행되었는지 확인
    it("기존 서명자를 제거하면 Owner이벤트 리턴", async () => {
      // 유저3 제거에 대한 해시 생성 및 유저1 유저2 서명
      const hash = await safeLite.getTransactionHash(
        await safeLite.nonce(),
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("removeSigner", [owner3.address, 2]),
      );
      const arrifiedHash = ethers.utils.arrayify(hash);
      const owner1Sig = await owner1.signMessage(arrifiedHash);
      const onwer2Sig = await owner2.signMessage(arrifiedHash);

      // 트랜잭션 시행 후 Owner이벤트가 나오는지 확인
      const tx = await safeLite.executeTransaction(
        safeLite.address,
        0,
        safeLite.interface.encodeFunctionData("removeSigner", [owner3.address, 2]),
        sortSignatures([owner1.address, owner2.address], [owner1Sig, onwer2Sig]),
      );
      expect(tx).to.emit(tx, "Owner").withArgs(owner3.address, true);
    });
  });
});
