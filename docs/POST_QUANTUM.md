# Experimental hybrid verifier signatures

## Status

The backend CLI contains an off-chain prototype that signs the same existing IntentLock EIP-712 attestation digest with:

1. An ECDSA-secp256k1 key, matching the verifier's current address identity.
2. An ML-DSA-65 key, using the NIST FIPS 204 digital-signature standard.

The implementation uses the pinned `@noble/post-quantum` 0.7.1 JavaScript package. This is an experimental local tool, not an on-chain security feature. The current API, registry, and guard continue to accept and enforce ECDSA signatures only. The hybrid envelope is not sent to them.

This prototype stores both private keys in one local directory and signs through one CLI process. It therefore does not create independent operator or device trust domains; compromising that machine may expose both keys. It demonstrates the signature format and verification path, not a hardened production key-management service. The library pin is not an independent review of this integration.

## CLI

Run these commands from `backend/`, or type them at the `intentlock>` prompt:

```sh
npm run intentlock -- hybrid keygen --out ./.intentlock-hybrid/verifier-1
npm run intentlock -- hybrid sign attestation-input.json --keys ./.intentlock-hybrid/verifier-1 --out attestation.hybrid.json
npm run intentlock -- hybrid verify attestation.hybrid.json --keys ./.intentlock-hybrid/verifier-1 --chain-id 31337 --registry 0xYourConfiguredRegistry
```

`hybrid keygen` creates a local ECDSA and ML-DSA-65 keypair. Private keys are written to separate files with mode `0600`; the containing directory is mode `0700`. The command prints public key fingerprints and paths, never private key material. `public.json` contains only public key data and can be exchanged with the verifier-set operator over a trusted channel.

`hybrid sign` expects a JSON object with `domain.chainId`, `domain.verifyingContract`, and a complete `attestation` object using the existing protocol fields. It recomputes the EIP-712 digest, signs it with both private keys, and writes an envelope. It does not call the backend, submit a registry attestation, or execute a Safe transaction.

`hybrid verify` requires the expected chain ID and registry address, recomputes the digest, checks the ECDSA signature, checks the ML-DSA signature, and requires both public keys to match the trusted `public.json` in `--keys`. A valid envelope proves only that both corresponding keys signed that exact typed digest and that the supplied key pair matches the supplied trusted descriptor. Verifier membership itself remains an out-of-band trust decision.

The envelope is created with mode `0600` and the output command refuses to overwrite existing files. It contains signatures and public keys, not private keys.

## Security boundary

- The ML-DSA signature uses the same chain ID, registry address, and attestation fields as the ECDSA EIP-712 digest, plus the fixed ML-DSA context `IntentLock Hybrid Verifier Prototype v1`.
- The envelope format is versioned as `intentlock.hybrid-verifier-envelope.v1`.
- Successful CLI verification is **not** registry acceptance, verifier quorum, or chain authorization.
- The ECDSA signature remains the only verifier signature accepted by the current on-chain registry and guard.
- Safe owner signatures and registry administration remain classical. This does not make the Safe or IntentLock execution path quantum-resistant.
- No Solidity ABI, EIP-712 fields/domain, decision enum, fixture outcome, or deployment configuration changes under this decision.

## Claims

Allowed: “We have an off-chain prototype that signs one IntentLock attestation digest with both ECDSA and ML-DSA-65 and verifies both signatures against a trusted local public-key descriptor.”

Not allowed: “IntentLock execution is quantum-safe,” “Quai verifies ML-DSA signatures,” or “the Safe is post-quantum protected.” Those claims require an on-chain verification path, protocol/key-management changes, chain support, gas analysis, and independent human cryptographic and contract review.
