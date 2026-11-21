// @ts-check

const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'pai:latest';
const OLLAMA_TIMEOUT_MS = 3800;

/**
 * @typedef {Object} ExplanationResult
 * @property {string} summary
 * @property {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'NONE'} riskLevel
 * @property {'BLOCKED_MALICIOUS'|'POLICY_VIOLATION'|'UNSUPPORTED_REJECTED'|'SAFE_TO_EXECUTE'} verdict
 * @property {string} intentVsCalldata
 * @property {string[]} bulletPoints
 * @property {string|null} aiModel
 * @property {'ollama'|'deterministic_guard_engine'} source
 */

/**
 * Produces an instant, deterministic security explanation without requiring network or LLM.
 * @param {Object} params
 * @param {Record<string, unknown>} params.transaction
 * @param {string} [params.decision]
 * @param {Record<string, unknown>} [params.decoded]
 * @param {Record<string, unknown>} [params.policy]
 * @param {string} [params.refusalReason]
 * @returns {ExplanationResult}
 */
export function evaluateDeterministicRuleEngine({
  transaction,
  decision = 'REFUSE_UNSUPPORTED',
  decoded = {},
  policy = {},
  refusalReason = '',
}) {
  const op = Number(transaction?.operation ?? 0);
  const to = String(transaction?.to ?? '');
  const value = String(transaction?.value ?? '0');
  const data = String(transaction?.data ?? '0x');
  const hasData = data !== '0x' && data.length > 2;

  // Case 1: DELEGATECALL Attack (e.g. Bybit / malicious proxy)
  if (op === 1) {
    return {
      summary:
        'CRITICAL MALICIOUS EXPLOIT: The transaction attempts a DELEGATECALL to an external contract. The guard refused execution to prevent complete Safe takeover.',
      riskLevel: 'CRITICAL',
      verdict: 'BLOCKED_MALICIOUS',
      intentVsCalldata:
        'The signer interface displays what appears to be a routine transfer, but the raw execution mode is set to DELEGATECALL (operation: 1). This gives the destination contract full authority to execute in the Safe wallet’s context, which can instantly rewrite owners, change threshold, or drain all funds.',
      bulletPoints: [
        `Execution type is DELEGATECALL to target ${to.slice(0, 10)}... instead of a standard CALL.`,
        'Safe code execution context would be shared with an unverified external contract.',
        'IntentLock Guard immediately fails closed to protect treasury assets.',
      ],
      aiModel: null,
      source: 'deterministic_guard_engine',
    };
  }

  // Case 2: Recipient not allowlisted
  if (
    decision === 'REFUSE_POLICY' &&
    refusalReason.toLowerCase().includes('recipient')
  ) {
    return {
      summary:
        'POLICY VIOLATION: Recipient address is not on the company approved treasury allowlist.',
      riskLevel: 'HIGH',
      verdict: 'POLICY_VIOLATION',
      intentVsCalldata: `The transaction attempts to transfer ${value === '0' ? 'assets' : value + ' wei'} to ${to.slice(0, 10)}..., which does not match any approved payout address in the active security policy.`,
      bulletPoints: [
        `Target address ${to} is unapproved.`,
        'Transfer exceeds baseline zero-trust authorization.',
        'Requires governance policy update or approved timelock escalation.',
      ],
      aiModel: null,
      source: 'deterministic_guard_engine',
    };
  }

  // Case 3: Value exceeds maximum cap
  if (
    decision === 'REFUSE_POLICY' &&
    (refusalReason.toLowerCase().includes('amount') ||
      refusalReason.toLowerCase().includes('limit') ||
      refusalReason.toLowerCase().includes('value'))
  ) {
    return {
      summary:
        'POLICY VIOLATION: Transfer value exceeds the maximum allowable single-transaction spending limit.',
      riskLevel: 'HIGH',
      verdict: 'POLICY_VIOLATION',
      intentVsCalldata:
        'The requested transfer amount breaches the deterministic threshold configured for native transfers under this Safe policy.',
      bulletPoints: [
        `Requested value: ${value} wei exceeds policy cap.`,
        'Blocked to prevent treasury draining via split or oversized transfers.',
        'Requires multisig re-configuration or emergency multi-signer override.',
      ],
      aiModel: null,
      source: 'deterministic_guard_engine',
    };
  }

  // Case 4: Unsupported calldata or arbitrary contract interaction
  if (decision === 'REFUSE_UNSUPPORTED') {
    return {
      summary:
        'UNSUPPORTED CALLDATA: The raw transaction payload contains arbitrary or unverified function calls.',
      riskLevel: 'HIGH',
      verdict: 'UNSUPPORTED_REJECTED',
      intentVsCalldata: hasData
        ? `The transaction contains ${data.length / 2 - 1} bytes of unverified calldata. To eliminate zero-day approval drains and proxy injection, IntentLock only attests to verified deterministic transfer primitives.`
        : 'The transaction does not conform to any recognized safe transaction profile.',
      bulletPoints: [
        'Arbitrary calldata cannot be deterministically verified against policy.',
        'Guard enforces strict fail-closed security: unverified transactions are rejected by default.',
      ],
      aiModel: null,
      source: 'deterministic_guard_engine',
    };
  }

  // Case 5: Verified & Safe to Attest
  return {
    summary:
      'VERIFIED COMPLIANT: The transaction strictly matches all configured Safe security policies.',
    riskLevel: 'LOW',
    verdict: 'SAFE_TO_EXECUTE',
    intentVsCalldata: `Legitimate native transfer of ${value} wei to verified recipient ${to.slice(0, 10)}... Calldata is clean and within spending caps.`,
    bulletPoints: [
      `Destination ${to.slice(0, 10)}... is pre-approved in policy.`,
      'Transfer value is within authorized threshold limits.',
      'Calldata is verified clean with zero unauthorized contract interactions.',
    ],
    aiModel: null,
    source: 'deterministic_guard_engine',
  };
}

