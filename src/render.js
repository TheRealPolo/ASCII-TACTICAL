/**
 * Terminal Rendering
 *
 * Uses raw ANSI escape codes to render the game in the terminal.
 * No external dependencies — everything is pure terminal control codes.
 *
 * Main functions:
 *   - renderFrame(state, myId): Full game view from player perspective
 *   - renderLobby(lobby, myId): Pre-game waiting screen
 */

const { WEAPONS, EQUIPMENT, DIRECTIONS } = require('./config');

// ===== ANSI Color Codes =====
const ESC = '\x1b';
const COLORS = {
  reset:         `${ESC}[0m`,           // Reset all formatting
  bold:          `${ESC}[1m`,           // Bold/bright text
  dim:           `${ESC}[2m`,           // Dim/dark text
  inverse:       `${ESC}[7m`,           // Inverse colors (swap fg/bg)
  fgBlack:       `${ESC}[30m`,          // Foreground colors
  fgRed:         `${ESC}[31m`,
  fgGreen:       `${ESC}[32m`,
  fgYellow:      `${ESC}[33m`,
  fgBlue:        `${ESC}[34m`,
  fgMagenta:     `${ESC}[35m`,
  fgCyan:        `${ESC}[36m`,
  fgWhite:       `${ESC}[37m`,
  fgGray:        `${ESC}[90m`,
  fgBrightRed:   `${ESC}[91m`,         // Bright foreground colors
  fgBrightGreen: `${ESC}[92m`,
  fgBrightYellow:`${ESC}[93m`,
  fgBrightBlue:  `${ESC}[94m`,
  fgBrightCyan:  `${ESC}[96m`,
  fgBrightWhite: `${ESC}[97m`,
  bgRed:         `${ESC}[41m`,         // Background colors
  bgYellow:      `${ESC}[43m`,
  bgBlue:        `${ESC}[44m`,
};

/**
 * Apply color/formatting codes to a string.
 * Automatically resets formatting at the end.
 *
 * @param {string} c - Color codes to apply
 * @param {string} s - Text to colorize
 * @returns {string} Formatted text
 */
function color(c, s) {
  return c + s + COLORS.reset;
}

/**
 * Clear screen and move cursor to top-left.
 * Also hides the cursor for a cleaner display.
 */
function clearAndHome() {
  return `${ESC}[2J${ESC}[H${ESC}[?25l`; // Clear, home, hide cursor
}

/**
 * Move cursor to top-left without clearing.
 * Used for re-rendering without flicker.
 */
function home() {
  return `${ESC}[H`;
}

/**
 * Render the game map.
 *
 * Shows all map tiles, alive players, and the bomb if planted.
 * The local player is highlighted with inverse colors.
 *
 * @param {object} state - Game state
 * @param {number} myId - Local player's ID
 * @returns {array} Array of rendered lines (one per row)
 */
function renderMap(state, myId) {
  const { map, players, round } = state;

  // Copy map tiles into a grid
  const grid = [];
  for (let y = 0; y < map.height; y++) {
    grid.push(map.tiles[y].slice());
  }

  // Place alive players on the grid
  for (const p of players) {
    if (!p.alive) continue;
    grid[p.pos.y][p.pos.x] = { glyph: p.team === 'T' ? 'T' : 'C', player: p };
  }

  // Place the bomb if planted
  if (round.bomb.planted) {
    grid[round.bomb.y][round.bomb.x] = { glyph: '*', bomb: true };
  }

  // Render each row
  const rows = [];
  for (let y = 0; y < map.height; y++) {
    let line = '';
    for (let x = 0; x < map.width; x++) {
      const cell = grid[y][x];

      // Object cell (bomb or player)
      if (typeof cell === 'object') {
        if (cell.bomb) {
          // Bomb blinks on/off every 500ms
          const blink = Math.floor(Date.now() / 250) % 2 === 0;
          line += color(blink ? COLORS.bgYellow + COLORS.fgBlack : COLORS.fgBrightYellow, '*');
        } else {
          // Player
          const p = cell.player;
          const isMe = p.id === myId;
          const teamColor = p.team === 'T' ? COLORS.fgBrightRed : COLORS.fgBrightCyan;
          // Highlight local player with inverse colors
          const style = isMe ? COLORS.bold + teamColor + COLORS.inverse : teamColor;
          line += color(style, cell.glyph);
        }
      } else {
        // Regular tile (wall, floor, water, etc.)
        line += colorTile(cell);
      }
    }
    rows.push(line);
  }

  return rows;
}

