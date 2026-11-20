# Third-party software and attribution

This is an inventory of candidates named in the project brief, not a statement that any package has been installed or reused. Before copying source or adding a dependency, inspect the exact repository/package version and its bundled license. Record any modifications, notices, and source links.

| Project / package | Intended use | License/status from brief | Required action before reuse |
|---|---|---|---|
| Safe Smart Account `v1.4.1` | Actual Safe integration and source reference | Safe contracts are LGPL-3.0-only per tagged source | Include applicable license/notice; record exact commit and compiler settings; do not copy Safe source without preserving notices |
| Foundry / Anvil | Local chain, Solidity builds/tests | License not recorded in supplied brief | Verify current license/version and include standard notices if redistributed |
| viem | EVM transaction encoding, decoding, EIP-712 utilities | License not verified in this project | Verify exact package version/license; pin in lockfile |
| hexray | Decoder architecture/reference; not a runtime dependency by default | Brief reports MPL-2.0 | Study as reference first. If source is copied/modified, assess MPL file-level obligations and retain notices/source availability as required |
| WhatsABI | Candidate bytecode/proxy analysis reference | License not checked in project | Verify exact repository/version/license; do not use remote output as approval basis |
| 4byte/OpenChain signature sources | Candidate selector metadata only | Service/data licensing not checked | Review terms, attribution, availability, and poisoning risk; not authoritative for attestations |
| Magic UI | Optional component reference only; UI is owner-managed | Brief reports MIT | Not selected; project owner decides UI dependencies and verifies their licenses |
| Paper Shaders | Optional visual shader reference named in the review | Reported as PolyForm Shield, not verified against a specific repository/version | Do not copy/use until exact source, applicable license text, restrictions, and attribution are checked; visual implementation is owner-managed |
| React Flow / Sankey / globe libraries | Visual options named in brief | Per-package licenses not verified here | Not selected; UI owner checks exact packages/licenses if used |
| ZKNoxHQ/ETHDILITHIUM | ML-DSA-44 (NIST FIPS 204) Dilithium signature verifier in Solidity | MIT License (Copyright 2025–2026 ZKNoxHQ) | Pinned commit `f9f4fe1d84e68304b425e054c273c276fe44ba11` (2026-09-16). Marked **experimental, unaudited**. Used as architecture reference and interface model for IntentLock's hybrid PQ mode. Test suite uses `MockMLDSAVerifier` matching ML-DSA-44 parameter sizes (1312-byte public key, 2420-byte signature) to decouple test reproducibility from unaudited full-EVM lattice math. Safe owner signatures remain ECDSA; this is a simulated adversary test, not a quantum-safety claim. |

## Reuse record template

For each dependency or copied snippet added to the implementation, record:

- Exact package/repository and version/commit.
- License file and URL at that pinned version.
- Whether it is a dependency, generated output, or copied/modified source.
- Required notice/attribution and modifications made.
- Security-critical use, if any, and the team's own tests/review.

Never treat an upstream package's tests or marketing as proof that IntentLock integration is secure. License compatibility is an implementation gate, not a conclusion made from the brief's tool table.
