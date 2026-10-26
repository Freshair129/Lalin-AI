import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { assertCertificateSan, isRfc1918Ipv4, loadConfig, normalizePublicFqdn, parseArguments } from '../src/config.js';

let root;
let repositoryRoot;
let certPath;
let keyPath;
const matchingDer = Buffer.from('matching-public-key');

class TestCertificate {
  constructor() {
    this.subjectAltName = 'DNS:remote.your-domain.tld';
    this.validFrom = '2020-01-01T00:00:00Z';
    this.validTo = '2099-01-01T00:00:00Z';
    this.publicKey = { export: () => matchingDer };
  }
}

class TestIpCertificate extends TestCertificate {
  constructor() { super(); this.subjectAltName = 'IP Address:192.168.1.20'; }
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lalin-play-remote-test-'));
  repositoryRoot = path.join(root, 'repo');
  await mkdir(repositoryRoot);
  const credentials = path.join(root, 'operator-certs');
  await mkdir(credentials);
  certPath = path.join(credentials, 'cert.pem');
  keyPath = path.join(credentials, 'key.pem');
  await writeFile(certPath, 'test certificate placeholder');
  await writeFile(keyPath, 'test private key placeholder');
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

function args(overrides = {}, mode = 'hostname') {
  const originValues = mode === 'ip'
    ? { '--origin-ip': '192.168.1.20' }
    : { '--origin-host': 'remote.your-domain.tld' };
  const values = {
    '--bind': '192.168.1.20',
    ...originValues,
    '--port': '4174',
    '--cert': certPath,
    '--key': keyPath,
    ...overrides,
  };
  return Object.entries(values).flat();
}

function dependencies(overrides = {}) {
  return {
    repositoryRoot,
    networkInterfaces: () => [[{ family: 'IPv4', address: '192.168.1.20' }]],
    lookup: async () => [{ address: '192.168.1.20', family: 4 }],
    X509Certificate: TestCertificate,
    createPrivateKey: () => ({ kind: 'private-key' }),
    createPublicKey: () => ({ export: () => matchingDer }),
    createSecureContext: () => ({}),
    now: Date.parse('2026-10-20T00:00:00Z'),
    ...overrides,
  };
}

test('argument parser requires one explicit origin mode and each base option exactly once', () => {
  assert.throws(() => parseArguments([]), { code: 'MISSING_ARGUMENT' });
  assert.throws(() => parseArguments(args({}, 'hostname').concat(['--origin-ip', '192.168.1.20'])), { code: 'INVALID_ORIGIN_MODE' });
  assert.throws(() => parseArguments(args().filter((value, index, list) => value !== '--origin-host' && list[index - 1] !== '--origin-host')), { code: 'INVALID_ORIGIN_MODE' });
  assert.throws(() => parseArguments(args().concat(['--bind', '192.168.1.20'])), { code: 'INVALID_ARGUMENTS' });
  assert.throws(() => parseArguments(['--unknown', 'value']), { code: 'INVALID_ARGUMENTS' });
  assert.throws(() => parseArguments(['--bind']), { code: 'INVALID_ARGUMENTS' });
});

test('RFC1918 bind validation excludes loopback and public addresses', () => {
  assert.equal(isRfc1918Ipv4('10.2.3.4'), true);
  assert.equal(isRfc1918Ipv4('172.31.255.1'), true);
  assert.equal(isRfc1918Ipv4('192.168.1.20'), true);
  assert.equal(isRfc1918Ipv4('172.32.0.1'), false);
  assert.equal(isRfc1918Ipv4('127.0.0.1'), false);
  assert.equal(isRfc1918Ipv4('8.8.8.8'), false);
  assert.equal(isRfc1918Ipv4('::1'), false);
});

test('hostname mode accepts a public FQDN only when DNS maps solely to the selected private interface', async () => {
  const config = await loadConfig(args({ '--origin-host': 'REMOTE.YOUR-DOMAIN.TLD' }), dependencies());
  assert.equal(config.bind, '192.168.1.20');
  assert.equal(config.originMode, 'hostname');
  assert.equal(config.authority, 'remote.your-domain.tld:4174');
  assert.equal(config.origin, 'https://remote.your-domain.tld:4174');
  assert.equal(config.certPath, certPath);
  assert.equal(config.keyPath, keyPath);
});

test('IP mode is explicit, requires the bind address and an exact IP SAN, and skips DNS mode', async () => {
  let dnsLookups = 0;
  const config = await loadConfig(args({}, 'ip'), dependencies({
    X509Certificate: TestIpCertificate,
    lookup: async () => { dnsLookups += 1; throw new Error('must not resolve IP mode'); },
  }));
  assert.equal(config.originMode, 'ip');
  assert.equal(config.originHost, '192.168.1.20');
  assert.equal(config.origin, 'https://192.168.1.20:4174');
  assert.equal(dnsLookups, 0);
  await assert.rejects(loadConfig(args({ '--origin-ip': '192.168.1.21' }, 'ip'), dependencies()), { code: 'ORIGIN_IP_DOES_NOT_MATCH_BIND' });
  await assert.rejects(loadConfig(args({ '--origin-ip': 'remote.your-domain.tld' }, 'ip'), dependencies()), { code: 'ORIGIN_IP_INVALID' });
});

test('rejects invalid binds, nonlocal addresses and nonprivate or mixed DNS answers', async () => {
  await assert.rejects(loadConfig(args({ '--bind': '8.8.8.8' }), dependencies()), { code: 'BIND_MUST_BE_RFC1918_IPV4' });
  await assert.rejects(loadConfig(args(), dependencies({ networkInterfaces: () => [] })), { code: 'BIND_NOT_ASSIGNED_TO_LOCAL_INTERFACE' });
  await assert.rejects(loadConfig(args(), dependencies({ lookup: async () => [{ address: '192.168.1.20', family: 4 }, { address: '10.0.0.4', family: 4 }] })), { code: 'ORIGIN_DNS_DOES_NOT_MATCH_BIND' });
  await assert.rejects(loadConfig(args(), dependencies({ lookup: async () => { throw new Error('dns failure'); } })), { code: 'ORIGIN_DNS_LOOKUP_FAILED' });
});

test('hostname mode rejects IP literals, internal and reserved names, wildcards and invalid FQDN syntax', () => {
  for (const host of ['192.168.1.20', 'remote.lan', 'remote.internal', 'remote.local', 'remote.private', 'localhost', 'remote.example.com', '*.your-domain.tld', 'singlelabel', 'https://remote.your-domain.tld']) {
    assert.throws(() => normalizePublicFqdn(host));
  }
});

test('rejects credential paths inside the repository and malformed port or origin syntax', async () => {
  const inRepoCert = path.join(repositoryRoot, 'cert.pem');
  await writeFile(inRepoCert, 'not a certificate');
  await assert.rejects(loadConfig(args({ '--cert': inRepoCert }), dependencies()), { code: 'CREDENTIAL_PATH_INSIDE_REPOSITORY' });
  await assert.rejects(loadConfig(args({ '--port': '0' }), dependencies()), { code: 'INVALID_PORT' });
  await assert.rejects(loadConfig(args({ '--cert': 'relative.pem' }), dependencies()), { code: 'CREDENTIAL_PATH_MUST_BE_ABSOLUTE' });
});

test('rejects wildcard or multi-entry SANs and mismatched certificate keys', async () => {
  class WildcardCertificate extends TestCertificate {
    constructor() { super(); this.subjectAltName = 'DNS:*.your-domain.tld'; }
  }
  class MultipleSansCertificate extends TestCertificate {
    constructor() { super(); this.subjectAltName = 'DNS:remote.your-domain.tld, DNS:backup.your-domain.tld'; }
  }
  class WrongIpSanCertificate extends TestIpCertificate {
    constructor() { super(); this.subjectAltName = 'IP Address:192.168.1.21'; }
  }
  await assert.rejects(loadConfig(args(), dependencies({ X509Certificate: WildcardCertificate })), { code: 'CERTIFICATE_SAN_MISMATCH' });
  await assert.rejects(loadConfig(args(), dependencies({ X509Certificate: MultipleSansCertificate })), { code: 'CERTIFICATE_SAN_CARDINALITY' });
  await assert.rejects(loadConfig(args({}, 'ip'), dependencies({ X509Certificate: WrongIpSanCertificate })), { code: 'CERTIFICATE_SAN_MISMATCH' });
  await assert.rejects(loadConfig(args(), dependencies({ createPublicKey: () => ({ export: () => Buffer.from('different-key') }) })), { code: 'CERTIFICATE_KEY_MISMATCH' });
  assert.doesNotThrow(() => assertCertificateSan({ subjectAltName: 'IP Address:192.168.1.20' }, '192.168.1.20', 'ip'));
});