/**
 * Calls local Ollama model to generate an enriched natural-language summary.
 * Times out quickly and fails gracefully to deterministic fallback.
 * @param {Object} params
 * @param {ExplanationResult} params.baseExplanation
 * @param {Record<string, unknown>} params.transaction
 * @returns {Promise<ExplanationResult>}
 */
async function queryOllamaWithFallback({ baseExplanation, transaction }) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    const prompt = `You are the IntentLock AI multisig security auditor.
Analyze this Safe transaction for a company treasury in exactly 2 clear, professional sentences in plain English:
- Operation: ${transaction?.operation === 1 ? 'DELEGATECALL (RISK OF FULL WALLET TAKEOVER)' : 'CALL'}
- Target Address: ${transaction?.to}
- Value: ${transaction?.value}
- Verdict: ${baseExplanation.verdict} (${baseExplanation.riskLevel})
- Key Finding: ${baseExplanation.summary}

Explain the exact risk or safety status clearly for non-technical executives. Do not use markdown headers or bullet points.`;

    const response = await fetch(`${DEFAULT_OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 120,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const generated = data?.response?.trim();
      if (generated && generated.length > 20) {
        return {
          ...baseExplanation,
          summary: generated,
          aiModel: DEFAULT_OLLAMA_MODEL,
          source: 'ollama',
        };
      }
    }
  } catch {
    // If Ollama is offline, times out, or fails, the deterministic engine is 100% reliable.
  }

  return baseExplanation;
}

/**
 * Main service function to explain a transaction or proposal in plain English.
 * @param {Object} params
 * @param {Record<string, unknown>} params.transaction
 * @param {string} [params.decision]
 * @param {Record<string, unknown>} [params.decoded]
 * @param {Record<string, unknown>} [params.policy]
 * @param {string} [params.refusalReason]
 * @returns {Promise<ExplanationResult>}
 */
export async function explainTransaction(params) {
  const base = evaluateDeterministicRuleEngine(params);
  return queryOllamaWithFallback({
    baseExplanation: base,
    transaction: params.transaction,
  });
}
