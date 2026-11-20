# The Big Hack 2.0: Problem Choice, IntentLock Plan and UI Toolkit

Nov 20, 2026 · @ABhishek

## Summary

**Build B1 "Know what you're signing" as IntentLock, an intent-bound multisig guard, and fall back to B3 only if the demo is not stable by hour 12.** This was the conclusion after one first answer (B3), three rounds of review from other AI models and two rounds of changes from me. The document records the problem set, the reasoning, the final design, the tools found on the web and the cautions.

- **Why B1:** blockchain is native to it, so the track rule is met without argument; the story (a signer with the right keys clicks Confirm) is told in one sentence; and the demo is a visible before/after.
- **Why not a warning tool:** wallet-side transaction simulation already exists, so "decoder + simulator + risk score" would not stand out against 93 teams. The differentiator is binding what signers reviewed to what executes, enforced on-chain.
- **Core thesis, in one line:** clear signing advises; the guard enforces.
- **Condition 1:** the independent verifier must look like a separate trust domain (different device, different keys, decoding raw calldata). If it looks like just another signature, the "Safe already commits to the tx hash" question sinks the pitch.
- **Condition 2:** the live demo must be stable by hour 12 (attack reverts, legitimate transfer passes, on scripted state). Record a backup video regardless.
- **Do not claim:** universal semantic verification, audited or production-ready status, or module safety you have not tested.
- **Fallback:** B3 "Logs the attacker can't erase", built as TRACE (per-event Merkle proofs, heartbeats, forensic export).

No tool or document can guarantee a win. The execution decides it.

## The hackathon and its nine problems

**The Big Hack 2.0 (Bengaluru) has 3 tracks and 9 problem statements; you pick one, read the track rules, then build and present a working demo to the judges.** You said there are 93 competing teams. The booklet does not say how to solve any problem; you choose the approach, technology and user.

### Track rules

| Track | Rule that applies to every problem in it |
| --- | --- |
| 01 Finance | Every submission must be a working prototype. Synthetic data is allowed where real data is unavailable, but the demo must say clearly which data is real and which is synthetic. |
| 02 Cybersecurity and blockchain | Blockchain is mandatory and must be a core part of the solution. Public and permissioned chains are both allowed, as are a testnet or a local chain. A solution that would work the same way with the blockchain removed does not meet the rule. |
| 03 AI research | A research track. Each submission needs a hypothesis or method in one or two sentences, an evaluation against a baseline, and an analysis of where the method fails. A properly measured negative result counts. Sending prompts to a hosted model such as ChatGPT or Gemini and showing the reply is not accepted. Do not publish harmful model outputs that work. Test only on code and apps you own or have permission to test. |

### Judging (out of 100)

| Criterion | Weight | What it measures |
| --- | --- | --- |
| Innovation | 25 | How original the idea and approach are |
| Technical depth | 25 | How well the solution is built and how well it handles difficult cases |
| Evidence | 20 | How convincingly you show that the solution works |
| Impact | 15 | How much it would help real users in India |
| Presentation | 15 | How clear the demo and the pitch are |

Innovation, technical depth and evidence together are 70 points. Presentation, where visuals count, is 15.

### The nine problems

| ID | Title | The problem in brief | Headline figures in the booklet |
| --- | --- | --- | --- |
| F1 | The irregular income problem | People with irregular income (gig workers, vendors, farmers) run out of money in lean months even when annual income would cover their needs. Challenge: help one such person stay financially stable (measurably defined) in low-earning months. | 2.35 crore gig workers projected by 2029-30 (NITI Aayog); 40% of gig workers earn under ₹15,000 a month (Economic Survey 2025-26); Karnataka passed the Platform-Based Gig Workers Act in 2025 |
| F2 | Credit for the credit-invisible | Lenders cannot tell a healthy small business with no credit history from a risky one, so good businesses are denied or overcharged. Challenge: a fairer way to decide who gets credit, how much and on what terms. | ₹30 lakh crore small-business credit gap, about 24% of demand (SIDBI); 35% gap for women-owned small businesses; 7.28 crore enterprises on the Udyam portal by December 2025 |
| F3 | Signal versus noise for retail investors | Retail investors act on social-media information whose quality they cannot judge and many lose money. Challenge: a tool that measurably improves decisions without ever telling them what to buy or sell. | 62% say finfluencers influence their decisions (SEBI Investor Survey 2025); 91% of individual futures and options traders lost money in 2024-25; ₹1.06 lakh crore net loss |
| B1 | Know what you're signing | People and organisations approve blockchain transactions without understanding what they do, and attackers exploit it. Challenge: make it impossible, or very hard, to sign a transaction whose real effect you do not understand. | $230M stolen from WazirX's multisig wallet in July 2024; $44M from CoinDCX in July 2025; India ranked 1st in Chainalysis's 2025 adoption index |
| B2 | Fair tickets | Bots and scalpers buy tickets as sales open, and fake tickets are sold on social media. Challenge: tickets at fair prices, resale that cannot be exploited, and fake tickets that are useless at the gate. | 1.3 crore people in BookMyShow's Coldplay queue (September 2024); resale asks up to ₹3 lakh; Enforcement Directorate raids in 5 cities including Bengaluru (October 2024) |
| B3 | Logs the attacker can't erase | An attacker with root access can edit security logs, so nobody can trust them after a breach. Challenge: make logs and incident evidence tamper-evident and provable to an auditor or court even if the attacker has root. | CERT-In requires 180-day log retention and 6-hour incident reporting; about 30 lakh incidents handled in 2025 |
| R1 | Vibe-coded and vulnerable | AI-written code ships with security holes the developer does not know about. Challenge: make AI-written code safe to ship without slowing the developer. | 45% of 80 coding tasks produced a flaw (Veracode 2025); 170 of 1,645 Lovable apps exposed user data; 2.19 crore developers on GitHub in India |
| R2 | Jailbreaks speak Kannada too | Language models are less safe in Indian languages than in English, and most languages are unmeasured. Challenge: measure and reduce the gap in open language models. | 79% of unsafe prompts got past GPT-4 safety training in low-resource languages versus under 1% in English; IndicJR covers 12 South Asian languages; IndiaAI Safety Institute announced in 2025 |
| R3 | The token tax | Tokenizers split Indian languages into many more tokens, so users pay more and wait longer. Challenge: reduce the cost or quality gap and measure what the improvement costs. | With the GPT-4 tokenizer (cl100k): 12x tokens for Kannada, 9.9x for Tamil, 4.1x for Hindi versus English |

