import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES, CliError, redact, formatOutput } from '../src/output.js';
import { BUILTIN_PROFILES, resolveProfile, validateProfile, redactProfile } from '../src/profiles.js';

const exec = promisify(execFile);
const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/cli.js');

test('CLI --help prints usage and exits with code 0', async () => {
  const { stdout } = await exec('node', [cliPath, '--help']);
  assert.match(stdout, /INTENTLOCK  POLICY TOOLKIT/);
  assert.match(stdout, /--profile/);
  assert.match(stdout, /--confirm-safe-tx-hash/);
});

test('CLI --version prints valid version schema', async () => {
  const { stdout } = await exec('node', [cliPath, '--version', '--output', 'json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.schemaVersion, 'intentlock.cli.v1');
  assert.equal(parsed.status, 'SUCCESS');
  assert.equal(parsed.data.cliVersion, '0.2.0-prod');
});

test('CLI rejects unknown command with exit code 2 (INVALID_ARGUMENT)', async () => {
  await assert.rejects(
    async () => exec('node', [cliPath, 'nonexistent-command']),
    (err) => {
      assert.equal(err.code, EXIT_CODES.INVALID_ARGUMENT);
      assert.match(err.stderr, /Unknown command/);
      return true;
    }
  );
});

test('Output redaction masks sensitive keys and private keys', () => {
  const payload = {
    user: 'alice',
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    secretToken: 'secret-val',
    signatures: ['0xabcd'],
  };
  const cleaned = redact(payload);
  assert.equal(cleaned.privateKey, '[REDACTED]');
  assert.equal(cleaned.secretToken, '[REDACTED]');
  assert.equal(cleaned.signatures[0], '[REDACTED_SIGNATURE]');
  assert.equal(cleaned.user, 'alice');
});

test('Builtin profiles validate correctly', () => {
  assert.ok(BUILTIN_PROFILES['anvil-local']);
  assert.ok(BUILTIN_PROFILES['orchard-cyprus1']);
  validateProfile(BUILTIN_PROFILES['anvil-local']);
  validateProfile(BUILTIN_PROFILES['orchard-cyprus1']);
});

test('Profile redaction ensures no secrets are leaked', () => {
  const prof = { ...BUILTIN_PROFILES['anvil-local'], privateKey: '0x123' };
  const safe = redactProfile(prof);
  assert.equal(safe.privateKey, undefined);
  assert.equal(safe.name, 'anvil-local');
});

test('Profile command lists builtin profiles', async () => {
  const { stdout } = await exec('node', [cliPath, 'profile', 'list', '--output', 'json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, 'SUCCESS');
  assert.ok(Array.isArray(parsed.data.profiles));
  assert.equal(parsed.data.profiles.length, 2);
});

test('Policy validate detects valid policy shape', async () => {
  const policyFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../quai/policy.orchard.json');
  const { stdout } = await exec('node', [cliPath, 'policy', 'validate', policyFile, '--output', 'json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, 'SUCCESS');
  assert.equal(parsed.data.valid, true);
  assert.ok(parsed.data.policyHash);
});

test('Execute fails without required --confirm-safe-tx-hash flag', async () => {
  await assert.rejects(
    async () => exec('node', [cliPath, 'execute', 'prop-123']),
    (err) => {
      assert.equal(err.code, EXIT_CODES.INVALID_ARGUMENT);
      assert.match(err.stderr, /Non-interactive execution requires confirmation flag/);
      return true;
    }
  );
});
