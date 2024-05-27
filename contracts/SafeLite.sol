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
    address[] public owners;
    uint public signaturesRequired;
    uint public nonce;
    uint public chainId;
    address public multiSigWalletAddress;

    struct Transaction {
        address payable to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 signatureCount;
        mapping(address => bool) signatures;
    }

    mapping(uint256 => Transaction) public transactions ;

    constructor(uint256 _chainId, address[] memory _owners, uint _signaturesRequired) {
        require(_signaturesRequired > 0, "constructor: must be non-zero sigs required");
        signaturesRequired = _signaturesRequired;
        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "constructor: zero address");
            require(!isOwner[owner], "constructor: owner not unique");
            isOwner[owner] = true;
            owners.push(owner);
            emit Owner(owner, isOwner[owner]);
        }
        chainId = _chainId;
        multiSigWalletAddress = address(this);
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
        owners.push(newSigner);
        signaturesRequired = newSignaturesRequired;
        emit Owner(newSigner, isOwner[newSigner]);
    }

    function removeSigner(address oldSigner, uint256 newSignaturesRequired) public onlySelf {
        require(isOwner[oldSigner], "removeSigner: not owner");
        require(newSignaturesRequired > 0, "removeSigner: must be non-zero sigs required");
        isOwner[oldSigner] = false;

        for (uint i = 0; i < owners.length; i++) {
            if (owners[i] == oldSigner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
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
    
    function signTransaction(
        uint256 _nonce,
        address payable to,
        uint256 value,
        bytes memory data,
        bytes memory signature
    ) public {
        require(isOwner[msg.sender], "signTransaction: only owners can initiate or sign transactions");

        if (_nonce == nonce && transactions[_nonce].to == address(0)) { 
            transactions[nonce].to = to;
            transactions[nonce].value = value;
            transactions[nonce].data = data;
            transactions[nonce].executed = false;
            transactions[nonce].signatureCount = 0;
        }

        Transaction storage transaction = transactions[_nonce];

        require(!transaction.executed, "Transaction has already been executed");

        bytes32 hash = getTransactionHash(_nonce, to, value, data);
        address signer = hash.toEthSignedMessageHash().recover(signature);

        // signer가 owner인지 체크
        require(isOwner[signer], "Signature is not from an owner");
        require(!transaction.signatures[signer], "Signature already recorded");

        transaction.signatures[signer] = true;
        transaction.signatureCount++;

        emit TransactionSigned(signer, _nonce, transaction.signatureCount);

        if (transaction.signatureCount >= signaturesRequired) {
            executeTransaction(_nonce);
        }
    }

    function executeTransaction(uint256 _nonce) internal {
        Transaction storage transaction = transactions[_nonce];

        require(transaction.signatureCount >= signaturesRequired, "executeTransaction: not enough valid signatures");
        require(!transaction.executed, "executeTransaction: transaction already executed");

        transaction.executed = true;
        nonce++;

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

    function getOwners() public view returns (address[] memory) {
        return owners;
    } 

    function getSignatureCount(uint256 transactionId) public view returns (uint256) {
        return transactions[transactionId].signatureCount;
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }
}