**The booklet's B1 background in one line:** a wallet shows a summary that is often a contract address, a function name or hex data, so signers click Confirm; a signed transaction cannot be reversed; and WazirX said its signers approved a transaction that looked different from what it did.

## How the nine problems were compared

**The criteria you set were novelty, a good chance of winning in 24 hours, easy to explain and visually appealing; later you added that 24 hours is not a constraint because you have strong AI tools, and that the goal is to beat 93 teams.** The first comparison (done under the 24-hour assumption) gave these verdicts.

| Problem | First verdict |
| --- | --- |
| B3 Logs | Best overall under a 24-hour limit: a 30-second tamper demo, real need for blockchain (the attacker has root, so a local hash chain can be rewritten), maps to CERT-In rules, small core to build |
| B2 Fair tickets | Close second: visual (QR codes, a gate scan) and relatable (Coldplay), but ticketing on-chain is the most common blockchain hackathon idea, so judges will have seen it many times |
| B1 Know what you're signing | Strong story (WazirX) and a good "looks safe but drains your wallet" demo, but transaction decoding and simulation is hard to do well in 24 hours |
| F1, F2, F3 | Crowded: budgeting apps, alternative credit scoring and finfluencer trackers are very common, and finance dashboards tend to look alike |
| R1, R2, R3 | A research track that rewards rigour (hypothesis, baseline, failure analysis) over wow factor; demos are harder to make visual; R2 also has constraints on what can be published |

**Why that ranking changed once the 24-hour limit was dropped:** the main thing holding B1 back was feasibility, and your AI tooling removes most of that penalty. Against 93 teams, differentiation matters more. B3 (hash logs, anchor a Merkle root, show a red "tampered" block) is the default blockchain idea in this booklet, so many teams are likely to converge on it. B1 also meets the blockchain rule natively: nobody can argue the solution works the same without the chain.

## How the recommendation evolved

**The pick moved from B3 to B1 over nine rounds, and each round changed something specific.** Reviews 1 to 5 came from other AI models whose write-ups you pasted in; the rounds are listed in order.

| Round | Source | Position | What changed |
| --- | --- | --- | --- |
| 1 | Me | B3, with a visual evidence timeline | Chosen for 24-hour feasibility, a strong tamper demo and a clear Indian-regulation story. Flagged the risk that "hash logs onto a blockchain" is a known idea, so the differentiators had to be per-entry Merkle proofs, a live attack demo and a court-style report |
| 2 | Review 1 (another AI) | B1 as SignLens, a wallet-side transaction firewall | Argued B1 has the best blend of originality, depth and demo. Proposed MetaMask on a local chain, a decoder, a simulation step, a risk engine and a dashboard, plus a 3-minute "fake rewards site" demo |
| 3 | Me, on Review 1 | Switch to B1, but not as a plain explainer | Pointed out that Pocket Universe, Blowfish, Rabby and Tenderly already simulate and decode, so a decoder plus risk score would draw "Rabby does this". Proposed an on-chain guard for a Safe-style multisig, an attack replay and a measured test set |
| 4 | Review 2 (another AI) | Stay with B3, built as TRACE | Agreed a warning-only B1 is undifferentiated but judged the on-chain guard much harder in 24 hours, with more ways to break live. Scored B3 9.4/10 and B1+guard 8/10 on its own subjective scale. Proposed TRACE: per-event Merkle verification, an independent evidence collector, an attack-aware timeline and a forensic evidence export |
| 5 | Me, after you removed the 24-hour limit | B1 as IntentLock | Because feasibility is no longer the constraint, B1's ceiling is higher. Concept: bind what signers saw to what executes, enforced on-chain. Cited Bybit (about $1.5B, February 2025) as the same failure pattern |
| 6 | Review 3 (another AI) | B1 as IntentLock, corrected | Its key correction: a Solidity guard cannot understand arbitrary calldata, so the guard should verify that the executed transaction hash matches what signers attested to (via EIP-712), not infer meaning. Also raised the module-bypass issue |
| 7 | Me | B1, adopting Review 3's protocol | Accepted the correction and kept the demo, evidence plan and scope control |
| 8 | Review 4 (strict, sourced) | Conditional pass, 7/10 as written, 8.5/10 after five fixes | Said the concept survives but my "avoids crowded ideas" claim was false as stated and "compromised UI alone can't execute" was incomplete. Gave five fixes (see the prior-art and threat sections) |
| 9 | Review 5 (final verdict) | B1, commit to it | Two conditions: make the verifier visibly a separate trust domain, and have the live demo stable by hour 12, with a fallback to B3 otherwise |

