// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import {BaseGuard} from "@safe-global/safe-smart-account/contracts/base/GuardManager.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/common/Enum.sol";
import {IntentAttestation} from "./IntentLockTypes.sol";
import {IntentLockRegistry} from "./IntentLockRegistry.sol";
import {
    NoAttestation,
    WrongSafe,
    WrongChain,
    WrongNonce,
    DigestMismatch,
    IntentMismatch,
    Expired,
    AlreadyConsumed,
    PolicyDenied,
    UnsupportedOperation,
    TargetCodeHashMismatch,
    ImplementationMismatch
} from "./IntentLockErrors.sol";

interface ISafe {
    function nonce() external view returns (uint256);
}

/**
 * @title IntentLockGuard
 * @notice Safe transaction guard enforcing unconditional operation safety,
 *         cryptographic intent binding, target runtime code verification,
 *         and atomic attestation consumption.
 */
contract IntentLockGuard is BaseGuard {
    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    bytes32 private constant SAFE_TX_TYPEHASH = 0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

    uint8 public constant POLICY_CLASS_STANDARD_TRANSFER = 1;

    address public immutable configuredSafe;
    IntentLockRegistry public immutable registry;
    bytes32 public immutable configuredPolicyHash;
    uint256 public immutable chainId;

    event IntentExecutionAuthorized(
        address indexed safe, bytes32 indexed safeTxHash, bytes32 intentHash, uint8 policyClass
    );
    event IntentExecutionCompleted(address indexed safe, bytes32 indexed safeTxHash, bool success);

    constructor(address _configuredSafe, address _registry, bytes32 _configuredPolicyHash) {
        if (_configuredSafe == address(0)) revert WrongSafe();
        if (_registry == address(0)) revert PolicyDenied();
        configuredSafe = _configuredSafe;
        registry = IntentLockRegistry(_registry);
        configuredPolicyHash = _configuredPolicyHash;
        chainId = block.chainid;
    }

    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory,
        address
    ) external override {
        // 1. Unconditional operation rule: DELEGATECALL is unconditionally rejected before registry lookup
        if (operation == Enum.Operation.DelegateCall) {
            revert UnsupportedOperation();
        }
        if (operation != Enum.Operation.Call) {
            revert UnsupportedOperation();
        }

        // 2. Caller context check: must be the configured Safe
        if (msg.sender != configuredSafe) {
            revert WrongSafe();
        }

        // 3. Chain ID check
        if (block.chainid != chainId) {
            revert WrongChain();
        }

        // 4. Safe nonce handling
        // Safe 1.4.1 increments the nonce before calling checkTransaction.
        // Derive signed nonce as currentNonce - 1. Reject if currentNonce == 0.
        uint256 currentNonce = ISafe(configuredSafe).nonce();
        if (currentNonce == 0) {
            revert WrongNonce();
        }
        uint256 safeNonce = currentNonce - 1;

        // 5. Recompute canonical Safe transaction digest
        bytes32 safeTxHash = computeSafeTxHash(
            to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, safeNonce
        );

        // 6. Registry lookup, validation and atomic consumption
        _verifyAndConsume(to, data.length, safeTxHash, safeNonce);
    }

    function _verifyAndConsume(address to, uint256 dataLength, bytes32 safeTxHash, uint256 safeNonce) internal {
        (IntentAttestation memory attestation, bool exists, bool consumed) =
            registry.getAttestation(configuredSafe, safeNonce);

        if (!exists) {
            revert NoAttestation();
        }
        if (consumed) {
            revert AlreadyConsumed();
        }

        // Validate attestation bindings
        if (attestation.safe != configuredSafe) {
            revert WrongSafe();
        }
        if (attestation.safeNonce != safeNonce) {
            revert WrongNonce();
        }
        if (attestation.safeTxHash != safeTxHash) {
            revert DigestMismatch();
        }
        if (attestation.intentHash == bytes32(0)) {
            revert IntentMismatch();
        }
        if (attestation.validUntil <= block.timestamp) {
            revert Expired();
        }
        if (attestation.verifierSetId != registry.currentVerifierSetId()) {
            revert PolicyDenied();
        }
        if (attestation.policyHash != configuredPolicyHash) {
            revert PolicyDenied();
        }

        // Direct native EOA transfer validation (slice scope)
        if (attestation.policyClass != POLICY_CLASS_STANDARD_TRANSFER) {
            revert PolicyDenied();
        }
        if (dataLength != 0) {
            revert UnsupportedOperation();
        }
        if (to.code.length != 0) {
            revert TargetCodeHashMismatch();
        }
        if (attestation.targetCodeHash != bytes32(0)) {
            revert TargetCodeHashMismatch();
        }
        if (attestation.resolvedImplementation != address(0) || attestation.implementationCodeHash != bytes32(0)) {
            revert ImplementationMismatch();
        }

        emit IntentExecutionAuthorized(configuredSafe, safeTxHash, attestation.intentHash, attestation.policyClass);

        registry.consume(configuredSafe, safeNonce, safeTxHash);
    }

    function checkAfterExecution(bytes32 txHash, bool success) external override {
        if (msg.sender != configuredSafe) {
            revert WrongSafe();
        }
        emit IntentExecutionCompleted(configuredSafe, txHash, success);
    }

    function computeSafeTxHash(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 safeTxPayloadHash = keccak256(
            abi.encode(
                SAFE_TX_TYPEHASH,
                to,
                value,
                keccak256(data),
                uint8(operation),
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                nonce
            )
        );
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, block.chainid, configuredSafe));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator, safeTxPayloadHash));
    }
}
