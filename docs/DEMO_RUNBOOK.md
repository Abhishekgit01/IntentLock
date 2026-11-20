# Demo and operations runbook

## 1. Demo objective

In roughly three minutes, show: a normal multisig executes a deceptive attack; the same payload is blocked when the IntentLock guard is installed; a benign supported transfer still succeeds; and the result is backed by actual local-chain state and test evidence.

## 2. Required demo environment

- Pinned Anvil/Foundry setup and deterministic deploy/reset scripts.
- Actual Safe Smart Account `v1.4.1` deployment and guard, with exact commit recorded.
- Vault with known starting native/token balances.
- Vulnerable local proxy fixture and attacker implementation used only on the demo chain.
- Guard, registry, timelock, three disposable local verifier keys, threshold 2-of-3.
- Independent verifier process(es) that decode raw fields rather than trust the proposal label.
- Figma-built client wired to actual scenario/status data. Mocked animation data must not be described as chain evidence.
- Machine-readable fixture result output and a prerecorded backup of the full demo.

## 3. Clean-start procedure

1. Stop previous app/service/Anvil processes so no stale chain or port remains.
2. Start Anvil with the configured chain ID and deterministic account set.
3. Deploy the pinned contracts and actual Safe 1.4.1 from the deployment script.
4. Configure verifier set (3 active keys, threshold 2), policy hash, one allowlisted guard-replacement timelock action, and allowlists. Guard removal and other high-risk actions are refused.
5. Fund the vault and fixture contracts with deterministic amounts.
6. Install the guard through the intended Safe configuration path; assert guard address by chain read.
7. Confirm no Safe modules are enabled. Safe 1.4.1 module execution does not call the transaction guard.
8. Run a health check: chain ID, code hashes, Safe nonce, guard, registry, verifier set, balances.
9. Run a short smoke sequence: valid transfer succeeds; attack reverts; state is unchanged after revert.
10. Launch app and verifier processes only after the health check passes.

Automate these steps in a single documented reset command/script when implementation exists. The script must fail on any mismatch rather than proceeding with a partially configured deployment.

## 4. Scripted scenario sequence

### Scene 1 — Hook (0:00–0:20)

Frame the failure pattern: “The signers had the right keys; the transaction display did not describe the bytes that executed.” If citing Bybit/WazirX dollar amounts or incident details, verify them against primary/authoritative sources before presenting. The demo payload itself is synthetic.

### Scene 2 — Baseline multisig (0:20–1:05)

1. Show the misleading proposal label: “Transfer 0.1 ETH to cold wallet.” State that this is untrusted fixture metadata.
2. Submit the actual Safe transaction to the vulnerable baseline vault without IntentLock.
3. Show the actual raw operation/target/calldata and resulting fixture state change. The local baseline is a separate unguarded Safe with the same attack fixture.
4. Confirm baseline transaction receipt and changed state from chain reads.

### Scene 3 — IntentLock defense (1:05–2:05)

1. Propose the exact same transaction against the IntentLock-protected Safe.
2. Show transaction digest/context and verifier output derived from raw transaction fields.
3. Show the mismatch: declared label versus decoded delegatecall/upgrade effect. The guard independently refuses `DELEGATECALL` before registry lookup, so this fixture also demonstrates an unconditional defence-in-depth rule.
4. Separately show an ordinary `CALL` proposal with a missing or mismatched verifier attestation and the guard's registry-backed revert. This proves the intent-binding mechanism rather than only the operation filter.
5. Confirm vault balance, implementation, owners, guard, module set, and nonce/state after each rejected attempt.
6. If showing two verifiers disagree, ensure actual verifier software produces that result; do not animate a fabricated disagreement.

### Scene 4 — Legitimate action (2:05–2:25)

1. Propose an allowlisted native transfer under configured cap.
2. Have two distinct verifier keys attest to the same digest and intent hash.
3. Collect Safe owner threshold signatures and execute.
4. Show successful receipt and exact balance delta.

### Scene 5 — Evidence and limits (2:25–3:00)

Show real counts/denominators from the fixture run, the tested scope, unknown-call behavior, and one material residual risk. Make clear the chain is local, fixtures are synthetic, and the prototype is not audited or production-ready.

## 5. Timelock countdown demonstration

The only timelocked action in the initial build is replacing the guard with an allowlisted nonzero guard address/code hash. All other high-risk actions, including guard removal, are refused. Verifiers attest the exact future Safe transaction at its current nonce. A permissionless call to the separate timelock schedules that digest without consuming a Safe nonce. Configure a short but visible delay in the local demo. Show the on-chain `readyAt` and remaining seconds, then attempt the Safe execution early and show the actual `TimelockNotReady` revert (fixture H06). Advance Anvil time by the remaining delay using `evm_increaseTime` followed by `evm_mine`, re-read chain state, and execute the same exact digest at the still-current Safe nonce (H09). In a separate reset, show cancellation and that the cancelled digest cannot execute (H10). If any other Safe transaction executes in between, the schedule becomes stale and must be recreated with a fresh attestation. Never change target, nonce, intent, code hash, policy, or verifier-set after scheduling.

Anvil's clock is operator-controlled. Time advancement demonstrates the contract's state transition only; it does not validate real-world timing guarantees. If clock advancement or the timer is not implemented reliably, omit the countdown scene rather than simulate a chain-backed timer in the UI.

## 6. Reset between runs

Prefer restarting Anvil from genesis and redeploying rather than attempting to reverse state manually. Clear only generated demo artifacts/cache paths known to the project. Preserve evidence reports and recordings in a separate output directory with run identifiers. Never delete user data or source files as part of reset.

## 7. Demo failure handling

| Failure | Action |
|---|---|
| Wrong chain/address/code hash | Stop; run full reset. Do not continue with stale state. |
| Attack executes through protected path | Stop presentation; use backup video, record failure, and treat as release blocker. |
| Legitimate transfer fails | Check exact revert/config; do not disable guard or bypass threshold live. Use backup. |
| Verifier process unavailable | Show fail-closed pending/error if stable; otherwise use backup. Never fabricate a signature. |
| UI disconnects but contracts are correct | Use documented direct script/RPC path only if rehearsed and evidence is visible; otherwise backup. |
| WebGL/visual issue | Use Figma-approved static/fallback view; underlying transaction evidence must remain visible. |
| Anvil state drift | Restart from genesis and use backup if reset exceeds allotted time. |

## 8. Hour-12 decision gate

At hour 12 of the build event, run the scripted attack and benign transfer from a clean chain repeatedly. Continue IntentLock only if attack reliably reverts on the protected path, the benign transaction reliably passes, and state assertions are stable. If not, switch deliberately to the TRACE/B3 contingency from the brief. Do not keep a half-working IntentLock as the primary demo while quietly presenting fallback behavior as if it were B1.

The hour count is relative to the actual event start time; record that time with the team. The gate is about core behavior, not visual polish, the full 40-fixture corpus, or optional QR functionality.

## 9. Rehearsal checklist

- Demo payload and every address are local fixtures.
- Baseline and protected Safe are clearly distinguished.
- Every screen status is backed by actual test/service/chain state.
- Verifier keys are independent in the way the narration claims.
- Attack fails closed; legitimate transfer passes; exact balances and receipts are captured.
- Timelock is shown only if its actual delay and action binding are implemented.
- One-click reset works from a clean environment.
- Backup recording is current and matches the version being pitched.
- Claims, incident amounts, product comparisons, and Safe/module behavior have been independently checked before slides are finalized.
