// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title IPQVerifier
 * @notice Pluggable verifier interface for post-quantum signature schemes (e.g. ML-DSA-44 / Dilithium).
 * @dev Safe owner signatures remain ECDSA. This hybrid mode applies only to IntentLock verifier attestations.
 *      This is a simulated adversary test, not a quantum-safety claim.
 */
interface IPQVerifier {
    /**
     * @notice Verifies a post-quantum signature over a 32-byte message digest.
     * @param pk Serialized post-quantum public key.
     * @param digest EIP-712 typed data hash or transaction digest.
     * @param signature Post-quantum digital signature.
     * @return True if the signature is valid, false otherwise.
     */
    function verify(bytes calldata pk, bytes32 digest, bytes calldata signature) external view returns (bool);
}
