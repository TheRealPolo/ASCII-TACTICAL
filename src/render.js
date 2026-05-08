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

const { WEAPONS, WEAPON_SLOTS, GRENADES, GRENADE_SLOTS, EQUIPMENT, DIRECTIONS } = require('./config');

// Directional glyph for the aim-line overlay (matches DIRECTIONS index 0–7)
const AIM_GLYPHS = ['|', '/', '-', '\\', '|', '/', '-', '\\'];

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

// ─── Smoke-cloud helper ────────────────────────────────────────────────────────
function isSmokeAt(smokeClouds, x, y) {
  if (!smokeClouds || smokeClouds.length === 0) return false;
  for (const s of smokeClouds) {
    const dx = Math.abs(s.pos.x - x);
    const dy = Math.abs(s.pos.y - y);
    if (Math.max(dx, dy) <= s.radius) return true;
  }
  return false;
}

// ─── Aim-line raycast (visual targeting reticle) ─────────────────────────────
// Walks the local player's facing direction tile-by-tile, stopping when it
// hits a wall, cover, an enemy, smoke, or runs out of range.
// Returns null when the player is blinded (flash effect active).
//
// Returns: { path: [{x,y}, ...], endHit, target?, facing }
function buildAimOverlay(state, me) {
  if (!me || !me.alive) return null;
  if (me.blindUntil && me.blindUntil > state.now) return null; // Blinded by flash

  const dir = DIRECTIONS[me.facing];
  const range = WEAPONS[me.weapon].range;
  const smokeClouds = state.smokeClouds || [];

  const path = [];
  let x = me.pos.x;
  let y = me.pos.y;
  let endHit = 'range';
  let target = null;

  for (let step = 1; step <= range; step++) {
    x += dir.dx;
    y += dir.dy;

    if (!state.map.inBounds(x, y))            { endHit = 'edge';  break; }

    const hit = state.players.find(p => p.alive && p.id !== me.id && p.pos.x === x && p.pos.y === y);
    if (hit)                                   { endHit = 'enemy'; target = hit; break; }

    if (state.map.blocksLOS(x, y))             { endHit = 'wall';  break; }

    if (isSmokeAt(smokeClouds, x, y))          { endHit = 'smoke'; break; }

    path.push({ x, y });
  }

  return { path, endHit, target, facing: me.facing };
}

// ─── Ping helpers ────────────────────────────────────────────────────────────
const PING_BLOCKS = '▁▂▃▄▅▆▇█';

function pingColor(ms) {
  if (ms == null) return C.gray;
  if (ms < 50)   return C.bgreen;
  if (ms < 100)  return C.byellow;
  if (ms < 200)  return C.yellow;
  return C.bred;
}

function pingGraph(history) {
  const recent = history.slice(-10);
  if (!recent.length) return '';
  const peak = Math.max(...recent, 1);
  return recent.map(v => PING_BLOCKS[Math.min(7, Math.floor(v / peak * 8))]).join('');
}

