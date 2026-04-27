#!/usr/bin/env node
/**
 * ASCII TACTICAL - Game Server
 *
 * Authoritative game server that maintains the single source of truth for all game state.
 * Listens on TCP port 7777 and communicates via newline-delimited JSON.
 *
 * Usage: node server.js [port]
 *
 * Protocol: newline-delimited JSON (one message per line).
 *
 * ===== Client → Server Messages =====
 *   { "type": "join",  "name": "Alice", "team": "T" }
 *   { "type": "key",   "str": "w",      "key": { "name": "w", "ctrl": false } }
 *
 * ===== Server → Client Messages =====
 *   { "type": "yourId",   "id": 1, "team": "T" }
 *   { "type": "lobby",    "players": [...], "countdown": 9, "minPlayers": 2, "maxPlayers": 10 }
 *   { "type": "state",    "state": { players, score, round, eventLog, matchOver, ... } }
 *   { "type": "error",    "message": "..." }
 */

const net = require('net');
const { createState, startNewRound, tick, handlePlayerKey, pushLog } = require('./src/game');
const { createPlayer } = require('./src/player');
const { TICK_MS } = require('./src/config');

// ─── Styled server logging ────────────────────────────────────────────────────
const _styles = {
  info:  ['\x1b[90m',  'INFO '],
  join:  ['\x1b[92m',  'JOIN '],
  leave: ['\x1b[93m',  'LEAVE'],
  game:  ['\x1b[96m',  'GAME '],
  match: ['\x1b[95m',  'MATCH'],
  error: ['\x1b[91m',  'ERROR'],
};
function slog(level, msg) {
  const ts = new Date().toLocaleTimeString('en', { hour12: false });
  const [style, label] = _styles[level] || ['\x1b[97m', level.toUpperCase().padEnd(5)];
  process.stdout.write(`\x1b[90m${ts}\x1b[0m  ${style}${label}\x1b[0m  ${msg}\n`);
}

const PORT = parseInt(process.argv[2], 10) || 7777;
const MIN_PLAYERS = 2;          // Minimum players needed to start a match
const MAX_PLAYERS = 10;         // Maximum players in a single match
const LOBBY_COUNTDOWN_S = 50;   // Seconds until match starts after min players join
const POST_MATCH_S = 15;        // Seconds to wait before server shutdown after match ends

// ===== Connection Tracking =====
// Maps client TCP connections to their metadata

const connections = new Map(); // Map<clientId, { socket, playerId, buf }>
let nextClientId = 1;          // Auto-incrementing client ID

// ===== Game State =====
// Single authoritative game state, synced to all clients each tick

let state = null;              // Null until first player joins, then created
let gameStarted = false;       // False in lobby, true during active round
let lobbyCountdown = LOBBY_COUNTDOWN_S; // Countdown timer visible to players
let countdownTimer = null;     // setInterval handle for lobby countdown
let gameInterval = null;       // setInterval handle for game tick loop

// ===== State Serialization =====
/**
 * Extract only the fields needed to send to clients.
 * Omits internal game data and the map object (clients have their own copy).
 */
function serializeState(s) {
  return {
    players: s.players,        // Array of player objects
    score: s.score,            // { T: number, CT: number }
    round: s.round,            // Round metadata and bomb state
    eventLog: s.eventLog,      // Chat/action log (last 50 entries)
    matchOver: s.matchOver,    // Match finished flag
    tickCounter: s.tickCounter,// Debug counter
    now: s.now,                // Server timestamp (for client sync)
    maxRounds: s.maxRounds,    // Total rounds in a match
    winsRequired: s.winsRequired, // Wins needed to win match
  };
}

// ===== Network Broadcast Helpers =====
/**
 * Send a message to one socket.
 * Uses try-catch to silently ignore errors (e.g., disconnected client).
 */
function send(socket, msg) {
  try {
    socket.write(JSON.stringify(msg) + '\n');
  } catch (_) {
    // Socket may be closed; silently ignore
  }
}

/**
 * Send a message to a specific client by ID.
 */
function sendTo(clientId, msg) {
  const conn = connections.get(clientId);
  if (conn) {
    send(conn.socket, msg);
  }
}

/**
 * Broadcast a message to all connected clients.
 */
function broadcast(msg) {
  for (const conn of connections.values()) {
    send(conn.socket, msg);
  }
}

/**
 * Broadcast lobby state to all clients (used before match starts).
 * Shows player list, countdown timer, and required player counts.
 */
