# Scenario event contract

This document defines the ordered event stream consumed by the UI and evidence reporter. The stream represents application workflow and observed chain activity; it does not make mock data into chain evidence. The project owner supplies the UI through Figma. This contract specifies only the data and state changes the supplied UI must render.

## Event envelope

Each event is a JSON object with these required fields:

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | integer | Starts at `1`; incompatible changes increment it. |
| `eventId` | string | Unique immutable ID for this event. |
| `scenarioId` | string | Stable ID for the demo/test run. |
| `fixtureId` | string or null | Catalog fixture ID, or null for non-fixture activity. |
| `demoScene` | string or null | Optional catalog scene key for matching UI story beats. |
| `sequence` | integer | Monotonically increasing within a scenario; consumers sort by this, not arrival time. |
| `type` | string | One of the event types below. |
| `occurredAt` | RFC 3339 string | Timestamp supplied by the event source. For chain events retain the block timestamp separately. |
| `source` | `mock`, `chain_log`, or `rpc_observation` | States where the event came from. Never infer `chain_log` from a mock. |
| `safe` | address or null | Checksummed display value; comparisons use normalized 20-byte address. |
| `proposalId` | string or null | Coordinator proposal identifier. |
| `safeTxHash` | bytes32 or null | Canonical Safe transaction digest where available. |
| `transactionHash` | bytes32 or null | Real submitted transaction hash only for chain/RPC evidence. Mock events MUST set this to null. |
| `causeEventId` | string or null | Prior event that caused this event, when applicable. |
| `payload` | object | Type-specific data; the event type schema defines its required keys. |

Events are append-only. Corrections are new events that reference the superseded event; consumers must not silently rewrite prior evidence.

## Event types and required payloads

| Type | Required `payload` keys | Meaning |
|---|---|---|
| `proposal.created` | `rawTransaction`, `declaredMetadata` | Proposal received. Declared metadata is untrusted input. |
| `decode.started` | `decoderVersion` | Independent decoding began. |
| `decode.completed` | `decodeStatus`, `intent`, `intentHash`, `targetCodeHash` | Decoder result. `decodeStatus` is `SUPPORTED` or `UNSUPPORTED`. |
| `verifier.responded` | `verifierId`, `result`, `decision`, `reasonCode` | One verifier's result. `result` is `ATTESTED`, `REFUSED`, or `ERROR`; no event may imply threshold from one response. |
| `attestation.threshold_met` | `threshold`, `validSignerCount`, `attestationId` | Distinct valid verifier signatures reached configured threshold. |
| `timelock.scheduled` | `readyAt`, `delaySeconds` | Exact digest scheduled; includes chain transaction reference when real. |
| `timelock.ready` | `readyAt`, `observedBlockNumber` | Chain timestamp reached `readyAt`; not a client countdown reaching zero. |
| `timelock.cancelled` | `cancelledBy`, `reasonCode` | Cancellation observed from the chain or explicitly mock-labeled. |
| `safe.execution_submitted` | `ownerSignatureCount` | Safe execution transaction submitted. |
| `guard.authorized` | `policyClass`, `attestationId` | Guard pre-hook passed. Emit as a contract log only if the actual implementation emits it and transaction succeeds. |
| `guard.reverted` | `observedRevertName`, `revertData` | RPC observation that the attempted Safe transaction reverted. A reverted transaction rolls back its logs, so this is never represented as a contract event. |
| `safe.execution_succeeded` | `blockNumber`, `receiptStatus` | Successful receipt and chain location. |
| `safe.execution_failed` | `observedRevertName`, `receiptStatus` | Failed receipt or RPC revert observation, explicitly distinguished by source. |

`decision` is always the policy/verifier verdict from the shared enum. `observedRevertName` is runtime guard/Safe behavior. They are separate fields and can both appear in one scenario: an `ATTEST` proposal can later fail with `DigestMismatch`, `NoAttestation`, or another guard error. Fixture `expectedRevert` is an assertion target; only an observed RPC result can populate `observedRevertName`.

## State reducer rules

