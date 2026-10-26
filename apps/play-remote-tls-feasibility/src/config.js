import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';
import { createSecureContext } from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepositoryRoot = path.resolve(packageRoot, '..', '..');
const baseArguments = ['--bind', '--port', '--cert', '--key'];
const originArguments = ['--origin-host', '--origin-ip'];
const reservedSuffixes = ['.localhost', '.local', '.lan', '.internal', '.home', '.test', '.example', '.invalid', '.arpa', '.onion', '.corp', '.private', '.intranet', '.office', '.localdomain'];
const reservedExampleDomains = ['example.com', 'example.net', 'example.org'];

export class ConfigError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ConfigError';
    this.code = code;
  }
}

function fail(code) {
  throw new ConfigError(code);
}

export function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) fail('INVALID_ARGUMENTS');
  const result = Object.create(null);
  const allowed = new Set([...baseArguments, ...originArguments]);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || Object.hasOwn(result, name) || typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      fail('INVALID_ARGUMENTS');
    }
    result[name] = value;
  }
  for (const name of baseArguments) {
    if (!Object.hasOwn(result, name)) fail('MISSING_ARGUMENT');
  }
  const selectedOriginArguments = originArguments.filter((name) => Object.hasOwn(result, name));
  if (selectedOriginArguments.length !== 1) fail('INVALID_ORIGIN_MODE');
  return result;
}

export function isRfc1918Ipv4(address) {
  if (!isIPv4(address)) return false;
  const octets = address.split('.').map(Number);
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function parsePort(value) {
  if (!/^[0-9]{1,5}$/.test(value)) fail('INVALID_PORT');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('INVALID_PORT');
  return port;
}

export function normalizePublicFqdn(value) {
  if (value !== value.trim() || value.length === 0 || value.endsWith('.') || value.includes(':') || value.includes('/') || value.includes('@') || isIPv4(value)) {
    fail('INVALID_ORIGIN_HOST');
  }
  const host = value.toLowerCase();
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) fail('INVALID_ORIGIN_HOST');
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    fail('INVALID_ORIGIN_HOST');
  }
  const tld = labels.at(-1);
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) fail('INVALID_ORIGIN_HOST');
  if (host === 'localhost' || reservedSuffixes.some((suffix) => host.endsWith(suffix))) fail('RESERVED_ORIGIN_HOST');
  if (reservedExampleDomains.some((name) => host === name || host.endsWith('.' + name))) fail('RESERVED_ORIGIN_HOST');
  return host;
}

function parseOrigin(args, bind) {
  if (Object.hasOwn(args, '--origin-ip')) {
    const originIp = args['--origin-ip'];
    if (!isIPv4(originIp)) fail('ORIGIN_IP_INVALID');
    if (originIp !== bind) fail('ORIGIN_IP_DOES_NOT_MATCH_BIND');
    return { originMode: 'ip', originHost: originIp };
  }
  const originHost = normalizePublicFqdn(args['--origin-host']);
  return { originMode: 'hostname', originHost };
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function validateCredentialPath(input, repositoryRoot, deps) {
  if (!path.isAbsolute(input)) fail('CREDENTIAL_PATH_MUST_BE_ABSOLUTE');
  const lexicalPath = path.resolve(input);
  if (isWithin(repositoryRoot, lexicalPath)) fail('CREDENTIAL_PATH_INSIDE_REPOSITORY');
  let fileInfo;
  let resolvedPath;
  try {
    fileInfo = await deps.lstat(lexicalPath);
    resolvedPath = await deps.realpath(lexicalPath);
  } catch {
    fail('CREDENTIAL_FILE_UNAVAILABLE');
  }
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || isWithin(repositoryRoot, resolvedPath)) {
    fail('CREDENTIAL_FILE_UNSAFE');
  }
  return resolvedPath;
}

export function assertCertificateSan(certificate, originHost, originMode) {
  const sanText = certificate.subjectAltName;
  if (typeof sanText !== 'string' || sanText.length === 0) fail('CERTIFICATE_SAN_REQUIRED');
  const entries = sanText.split(/,\s*/).map((entry) => entry.trim());
  if (entries.length !== 1) fail('CERTIFICATE_SAN_CARDINALITY');
  const expected = (originMode === 'ip' ? 'IP Address:' : 'DNS:') + originHost;
  if (entries[0].toLowerCase() !== expected.toLowerCase()) fail('CERTIFICATE_SAN_MISMATCH');
}

