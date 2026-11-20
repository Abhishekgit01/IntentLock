# IntentLock

IntentLock is a prototype specification for checking a multisig transaction's decoded intent before execution. It combines independent intent verification with an on-chain Safe guard and a narrowly scoped timelock for one administrative action.

The implementation requirements, trust boundaries, fixture catalog, demo procedures, and evidence rules are in [`docs/README.md`](docs/README.md). The initial backend scaffold is in [`backend/README.md`](backend/README.md). The project owner supplies the complete UI through Figma; this repository documents the system behavior and data contracts the UI consumes.

This repository contains the first backend/API slice plus specifications and planning documents. The Safe registry/guard integration, on-chain execution adapter, complete verifier workflow, and UI connection are still in progress. A documented behavior or API scaffold is not evidence that the full protection flow has been implemented, tested, audited, or made production-ready.
