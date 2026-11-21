import { randomUUID } from 'node:crypto';

export const EXIT_CODES = {
  SUCCESS: 0,
  INVALID_ARGUMENT: 2,
  AUTH_FAILURE: 3,
  POLICY_REFUSAL: 4,
  RPC_INCONSISTENCY: 5,
  QUORUM_NOT_MET: 6,
  EXECUTION_REVERTED: 7,
  EXECUTION_PENDING_UNKNOWN: 8,
  INTERNAL_ERROR: 10,
};

export class CliError extends Error {
  constructor(message, { code = 'INTERNAL_ERROR', exitCode = EXIT_CODES.INTERNAL_ERROR, details = null, requestId = null } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
    this.requestId = requestId;
  }
}

const SENSITIVE_KEY_PATTERN = /private.*key|secret|token|password|auth|bearer|seed|credential/i;
const PRIVATE_KEY_HEX_PATTERN = /0x[0-9a-fA-F]{64}/g;

export function redact(value, { allowSignatures = false } = {}) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, { allowSignatures }));
  }
  if (typeof value === 'object') {
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        copy[k] = '[REDACTED]';
      } else if (!allowSignatures && (k === 'signatures' || k === 'signature')) {
        copy[k] = Array.isArray(v) ? v.map(() => '[REDACTED_SIGNATURE]') : '[REDACTED_SIGNATURE]';
      } else {
        copy[k] = redact(v, { allowSignatures });
      }
    }
    return copy;
  }
  return value;
}

export function formatOutput(payload, {
  mode = 'human',
  command = 'intentlock',
  profile = 'default',
  requestId = null,
  noColor = false,
  source = 'cli',
  status = 'SUCCESS',
  allowSignatures = false,
} = {}) {
  const reqId = requestId || `req-${randomUUID().slice(0, 8)}`;
  const cleanData = redact(payload, { allowSignatures });

  if (mode === 'json') {
    return JSON.stringify({
      schemaVersion: 'intentlock.cli.v1',
      command,
      profile,
      requestId: reqId,
      generatedAt: new Date().toISOString(),
      source,
      status,
      data: cleanData,
    }, (key, val) => typeof val === 'bigint' ? val.toString() : val, 2);
  }

  if (mode === 'ndjson') {
    return JSON.stringify({
      schemaVersion: 'intentlock.cli.v1',
      command,
      profile,
      requestId: reqId,
      generatedAt: new Date().toISOString(),
      source,
      status,
      data: cleanData,
    }, (key, val) => typeof val === 'bigint' ? val.toString() : val);
  }

  // Human-readable structured mode
  const lines = [];
  const bold = (s) => (noColor ? s : `\u001b[1m${s}\u001b[0m`);
  const orange = (s) => (noColor ? s : `\u001b[38;2;255;91;20m${s}\u001b[0m`);
  const dim = (s) => (noColor ? s : `\u001b[2m${s}\u001b[0m`);

  lines.push(`${orange('INTENTLOCK')} ${dim('·')} ${bold(command.toUpperCase())} [profile: ${profile}]`);
  lines.push(dim(`Request ID: ${reqId} | Source: ${source} | Status: ${status}`));
  lines.push('──────────────────────────────────────────────────────────');

  if (cleanData && typeof cleanData === 'object' && !Array.isArray(cleanData)) {
    if (cleanData.target) lines.push(`${bold('Target:')}      ${JSON.stringify(cleanData.target)}`);
    if (cleanData.observed) lines.push(`${bold('Observed:')}    ${JSON.stringify(cleanData.observed)}`);
    if (cleanData.decision) lines.push(`${bold('Decision:')}    ${JSON.stringify(cleanData.decision)}`);
    if (cleanData.nextAction) lines.push(`${bold('Next action:')} ${JSON.stringify(cleanData.nextAction)}`);
    if (cleanData.evidence) lines.push(`${bold('Evidence:')}    ${JSON.stringify(cleanData.evidence)}`);

    if (cleanData.explanation) {
      const exp = cleanData.explanation;
      const modelTag = exp.source === 'ollama' ? `AI (${exp.aiModel || 'Ollama'})` : 'Deterministic Guard Engine';
      lines.push('');
      lines.push(bold(`[Plain English Security Analysis] · ${modelTag}`));
      lines.push(`${bold('Verdict:')}   ${exp.verdict} (Risk: ${exp.riskLevel})`);
      lines.push(`${bold('Summary:')}   ${exp.summary}`);
      lines.push(`${bold('Calldata:')}  ${exp.intentVsCalldata}`);
      if (exp.bulletPoints?.length) {
        lines.push(bold('Key Points:'));
        exp.bulletPoints.forEach((bp) => lines.push(`  • ${bp}`));
      }
      lines.push('');
    }

    // Output all remaining keys
    for (const [k, v] of Object.entries(cleanData)) {
      if (!['target', 'observed', 'decision', 'nextAction', 'evidence', 'explanation'].includes(k)) {
        lines.push(`${bold(k + ':')} ${typeof v === 'object' ? '\n' + JSON.stringify(v, null, 2) : v}`);
      }
    }
  } else {
    lines.push(typeof cleanData === 'string' ? cleanData : JSON.stringify(cleanData, null, 2));
  }

  return lines.join('\n');
}
