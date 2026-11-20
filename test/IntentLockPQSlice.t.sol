// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Safe} from "@safe-global/safe-smart-account/contracts/Safe.sol";
import {SafeProxy} from "@safe-global/safe-smart-account/contracts/proxies/SafeProxy.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/common/Enum.sol";
import {IntentLockGuard} from "../contracts/IntentLockGuard.sol";
import {IntentLockRegistry} from "../contracts/IntentLockRegistry.sol";
import {IntentAttestation} from "../contracts/IntentLockTypes.sol";
import {MockMLDSAVerifier} from "../contracts/MockMLDSAVerifier.sol";
import {
    NoAttestation,
    WrongSafe,
    WrongChain,
    WrongNonce,
    DigestMismatch,
    ThresholdNotMet,
    Expired,
    AlreadyConsumed,
    PolicyDenied,
    UnsupportedOperation,
    TargetCodeHashMismatch,
    ImplementationMismatch,
    OnlyGuard,
    PQVerificationFailed
} from "../contracts/IntentLockErrors.sol";

/**
 * @title IntentLockPQSliceTest
 * @notice Tests for Phase 5 Hybrid Post-Quantum attestation mode.
 * @dev IMPORTANT DISCLAIMER:
 *      Owner Safe signatures remain ECDSA. This hybrid mode applies solely to IntentLock verifier attestations.
 *      This is a simulated adversary test (Q01 / Q02), not a quantum-safety claim.
 */
