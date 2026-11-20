// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

struct IntentAttestation {
    address safe;
    uint256 safeNonce;
    bytes32 safeTxHash;
    bytes32 intentHash;
    uint32 intentSchemaVersion;
    uint8 policyClass;
    bytes32 targetCodeHash;
    address resolvedImplementation;
    bytes32 implementationCodeHash;
    bytes32 policyHash;
    bytes32 verifierSetId;
    uint64 issuedAt;
    uint64 validUntil;
    bytes32 proposalId;
}

struct AttestationRecord {
    IntentAttestation attestation;
    bool exists;
    bool consumed;
    bool pqVerified;
}
