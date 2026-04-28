#!/usr/bin/env node
/**
 * ASCII TACTICAL - Matchmaking Server
 *
 * Central room discovery hub for global multiplayer.
 * Game servers register here; clients browse available rooms.
 *
 * Usage: node matchmaking.js [port]
 *        Default port: 7776
 *
 * ===== Game Server → MM =====
 *   { type: "register",   port, name, maxPlayers, host? }  →  { type: "registered", id }
 *   { type: "heartbeat",  id, players, phase }
 *   { type: "unregister", id }
 *
 * ===== Client → MM =====
 *   { type: "list" }  →  { type: "rooms", rooms: [...] }
 */

'use strict';

const net    = require('net');
const crypto = require('crypto');

const PORT           = parseInt(process.argv[2], 10) || 7776;
const ROOM_TIMEOUT   = 35_000;   // ms — remove rooms that stop heartbeating
const CLEAN_INTERVAL = 10_000;   // ms — how often to sweep for stale rooms

// ─── Room Registry ────────────────────────────────────────────────────────────
const rooms = new Map(); // roomId → room object

function newId() {
  return crypto.randomBytes(4).toString('hex');
}

function cleanStale() {
  const cutoff = Date.now() - ROOM_TIMEOUT;
  for (const [id, r] of rooms) {
    if (r.lastSeen < cutoff) {
      rooms.delete(id);
      slog('expire', `"${r.name}" (${id}) timed out`);
    }
  }
}

setInterval(cleanStale, CLEAN_INTERVAL).unref();

// ─── Logging ──────────────────────────────────────────────────────────────────
function slog(level, msg) {
  const ts = new Date().toLocaleTimeString('en', { hour12: false });
  const colors = { reg: '\x1b[92m', expire: '\x1b[93m', error: '\x1b[91m', info: '\x1b[90m' };
  const c = colors[level] || '\x1b[97m';
  process.stdout.write(`\x1b[90m${ts}\x1b[0m  ${c}${level.padEnd(6)}\x1b[0m  ${msg}\n`);
}

// ─── TCP Server ───────────────────────────────────────────────────────────────
const server = net.createServer((socket) => {
  const remoteIp = (socket.remoteAddress || '').replace(/^::ffff:/, '');
  let buf      = '';
  let myRoomId = null; // set once this socket registers as a game server

  const send = (msg) => {
    try { socket.write(JSON.stringify(msg) + '\n'); } catch (_) {}
  };

  socket.setEncoding('utf8');

  socket.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete tail
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) continue;
      let msg;
      try { msg = JSON.parse(t); } catch (_) { continue; }
      handle(msg);
    }
  });

  function handle(msg) {
    if (msg.type === 'register') {
      const id   = newId();
      const host = msg.host || remoteIp;
      const room = {
        id,
        name:       (msg.name || 'Unnamed').slice(0, 32),
        host,
        port:       Number(msg.port)       || 7777,
        players:    0,
        maxPlayers: Number(msg.maxPlayers) || 10,
        phase:      'lobby',
        lastSeen:   Date.now(),
      };
      rooms.set(id, room);
      myRoomId = id;
      send({ type: 'registered', id });
      slog('reg', `"${room.name}" @ ${host}:${room.port}  id=${id}`);

    } else if (msg.type === 'heartbeat') {
      const r = rooms.get(msg.id);
      if (r) {
        if (msg.players    != null) r.players    = msg.players;
        if (msg.phase      != null) r.phase      = msg.phase;
        if (msg.maxPlayers != null) r.maxPlayers = msg.maxPlayers;
        r.lastSeen = Date.now();
      }

    } else if (msg.type === 'unregister') {
      if (rooms.delete(msg.id)) slog('expire', `Unregistered ${msg.id}`);
      if (myRoomId === msg.id) myRoomId = null;

    } else if (msg.type === 'list') {
      const list = [...rooms.values()].map(({ id, name, host, port, players, maxPlayers, phase }) =>
        ({ id, name, host, port, players, maxPlayers, phase }));
      send({ type: 'rooms', rooms: list });
    }
  }

  socket.on('close', () => {
    if (myRoomId && rooms.has(myRoomId)) {
      const name = rooms.get(myRoomId).name;
      rooms.delete(myRoomId);
      slog('expire', `"${name}" server disconnected`);
    }
  });

  socket.on('error', () => {});
});

server.listen(PORT, () => {
  const W = 44;
  const bar = '='.repeat(W);
  process.stdout.write([
    '',
    `\x1b[95m+${bar}+\x1b[0m`,
    `\x1b[95m|\x1b[0m  \x1b[1m\x1b[97mASCII-TACTICAL\x1b[0m  \x1b[90m|\x1b[0m  \x1b[95mMATCHMAKING SERVER\x1b[0m       \x1b[95m|\x1b[0m`,
    `\x1b[95m+${bar}+\x1b[0m`,
    '',
    `  \x1b[90mPort       \x1b[97m${PORT}\x1b[0m`,
    `  \x1b[90mHost game  \x1b[97mnode server.js --mm localhost\x1b[0m`,
    `  \x1b[90mJoin game  \x1b[97mnode index.js --mm localhost Alice T\x1b[0m`,
    '',
  ].join('\n'));
});

server.on('error', (err) => {
  process.stderr.write(`[ERROR] ${err.message}\n`);
  process.exit(1);
});

process.on('SIGINT', () => { server.close(); process.exit(0); });
