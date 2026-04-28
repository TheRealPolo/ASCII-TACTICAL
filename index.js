#!/usr/bin/env node
/**
 * ASCII TACTICAL - Game Client
 *
 * Connects to a game server and renders the match in the terminal.
 * Supports direct connection OR matchmaking room browser.
 *
 * ── Direct connection ───────────────────────────────────────────────────────
 *   node index.js [host] [name] [team]
 *
 *   host  — server address (default: localhost)
 *   name  — player name   (default: Player)
 *   team  — T | CT | auto (default: auto)
 *
 *   Example: node index.js game.example.com Alice T
 *
 * ── Global matchmaking browser ──────────────────────────────────────────────
 *   node index.js --mm [host[:port]] [name] [team]
 *
 *   Browse live rooms, pick one with arrow keys, press ENTER to join.
 *
 *   Example: node index.js --mm mm.example.com Alice T
 */

'use strict';

const net      = require('net');
const readline = require('readline');
const { renderFrame, renderLobby, renderRooms, clearAndHome } = require('./src/render');
const { createMap } = require('./src/map');

// ─── Arg parsing ──────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);

let MM_HOST = null, MM_PORT = 7776;
const mmFlagIdx = rawArgs.indexOf('--mm');
if (mmFlagIdx !== -1) {
  const mmArg = (rawArgs[mmFlagIdx + 1] && !rawArgs[mmFlagIdx + 1].startsWith('-'))
    ? rawArgs[mmFlagIdx + 1]
    : 'localhost';
  const [h, p] = mmArg.split(':');
  MM_HOST = h;
  if (p) MM_PORT = parseInt(p, 10) || 7776;
}

// Positional args (exclude --mm and its value)
const posArgs = rawArgs.filter((_, i) => i !== mmFlagIdx && (mmFlagIdx === -1 || i !== mmFlagIdx + 1));

const GAME_HOST = MM_HOST ? null : (posArgs[0] || 'localhost');
const GAME_PORT = 7777;
const MY_NAME   = (MM_HOST ? posArgs[0] : posArgs[1] || 'Player').slice(0, 16) || 'Player';
const MY_TEAM   = MM_HOST  ? (posArgs[1] || 'auto') : (posArgs[2] || 'auto');

// ─── Client state ─────────────────────────────────────────────────────────────
let myId       = null;
let phase      = 'connecting'; // connecting | rooms | lobby | game
let lastState  = null;
let lastLobby  = null;
const localMap = createMap();

// ─── Room browser state ───────────────────────────────────────────────────────
let mmRooms      = [];
let mmSelIdx     = 0;
let mmSocket     = null;
let mmBuf        = '';

// ─── Game socket (set once we know which server to join) ──────────────────────
let socket = null;

// ─── Terminal helpers ─────────────────────────────────────────────────────────
function restoreTerminal() {
  process.stdout.write('\x1b[?25h\x1b[0m\n');
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch (_) {}
}
process.on('exit', restoreTerminal);

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
} else {
  process.stderr.write('This client must run in an interactive terminal.\n');
  process.exit(1);
}
process.stdin.resume();

// ─── Keyboard input ───────────────────────────────────────────────────────────
process.stdin.on('keypress', (str, key) => {
  if (!key) return;
  if (key.ctrl && key.name === 'c') { restoreTerminal(); process.exit(0); }

  if (phase === 'rooms') {
    handleRoomKey(str, key);
  } else if (phase === 'game' && myId !== null && socket) {
    try {
      socket.write(JSON.stringify({
        type: 'key',
        str:  str || '',
        key:  { name: key.name || '', ctrl: !!key.ctrl },
      }) + '\n');
    } catch (_) {}
  }
});

// ─── Room browser keyboard ────────────────────────────────────────────────────
function handleRoomKey(str, key) {
  const name = key.name || '';
  if (name === 'up'   || str === 'w' || str === 'W') {
    mmSelIdx = Math.max(0, mmSelIdx - 1);
    renderRooms(mmRooms, mmSelIdx, MM_HOST, MM_PORT);
  } else if (name === 'down' || str === 's' || str === 'S') {
    mmSelIdx = Math.min(Math.max(mmRooms.length - 1, 0), mmSelIdx + 1);
    renderRooms(mmRooms, mmSelIdx, MM_HOST, MM_PORT);
  } else if (name === 'return' && mmRooms.length > 0) {
    const room = mmRooms[mmSelIdx];
    if (room) joinRoom(room);
  } else if (str === 'r' || str === 'R') {
    mmRequestList();
  }
}

