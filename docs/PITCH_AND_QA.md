# Pitch outline and judge Q&A

This is a narrative/evidence plan, not a claim that implementation or research is complete. Replace all `[measured result]` fields with actual run output. Do not show invented percentages.

## Three-minute demo arc

1. **Hook (0:00–0:20):** “A multisig can have the right signers and still execute bytes that its proposal screen misrepresented.” Show the local synthetic fixture label and state that it is attacker-controlled metadata.
2. **Baseline (0:20–1:05):** execute the fixture attack on an unguarded Safe; show actual operation, calldata, receipt, and state change.
3. **Defense (1:05–2:05):** run same delegatecall fixture against IntentLock. It is blocked by an unconditional on-chain `DELEGATECALL` rule. Then show a separate ordinary `CALL` whose attestation is absent/mismatched; it is blocked by registry-backed intent binding. This separates defense-in-depth from the central attestation feature.
4. **Legitimate transaction (2:05–2:25):** execute the allowlisted transfer with 2-of-3 verifier attestations and the Safe owner threshold.
5. **Evidence and limits (2:25–3:00):** show actual fixture counts, denominators, a failure case, local-chain/synthetic-data disclosure, and one residual risk.

## Slide outline mapped to rubric

| Slide | Main content | Judging criterion | Evidence required |
|---|---|---|---|
| 1. The problem | Misleading transaction intent can defeat correct multisig signers | Impact 15; Presentation 15 | Short, sourced incident context; no unsupported causal claims |
| 2. IntentLock | Independent decoders attest structured intent; guard binds it to Safe digest | Innovation 25 | Protocol diagram matches implemented code; source of each trust boundary |
| 3. Live attack | Unguarded fixture effect, then guard's unconditional delegatecall rejection | Technical depth 25; Presentation 15 | Actual receipt/state assertions; label attack payload synthetic |
| 4. Intent binding | Separate CALL with absent/mismatched attestations reverts; valid transfer succeeds | Technical depth 25; Evidence 20 | Foundry output, exact digests, registry state, receipts |
| 5. Measured results | Critical 25/40 corpus, attack rejection/benign acceptance counts and failures | Evidence 20 | Catalog IDs, raw denominator, generated report, no invented metrics |
| 6. India impact and boundaries | Indian multisig/treasury operators, incident context, limits, next steps | Impact 15 | Verified sources, supported subset, module limitation, no compliance promise |
| 7. Prior art and contribution | Existing warning/simulation/enforcement space; position as reference protocol, not “first” | Innovation 25 | Current primary product sources and dated comparison; mark unverified items as excluded |

Keep the pitch aligned to the rubric totals exactly: Innovation 25, Technical depth 25, Evidence 20, Impact 15, Presentation 15. The demo itself should make Presentation and Evidence legible without claiming that animation proves security.

## India impact framing

The intended users are Indian organizations, teams, and treasury operators that approve shared blockchain assets. Explain the practical risk in terms of preventing misrepresented, high-impact treasury actions and making independent review enforceable. Do not extrapolate hackathon prototype results to national loss reduction or regulatory compliance.

The supplied booklet cites WazirX ($230M, July 2024) and CoinDCX ($44M, July 2025) as India-relevant context. These figures are **booklet-sourced and not independently verified in this project**. Before using either number, verify amount, date, attribution, and incident details from primary company statements or authoritative incident sources, then record the exact source and wording in [CLAIMS_REGISTER.md](CLAIMS_REGISTER.md). If not verified before slides are frozen, use the general failure pattern without a dollar figure.

## Prior-art slide rules

- Do not say “first,” “unique,” “no one does this,” or “competitors only warn” without a current, sourced comparison.
- Cover wallet simulation/clear-signing tools, Safe guard capabilities, and commercial transaction enforcement where relevant.
- The defensible prototype contribution is an explicit open attestation schema + k-of-n verifier threshold + on-chain binding/reference guard, if those are actually implemented.
- Distinguish verified facts from the attached brief's review claims. Unverified vendors/products stay off the slide.

## Judge Q&A

| Judge asks | Response |
|---|---|
| “Safe signatures already commit to the transaction hash. What is new?” | “The Safe owner signature proves approval of bytes. IntentLock adds separate verifier signatures over the exact Safe digest plus a structured intent and policy context; the guard checks that binding at execution. Here is the digest and the registry record.” |
| “Does the contract understand every calldata payload?” | “No. The decoder supports a bounded, tested set. Unknown or ambiguous calls receive `REFUSE_UNSUPPORTED` and cannot be attested.” |
| “Could a transfer go to an attacker?” | “Yes. Correct decoding is not a safety verdict. Destination allowlists and amount limits are policy inputs, and those policies can still be incomplete.” |
| “What happens if the UI lies?” | “The verifier reads raw transaction fields independently. The UI label is untrusted. The guard checks the attested transaction/intent binding. This demo also hard-blocks all delegatecalls.” |
| “What happens if the verifier service is down?” | “The flow fails closed. Availability is reduced; there is no execution bypass.” |
| “Can a module bypass this guard?” | “Safe 1.4.1 module execution does not call this transaction guard. We deploy with no modules and refuse module enablement; we do not claim module execution is protected.” |
| “What if the proxy changes implementation?” | “For supported proxies, a proxy-specific on-chain resolver checks the implementation address and code hash. If the implementation cannot be checked on-chain, the call is unsupported.” |
| “Is this audited or production-ready?” | “No. It is a local-chain proof of concept with a bounded decoder, synthetic fixtures, and an explicit threat model.” |
| “How do you know it works?” | “Here are the fixture catalog, exact test output, denominators, transaction receipts, and state assertions. Results are limited to these fixtures.” |

## Presenter checklist

- Every statistic/product statement has a checked claim-register entry.
- All numbers are generated from final test run or linked to an approved source.
- Clearly disclose synthetic addresses/data and local chain.
- Show both the unconditional delegatecall block and the separate attestation rejection.
- State the Safe module gap without euphemism.
- Do not call simulated UI data a receipt or a security result.