### What I got wrong, and what was corrected

- **"Avoids the crowded ideas" was too strong.** Review 4 says commercial on-chain enforcement for multisigs already exists. I have not verified the product claims myself (see the prior-art section), so they need a ten-minute check before they go on a slide.
- **The guard cannot infer meaning from calldata.** My earlier step 3 (guard executes only if the simulated effect matches the attested intent) was wrong. The corrected design is in the next section.
- **The module point.** I said Safe's docs say module transactions are not covered by guards. Review 4 says the docs do not state this; the behaviour is visible in the contract source (in Safe v1.4.1, module executions skip the guard). Cite the contract code, not the docs, in an appendix. This is Review 4's claim, which I have not independently checked.
- **Review 4's point about the Bybit incident:** the signers signed the correct hash of the correct (malicious) bytes while the interface displayed a benign transfer. It reports about $1.46B, with compromised Safe{Wallet} front-end code and an implementation upgrade as the payload. These details come from its own sources, not my searches.

### Where the final reviews differ

Review 4 is stricter and adds scope; Review 5 says ship it with an hour-12 kill switch. The combined stance in this document is: adopt the cheap, visible fixes, and keep the hour-12 decision rule.

## IntentLock: the final design

**IntentLock makes a multisig refuse to execute any transaction unless the exact transaction being run is the one whose meaning independent verifiers attested to; the blockchain is the enforcement mechanism, not decoration.** The pitch sentence: a multisig wallet cannot execute a transaction unless its actual execution payload is cryptographically bound to what its authorised signers independently reviewed and approved.

### The failure it targets

The booklet's WazirX line is the key: signers approved a transaction that looked different from what it did. Bybit (about $1.5B, February 2025, per the reviews) followed the same pattern. The real failure is that the thing signers see is not bound to the thing that executes. Warnings alone do not fix this because signers can click through them.

### The corrected protocol

1. **Decode independently.** A separate verifier reads the actual transaction fields and produces a structured intent manifest (what moves, what permissions change, whether code or ownership changes).
2. **Create two commitments.** `txHash` commits to the exact transaction: chain, Safe address, nonce, target, value, calldata and operation. `intentHash` commits to the decoded semantic intent.
3. **Collect attestations.** Independent verifiers review the manifest and sign an EIP-712 attestation binding both hashes together. Use a 2-of-3 attester threshold, not a single verifier.
4. **Enforce on-chain.** The guard verifies the required attestations and confirms the transaction being executed matches the approved `txHash`.
5. **Apply risk policy.** Unknown contract calls, delegatecalls, implementation upgrades and ownership changes need extra authorisation or a timelock, and emit an on-chain alert event.

**Important limit:** a Solidity guard cannot generically understand arbitrary calldata. The guard verifies that the executed transaction is the one whose interpretation was attested; it does not infer meaning. The prototype supports a defined set of transaction types and rejects or quarantines unknown calls. Do not claim universal semantic verification.

### Attestation binding (from Review 4)

Bind each attestation to: Safe address, chain ID, Safe nonce, `txHash` and the decoded-intent hash. Add a freshness window and make it non-replayable. Each property becomes a test fixture: cross-Safe replay, stale nonce, wrong chain, threshold not met.

### Policy classes and guard self-protection

- Force `setGuard`, `enableModule`, `disableModule` and `changeMasterCopy` (implementation changes) into the timelock-plus-attestation class. An attacker who gets through the flow could otherwise remove the guard itself. Review 4 quotes Safe's own warning that a broken guard can cause denial of service for a Safe. Include "guard removes itself" as an explicit attack fixture.
- Modules: per Review 4, module executions in Safe v1.4.1 skip the guard because the guard hooks live only inside `execTransaction`. Since `enableModule` itself goes through `execTransaction`, make enabling a module a quarantined high-risk class. This is stronger than just disabling modules in the demo. Test it; do not assume it.
- Semantic deception survives decoding: a verifier can truthfully attest a decoded "transfer" to an attacker-controlled address. The answer is policy (destination allowlists), scoped into policy classes and not into the decoder.

### How it differs from a Safe signature

A Safe signature commits to bytes, not to meaning. In Bybit, signers signed the real hash while the UI showed something else. IntentLock requires separately run verifiers, on different devices with different keys, to decode the actual transaction and attest to its meaning, and the guard refuses execution without that attestation. A compromised UI alone can no longer get a transaction executed.

### Reviews' suggested architecture stack

| Component | Technology |
| --- | --- |
| Blockchain | Anvil (local EVM chain) |
| Smart contracts | Solidity and Foundry |
| Transaction decoding | ethers.js (viem is also a strong option; see the tools section) |
| Intent attestations | EIP-712 |
| Frontend | React and TypeScript |
| Visualisation | React Flow or custom SVG |
| Backend | Node.js |

