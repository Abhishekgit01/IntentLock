/**
 * Copy and animation parameters for Act 4 (Future).
 * Everything here is a research direction. None of it is implemented.
 */

export interface PqArt {
  kind: 'pq'
  from: string
  to: string
  captions: [string, string]
  cycleMs: number
}
export interface DiffRound {
  id: string
  outputs: [string, string]
  result: 'ATTEST' | 'QUARANTINED'
  resultNote: string
}
export interface DiffArt {
  kind: 'diff'
  input: string
  verifiers: [string, string]
  outputLabel: string
  rounds: DiffRound[]
  roundMs: number
}
export interface SchemaArt {
  kind: 'schema'
  schemaTitle: string
  fields: string[]
  versionsTitle: string
  versions: string[]
  chainsTitle: string
  chains: string[]
}
export interface RoadmapItem {
  id: string
  title: string
  body: string
  note?: string
  art: PqArt | DiffArt | SchemaArt
}

export const ROADMAP = {
  eyebrow: 'Act 4 · Future',
  banner: 'ROADMAP. NOT IMPLEMENTED.',
  title: 'What could come next',
  intro: 'Three research directions. None of them exist in this workbench today.',
  statusChip: 'Planned',
  items: [
    {
      id: 'pq',
      title: 'Post-quantum verifier keys',
      body: 'Verifier attestations could move from ECDSA keys to a post-quantum signature scheme.',
      note: 'Safe owner signatures remain ECDSA today; on-chain PQ verification is costly. Research item.',
      art: { kind: 'pq', from: 'ECDSA', to: 'PQ signature', captions: ['Compact signature', 'Far larger signature'], cycleMs: 3000 },
    },
    {
      id: 'diff',
      title: 'Differential decoding',
      body: 'Two verifiers built independently decode the same payload. If their outputs differ, the transaction is held, not executed.',
      art: {
        kind: 'diff',
        input: 'Same calldata',
        verifiers: ['Verifier A (build 1)', 'Verifier B (build 2)'],
        outputLabel: 'Decoded intent',
        roundMs: 3400,
        rounds: [
          { id: 'match', outputs: ['Send 0.1 ETH to cold wallet', 'Send 0.1 ETH to cold wallet'], result: 'ATTEST', resultNote: 'Outputs match' },
          { id: 'differ', outputs: ['Send 0.1 ETH to cold wallet', 'DELEGATECALL upgradeTo(0xBAD0…5e1c)'], result: 'QUARANTINED', resultNote: 'Outputs differ' },
        ],
      },
    },
    {
      id: 'schema',
      title: 'Open attestation schema, more Safe versions and chains',
      body: 'Publish the attestation format so independent verifiers can interoperate, then widen what it covers.',
      art: {
        kind: 'schema',
        schemaTitle: 'attestation schema (draft)',
        fields: ['digest', 'intentHash', 'policyHash', 'validUntil', 'signer'],
        versionsTitle: 'Safe versions',
        versions: ['Safe 1.3.x', 'Safe 1.4.x', 'Next release'],
        chainsTitle: 'Chains',
        chains: ['Local dev chain', 'Public testnet', 'More chains, to be chosen'],
      },
    },
  ] as RoadmapItem[],
}
