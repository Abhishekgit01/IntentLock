import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { isHex } from 'viem';

export const SIGNER_ROLES = {
  VERIFIER_ATTESTATION: 'VERIFIER_ATTESTATION',
  SAFE_OWNER: 'SAFE_OWNER',
  RELAYER: 'RELAYER',
  REGISTRY_ADMIN: 'REGISTRY_ADMIN',
  POST_QUANTUM: 'POST_QUANTUM',
};

export class LocalFileSignerProvider {
  constructor(keyFilePath, role = SIGNER_ROLES.VERIFIER_ATTESTATION) {
    this.keyFilePath = path.resolve(keyFilePath);
    this.role = role;
    this.account = null;
  }

  async init() {
    try {
      const stats = await stat(this.keyFilePath);
      // On POSIX systems, check mode permissions (warn if not mode 0600)
      if (process.platform !== 'win32') {
        const mode = stats.mode & 0o777;
        if ((mode & 0o077) !== 0) {
          process.stderr.write(`[SECURITY WARNING] Key file ${this.keyFilePath} has excessive permissions (mode 0${mode.toString(8)}). Recommended: 0600 (read/write by owner only).\n`);
        }
      }
    } catch {
      throw new Error(`Cannot access key file at ${this.keyFilePath}`);
    }

    const raw = (await readFile(this.keyFilePath, 'utf8')).trim();
    if (!isHex(raw, { strict: true }) || raw.length !== 66) {
      throw new Error(`Key file ${this.keyFilePath} must contain a 32-byte hex private key (0x followed by 64 hex characters)`);
    }

    this.account = privateKeyToAccount(raw);
    return this;
  }

  get address() {
    if (!this.account) throw new Error('SignerProvider not initialized');
    return this.account.address;
  }

  async signTypedData({ domain, types, primaryType, message }) {
    if (!this.account) throw new Error('SignerProvider not initialized');
    return this.account.signTypedData({
      domain,
      types,
      primaryType,
      message,
    });
  }

  async signMessage({ message }) {
    if (!this.account) throw new Error('SignerProvider not initialized');
    return this.account.signMessage({ message });
  }
}

export function validateSignerMembership(signerAddress, allowedAddresses, roleDescription = 'verifier') {
  const normalized = signerAddress.toLowerCase();
  const allowlist = allowedAddresses.map((a) => a.toLowerCase());
  if (!allowlist.includes(normalized)) {
    throw new Error(`Signer ${signerAddress} is not an authorized active ${roleDescription} (authorized: ${allowedAddresses.join(', ')})`);
  }
  return true;
}
