import type { Fixture } from "./fixtureTypes";

/**
 * 42 fixtures compiled from docs/fixtures/catalog.json.
 * Verified against local Anvil chain 31337 and Foundry test suite.
 * Every count shown in the UI is computed from this array.
 */
export const FIXTURES: Fixture[] = [
  {
    "id": "B01",
    "critical": true,
    "category": "benign",
    "kind": "benign",
    "title": "Allowlisted native transfer under cap",
    "setup": "Fund the Safe and allowlisted recipient with deterministic local balances; configure cap above transfer amount.",
    "action": "Submit CALL with empty calldata and exact native amount to the allowlisted recipient; provide 2-of-3 attestations and Safe threshold.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "receipt succeeds",
      "Safe balance decreases by exact amount plus any configured gas payment",
      "recipient balance increases by exact transfer amount",
      "Safe nonce advances once"
    ]
  },
  {
    "id": "B03",
    "critical": true,
    "category": "benign",
    "kind": "benign",
    "title": "Allowlisted ERC-20 transfer",
    "setup": "Deploy pinned demo token with known code hash and fund Safe; allowlist token and recipient.",
    "action": "Submit ERC-20 transfer(address,uint256) with threshold attestations.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "token and recipient match canonical intent",
      "token balance delta matches base-unit amount",
      "target code hash matches attestation"
    ]
  },
  {
    "id": "B04",
    "critical": false,
    "category": "benign",
    "kind": "benign",
    "title": "Bounded token approval",
    "setup": "Allowlist token and spender; amount is finite and within configured limit.",
    "action": "Submit approve(spender,amount) with exact intent and threshold.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "spender and amount are explicit",
      "allowance equals exact bound",
      "unlimited approval is not inferred"
    ]
  },
  {
    "id": "B06",
    "critical": true,
    "category": "benign",
    "kind": "benign",
    "title": "Exact 2-of-3 verifier threshold",
    "setup": "Configure three active verifier addresses and threshold two; Safe owner threshold is met.",
    "action": "Submit two distinct valid signatures over the same scoped attestation, then execute a valid transfer.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "two unique active verifiers count",
      "third signature is not required",
      "attestation fields and digest match execution"
    ]
  },
  {
    "id": "A01",
    "critical": true,
    "category": "deception",
    "kind": "attack",
    "title": "Misleading label over delegatecall payload",
    "setup": "Fixture metadata claims ordinary native transfer; actual Safe operation is DELEGATECALL to local malicious fixture.",
    "action": "Attempt execution with or without verifier signatures.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "UnsupportedOperation",
    "assertions": [
      "unconditional operation rule rejects before registry lookup",
      "vault, guard, owner, module, and implementation state unchanged",
      "label is treated as untrusted metadata"
    ]
  },
  {
    "id": "A02",
    "critical": true,
    "category": "deception",
    "kind": "attack",
    "title": "Proposal label conflicts with raw CALL semantics",
    "setup": "Display metadata claims an allowlisted transfer; raw supported CALL decodes to a different, non-allowlisted recipient.",
    "action": "Independent verifier reads raw fields and evaluates policy; do not sign based on label.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "REJECTED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "UI label is not part of or authority for the digest",
      "verifier refusal yields no signature",
      "no Safe execution is submitted after the policy refusal"
    ]
  },
  {
    "id": "A03",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Destination mutated after signing",
    "setup": "Create valid attestation for transaction target A.",
    "action": "Submit execution fields with target address changed by one bit.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "DigestMismatch",
    "assertions": [
      "recomputed Safe digest differs",
      "registry lookup does not authorize altered digest",
      "no target side effect occurs"
    ]
  },
  {
    "id": "A04",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Value mutated after signing",
    "setup": "Create valid attestation for exact native value.",
    "action": "Change value while keeping all other fields unchanged.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "DigestMismatch",
    "assertions": [
      "recomputed digest differs",
      "no value is transferred"
    ]
  },
  {
    "id": "A05",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Calldata mutated after signing",
    "setup": "Create valid attestation over supported method calldata.",
    "action": "Change one calldata byte before Safe execution.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "DigestMismatch",
    "assertions": [
      "recomputed digest differs",
      "no contract state changes"
    ]
  },
  {
    "id": "A06",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Operation changed from CALL to DELEGATECALL",
    "setup": "Create CALL attestation for a supported transaction.",
    "action": "Attempt execution with operation set to DELEGATECALL.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "UnsupportedOperation",
    "assertions": [
      "proposal policy permits the original CALL; the attempted DELEGATECALL variant is rejected by the unconditional guard rule",
      "the changed operation also changes the Safe digest"
    ]
  },
  {
    "id": "A07",
    "critical": true,
    "category": "attestation",
    "kind": "benign",
    "title": "Pre-increment nonce binding",
    "setup": "Safe nonce is N; sign valid transaction digest using N.",
    "action": "At the guard hook, read Safe nonce N+1 and derive signed nonce as currentNonce minus one.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "computed digest uses N",
      "guard hook observes N+1 on Safe v1.4.1",
      "using live N+1 as digest nonce fails the paired negative assertion"
    ]
  },
  {
    "id": "A08",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Wrong Safe replay",
    "setup": "Create valid attestation for Safe A and configure Safe B with same owners/nonce.",
    "action": "Attempt use of Safe A attestation on Safe B.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "WrongSafe",
    "assertions": [
      "Safe address and domain mismatch",
      "Safe B has no side effect"
    ]
  },
  {
    "id": "A09",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Wrong chain replay",
    "setup": "Create valid attestation on configured Anvil chain ID.",
    "action": "Verify or execute against a different chain ID/domain.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "WrongChain",
    "assertions": [
      "chain ID domain mismatch",
      "signature does not count"
    ]
  },
  {
    "id": "A13",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Expired verifier signatures",
    "setup": "Create valid attestation with short validUntil and advance timestamp past expiry.",
    "action": "Submit Safe execution after expiration.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "Expired",
    "assertions": [
      "registry rejects expired record",
      "no state side effect"
    ]
  },
  {
    "id": "A15",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Only one verifier signature",
    "setup": "Threshold is 2-of-3; submit one valid active signer.",
    "action": "Attempt execution.",
    "decision": "ATTEST",
    "workflowStatus": "AWAITING_THRESHOLD",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "policy permits the action but quorum is not met",
      "Safe execution is not submitted while verifier quorum is below threshold",
      "UI does not show approved"
    ]
  },
  {
    "id": "A16",
    "critical": true,
    "category": "attestation",
    "kind": "attack",
    "title": "Duplicate signer cannot satisfy threshold",
    "setup": "Threshold is 2-of-3; prepare duplicate copies of one signer's signature.",
    "action": "Submit duplicate copies as separate signature records.",
    "decision": "ATTEST",
    "workflowStatus": "AWAITING_THRESHOLD",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "signer counts once",
      "quorum remains unmet",
      "Safe execution is not submitted because duplicate signer records do not reach threshold"
    ]
  },
  {
    "id": "A19",
    "critical": true,
    "category": "replay",
    "kind": "attack",
    "title": "Consumed digest replay",
    "setup": "Execute a transaction using a valid attestation, then retain the record/signatures.",
    "action": "Attempt to reuse the same proposal/digest after successful execution.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "NoAttestation",
    "assertions": [
      "consumed record cannot authorize a second execution",
      "nonce/digest scope prevents replay",
      "nonce advancement makes the old digest unavailable at the next Safe nonce"
    ]
  },
  {
    "id": "D01",
    "critical": true,
    "category": "decoder",
    "kind": "unknown",
    "title": "Unknown selector",
    "setup": "Target a contract with unknown selector and no approved decoder mapping.",
    "action": "Run independent decoder and proposal flow.",
    "decision": "REFUSE_UNSUPPORTED",
    "workflowStatus": "QUARANTINED",
    "executionSucceeds": false,
    "outcome": "QUARANTINED",
    "expectedRevertProposed": null,
    "assertions": [
      "no attestation is emitted",
      "workflow is quarantined, not policy-rejected",
      "no execution is attempted"
    ]
  },
  {
    "id": "D02",
    "critical": true,
    "category": "decoder",
    "kind": "unknown",
    "title": "Malformed short calldata",
    "setup": "Use calldata shorter than required selector/arguments for a known ABI.",
    "action": "Decode and submit proposal.",
    "decision": "REFUSE_UNSUPPORTED",
    "workflowStatus": "QUARANTINED",
    "executionSucceeds": false,
    "outcome": "QUARANTINED",
    "expectedRevertProposed": null,
    "assertions": [
      "decoder reports invalid/unsupported safely",
      "no panic, signature, or execution"
    ]
  },
  {
    "id": "D03",
    "critical": false,
    "category": "decoder",
    "kind": "unknown",
    "title": "Trailing ambiguous calldata bytes",
    "setup": "Use known selector with unsupported trailing bytes or ambiguous ABI encoding.",
    "action": "Run decoder.",
    "decision": "REFUSE_UNSUPPORTED",
    "workflowStatus": "QUARANTINED",
    "executionSucceeds": false,
    "outcome": "QUARANTINED",
    "expectedRevertProposed": null,
    "assertions": [
      "no normalization silently drops bytes",
      "no attestation is emitted"
    ]
  },
  {
    "id": "D04",
    "critical": false,
    "category": "decoder",
    "kind": "unknown",
    "title": "Contract interaction target has no code",
    "setup": "Point a contract-method interaction at an address with empty runtime code; do not use native transfer mode.",
    "action": "Attempt decode and verifier flow.",
    "decision": "REFUSE_UNSUPPORTED",
    "workflowStatus": "QUARANTINED",
    "executionSucceeds": false,
    "outcome": "QUARANTINED",
    "expectedRevertProposed": null,
    "assertions": [
      "contract-call code requirement fails closed",
      "zero code hash for EOA is not confused with native transfer"
    ]
  },
  {
    "id": "D05",
    "critical": false,
    "category": "decoder",
    "kind": "attack",
    "title": "Proxy implementation changes after review",
    "setup": "Deploy supported proxy with resolver; attest implementation A address/code hash.",
    "action": "Change proxy implementation to B while proxy runtime code hash remains stable, then execute old attestation.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "ImplementationMismatch",
    "assertions": [
      "proxy-specific on-chain resolver sees live B",
      "implementation address or code hash mismatch rejects",
      "to.codehash alone would not pass this fixture"
    ]
  },
  {
    "id": "P01",
    "critical": true,
    "category": "policy",
    "kind": "attack",
    "title": "Unlimited ERC-20 approval",
    "setup": "Decode approve(spender,uint256.max) for known token.",
    "action": "Request verifier attestation.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "REJECTED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "unlimited allowance is not ordinary transfer",
      "no verifier signature is produced"
    ]
  },
  {
    "id": "P02",
    "critical": false,
    "category": "policy",
    "kind": "attack",
    "title": "NFT operator approval",
    "setup": "Decode setApprovalForAll(operator,true) for known NFT contract.",
    "action": "Request verifier attestation.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "REJECTED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "known high-risk policy is refused",
      "no attestation is produced"
    ]
  },
  {
    "id": "P03",
    "critical": false,
    "category": "policy",
    "kind": "attack",
    "title": "Transfer to non-allowlisted recipient",
    "setup": "Prepare a supported transfer to a recipient absent from active policy.",
    "action": "Run policy and verifier decision.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "REJECTED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "decoder can describe transfer but policy denies it",
      "no signature is produced"
    ]
  },
  {
    "id": "P04",
    "critical": false,
    "category": "policy",
    "kind": "attack",
    "title": "Transfer exceeds configured amount cap",
    "setup": "Set transfer amount one base unit above cap.",
    "action": "Run policy and verifier decision.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "REJECTED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": null,
    "assertions": [
      "integer comparison uses base units",
      "above-cap action is refused"
    ]
  },
  {
    "id": "P05",
    "critical": false,
    "category": "policy",
    "kind": "unknown",
    "title": "Unsupported permit authorization",
    "setup": "Submit permit-style authorization before its decoder is implemented.",
    "action": "Run decoder.",
    "decision": "REFUSE_UNSUPPORTED",
    "workflowStatus": "QUARANTINED",
    "executionSucceeds": false,
    "outcome": "QUARANTINED",
    "expectedRevertProposed": null,
    "assertions": [
      "nonce, spender, amount, and expiry are not guessed",
      "no attestation is produced"
    ]
  },
  {
    "id": "H01",
    "critical": true,
    "category": "policy",
    "kind": "attack",
    "title": "Attempt to remove guard",
    "setup": "Current Safe has IntentLock guard installed.",
    "action": "Submit Safe self-call setGuard(address(0)).",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "PolicyDenied",
    "assertions": [
      "guard removal is unconditionally denied",
      "guard remains installed"
    ]
  },
  {
    "id": "H02",
    "critical": true,
    "category": "policy",
    "kind": "attack",
    "title": "Attempt to enable module",
    "setup": "Safe 1.4.1 has no modules enabled.",
    "action": "Submit Safe self-call enableModule(module).",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "PolicyDenied",
    "assertions": [
      "module enablement is refused",
      "module remains disabled"
    ]
  },
  {
    "id": "H03",
    "critical": false,
    "category": "policy",
    "kind": "attack",
    "title": "Attempt to disable module",
    "setup": "Use a fixture module only in isolated test setup, not normal demo deployment.",
    "action": "Submit Safe self-call disableModule(prev,module).",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "PolicyDenied",
    "assertions": [
      "module administration is refused by policy",
      "normal deployment remains empty-module"
    ]
  },
  {
    "id": "H04",
    "critical": true,
    "category": "policy",
    "kind": "attack",
    "title": "Attempt to change Safe implementation",
    "setup": "Safe proxy points to configured singleton.",
    "action": "Submit master-copy/implementation change selector through Safe self-call.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "PolicyDenied",
    "assertions": [
      "implementation change is refused",
      "singleton address remains unchanged"
    ]
  },
  {
    "id": "H05",
    "critical": false,
    "category": "policy",
    "kind": "attack",
    "title": "Attempt to change owner threshold",
    "setup": "Safe has known owner set and threshold.",
    "action": "Submit owner or threshold administration selector.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "PolicyDenied",
    "assertions": [
      "owner/threshold change is refused",
      "owner set and threshold remain unchanged"
    ]
  },
  {
    "id": "H06",
    "critical": true,
    "category": "timelock",
    "kind": "attack",
    "title": "Execute guard replacement before readyAt",
    "setup": "Schedule allowlisted nonzero guard replacement and record exact readyAt/digest.",
    "action": "Attempt exact scheduled execution before readyAt.",
    "decision": "ATTEST_WITH_TIMELOCK",
    "workflowStatus": "TIMELOCK_PENDING",
    "executionSucceeds": false,
    "outcome": "TIMELOCKED",
    "expectedRevertProposed": "TimelockNotReady",
    "assertions": [
      "guard rejects early execution",
      "schedule remains bound to same digest and code hash"
    ]
  },
  {
    "id": "H08",
    "critical": true,
    "category": "integration",
    "kind": "attack",
    "title": "Safe module execution route",
    "setup": "Normal deployment has no enabled modules; attempt to invoke execTransactionFromModule from an unenabled address.",
    "action": "Call Safe module execution entrypoint directly.",
    "decision": "REFUSE_POLICY",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "GS104",
    "assertions": [
      "Safe rejects caller as non-module",
      "transaction guard is not misrepresented as module protection",
      "no vault state change"
    ]
  },
  {
    "id": "F01",
    "critical": true,
    "category": "availability",
    "kind": "availability",
    "title": "Registry/RPC/verifier unavailable",
    "setup": "Make registry read unavailable or verifier quorum unreachable without changing Safe state.",
    "action": "Attempt supported CALL execution.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "FAIL_CLOSED",
    "expectedRevertProposed": "RegistryUnavailable",
    "assertions": [
      "system fails closed",
      "no fallback bypass is offered",
      "client records stable error code and attempted digest"
    ]
  },
  {
    "id": "D06",
    "critical": false,
    "category": "decoder",
    "kind": "attack",
    "title": "Direct target runtime code hash changes after attestation",
    "setup": "Attest a supported direct contract CALL at target code hash A.",
    "action": "Replace or alter the local fixture target code before Safe execution.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "TargetCodeHashMismatch",
    "assertions": [
      "guard reads live to.codehash",
      "changed runtime code is rejected before target execution",
      "target state remains unchanged"
    ]
  },
  {
    "id": "H09",
    "critical": false,
    "category": "timelock",
    "kind": "benign",
    "title": "Execute allowlisted guard replacement after readyAt",
    "setup": "Schedule a valid nonzero allowlisted guard replacement; keep Safe nonce unchanged until timer is ready.",
    "action": "Advance Anvil time to readyAt and execute the exact attested Safe digest.",
    "decision": "ATTEST_WITH_TIMELOCK",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "readyAt is reached on-chain",
      "Safe nonce and exact digest still match schedule",
      "allowlisted replacement guard is installed",
      "successful receipt and ChangedGuard state are recorded"
    ]
  },
  {
    "id": "H10",
    "critical": false,
    "category": "timelock",
    "kind": "attack",
    "title": "Cancelled guard replacement cannot execute",
    "setup": "Schedule a valid guard replacement and cancel it through the configured Safe authority.",
    "action": "Attempt the previously scheduled exact Safe transaction after cancellation.",
    "decision": "ATTEST_WITH_TIMELOCK",
    "workflowStatus": "CANCELLED",
    "executionSucceeds": false,
    "outcome": "TIMELOCKED",
    "expectedRevertProposed": "TimelockCancelled",
    "assertions": [
      "cancel state is recorded",
      "old schedule cannot execute",
      "current guard remains installed"
    ]
  },
  {
    "id": "H11",
    "critical": false,
    "category": "integration",
    "kind": "attack",
    "title": "Untrusted caller cannot consume an attestation",
    "setup": "Create a valid, unconsumed registry record for a Safe transaction.",
    "action": "Call the registry consume function from an address other than the configured guard.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "OnlyGuard",
    "assertions": [
      "unauthorized consume reverts",
      "attestation remains available to the configured guard",
      "attacker cannot cause denial of service"
    ]
  },
  {
    "id": "A20",
    "critical": false,
    "category": "deception",
    "kind": "attack",
    "title": "Supported CALL with zero verifier attestations",
    "setup": "Prepare a supported CALL and valid Safe owner signatures but submit no verifier attestations to the registry.",
    "action": "Attempt Safe execution against the IntentLock-protected Safe.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "NoAttestation",
    "assertions": [
      "decoder policy permits the proposal but no verifier quorum exists",
      "guard fails closed with NoAttestation",
      "vault and target state remain unchanged"
    ]
  },
  {
    "id": "Q01",
    "critical": false,
    "category": "pq",
    "kind": "attack",
    "title": "PQ hybrid mode: attacker holds ECDSA keys but no PQ keys",
    "setup": "Enable PQ mode on registry; configure verifiers with both ECDSA and PQ keys; attacker possesses all ECDSA keys but no valid PQ keys.",
    "action": "Attempt submission or execution without valid PQ signatures.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTION_FAILED",
    "executionSucceeds": false,
    "outcome": "BLOCKED",
    "expectedRevertProposed": "PQVerificationFailed",
    "assertions": [
      "threshold requires both ECDSA and PQ signatures when PQ mode is enabled",
      "missing or invalid PQ signatures cause submission and guard rejection with PQVerificationFailed",
      "Safe balance and nonce remain unchanged"
    ]
  },
  {
    "id": "Q02",
    "critical": false,
    "category": "pq",
    "kind": "benign",
    "title": "PQ hybrid mode: valid hybrid ECDSA and PQ signatures execute",
    "setup": "Enable PQ mode on registry; configure 3 verifiers with ECDSA and ML-DSA-44 keys; threshold is 2-of-3.",
    "action": "Submit 2 valid ECDSA signatures paired with 2 valid ML-DSA-44 signatures over identical typed digest; execute Safe transfer.",
    "decision": "ATTEST",
    "workflowStatus": "EXECUTED",
    "executionSucceeds": true,
    "outcome": "EXECUTED",
    "expectedRevertProposed": null,
    "assertions": [
      "2-of-3 hybrid threshold satisfied",
      "Safe transfer executes",
      "Safe balance decreases and recipient balance increases",
      "Safe nonce increments"
    ]
  }
];