Scope guard: a web app with an Anvil local chain, a mock Safe-style vault and a vulnerable proxy. No browser extension and no integrations with every existing wallet.

## Prior art and how IntentLock differs

**Add a prior-art slide: a judge who searches for twenty seconds will find products in this space, so the pitch must be "an open, k-of-n reference standard" and not "nobody does this".** Everything in the table below comes from the reviews and my first answer, except where noted; I have not verified the product claims, so check each one for ten minutes before it appears on a slide.

| Existing thing | What it does (as reported in the reviews) | IntentLock's answer |
| --- | --- | --- |
| Pocket Universe | Transaction previews, asset-flow explanations and malicious-transaction warnings (a web search in an earlier review round surfaced its advertising) | It warns; IntentLock enforces on-chain |
| Rabby, Blowfish, Tenderly | Wallet-side decoding and simulation (named in my round 3 answer) | Same: advisory versus enforced |
| Blockaid Cosigner | Reported by Review 4 as an on-chain enforcement layer for multisigs, shipped April 2025: a 1-of-2 Safe where a Blockaid signer signs only after simulation, plus the organisation's override signer | Cosigner trusts one third-party signer; IntentLock enforces a k-of-n threshold of independent attesters, self-hostable, with the attestation schema as an open standard |
| Hypernative Transaction Guard | Reported by Review 4 as simulating, verifying and enforcing policy before a transaction reaches the chain | Same architectural answer |
| Zodiac Roles | Reported by Review 4 as on-chain per-call permission enforcement | Permissions are not the same as attested intent; IntentLock binds meaning to execution |
| Safe transaction guards | Safe supports guards; its documentation includes an example that blocks delegatecalls (Review 2 found this by web search) | A generic guard blocks a call type; IntentLock verifies that what signers agreed to is what runs, and survives a compromised UI |
| Ledger Clear Signing | Hardware clear signing decodes for the human but stays advisory (Review 4) | Everything before the signature lives in one trust domain: clear signing advises, the guard enforces |

### The differentiation, stated plainly

- **Architectural, not product-level.** Pitch "the missing standard plus a reference guard", not "a product a vendor already built".
- **Threshold of independent attesters** instead of one third-party signer, so you do not replace the UI vendor with a verifier vendor as a single point of failure.
- **Detection as well as prevention:** an on-chain mismatch alarm.
- **The thesis, in one sentence:** advisory tools tell the signer something; IntentLock makes the chain refuse to execute unless what was reviewed is what runs.

## Demo script

**The demo should run in about three minutes and show a vault draining on a normal multisig, the same attack reverting under IntentLock, and a legitimate transfer passing, so judges understand the product without a technical explanation.**

| Time | Scene | What the judges see |
| --- | --- | --- |
| 0:00 | Hook | "$1.46B left Bybit. The signers had the right keys and the screen lied." (An earlier version used the WazirX $230M line as an Indian hook; either works.) |
| 0:20 | Attack on a normal multisig | A fake interface shows "Transfer 0.1 ETH to cold wallet". Signers approve, and the vault drains on screen as a live asset-flow diagram |
| 1:05 | Same attack on IntentLock | Split screen: "What the UI said" on the left, "What the chain would do" on the right (a delegatecall and a proxy takeover). The verifiers disagree, the guard reverts, the vault stays full |
| 2:05 | Legitimate transfer | Passes cleanly, so judges see it is not a blocker that stops everything |
| 2:25 | Scoreboard | Real measured numbers, then the threat model and limits slide |

### Three screens that tell the story

1. **The deception:** the wallet says "Transfer 0.1 ETH to the cold wallet"; the actual transaction is a malicious upgrade.
2. **Intent mismatch:** the independent verifier decodes the real transaction and shows a delegatecall and malicious implementation change.
3. **Enforcement:** transaction rejected by the on-chain guard; the vault balance stays intact.

### Making the mismatch credible (Review 4)

A strict judge knows both halves of the split screen are your props. Make the mismatch externally verifiable: show the raw calldata, compute the Safe EIP-712 digest on screen, and optionally offer a QR code to an offline hash-check tool a judge can run on their own phone. Do this only if time allows.

### Risk management for the live demo

- Record a backup video of the whole demo.
- Pre-mine all fixtures into scripted Anvil state instead of sending live transactions in sequence; the local chain is the riskiest live element.
- The verifier must visibly run as a separate process on a separate device or key set, so it does not look like a second signature.
- Visuals: a Sankey-style fund-flow diagram, a big green or red state change, and a timelock countdown for risky actions.

## Evidence plan

**Build about 40 carefully designed fixtures with strong tests and report only real measured results; evidence is worth 20 points and most teams will lose them.** My first suggestion was 60 to 100 transactions; Review 3 argued for 40 well-designed fixtures over 100 superficial ones, and that is the target here. Never invent detection percentages; display the actual test output.

### What the corpus should contain

- **Benign:** transfers, swaps and ordinary approvals.
- **Attack patterns:** unlimited approve, permit phishing, `setApprovalForAll`, delegatecall, proxy upgrade, owner swap, and a misleading-UI transaction.
- **Guard and attestation attacks (from Review 4):** the guard removing itself via `setGuard`, enabling a module, cross-Safe attestation replay, stale nonce, wrong chain ID, and attester threshold not met.

