# IntentLock

IntentLock is a prototype Safe multisig guard that binds independent verifiers' structured review of a supported transaction to its exact Safe transaction digest. Before execution, the guard checks the attestation and policy on-chain. Unsupported or mismatched transactions fail closed.

## What it does

- Decodes a bounded set of Safe actions and derives a canonical, versioned intent.
- Uses independent EIP-712 verifier attestations over the transaction digest and intent.
- Applies policy such as recipient allowlists, amount limits, and exact token code hashes.
- Rejects `DELEGATECALL` as an unconditional defense-in-depth rule.
- Records fixture outcomes separately from synthetic examples and UI activity.

The current backend slice supports native transfers and policy-configured ERC-20 transfers. Its API, configuration, and limits are documented in [backend/README.md](backend/README.md). The full on-chain Safe registry/guard integration, timelock, end-to-end execution flow, and UI connection are still in progress.

The sponsor-required Quai Orchard Cyprus-1 deployment path is being prepared separately from Anvil. See [docs/QUAI_ORCHARD.md](docs/QUAI_ORCHARD.md) for the verified endpoint, compiler discrepancy, build/preflight commands, deployment safeguards, and current limitations. No Orchard transaction has been broadcast.

## Project docs

- [Project overview and documentation index](docs/README.md)
- [Protocol and API contracts](docs/PROTOCOL.md)
- [Smart-contract specification](docs/CONTRACTS.md)
- [Decoder and policy boundaries](docs/DECODER_AND_POLICY.md)
- [Fixture catalog](docs/fixtures/catalog.json)
- [Verification and evidence rules](docs/VERIFICATION.md)
- [Fixture report format and CLI](docs/evidence/RESULTS_FORMAT.md)
- [Development setup](docs/SETUP.md)
- [Demo runbook](docs/DEMO_RUNBOOK.md)
- [Quai Orchard integration](docs/QUAI_ORCHARD.md)

## Run the evidence report example

The example results are explicitly synthetic; they demonstrate the report format and are not project test results or chain evidence.

```sh
python3 scripts/report_fixtures.py docs/evidence/sample-results.synthetic.json
```

## Safety and scope

IntentLock is a local-chain proof of concept, not an audited or production-ready wallet security product. It does not understand arbitrary calldata or guarantee safe outcomes for supported calls. Unknown and ambiguous calls must fail closed. The UI owner supplies the design through Figma; mocked data must remain labeled and must never be presented as chain evidence.