function broadcastLobby() {
  if (!state) return;
  // Extract only public player info (no health, weapons, etc.)
  const players = state.players.map((p) => ({ id: p.id, name: p.name, team: p.team }));
  broadcast({
    type: 'lobby',
    players,
    countdown: lobbyCountdown,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  });
}

// ===== Team Assignment =====
/**
 * Assign a player to a team, respecting their preference when possible.
 * Balances teams: if teams are equal, assigns to the preferred team.
 * Falls back to the smaller team if preference would unbalance.
 *
 * @param {Array} players - Current players in the game
 * @param {string} preferred - 'T', 'CT', or 'auto'
 * @returns {string} Assigned team: 'T' or 'CT'
 */
function chooseTeam(players, preferred) {
  const tCount  = players.filter((p) => p.team === 'T').length;
  const ctCount = players.filter((p) => p.team === 'CT').length;

  // Respect preference if it doesn't unbalance
  if (preferred === 'T'  && tCount  <= ctCount) return 'T';
  if (preferred === 'CT' && ctCount <= tCount)  return 'CT';

  // Default to smaller team
  return tCount <= ctCount ? 'T' : 'CT';
}

// ===== Lobby Countdown =====
/**
 * Start the countdown timer visible to players in the lobby.
 * When countdown reaches 0, the match begins via beginGame().
 * Does nothing if a countdown is already running.
 */
function startCountdown() {
  if (countdownTimer) return; // Already running

  lobbyCountdown = LOBBY_COUNTDOWN_S;
  countdownTimer = setInterval(() => {
    lobbyCountdown -= 1;
    broadcastLobby(); // Update all clients with new countdown
    if (lobbyCountdown <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      beginGame(); // Match starts
    }
  }, 1000);
}

/**
 * Cancel a running countdown (e.g., if a player leaves).
 * Resets the countdown to its initial value.
 */
function cancelCountdown() {
  if (!countdownTimer) return;
  clearInterval(countdownTimer);
  countdownTimer = null;
  lobbyCountdown = LOBBY_COUNTDOWN_S;
}

// ===== Game Lifecycle =====
/**
 * Transition from lobby to the first round and start the game loop.
 *
 * If teams are unbalanced (one team empty), cancels and waits for more players.
 * Once both teams have players, starts the first round and begins the game tick.
 *
 * The game tick runs every TICK_MS (100ms) and sends full state to all clients.
 */
function beginGame() {
  const tCount  = state.players.filter((p) => p.team === 'T').length;
  const ctCount = state.players.filter((p) => p.team === 'CT').length;

  // Both teams must have at least one player
  if (tCount === 0 || ctCount === 0) {
    slog('game', 'Unbalanced teams — waiting for more players...');
    startCountdown();
    return;
  }

  gameStarted = true;
  startNewRound(state, /* first */ true);
  slog('match', `Match started with \x1b[97m${state.players.length}\x1b[0m players`);

  // Main game loop: run game logic and broadcast state every tick
  gameInterval = setInterval(() => {
    tick(state);                              // Update all game logic
    broadcast({                               // Send state to all clients
      type: 'state',
      state: serializeState(state),
    });

    if (state.matchOver) {
      clearInterval(gameInterval);
      gameInterval = null;
      slog('match', `Match over  T \x1b[91m${state.score.T}\x1b[0m : \x1b[96m${state.score.CT}\x1b[0m CT`);

      // Wait POST_MATCH_S seconds before closing server
      setTimeout(() => {
        broadcast({
          type: 'shutdown',
          message: 'Match ended. Reconnect to start a new session.',
        });
        server.close();
        process.exit(0);
      }, POST_MATCH_S * 1000);
    }
  }, TICK_MS);
}

// ===== Client Message Handler =====
/**
 * Process incoming messages from clients.
 *
 * Handles:
 *   - 'join': Player joins the game (only in lobby phase)
 *   - 'key': Player input during the match
 */