### What to measure

| Metric | Note |
| --- | --- |
| Malicious transaction rejection rate | Over the attack fixtures |
| Legitimate transaction acceptance rate | Over the benign fixtures |
| False-positive rate | Benign transactions wrongly blocked or quarantined |
| Attestation mismatch detection | UI-shown versus decoded intent |
| Timelock enforcement | High-risk classes cannot skip the delay |
| Behaviour when the verifier or attestation is unavailable | Should fail closed, and you should show it |
| Baseline comparison | Against what a basic wallet approval prompt (raw hex or a contract address) tells a signer |

### Also required

- Automated Foundry tests and an evidence report.
- A failure-analysis slide (limits the design cannot cover).
- Be explicit about which data is real and which is synthetic; the Finance track requires this and it is good practice here too.

### Why not just show a detection percentage

A judge who knows the space will ask how the corpus was built. Show the fixtures, show the test runner output, and state the limits.

## Threat model, residual risks and hard judge questions

**State the limits yourself: naming where IntentLock fails earns technical-depth points, and if the UI and the independent verifiers are both compromised, the guard cannot help.** Review 4 recommended a four-row threat matrix (UI, signer device, verifier set, guard bug) against prevented, detected and accepted. The classification below is my draft for the team to confirm, not something the reviews filled in.

### Draft threat matrix

| Compromised part | Draft outcome | Reasoning |
| --- | --- | --- |
| Wallet UI only (the Bybit case) | Prevented | The guard will not execute without independent attestations of the exact transaction |
| One signer device | Partly prevented | One device cannot meet the attester threshold alone; a signer who approves a plausible-looking transaction is a policy matter |
| Verifier set (k of n) | Accepted risk, mitigated | Separate devices and keys, plus the timelock, give a window to detect and cancel |
| Guard bug | Accepted risk, mitigated | Foundry fixtures including self-removal; a broken guard can also deny service, so test legitimate flows too |

### Residual risks to state, not hide

- Semantic deception survives decoding: a verifier can attest a genuine transfer to an attacker-controlled address. Handle it with destination allowlists in policy.
- The verifier fleet is itself a newly trusted set.
- Time- or block-dependent contract behaviour can evade simulation. Flag unknown contracts with conditional logic as high-risk and send them to the timelock.
- Module transactions bypass guards in the contract code (per Review 4); restrict `enableModule` through the quarantined class and test it.
- Not audited and not production-ready: market it as a proof of concept with an explicit threat model, never as a guarantee of court admissibility or compliance.

### Hard judge questions and answers

| Question | Answer |
| --- | --- |
| "Safe signatures already commit to the exact tx hash. What do you add?" | A signature binds to bytes, not meaning. Independent verifiers on separate devices attest to the decoded meaning, and the guard refuses execution without that attestation |
| "Rabby and Pocket Universe do this." | They warn; IntentLock enforces on-chain, so a compromised UI cannot fool the signers |
| "Blockaid or Hypernative shipped this." | Those rely on one vendor's signer or service; IntentLock is a k-of-n, self-hostable reference with an open attestation schema (verify these product claims first) |
| "Ledger Clear Signing fixed this." | Clear signing advises; everything before the signature lives in one trust domain. The guard enforces |
| "What if the contract behaves differently at execution time?" | Simulation can be evaded by conditional logic, so unknown contracts with such logic go to the timelock as high-risk |
| "What if all the verifiers are compromised?" | Then the guard cannot help; we separate verifier devices and add the timelock as defence in depth |
| "Can an attacker just remove the guard?" | `setGuard`, `enableModule`, `disableModule` and implementation changes are forced through the timelock and attestations, and tested as fixtures |

## Build order, the hour-12 rule and the B3 fallback

**Build in the order below, and decide at hour 12, not hour 20: if the attack does not revert and the legitimate transaction does not pass reliably on scripted state by then, switch to B3.** The items from threshold attesters onward add scope, so the first three must work end to end before anything else is started.

### Build order

1. A mock Safe-style vault, the guard and a single attestation path working end to end, including the revert, with Foundry tests for each.
2. A decoder for a fixed set of transaction types. Quarantine or reject anything unknown.
3. The Bybit-style attack scenario (UI shows "Transfer 0.1 ETH"; the real transaction is a delegatecall proxy upgrade) and the legitimate transfer scenario.
4. The split-screen dashboard: "What the UI said" versus "What the chain would do", a fund-flow animation and a vault balance that stays intact.
5. Threshold attesters (2-of-3) and guard self-protection, with timelocks for high-risk actions.
6. The fixture suite (about 40) and the evidence report.
7. Extras only if time remains: the QR offline hash checker, and polish.

### Team-dependent items

I asked for team size and who can write Solidity so I could produce an hour-by-hour split, the contract interfaces (guard, attestation registry, timelock, decoder policy) and the 40-fixture list with pass/fail criteria. Review 4 made the same offer. This information has not been provided yet, so that plan does not exist.

### Risks to manage

- **AI-written Solidity is itself a security risk.** Use Foundry tests, cover every attack in the corpus, have a teammate review every contract, and understand each line, because judges will probe the guard.
- **Scope creep:** no browser extension, no wallet integrations. One working mechanism beats ten half-built features.
- **Positioning:** a proof of concept with an explicit threat model, not an audited product.
- Do not use AI as the security check. At most it can phrase explanations; the decoder and the guard are the mechanism.

