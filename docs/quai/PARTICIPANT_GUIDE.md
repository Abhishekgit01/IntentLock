# Quai Network Orchard — Participant Setup & Deployment Guide

**AI Coding Agent Skill | Orchard Cyprus-1 Testnet | Participant Edition**

This guide explains how to install the Quai Orchard deployment skill, set up the reference project, customize a QRC-compatible token or Solidity contract, and safely prepare a testnet deployment. **No mainnet deployment is included.**

## 1. What you will use

- **Skill ZIP:** `Quai-Orchard-Deployment-Skill-GitHub-Based.zip` (distributed by the organizers)
- **Reference project:** https://github.com/Yaswitha-Kurra/Quai-Network-Contract-Deploy-Example
- **Documentation:** https://docs.qu.ai/
- **Tools:** Node.js and npm, Git, VS Code, and a compatible coding agent (Cursor, Claude Code, or Codex)
- **Wallet:** A _new, dedicated testnet wallet_ with Orchard testnet QUAI

The skill is a set of instructions for your AI agent. It is **not** a wallet, a hosted deployment service, or a replacement for reviewing code.

## 2. Install the skill

1. Download the skill ZIP from the organizers and extract it.
2. Copy the **entire** `quai-orchard-deployment-skill` folder into one of the directories below, relative to the project folder you open in your coding agent:

| Coding agent | Project-local skill location                    |
| ------------ | ----------------------------------------------- |
| Cursor       | `.cursor/skills/quai-orchard-deployment-skill/` |
| Claude Code  | `.claude/skills/quai-orchard-deployment-skill/` |
| Codex        | `.agents/skills/quai-orchard-deployment-skill/` |

3. Ensure the copied folder contains `SKILL.md`, `references/`, `examples/`, and `scripts/`.
4. Reload your coding agent if it does not detect the skill. Skill discovery varies by agent version.

**Windows PowerShell example:** From the extracted ZIP's parent folder, copy the folder into the relevant skills directory in your project. Create the destination directory first if needed. Do not copy just `SKILL.md` without its supporting files.

## 3. Prepare the reference project

In a terminal:

```bash
git clone https://github.com/Yaswitha-Kurra/Quai-Network-Contract-Deploy-Example.git
cd Quai-Network-Contract-Deploy-Example
npm install
npx hardhat compile
```

Open the cloned project in your coding agent. If you installed the skill into a different project, either install it into this cloned project too or configure the agent to access the original skill directory.

**Important:** Do **not** reuse a `.env` file or any private key from the public reference repository. If a `.env` was cloned, do not run deployment using it. Replace it with your own fresh local configuration; ensure `.env` is in `.gitignore`. Never commit or paste a private key into chat.

## 4. Configure Orchard safely

Use a fresh testnet-only wallet. Create or replace your local `.env` with the configuration expected by the reference project:

```dotenv
RPC_URL=<current official Orchard Cyprus-1 RPC URL>
CYPRUS1_PK=<private key of your dedicated testnet wallet>
CHAIN_ID=15000
```

Verify the RPC endpoint in official Quai documentation before entering it. Do not assume a previously published endpoint still works. Keep the key only in your local environment; never share screenshots or logs containing secrets.

The skill targets **Orchard Cyprus-1, chain ID 15000**. Obtain testnet QUAI using the currently supported official faucet or event organizer instructions. Do not use a mainnet wallet with funds.

## 5. Ask the AI agent to build your contract

Open the coding agent chat in your project and paste one of these prompts:

**QRC-compatible fungible token:**

> Use the Quai Orchard Contract Deployment skill. Create a QRC-compatible fungible token named HackToken (HACK) with 1,000,000 initial tokens. Make the supply fixed (no public faucet and no further minting), use the existing Quai reference deployment architecture, write meaningful tests, and stop before broadcasting any transaction.

**NFT:**

> Use the Quai Orchard Contract Deployment skill. Create an NFT contract using the supported ERC721-compatible interface, with owner-controlled minting and metadata URIs. Explain any Quai-specific compatibility assumptions, compile it, add tests, and prepare an Orchard Cyprus-1 deployment without broadcasting.

**Custom Solidity:**

> Use the Quai Orchard Contract Deployment skill to review my existing Solidity contract. Preserve my business logic, identify privileged operations and security risks, compile and test it, then prepare an Orchard Cyprus-1 deployment plan. Do not deploy until I explicitly approve.

QRC-compatible token patterns commonly reuse OpenZeppelin interfaces, but **do not assume every Ethereum feature is automatically Quai-native**. Ask the agent to check compatibility with the target network and current docs.

