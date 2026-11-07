import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { createWebSocketProbe, handleProbeConnection, isValidProbeUpgrade } from '../src/websocket.js';

const config = {
  authority: 'remote.your-domain.tld:4174',
  origin: 'https://remote.your-domain.tld:4174',
};

function upgradeRequest(overrides = {}) {
  const headers = {
    host: config.authority,
    origin: config.origin,
    upgrade: 'websocket',
    connection: 'keep-alive, Upgrade',
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'sec-websocket-version': '13',
    ...overrides.headers,
  };
  return {
    method: 'GET',
    url: '/probe',
    headers,
    rawHeaders: Object.entries(headers).flatMap(([name, value]) => [name, value]),
    ...overrides,
  };
}

function fakeTimers() {
  const timers = [];
  return {
    timers,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
  };
}

class FakeWebSocketServer extends EventEmitter {
  constructor() { super(); this.upgradeCalls = 0; this.clients = []; }
  handleUpgrade(_request, _socket, _head, callback) {
    this.upgradeCalls += 1;
    const client = new ProbeSocket();
    this.clients.push(client);
    callback(client);
  }
}

class NonThrowingRejectWebSocketServer extends FakeWebSocketServer {
  handleUpgrade(request, socket, _head, callback) {
    this.upgradeCalls += 1;
    if (request.headers['sec-websocket-key'] === 'malformed') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const client = new ProbeSocket();
    this.clients.push(client);
    callback(client);
  }
}

class FakeRawSocket extends EventEmitter {
  constructor() { super(); this.endedWith = undefined; this.destroyed = false; }
  end(value) { this.endedWith = value.toString(); }
  destroy() { this.destroyed = true; }
}

function fakeSocket() {
  return new FakeRawSocket();
}

