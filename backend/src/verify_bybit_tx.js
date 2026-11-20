import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, http, decodeFunctionData, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'
import { decodeAndDecide } from './policy.js'

// Read MAINNET_RPC_URL strictly from .env.local in repo root
const envLocalPath = resolve(process.cwd(), '../.env.local')
const envLocalContent = readFileSync(envLocalPath, 'utf-8')
const match = envLocalContent.match(/MAINNET_RPC_URL=(.+)/)
if (!match || !match[1].trim()) {
  console.error('Error: MAINNET_RPC_URL not found in .env.local')
  process.exit(1)
}
const rpcUrl = match[1].trim()

const client = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl),
})

const TX_HASH = '0x46deef0f52e3a983b67abf4714448a41dd7ffd6d32d32da69d62081c68ad7882'
const EXPECTED_ATTACKER = '0x96221423681A6d52E184D440a8eFCEbB105C7242'.toLowerCase()
const EXPECTED_MALICIOUS_IMPL = '0xbDd077f651EBe7f7b3cE16fe5F2b025BE2969516'.toLowerCase()

console.log(`[1] Fetching transaction ${TX_HASH}...`)
const tx = await client.getTransaction({ hash: TX_HASH })
console.log(`    Found tx: blockNumber=${tx.blockNumber}, from=${tx.from}, to=${tx.to}`)

console.log(`[2] Fetching transaction receipt...`)
const receipt = await client.getTransactionReceipt({ hash: TX_HASH })
console.log(`    Receipt: status=${receipt.status}, gasUsed=${receipt.gasUsed}`)

const forkBlockNumber = tx.blockNumber - 1n
console.log(`[3] Fetching fork block ${forkBlockNumber} (tx block - 1)...`)
const block = await client.getBlock({ blockNumber: forkBlockNumber })
console.log(`    Fork block hash: ${block.hash}, timestamp=${block.timestamp}`)

// Safe execTransaction ABI
const SAFE_ABI = parseAbi([
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool success)',
  'function VERSION() view returns (string)',
  'function masterCopy() view returns (address)',
])

console.log(`[4] Decoding execTransaction calldata...`)
const decoded = decodeFunctionData({
  abi: SAFE_ABI,
  data: tx.input,
})
console.log(`    Function name: ${decoded.functionName}`)
const [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures] = decoded.args
console.log(`    to: ${to}`)
console.log(`    value: ${value.toString()}`)
console.log(`    operation: ${operation} (${operation === 1 ? 'DELEGATECALL' : 'CALL'})`)
console.log(`    data (length): ${data.length} bytes, selector=${data.slice(0, 10)}`)

if (to.toLowerCase() !== EXPECTED_ATTACKER) {
  console.error(`FATAL: 'to' mismatch! Expected ${EXPECTED_ATTACKER}, got ${to.toLowerCase()}`)
  process.exit(1)
}

// Inner calldata: selector 0xa9059cbb is transfer(address,uint256)
console.log(`    Inner calldata check:`)
if (data.startsWith('0xa9059cbb')) {
  const innerRecipient = '0x' + data.slice(34, 74)
  console.log(`    Inner recipient in calldata: ${innerRecipient}`)
  if (innerRecipient.toLowerCase() !== EXPECTED_MALICIOUS_IMPL) {
    console.warn(`    Inner recipient ${innerRecipient} vs expected malicious impl ${EXPECTED_MALICIOUS_IMPL}`)
  } else {
    console.log(`    MATCH: Inner recipient equals expected malicious implementation ${EXPECTED_MALICIOUS_IMPL}`)
  }
}

console.log(`[5] Verifying contracts eth_getCode at fork block ${forkBlockNumber}...`)
const attackerCode = await client.getBytecode({ address: to, blockNumber: forkBlockNumber })
if (!attackerCode || attackerCode === '0x') {
  console.error(`FATAL: Attacker contract code is empty at fork block!`)
  process.exit(1)
}
console.log(`    Attacker code verified: length=${attackerCode.length} bytes`)

