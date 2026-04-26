/**
 * Terminal Rendering — Modern TUI
 *
 * Side-by-side layout: 30×20 map on the left, HUD on the right.
 * Uses Unicode box-drawing characters and block-element bars.
 * Zero dependencies — pure Node.js ANSI escape codes.
 *
 * Frame width: 80 columns  (1 + 32 map + 1 + 45 HUD + 1)
 * Frame height: 24 rows    (1 top + 1 header + 1 sep + 20 map + 1 bottom)
 */

const { WEAPONS, EQUIPMENT } = require('./config');

const E = '\x1b';

const C = {
  reset:   `${E}[0m`,   bold:    `${E}[1m`,   dim:     `${E}[2m`,   inv:     `${E}[7m`,
  gray:    `${E}[90m`,
  red:     `${E}[31m`,  green:   `${E}[32m`,  yellow:  `${E}[33m`,
  blue:    `${E}[34m`,  cyan:    `${E}[36m`,  white:   `${E}[37m`,
  bred:    `${E}[91m`,  bgreen:  `${E}[92m`,  byellow: `${E}[93m`,
  bcyan:   `${E}[96m`,  bwhite:  `${E}[97m`,
  bgRed:   `${E}[41m`,  bgYellow:`${E}[43m`,  bgBlue:  `${E}[44m`,  bgBlack: `${E}[40m`,
};