class ProbeSocket extends EventEmitter {
  constructor() { super(); this.readyState = WebSocket.OPEN; this.sent = []; this.closed = []; this.terminated = false; }
  send(value) { this.sent.push(value); }
  close(code, reason) {
    this.closed.push([code, reason]);
    this.readyState = WebSocket.CLOSED;
    queueMicrotask(() => this.emit('close'));
  }
  terminate() {
    this.terminated = true;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
}

test('requires exact same-origin /probe WebSocket handshake', () => {
  assert.equal(isValidProbeUpgrade(upgradeRequest(), config), true);
  assert.equal(isValidProbeUpgrade(upgradeRequest({ url: '/probe?x=1' }), config), false);
  assert.equal(isValidProbeUpgrade(upgradeRequest({ headers: { origin: 'https://other.example' } }), config), false);
  assert.equal(isValidProbeUpgrade(upgradeRequest({ headers: { host: '0.0.0.0:4174' } }), config), false);
  assert.equal(isValidProbeUpgrade(upgradeRequest({ headers: { upgrade: 'h2c' } }), config), false);
  const duplicateOrigin = upgradeRequest();
  duplicateOrigin.rawHeaders.push('origin', config.origin);
  assert.equal(isValidProbeUpgrade(duplicateOrigin, config), false);
});

test('rejects invalid upgrades before passing them to ws', () => {
  const server = new FakeWebSocketServer();
  const probe = createWebSocketProbe(config, { webSocketServer: server });
  const socket = fakeSocket();
  const accepted = probe.handleUpgrade(upgradeRequest({ url: '/not-probe' }), socket, Buffer.alloc(0));
  assert.equal(accepted, false);
  assert.equal(server.upgradeCalls, 0);
  assert.match(socket.endedWith, /^HTTP\/1\.1 403 Forbidden/);
});

test('pins compression off and applies strict limits without creating a listener', () => {
  const probe = createWebSocketProbe(config);
  assert.ok(probe.webSocketServer instanceof WebSocketServer);
  assert.equal(probe.webSocketServer.options.noServer, true);
  assert.equal(probe.webSocketServer.options.perMessageDeflate, false);
  assert.equal(probe.webSocketServer.options.maxPayload, 256);
  assert.equal(probe.webSocketServer.options.maxFragments, 4);
  assert.equal(probe.webSocketServer.options.maxBufferedChunks, 8);
  assert.equal(probe.webSocketServer.options.clientTracking, false);
  assert.equal(Boolean(probe.webSocketServer._server), false);
  probe.webSocketServer.close();
});

test('enforces a finite total connection cap and releases it on close', async () => {
  const server = new FakeWebSocketServer();
  const timers = fakeTimers();
  const probe = createWebSocketProbe(config, {
    webSocketServer: server,
    maxConnections: 1,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  assert.equal(probe.handleUpgrade(upgradeRequest(), fakeSocket(), Buffer.alloc(0)), true);
  assert.equal(probe.getActiveConnectionCount(), 1);
  const rejectedSocket = fakeSocket();
  assert.equal(probe.handleUpgrade(upgradeRequest(), rejectedSocket, Buffer.alloc(0)), false);
  assert.match(rejectedSocket.endedWith, /^HTTP\/1\.1 503 Service Unavailable/);
  assert.equal(server.upgradeCalls, 1);
  server.clients[0].emit('close');
  assert.equal(probe.getActiveConnectionCount(), 0);
  assert.equal(timers.timers[0].cleared, true);
  assert.equal(probe.handleUpgrade(upgradeRequest(), fakeSocket(), Buffer.alloc(0)), true);
  assert.equal(probe.getActiveConnectionCount(), 1);
  server.clients[1].emit('close');
});

test('releases a reserved slot when ws rejects a malformed handshake without throwing', () => {
  for (const eventName of ['close', 'error']) {
    const server = new NonThrowingRejectWebSocketServer();
    const timers = fakeTimers();
    const probe = createWebSocketProbe(config, {
      webSocketServer: server,
      maxConnections: 1,
      timeoutMs: 80,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    const rawSocket = fakeSocket();
    const invalidRequest = upgradeRequest({ headers: { ...upgradeRequest().headers, 'sec-websocket-key': 'malformed' } });

    assert.equal(probe.handleUpgrade(invalidRequest, rawSocket, Buffer.alloc(0)), false);
    assert.equal(rawSocket.endedWith.startsWith('HTTP/1.1 400 Bad Request'), true);
    assert.equal(probe.getActiveConnectionCount(), 1);
    assert.equal(timers.timers.length, 1);
    assert.equal(timers.timers[0].delay, 80);

    rawSocket.emit(eventName, eventName === 'error' ? new Error('synthetic socket error') : undefined);
    assert.equal(probe.getActiveConnectionCount(), 0);
    if (eventName === 'error') assert.equal(rawSocket.destroyed, true);
    assert.equal(timers.timers[0].cleared, true);

    assert.equal(probe.handleUpgrade(upgradeRequest(), fakeSocket(), Buffer.alloc(0)), true);
    assert.equal(probe.getActiveConnectionCount(), 1);
    server.clients[0].emit('close');
    assert.equal(probe.getActiveConnectionCount(), 0);
  }
});

test('starts the absolute deadline before a non-throwing rejected upgrade and frees the slot on expiry', () => {
  const server = new NonThrowingRejectWebSocketServer();
  const timers = fakeTimers();
  const probe = createWebSocketProbe(config, {
    webSocketServer: server,
    maxConnections: 1,
    timeoutMs: 40,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  const rawSocket = fakeSocket();
  const invalidRequest = upgradeRequest({ headers: { ...upgradeRequest().headers, 'sec-websocket-key': 'malformed' } });

  assert.equal(probe.handleUpgrade(invalidRequest, rawSocket, Buffer.alloc(0)), false);
  assert.equal(probe.getActiveConnectionCount(), 1);
  assert.equal(timers.timers.length, 1);
  assert.equal(timers.timers[0].delay, 40);
  timers.timers[0].callback();
  assert.equal(rawSocket.destroyed, true);
  assert.equal(probe.getActiveConnectionCount(), 0);
  assert.equal(timers.timers[0].cleared, true);
});

test('applies an absolute probe deadline, terminates idle peers and releases capacity', () => {
  const server = new FakeWebSocketServer();
  const timers = fakeTimers();
  const probe = createWebSocketProbe(config, {
    webSocketServer: server,
    maxConnections: 1,
    timeoutMs: 50,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  assert.equal(probe.handleUpgrade(upgradeRequest(), fakeSocket(), Buffer.alloc(0)), true);
  assert.equal(timers.timers[0].delay, 50);
  assert.equal(probe.getActiveConnectionCount(), 1);
  timers.timers[0].callback();
  assert.equal(server.clients[0].terminated, true);
  assert.equal(probe.getActiveConnectionCount(), 0);
  assert.equal(timers.timers[0].cleared, true);
  assert.equal(probe.handleUpgrade(upgradeRequest(), fakeSocket(), Buffer.alloc(0)), true);
  server.clients[1].emit('close');
});

test('accepts one nonce and returns only the matching transient acknowledgement', () => {
  const socket = new ProbeSocket();
  const timers = fakeTimers();
  handleProbeConnection(socket, { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  const nonce = '0123456789abcdef0123456789abcdef';
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'probe', nonce })), false);
  assert.deepEqual(socket.sent, [JSON.stringify({ type: 'ack', nonce })]);
  assert.deepEqual(socket.closed, [[1000, 'probe complete']]);
});

test('fails closed on malformed, extra-field, binary, or repeated messages', () => {
  const malformed = new ProbeSocket();
  handleProbeConnection(malformed, fakeTimers());
  malformed.emit('message', Buffer.from('{'), false);
  assert.equal(malformed.sent.length, 0);
  assert.equal(malformed.closed[0][0], 1008);

  const extraField = new ProbeSocket();
  handleProbeConnection(extraField, fakeTimers());
  extraField.emit('message', Buffer.from(JSON.stringify({ type: 'probe', nonce: '0123456789abcdef0123456789abcdef', command: 'ignored' })), false);
  assert.equal(extraField.sent.length, 0);
  assert.equal(extraField.closed[0][0], 1008);

  const binary = new ProbeSocket();
  handleProbeConnection(binary, fakeTimers());
  binary.emit('message', Buffer.from('payload'), true);
  assert.equal(binary.sent.length, 0);
  assert.equal(binary.closed[0][0], 1008);

  const repeated = new ProbeSocket();
  handleProbeConnection(repeated, fakeTimers());
  const nonce = '0123456789abcdef0123456789abcdef';
  repeated.emit('message', Buffer.from(JSON.stringify({ type: 'probe', nonce })), false);
  repeated.emit('message', Buffer.from(JSON.stringify({ type: 'probe', nonce })), false);
  assert.equal(repeated.sent.length, 1);
});


test('default active probe limit is eight connections', () => {
  const server = new FakeWebSocketServer();
  const timers = fakeTimers();
  const probe = createWebSocketProbe(config, { webSocketServer: server, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  for (let index = 0; index < 8; index += 1) {
    assert.equal(probe.handleUpgrade(upgradeRequest(), fakeSocket(), Buffer.alloc(0)), true);
  }
  assert.equal(probe.getActiveConnectionCount(), 8);
  const overflowSocket = fakeSocket();
  assert.equal(probe.handleUpgrade(upgradeRequest(), overflowSocket, Buffer.alloc(0)), false);
  assert.match(overflowSocket.endedWith, /^HTTP\/1\.1 503 Service Unavailable/);
  assert.equal(server.upgradeCalls, 8);
  for (const client of server.clients) client.emit('close');
  assert.equal(probe.getActiveConnectionCount(), 0);
});
