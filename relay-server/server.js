'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const READER_KEY = String(process.env.READER_KEY || '');
const allowedSymbols = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD']);
const allowedIntervals = new Set([60, 300, 900, 3600]);
let latestPacket = null;

if (!READER_KEY) {
  console.error('READER_KEY environment variable is required.');
  process.exit(1);
}

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({
    service: 'CandleIQ read-only candle relay',
    ok: true,
    hasLivePacket: Boolean(latestPacket),
    lastDetectedAt: latestPacket ? latestPacket.detectedAt : null
  }));
});

const wss = new WebSocketServer({
  server,
  maxPayload: 256 * 1024,
  perMessageDeflate: false
});

function sanitizePacket(value) {
  if (!value || value.type !== 'candleiq-candles') return null;
  const symbol = String(value.symbol || '').toUpperCase();
  const interval = Number(value.interval);
  if (!allowedSymbols.has(symbol) || !allowedIntervals.has(interval) || !Array.isArray(value.candles)) return null;
  const candles = value.candles.slice(-120).map(item => ({
    time: Number(item.time),
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close)
  })).filter(item => (
    Number.isFinite(item.time) && Number.isFinite(item.open) && Number.isFinite(item.high) &&
    Number.isFinite(item.low) && Number.isFinite(item.close) &&
    item.high >= Math.max(item.open, item.close) && item.low <= Math.min(item.open, item.close)
  ));
  if (candles.length < 8) return null;
  return {
    type: 'candleiq-candles',
    symbol,
    interval,
    candles,
    detectedAt: Number(value.detectedAt) || Date.now(),
    detector: 'screen-color-v1'
  };
}

function broadcast(packet) {
  const payload = JSON.stringify(packet);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

wss.on('connection', (socket, request) => {
  const url = new URL(request.url, 'http://localhost');
  const role = url.searchParams.get('role') === 'reader' ? 'reader' : 'viewer';
  if (role === 'reader' && url.searchParams.get('key') !== READER_KEY) {
    socket.close(1008, 'Invalid reader key');
    return;
  }
  socket.role = role;
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

  if (latestPacket) socket.send(JSON.stringify(latestPacket));

  socket.on('message', raw => {
    if (socket.role !== 'reader') return;
    try {
      const packet = sanitizePacket(JSON.parse(String(raw)));
      if (!packet) return;
      latestPacket = packet;
      broadcast(packet);
    } catch (error) {
      // Ignore malformed reader frames and keep the relay available.
    }
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach(socket => {
    if (!socket.isAlive) return socket.terminate();
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));
server.listen(PORT, () => console.log('CandleIQ relay listening on port ' + PORT));
