# Frontend data and evidence audit

**Audit date:** 2026-11-20
**Scope:** Existing React + TypeScript frontend under `frontend/src/`. This is a source audit, not a browser DevTools capture. Status describes implemented behavior in the checked-in worktree. **REAL** means backed by an actual network request or saved chain observation; **MOCK** means scripted/synthetic; **PARTIAL** means a real-data path exists alongside incomplete or synthetic behavior; **MISSING** means no implementation was found.

| ID | Status | Evidence and finding |
|---|---|---|
| U1 | PARTIAL | `src/replay/loader.ts` requests `/evidence/run.json`; `src/replay/adapter.ts` now maps saved `runData.events` in sequence. The ordinary Attack/Proof/Future acts remain scripted in `src/workbench/story.ts` and their act components. |
| U2 | PARTIAL | `src/workbench/useWorkbench.ts` has guarded/unguarded modes, and `src/workbench/engine.ts` chooses scripted arrays for each mode. The replay adapter selects a single run key and does not establish two lanes with the same raw payload from captured evidence. |
| U3 | PARTIAL | The 3D workbench receives proposal, operation, target, events and captured state from the replay object when available. Its legacy event/inspect code still contains hardcoded addresses and synthetic values in `src/workbench/scenes.ts` and `src/lib/data.ts`; the Replay Lab itself uses saved artifact fields and shows absent values as “not captured.” |
| U4 | PARTIAL | `src/network/evidence.ts` requests both `/evidence/run.json` and `/evidence/manifest.json`; Evidence renders available gas benchmarks. Both files now exist under `frontend/public/evidence/`. Browser Network behavior was not independently confirmed during this source audit. |
| U5 | REAL | `src/app/routes.ts` now exposes `/replay`; `src/pages/Replay.tsx` reads the saved run and manifest through `src/network/evidence.ts`, and renders the stored event arrays without synthesizing event payloads. |
| U6 | PARTIAL | `src/onboard/Onboard.tsx` implements policy editing and backend compile/lint/dry-run calls. `src/onboard/api.ts` no longer supplies a mock adapter. The sample policy is deny-all. Backend-dependent screens show request errors when their service is unavailable. |
| U7 | PARTIAL | Onboarding has public-address inputs and install-command content in `src/onboard/Onboard.tsx` and `content.ts`. Health is fetched on demand by `src/onboard/api.ts`; no two-second per-verifier `/health` polling or complete connection-state machine was found. |
| U8 | MISSING | Browser conformance is not exposed by the current verifier API. `runConformance()` now returns an explicit unavailable error rather than synthetic pass rows. No live n/N fixture execution screen is connected. |
| U9 | MISSING | No verifier-set proposal UI/API workflow or pending on-chain status was found under `frontend/src/` or `backend/src/`. |
| U10 | PARTIAL | `src/pages/Verifiers.tsx` now reads `verifierAddresses` and `verifierThreshold` from `/v1/config` and renders one member per returned address. The API does not expose per-member liveness or current attestation responses, so the UI explicitly shows member status and current quorum as not captured. |
| U11 | PARTIAL | The 3D workbench waits for `/evidence/run.json` and does not show its simulator when that artifact is unavailable. It displays the replay file's disclaimer. Legacy non-3D story acts remain scripted and are not chain evidence. The Orchard deployment manifest exists at `deployments/quai-orchard-cyprus1.json`; no browser-facing route currently reads it. |
| U12 | PARTIAL | The checked `frontend/src` wording search found no “audited”, “production-ready”, “would have prevented”, or “companies joined”. It does contain incident-specific wording such as “Raw Bybit delegatecall payload” (`src/replay/adapter.ts`) and assertions such as “prevents”/“prevents the attack” in scripted copy (`src/lib/data.ts`, `src/pages/Home.tsx`). Those lines need claim-scope review before presentation. |

## Commands used

```text
rg --files frontend/src frontend/public
rg -n "setTimeout|setInterval|events|MOCK|SYNTHETIC|blockNumber|slot0|0x[0-9a-fA-F]{40,64}|4201|337" frontend/src/workbench frontend/src/replay frontend/src/pages/Evidence.tsx frontend/src/lib/data.ts
rg -n "fetch\(|loadReplay|manifest|run.json|Replay|policy|health|conformance|join|registered|verifier" frontend/src/app frontend/src/pages frontend/src/onboard frontend/src/replay
rg -n -i "audited|production.ready|would have prevented|companies joined|wazirx|coindcx|bybit" frontend/src
find frontend/public/evidence -maxdepth 1 -type f -printf '%f\\n'
```

The evidence directory listing returned only `run.json`; no `manifest.json` was present. Source now contains explicit fetches for both files, but no DevTools Network session was available, so browser request behavior remains unconfirmed.

## Requested verification output

`pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.
`pnpm exec vite build`: exit 0; Vite reported the existing 1.1 MB Scene chunk warning.
`bun scripts/check-workbench.mjs`: exit 0, `workbench data OK: captions within limits, mock events clearly marked, fixture shape valid, wording rules hold`.
`git diff --check`: exit 0.

The requested source greps still find legacy simulator data:

- `grep -rn 'MOCK' src/` returns 12 matches, all in `src/workbench/scenes.ts` (synthetic hash/address helpers and scenario values).
- `grep -rnE '0x[0-9a-fA-F]{40,64}' src/` returns hardcoded addresses in `src/lib/data.ts`, `src/workbench/scenes.ts`, a public Bybit transaction link in `src/workbench/Panel.tsx`, and zero-address ABI defaults in `src/workbench/backend.ts`.
- `grep -rnE '(^|[^[:alnum:]_])(4201|337|31337)([^[:alnum:]_]|$)' src/` returned no matches.
- Wording grep for `audited`, `production-ready`, `would have prevented`, `N companies joined`, `WazirX`, and `CoinDCX` returned no matches in `src/`.

An HTTP check against `127.0.0.1:8443` returned connection failure, and starting Vite on that port returned `listen EPERM`. Therefore browser DevTools requests and the routes' HTTP status codes could not be confirmed in this environment.

## Data-integrity conclusion

The frontend still contains legacy scripted story content outside the evidence-driven 3D workbench. Values without saved receipt/state provenance must not be presented as live execution. Where a real field is absent, render `not captured`; where an endpoint cannot be reached, render an unavailable state. Onboarding no longer invents preview health, hashes, or conformance outcomes.
