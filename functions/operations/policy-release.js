'use strict';

const { deepFreeze, sha256 } = require('./canonical');
const REQUIRED_FILES = Object.freeze([
  'constitution.md', 'communication.yaml', 'pricing.yaml', 'booking.yaml', 'payment.yaml',
  'event-prep.yaml', 'escalation.yaml', 'security.yaml',
]);

class PolicyIntegrityError extends Error {
  constructor(message) { super(message); this.name = 'PolicyIntegrityError'; }
}

/** A loader instance is run-scoped: its first successful load is the only snapshot it returns. */
function createPolicyReleaseLoader({ repository }) {
  if (!repository || typeof repository.getActiveRelease !== 'function') throw new TypeError('policy repository is required');
  let snapshotPromise;
  return {
    load() {
      if (!snapshotPromise) snapshotPromise = loadVerified(repository).catch(error => { snapshotPromise = undefined; throw error; });
      return snapshotPromise;
    },
  };
}

async function loadVerified(repository) {
  const version = await repository.getActiveRelease();
  if (typeof version !== 'string' || !version.trim()) throw new PolicyIntegrityError('active policy release is missing');
  const manifest = await repository.getManifest(version);
  if (!manifest || manifest.version !== version || !manifest.files || Array.isArray(manifest.files)) {
    throw new PolicyIntegrityError('policy manifest is invalid or mismatched');
  }
  const files = {};
  const missing = REQUIRED_FILES.filter(name => !Object.hasOwn(manifest.files, name));
  if (missing.length) throw new PolicyIntegrityError(`policy release missing required files: ${missing.join(', ')}`);
  for (const [name, expectedHash] of Object.entries(manifest.files).sort()) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || name === 'manifest.json') throw new PolicyIntegrityError(`unsafe policy filename: ${name}`);
    if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new PolicyIntegrityError(`invalid hash for ${name}`);
    const content = await repository.getFile(version, name);
    if (typeof content !== 'string' && !Buffer.isBuffer(content)) throw new PolicyIntegrityError(`missing policy file: ${name}`);
    if (sha256(content) !== expectedHash.toLowerCase()) throw new PolicyIntegrityError(`policy hash mismatch: ${name}`);
    files[name] = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  }
  if (Object.keys(files).length === 0) throw new PolicyIntegrityError('policy release contains no files');
  return deepFreeze({ version, manifestHash: sha256(manifest), manifest: structuredClone(manifest), files });
}

module.exports = { PolicyIntegrityError, REQUIRED_FILES, createPolicyReleaseLoader };