## 6. Review, compile, and test

Before deployment, ask your agent to explain:

- Contract name, constructor arguments, token supply, and owner permissions
- Who can mint, burn, pause, upgrade, or withdraw (if applicable)
- Any unrestricted faucet or unlimited minting function
- Whether the code compiles and whether real tests cover normal and failure cases
- Which wallet will deploy and what transaction will be sent

Run:

```bash
npx hardhat compile
```

The reference repository's `npm test` may be a placeholder. **Do not treat it as proof of passing tests.** Have the agent create real Hardhat tests and run the actual test command it configures. Fix failures before proceeding.

Optional static helper, from the project root (adjust the path to wherever the skill is installed):

```bash
node .cursor/skills/quai-orchard-deployment-skill/scripts/check-project.js .
```

For Claude Code or Codex, replace `.cursor/skills/` with the corresponding skill directory. This helper checks local project structure only; it does **not** prove the contract is safe or deployable.

## 7. Deploy to Orchard (only after approval)

Ask your agent to confirm the following before broadcasting: network **Orchard Cyprus-1**, chain ID **15000**, funded testnet wallet, exact contract and constructor arguments, successful compilation/tests, and the expected admin powers.

When all checks pass and **you explicitly approve**, the reference workflow uses `quais.JsonRpcProvider`, `quais.Wallet`, Quai IPFS metadata, and `quais.ContractFactory` to deploy. The deployment script may need updating to point to your actual contract and constructor parameters.

The reference command is:

```bash
npx hardhat run scripts/deploy.js --network cyprus1
```

**Do not run this blindly.** Inspect `scripts/deploy.js` and `hardhat.config.js` first; a hardcoded contract name or incorrect network configuration can deploy the wrong contract. If metadata upload or connectivity fails, stop and troubleshoot instead of bypassing checks.

## 8. Save your deployment evidence

After a confirmed deployment, record:

| Field                          | Value              |
| ------------------------------ | ------------------ |
| Project / team                 | __________________ |
| Contract name                  | __________________ |
| Network                        | Orchard Cyprus-1   |
| Chain ID                       | 15000              |
| Contract address               | __________________ |
| Transaction hash               | __________________ |
| ABI / artifact path            | __________________ |
| Explorer / verification status | __________________ |
| GitHub repository link         | __________________ |

Only mark explorer verification as complete if it has actually been checked. Keep the ABI and deployment details with your project; never publish your private key.

## 9. Troubleshooting

| Problem                   | What to check                                                          |
| ------------------------- | ---------------------------------------------------------------------- |
| Skill not detected        | Confirm full folder path, `SKILL.md`, agent compatibility, then reload |
| `npm install` fails       | Node.js/npm versions, network access, dependency errors                |
| Compile error             | Solidity 0.8.20 compatibility, imports, OpenZeppelin version           |
| Tests do not run          | Reference may have a placeholder `npm test`; create real tests         |
| RPC connection fails      | Official current Orchard endpoint, network access, provider settings   |
| Chain mismatch            | Stop; confirm Orchard Cyprus-1 and chain ID 15000                      |
| Insufficient balance      | Fund the dedicated wallet with testnet QUAI                            |
| Deployment wrong contract | Inspect artifact name and constructor args in `scripts/deploy.js`      |
| Metadata upload fails     | Inspect IPFS plugin configuration; do not silently skip it             |

## 10. Participant submission checklist

- [ ] Skill installed and recognized by the coding agent
- [ ] Own testnet wallet created; no shared or public credentials used
- [ ] Contract source code reviewed and committed without secrets
- [ ] Compilation successful
- [ ] Meaningful tests written and passing
- [ ] Deployment approved and executed on Orchard Cyprus-1
- [ ] Contract address and transaction hash recorded
- [ ] ABI and source repository link included
- [ ] Security assumptions and privileged roles documented

## Useful links

- Reference repository: https://github.com/Yaswitha-Kurra/Quai-Network-Contract-Deploy-Example
- Official Quai docs: https://docs.qu.ai/
- Quai website: https://www.qu.ai/

---

**Organizer note:** This is a participant guide for a skill package that has not been verified by a live Orchard deployment in this environment. Organizers should complete an end-to-end deployment rehearsal and verify all current RPC/faucet instructions before broad distribution. The skill supports QRC-compatible token patterns **and** user-written custom Solidity; it does not support mainnet or cross-zone SolidityX deployments.