### Fallback: B3 "Logs the attacker can't erase", built as TRACE

TRACE (Trustworthy Runtime Audit and Chain Evidence) was Review 2's name for an upgraded B3. Its four defining capabilities:

1. **Per-event Merkle verification:** identify the exact altered, deleted or substituted records, not just "a hash changed".
2. **Independent evidence collector:** keep records outside the monitored machine so a compromised administrator cannot rewrite the local copy.
3. **Attack-aware evidence timeline:** show modifications, missing sequences, stopped heartbeats and verified batches in one interface.
4. **Forensic evidence export:** a report with the original evidence, verification results, Merkle proofs, blockchain transaction references and timestamps.

The core flow: a server generates logs; an agent batches them every N seconds; each batch gets a Merkle root anchored on-chain (a local Hardhat or Anvil chain, or a testnet); an attacker with simulated root access edits and deletes entries; the dashboard shows exactly which records no longer match the anchored evidence. The demo arc is Verified, Attacked, Tampered, Proven. A live attack button turns one block red, and a click shows the diff.

Important caveats for B3:

- Store the log batches off-chain and anchor only the Merkle roots on-chain; a root alone cannot reconstruct the logs.
- Blockchain proves the integrity of committed evidence, not that the original machine reported every event honestly. An attacker could stop the shipper or suppress events, so use independent heartbeats and sequence numbers to expose gaps.
- Call the export a forensic evidence report, not a guarantee of court admissibility or regulatory compliance.
- Include an honest-limits slide.
- Stretch ideas from my first answer: a tamper-evident chain across several servers, and selective redaction so part of a log can be proven without revealing all of it.
- The CERT-In rules (180-day retention, 6-hour reporting) give a strong impact slide.

## UI toolkit: globe, 3D and animated components

**You asked for the kind of visual that impressed judges in your earlier project, a Cesium 3D moon; for IntentLock the equivalent is a "verifier constellation" globe, kept to about ten seconds of the demo.** Judges score visuals only under Presentation (15 points), so the 3D must not take time from the guard and the evidence.

### The idea: verifier constellation

Place the 2-of-3 independent attesters on a globe (for example Bengaluru, Mumbai, Singapore). When a transaction is proposed, glowing arcs travel from each verifier to the vault. A mismatch turns one arc red. It makes "independent trust domains" visible without explanation.

### Globe and 3D libraries found

| Library or project | What it offers | Notes |
| --- | --- | --- |
| react-globe.gl | React bindings for globe.gl, with layers for points, arcs, polygons, paths, heatmaps, hex bins, rings, labels, HTML elements and custom 3D objects | The fastest route. Its examples include arc links, ripple rings, HTML markers, satellites, submarine cables and moon landing sites, plus a glitch post-processing effect |
| r3f-globe | React Three Fiber component wrapping the three-globe library (version 1.6.0 on npm when checked) | Use if you want the globe inside a larger React Three Fiber scene; accepts a globe image URL, atmosphere altitude and custom materials |
| Neon Globe reference repo ("Digital Brain Network") | React Three Fiber and drei, with post-processing Bloom for a glowing cyberpunk look, instanced pulse effects for animated data flow, and latitude/longitude-to-3D-vector maths | Copy the approach rather than the whole project |
| Geo Globe Three | Next.js 15, React 19, Three.js, React Three Fiber and Tailwind 4 globe showing country boundaries from GeoJSON | A clean starting point for a dark globe with outlines |
| CesiumJS | The open-source 3D globe and 2D map library; Apache 2.0, free for commercial and non-commercial use | Heavier than needed for a few nodes. Streams terrain and 3D Tiles from the commercial Cesium ion platform or other sources; a Python wrapper (cesiumkit) says many features work without an ion token using bundled NaturalEarthII imagery |
| OL-Cesium (olcs) | Lets OpenLayers and CesiumJS run in one app and switch between 2D and 3D | Only relevant if you also need a 2D map |

Recommendation: react-globe.gl unless you specifically want your earlier Cesium look.

### Animated UI component libraries found

| Library | What it is | Licence as found |
| --- | --- | --- |
| Magic UI | 150+ free, open-source animated components for React, TypeScript, Tailwind and Motion; pairs with shadcn/ui; includes a globe and animated beams, marquees, animated lists and a dock | MIT |
| Aceternity UI | Next.js, React, Tailwind and Framer Motion; spotlight, 3D tilt card, background beams, lamp glow heading, wavy background, infinite moving cards, text-generate effect, card hover effect, MacBook scroll | Free for personal and commercial use according to one source, but that source says to verify the licence page before relaunch, so check it |
| Cult UI | shadcn-compatible; dynamic-island style components, shader and blur effects, fractal grids | MIT |
| ReactBits | Animated components, installed with jsrepo or copy and paste (no shadcn registry) | MIT |
| Hover.dev | About 38+ animated components and templates (marquees, docks, meteor trails, ripple effects) | Licence not confirmed |
| Animata | Hand-crafted animation snippets: bento grids, fancy borders, mirror text, animated widget cards | Licence not confirmed |

