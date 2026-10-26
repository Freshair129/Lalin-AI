import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const assetMap = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

export function hasExactlyOneHeader(request, name) {
  const wanted = name.toLowerCase();
  const raw = request.rawHeaders;
  if (Array.isArray(raw)) {
    let count = 0;
    for (let index = 0; index < raw.length; index += 2) {
      if (String(raw[index]).toLowerCase() === wanted) count += 1;
    }
    return count === 1;
  }
  return Object.hasOwn(request.headers ?? {}, wanted);
}

export function headerValue(request, name) {
  if (!hasExactlyOneHeader(request, name)) return undefined;
  return request.headers?.[name.toLowerCase()];
}

export function isExpectedHost(request, config) {
  return headerValue(request, 'host') === config.authority;
}

function commonHeaders(config, contentType, contentLength) {
  return {
    'Content-Type': contentType,
    'Content-Length': String(contentLength),
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src " + 'wss://' + config.authority + "/probe; worker-src 'none'; manifest-src 'none'; media-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

function reply(response, status, config, contentType = 'text/plain; charset=utf-8', body = Buffer.alloc(0)) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const headers = commonHeaders(config, contentType, bytes.length);
  if (status >= 400) headers.Connection = 'close';
  response.writeHead(status, headers);
  response.end(bytes);
}

export function createHttpHandler(config, options = {}) {
  const readAsset = options.readAsset ?? ((name) => readFile(path.join(publicRoot, name)));
  return async function handleHttpRequest(request, response) {
    if (!isExpectedHost(request, config)) {
      reply(response, 421, config);
      return;
    }
    const origin = request.headers?.origin;
    if (origin !== undefined && (!hasExactlyOneHeader(request, 'origin') || origin !== config.origin)) {
      reply(response, 403, config);
      return;
    }
    const raw = Array.isArray(request.rawHeaders) ? request.rawHeaders : [];
    const contentLengths = [];
    const transferEncodings = [];
    for (let index = 0; index < raw.length; index += 2) {
      const name = String(raw[index]).toLowerCase();
      if (name === 'content-length') contentLengths.push(String(raw[index + 1]));
      if (name === 'transfer-encoding') transferEncodings.push(String(raw[index + 1]));
    }
    if (contentLengths.length > 1 || transferEncodings.length > 0 || (contentLengths.length === 1 && contentLengths[0] !== '0')) {
      reply(response, 413, config);
      return;
    }
    if (request.method !== 'GET' || typeof request.url !== 'string') {
      reply(response, 405, config);
      return;
    }
    const asset = assetMap.get(request.url);
    if (!asset) {
      reply(response, 404, config);
      return;
    }
    try {
      const body = await readAsset(asset[0]);
      reply(response, 200, config, asset[1], body);
    } catch {
      reply(response, 503, config);
    }
  };
}