function validateCertificateDates(certificate, now) {
  const starts = new Date(certificate.validFrom).getTime();
  const ends = new Date(certificate.validTo).getTime();
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || now < starts || now > ends) {
    fail('CERTIFICATE_OUTSIDE_VALIDITY');
  }
}

export async function loadConfig(argv, overrides = {}) {
  const args = parseArguments(argv);
  const bind = args['--bind'];
  if (!isRfc1918Ipv4(bind)) fail('BIND_MUST_BE_RFC1918_IPV4');
  const port = parsePort(args['--port']);
  const { originMode, originHost } = parseOrigin(args, bind);
  const authority = originHost + ':' + port;
  const origin = 'https://' + authority;
  const deps = {
    networkInterfaces: overrides.networkInterfaces ?? (() => Object.values(networkInterfaces())),
    lookup: overrides.lookup ?? dnsLookup,
    lstat: overrides.lstat ?? lstat,
    realpath: overrides.realpath ?? realpath,
    readFile: overrides.readFile ?? readFile,
    X509Certificate: overrides.X509Certificate ?? X509Certificate,
    createPrivateKey: overrides.createPrivateKey ?? createPrivateKey,
    createPublicKey: overrides.createPublicKey ?? createPublicKey,
    createSecureContext: overrides.createSecureContext ?? createSecureContext,
    now: overrides.now ?? Date.now(),
  };
  const interfaces = await deps.networkInterfaces();
  const localAddresses = interfaces.flat().filter((entry) => entry && (entry.family === 'IPv4' || entry.family === 4)).map((entry) => entry.address);
  if (!localAddresses.includes(bind)) fail('BIND_NOT_ASSIGNED_TO_LOCAL_INTERFACE');
  if (originMode === 'hostname') {
    let records;
    try {
      records = await deps.lookup(originHost, { all: true, verbatim: true });
    } catch {
      fail('ORIGIN_DNS_LOOKUP_FAILED');
    }
    if (!Array.isArray(records) || records.length === 0) fail('ORIGIN_DNS_DOES_NOT_MATCH_BIND');
    const addresses = [...new Set(records.map((record) => record.address))];
    if (addresses.length !== 1 || addresses[0] !== bind || records.some((record) => (record.family !== 4 && record.family !== 'IPv4') || record.address !== bind)) {
      fail('ORIGIN_DNS_DOES_NOT_MATCH_BIND');
    }
  }

  const repositoryRoot = path.resolve(overrides.repositoryRoot ?? defaultRepositoryRoot);
  const certPath = await validateCredentialPath(args['--cert'], repositoryRoot, deps);
  const keyPath = await validateCredentialPath(args['--key'], repositoryRoot, deps);
  if (certPath === keyPath) fail('CERTIFICATE_AND_KEY_MUST_DIFFER');

  let certificatePem;
  let keyPem;
  try {
    [certificatePem, keyPem] = await Promise.all([deps.readFile(certPath), deps.readFile(keyPath)]);
  } catch {
    fail('CREDENTIAL_FILE_UNAVAILABLE');
  }
  let certificate;
  let privateKey;
  try {
    certificate = new deps.X509Certificate(certificatePem);
    privateKey = deps.createPrivateKey(keyPem);
  } catch {
    fail('CREDENTIAL_PARSE_FAILED');
  }
  validateCertificateDates(certificate, deps.now);
  assertCertificateSan(certificate, originHost, originMode);
  let keyMatches = false;
  try {
    const certKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
    const privateKeyPublic = deps.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    keyMatches = certKey.equals(privateKeyPublic);
  } catch {
    fail('CERTIFICATE_KEY_MISMATCH');
  }
  if (!keyMatches) fail('CERTIFICATE_KEY_MISMATCH');
  try {
    deps.createSecureContext({ cert: certificatePem, key: keyPem, minVersion: 'TLSv1.2' });
  } catch {
    fail('TLS_CREDENTIALS_INVALID');
  }

  return Object.freeze({
    bind,
    originMode,
    originHost,
    port,
    authority,
    origin,
    certPath,
    keyPath,
    certificatePem,
    keyPem,
  });
}