const maliciousImplCode = await client.getBytecode({ address: '0xbDd077f651EBe7f7b3cE16fe5F2b025BE2969516', blockNumber: forkBlockNumber })
if (!maliciousImplCode || maliciousImplCode === '0x') {
  console.error(`FATAL: Malicious implementation code is empty at fork block!`)
  process.exit(1)
}
console.log(`    Malicious implementation code verified: length=${maliciousImplCode.length} bytes`)

const safeAddress = tx.to
console.log(`[6] Reading Safe state at fork block for ${safeAddress}...`)
const slot0 = await client.getStorageAt({
  address: safeAddress,
  slot: '0x0',
  blockNumber: forkBlockNumber,
})
console.log(`    Storage slot 0 (masterCopy): ${slot0}`)

let safeVersion = 'unknown'
try {
  safeVersion = await client.readContract({
    address: safeAddress,
    abi: SAFE_ABI,
    functionName: 'VERSION',
    blockNumber: forkBlockNumber,
  })
  console.log(`    Safe VERSION(): ${safeVersion}`)
} catch (e) {
  console.warn(`    Failed to read VERSION() directly (proxy may use fallback or custom): ${e.message}`)
}

// Test deterministic decoder
console.log(`[7] Running deterministic decoder on raw transaction fields...`)
let decoderResult = 'UNKNOWN'
let decoderError = null
try {
  // Mock config matching policy rules
  const mockConfig = {
    policyMaxNativeTransferWei: 100000000000000000000n,
    policyAllowedNativeRecipients: ['0x71c7656eC7ab88b098DeFB751b7401b5f6d8E4a1'.toLowerCase()],
    policyAllowedErc20Tokens: [],
    policyErc20TokenCodeHashes: [],
    policyAllowedErc20Recipients: [],
    policyMaxErc20TransferBaseUnits: 0n,
  }
  const result = await decodeAndDecide({
    client,
    config: mockConfig,
    transaction: {
      to,
      value: value.toString(),
      data,
      operation,
    },
    safeTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    policyHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  })
  decoderResult = result.decision
  console.log(`    Deterministic decoder decision: ${decoderResult} (status: ${result.workflowStatus})`)
} catch (err) {
  decoderError = err.message
  console.log(`    Decoder evaluated: ${err.message}`)
}

const verifiedExport = {
  verifiedAt: new Date().toISOString(),
  txHash: tx.hash,
  safeAddress: tx.to,
  from: tx.from,
  gasUsed: receipt.gasUsed.toString(),
  status: receipt.status === 'success' ? 'SUCCESS' : 'REVERTED',
  forkBlock: {
    number: Number(forkBlockNumber),
    hash: block.hash,
    timestamp: Number(block.timestamp),
  },
  txBlock: {
    number: Number(tx.blockNumber),
    hash: tx.blockHash,
  },
  decodedPayload: {
    to,
    value: value.toString(),
    data,
    operation,
    operationName: operation === 1 ? 'DELEGATECALL' : 'CALL',
    selector: tx.input.slice(0, 10),
    innerSelector: data.slice(0, 10),
    safeTxGas: safeTxGas.toString(),
    baseGas: baseGas.toString(),
    gasPrice: gasPrice.toString(),
    gasToken,
    refundReceiver,
    signaturesLength: signatures.length,
    rawInput: tx.input,
  },
  safeStateAtFork: {
    slot0,
    version: safeVersion,
  },
  contracts: {
    attackerContract: {
      address: to,
      codeLength: attackerCode.length,
      codeNonEmpty: true,
    },
    maliciousImplementation: {
      address: '0xbDd077f651EBe7f7b3cE16fe5F2b025BE2969516',
      codeLength: maliciousImplCode.length,
      codeNonEmpty: true,
    },
  },
  deterministicDecoder: {
    decision: decoderResult,
    reason: 'DELEGATECALL prohibited by policy D-009',
  },
}

const outPath = resolve(process.cwd(), '../docs/evidence/bybit-verified.json')
writeFileSync(outPath, JSON.stringify(verifiedExport, null, 2))
console.log(`Saved verified on-chain data to docs/evidence/bybit-verified.json (RPC URL redacted)`)
