# IntentLock frontend

The visual workbench keeps its scripted story labeled as synthetic. Its **Live backend** panel reads the configured Safe's current state from RPC and submits the selected raw payload to the IntentLock backend for real decoding, policy evaluation, and Safe hash computation. Backend SSE lifecycle messages are labeled as API events. The panel never presents proposal analysis as a mined transaction.

## Local integration

1. Start Anvil and deploy the local contracts from the repository root:

   ```sh
   anvil --chain-id 31337
   forge script script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast
   ```

2. Configure `backend/.env` with the generated manifest's Safe, registry, verifier set, allowed recipient, and policy cap. The API must use the same policy values committed by the deployment.

3. Start the backend with `cd backend && npm run dev`.

4. Start the frontend with `cd frontend && pnpm dev`. Vite proxies `/api/*` to `http://127.0.0.1:8787` by default. For a deployed backend, set `VITE_INTENTLOCK_API_URL` to its origin and configure its `ALLOWED_ORIGINS` explicitly.

The connected endpoint reports actual chain ID, block, Safe nonce, balance, code hash, guard, and module count. Submitting a scenario creates only an in-memory backend proposal. It does not collect verifier signatures, submit to the registry, or execute the Safe transaction.

## Policy onboarding

Visit `/onboard` for a seven-step policy wizard. The sample policy and preview adapter work without a backend and display `PREVIEW`; the persistent `SYNTHETIC LOCAL CHAIN` badge describes the wizard environment. When the API is reachable, policy compile/lint use the deterministic backend compiler and simulation calls raw-only `POST /decode`. The dry-run endpoint never signs. The preview conformance result is explicitly synthetic; run `npm run intentlock -- conformance --endpoint ...` to query a verifier endpoint with the catalog decision templates. The wizard keeps state in memory only and does not use local storage.

Policy input and hash semantics are defined in [`../docs/policy.schema.json`](../docs/policy.schema.json) and [D-030](../docs/DECISIONS.md#d-030-policy-authoring-file-and-canonical-compiler-output). Verifier downloads contain public configuration only, never private keys.
