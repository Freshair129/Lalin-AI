import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHttpHandler } from '../src/http.js';

const config = {
  authority: 'remote.your-domain.tld:4174',
  origin: 'https://remote.your-domain.tld:4174',
};

function request(overrides = {}) {
  const { headers: overrideHeaders = {}, rawHeaders: suppliedRawHeaders, ...rest } = overrides;
  const headers = { host: config.authority, ...overrideHeaders };
  const rawHeaders = suppliedRawHeaders ?? Object.entries(headers).flatMap(([name, value]) => [name, value]);
  return { method: 'GET', url: '/', ...rest, headers, rawHeaders };
}

function response() {
  return {
    status: undefined,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

test('serves only the static same-origin page with restrictive browser headers', async () => {
  const handler = createHttpHandler(config, { readAsset: async (name) => Buffer.from('asset:' + name) });
  const res = response();
  await handler(request(), res);
  assert.equal(res.status, 200);
  assert.equal(res.body.toString(), 'asset:index.html');
  assert.match(res.headers['Content-Security-Policy'], /connect-src wss:\/\/remote\.your-domain\.tld:4174\/probe/);
  assert.match(res.headers['Content-Security-Policy'], /worker-src 'none'/);
  assert.match(res.headers['Content-Security-Policy'], /manifest-src 'none'/);
  assert.match(res.headers['Content-Security-Policy'], /media-src 'none'/);
  assert.equal(res.headers['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('fails closed for wrong Host, wrong Origin, paths, methods, and unavailable assets', async () => {
  const handler = createHttpHandler(config, { readAsset: async () => { throw new Error('missing asset'); } });
  const wrongHost = response();
  await handler(request({ headers: { host: '192.168.1.20:4174' } }), wrongHost);
  assert.equal(wrongHost.status, 421);

  const wrongOrigin = response();
  await handler(request({ headers: { origin: 'https://attacker.example' } }), wrongOrigin);
  assert.equal(wrongOrigin.status, 403);

  const unknownPath = response();
  await handler(request({ url: '/anything?path=1' }), unknownPath);
  assert.equal(unknownPath.status, 404);

  const method = response();
  await handler(request({ method: 'POST' }), method);
  assert.equal(method.status, 405);

  const absentAsset = response();
  await handler(request(), absentAsset);
  assert.equal(absentAsset.status, 503);
});

test('does not accept duplicate Host headers', async () => {
  const handler = createHttpHandler(config, { readAsset: async () => Buffer.from('asset') });
  const req = request();
  req.rawHeaders.push('host', config.authority);
  const res = response();
  await handler(req, res);
  assert.equal(res.status, 421);
});

test('rejects request bodies and transfer encodings', async () => {
  const handler = createHttpHandler(config, { readAsset: async () => Buffer.from('asset') });
  const withBody = request();
  withBody.rawHeaders.push('content-length', '12');
  const bodyResponse = response();
  await handler(withBody, bodyResponse);
  assert.equal(bodyResponse.status, 413);
  assert.equal(bodyResponse.headers.Connection, 'close');

  const chunked = request();
  chunked.rawHeaders.push('transfer-encoding', 'chunked');
  const chunkResponse = response();
  await handler(chunked, chunkResponse);
  assert.equal(chunkResponse.status, 413);
});
