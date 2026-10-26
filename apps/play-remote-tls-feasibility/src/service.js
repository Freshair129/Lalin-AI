import https from 'node:https';
import { createHttpHandler } from './http.js';
import { createWebSocketProbe } from './websocket.js';

export function createService(config, options = {}) {
  const requestHandler = options.requestHandler ?? createHttpHandler(config);
  const probe = options.probe ?? createWebSocketProbe(config);
  const server = https.createServer({
    cert: config.certificatePem,
    key: config.keyPem,
    minVersion: 'TLSv1.2',
    ALPNProtocols: ['http/1.1'],
    requestCert: false,
  }, requestHandler);
  server.headersTimeout = 8000;
  server.requestTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 4;
  server.maxHeadersCount = 32;
  server.on('upgrade', (request, socket, head) => {
    probe.handleUpgrade(request, socket, head);
  });
  server.on('checkContinue', (_request, response) => {
    response.writeHead(417, { 'Content-Length': '0', Connection: 'close' });
    response.end();
  });
  server.on('connect', (_request, socket) => {
    try { socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } catch { socket.destroy(); }
  });
  server.on('clientError', (_error, socket) => {
    try { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } catch { socket.destroy(); }
  });
  return Object.freeze({ server, probe });
}
