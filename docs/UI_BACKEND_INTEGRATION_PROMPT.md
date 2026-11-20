# Prompt for the existing UI implementation

Copy this prompt into the AI environment that has the nearly finished UI and its design context:

> Connect the existing IntentLock UI to the backend described in `backend/README.md` and the contracts in `docs/PROTOCOL.md` and `docs/SCENES.md`.
>
> **Preserve the UI work already in this project.** First inspect the existing files, screens, components, routes, state, design assets, typography, colors, spacing, and interactions. Keep the current design and creations you already made from your own context. Do not delete, replace, regenerate, rename, or broadly refactor existing screens/components/styles/assets just to add this integration. Prefer a small API client/adapter and focused bindings. If a genuinely necessary addition is missing, add it in the existing design language and preserve all current work. If an existing element conflicts with backend states, adapt only that element and explain the smallest change.
>
> Do not create a new UI from scratch. Do not change the owner's Figma design direction. Do not move, erase, or overwrite the current UI project. Before any destructive edit, stop and ask the project owner.
>
> ## Backend connection
>
> Use `VITE_INTENTLOCK_API_URL` (or the equivalent environment variable for this UI stack); local default is `http://127.0.0.1:8787`. Keep the base URL in one API client module. Handle loading, API errors, and reconnects without crashing the existing application.
>
> The backend routes currently available are:
>
> - `GET /health`
> - `GET /v1/config`
> - `POST /v1/proposals`
> - `GET /v1/proposals/:proposalId`
> - `GET /v1/proposals/:proposalId/events` (Server-Sent Events; supports `Last-Event-ID`)
> - `POST /v1/proposals/:proposalId/attestations`
> - `POST /v1/proposals/:proposalId/execute` (currently returns `EXECUTION_ADAPTER_NOT_CONFIGURED`; do not present execution as available)
>
> Proposal requests must include the complete Safe transaction: `chainId`, `safe`, `safeNonce`, `to`, `value`, `data`, `operation`, `safeTxGas`, `baseGas`, `gasPrice`, `gasToken`, and `refundReceiver`. Send integer values as decimal strings. Do not send `safeTxHash` or `intentHash`; the backend computes them. Optional `declaredMetadata` is untrusted display input and must never be treated as decoded intent.
>
> ## Bind current UI to real response fields
>
> Render these fields where the existing screens already have a suitable place:
>
> - Proposal identity: `proposalId`, `safeTxHash`, chain, Safe, nonce, target, value, operation, calldata.
> - Decoder/policy: `decoded.decodeStatus`, `decoded.summary`, `decoded.intent`, `decoded.intentHash`, `decoded.targetCodeHash`, `decoded.source.blockNumber`, `decoded.source.blockHash`, `decision`, `workflowStatus`, `decoded.reasonCode`.
> - Verifier progress: `verifier.validSignerCount`, `verifier.threshold`, `verifier.signers`, `verifier.thresholdMet`.
> - Execution gate: `execution.attemptedOnchain`, `execution.readyForExecution`, `execution.gate`, `execution.transactionHash`, `execution.observedRevert`.
> - Events: `eventsUrl`, consuming the ordered event envelope from `docs/SCENES.md`.
>
> Do not infer success from a button click, animation, submitted proposal, API acceptance, or verifier threshold. `APPROVED` means the off-chain verifier threshold was reached in this backend; the response still says `readyForExecution=false` because registry submission and Safe execution are not implemented. Only show `EXECUTED` when a future backend version returns a real successful receipt and transaction hash.
>
> ## State handling
>
> Keep policy `decision` separate from `workflowStatus`. Handle `ATTEST`, `ATTEST_WITH_TIMELOCK`, `REFUSE_UNSUPPORTED`, and `REFUSE_POLICY` independently from statuses such as `AWAITING_THRESHOLD`, `APPROVED`, `QUARANTINED`, `REJECTED`, `TIMELOCK_PENDING`, `TIMELOCK_READY`, `CANCELLED`, `EXECUTION_FAILED`, and `EXECUTED`.
>
> Subscribe to SSE for proposal progress, reconnect with the last event sequence, and prevent duplicate events. For `source=api`, show workflow information only. `source=mock` is simulated. Only `chain_log` or `rpc_observation` records are chain evidence; failed pre-hook calls are RPC observations because reverted logs roll back.
>
> ## Current limitations to represent accurately
>
> - The API stores state in memory and clears it on backend restart.
> - The first decoder only supports native `CALL` transfers with empty calldata to an EOA. It denies `DELEGATECALL` and quarantines other shapes.
> - The backend can verify external EIP-712 signatures only when the configured registry address has code, but does not yet submit attestations to the registry.
> - Safe execution is not implemented in the backend. Do not show a working execute flow; show the backend's `EXECUTION_ADAPTER_NOT_CONFIGURED` result as a clear disabled/coming integration state in the existing UI.
> - Mock data must remain clearly labeled and must never be mixed into a real-chain evidence view.
>
> Preserve current screen layout and copy where it remains accurate. Make the smallest focused changes needed to bind live data. At the end, report the files changed, which existing UI work was preserved, which API states were wired, and any UI state that still uses mock data. Do not commit or push changes; return a reviewable diff to the project owner.
