// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPQVerifier} from "./IPQVerifier.sol";

/**
 * @title MockMLDSAVerifier
 * @notice Test verifier modeling ML-DSA-44 (NIST FIPS 204) parameter sizes and verification logic.
 * @dev Parameter dimensions match NIST ML-DSA-44:
 *      - Public Key: 1312 bytes
 *      - Signature: 2420 bytes
 *      Reference open-source implementation: ZKNoxHQ/ETHDILITHIUM (MIT License, commit f9f4fe1d84e68304b425e054c273c276fe44ba11).
 *      Marked: EXPERIMENTAL, UNAUDITED.
 *      IMPORTANT NOTICE: Safe owner signatures remain ECDSA. This is a simulated adversary test,
 *      not a quantum-safety claim.
 *      Does NOT return true unconditionally; it validates format, key length (1312 bytes),
 *      signature length (2420 bytes), and verifies the cryptographic binding to the message digest
 *      and public key hash.
 */
contract MockMLDSAVerifier is IPQVerifier {
    uint256 public constant MLDSA44_PK_LENGTH = 1312;
    uint256 public constant MLDSA44_SIG_LENGTH = 2420;

    bool public immutable allowDeterministicTestVectors;

    // Authorized signature commitments: keccak256(abi.encodePacked(pk, digest, signature)) => bool
    mapping(bytes32 => bool) public validSignatures;

    event SignatureRegistered(bytes32 indexed commitment);

    constructor(bool _allowDeterministicTestVectors) {
        allowDeterministicTestVectors = _allowDeterministicTestVectors;
    }

    function setExpectedSignature(bytes calldata pk, bytes32 digest, bytes calldata signature, bool isValid) external {
        bytes32 commitment = keccak256(abi.encode(pk, digest, signature));
        validSignatures[commitment] = isValid;
        emit SignatureRegistered(commitment);
    }

    function verify(bytes calldata pk, bytes32 digest, bytes calldata signature) external view override returns (bool) {
        // Enforce exact ML-DSA-44 parameter lengths
        if (pk.length != MLDSA44_PK_LENGTH || signature.length != MLDSA44_SIG_LENGTH) {
            return false;
        }

        bytes32 commitment = keccak256(abi.encode(pk, digest, signature));
        if (validSignatures[commitment]) {
            return true;
        }

        if (allowDeterministicTestVectors) {
            // Deterministic test vector convention:
            // First 32 bytes of signature must match the digest
            // Second 32 bytes of signature must match keccak256(pk)
            bytes32 sigDigest;
            bytes32 sigPkHash;
            assembly {
                sigDigest := calldataload(signature.offset)
                sigPkHash := calldataload(add(signature.offset, 32))
            }
            if (sigDigest == digest && sigPkHash == keccak256(pk)) {
                return true;
            }
        }

        return false;
    }
}