1. Reduce events by `(scenarioId, sequence)`; reject duplicate event IDs and report sequence gaps.
2. `proposal.created` enters `PROPOSED`; `decode.started` enters `DECODING`.
3. An unsupported decode ends proposal processing in `QUARANTINED`; a policy refusal ends in `REJECTED`.
4. An `ATTEST` or `ATTEST_WITH_TIMELOCK` verdict stays in attestation workflow until the threshold event is present. `ATTEST_WITH_TIMELOCK` additionally requires a scheduled and ready timelock before execution authorization.
5. `safe.execution_submitted` means submitted only. It never means approved or executed.
6. `guard.reverted` or `safe.execution_failed` sets `EXECUTION_FAILED`; the observed revert reason is attached as execution evidence, without changing the original policy decision.
7. `safe.execution_succeeded` sets `EXECUTED` only after a successful receipt. A UI animation, mock event, or `guard.authorized` event alone cannot do so.
8. Mock scenarios use the same envelope and ordering but `source=mock`, with `transactionHash=null`; every view/report labels them as simulated.

## Example: supported CALL with no attestation

The committed fixture for this scene is `A20` (`demoScene=call_no_attestation`):

```json
[
  {"schemaVersion":1,"eventId":"e1","scenarioId":"demo-A20","fixtureId":"A20","demoScene":"call_no_attestation","sequence":1,"type":"proposal.created","occurredAt":"2026-01-01T00:00:00Z","source":"mock","safe":null,"proposalId":"p1","safeTxHash":null,"transactionHash":null,"causeEventId":null,"payload":{"rawTransaction":{},"declaredMetadata":{"label":"Routine transfer"}}},
  {"schemaVersion":1,"eventId":"e2","scenarioId":"demo-A20","fixtureId":"A20","demoScene":"call_no_attestation","sequence":2,"type":"decode.started","occurredAt":"2026-01-01T00:00:01Z","source":"mock","safe":null,"proposalId":"p1","safeTxHash":null,"transactionHash":null,"causeEventId":"e1","payload":{"decoderVersion":"mock-v1"}},
  {"schemaVersion":1,"eventId":"e3","scenarioId":"demo-A20","fixtureId":"A20","demoScene":"call_no_attestation","sequence":3,"type":"decode.completed","occurredAt":"2026-01-01T00:00:02Z","source":"mock","safe":null,"proposalId":"p1","safeTxHash":"0x...","transactionHash":null,"causeEventId":"e2","payload":{"decodeStatus":"SUPPORTED","intent":{},"intentHash":"0x...","targetCodeHash":"0x..."}},
  {"schemaVersion":1,"eventId":"e4","scenarioId":"demo-A20","fixtureId":"A20","demoScene":"call_no_attestation","sequence":4,"type":"verifier.responded","occurredAt":"2026-01-01T00:00:03Z","source":"mock","safe":null,"proposalId":"p1","safeTxHash":"0x...","transactionHash":null,"causeEventId":"e3","payload":{"verifierId":"policy-engine","result":"ATTESTED","decision":"ATTEST","reasonCode":null}},
  {"schemaVersion":1,"eventId":"e5","scenarioId":"demo-A20","fixtureId":"A20","demoScene":"call_no_attestation","sequence":5,"type":"safe.execution_submitted","occurredAt":"2026-01-01T00:00:04Z","source":"mock","safe":null,"proposalId":"p1","safeTxHash":"0x...","transactionHash":null,"causeEventId":"e4","payload":{"ownerSignatureCount":2}},
  {"schemaVersion":1,"eventId":"e6","scenarioId":"demo-A20","fixtureId":"A20","demoScene":"call_no_attestation","sequence":6,"type":"guard.reverted","occurredAt":"2026-01-01T00:00:05Z","source":"mock","safe":null,"proposalId":"p1","safeTxHash":"0x...","transactionHash":null,"causeEventId":"e5","payload":{"observedRevertName":"NoAttestation","revertData":"0x"}}
]
```

This mock sequence illustrates the event contract only. A live run must use real normalized fields, actual signature/registry state, and the RPC-observed revert. It must not label the example's mock output as chain evidence.

## Mock-to-live adapter acceptance

- Both adapters emit this envelope and use the same reducer/status mapping.
- Live events carry real source block number/hash and receipt data where relevant; extend payloads with these fields rather than substituting mock timestamps.
- RPC revert observations retain submitted call parameters and decoded revert data, even though no failed transaction receipt/log may exist.
- A scenario can be replayed from its event list without network access, preserving fixture IDs and source labels.
- Never infer decision, quorum, `EXECUTED`, or chain evidence from presentation-only metadata.