function col(codes, s) { return codes + s + C.reset; }
function stripAnsi(s)  { return s.replace(/\x1b\[[0-9;]*[mGKJH]/g, ''); }
function visLen(s)     { return stripAnsi(s).length; }
function padR(s, w) {
  const len = visLen(s);
  if (len === w) return s;
  if (len < w)  return s + ' '.repeat(w - len);
  // Too long: strip ANSI codes and hard-truncate (safety net)
  return stripAnsi(s).slice(0, w);
}

function truncR(s, w) {
  const len = visLen(s);
  if (len <= w) return padR(s, w);
  // Truncate from the right and pad
  let truncated = s;
  while (visLen(truncated) > w - 3) {
    truncated = truncated.slice(0, -1);
  }
  return padR(truncated + col(C.gray, '...'), w);
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const MAP_W     = 30;
const MAP_INNER = MAP_W + 2;   // 32  (1 space padding each side)
const HUD_W     = 45;
// Total visual width: 1 + 32 + 1 + 45 + 1 = 80

// ─── Terminal control ─────────────────────────────────────────────────────────
function home()         { return `${E}[H`; }
function clearAndHome() { return `${E}[2J${E}[H${E}[?25l`; }

// ─── Block bar (e.g. health, armor) ──────────────────────────────────────────
function bar(val, max, width, fillColor) {
  const n = Math.round(Math.min(Math.max(val, 0), max) / max * width);
  return col(fillColor, '█'.repeat(n)) + col(C.gray + C.dim, '░'.repeat(width - n));
}

// ─── Time format ─────────────────────────────────────────────────────────────
function fmt(ms) {
  if (ms <= 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Map tile colors ──────────────────────────────────────────────────────────
function colorTile(c) {
  switch (c) {
    case '#': return col(C.white,            '█');
    case '.': return col(C.gray + C.dim,     '.');
    case 'A': return col(C.byellow + C.bold, 'A');
    case 'B': return col(C.byellow + C.bold, 'B');
    case '~': return col(C.blue,             '~');
    case '|': return col(C.green,            '|');
    case '=': return col(C.green,            '=');
    default:  return c;
  }
}

// ─── Map renderer ────────────────────────────────────────────────────────────
function renderMap(state, myId) {
  const { map, players, round } = state;

  const grid = [];
  for (let y = 0; y < map.height; y++) grid.push(map.tiles[y].slice());

  for (const p of players) {
    if (!p.alive) continue;
    grid[p.pos.y][p.pos.x] = { player: p };
  }
  if (round.bomb.planted) {
    grid[round.bomb.y][round.bomb.x] = { bomb: true };
  }

  return Array.from({ length: map.height }, (_, y) => {
    let line = '';
    for (let x = 0; x < map.width; x++) {
      const cell = grid[y][x];
      if (typeof cell !== 'object') {
        line += colorTile(cell);
      } else if (cell.bomb) {
        const blink = Math.floor(Date.now() / 300) % 2 === 0;
        line += blink
          ? col(C.bgYellow + '\x1b[30m' + C.bold, '*')
          : col(C.byellow + C.bold, '*');
      } else {
        const p = cell.player;
        const tc = p.team === 'T' ? C.bred : C.bcyan;
        const glyph = p.team === 'T' ? 'T' : 'C';
        line += col(p.id === myId ? C.bold + tc + C.inv : tc, glyph);
      }
    }
    return line;
  });
}

// ─── Objective text ───────────────────────────────────────────────────────────
function objective(state, me) {
  if (!me) return '';
  if (me.team === 'T') {
    if (state.round.bomb.planted) return 'DEFEND THE BOMB';
    return me.hasBomb ? 'PLANT BOMB  [F]' : 'SUPPORT BOMB CARRIER';
  }
  if (state.round.bomb.planted) return 'DEFUSE THE BOMB  [F]';
  return 'DEFEND SITES  ·  ELIMINATE T';
}

// ─── HUD rows (exactly 20, each HUD_W = 45 visual chars) ─────────────────────
//
//  Rows  0– 3  player stats (name, HP, armor/weapon, ammo/cash)
//  Row   4     ── SCOREBOARD ──
//  Row   5     TERRORISTS header
//  Rows  6– 8  up to 3 T players
//  Row   9     COUNTER-TERRORISTS header
//  Rows 10–12  up to 3 CT players
//  Row  13     ── EVENTS ──
//  Rows 14–18  last 5 events
//  Row  19     objective / round result / match result
//
function buildHUD(state, myId) {
  const me = state.players.find(p => p.id === myId);
  const tP  = state.players.filter(p => p.team === 'T');
  const ctP = state.players.filter(p => p.team === 'CT');
  const rows = [];

  // ── Player stats ─────────────────────────────────────────────────────────
  if (me) {
    const w  = WEAPONS[me.weapon];
    const dot = me.alive ? col(C.bgreen, '*') : col(C.gray + C.dim, 'x');
    const tag = me.team === 'T'
      ? col(C.bgRed   + C.bwhite + C.bold, ' T ')
      : col(C.bgBlue  + C.bwhite + C.bold, ' CT');

    rows.push(padR(` ${dot} ${col(C.bold + C.bwhite, me.name)}`, HUD_W - 3) + tag);

    const hc = me.health > 60 ? C.bgreen : me.health > 30 ? C.byellow : C.bred;
    rows.push(padR(` ${col(C.gray, 'HP')} ${bar(me.health, 100, 12, hc)} ${col(hc + C.bold, String(me.health).padStart(3))}`, HUD_W));

    const reload = me.reloadingUntil > state.now ? col(C.byellow, ' [R]') : '';
    rows.push(padR(` ${col(C.gray, 'AR')} ${bar(me.armor, 100, 8, C.bcyan)} ${col(C.bcyan, String(me.armor).padStart(3))}  ${col(C.byellow, w.name)}${reload}`, HUD_W));

    rows.push(padR(` ${col(C.gray, 'AMMO')} ${col(C.bwhite + C.bold, me.ammo.current + '/' + me.ammo.reserve)}  ${col(C.gray, 'CASH')} ${col(C.bgreen + C.bold, '$' + me.money)}`, HUD_W));
  } else {
    rows.push(padR(col(C.gray, '  (spectating)'), HUD_W));
    rows.push(''); rows.push(''); rows.push('');
  }

  // ── Scoreboard ────────────────────────────────────────────────────────────
  rows.push(col(C.gray, ' ' + '-'.repeat(8) + ' SCOREBOARD ' + '-'.repeat(17)));

  rows.push(padR(col(C.bred + C.bold, ' TERRORISTS'), HUD_W));
  const showT = tP.slice(0, 3);
  for (const p of showT) {
    const mark = p.id === myId ? col(C.byellow, '>') : ' ';
    const hp   = p.alive ? col(C.bgreen, String(p.health).padStart(3)) : col(C.gray + C.dim, '---');
    const line = ` ${mark} ${p.name.slice(0, 11).padEnd(11)} ${String(p.kills).padStart(2)}/${String(p.deaths).padStart(2)}  HP ${hp}`;
    rows.push(padR(p.id === myId ? col(C.bred + C.bold, line) : col(C.bred, line), HUD_W));
  }
  for (let i = showT.length; i < 3; i++) rows.push('');

  rows.push(padR(col(C.bcyan + C.bold, ' COUNTER-TERRORISTS'), HUD_W));
  const showCT = ctP.slice(0, 3);
  for (const p of showCT) {
    const mark = p.id === myId ? col(C.byellow, '>') : ' ';
    const hp   = p.alive ? col(C.bgreen, String(p.health).padStart(3)) : col(C.gray + C.dim, '---');
    const line = ` ${mark} ${p.name.slice(0, 11).padEnd(11)} ${String(p.kills).padStart(2)}/${String(p.deaths).padStart(2)}  HP ${hp}`;
    rows.push(padR(p.id === myId ? col(C.bcyan + C.bold, line) : col(C.bcyan, line), HUD_W));
  }
  for (let i = showCT.length; i < 3; i++) rows.push('');

  // ── Events ────────────────────────────────────────────────────────────────
  rows.push(col(C.gray, ' ' + '-'.repeat(11) + ' EVENTS ' + '-'.repeat(14)));

  const MAX_EVENT = HUD_W - 4;  // " > " prefix = 3 chars + 1 margin
  const events = state.eventLog.slice(-5);
  for (let i = 0; i < 5; i++) {
    if (!events[i]) { rows.push(''); continue; }
    const txt = events[i].length > MAX_EVENT ? events[i].slice(0, MAX_EVENT - 1) + '~' : events[i];
    rows.push(padR(` ${col(C.gray, '>')} ${txt}`, HUD_W));
  }

  // ── Objective / result ────────────────────────────────────────────────────
  if (state.round.phase === 'resolve' && state.round.lastResult) {
    rows.push(padR(col(C.byellow + C.bold, ` ** ${state.round.lastResult}`), HUD_W));
  } else if (state.matchOver) {
    const winner = state.score.T > state.score.CT ? 'TERRORISTS WIN!' : 'COUNTER-TERRORISTS WIN!';
    const wc = state.score.T > state.score.CT ? C.bred : C.bcyan;
    rows.push(padR(col(wc + C.bold, ` ++ ${winner}`), HUD_W));
  } else {
    rows.push(padR(` ${col(C.gray, '>')} ${col(C.byellow, objective(state, me))}`, HUD_W));
  }

  return rows;  // always 20 rows
}

// ─── Buy-menu overlay (replaces rows 13–18) ──────────────────────────────────
function buildBuyRows(me) {
  return [
    col(C.gray, ' ' + '-'.repeat(13) + ' SHOP ' + '-'.repeat(14)),
    padR(` ${col(C.byellow + C.bold, '[1]')} ${padR(WEAPONS.pistol.name, 8)} ${col(C.bgreen, '$' + WEAPONS.pistol.price)}   ${col(C.byellow + C.bold, '[2]')} ${padR(WEAPONS.rifle.name, 6)} ${col(C.bgreen, '$' + WEAPONS.rifle.price)}`, HUD_W),
    padR(` ${col(C.byellow + C.bold, '[3]')} ${padR(WEAPONS.sniper.name, 8)} ${col(C.bgreen, '$' + WEAPONS.sniper.price)}`, HUD_W),
    padR(` ${col(C.byellow + C.bold, '[4]')} ${padR(EQUIPMENT.armor.name, 9)} ${col(C.bgreen, '$' + EQUIPMENT.armor.price)}  ${col(C.byellow + C.bold, '[5]')} ${padR(EQUIPMENT.medkit.name, 6)} ${col(C.bgreen, '$' + EQUIPMENT.medkit.price)}`, HUD_W),
    padR(` ${col(C.gray, 'Budget')} ${col(C.bgreen + C.bold, '$' + me.money)}  ${col(C.gray, '· close with [B]')}`, HUD_W),
    '',
  ];
}

// ─── Stats overlay (replaces rows 5–18 when TAB is held) ─────────────────────
function applyStatsOverlay(hudRows, state, myId) {
  const players = state.players;
  let r = 5;
  hudRows[r++] = padR(col(C.bwhite + C.bold, ` ${'NAME'.padEnd(13)} ${'TM'.padEnd(3)} K   D   HP`), HUD_W);
  hudRows[r++] = padR(col(C.gray, ' ' + '-'.repeat(HUD_W - 2)), HUD_W);
  for (const p of players.slice(0, 12)) {
    if (r >= 19) break;
    const tc   = p.team === 'T' ? C.bred : C.bcyan;
    const hp   = p.alive ? String(p.health).padStart(3) : '---';
    const mark = p.id === myId ? '>' : ' ';
    const line = ` ${mark} ${padR(p.name.slice(0, 12), 12)} ${p.team.padEnd(3)} ${String(p.kills).padStart(2)}  ${String(p.deaths).padStart(2)}  ${hp}`;
    hudRows[r++] = padR(p.id === myId ? col(tc + C.bold, line) : col(tc, line), HUD_W);
  }
  while (r < 19) hudRows[r++] = '';
}

// ─── Full frame ───────────────────────────────────────────────────────────────
function renderFrame(state, myId) {
  const { round, score } = state;
  const phaseName = { buy: 'BUY', combat: 'COMBAT', resolve: 'RESULT' }[round.phase] || round.phase;

  let phaseTime;
  if (round.phase === 'combat' && round.bomb.planted) {
    const fuseLeft = (round.bomb.plantedAt + round.bombFuseMs) - state.now;
    phaseTime = `BOMB ${fmt(fuseLeft)}`;
  } else {
    phaseTime = fmt(round.phaseEndsAt - state.now);
  }

  const me = state.players.find(p => p.id === myId);
  const tAlive = state.players.filter(p => p.team === 'T'  && p.alive).length;
  const tTotal = state.players.filter(p => p.team === 'T').length;
  const cAlive = state.players.filter(p => p.team === 'CT' && p.alive).length;
  const cTotal = state.players.filter(p => p.team === 'CT').length;

  const mapRows = renderMap(state, myId);
  const hudRows = buildHUD(state, myId);

  if (me && me.buyMenuOpen) {
    const buy = buildBuyRows(me);
    for (let i = 0; i < buy.length; i++) hudRows[13 + i] = padR(buy[i], HUD_W);
  }
  if (me && me.showStats) {
    applyStatsOverlay(hudRows, state, myId);
  }

  // Left header: "ASCII-TACTICAL  Rd 16/16" — max ~26 chars, fits in MAP_INNER=32
  const leftHead = padR(
    ` ${col(C.bwhite + C.bold, 'ASCII-TACTICAL')}  ${col(C.gray, 'Rd')} ${col(C.byellow, round.number + '/' + state.maxRounds)}`,
    MAP_INNER
  );
  // Right header: score + alive counts + phase + timer — max ~44 chars, fits in HUD_W=45
  const rightHead = padR(
    ` ${col(C.bred, 'T')} ${col(C.bred + C.bold, tAlive + '/' + tTotal)}  ${col(C.bred + C.bold, String(score.T))}${col(C.gray, ':')}${col(C.bcyan + C.bold, String(score.CT))}  ${col(C.bcyan, 'CT')} ${col(C.bcyan + C.bold, cAlive + '/' + cTotal)}  ${col(C.bwhite, phaseName)} ${col(C.byellow + C.bold, phaseTime)}`,
    HUD_W
  );

  const H = '=', V = '|';
  const out = [home()];
  out.push('+' + H.repeat(MAP_INNER) + '+' + H.repeat(HUD_W) + '+');
  out.push(V + leftHead + V + rightHead + V);
  out.push('+' + H.repeat(MAP_INNER) + '+' + H.repeat(HUD_W) + '+');

  for (let i = 0; i < 20; i++) {
    const mRow = ' ' + (mapRows[i] || ' '.repeat(MAP_W)) + ' ';
    out.push(V + mRow + V + padR(hudRows[i] || '', HUD_W) + V);
  }

  out.push('+' + H.repeat(MAP_INNER) + '+' + H.repeat(HUD_W) + '+');
  out.push(col(C.gray, ' WASD/QE move  SPACE shoot  R reload  1/2/3 weapon  B shop  TAB stats  ^C quit') + `${E}[K`);
  out.push(`${E}[J`);

  process.stdout.write(out.join('\n'));
}

// ─── Lobby screen ─────────────────────────────────────────────────────────────
function renderLobby(lobby, myId) {
  const W = MAP_INNER + 1 + HUD_W;  // 78  (inner content width)
  const half = Math.floor(W / 2);   // 39

  const tP  = lobby.players.filter(p => p.team === 'T');
  const ctP = lobby.players.filter(p => p.team === 'CT');
  const total = lobby.players.length;

  const H = '=', V = '|';

  const out = [home()];
  out.push('+' + H.repeat(W) + '+');
  out.push(V + padR(col(C.bwhite + C.bold, '  ASCII-TACTICAL  |  LOBBY'), W) + V);
  out.push('+' + H.repeat(W) + '+');

  const countStr = `  Players: ${col(C.byellow + C.bold, total + '/' + lobby.maxPlayers)}  ·  Need ${col(C.bwhite, lobby.minPlayers)} to start`;
  out.push(V + padR(countStr, W) + V);
  out.push(V + ' '.repeat(W) + V);

  const tHead  = padR(col(C.bred  + C.bold, '  [ TERRORISTS ]'), half);
  const ctHead = padR(col(C.bcyan + C.bold, '  [ COUNTER-TERRORISTS ]'), W - half - 1);
  out.push(V + tHead + V + ctHead + V);
  out.push(V + col(C.gray, '  ' + '-'.repeat(half - 2)) + V + col(C.gray, ' ' + '-'.repeat(W - half - 2)) + V);

  const rows = Math.max(tP.length, ctP.length, 3);
  for (let i = 0; i < rows; i++) {
    const tp = tP[i];
    const cp = ctP[i];

    let lc = '';
    if (tp) {
      const you = tp.id === myId ? col(C.byellow, ' < you') : '';
      lc = `  ${col(C.bred, tp.name)}${you}`;
    }
    let rc = '';
    if (cp) {
      const you = cp.id === myId ? col(C.byellow, ' < you') : '';
      rc = ` ${col(C.bcyan, cp.name)}${you}`;
    }
    out.push(V + padR(lc, half) + V + padR(rc, W - half - 1) + V);
  }

  out.push(V + ' '.repeat(W) + V);
  out.push('+' + H.repeat(W) + '+');

  let status;
  if (total < lobby.minPlayers) {
    const need = lobby.minPlayers - total;
    status = `  Waiting for ${col(C.byellow + C.bold, need)} more player${need !== 1 ? 's' : ''}...`;
  } else if (lobby.countdown > 0) {
    status = `  Starting in ${col(C.bgreen + C.bold, lobby.countdown + 's')}...`;
  } else {
    status = col(C.bgreen + C.bold, '  STARTING MATCH!');
  }

  out.push(V + padR(status, W) + V);
  out.push(V + padR(col(C.gray, '  Ctrl+C to quit'), W) + V);
  out.push('+' + H.repeat(W) + '+');
  out.push(`${E}[J`);

  process.stdout.write(out.join('\n'));
}

module.exports = { renderFrame, renderLobby, clearAndHome };
