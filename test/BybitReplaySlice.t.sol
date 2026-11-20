// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import {Test, console} from "forge-std/Test.sol";
import {Safe} from "@safe-global/safe-smart-account/contracts/Safe.sol";
import {SafeProxy} from "@safe-global/safe-smart-account/contracts/proxies/SafeProxy.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/common/Enum.sol";
import {IntentLockGuard} from "../contracts/IntentLockGuard.sol";
import {IntentLockRegistry} from "../contracts/IntentLockRegistry.sol";
import {
    NoAttestation,
    UnsupportedOperation
} from "../contracts/IntentLockErrors.sol";

contract BybitReplaySliceTest is Test {
    // Real mainnet addresses from tx 0x46deef0f52e3a983b67abf4714448a41dd7ffd6d32d32da69d62081c68ad7882
    address internal constant REAL_BYBIT_SAFE = 0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4;
    address internal constant REAL_ATTACKER_CONTRACT = 0x96221423681A6d52E184D440a8eFCEbB105C7242;
    address internal constant REAL_MALICIOUS_IMPL = 0xbDd077f651EBe7f7b3cE16fe5F2b025BE2969516;
    address internal constant REAL_SENDER = 0x0fa09C3A328792253f8dee7116848723b72a6d2e;

    uint256 internal constant FORK_BLOCK = 21895237;

    bytes internal constant REAL_INNER_CALLDATA = hex"a9059cbb000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be29695160000000000000000000000000000000000000000000000000000000000000000";

    bytes internal constant REAL_RAW_TX_INPUT = hex"6a76120200000000000000000000000096221423681a6d52e184d440a8efcebb105c7242000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000b2b2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be296951600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c3d0afef78a52fd504479dc2af3dc401334762cbd05609c7ac18db9ec5abf4a07a5cc09fc86efd3489707b89b0c729faed616459189cb50084f208d03b201b001f1f0f62ad358d6b319d3c1221d44456080068fe02ae5b1a39b4afb1e6721ca7f9903ac523a801533f265231cd35fc2dfddc3bd9a9563b51315cf9d5ff23dc6d2c221fdf9e4b878877a8dbeee951a4a31ddbf1d3b71e127d5eda44b4730030114baba52e06dd23da37cd2a07a6e84f9950db867374a0f77558f42adf4409bfd569673c1f0000000000000000000000000000000000000000000000000000000000";

    uint256 internal forkId;

    Safe public ourSafe;
    Safe public ourMasterCopy;
    SafeProxy public ourProxy;
    IntentLockRegistry public ourRegistry;
    IntentLockGuard public ourGuard;

    uint256 internal ownerPrivateKey = 0xA11CE;
    address internal owner;
    address internal admin = address(0xAD);
    bytes32 internal dummyPolicyHash = keccak256("DUMMY_POLICY");

    bytes32 internal constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    function setUp() public {
        string memory rpcUrl = vm.envOr("MAINNET_RPC_URL", string("https://gateway.tenderly.co/public/mainnet"));
        forkId = vm.createSelectFork(rpcUrl, FORK_BLOCK);
        assertEq(block.number, FORK_BLOCK);

        // Ensure chainId
        // vm.chainId(31337);
        console.log("Fork chainid:", block.chainid);

        owner = vm.addr(ownerPrivateKey);

        // Deploy our Safe 1.4.1 on the fork
        ourMasterCopy = new Safe();
        ourProxy = new SafeProxy(address(ourMasterCopy));
        ourSafe = Safe(payable(address(ourProxy)));

        address[] memory owners = new address[](1);
        owners[0] = owner;
        ourSafe.setup(owners, 1, address(0), "", address(0), address(0), 0, payable(address(0)));
        vm.deal(address(ourSafe), 10 ether);

        // Deploy our Registry & Guard
        address[] memory verifiers = new address[](1);
        verifiers[0] = address(0x1111);
        ourRegistry = new IntentLockRegistry(admin, verifiers, 1, keccak256("V1"), dummyPolicyHash, address(0));
        ourGuard = new IntentLockGuard(address(ourSafe), address(ourRegistry), dummyPolicyHash);

        vm.prank(admin);
        ourRegistry.setGuard(address(ourGuard));
    }

    /// @notice Run A: Replay original Bybit execTransaction on the real Bybit Safe proxy on mainnet fork
    function test_R01_BybitRealSafeReplay() public {
        bytes32 slot0Before = vm.load(REAL_BYBIT_SAFE, bytes32(0));
        console.log("Run A: Real Bybit Safe slot 0 before:", vm.toString(slot0Before));

        // Confirm code is non-empty for attacker contract and malicious implementation
        assertTrue(REAL_ATTACKER_CONTRACT.code.length > 0, "Attacker contract code must exist");
        assertTrue(REAL_MALICIOUS_IMPL.code.length > 0, "Malicious implementation code must exist");

        // Fund original sender with local gas
        vm.deal(REAL_SENDER, 10 ether);

        // Send raw execTransaction input from original sender
        vm.prank(REAL_SENDER);
        (bool success, bytes memory returnData) = REAL_BYBIT_SAFE.call(REAL_RAW_TX_INPUT);

        bytes32 slot0After = vm.load(REAL_BYBIT_SAFE, bytes32(0));
        console.log("Run A: Real Bybit Safe execution success:", success);
        console.log("Run A: Real Bybit Safe returnData length:", returnData.length);
        if (returnData.length > 0) {
            console.log("Run A: returnData:", vm.toString(returnData));
        }
        console.log("Run A: Real Bybit Safe slot 0 after:", vm.toString(slot0After));

        // The transaction succeeded on mainnet
        assertTrue(success, "Replay of original transaction should execute");
        // Verify slot 0 changed
        assertFalse(slot0Before == slot0After, "Slot 0 must change upon exploit");
        console.log("Run A SUCCESS: Slot 0 hijacked from", vm.toString(slot0Before), "to", vm.toString(slot0After));
    }

    /// @notice Run B: Send identical payload shape to our Safe 1.4.1 (unguarded)
    function test_R02_OurSafeUnguardedReplay() public {
        bytes32 slot0Before = vm.load(address(ourSafe), bytes32(0));
        console.log("Run B: Our Safe 1.4.1 slot 0 before:", vm.toString(slot0Before));

        // Sign the exact attacker payload shape
        bytes32 safeTxHash = ourSafe.getTransactionHash(
            REAL_ATTACKER_CONTRACT,
            0,
            REAL_INNER_CALLDATA,
            Enum.Operation.DelegateCall,
            45746,
            0,
            0,
            address(0),
            payable(address(0)),
            ourSafe.nonce()
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, safeTxHash);
        bytes memory signatures = abi.encodePacked(r, s, v);

        // Execute UNGUARDED
        bool success = ourSafe.execTransaction(
            REAL_ATTACKER_CONTRACT,
            0,
            REAL_INNER_CALLDATA,
            Enum.Operation.DelegateCall,
            45746,
            0,
            0,
            address(0),
            payable(address(0)),
            signatures
        );

        bytes32 slot0After = vm.load(address(ourSafe), bytes32(0));
        console.log("Run B: Our Safe 1.4.1 execution success:", success);
        console.log("Run B: Our Safe 1.4.1 slot 0 after:", vm.toString(slot0After));

        // Report honestly
        if (slot0Before != slot0After) {
            console.log("Run B: Slot 0 changed from", vm.toString(slot0Before), "to", vm.toString(slot0After));
        } else {
            console.log("Run B: Slot 0 unchanged (Safe 1.4.1 memory layout differs from Safe 1.1.1 target)");
        }
    }

    /// @notice Run C: Send identical payload shape with IntentLock guard installed -> reverts UnsupportedOperation
    function test_R03_OurSafeWithGuardBlocks() public {
        // Install IntentLock guard
        vm.prank(address(ourSafe));
        ourSafe.setGuard(address(ourGuard));

        bytes32 slot0Before = vm.load(address(ourSafe), bytes32(0));
        console.log("Run C: Our Guarded Safe slot 0 before:", vm.toString(slot0Before));

        // Sign the exact attacker payload shape
        bytes32 safeTxHash = ourSafe.getTransactionHash(
            REAL_ATTACKER_CONTRACT,
            0,
            REAL_INNER_CALLDATA,
            Enum.Operation.DelegateCall,
            45746,
            0,
            0,
            address(0),
            payable(address(0)),
            ourSafe.nonce()
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, safeTxHash);
        bytes memory signatures = abi.encodePacked(r, s, v);

        // Expect revert UnsupportedOperation()
        vm.expectRevert(UnsupportedOperation.selector);
        ourSafe.execTransaction(
            REAL_ATTACKER_CONTRACT,
            0,
            REAL_INNER_CALLDATA,
            Enum.Operation.DelegateCall,
            45746,
            0,
            0,
            address(0),
            payable(address(0)),
            signatures
        );

        bytes32 slot0After = vm.load(address(ourSafe), bytes32(0));
        assertEq(slot0Before, slot0After, "Slot 0 must remain unchanged when blocked by guard");
        console.log("Run C SUCCESS: Blocked with UnsupportedOperation! Slot 0 preserved:", vm.toString(slot0After));
    }

    /// @notice Run R-A20: Plain CALL with no attestation on fork reverts NoAttestation
    function test_R04_NoAttestationOnFork() public {
        // Install IntentLock guard
        vm.prank(address(ourSafe));
        ourSafe.setGuard(address(ourGuard));

        // Sign a regular CALL to a recipient without submitting any attestation
        address recipient = address(0x9999);
        bytes32 safeTxHash = ourSafe.getTransactionHash(
            recipient,
            1 ether,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            ourSafe.nonce()
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, safeTxHash);
        bytes memory signatures = abi.encodePacked(r, s, v);

        // Expect revert NoAttestation()
        vm.expectRevert(NoAttestation.selector);
        ourSafe.execTransaction(
            recipient,
            1 ether,
            "",
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            signatures
        );
        console.log("Run R-A20 SUCCESS: Reverted with NoAttestation as expected");
    }
}