/**
 * Get the colored representation of a map tile.
 *
 * @param {string} c - Tile character
 * @returns {string} Colored tile
 */
function colorTile(c) {
  switch (c) {
    case '#': return color(COLORS.fgGray, '#');              // Wall
    case '.': return color(COLORS.fgGray + COLORS.dim, '.'); // Floor (dimmed)
    case 'A': return color(COLORS.fgBrightYellow + COLORS.bold, 'A'); // Bomb site A
    case 'B': return color(COLORS.fgBrightYellow + COLORS.bold, 'B'); // Bomb site B
    case '~': return color(COLORS.fgBlue, '~');              // Water/hazard
    case '|': return color(COLORS.fgGreen, '|');             // Vertical cover
    case '=': return color(COLORS.fgGreen, '=');             // Horizontal cover
    default:  return c;                                       // Unknown (pass through)
  }
}

/**
 * Pad a string to a minimum width (for aligned columns).
 *
 * @param {*} s - Value to pad (converted to string)
 * @param {number} n - Minimum width
 * @returns {string} Padded string
 */
function pad(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

/**
 * Format milliseconds as M:SS.
 *
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time (e.g., "1:23")
 */
function formatTime(ms) {
  if (ms < 0) ms = 0;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Render the heads-up display (HUD).
 *
 * Shows:
 *   - Round info and player counts
 *   - Local player stats (health, ammo, position, money)
 *   - Buy menu (if open)
 *   - Event log (last few chat/action messages)
 *   - Statistics table (if Tab is pressed)
 *   - Current objective
 *   - Round result/match over messages
 *
 * @param {object} state - Game state
 * @param {number} myId - Local player's ID
 * @returns {array} Array of rendered lines for the HUD
 */
function renderHUD(state, myId) {
  const me = state.players.find((p) => p.id === myId);
  const tAlive = state.players.filter((p) => p.team === 'T'  && p.alive).length;
  const cAlive = state.players.filter((p) => p.team === 'CT' && p.alive).length;
  const tTotal = state.players.filter((p) => p.team === 'T').length;
  const cTotal = state.players.filter((p) => p.team === 'CT').length;

  // Localize phase names for display
  const phaseName = {
    buy: 'BUY',
    combat: 'COMBAT',
    resolve: 'RESULT',
  }[state.round.phase] || state.round.phase;

  // Display bomb fuse timer if planted, otherwise phase timer
  let phaseTime;
  if (state.round.phase === 'combat' && state.round.bomb.planted) {
    const fuseLeft = (state.round.bomb.plantedAt + state.round.bombFuseMs) - state.now;
    phaseTime = `BOMB ${formatTime(fuseLeft)}`;
  } else {
    phaseTime = formatTime(state.round.phaseEndsAt - state.now);
  }

  // Determine objective text based on team and bomb status
  const objective = (() => {
    if (!me) return ''; // Spectator
    if (me.team === 'T') {
      if (state.round.bomb.planted) {
        return 'DEFEND THE BOMB';
      }
      return me.hasBomb ? 'PLANT BOMB AT A or B (F)' : 'SUPPORT BOMB CARRIER';
    }
    // CT team
    if (state.round.bomb.planted) {
      return 'DEFUSE THE BOMB (F)';
    }
    return 'DEFEND A or B / ELIMINATE T';
  })();

  const lines = [];

  // ===== Round Header =====
  lines.push(color(COLORS.bold,
    `[ROUND ${state.round.number}/${state.maxRounds}] ` +
    color(COLORS.fgBrightRed, `T ${tAlive}/${tTotal}`) + '  ' +
    color(COLORS.fgBrightCyan, `CT ${cAlive}/${cTotal}`) + '  ' +
    `Score ` +
    color(COLORS.fgBrightRed, `${state.score.T}`) + ':' +
    color(COLORS.fgBrightCyan, `${state.score.CT}`) + '  ' +
    `Phase: ${color(COLORS.fgBrightYellow, phaseName)}  ` +
    `Time: ${color(COLORS.fgBrightYellow, phaseTime)}`
  ));

  // ===== Player Status =====
  if (me) {
    const w = WEAPONS[me.weapon];
    const facing = DIRECTIONS[me.facing];
    const aliveStr = me.alive ? color(COLORS.fgBrightGreen, 'ALIVE') : color(COLORS.fgBrightRed, 'DEAD');
    const reloading = me.reloadingUntil > state.now ? color(COLORS.fgBrightYellow, ' RELOADING') : '';

    lines.push(
      `[ME] ${color(COLORS.bold, me.name)} (${me.team})  ` +
      `Health ${me.health}/100  Armor ${me.armor}  ${aliveStr}`
    );
    lines.push(
      `Weapon ${color(COLORS.bold, w.name)}  Ammo ${me.ammo.current}/${me.ammo.reserve}` + reloading +
      `  Pos (${me.pos.x},${me.pos.y})  Facing ${facing.name} ${facing.glyph}  Money $${me.money}`
    );
    lines.push(`Objective: ${color(COLORS.fgBrightYellow, objective)}`);
  } else {
    // Spectator
    lines.push(color(COLORS.fgGray, '(Spectating)'));
    lines.push('');
    lines.push('');
  }

  // ===== Buy Menu (if open) =====
  if (me && me.buyMenuOpen) {
    lines.push(color(COLORS.bold + COLORS.fgBrightYellow, '— SHOP — (close with B)'));
    lines.push(
      `  [1] ${WEAPONS.pistol.name}  $${WEAPONS.pistol.price}` +
      `   [2] ${WEAPONS.rifle.name}  $${WEAPONS.rifle.price}` +
      `   [3] ${WEAPONS.sniper.name}  $${WEAPONS.sniper.price}`
    );
    lines.push(
      `  [4] ${EQUIPMENT.armor.name}  $${EQUIPMENT.armor.price}` +
      `   [5] ${EQUIPMENT.medkit.name} $${EQUIPMENT.medkit.price}`
    );
  }

  // ===== Event Log (last 5 entries) =====
  lines.push(color(COLORS.fgGray, '— Events —'));
  const recentEvents = state.eventLog.slice(-5);
  for (const e of recentEvents) {
    lines.push('  ' + e);
  }
  // Pad to 5 lines
  for (let i = recentEvents.length; i < 5; i++) {
    lines.push('');
  }

  // ===== Statistics Table or Controls =====
  if (me && me.showStats) {
    // Show detailed stats table
    lines.push(color(COLORS.bold, '— Statistics —'));
    for (const p of state.players) {
      const line =
        `  ${pad(p.name, 12)} ${pad(p.team, 3)} ` +
        `K ${pad(p.kills, 2)} D ${pad(p.deaths, 2)} ` +
        `Health ${pad(p.alive ? p.health : 0, 3)} ` +
        `Weapon ${pad(WEAPONS[p.weapon].name, 8)} ` +
        `$${p.money}` +
        (p.id === myId ? '  <- me' : '');
      // Color by team
      lines.push(p.team === 'T' ? color(COLORS.fgBrightRed, line) : color(COLORS.fgBrightCyan, line));
    }
  } else {
    // Show controls
    lines.push(color(COLORS.fgGray,
      'WASD move · Q/E rotate · SPACE shoot · R reload · F plant/defuse · 1/2/3 weapon · B shop · TAB stats · Ctrl+C quit'
    ));
  }

  // ===== Round Result =====
  if (state.round.phase === 'resolve' && state.round.lastResult) {
    lines.push(color(COLORS.bold + COLORS.fgBrightYellow, `>> ${state.round.lastResult} <<`));
  }

  // ===== Match Over =====
  if (state.matchOver) {
    const winner = state.score.T > state.score.CT ? 'TERRORISTS' : 'COUNTER-TERRORISTS';
    const winColor = state.score.T > state.score.CT ? COLORS.fgBrightRed : COLORS.fgBrightCyan;
    lines.push(color(COLORS.bold + winColor,
      `\n========== ${winner} WIN THE MATCH  ${state.score.T} : ${state.score.CT} ==========`));
    lines.push(color(COLORS.fgGray, 'Ctrl+C to quit.'));
  }

  return lines;
}

/**
 * Render a complete game frame (map + HUD).
 *
 * Displays:
 *   - Title
 *   - Game map (30x20)
 *   - HUD with stats, events, objectives
 *
 * Uses cursor positioning to update in-place without flicker.
 *
 * @param {object} state - Game state
 * @param {number} myId - Local player's ID
 */
function renderFrame(state, myId) {
  const out = [];
  out.push(home()); // Move cursor to top-left

  // Title
  out.push(color(COLORS.bold + COLORS.fgBrightWhite,
    `ASCII TACTICAL  —  Bomb Defuse  —  Best of ${state.maxRounds} (First to ${state.winsRequired})`));
  out.push('');

  // Map
  const mapRows = renderMap(state, myId);
  for (const row of mapRows) {
    out.push(row);
  }
  out.push('');

  // HUD (with clear-to-end-of-line codes to avoid flicker)
  for (const line of renderHUD(state, myId)) {
    out.push(line + `${ESC}[K`); // [K = clear to end of line
  }

  out.push(`${ESC}[J`); // Clear to end of screen

  process.stdout.write(out.join('\n'));
}

/**
 * Render the pre-game lobby screen.
 *
 * Shows:
 *   - Player list grouped by team
 *   - Current player count
 *   - Countdown timer (if sufficient players)
 *   - Status message (waiting for players, starting soon, etc.)
 *
 * @param {object} lobby - Lobby state { players, countdown, minPlayers, maxPlayers }
 * @param {number} myId - Local player's ID
 */
function renderLobby(lobby, myId) {
  const out = [];
  out.push(home()); // Move cursor to top-left

  // Title
  out.push(color(COLORS.bold + COLORS.fgBrightWhite, 'ASCII TACTICAL — LOBBY') + `${ESC}[K`);
  out.push(`${ESC}[K`);

  // Separate players by team
  const tPlayers = lobby.players.filter((p) => p.team === 'T');
  const ctPlayers = lobby.players.filter((p) => p.team === 'CT');

  // Player count
  out.push(color(COLORS.bold, `Connected Players (${lobby.players.length}/${lobby.maxPlayers}):`) + `${ESC}[K`);
  out.push(`${ESC}[K`);

  // Terrorist team
  out.push(color(COLORS.fgBrightRed + COLORS.bold, '  [TERRORISTS]') + `${ESC}[K`);
  if (tPlayers.length === 0) {
    out.push(color(COLORS.fgGray, '    (none)') + `${ESC}[K`);
  }
  for (const p of tPlayers) {
    const tag = p.id === myId ? ' <- you' : '';
    out.push(color(COLORS.fgBrightRed, `    ${p.name}${tag}`) + `${ESC}[K`);
  }
  out.push(`${ESC}[K`);

  // Counter-Terrorist team
  out.push(color(COLORS.fgBrightCyan + COLORS.bold, '  [COUNTER-TERRORISTS]') + `${ESC}[K`);
  if (ctPlayers.length === 0) {
    out.push(color(COLORS.fgGray, '    (none)') + `${ESC}[K`);
  }
  for (const p of ctPlayers) {
    const tag = p.id === myId ? ' <- you' : '';
    out.push(color(COLORS.fgBrightCyan, `    ${p.name}${tag}`) + `${ESC}[K`);
  }

  out.push(`${ESC}[K`);

  // Status message
  if (lobby.players.length < lobby.minPlayers) {
    // Waiting for players
    const needed = lobby.minPlayers - lobby.players.length;
    out.push(color(COLORS.fgBrightYellow,
      `Waiting for more players (minimum ${lobby.minPlayers}, ${needed} needed)...`) + `${ESC}[K`);
  } else if (lobby.countdown > 0) {
    // Countdown in progress
    out.push(color(COLORS.fgBrightGreen, `Enough players! Starting in ${lobby.countdown}s...`) + `${ESC}[K`);
  } else {
    // Starting now
    out.push(color(COLORS.fgBrightGreen, 'Starting match!') + `${ESC}[K`);
  }

  out.push(`${ESC}[K`);
  out.push(color(COLORS.fgGray, 'Ctrl+C to quit.') + `${ESC}[K`);
  out.push(`${ESC}[J`); // Clear to end of screen

  process.stdout.write(out.join('\n'));
}

module.exports = { renderFrame, renderLobby, clearAndHome };
