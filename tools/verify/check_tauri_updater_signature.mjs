import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// Tauri wraps a Minisign public key and detached signature in base64.
function decodeMinisign(text) {
  return Buffer.from(text.trim(), 'base64').toString('utf8').trimEnd().split(/\r?\n/);
}

export function verifyTauriUpdaterSignature(installer, publicKeyText, signatureText, expectedInstallerName) {
  const keyLines = decodeMinisign(publicKeyText);
  const signatureLines = decodeMinisign(signatureText);
  const commentPrefix = 'trusted comment: ';
  assert.equal(keyLines.length, 2, 'Invalid Minisign public key');
  assert.equal(signatureLines.length, 4, 'Invalid Minisign signature');
  assert.ok(signatureLines[2].startsWith(commentPrefix), 'Missing Minisign trusted comment');

  const key = Buffer.from(keyLines[1], 'base64');
  const packet = Buffer.from(signatureLines[1], 'base64');
  const commentSignature = Buffer.from(signatureLines[3], 'base64');
  assert.equal(key.length, 42, 'Invalid Minisign public key length');
  assert.equal(packet.length, 74, 'Invalid Minisign signature packet length');
  assert.equal(commentSignature.length, 64, 'Invalid Minisign comment signature length');
  assert.equal(key.toString('ascii', 0, 2), 'Ed', 'Unsupported Minisign public key type');
  assert.ok(key.subarray(2, 10).equals(packet.subarray(2, 10)), 'Updater signing key ID mismatch');

  // Minisign ED signatures cover a BLAKE2b-512 digest. Older Ed signatures cover the raw bytes.
  const algorithm = packet.toString('ascii', 0, 2);
  assert.ok(algorithm === 'ED' || algorithm === 'Ed', 'Unsupported Minisign signature algorithm');
  const message = algorithm === 'ED' ? createHash('blake2b512').update(installer).digest() : installer;
  const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const publicKey = createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, key.subarray(10)]),
    type: 'spki',
    format: 'der',
  });
  const signature = packet.subarray(10);
  assert.ok(verify(null, message, publicKey, signature), 'Installer signature verification failed');

  const trustedComment = signatureLines[2].slice(commentPrefix.length);
  const signedComment = Buffer.concat([signature, Buffer.from(trustedComment)]);
  assert.ok(verify(null, signedComment, publicKey, commentSignature), 'Minisign trusted comment verification failed');
  assert.ok(trustedComment.split('\t').includes('file:' + expectedInstallerName), 'Signed installer filename does not match release asset');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [installerPath, signaturePath, configPath] = process.argv.slice(2);
  assert.ok(installerPath && signaturePath && configPath, 'Expected installer, signature and Tauri config paths');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  verifyTauriUpdaterSignature(
    readFileSync(installerPath),
    config.plugins.updater.pubkey,
    readFileSync(signaturePath, 'utf8'),
    basename(installerPath),
  );
  console.log('Installer signature verified with the configured Studio updater key.');
}
