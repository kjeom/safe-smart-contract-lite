// SPDX-License-Identifier: MIT

//  Off-chain signature gathering multisig that streams funds - @austingriffith
//
// started from 🏗 scaffold-eth - meta-multi-sig-wallet example https://github.com/austintgriffith/scaffold-eth/tree/meta-multi-sig
//    (off-chain signature based multi-sig)
//  added a very simple streaming mechanism where `onlySelf` can open a withdraw-based stream
//

pragma solidity >=0.8.0 <0.9.0;
// Not needed to be explicitly imported in Solidity 0.8.x
// pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol"; // 서명 관련 작업

contract SafeLite {
    using ECDSA for bytes32;

    event Deposit(address indexed sender, uint amount, uint balance);
    event ExecuteTransaction(
        address indexed owner,
        address payable to,
        uint256 value,
        bytes data,
        uint256 nonce,
        bytes32 hash,
        bytes result
    );
    event Owner(address indexed owner, bool added);
    mapping(address => bool) public isOwner; // 해당 주소가 소유주인지 true/false
    uint public signaturesRequired; // 필요한 서명의 수, 쓰레쉬홀드?라고 보면될듯
    uint public nonce; // 트랜잭션의 번호?를 저장?
    uint public chainId; 

    constructor(uint256 _chainId, address[] memory _owners, uint _signaturesRequired) {
        require(_signaturesRequired > 0, "constructor: must be non-zero sigs required"); // 1개 이상의 서명개수가 있어야겠고
        signaturesRequired = _signaturesRequired; // 해당 컨트랙트의 쓰레쉬 홀드값 입력
        for (uint i = 0; i < _owners.length; i++) { // 오너 개수만큼, 해당 오너의 개수만큼, 소유주 넣고
            address owner = _owners[i];
            require(owner != address(0), "constructor: zero address");
            require(!isOwner[owner], "constructor: owner not unique");
            isOwner[owner] = true;
            emit Owner(owner, isOwner[owner]);
        }
        chainId = _chainId;
    }

    modifier onlySelf() { // 함수가 컨트랙트 자체에서 호출되었는가?
        require(msg.sender == address(this), "Not Self");
        _;
    }

    function addSigner(address newSigner, uint256 newSignaturesRequired) public onlySelf { // 새로운 서명자 주소, 새로운 필요 서명 수
        require(newSigner != address(0), "addSigner: zero address"); // 제로 주소가 아닌지
        require(!isOwner[newSigner], "addSigner: owner not unique"); // 기존 주소가 아닌지
        require(newSignaturesRequired > 0, "addSigner: must be non-zero sigs required"); // 필요 서명 수는 0 초과
        isOwner[newSigner] = true; // 새롭게 주소 등록해주고
        signaturesRequired = newSignaturesRequired; // 기존 필요 서명값도 변경해주기
        emit Owner(newSigner, isOwner[newSigner]);
    }

    function removeSigner(address oldSigner, uint256 newSignaturesRequired) public onlySelf {
        require(isOwner[oldSigner], "removeSigner: not owner");
        require(newSignaturesRequired > 0, "removeSigner: must be non-zero sigs required");
        isOwner[oldSigner] = false; // 기존 주소 등록한 거 박탈시키고
        signaturesRequired = newSignaturesRequired; // 기존 필요 서명값도 변경
        emit Owner(oldSigner, isOwner[oldSigner]);
    }

    function updateSignaturesRequired(uint256 newSignaturesRequired) public onlySelf { // 필요 서명 값만 변경해주기
        require(newSignaturesRequired > 0, "updateSignaturesRequired: must be non-zero sigs required");
        signaturesRequired = newSignaturesRequired;
    }

    function getTransactionHash( // 트랜잭션 해시를 계산
        uint256 _nonce,
        address to,
        uint256 value,
        bytes memory data
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), chainId, _nonce, to, value, data));
    }

    function executeTransaction( // 트랜잭션 실행, 소유주인지 확인하고, 서명을 검증
        address payable to,
        uint256 value,
        bytes memory data,
        bytes[] memory signatures
    ) public returns (bytes memory) {
        require(isOwner[msg.sender], "executeTransaction: only owners can execute");
        bytes32 _hash = getTransactionHash(nonce, to, value, data);
        nonce++;
        uint256 validSignatures;
        address duplicateGuard = address(0);
        for (uint i = 0; i < signatures.length; i++) {
            address recovered = recover(_hash, signatures[i]);
            require(recovered > duplicateGuard, "executeTransaction: duplicate or unordered signatures");
            duplicateGuard = recovered;
            if (isOwner[recovered]) {
                validSignatures++;
            }
        }

        require(validSignatures >= signaturesRequired, "executeTransaction: not enough valid signatures");

        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "executeTransaction: tx failed");

        emit ExecuteTransaction(msg.sender, to, value, data, nonce - 1, _hash, result);
        return result;
    }

    function recover(bytes32 _hash, bytes memory _signature) public pure returns (address) {
        return _hash.toEthSignedMessageHash().recover(_signature); // 서명자 주소 복구?
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }
}
