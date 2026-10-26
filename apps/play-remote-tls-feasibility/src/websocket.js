import { WebSocketServer, WebSocket } from 'ws';
import { hasExactlyOneHeader, headerValue, isExpectedHost } from './http.js';

const probeNoncePattern = /^[a-f0-9]{32}$/;
const defaultConnectionCap = 8;
const defaultProbeDeadlineMs = 15000;

function rejectSocket(socket, status = 403) {
  const reason = status === 503 ? 'Service Unavailable' : 'Forbidden';
  const response = Buffer.from('HTTP/1.1 ' + status + ' ' + reason + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  try {
    socket.end(response);
  } catch {
    try { socket.destroy(); } catch {}
  }
}

export function isValidProbeUpgrade(request, config) {
  if (request.method !== 'GET' || request.url !== '/probe') return false;
  if (!isExpectedHost(request, config)) return false;
  if (!hasExactlyOneHeader(request, 'origin') || headerValue(request, 'origin') !== config.origin) return false;
  if (!hasExactlyOneHeader(request, 'upgrade') || String(headerValue(request, 'upgrade')).toLowerCase() !== 'websocket') return false;
  if (!hasExactlyOneHeader(request, 'connection')) return false;
  const connectionTokens = String(headerValue(request, 'connection')).toLowerCase().split(',').map((part) => part.trim());
  if (!connectionTokens.includes('upgrade')) return false;
  if (!hasExactlyOneHeader(request, 'sec-websocket-key') || !hasExactlyOneHeader(request, 'sec-websocket-version')) return false;
  if (headerValue(request, 'sec-websocket-version') !== '13') return false;
  return true;
}

export function handleProbeConnection(socket, options = {}) {
  const timeoutMs = options.timeoutMs ?? defaultProbeDeadlineMs;
  const schedule = options.setTimeout ?? setTimeout;
  const cancel = options.clearTimeout ?? clearTimeout;
  const managesDeadline = options.manageDeadline !== false;
  let messageCount = 0;
  let settled = false;
  let released = false;
  let timer;
  const release = () => {
    if (released) return;
    released = true;
    cancel(timer);
    options.onClose?.();
  };
  const closeWithPolicyError = () => {
    if (settled) return;
    settled = true;
    try { socket.close(1008, 'probe rejected'); } catch { release(); }
  };

  if (managesDeadline) {
    timer = schedule(() => {
      if (released) return;
      settled = true;
      try {
        if (typeof socket.terminate === 'function') socket.terminate();
        else socket.close(1008, 'probe expired');
      } catch {}
      release();
    }, timeoutMs);
  }
  socket.once('close', release);
  socket.on('error', () => {});
  socket.on('message', (data, isBinary) => {
    if (settled) return;
    messageCount += 1;
    if (messageCount !== 1 || isBinary || !Buffer.isBuffer(data) || data.length > 128) {
      closeWithPolicyError();
      return;
    }
    let value;
    try {
      value = JSON.parse(data.toString('utf8'));
    } catch {
      closeWithPolicyError();
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      closeWithPolicyError();
      return;
    }
    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== 'nonce' || keys[1] !== 'type' || value.type !== 'probe' || typeof value.nonce !== 'string' || !probeNoncePattern.test(value.nonce)) {
      closeWithPolicyError();
      return;
    }
    if (socket.readyState !== WebSocket.OPEN) {
      closeWithPolicyError();
      return;
    }
    try {
      socket.send(JSON.stringify({ type: 'ack', nonce: value.nonce }));
      settled = true;
      socket.close(1000, 'probe complete');
    } catch {
      closeWithPolicyError();
    }
  });
}

export function createWebSocketProbe(config, options = {}) {
  const maxConnections = options.maxConnections ?? defaultConnectionCap;
  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > defaultConnectionCap) {
    throw new RangeError('Invalid probe connection cap');
  }
  const timeoutMs = options.timeoutMs ?? defaultProbeDeadlineMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > defaultProbeDeadlineMs) {
    throw new RangeError('Invalid probe deadline');
  }
  const schedule = options.setTimeout ?? setTimeout;
  const cancel = options.clearTimeout ?? clearTimeout;
  let activeConnections = 0;
  const webSocketServer = options.webSocketServer ?? new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 256,
    maxFragments: 4,
    maxBufferedChunks: 8,
    clientTracking: false,
  });
  webSocketServer.on('connection', (socket, _request, release) => {
    handleProbeConnection(socket, { onClose: release, manageDeadline: false });
  });
  return Object.freeze({
    webSocketServer,
    getActiveConnectionCount() { return activeConnections; },
    handleUpgrade(request, socket, head) {
      if (!isValidProbeUpgrade(request, config)) {
        rejectSocket(socket);
        return false;
      }
      if (activeConnections >= maxConnections) {
        rejectSocket(socket, 503);
        return false;
      }
      activeConnections += 1;
      let released = false;
      let client;
      let timer;
      const release = () => {
        if (released) return;
        released = true;
        cancel(timer);
        socket.removeListener?.('close', release);
        socket.removeListener?.('error', onRawSocketError);
        activeConnections -= 1;
      };
      const onRawSocketError = () => {
        try {
          if (client && typeof client.terminate === 'function') client.terminate();
          else socket.destroy();
        } catch {}
        release();
      };
      socket.once?.('close', release);
      socket.once?.('error', onRawSocketError);
      timer = schedule(() => {
        if (released) return;
        try {
          if (client && typeof client.terminate === 'function') client.terminate();
          else socket.destroy();
        } catch {}
        release();
      }, timeoutMs);
      try {
        webSocketServer.handleUpgrade(request, socket, head, (upgradedClient) => {
          // The deadline and capacity reservation begin before handleUpgrade so
          // rejected handshakes cannot hold a slot indefinitely.
          client = upgradedClient;
          webSocketServer.emit('connection', client, request, release);
        });
        return Boolean(client);
      } catch {
        release();
        try { socket.destroy(); } catch {}
        return false;
      }
    },
  });
}
