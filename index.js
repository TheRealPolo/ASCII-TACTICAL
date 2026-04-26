#!/usr/bin/env node
/**
 * ASCII TACTICAL - Game Client
 *
 * This is a TCP client that connects to the game server and renders the game
 * state in the terminal. It communicates via newline-delimited JSON messages.
 *
 * Usage: node index.js [host] [name] [team]
 *
 *   host  — server address (default: localhost)
 *   name  — player name (default: Player)
 *   team  — preferred team: 'T' (Terrorist), 'CT' (Counter-Terrorist), or 'auto' (default)
 *
 * Example: node index.js localhost Alice T
 */

const net = require('net');
const readline = require('readline');
const { renderFrame, renderLobby, clearAndHome } = require('./src/render');
const { createMap } = require('./src/map');

// Parse command-line arguments
const args    = process.argv.slice(2);
const HOST    = args[0] || 'localhost';
const PORT    = 7777;
const MY_NAME = (args[1] || 'Player').slice(0, 16); // Limit name to 16 chars
const MY_TEAM = args[2] || 'auto';

// ===== Client State =====
// Tracks connection phase and game state for the local client

let myId       = null;           // Unique ID assigned by server when joining
let phase      = 'connecting';   // Current phase: 'connecting' | 'lobby' | 'game'
let lastState  = null;           // Last received game state
let lastLobby  = null;           // Last received lobby state
const localMap = createMap();    // Map is loaded once on client, never changes (maps are deterministic)

// ===== Network Setup =====
// Establish TCP connection to the game server

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  // On successful connection, send join request
  socket.write(JSON.stringify({ type: 'join', name: MY_NAME, team: MY_TEAM }) + '\n');
});

socket.setEncoding('utf8');
let buf = ''; // Buffer for partial messages (newline-delimited JSON)

/**
 * Handle incoming data from server.
 * The protocol uses newline-delimited JSON, so we buffer partial lines.
 */
socket.on('data', (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop(); // Keep incomplete line in buffer

  // Process all complete lines
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleServerMessage(JSON.parse(trimmed));
    } catch (_) {
      // Silently ignore malformed messages
    }
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
    `  \x1b[90mHost    \x1b[97m${HOST}:${PORT}\x1b[0m`,
    `  \x1b[90mReason  \x1b[91m${err.message}\x1b[0m`,
    '',
    '  \x1b[90m1.\x1b[0m Start the server:   \x1b[97mnode server.js\x1b[0m',
    '  \x1b[90m2.\x1b[0m Connect a client:   \x1b[97mnode index.js [host] [name] [T|CT]\x1b[0m',
    '',
  ].join('\n'));
  process.exit(1);
});

// ===== Server Message Handling =====
/**
 * Process messages from the server.
 *
 * Message types:
 *   - 'yourId': Assign player ID and transition to lobby
 *   - 'lobby': Update lobby state (list of players, countdown)
 *   - 'state': Update game state (player positions, health, etc.)
 *   - 'error': Fatal error message, disconnect
 *   - 'shutdown': Server is shutting down gracefully
 */
function handleServerMessage(msg) {
  if (msg.type === 'yourId') {
    // Server assigned us an ID — we're officially in the game
    myId  = msg.id;
    phase = 'lobby';
    process.stdout.write(clearAndHome());

  } else if (msg.type === 'lobby') {
    // Lobby update: players joining/leaving or countdown ticking
    lastLobby = msg;
    if (phase === 'lobby' && myId !== null) {
      renderLobby(msg, myId);
    }

  } else if (msg.type === 'state') {
    // Game state update: full authoritative state from server
    // The map object has methods, so we inject our local copy
    msg.state.map = localMap;
    lastState = msg.state;
    phase = 'game';
    if (myId !== null) {
      renderFrame(lastState, myId);
    }

  } else if (msg.type === 'error') {
    // Fatal error: display and exit
    restoreTerminal();
    console.error('\n[ERROR]', msg.message);
    process.exit(1);

  } else if (msg.type === 'shutdown') {
    // Graceful server shutdown
    restoreTerminal();
    console.log('\n[SERVER]', msg.message);
    process.exit(0);
  }
}

// ===== Keyboard Input =====
// Enable raw mode to capture individual keypresses (not line-buffered)

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true); // Receive input without waiting for Enter
} else {
  console.error('This client must run in an interactive terminal.');
  process.exit(1);
}
process.stdin.resume();

/**
 * Handle keypresses and send them to the server.
 * Only sends during the game phase (not during lobby).
 */
process.stdin.on('keypress', (str, key) => {
  if (!key) return;

  // Ctrl+C always exits cleanly
  if (key.ctrl && key.name === 'c') {
    restoreTerminal();
    process.exit(0);
  }

  // Only forward keys once we're in-game and have been assigned an ID
  if (phase !== 'game' || myId === null) return;

  try {
    socket.write(JSON.stringify({
      type: 'key',
      str: str || '',
      key: { name: key.name || '', ctrl: !!key.ctrl },
    }) + '\n');
  } catch (_) {
    // Silently ignore send errors
  }
});

/**
 * Restore terminal to normal state.
 * - Show cursor (hidden during game rendering)
 * - Reset colors and formatting
 * - Exit raw mode
 */
function restoreTerminal() {
  process.stdout.write('\x1b[?25h\x1b[0m\n'); // Show cursor, reset colors
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  } catch (_) {
    // Silently ignore errors on cleanup
  }
}

// Restore terminal when process exits
process.on('exit', restoreTerminal);

// ─── Connecting screen ────────────────────────────────────────────────────────
process.stdout.write(clearAndHome());
process.stdout.write([
  '\x1b[96m+============================================+\x1b[0m',
  '\x1b[96m|\x1b[0m  \x1b[1m\x1b[97mASCII-TACTICAL\x1b[0m                           \x1b[96m|\x1b[0m',
  '\x1b[96m+============================================+\x1b[0m',
  `  \x1b[90mConnecting to  \x1b[97m${HOST}:${PORT}\x1b[0m`,
  `  \x1b[90mName           \x1b[97m${MY_NAME}\x1b[0m`,
  `  \x1b[90mTeam           \x1b[97m${MY_TEAM}\x1b[0m`,
  '',
  '  \x1b[90mWaiting for server...\x1b[0m',
  '',
].join('\n'));