Shadcn-style registry installs were listed for Aceternity components, in the form `npx shadcn@latest add "https://ui.aceternity.com/registry/<name>.json"` (for example `3d-card`, `spotlight`, `background-beams`, `lamp`, `wavy-background`, `infinite-moving-cards`, `text-generate-effect`, `card-hover-effect`). Check the current registry before relying on these URLs.

### Where each fits in IntentLock

- Magic UI animated beams: attestations flowing into the guard.
- Magic UI or react-globe.gl globe: the verifier constellation.
- Bloom post-processing: the glow on the globe and the red or green verdict.

## Web3 tooling: decoding, simulation and Safe

**Use viem as the decoding core, WhatsABI and signature lookups for unknown contracts, Anvil for scripted chain state, and Safe's Protocol Kit for the vault and guard setup; study hexray and veil-cli as references and as your baseline.** All findings below come from web searches I ran; I have not installed or run any of them together.

### Libraries to build with

| Tool | What it gives you | Notes |
| --- | --- | --- |
| viem | `decodeFunctionData` turns calldata into a function name and arguments given an ABI; utilities for ABI encoding and decoding; TypeScript types inferred from ABIs and EIP-712 typed data; first-class Anvil and Hardhat support | Core library for the independent decoder and the EIP-712 attestations |
| WhatsABI (shazow) | Extracts an ABI from bytecode for unverified contracts, including proxy resolution (ERC-1967, ERC-1167, Diamond); includes an OpenChain signature-lookup loader for 4-byte selectors | A 2023 discussion says WhatsABI did not decode calldata itself; the suggested recipe was to look up the signature, build an ABI with `parseAbi`, then call viem's `decodeFunctionData`. Check the current version |
| 4byte directory and OpenChain | Function-signature databases for selector lookups | Used by the projects below as a fallback tier |
| Foundry (Anvil, Forge) | Local chain, scripted state, Solidity tests | Required by veil-cli's simulate command and by the Nightcall project |
| Safe Protocol Kit | `createEnableGuardTx` returns a Safe transaction that enables a guard at a given address, with optional gas, nonce and refund options | Useful for demo setup scripts |
| safe-kit (Python port) | Safe deployment, transaction creation, signing (EIP-712 and eth\_sign), execution, MultiSend batching and Safe Transaction Service integration | Only if part of the team works in Python |

### Reference projects to study (and to compare against)

| Project | What it does | Licence and caveats |
| --- | --- | --- |
| hexray (onyb) | "X-ray vision" for EVM calldata: a four-tier decoder (verified ABI, signature database, WhatsABI bytecode analysis, raw fallback), an enricher for tokens, amounts and addresses, and an 11-check safety engine. Built with Bun, viem, WhatsABI, the Etherscan API and 4byte.directory, with tests | MPL-2.0. It argues that simulation services need the transaction submitted to a simulation environment, cost money per run, miss context, and can be gamed because malicious contracts can detect simulation environments. That supports your point that the guard should not rely on simulation alone |
| veil-cli (summusforge-lab) | Decodes calldata or a transaction hash, lists token approvals and flags unlimited ones, simulates locally on an Anvil fork to show balance changes, and scores contract risk using on-chain heuristics and the GoPlus Security API | MIT. Not yet published to npm when found: install from source with pnpm; needs Node 18+ and Foundry for simulation |
| Nightcall (code0xff) | A console for real networks that simulates every mainnet write on a local Anvil fork before broadcast, with per-transaction spend limits and confirmation before execution | MIT. Node 24 or later and Foundry. Useful as a reference for "simulate then confirm" gating |
| Savvy (polareth) | An in-browser EVM interface to simulate and visualise on-chain activity and costs, built on the Tevm client, with WhatsABI for ABIs and the ability to impersonate a caller | Good for ideas on a visual simulation UI |

These decoding and simulation projects are exactly the kind of prior art a judge may name. Use them for your prior-art slide and as the "what exists today" baseline in the evidence section.

### Decoder design notes

- Tiered fallback is a good pattern: verified ABI, then signature database, then bytecode analysis, then quarantine.
- For the prototype, support a fixed set of transaction types and quarantine everything else; do not claim universal decoding.
- Keep AI out of the security path; it may phrase explanations only.

## Fund-flow visuals and the visual plan

**Use React Flow for the node graph and a Sankey for "vault drains" versus "vault stays full", and build three planned wow moments around them.**

### Libraries found

| Tool | What it gives you | Notes |
| --- | --- | --- |
| React Flow (@xyflow/react) | Interactive node graphs in React | 0xRay uses it with Dagre to lay out a left-to-right, time-ordered tree of Ethereum fund movements, with wagmi, viem, RainbowKit, Tailwind v4 and Vite |
| Dagre | Automatic graph layout | Used with React Flow in 0xRay |
| d3-sankey and @visx/sankey | Sankey layout; @visx/sankey exports React components and a wrapped d3-sankey generator, and is MIT licensed | The right chart for showing funds leaving or staying |
| CashFlow360 (example project) | A D3 Sankey of USDC flows rendered as an animated SVG, built with Next.js, wagmi and viem, using memoisation for the heavy SVG maths | A pattern to copy for the animated flow |
| React Flow Sankey experiment (DEV Community) | A Sankey-style diagram built with React Flow itself | Shows React Flow can be pushed beyond node editors, but the post is an early experiment |