// ─── Map renderer ────────────────────────────────────────────────────────────
function renderMap(state, myId) {
  const { map, players, round } = state;
  const me = players.find(p => p.id === myId);
  const smokeClouds  = state.smokeClouds  || [];
  const projectiles  = state.projectiles  || [];

  const grid = [];
  for (let y = 0; y < map.height; y++) grid.push(map.tiles[y].slice());

  // Smoke tiles (drawn below everything else)
  for (const s of smokeClouds) {
    for (let dy = -s.radius; dy <= s.radius; dy++) {
      for (let dx = -s.radius; dx <= s.radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > s.radius) continue;
        const sx = s.pos.x + dx;
        const sy = s.pos.y + dy;
        if (sy >= 0 && sy < map.height && sx >= 0 && sx < map.width) {
          if (map.tiles[sy][sx] === '.') grid[sy][sx] = { smoke: true };
        }
      }
    }
  }

  for (const p of players) {
    if (!p.alive) continue;
    grid[p.pos.y][p.pos.x] = { player: p };
  }
  if (round.bomb.planted) {
    grid[round.bomb.y][round.bomb.x] = { bomb: true };
  }

  // Grenades in flight / waiting to detonate
  for (const proj of projectiles) {
    const existing = grid[proj.pos.y][proj.pos.x];
    // Don't overwrite players or bomb, but overwrite floor/smoke tiles
    if (!existing || !existing.player) {
      grid[proj.pos.y][proj.pos.x] = { grenade: proj };
    }
  }

  // Compute the local player's aim path
  const aim        = buildAimOverlay(state, me);
  const aimSet     = aim ? new Set(aim.path.map(t => t.x + ',' + t.y)) : null;
  const aimGlyph   = aim ? AIM_GLYPHS[aim.facing] : null;
  const lockedOnId = aim && aim.endHit === 'enemy' ? aim.target.id : null;

  // Flash blind: replace entire map with static noise for the local player
  const blinded = me && me.blindUntil && me.blindUntil > state.now;

  if (blinded) {
    return Array.from({ length: map.height }, () => {
      let line = '';
      for (let x = 0; x < map.width; x++) {
        line += col(C.bwhite, Math.random() > 0.5 ? '▓' : '░');
      }
      return line;
    });
  }

  return Array.from({ length: map.height }, (_, y) => {
    let line = '';
    for (let x = 0; x < map.width; x++) {
      const cell = grid[y][x];

      if (typeof cell !== 'object') {
        if (aimSet && cell === '.' && aimSet.has(x + ',' + y)) {
          line += col(C.byellow + C.bold, aimGlyph);
        } else {
          line += colorTile(cell);
        }
      } else if (cell.smoke) {
        line += col(C.gray, '░');
      } else if (cell.grenade) {
        const proj = cell.grenade;
        const timeLeft = proj.detonateAt - state.now;
        const blink = Math.floor(Date.now() / 250) % 2 === 0;
        let style;
        if      (proj.type === 'frag')  style = blink ? C.bred + C.bold  : C.bred;
        else if (proj.type === 'smoke') style = blink ? C.gray + C.bold  : C.gray;
        else                            style = blink ? C.bwhite + C.bold : C.byellow;
        line += col(style, 'o');
      } else if (cell.bomb) {
        const blink = Math.floor(Date.now() / 300) % 2 === 0;
        line += blink
          ? col(C.bgYellow + '\x1b[30m' + C.bold, '*')
          : col(C.byellow + C.bold, '*');
      } else {
        const p = cell.player;
        const tc = p.team === 'T' ? C.bred : C.bcyan;
        const glyph = p.team === 'T' ? 'T' : 'C';

        let style;
        if (p.id === myId)             style = C.bold + tc + C.inv;
        else if (p.id === lockedOnId)  style = C.bold + C.bgYellow + '\x1b[30m';
        else                           style = tc;
        line += col(style, glyph);
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
function buildHUD(state, myId, pingInfo = null) {
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

    const pingDisp = pingInfo != null
      ? ` ${col(pingColor(pingInfo.ping), '●')}${col(C.gray, pingInfo.ping + 'ms')}`
      : '';

    // Grenade indicator: selected type in brackets, counts for all three
    const selG = me.selectedGrenade || 'frag';
    const grenadeDisp = GRENADE_SLOTS.map(t => {
      const cnt = (me.grenades && me.grenades[t]) || 0;
      const label = { frag: 'F', smoke: 'S', flash: '!' }[t];
      const active = t === selG;
      const color = cnt > 0
        ? (active ? C.byellow + C.bold : C.bwhite)
        : C.gray + C.dim;
      return col(color, active ? `[${label}${cnt}]` : `${label}${cnt}`);
    }).join('');

    rows.push(padR(` ${col(C.gray, 'AMMO')} ${col(C.bwhite + C.bold, me.ammo.current + '/' + me.ammo.reserve)}  ${grenadeDisp}  ${col(C.gray, 'CASH')} ${col(C.bgreen + C.bold, '$' + me.money)}${pingDisp}`, HUD_W));
  } else {
    rows.push(padR(col(C.gray, '  (spectating)'), HUD_W));
    rows.push(''); rows.push(''); rows.push('');
  }

  // ── Scoreboard ────────────────────────────────────────────────────────────
  if (pingInfo && pingInfo.history.length > 0) {
    const graph    = pingGraph(pingInfo.history);
    const graphLen = graph.length + 1; // +1 space
    const dashes   = Math.max(0, 17 - graphLen);
    rows.push(col(C.gray, ' ' + '-'.repeat(8) + ' SCOREBOARD ' + '-'.repeat(dashes)) +
              ' ' + col(pingColor(pingInfo.ping), graph));
  } else {
    rows.push(col(C.gray, ' ' + '-'.repeat(8) + ' SCOREBOARD ' + '-'.repeat(17)));
  }

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
//
//  ─────────────── SHOP ───────────────
//  [1] MP5-SD        $1500   SMG
//  [2] AK-47         $2700   RIFLE
//  [3] AWP           $4750   SNIPER
//  [4] Armor Vest    $1000
//  Budget $xxxx  · [B] close
//  (owned weapons shown dimmed)
//
function buildBuyRows(me) {
  function weaponLine(key, num) {
    const w = WEAPONS[key];
    const owned = me.inventory[key];
    const numTag = col(owned ? C.gray : C.byellow + C.bold, `[${num}]`);
    const nameStr = padR(w.name, 10);
    const priceStr = w.price === 0
      ? col(C.gray, '  FREE')
      : col(owned ? C.gray : C.bgreen, `$${w.price}`);
    const ownedTag = owned ? col(C.gray + C.dim, ' ✓') : '';
    return padR(` ${numTag} ${owned ? col(C.gray, nameStr) : nameStr} ${priceStr}${ownedTag}`, HUD_W);
  }

  function grenadeLine(key, num) {
    const g = GRENADES[key];
    const cnt = (me.grenades && me.grenades[key]) || 0;
    const maxCarry = 2;
    const full = cnt >= maxCarry;
    const numTag = col(full ? C.gray : C.byellow + C.bold, `[${num}]`);
    const nameStr = padR(g.name, 14);
    const priceStr = col(full ? C.gray : C.bgreen, full ? 'max' : `$${g.price}`);
    const cntTag = col(C.gray + C.dim, ` ${cnt}/${maxCarry}`);
    return padR(` ${numTag} ${full ? col(C.gray, nameStr) : nameStr} ${priceStr}${cntTag}`, HUD_W);
  }

  const armorOwned = me.armor >= EQUIPMENT.armor.value;
  const armorNum   = col(armorOwned ? C.gray : C.byellow + C.bold, '[5]');
  const armorName  = padR(EQUIPMENT.armor.name, 10);
  const armorPrice = col(armorOwned ? C.gray : C.bgreen, armorOwned ? ' owned' : `$${EQUIPMENT.armor.price}`);

  // Compact grenade row: [6]F $300 0/2  [7]S $300 0/2  [8]! $200 0/2
  const grenadeRow = GRENADE_SLOTS.map((t, i) => {
    const g   = GRENADES[t];
    const cnt = (me.grenades && me.grenades[t]) || 0;
    const full = cnt >= 2;
    const label = { frag: 'F', smoke: 'S', flash: '!' }[t];
    const num = col(full ? C.gray : C.byellow + C.bold, `[${6 + i}]${label}`);
    const price = col(full ? C.gray : C.bgreen, full ? 'max' : `$${g.price}`);
    return `${num} ${price} ${col(C.gray + C.dim, cnt + '/2')}`;
  }).join('  ');

  return [
    col(C.gray, ' ' + '─'.repeat(12) + ' SHOP ' + '─'.repeat(15)) + col(C.gray + C.dim, ' [B] close'),
    weaponLine('smg',   2),
    weaponLine('rifle', 3),
    weaponLine('awp',   4),
    padR(` ${armorNum} ${armorOwned ? col(C.gray, armorName) : armorName} ${armorPrice}`, HUD_W),
    padR(` ${grenadeRow}`, HUD_W),
    padR(` ${col(C.gray, 'Budget')} ${col(C.bgreen + C.bold, '$' + me.money)}  ${col(C.gray, '2-5 equip  6-8 util')}`, HUD_W),
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
function renderFrame(state, myId, pingInfo = null) {
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
  const hudRows = buildHUD(state, myId, pingInfo);

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
  out.push(col(C.gray, ' WASD/QE move  SPACE shoot  G throw  H cycle-util  R reload  1-4 weapon  B shop  F plant  ^C quit') + `${E}[K`);
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

// ─── Global Rooms browser ─────────────────────────────────────────────────────
function renderRooms(rooms, selectedIdx, mmHost, mmPort) {
  const W = MAP_INNER + 1 + HUD_W; // 78
  const H = '=', V = '|';

  const out = [home()];
  out.push('+' + H.repeat(W) + '+');
  out.push(V + padR(col(C.bwhite + C.bold, '  ASCII-TACTICAL  |  GLOBAL ROOMS'), W) + V);
  out.push('+' + H.repeat(W) + '+');

  // Column widths
  const COL_NAME    = 28;
  const COL_PLAYERS = 10;
  const COL_STATUS  = 10;

  const header = col(C.gray,
    '  ' +
    'ROOM'.padEnd(COL_NAME) +
    'PLAYERS'.padEnd(COL_PLAYERS) +
    'STATUS'.padEnd(COL_STATUS)
  );
  out.push(V + padR(header, W) + V);
  out.push(V + col(C.gray, '  ' + '─'.repeat(W - 4)) + '  ' + V);

  const MAX_VISIBLE = 12;
  const start = Math.max(0, selectedIdx - Math.floor(MAX_VISIBLE / 2));
  const slice = rooms.slice(start, start + MAX_VISIBLE);

  if (slice.length === 0) {
    out.push(V + padR(col(C.gray, '  No rooms available — be the first to host!'), W) + V);
    out.push(V + padR(col(C.gray, '  node server.js --mm ' + mmHost + ':' + mmPort + ' --name "My Room"'), W) + V);
  } else {
    for (let i = 0; i < slice.length; i++) {
      const r   = slice[i];
      const idx = start + i;
      const sel = idx === selectedIdx;

      const phaseColor = r.phase === 'lobby' ? C.bgreen : r.phase === 'combat' ? C.bred : C.byellow;
      const cursor     = sel ? col(C.byellow + C.bold, '> ') : '  ';
      const nameStr    = sel
        ? col(C.bwhite + C.bold, truncR(r.name, COL_NAME))
        : col(C.white,           truncR(r.name, COL_NAME));
      const playersStr = col(
        r.players >= r.maxPlayers ? C.bred : C.bgreen,
        `${r.players}/${r.maxPlayers}`.padEnd(COL_PLAYERS)
      );
      const statusStr  = col(phaseColor, r.phase.padEnd(COL_STATUS));
      const hostStr    = col(C.gray, `  ${r.host}:${r.port}`);

      const line = cursor + nameStr + playersStr + statusStr + hostStr;
      out.push(V + padR(line, W) + V);
    }
  }

  out.push(V + ' '.repeat(W) + V);
  out.push('+' + H.repeat(W) + '+');

  const hint = col(C.gray, '  W/S or ↑/↓ navigate   ENTER join   R refresh   ^C quit') +
               col(C.gray, `   MM: ${mmHost}:${mmPort}`);
  out.push(V + padR(hint, W) + V);
  out.push('+' + H.repeat(W) + '+');
  out.push(`${E}[J`);

  process.stdout.write(out.join('\n'));
}

module.exports = { renderFrame, renderLobby, renderRooms, clearAndHome };
