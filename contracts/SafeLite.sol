pragma solidity >=0.8.0 <0.9.0;
// Not needed to be explicitly imported in Solidity 0.8.x
// pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// SafeLite 컨트랙트 : 멀티시그 월렛 정의
contract SafeLite {
    using ECDSA for bytes32;

    //입금 트리거로 발생
    event Deposit(address indexed sender, uint amount, uint balance);
    
    // 트랜잭션 실행시 발생, 트랜잭션 정보와 결과 기록
    event ExecuteTransaction(
        address indexed owner,
        address payable to,
        uint256 value,
        bytes data,
        uint256 nonce,
        bytes32 hash,
        bytes result
    );

    // 월렛 소유자 추가 또는 제거시 발생
    event Owner(address indexed owner, bool added);
    mapping(address => bool) public isOwner; // 각 주소 소유자 여부 추적
    uint public signaturesRequired; // 필요한 서명 수 저장
    uint public nonce; // 트랜잭션 일련번호 저장
    uint public chainId; // 체인 아이디 저장

    // 컨트랙트 초기화 : (소유자 배열, 서명 필요 수) => 소유자 설정
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
    }

    // 호출자 == 컨트랙트 자신 여부 판단
    modifier onlySelf() {
        require(msg.sender == address(this), "Not Self");
        _;
    }

    // 새로운 서명자 추가
    function addSigner(address newSigner, uint256 newSignaturesRequired) public onlySelf {
        require(newSigner != address(0), "addSigner: zero address");
        require(!isOwner[newSigner], "addSigner: owner not unique");
        require(newSignaturesRequired > 0, "addSigner: must be non-zero sigs required");
        isOwner[newSigner] = true;
        signaturesRequired = newSignaturesRequired;
        emit Owner(newSigner, isOwner[newSigner]);
    }

    // 기존 서명자 제거
    function removeSigner(address oldSigner, uint256 newSignaturesRequired) public onlySelf {
        require(isOwner[oldSigner], "removeSigner: not owner");
        require(newSignaturesRequired > 0, "removeSigner: must be non-zero sigs required");
        isOwner[oldSigner] = false;
        signaturesRequired = newSignaturesRequired;
        emit Owner(oldSigner, isOwner[oldSigner]);
    }

    // 필요한 서명 수 업데이트
    function updateSignaturesRequired(uint256 newSignaturesRequired) public onlySelf {
        require(newSignaturesRequired > 0, "updateSignaturesRequired: must be non-zero sigs required");
        signaturesRequired = newSignaturesRequired;
    }

    // 트랜잭션 해시 계산
    function getTransactionHash(
        uint256 _nonce,
        address to,
        uint256 value,
        bytes memory data
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), chainId, _nonce, to, value, data));
    }

    // 트랜잭션 실행 및 필요한 서명 확인
    function executeTransaction(
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

    // 서명된 메시지에서 주소 복구
    function recover(bytes32 _hash, bytes memory _signature) public pure returns (address) {
        return _hash.toEthSignedMessageHash().recover(_signature);
    }

    // 컨트랙트에 이더 전송 시 자동 호출 -> 이더를 받음
    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }
}
