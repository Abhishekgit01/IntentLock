// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {Safe} from "@safe-global/safe-smart-account/contracts/Safe.sol";
import {SafeProxyFactory} from "@safe-global/safe-smart-account/contracts/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "@safe-global/safe-smart-account/contracts/proxies/SafeProxy.sol";
import {Enum} from "@safe-global/safe-smart-account/contracts/common/Enum.sol";
import {IntentLockGuard} from "../contracts/IntentLockGuard.sol";
import {IntentLockRegistry} from "../contracts/IntentLockRegistry.sol";

/// @notice Deterministic local-only Safe + IntentLock deployment for Anvil chain 31337.
/// @dev The fixed keys below are disposable development keys and are rejected on every other chain.
contract DeployLocal is Script {
    struct DeploymentAddresses {
        address singleton;
        address factory;
        address safe;
        address registry;
        address guard;
        address safeOwner;
        address[] verifiers;
    }

    uint256 private constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 private constant OWNER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 private constant VERIFIER_1_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 private constant VERIFIER_2_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 private constant VERIFIER_3_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    bytes32 private constant VERIFIER_SET_ID = keccak256("INTENTLOCK_LOCAL_VERIFIERS_V1");
    bytes32 private constant POLICY_HASH = keccak256("INTENTLOCK_LOCAL_POLICY_V1");
    string private constant SAFE_SOURCE_COMMIT = "bf943f80fec5ac647159d26161446ac5d716a294";

    function run() external {
        require(block.chainid == 31337, "DeployLocal only supports Anvil chain 31337");
        _writeManifest(_deploy());
    }

    function _deploy() private returns (DeploymentAddresses memory deployed) {
        address deployer = vm.addr(DEPLOYER_KEY);
        deployed.safeOwner = vm.addr(OWNER_KEY);
        deployed.verifiers = new address[](3);
        deployed.verifiers[0] = vm.addr(VERIFIER_1_KEY);
        deployed.verifiers[1] = vm.addr(VERIFIER_2_KEY);
        deployed.verifiers[2] = vm.addr(VERIFIER_3_KEY);

        vm.startBroadcast(DEPLOYER_KEY);
        Safe singleton = new Safe();
        deployed.singleton = address(singleton);
        SafeProxyFactory factory = new SafeProxyFactory();
        deployed.factory = address(factory);

        address[] memory owners = new address[](1);
        owners[0] = deployed.safeOwner;
        bytes memory initializer = abi.encodeCall(
            Safe.setup, (owners, 1, address(0), bytes(""), address(0), address(0), 0, payable(address(0)))
        );
        SafeProxy proxy = factory.createProxyWithNonce(address(singleton), initializer, 1);
        Safe safe = Safe(payable(address(proxy)));
        deployed.safe = address(safe);

        IntentLockRegistry registry =
            new IntentLockRegistry(deployer, deployed.verifiers, 2, VERIFIER_SET_ID, POLICY_HASH, address(0));
        deployed.registry = address(registry);
        IntentLockGuard guard = new IntentLockGuard(address(safe), address(registry), POLICY_HASH);
        deployed.guard = address(guard);
        registry.setGuard(address(guard));

        bytes memory setGuardData = abi.encodeWithSignature("setGuard(address)", address(guard));
        bytes32 safeTxHash = safe.getTransactionHash(
            address(safe), 0, setGuardData, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), safe.nonce()
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, safeTxHash);
        bytes memory ownerSignature = abi.encodePacked(r, s, v);
        require(
            safe.execTransaction(
                address(safe),
                0,
                setGuardData,
                Enum.Operation.Call,
                0,
                0,
                0,
                address(0),
                payable(address(0)),
                ownerSignature
            ),
            "Safe guard setup failed"
        );
        (address[] memory enabledModules,) = safe.getModulesPaginated(address(0x1), 10);
        require(enabledModules.length == 0, "Safe module set must start empty");
        vm.stopBroadcast();
    }

    function _writeManifest(DeploymentAddresses memory deployed) private {
        string memory json = vm.serializeUint("deployment", "chainId", block.chainid);
        json = vm.serializeString("deployment", "safeVersion", "1.4.1");
        json = vm.serializeString("deployment", "safeResolvedCommit", SAFE_SOURCE_COMMIT);
        json = vm.serializeAddress("deployment", "safeSingleton", deployed.singleton);
        json = vm.serializeBytes32("deployment", "safeSingletonCodeHash", deployed.singleton.codehash);
        json = vm.serializeAddress("deployment", "safeProxyFactory", deployed.factory);
        json = vm.serializeAddress("deployment", "safe", deployed.safe);
        json = vm.serializeBytes32("deployment", "safeCodeHash", deployed.safe.codehash);
        json = vm.serializeUint("deployment", "safeNonce", Safe(payable(deployed.safe)).nonce());
        json = vm.serializeBool("deployment", "safeModulesEmpty", true);
        json = vm.serializeAddress("deployment", "registry", deployed.registry);
        json = vm.serializeBytes32("deployment", "registryCodeHash", deployed.registry.codehash);
        json = vm.serializeAddress("deployment", "guard", deployed.guard);
        json = vm.serializeBytes32("deployment", "guardCodeHash", deployed.guard.codehash);
        json = vm.serializeAddress("deployment", "safeOwner", deployed.safeOwner);
        json = vm.serializeBytes32("deployment", "verifierSetId", VERIFIER_SET_ID);
        json = vm.serializeAddress("deployment", "verifiers", deployed.verifiers);
        json = vm.serializeUint("deployment", "verifierThreshold", 2);
        json = vm.serializeBytes32("deployment", "policyHash", POLICY_HASH);
        vm.writeJson(json, "deployments/anvil-31337.json");
    }
}