A caution from an article on flow visualisation: a Sankey scales poorly with many nodes and can hide individual transactions. Keep the demo graph small, and use the Sankey for net flow and the graph for individual steps.

### Three planned wow moments

| Moment | Tooling | What judges see |
| --- | --- | --- |
| 1. Constellation | react-globe.gl with bloom | Verifier arcs light up, then one turns red |
| 2. Split screen | React Flow and a Sankey | "What the UI said" versus "What the chain would do": funds draining on the left, blocked on the right |
| 3. Verdict | Magic UI beams and Motion | A big green or red state, with the vault balance intact |

### Suggested next step

A starter scaffold (Vite, React, Tailwind, react-globe.gl and React Flow) driven by mock attestation events, so the interface is ready before the contracts are. I offered to write it; it has not been built yet.

## Cautions, open items and sources

**Before the pitch, verify the claims I could not check, disclose what you reused, and respect each licence.** The list below separates what came from my searches from what came only from the other AI reviews.

### Cautions

- **Disclose reused code.** Judges will ask what you wrote and what came from libraries. Keep the guard, attestation logic and policy engine as your own work and say so on a slide.
- **Check licences before copying.** hexray is MPL-2.0; veil-cli and Nightcall are MIT; Magic UI, Cult UI and ReactBits are reported as MIT; Aceternity's licence page should be read; Hover.dev and Animata licences were not confirmed. Use reference projects as inspiration, not dependencies.
- **Test WebGL on the demo laptop and projector,** and keep a recorded fallback.
- **Prototype the globe and the Sankey early,** with fake data, for about an hour before the real events are wired in.
- **No guarantee of a win.** The execution decides it.

### Open items to verify

| Claim | Where it came from | Status |
| --- | --- | --- |
| Blockaid Cosigner (April 2025), Hypernative Transaction Guard and Zodiac Roles as prior art | Review 4 | Not checked by me |
| Safe v1.4.1: module executions skip the guard (`execTransactionFromModule` has no guard call) | Review 4 | Not checked by me; cite the contract source, not the docs |
| Bybit: about $1.46B, compromised Safe{Wallet} front-end, implementation-upgrade payload | Reviews 3 to 5 | Not checked by me |
| Pocket Universe offers transaction previews and warnings; Safe supports guards with a delegatecall-blocking example | Review 2's web search | Not checked by me |
| Ledger Clear Signing stays advisory | Review 4 | Not checked by me |
| WazirX $230M (July 2024) and CoinDCX $44M (July 2025) | The Big Hack 2.0 booklet (cites CoinDesk, Business Today, Chainalysis) | From the booklet |
| Tool descriptions in the UI, web3 and visualisation sections | My web searches on 2026-11-20 | Read from search results, not installed or tested |

### Still needed from you

- Team size and who can write and test Solidity, so the hour-by-hour split, contract interfaces and 40-fixture list can be written.
- Whether you want the starter scaffold built.

### Sources

From the Big Hack 2.0 problem statements booklet (provided by you): pages 2 to 15, including the track rules on pages 3, 7 and 11, problem B1 on page 8, problem B3 on page 10 and the judging criteria on page 15.

From my web searches:

- [FunFactory404/Globe](https://github.com/FunFactory404/Globe)
- [react-globe.gl](https://github.com/vasturiano/react-globe.gl) and its [examples page](https://vasturiano.github.io/react-globe.gl)
- [r3f-globe on Socket](https://socket.dev/npm/package/r3f-globe)
- [Code-Parth/geo-globe-three](https://github.com/code-parth/geo-globe-three)
- [CesiumJS](https://github.com/ehtick/cesium), [cesiumkit](https://pypi.org/project/cesiumkit/0.9.0/) and [olcs](https://npmjs.com/package/olcs)
- [Animated component sourcing skill (licences)](https://github.com/AnayDhawan/Components)
- [Ten animated UI component libraries (DEV Community)](https://dev.to/jay_sarvaiya_reactjs/10-trending-animated-ui-component-libraries-2025-edition-1af4)
- [Magic UI on Product Hunt](https://www.producthunt.com/products/magic-ui?page=2)
- [hexray](https://github.com/onyb/hexray)
- [veil-cli](https://github.com/summusforge-lab/veil-cli)
- [WhatsABI discussion in ethui](https://www.github.com/ethui/ethui/issues/278)
- [viem decodeFunctionData](https://rc.viem.sh/docs/contract/decodeFunctionData.html) and [viem fork](https://github.com/vacekj/viem)
- [Nightcall](https://github.com/code0xff/nightcall)
- [Savvy](https://github.com/polareth/savvy)
- [0xRay](https://github.com/lazerfit/0xRay)
- [CashFlow360](https://github.com/garadieu-create/CashFlow360)
- [Sankey with React Flow (DEV Community)](https://dev.to/jannatul_ferdousmaisha_6/built-a-sankey-diagram-with-react-flow-58i0)
- [Data flow visualisation tools (Cambridge Intelligence)](https://cambridge-intelligence.com/visualization-tools-for-flow-analysis)
- [@visx/sankey](https://npmjs.com/package/@visx/sankey)
- [Safe Protocol Kit: createEnableGuardTx](https://docs.safe.global/reference-sdk-protocol-kit/safe-guards/createenableguardtx)
- [safe-kit (Python)](https://pypi.org/project/safe-kit/)