function handleClientMessage(clientId, conn, msg) {
  if (msg.type === 'join') {
    // Reject joins if match is already running
    if (gameStarted) {
      sendTo(clientId, { type: 'error', message: 'Match already in progress.' });
      return;
    }

    // Initialize game state on first join
    if (!state) {
      state = createState();
    }

    // Reject if server is full
    if (state.players.length >= MAX_PLAYERS) {
      sendTo(clientId, { type: 'error', message: 'Server is full.' });
      return;
    }

    // Assign team and spawn point
    const team = chooseTeam(state.players, msg.team);
    const map  = state.map;
    const spawns = team === 'T' ? map.spawnsT : map.spawnsCT;
    // Cycle through spawn points to distribute players
    const spawnIdx = state.players.filter((p) => p.team === team).length % spawns.length;

    // Create player object
    const player = createPlayer({
      team,
      name: (msg.name || `Player${clientId}`).slice(0, 16),
      spawn: spawns[spawnIdx],
      spawnIdx,
    });

    state.players.push(player);
    conn.playerId = player.id;

    // Notify client of their ID and team
    sendTo(clientId, { type: 'yourId', id: player.id, team });
    const teamColor = team === 'T' ? '\x1b[91m' : '\x1b[96m';
    slog('join', `\x1b[97m${player.name}\x1b[0m  team ${teamColor}${team}\x1b[0m  (${state.players.length}/${MAX_PLAYERS} total)`);

    // If minimum players reached, start countdown
    if (state.players.length >= MIN_PLAYERS) {
      startCountdown();
    } else {
      broadcastLobby(); // Update other players' lobby view
    }
    return;
  }

  // Handle player input during match
  if (msg.type === 'key' && gameStarted && conn.playerId && state) {
    const key = msg.key || {};
    handlePlayerKey(state, conn.playerId, msg.str || '', {
      name: key.name || '',
      ctrl: !!key.ctrl,
    });
  }
}

// ===== TCP Server Setup =====
/**
 * Create and configure the TCP server.
 * Handles client connections, message parsing, and disconnections.
 */
const server = net.createServer((socket) => {
  const clientId = nextClientId++;
  const conn = { socket, playerId: null, buf: '' }; // Connection metadata
  connections.set(clientId, conn);

  // Parse newline-delimited JSON
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    conn.buf += chunk;
    const lines = conn.buf.split('\n');
    conn.buf = lines.pop(); // Keep incomplete line

    // Process complete lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleClientMessage(clientId, conn, JSON.parse(trimmed));
      } catch (_) {
        // Silently ignore malformed messages
      }
    }
  });

  /**
   * Handle client disconnect.
   * If in lobby: remove player.
   * If in game: mark player as offline (they remain as ghost for duration of round).
   */
  socket.on('close', () => {
    connections.delete(clientId);

    if (state && conn.playerId) {
      const p = state.players.find((pl) => pl.id === conn.playerId);
      if (p) {
        p.connected = false;

        if (!gameStarted) {
          // Lobby phase: remove player immediately
          state.players = state.players.filter((pl) => pl.id !== conn.playerId);
          slog('leave', `\x1b[97m${p.name}\x1b[0m  left lobby  (${state.players.length} remain)`);

          // Cancel countdown if below min players
          if (state.players.length < MIN_PLAYERS) {
            cancelCountdown();
          }
          broadcastLobby();

        } else {
          // Match phase: mark as dead, but keep in player list
          p.alive = false;
          pushLog(state, `[CONNECTION] ${p.name} disconnected.`);
          slog('leave', `\x1b[97m${p.name}\x1b[0m  disconnected during match`);
        }
      }
    }
  });

  // Errors are handled by the 'close' event
  socket.on('error', () => { /* handled by close */ });

  // Send current lobby state to new connections
  if (!gameStarted && state) {
    broadcastLobby();
  }
});

server.listen(PORT, () => {
  const W = 44;
  const bar = '='.repeat(W);
  process.stdout.write([
    '',
    `\x1b[96m+${bar}+\x1b[0m`,
    `\x1b[96m|\x1b[0m  \x1b[1m\x1b[97mASCII-TACTICAL\x1b[0m  \x1b[90m|\x1b[0m  \x1b[96mGAME SERVER\x1b[0m             \x1b[96m|\x1b[0m`,
    `\x1b[96m+${bar}+\x1b[0m`,
    '',
    `  \x1b[90mPort   \x1b[97m${PORT}\x1b[0m`,
    `  \x1b[90mMin    \x1b[97m${MIN_PLAYERS} players\x1b[0m  \x1b[90mMax  \x1b[97m${MAX_PLAYERS} players\x1b[0m`,
    `  \x1b[90mJoin   \x1b[97mnode index.js [host] [name] [T|CT]\x1b[0m`,
    '',
  ].join('\n'));
});

server.on('error', (err) => {
  slog('error', err.message);
  process.exit(1);
});

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  if (gameInterval) clearInterval(gameInterval);
  if (countdownTimer) clearInterval(countdownTimer);
  broadcast({ type: 'shutdown', message: 'Server closed.' });
  server.close();
  process.exit(0);
});
