// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import {IntentAttestation, AttestationRecord} from "./IntentLockTypes.sol";
import {
    NoAttestation,
    WrongSafe,
    WrongChain,
    DigestMismatch,
    ThresholdNotMet,
    Expired,
    AlreadyConsumed,
    PolicyDenied,
    OnlyGuard,
    CompetingProposal,
    Unauthorized,
    InvalidSignature,
    InvalidVerifierSet
} from "./IntentLockErrors.sol";

/**
 * @title IntentLockRegistry
 * @notice Stores threshold attestations before Safe execution.
 *         Verifies unique active verifier signatures against configured verifier set.
 *         Atomically consumes attestations upon guard request.
 */
contract IntentLockRegistry {
    // EIP-712 type hashes
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "IntentAttestation(address safe,uint256 safeNonce,bytes32 safeTxHash,bytes32 intentHash,uint32 intentSchemaVersion,uint8 policyClass,bytes32 targetCodeHash,address resolvedImplementation,bytes32 implementationCodeHash,bytes32 policyHash,bytes32 verifierSetId,uint64 issuedAt,uint64 validUntil,bytes32 proposalId)"
    );

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // Events
    event VerifierSetUpdated(bytes32 indexed verifierSetId, uint256 epoch, uint256 threshold, bytes32 membersHash);
    event PolicyHashUpdated(bytes32 indexed oldPolicyHash, bytes32 indexed newPolicyHash);
    event GuardUpdated(address indexed oldGuard, address indexed newGuard);
    event MaxAttestationLifetimeUpdated(uint256 oldLifetime, uint256 newLifetime);
    event MaxClockSkewUpdated(uint256 oldSkew, uint256 newSkew);
    event AttestationAccepted(
        address indexed safe,
        bytes32 indexed safeTxHash,
        bytes32 intentHash,
        bytes32 indexed proposalId,
        uint256 signerCount
    );
    event AttestationConsumed(address indexed safe, uint256 indexed safeNonce, bytes32 indexed safeTxHash);

    address public owner;
    address public guard;
    uint256 public immutable chainId;

    bytes32 public currentPolicyHash;
    bytes32 public currentVerifierSetId;
    uint256 public verifierEpoch;
    uint256 public verifierThreshold;

    address[] public activeVerifiers;
    mapping(address => bool) public isVerifier;

    uint256 public maxAttestationLifetime;
    uint256 public maxClockSkew;

    // Mapping: safe => safeNonce => AttestationRecord
    mapping(address => mapping(uint256 => AttestationRecord)) private _records;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        address initialOwner,
        address[] memory verifiers,
        uint256 threshold,
        bytes32 verifierSetId,
        bytes32 policyHash,
        address _guard
    ) {
        if (initialOwner == address(0)) revert Unauthorized();
        owner = initialOwner;
        chainId = block.chainid;
        maxAttestationLifetime = 1 days;
        maxClockSkew = 60 seconds;
        currentPolicyHash = policyHash;

        if (_guard != address(0)) {
            guard = _guard;
            emit GuardUpdated(address(0), _guard);
        }

        if (verifiers.length > 0) {
            _setVerifierSet(verifiers, threshold, verifierSetId);
        }
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("IntentLock")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function hashAttestation(IntentAttestation memory a) public pure returns (bytes32) {
        bytes memory part1 = abi.encode(
            ATTESTATION_TYPEHASH,
            a.safe,
            a.safeNonce,
            a.safeTxHash,
            a.intentHash,
            a.intentSchemaVersion,
            a.policyClass,
            a.targetCodeHash
        );
        bytes memory part2 = abi.encode(
            a.resolvedImplementation,
            a.implementationCodeHash,
            a.policyHash,
            a.verifierSetId,
            a.issuedAt,
            a.validUntil,
            a.proposalId
        );
        return keccak256(bytes.concat(part1, part2));
    }

    function getAttestationDigest(IntentAttestation memory attestation) public view returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator(), hashAttestation(attestation)));
    }

    function setGuard(address _guard) external onlyOwner {
        if (_guard == address(0)) revert PolicyDenied();
        address oldGuard = guard;
        guard = _guard;
        emit GuardUpdated(oldGuard, _guard);
    }

    function setPolicyHash(bytes32 _policyHash) external onlyOwner {
        bytes32 oldPolicyHash = currentPolicyHash;
        currentPolicyHash = _policyHash;
        emit PolicyHashUpdated(oldPolicyHash, _policyHash);
    }

    function setMaxAttestationLifetime(uint256 _lifetime) external onlyOwner {
        uint256 oldLifetime = maxAttestationLifetime;
        maxAttestationLifetime = _lifetime;
        emit MaxAttestationLifetimeUpdated(oldLifetime, _lifetime);
    }

    function setMaxClockSkew(uint256 _skew) external onlyOwner {
        uint256 oldSkew = maxClockSkew;
        maxClockSkew = _skew;
        emit MaxClockSkewUpdated(oldSkew, _skew);
    }

    function setVerifierSet(address[] calldata verifiers, uint256 threshold, bytes32 verifierSetId) external onlyOwner {
        _setVerifierSet(verifiers, threshold, verifierSetId);
    }

    function _setVerifierSet(address[] memory verifiers, uint256 threshold, bytes32 verifierSetId) internal {
        if (verifiers.length == 0 || threshold == 0 || threshold > verifiers.length) {
            revert InvalidVerifierSet();
        }
        verifierEpoch++;

        for (uint256 i = 0; i < activeVerifiers.length; i++) {
            isVerifier[activeVerifiers[i]] = false;
        }
        delete activeVerifiers;

        bytes32 membersHash = keccak256(abi.encode(verifiers));
        if (verifierSetId == bytes32(0)) {
            verifierSetId = keccak256(abi.encode(verifierEpoch, threshold, membersHash));
        }

        for (uint256 i = 0; i < verifiers.length; i++) {
            address v = verifiers[i];
            if (v == address(0) || isVerifier[v]) revert InvalidVerifierSet();
            isVerifier[v] = true;
            activeVerifiers.push(v);
        }

        verifierThreshold = threshold;
        currentVerifierSetId = verifierSetId;

        emit VerifierSetUpdated(verifierSetId, verifierEpoch, threshold, membersHash);
    }

    function submitAttestation(IntentAttestation memory attestation, bytes[] calldata signatures) external {
        if (block.chainid != chainId) revert WrongChain();
        if (attestation.safe == address(0)) revert WrongSafe();
        if (attestation.intentSchemaVersion != 1) revert PolicyDenied();
        if (attestation.verifierSetId != currentVerifierSetId) revert PolicyDenied();
        if (attestation.policyHash != currentPolicyHash) revert PolicyDenied();

        if (attestation.validUntil <= attestation.issuedAt) revert Expired();
        if (attestation.validUntil <= block.timestamp) revert Expired();
        if (attestation.issuedAt > block.timestamp + maxClockSkew) revert Expired();
        if (attestation.validUntil - attestation.issuedAt > maxAttestationLifetime) revert PolicyDenied();

        AttestationRecord storage record = _records[attestation.safe][attestation.safeNonce];
        if (record.consumed) revert AlreadyConsumed();
        if (record.exists) {
            if (record.attestation.validUntil > block.timestamp) {
                if (
                    record.attestation.proposalId != attestation.proposalId
                        || record.attestation.safeTxHash != attestation.safeTxHash
                ) {
                    revert CompetingProposal();
                }
            }
        }

        bytes32 digest = getAttestationDigest(attestation);
        uint256 validSignersCount = 0;
        address[] memory seenSigners = new address[](signatures.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = recoverSigner(digest, signatures[i]);
            if (!isVerifier[signer]) {
                continue;
            }
            bool alreadySeen = false;
            for (uint256 j = 0; j < validSignersCount; j++) {
                if (seenSigners[j] == signer) {
                    alreadySeen = true;
                    break;
                }
            }
            if (!alreadySeen) {
                seenSigners[validSignersCount] = signer;
                validSignersCount++;
            }
        }

        if (validSignersCount < verifierThreshold) {
            revert ThresholdNotMet();
        }

        record.attestation = attestation;
        record.exists = true;
        record.consumed = false;

        emit AttestationAccepted(
            attestation.safe, attestation.safeTxHash, attestation.intentHash, attestation.proposalId, validSignersCount
        );
    }

    function getAttestation(address safe, uint256 safeNonce)
        external
        view
        returns (IntentAttestation memory attestation, bool exists, bool consumed)
    {
        AttestationRecord storage record = _records[safe][safeNonce];
        return (record.attestation, record.exists, record.consumed);
    }

    function consume(address safe, uint256 safeNonce, bytes32 expectedSafeTxHash) external {
        if (msg.sender != guard) revert OnlyGuard();
        AttestationRecord storage record = _records[safe][safeNonce];
        if (!record.exists) revert NoAttestation();
        if (record.consumed) revert AlreadyConsumed();
        if (record.attestation.safeTxHash != expectedSafeTxHash) revert DigestMismatch();
        if (record.attestation.validUntil <= block.timestamp) revert Expired();

        record.consumed = true;
        emit AttestationConsumed(safe, safeNonce, expectedSafeTxHash);
    }

    function recoverSigner(bytes32 digest, bytes calldata signature) public pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSignature();
        }
        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) {
            revert InvalidSignature();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}
