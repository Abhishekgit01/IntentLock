// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Safe} from "@safe-global/safe-smart-account/contracts/Safe.sol";
import {SafeProxy} from "@safe-global/safe-smart-account/contracts/proxies/SafeProxy.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/common/Enum.sol";
import {IntentLockGuard} from "../contracts/IntentLockGuard.sol";
import {IntentLockRegistry} from "../contracts/IntentLockRegistry.sol";
import {IntentAttestation} from "../contracts/IntentLockTypes.sol";
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
    OnlyGuard
} from "../contracts/IntentLockErrors.sol";

contract MaliciousDelegateTarget {
    uint256 public attacked;

    function attack() external payable {
        attacked = 1;
        if (address(this).balance > 0) {
            payable(msg.sender).transfer(address(this).balance);
        }
    }
}

contract RevertingContractTarget {
    fallback() external payable {
        revert("TargetReverted");
    }
}

contract IntentLockSliceTest is Test {
    Safe public safe;
    Safe public safeMasterCopy;
    SafeProxy public safeProxy;

    IntentLockRegistry public registry;
    IntentLockGuard public guard;

    uint256 internal ownerPrivateKey = 0xA11CE;
    address internal owner;

    uint256 internal verifierKey1 = 0xB0B1;
    uint256 internal verifierKey2 = 0xB0B2;
    uint256 internal verifierKey3 = 0xB0B3;

    address internal verifier1;
    address internal verifier2;
    address internal verifier3;

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

        // 3. Deploy IntentLockGuard
        guard = new IntentLockGuard(address(safe), address(registry), policyHash);

        // 4. Configure guard on registry and Safe
        vm.prank(admin);
        registry.setGuard(address(guard));

        vm.prank(address(safe));
        safe.setGuard(address(guard));

        assertEq(address(uint160(uint256(vm.load(address(safe), GUARD_STORAGE_SLOT)))), address(guard));
    }

    // ==========================================
    // Helper Functions
    // ==========================================

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
    // Core Slice Tests: B01, A01, A20
    // ==========================================

    /// @notice B01: Allowlisted native transfer under cap with 2-of-3 attestations executes
    function test_B01_AllowlistedNativeTransferExecutes() public {
        uint256 transferAmount = 1 ether;
        uint256 initialSafeBalance = address(safe).balance;
        uint256 initialRecipientBalance = recipient.balance;
        uint256 initialNonce = safe.nonce();

        assertEq(initialNonce, 0);

        // 1. Prepare valid attestation for native transfer at nonce 0
        IntentAttestation memory attestation = _createValidAttestation(recipient, transferAmount, 0);

        // 2. Obtain 2 valid verifier signatures (verifier1 and verifier2)
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);

        // 3. Submit attestation to registry
        registry.submitAttestation(attestation, verifierSigs);

        // 4. Safe owner signs the transaction
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

        // 5. Execute transaction through Safe
        bool success = safe.execTransaction(
            recipient, transferAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );

        // Assertions for B01
        assertTrue(success, "Safe execution must succeed");
        assertEq(address(safe).balance, initialSafeBalance - transferAmount, "Safe balance must decrease by 1 ETH");
        assertEq(
            recipient.balance, initialRecipientBalance + transferAmount, "Recipient balance must increase by 1 ETH"
        );
        assertEq(safe.nonce(), initialNonce + 1, "Safe nonce must advance once to 1");

        // Attestation in registry is marked consumed
        (,, bool consumed) = registry.getAttestation(address(safe), 0);
        assertTrue(consumed, "Registry record must be atomically consumed");
    }

    /// @notice A01: DELEGATECALL is unconditionally rejected before registry lookup with unchanged state
    function test_A01_DelegatecallAlwaysReverts() public {
        MaliciousDelegateTarget target = new MaliciousDelegateTarget();
        bytes memory attackData = abi.encodeWithSelector(target.attack.selector);

        uint256 initialSafeBalance = address(safe).balance;
        uint256 initialNonce = safe.nonce();
        address initialGuard = address(uint160(uint256(vm.load(address(safe), GUARD_STORAGE_SLOT))));

        // Attempt 1: Without attestation
        (, bytes memory ownerSig1) = _signSafeTx(
            safe,
            address(target),
            0,
            attackData,
            Enum.Operation.DelegateCall,
            0,
            0,
            0,
            address(0),
            address(0),
            initialNonce,
            ownerPrivateKey
        );

        vm.expectCall(
            address(registry), abi.encodeWithSelector(registry.getAttestation.selector, address(safe), initialNonce), 0
        );
        vm.expectRevert(UnsupportedOperation.selector);
        safe.execTransaction(
            address(target),
            0,
            attackData,
            Enum.Operation.DelegateCall,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            ownerSig1
        );

        // State integrity assertions
        assertEq(address(safe).balance, initialSafeBalance, "Safe balance must remain unchanged");
        assertEq(safe.nonce(), initialNonce, "Safe nonce must remain unchanged");
        assertEq(target.attacked(), 0, "Malicious contract must not have executed");
        assertEq(
            address(uint160(uint256(vm.load(address(safe), GUARD_STORAGE_SLOT)))),
            initialGuard,
            "Guard slot must remain intact"
        );

        assertEq(address(safe).balance, initialSafeBalance, "Safe balance unchanged");
        assertEq(safe.nonce(), initialNonce, "Safe nonce unchanged");
        assertEq(target.attacked(), 0, "Target state unchanged");
    }

    /// @notice A01 baseline: without the guard, the same DELEGATECALL corrupts proxy slot 0 and drains its ETH.
    function test_A01_UnguardedDelegatecallCorruptsAndDrainsSafe() public {
        Safe unguardedSingleton = new Safe();
        SafeProxy unguardedProxy = new SafeProxy(address(unguardedSingleton));
        Safe unguardedSafe = Safe(payable(address(unguardedProxy)));
        address[] memory unguardedOwners = new address[](1);
        unguardedOwners[0] = owner;
        unguardedSafe.setup(unguardedOwners, 1, address(0), "", address(0), address(0), 0, payable(address(0)));

        MaliciousDelegateTarget target = new MaliciousDelegateTarget();
        bytes memory attackData = abi.encodeWithSelector(target.attack.selector);
        uint256 startingBalance = 3 ether;
        vm.deal(address(unguardedSafe), startingBalance);
        bytes32 slotZeroBefore = vm.load(address(unguardedSafe), bytes32(0));
        uint256 callerBalanceBefore = address(this).balance;

        (, bytes memory ownerSignature) = _signSafeTx(
            unguardedSafe,
            address(target),
            0,
            attackData,
            Enum.Operation.DelegateCall,
            0,
            0,
            0,
            address(0),
            address(0),
            0,
            ownerPrivateKey
        );

        bool success = unguardedSafe.execTransaction(
            address(target),
            0,
            attackData,
            Enum.Operation.DelegateCall,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            ownerSignature
        );

        assertTrue(success, "unguarded baseline transaction executes");
        assertEq(uint256(vm.load(address(unguardedSafe), bytes32(0))), 1, "proxy singleton slot was overwritten");
        assertTrue(slotZeroBefore != vm.load(address(unguardedSafe), bytes32(0)), "proxy slot 0 changed");
        assertEq(address(unguardedSafe).balance, 0, "Safe balance was drained");
        assertEq(
            address(this).balance,
            callerBalanceBefore + startingBalance,
            "delegatecall sent ETH to Safe transaction caller"
        );
    }

    /// @notice A20: Supported CALL with zero verifier attestations reverts with NoAttestation and leaves state unchanged
    function test_A20_NoAttestationFailsClosed() public {
        uint256 transferAmount = 1 ether;
        uint256 initialSafeBalance = address(safe).balance;
        uint256 initialRecipientBalance = recipient.balance;
        uint256 initialNonce = safe.nonce();

        // Safe owner signs a supported CALL
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
            initialNonce,
            ownerPrivateKey
        );

        // No attestation submitted to registry for this safe and nonce
        vm.expectRevert(NoAttestation.selector);
        safe.execTransaction(
            recipient, transferAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );

        // State integrity assertions for A20
        assertEq(address(safe).balance, initialSafeBalance, "Safe balance must remain unchanged");
        assertEq(recipient.balance, initialRecipientBalance, "Recipient balance must remain unchanged");
        assertEq(safe.nonce(), initialNonce, "Safe nonce must remain unchanged");
    }

    // ==========================================
    // Threshold & Verifier Tests: B06, A15, A16
    // ==========================================

    /// @notice B06: Threshold met with two distinct configured verifier signatures (2 and 3)
    function test_B06_TwoOfThreeThresholdSucceeds() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 0.5 ether, 0);

        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey2, attestation);
        verifierSigs[1] = _signAttestation(verifierKey3, attestation);

        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe, recipient, 0.5 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        bool success = safe.execTransaction(
            recipient, 0.5 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
        assertTrue(success, "2-of-3 threshold using verifiers 2 and 3 must succeed");
    }

    /// @notice A16: Duplicate signature from the same verifier cannot satisfy threshold
    function test_A16_DuplicateVerifierSignatureFails() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 0.5 ether, 0);

        bytes memory sig1 = _signAttestation(verifierKey1, attestation);

        // Pass verifier 1 signature twice
        bytes[] memory duplicateSigs = new bytes[](2);
        duplicateSigs[0] = sig1;
        duplicateSigs[1] = sig1;

        vm.expectRevert(ThresholdNotMet.selector);
        registry.submitAttestation(attestation, duplicateSigs);
    }

    /// @notice A15: Only one verifier signature cannot satisfy threshold of 2
    function test_A15_SingleVerifierSignatureFails() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 0.5 ether, 0);

        bytes[] memory singleSig = new bytes[](1);
        singleSig[0] = _signAttestation(verifierKey1, attestation);

        vm.expectRevert(ThresholdNotMet.selector);
        registry.submitAttestation(attestation, singleSig);
    }

    // ==========================================
    // Adversarial Binding & Replay Tests
    // ==========================================

    /// @notice A08: Attestation for Safe A cannot be used for Safe B
    function test_A08_WrongSafeFailsClosed() public {
        // Deploy Safe B
        SafeProxy proxyB = new SafeProxy(address(safeMasterCopy));
        Safe safeB = Safe(payable(address(proxyB)));
        address[] memory ownersB = new address[](1);
        ownersB[0] = owner;
        safeB.setup(ownersB, 1, address(0), "", address(0), address(0), 0, payable(address(0)));
        vm.deal(address(safeB), 5 ether);

        // Attestation signed for Safe A
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        // Configure guard on Safe B
        vm.prank(address(safeB));
        safeB.setGuard(address(guard));

        (, bytes memory ownerSigB) = _signSafeTx(
            safeB, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        // Safe B calling Guard configured for Safe A reverts WrongSafe
        vm.expectRevert(WrongSafe.selector);
        safeB.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSigB
        );
    }

    /// @notice A09: Wrong chain execution fails closed
    function test_A09_WrongChainFailsClosed() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);

        // Case 1: Submitting attestation on a different chain ID reverts WrongChain
        vm.chainId(999);
        vm.expectRevert(WrongChain.selector);
        registry.submitAttestation(attestation, verifierSigs);

        // Switch back to submit valid attestation on original chain
        vm.chainId(31337);
        registry.submitAttestation(attestation, verifierSigs);

        // Case 2: Attempting execution on a different chain ID (where owner signs on chain 999)
        vm.chainId(999);
        (, bytes memory ownerSig999) = _signSafeTx(
            safe, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        // Guard rejects with WrongChain
        vm.expectRevert(WrongChain.selector);
        safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig999
        );
    }

    /// @notice Wrong nonce fails closed
    function test_WrongNonceFailsClosed() public {
        // Safe is at nonce 0, but attestation is prepared for nonce 1
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 1);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        // Safe at nonce 0 derives safeNonce = 0; registry has record at nonce 1, not 0
        vm.expectRevert(NoAttestation.selector);
        safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
    }

    /// @notice A03: Destination address mutated by 1 bit reverts DigestMismatch
    function test_A03_DestinationDigestMismatch() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        // Mutate destination address by 1 bit
        address mutatedRecipient = address(uint160(recipient) ^ 1);

        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            mutatedRecipient,
            1 ether,
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

        vm.expectRevert(DigestMismatch.selector);
        safe.execTransaction(
            mutatedRecipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
    }

    /// @notice A04: Value mutated after signing reverts DigestMismatch
    function test_A04_ValueDigestMismatch() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        // Mutate value to 2 ether
        (, bytes memory ownerSig) = _signSafeTx(
            safe, recipient, 2 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        vm.expectRevert(DigestMismatch.selector);
        safe.execTransaction(
            recipient, 2 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
    }

    /// @notice A05: Calldata mutated after signing reverts DigestMismatch
    function test_A05_CalldataDigestMismatch() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        // Mutate calldata from empty to 0x01
        bytes memory mutatedData = hex"01";

        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            recipient,
            1 ether,
            mutatedData,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            0,
            ownerPrivateKey
        );

        vm.expectRevert(DigestMismatch.selector);
        safe.execTransaction(
            recipient, 1 ether, mutatedData, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
    }

    /// @notice A13: Expired verifier signatures fail closed
    function test_A13_ExpiredAttestationFailsClosed() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        attestation.validUntil = uint64(block.timestamp + 100);

        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        // Advance time past expiry
        vm.warp(block.timestamp + 101);

        vm.expectRevert(Expired.selector);
        safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
    }

    /// @notice Attestation with wrong verifier set fails closed
    function test_Adversarial_WrongVerifierSetFailsClosed() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        attestation.verifierSetId = keccak256("DIFFERENT_VERIFIER_SET");

        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);

        // Submission with wrong verifierSetId reverts PolicyDenied
        vm.expectRevert(PolicyDenied.selector);
        registry.submitAttestation(attestation, verifierSigs);
    }

    /// @notice Attestation with wrong policy hash fails closed
    function test_Adversarial_WrongPolicyHashFailsClosed() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        attestation.policyHash = keccak256("WRONG_POLICY_HASH");

        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);

        // Submission with wrong policyHash reverts PolicyDenied
        vm.expectRevert(PolicyDenied.selector);
        registry.submitAttestation(attestation, verifierSigs);
    }

    /// @notice Target code hash mismatch: direct native transfer target cannot have runtime code
    function test_Adversarial_TargetCodeHashMismatch() public {
        RevertingContractTarget contractTarget = new RevertingContractTarget();
        uint256 safeNonce = safe.nonce();

        bytes32 safeTxHash = safe.getTransactionHash(
            address(contractTarget), 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), safeNonce
        );

        IntentAttestation memory attestation = IntentAttestation({
            safe: address(safe),
            safeNonce: safeNonce,
            safeTxHash: safeTxHash,
            intentHash: keccak256("CANONICAL_INTENT"),
            intentSchemaVersion: 1,
            policyClass: 1,
            targetCodeHash: bytes32(0),
            resolvedImplementation: address(0),
            implementationCodeHash: bytes32(0),
            policyHash: policyHash,
            verifierSetId: verifierSetId,
            issuedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 1 hours),
            proposalId: keccak256("PROPOSAL_CONTRACT_TARGET")
        });

        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            address(contractTarget),
            1 ether,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            safeNonce,
            ownerPrivateKey
        );

        // Target has runtime code, so guard must revert TargetCodeHashMismatch
        vm.expectRevert(TargetCodeHashMismatch.selector);
        safe.execTransaction(
            address(contractTarget),
            1 ether,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            ownerSig
        );
    }

    /// @notice H11: Third-party caller cannot consume an attestation
    function test_H11_ThirdPartyCannotConsume() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(OnlyGuard.selector);
        registry.consume(address(safe), 0, attestation.safeTxHash);

        // Attestation remains unconsumed and usable by the guard
        (,, bool consumed) = registry.getAttestation(address(safe), 0);
        assertFalse(consumed, "Attestation must not be consumed by third party");
    }

    /// @notice A19: Consumed attestation cannot execute twice
    function test_A19_ConsumedAttestationCannotExecuteTwice() public {
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        // First execution succeeds
        bool success = safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
        assertTrue(success);
        assertEq(safe.nonce(), 1);

        // Direct attempt to re-consume slot 0 reverts AlreadyConsumed
        vm.prank(address(guard));
        vm.expectRevert(AlreadyConsumed.selector);
        registry.consume(address(safe), 0, attestation.safeTxHash);

        // Attempting to execute again at new nonce 1 with old attestation reverts NoAttestation
        (, bytes memory ownerSig2) = _signSafeTx(
            safe, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 1, ownerPrivateKey
        );

        vm.expectRevert(NoAttestation.selector);
        safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig2
        );
    }

    /// @notice Reverted Safe attempt does not leave the attestation consumed
    function test_Adversarial_RevertedSafeAttemptDoesNotLeaveAttestationConsumed() public {
        // Safe only has 10 ETH. Try to transfer 20 ETH.
        uint256 excessiveAmount = 20 ether;
        IntentAttestation memory attestation = _createValidAttestation(recipient, excessiveAmount, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            recipient,
            excessiveAmount,
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

        // Safe execution reverts with Safe error GS013 because internal transfer fails
        vm.expectRevert("GS013");
        safe.execTransaction(
            recipient, excessiveAmount, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );

        // Due to EVM transaction atomicity, registry consumption was rolled back
        (,, bool consumed) = registry.getAttestation(address(safe), 0);
        assertFalse(consumed, "Reverted attempt must not leave attestation consumed");
    }

    /// @notice Proves Safe nonce handling matches pinned v1.4.1 hook ordering
    function test_Adversarial_SafeNonceOrderingMatchesV141() public {
        assertEq(safe.nonce(), 0, "Safe nonce starts at 0");

        // The signed transaction uses nonce 0
        IntentAttestation memory attestation = _createValidAttestation(recipient, 1 ether, 0);
        bytes[] memory verifierSigs = new bytes[](2);
        verifierSigs[0] = _signAttestation(verifierKey1, attestation);
        verifierSigs[1] = _signAttestation(verifierKey2, attestation);
        registry.submitAttestation(attestation, verifierSigs);

        (, bytes memory ownerSig) = _signSafeTx(
            safe, recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), address(0), 0, ownerPrivateKey
        );

        // During checkTransaction hook inside execTransaction, safe.nonce() is 1,
        // guard derives safeNonce = 1 - 1 = 0, matching the attestation.
        bool success = safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );
        assertTrue(success);
        assertEq(safe.nonce(), 1, "After execution, Safe nonce is 1");
    }

    /// @notice State unchanged in failures across all monitored storage
    function test_Adversarial_StateUnchangedInFailures() public {
        uint256 initialSafeBalance = address(safe).balance;
        uint256 initialRecipientBalance = recipient.balance;
        uint256 initialNonce = safe.nonce();
        address initialGuard = address(uint160(uint256(vm.load(address(safe), GUARD_STORAGE_SLOT))));

        // 1. A01 failure
        MaliciousDelegateTarget target = new MaliciousDelegateTarget();
        (, bytes memory ownerSig) = _signSafeTx(
            safe,
            address(target),
            0,
            "",
            Enum.Operation.DelegateCall,
            0,
            0,
            0,
            address(0),
            address(0),
            initialNonce,
            ownerPrivateKey
        );
        vm.expectRevert(UnsupportedOperation.selector);
        safe.execTransaction(
            address(target), 0, "", Enum.Operation.DelegateCall, 0, 0, 0, address(0), payable(address(0)), ownerSig
        );

        assertEq(address(safe).balance, initialSafeBalance);
        assertEq(recipient.balance, initialRecipientBalance);
        assertEq(safe.nonce(), initialNonce);
        assertEq(address(uint160(uint256(vm.load(address(safe), GUARD_STORAGE_SLOT)))), initialGuard);

        // 2. A20 failure
        (, bytes memory ownerSig2) = _signSafeTx(
            safe,
            recipient,
            1 ether,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            initialNonce,
            ownerPrivateKey
        );
        vm.expectRevert(NoAttestation.selector);
        safe.execTransaction(
            recipient, 1 ether, "", Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), ownerSig2
        );

        assertEq(address(safe).balance, initialSafeBalance);
        assertEq(recipient.balance, initialRecipientBalance);
        assertEq(safe.nonce(), initialNonce);
        assertEq(address(uint160(uint256(vm.load(address(safe), GUARD_STORAGE_SLOT)))), initialGuard);
    }
}