contract IntentLockPQSliceTest is Test {
    Safe public safe;
    Safe public safeMasterCopy;
    SafeProxy public safeProxy;

    IntentLockRegistry public registry;
    IntentLockGuard public guard;
    MockMLDSAVerifier public pqVerifier;

    uint256 internal ownerPrivateKey = 0xA11CE;
    address internal owner;

    uint256 internal verifierKey1 = 0xB0B1;
    uint256 internal verifierKey2 = 0xB0B2;
    uint256 internal verifierKey3 = 0xB0B3;

    address internal verifier1;
    address internal verifier2;
    address internal verifier3;

    bytes internal pk1;
    bytes internal pk2;
    bytes internal pk3;

    bytes32 internal verifierSetId = keccak256("VERIFIER_SET_V1");
    bytes32 internal policyHash;

    address internal admin = address(0xAD);
    address internal recipient;

    bytes32 internal constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    receive() external payable {}

    function setUp() public {
        owner = vm.addr(ownerPrivateKey);
        verifier1 = vm.addr(verifierKey1);
        verifier2 = vm.addr(verifierKey2);
        verifier3 = vm.addr(verifierKey3);
        recipient = makeAddr("allowlistedRecipient");
        policyHash = _policyHashFor(recipient);

        // 1. Deploy actual Safe v1.4.1 singleton and proxy
        safeMasterCopy = new Safe();
        safeProxy = new SafeProxy(address(safeMasterCopy));
        safe = Safe(payable(address(safeProxy)));

        address[] memory owners = new address[](1);
        owners[0] = owner;
        safe.setup(owners, 1, address(0), "", address(0), address(0), 0, payable(address(0)));
        assertEq(safe.VERSION(), "1.4.1");

        // Fund Safe with 10 ETH
        vm.deal(address(safe), 10 ether);

        // 2. Deploy IntentLockRegistry with 2-of-3 threshold
        address[] memory verifiers = new address[](3);
        verifiers[0] = verifier1;
        verifiers[1] = verifier2;
        verifiers[2] = verifier3;

        registry = new IntentLockRegistry(admin, verifiers, 2, verifierSetId, policyHash, address(0));

        // 3. Deploy MockMLDSAVerifier
        pqVerifier = new MockMLDSAVerifier(true);

        // 4. Configure ML-DSA-44 public keys for verifiers (1312 bytes each)
        pk1 = _createMLDSA44PubKey("VERIFIER_1_MLDSA44_PK");
        pk2 = _createMLDSA44PubKey("VERIFIER_2_MLDSA44_PK");
        pk3 = _createMLDSA44PubKey("VERIFIER_3_MLDSA44_PK");

        vm.startPrank(admin);
        registry.setVerifierPQKey(verifier1, pk1, address(pqVerifier));
        registry.setVerifierPQKey(verifier2, pk2, address(pqVerifier));
        registry.setVerifierPQKey(verifier3, pk3, address(pqVerifier));
        vm.stopPrank();

        // 5. Deploy IntentLockGuard and configure
        guard = new IntentLockGuard(address(safe), address(registry), policyHash);

        vm.prank(admin);
        registry.setGuard(address(guard));

        vm.prank(address(safe));
        safe.setGuard(address(guard));
    }

    // ==========================================
    // Helper Functions
    // ==========================================

    function _createMLDSA44PubKey(string memory seed) internal pure returns (bytes memory) {
        bytes memory pk = new bytes(1312);
        bytes32 h = keccak256(bytes(seed));
        for (uint256 i = 0; i < 32; i++) {
            pk[i] = h[i];
        }
        return pk;
    }

    function _createMLDSA44Sig(bytes memory pk, bytes32 digest) internal pure returns (bytes memory) {
        bytes memory sig = new bytes(2420);
        bytes32 pkHash = keccak256(pk);
        for (uint256 i = 0; i < 32; i++) {
            sig[i] = digest[i];
            sig[i + 32] = pkHash[i];
        }
        return sig;
    }

    function _signSafeTx(
        Safe safeInstance,
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 txNonce,
        uint256 privateKey
    ) internal view returns (bytes32 safeTxHash, bytes memory signatures) {
        safeTxHash = safeInstance.getTransactionHash(
            to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, txNonce
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, safeTxHash);
        signatures = abi.encodePacked(r, s, v);
    }

    function _signAttestation(uint256 privateKey, IntentAttestation memory attestation)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = registry.getAttestationDigest(attestation);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _createValidAttestation(address to, uint256 value, uint256 safeNonce)
        internal
        view
        returns (IntentAttestation memory)
    {
        bytes32 safeTxHash =
            safe.getTransactionHash(to, value, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), safeNonce);

        return IntentAttestation({
            safe: address(safe),
            safeNonce: safeNonce,
            safeTxHash: safeTxHash,
            intentHash: keccak256("CANONICAL_INTENT_NATIVE_TRANSFER"),
            intentSchemaVersion: 1,
            policyClass: 1, // STANDARD_TRANSFER
            targetCodeHash: bytes32(0), // EOA recipient has zero code hash
            resolvedImplementation: address(0),
            implementationCodeHash: bytes32(0),
            policyHash: policyHash,
            verifierSetId: verifierSetId,
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 1 hours),
            proposalId: keccak256(abi.encodePacked("PROPOSAL_", safeNonce))
        });
    }

    function _policyHashFor(address allowedRecipient) internal pure returns (bytes32) {
        bytes32 policyTypeHash = keccak256(
            "PolicyV1(uint32 schemaVersion,uint256 maxNativeTransferWei,bytes32 nativeRecipientSetHash,bytes32 erc20TokenMapHash,bytes32 erc20RecipientSetHash,uint256 maxErc20TransferBaseUnits)"
        );
        address[] memory nativeRecipients = new address[](1);
        nativeRecipients[0] = allowedRecipient;
        address[] memory noAddresses = new address[](0);
        bytes32[] memory noCodeHashes = new bytes32[](0);
        bytes32 nativeRecipientSetHash = keccak256(abi.encode(nativeRecipients));
        bytes32 erc20TokenMapHash = keccak256(abi.encode(noAddresses, noCodeHashes));
        bytes32 erc20RecipientSetHash = keccak256(abi.encode(noAddresses));
        return keccak256(
            abi.encode(
                policyTypeHash,
                uint32(1),
                100 ether,
                nativeRecipientSetHash,
                erc20TokenMapHash,
                erc20RecipientSetHash,
                uint256(0)
            )
        );
    }

    // ==========================================
    // Phase 5 Tests: Q01 and Q02
    // ==========================================

    /**
     * @notice Fixture Q01: Attacker holds all ECDSA keys but no PQ keys in PQ hybrid mode.
     *         Proves that when PQ mode is enabled, an attacker with full ECDSA compromise
     *         cannot forge attestations or execute transactions; both registry submission
     *         and guard execution revert with PQVerificationFailed, and Safe state is unchanged.
     */
    function test_Q01_PQModeAttackerHasECDSAButNoPQ() public {
        // Enable PQ mode
        vm.prank(admin);
        registry.setPQMode(true);
        assertTrue(registry.pqModeEnabled());

        uint256 transferAmount = 1 ether;
        IntentAttestation memory attestation = _createValidAttestation(recipient, transferAmount, 0);

        // Attacker possesses all 3 ECDSA private keys and signs with Verifier 1 and Verifier 2
        bytes[] memory ecdsaSignatures = new bytes[](2);
        ecdsaSignatures[0] = _signAttestation(verifierKey1, attestation);
        ecdsaSignatures[1] = _signAttestation(verifierKey2, attestation);

        // 1. Attacker attempts submitAttestation without PQ signatures -> reverts with PQVerificationFailed
        vm.expectRevert(PQVerificationFailed.selector);
        registry.submitAttestation(attestation, ecdsaSignatures);

        // 2. Attacker attempts submitAttestationHybrid with empty/dummy PQ signatures -> reverts with PQVerificationFailed
        bytes[] memory emptyPQSignatures = new bytes[](2);
        emptyPQSignatures[0] = "";
        emptyPQSignatures[1] = "";
        vm.expectRevert(PQVerificationFailed.selector);
        registry.submitAttestationHybrid(attestation, ecdsaSignatures, emptyPQSignatures);

        // 3. Attacker attempts execution of Safe transaction directly without PQ attestation -> fails closed
        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            recipient,
            transferAmount,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            0,
            ownerPrivateKey
        );

        // Safe execution reverts with NoAttestation because no attestation could be submitted
        vm.expectRevert(NoAttestation.selector);
        safe.execTransaction(
            recipient, transferAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );

        // 4. In addition, prove guard-level enforcement: if an ECDSA-only attestation pre-existed in registry
        //    before PQ mode was toggled on, execution in PQ mode reverts specifically with PQVerificationFailed!
        vm.prank(admin);
        registry.setPQMode(false); // Temporarily turn off PQ mode to store non-PQ record
        registry.submitAttestation(attestation, ecdsaSignatures);
        assertFalse(registry.isPQVerified(address(safe), 0));

        vm.prank(admin);
        registry.setPQMode(true); // Re-enable PQ mode
        assertTrue(registry.pqModeEnabled());

        // Now guard specifically rejects the non-PQ attestation with PQVerificationFailed!
        vm.expectRevert(PQVerificationFailed.selector);
        safe.execTransaction(
            recipient, transferAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );

        // Verify protected state is completely unchanged
        assertEq(address(safe).balance, 10 ether, "Safe balance must be unchanged");
        assertEq(recipient.balance, 0, "Recipient balance must be unchanged");
        assertEq(safe.nonce(), 0, "Safe nonce must be unchanged");
    }

    /**
     * @notice Fixture Q02: Valid hybrid ECDSA + ML-DSA-44 PQ signatures execute in PQ mode.
     *         Proves that when both ECDSA and PQ signatures are valid for threshold verifiers,
     *         the attestation is accepted with pqVerified = true and Safe transaction executes.
     */
    function test_Q02_PQModeValidHybridExecutes() public {
        // Enable PQ mode
        vm.prank(admin);
        registry.setPQMode(true);

        uint256 transferAmount = 1 ether;
        IntentAttestation memory attestation = _createValidAttestation(recipient, transferAmount, 0);
        bytes32 digest = registry.getAttestationDigest(attestation);

        // Prepare valid ECDSA signatures for Verifier 1 and Verifier 2
        bytes[] memory ecdsaSignatures = new bytes[](2);
        ecdsaSignatures[0] = _signAttestation(verifierKey1, attestation);
        ecdsaSignatures[1] = _signAttestation(verifierKey2, attestation);

        // Prepare valid ML-DSA-44 PQ signatures for Verifier 1 and Verifier 2
        bytes[] memory pqSignatures = new bytes[](2);
        pqSignatures[0] = _createMLDSA44Sig(pk1, digest);
        pqSignatures[1] = _createMLDSA44Sig(pk2, digest);

        // Submit hybrid attestation
        registry.submitAttestationHybrid(attestation, ecdsaSignatures, pqSignatures);

        // Verify record is stored and PQ-verified
        (IntentAttestation memory stored, bool exists, bool consumed) = registry.getAttestation(address(safe), 0);
        assertTrue(exists, "Attestation must exist");
        assertFalse(consumed, "Attestation must not be consumed yet");
        assertTrue(registry.isPQVerified(address(safe), 0), "Must be marked PQ verified");
        assertEq(stored.safeTxHash, attestation.safeTxHash, "SafeTxHash must match");

        // Safe owner signs execution transaction
        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            recipient,
            transferAmount,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            0,
            ownerPrivateKey
        );

        // Execute transaction through Safe
        bool success = safe.execTransaction(
            recipient, transferAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
        assertTrue(success, "Safe execution must succeed");

        // Verify state updates
        assertEq(address(safe).balance, 9 ether, "Safe balance must decrease by 1 ETH");
        assertEq(recipient.balance, 1 ether, "Recipient balance must increase by 1 ETH");
        assertEq(safe.nonce(), 1, "Safe nonce must advance to 1");

        (,, bool consumedAfter) = registry.getAttestation(address(safe), 0);
        assertTrue(consumedAfter, "Attestation must be marked consumed");
    }

    /**
     * @notice Test that corrupted or invalid ML-DSA-44 signature fails closed in PQ mode.
     */
    function test_PQMode_CorruptedPQSignatureFailsClosed() public {
        vm.prank(admin);
        registry.setPQMode(true);

        uint256 transferAmount = 1 ether;
        IntentAttestation memory attestation = _createValidAttestation(recipient, transferAmount, 0);
        bytes32 digest = registry.getAttestationDigest(attestation);

        bytes[] memory ecdsaSignatures = new bytes[](2);
        ecdsaSignatures[0] = _signAttestation(verifierKey1, attestation);
        ecdsaSignatures[1] = _signAttestation(verifierKey2, attestation);

        bytes[] memory pqSignatures = new bytes[](2);
        pqSignatures[0] = _createMLDSA44Sig(pk1, digest);
        pqSignatures[1] = _createMLDSA44Sig(pk2, digest);

        // Corrupt signature 2
        pqSignatures[1][0] = bytes1(uint8(pqSignatures[1][0]) ^ 0xFF);

        // Only Verifier 1 passes PQ check, which is 1 of 2 threshold -> reverts PQVerificationFailed
        vm.expectRevert(PQVerificationFailed.selector);
        registry.submitAttestationHybrid(attestation, ecdsaSignatures, pqSignatures);
    }

    /**
     * @notice Test that default mode (PQ mode off) continues to accept pure ECDSA signatures without PQ overhead.
     */
    function test_DefaultMode_PureECDSAOperatesNormally() public {
        assertFalse(registry.pqModeEnabled(), "PQ mode must be disabled by default");

        uint256 transferAmount = 1 ether;
        IntentAttestation memory attestation = _createValidAttestation(recipient, transferAmount, 0);

        bytes[] memory ecdsaSignatures = new bytes[](2);
        ecdsaSignatures[0] = _signAttestation(verifierKey1, attestation);
        ecdsaSignatures[1] = _signAttestation(verifierKey2, attestation);

        registry.submitAttestation(attestation, ecdsaSignatures);

        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            recipient,
            transferAmount,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            0,
            ownerPrivateKey
        );

        bool success = safe.execTransaction(
            recipient, transferAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
        assertTrue(success, "Safe execution must succeed in default mode");
        assertEq(address(safe).balance, 9 ether);
        assertEq(recipient.balance, 1 ether);
    }
}
