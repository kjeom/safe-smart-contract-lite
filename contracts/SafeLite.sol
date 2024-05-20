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

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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
    event TransactionSigned(address by, uint256 nonce, uint256 totalSignatures);

    mapping(address => bool) public isOwner;
    uint public signaturesRequired;
    uint public nonce;
    uint public chainId;
    address public multiSigWalletAddress; // 업데이트 1. 멀티 시그지갑 주소 기록

    struct Transaction {
        address payable to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 signatureCount;
        mapping(address => bool) signatures;
    }

    mapping(uint256 => Transaction) public transactions ; // 업데이트 3. 트랜잭션을 저장할 매핑

    constructor(uint256 _chainId, address[] memory _owners, uint _signaturesRequired) {
        require(_signaturesRequired > 0, "constructor: must be non-zero sigs required");
        signaturesRequired = _signaturesRequired;
        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "constructor: zero address");
            require(!isOwner[owner], "constructor: owner not unique");
            isOwner[owner] = true;
            emit Owner(owner, isOwner[owner]);
        }
        chainId = _chainId;
        multiSigWalletAddress = address(this); // 업데이트 1. 멀티 시그지갑 주소 기록
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Not Self");
        _;
    }

    function addSigner(address newSigner, uint256 newSignaturesRequired) public onlySelf {
        require(newSigner != address(0), "addSigner: zero address");
        require(!isOwner[newSigner], "addSigner: owner not unique");
        require(newSignaturesRequired > 0, "addSigner: must be non-zero sigs required");
        isOwner[newSigner] = true;
        signaturesRequired = newSignaturesRequired;
        emit Owner(newSigner, isOwner[newSigner]);
    }

    function removeSigner(address oldSigner, uint256 newSignaturesRequired) public onlySelf {
        require(isOwner[oldSigner], "removeSigner: not owner");
        require(newSignaturesRequired > 0, "removeSigner: must be non-zero sigs required");
        isOwner[oldSigner] = false;
        signaturesRequired = newSignaturesRequired;
        emit Owner(oldSigner, isOwner[oldSigner]);
    }

    function updateSignaturesRequired(uint256 newSignaturesRequired) public onlySelf {
        require(newSignaturesRequired > 0, "updateSignaturesRequired: must be non-zero sigs required");
        signaturesRequired = newSignaturesRequired;
    }

    function getTransactionHash(
        uint256 _nonce,
        address to,
        uint256 value,
        bytes memory data
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), chainId, _nonce, to, value, data));
    }
    
    // 업데이트 2. 트랜잭션을 생성하고 서명을 받는 함수
    function initiateOrSignTransaction(
        uint256 _nonce,
        address payable to,
        uint256 value,
        bytes memory data,
        bytes memory signature
    ) public {
        require(isOwner[msg.sender], "initiateOrSignTransaction: only owners can initiate or sign transactions");

        if (_nonce == nonce && transactions[_nonce].to == address(0)) { // 새로운 트랜잭션이라면 해당 트랜잭션에 각 필드를 기록
            transactions[nonce].to = to;
            transactions[nonce].value = value;
            transactions[nonce].data = data;
            transactions[nonce].executed = false;
            transactions[nonce].signatureCount = 0;
        }

        // 현재 트랜잭션이 있다면, 해당 트랜잭션을 참조하기 위한 storage 포인터를 가져옴
        Transaction storage transaction = transactions[_nonce];

        // 트랜잭션이 이미 실행됐는지 체크
        require(!transaction.executed, "Transaction has already been executed");

        // 트렌잭션 데이터로 트랜잭션 해시 생성
        bytes32 hash = getTransactionHash(_nonce, to, value, data);
        // recover 함수 로직 사용해서 signer 복구
        address signer = hash.toEthSignedMessageHash().recover(signature);

        // signer가 owner인지 체크
        require(isOwner[signer], "Signature is not from an owner");
        require(!transaction.signatures[signer], "Signature already recorded");

        transaction.signatures[signer] = true;
        transaction.signatureCount++;

        emit TransactionSigned(signer, _nonce, transaction.signatureCount);

        // 필요한 서명 수를 넘기면 트랜잭션을 실행
        if (transaction.signatureCount >= signaturesRequired) {
            executeTransaction(_nonce);
        }
    }

    function executeTransaction(uint256 _nonce) internal {
        // 현재 트랜잭션을 참조하기 위해서 storage에 있는 걸 가져옴
        Transaction storage transaction = transactions[_nonce];

        // 필요한 서명 수 넘겼는지 확인
        require(transaction.signatureCount >= signaturesRequired, "executeTransaction: not enough valid signatures");
        // 이미 실행되었는지 확인
        require(!transaction.executed, "executeTransaction: transaction already executed");

        // 트랜잭션을 실행하고 실행 여부를 true로 변경
        transaction.executed = true;

        // 다음 트랜잭션을 위해 nonce 값 증가
        nonce++;

        // 트랜잭션을 실행하고 결과를 받기
        (bool success, bytes memory result) = transaction.to.call{value: transaction.value}(transaction.data);
        require(success, "executeTransaction: tx failed");

        emit ExecuteTransaction(msg.sender, transaction.to, transaction.value, transaction.data, _nonce, keccak256(abi.encodePacked(transaction.to, transaction.value, transaction.data)), result);
    }

    function recover(bytes32 _hash, bytes memory _signature) public pure returns (address) {
        return _hash.toEthSignedMessageHash().recover(_signature);
    }

    function getMultiSigWalletAddress() public view returns (address) {
        return multiSigWalletAddress;
    }

    // 업데이트 4. 트랜잭션 정보를 가져오는 함수
    function getTransaction(uint256 transactionId) public view returns (address, uint256, bytes memory, bool, uint256) {
        Transaction storage transaction = transactions[transactionId];
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.signatureCount
        );
    }

    // 업데이트 5. 내 지갑이 속한 멀티시그 주소를 불러오는 함수
    // owners 배열에 내 지갑이 포함되어 있으면 멀티시그 주소를 반환

    function getSignatureCount(uint256 transactionId) public view returns (uint256) {
    return transactions[transactionId].signatureCount;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }
}