// ─── Matchmaking connection ───────────────────────────────────────────────────
function connectMatchmaking() {
  phase = 'connecting';
  process.stdout.write(clearAndHome());
  process.stdout.write([
    '\x1b[95m+============================================+\x1b[0m',
    '\x1b[95m|\x1b[0m  \x1b[1m\x1b[97mASCII-TACTICAL\x1b[0m  |  \x1b[95mGLOBAL ROOMS\x1b[0m         \x1b[95m|\x1b[0m',
    '\x1b[95m+============================================+\x1b[0m',
    `  \x1b[90mConnecting to matchmaking  \x1b[97m${MM_HOST}:${MM_PORT}\x1b[0m`,
    '',
    '  \x1b[90mFetching room list...\x1b[0m',
    '',
  ].join('\n'));

  mmSocket = net.createConnection({ host: MM_HOST, port: MM_PORT }, () => {
    phase = 'rooms';
    mmRequestList();
  });

  mmSocket.setEncoding('utf8');
  mmSocket.on('data', (chunk) => {
    mmBuf += chunk;
    const lines = mmBuf.split('\n');
    mmBuf = lines.pop();
    for (const raw of lines) {
      try { handleMMMessage(JSON.parse(raw.trim())); } catch (_) {}
    }
  });

  mmSocket.on('close', () => {
    if (phase === 'rooms') {
      // MM disconnected while browsing — show error
      process.stdout.write(clearAndHome());
      process.stderr.write([
        '',
        '\x1b[91m+========================================+\x1b[0m',
        '\x1b[91m|  MATCHMAKING DISCONNECTED              |\x1b[0m',
        '\x1b[91m+========================================+\x1b[0m',
        `  \x1b[90mServer  \x1b[97m${MM_HOST}:${MM_PORT}\x1b[0m`,
        '',
        '  \x1b[90mPress ^C to quit\x1b[0m',
        '',
      ].join('\n'));
    }
  });

  mmSocket.on('error', (err) => {
    restoreTerminal();
    process.stderr.write([
      '',
      '\x1b[91m+========================================+\x1b[0m',
      '\x1b[91m|  MATCHMAKING FAILED                    |\x1b[0m',
      '\x1b[91m+========================================+\x1b[0m',
      `  \x1b[90mHost    \x1b[97m${MM_HOST}:${MM_PORT}\x1b[0m`,
      `  \x1b[90mReason  \x1b[91m${err.message}\x1b[0m`,
      '',
      '  \x1b[90m1.\x1b[0m Start matchmaking:  \x1b[97mnode matchmaking.js\x1b[0m',
      '  \x1b[90m2.\x1b[0m Browse rooms:       \x1b[97mnode index.js --mm localhost Alice T\x1b[0m',
      '',
    ].join('\n'));
    process.exit(1);
  });
}

function mmRequestList() {
  if (mmSocket && !mmSocket.destroyed) {
    try { mmSocket.write(JSON.stringify({ type: 'list' }) + '\n'); } catch (_) {}
  }
}

function handleMMMessage(msg) {
  if (msg.type === 'rooms') {
    mmRooms  = msg.rooms || [];
    mmSelIdx = Math.min(mmSelIdx, Math.max(mmRooms.length - 1, 0));
    renderRooms(mmRooms, mmSelIdx, MM_HOST, MM_PORT);
  }
}

function joinRoom(room) {
  // Close MM connection, then connect directly to the game server
  phase = 'connecting';
  if (mmSocket && !mmSocket.destroyed) mmSocket.destroy();
  connectToGame(room.host, room.port);
}

// ─── Game server connection ───────────────────────────────────────────────────
function connectToGame(host, port) {
  process.stdout.write(clearAndHome());
  process.stdout.write([
    '\x1b[96m+============================================+\x1b[0m',
    '\x1b[96m|\x1b[0m  \x1b[1m\x1b[97mASCII-TACTICAL\x1b[0m                           \x1b[96m|\x1b[0m',
    '\x1b[96m+============================================+\x1b[0m',
    `  \x1b[90mConnecting to  \x1b[97m${host}:${port}\x1b[0m`,
    `  \x1b[90mName           \x1b[97m${MY_NAME}\x1b[0m`,
    `  \x1b[90mTeam           \x1b[97m${MY_TEAM}\x1b[0m`,
    '',
    '  \x1b[90mWaiting for server...\x1b[0m',
    '',
  ].join('\n'));

  socket = net.createConnection({ host, port }, () => {
    socket.write(JSON.stringify({ type: 'join', name: MY_NAME, team: MY_TEAM }) + '\n');
  });

  socket.setEncoding('utf8');
  let buf = '';

  socket.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try { handleServerMessage(JSON.parse(t)); } catch (_) {}
    }
  });

  socket.on('close', () => {
    restoreTerminal();
    console.log('\nDisconnected from server.');
    process.exit(0);
  });

  socket.on('error', (err) => {
    restoreTerminal();
    process.stderr.write([
      '',
      '\x1b[91m+========================================+\x1b[0m',
      '\x1b[91m|  CONNECTION FAILED                     |\x1b[0m',
      '\x1b[91m+========================================+\x1b[0m',
      `  \x1b[90mHost    \x1b[97m${host}:${port}\x1b[0m`,
      `  \x1b[90mReason  \x1b[91m${err.message}\x1b[0m`,
      '',
      '  \x1b[90m1.\x1b[0m Start the server:   \x1b[97mnode server.js\x1b[0m',
      '  \x1b[90m2.\x1b[0m Connect a client:   \x1b[97mnode index.js [host] [name] [T|CT]\x1b[0m',
      '',
    ].join('\n'));
    process.exit(1);
  });
}

// ─── Server message handling ──────────────────────────────────────────────────
function handleServerMessage(msg) {
  if (msg.type === 'yourId') {
    myId  = msg.id;
    phase = 'lobby';
    process.stdout.write(clearAndHome());

  } else if (msg.type === 'lobby') {
    lastLobby = msg;
    if (phase === 'lobby' && myId !== null) renderLobby(msg, myId);

  } else if (msg.type === 'state') {
    msg.state.map = localMap;
    lastState = msg.state;
    phase = 'game';
    if (myId !== null) renderFrame(lastState, myId);

  } else if (msg.type === 'error') {
    restoreTerminal();
    console.error('\n[ERROR]', msg.message);
    process.exit(1);

  } else if (msg.type === 'shutdown') {
    restoreTerminal();
    console.log('\n[SERVER]', msg.message);
    process.exit(0);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
process.stdout.write(clearAndHome());

if (MM_HOST) {
  connectMatchmaking();
} else {
  connectToGame(GAME_HOST, GAME_PORT);
}
