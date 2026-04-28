/**
 * Game Logic
 *
 * This is the authoritative, server-side game logic.
 * No rendering, no input handling, no AI bots (pure game state).
 * The server calls tick() and handlePlayerKey() every frame.
 *
 * ===== Round Structure =====
 *   buy:     20s  — Players purchase weapons and equipment
 *   combat:  150s — Teams fight; T tries to plant bomb, CT defends
 *   resolve: 5s   — Show results before next round
 *
 * ===== Win Conditions =====
 *   T wins:  Bomb is planted AND detonates, OR all CT are eliminated
 *   CT wins: Bomb defused, OR all T are eliminated, OR time runs out
 */

const { TICK_MS, WEAPONS, WEAPON_SLOTS, EQUIPMENT, ECONOMY, ROUND, DIRECTIONS } = require('./config');
const { createMap } = require('./map');
const { createPlayer, resetForRound, setWeapon } = require('./player');
const { tryShoot, tryReload, finalizeReloads, chebyshevDistance } = require('./combat');

/**
 * Get current server time in milliseconds.
 */
function nowMs() {
  return Date.now();
}

/**
 * Create a new game state object.
 *
 * This is called once when the first player joins the game,
 * and contains all authoritative game data.
 *
 * @returns {object} New game state
 */
function createState() {
  const map = createMap();
  return {
    map,
    players: [],                        // Array of player objects
    score: { T: 0, CT: 0 },            // Wins per team
    round: {
      number: 0,                        // Current round (0-16)
      phase: 'buy',                     // 'buy' | 'combat' | 'resolve'
      phaseStart: 0,                    // When current phase began (timestamp)
      phaseEndsAt: 0,                   // When current phase ends (timestamp)
      bombFuseMs: ROUND.bombFuseMs,    // Time before bomb explodes after plant
      bomb: {
        planted: false,                 // Bomb state
        x: null, y: null,
        plantedAt: 0,
        site: null,                     // 'A' or 'B'
        defuser: null,                  // ID of player defusing
        defuseStart: 0,
      },
      lastResult: '',                   // Text description of how round ended
    },
    eventLog: [],                       // Chat/action log (last 50 entries)
    matchOver: false,                   // Match has finished
    tickCounter: 0,                     // Debug counter
    now: nowMs(),                       // Current server timestamp
    maxRounds: ROUND.maxRounds,
    winsRequired: ROUND.winsRequired,
    events: [],                         // Events this tick (kills, shots, etc.)
  };
}

/**
 * Start a new round.
 *
 * Resets all players' positions and health, clears the bomb,
 * and transitions to the buy phase.
 *
 * @param {object} state - Game state
 * @param {boolean} first - True if this is the first round (show welcome message)
 */
function startNewRound(state, first = false) {
  state.round.number += 1;
  state.round.phase = 'buy';
  state.round.phaseStart = nowMs();
  state.round.phaseEndsAt = state.round.phaseStart + ROUND.buyTimeMs;
  state.round.bomb = {
    planted: false, x: null, y: null, plantedAt: 0, site: null, defuser: null, defuseStart: 0,
  };
  state.round.lastResult = '';

  // Respawn all players
  for (const p of state.players) {
    resetForRound(p, state.map);
    p.buyMenuOpen = false;
  }

  // Give bomb to a random T player
  const tPlayers = state.players.filter((p) => p.team === 'T');
  if (tPlayers.length > 0) {
    tPlayers[Math.floor(Math.random() * tPlayers.length)].hasBomb = true;
  }

  // Log round start message
  if (!first) {
    pushLog(state, `[ROUND ${state.round.number}] Buy phase begins!`);
  } else {
    pushLog(state, '[START] Welcome! Press B to open the shop. You start with a Glock-18.');
  }
}

/**
 * Add a message to the event log (shown to all players in-game).
 *
 * Log is limited to 50 most recent entries.
 *
 * @param {object} state - Game state
 * @param {string} text - Message to log
 */
function pushLog(state, text) {
  state.eventLog.push(text);
  if (state.eventLog.length > 50) {
    state.eventLog.shift(); // Remove oldest entry if over limit
  }
}

// ===== Player Input Handling =====
/**
 * Process a key input from a player.
 *
 * Handles:
 *   - Tab: Toggle stats view
 *   - B: Toggle buy menu (lobby phase only)
 *   - 1-5: Buy items or switch weapons
 *   - WASD: Move in cardinal directions
 *   - Q/E: Rotate left/right
 *   - Space: Shoot (combat phase only)
 *   - R: Reload
 *   - F: Plant/defuse bomb
 *
 * @param {object} state - Game state
 * @param {number} playerId - Player ID
 * @param {string} str - Printable character (if any)
 * @param {object} key - Key metadata { name, ctrl }
 */
function handlePlayerKey(state, playerId, str, key) {
  if (state.matchOver) {
    return;
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return;
  }

  // Toggle statistics display
  if (key.name === 'tab') {
    player.showStats = !player.showStats;
    return;
  }

  // Toggle buy menu (buy phase only)
  if (key.name === 'b') {
    if (state.round.phase === 'buy') {
      player.buyMenuOpen = !player.buyMenuOpen;
    } else {
      pushLog(state, `[${player.name}] You can only buy during the buy phase.`);
    }
    return;
  }

  // Buy menu shortcuts (1-4 = weapons/armor, B closes)
  if (player.buyMenuOpen) {
    if (str === '1') return buy(state, player, 'smg');
    if (str === '2') return buy(state, player, 'rifle');
    if (str === '3') return buy(state, player, 'awp');
    if (str === '4') return buy(state, player, 'armor');
  }

  if (!player.alive) {
    return; // Dead players can't act
  }

  // Weapon swap (only when menu is closed): 1=pistol 2=smg 3=rifle 4=awp
  if (!player.buyMenuOpen) {
    if (str === '1' && player.inventory.pistol) { setWeapon(player, 'pistol'); return; }
    if (str === '2' && player.inventory.smg)    { setWeapon(player, 'smg');    return; }
    if (str === '3' && player.inventory.rifle)  { setWeapon(player, 'rifle');  return; }
    if (str === '4' && player.inventory.awp)    { setWeapon(player, 'awp');    return; }
  }

  // Movement (WASD) - dx, dy offsets
  const moves = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  if (moves[key.name] && state.round.phase !== 'resolve') {
    const [dx, dy] = moves[key.name];
    const nx = player.pos.x + dx;
    const ny = player.pos.y + dy;

    // Can only move to walkable, unoccupied tiles
    if (state.map.isWalkable(nx, ny) && !tileOccupied(state, nx, ny, player.id)) {
      player.pos.x = nx;
      player.pos.y = ny;
      // Movement cancels plant/defuse
      player.plantingUntil = 0;
      player.defusingUntil = 0;
    }
    return;
  }

  // Rotation (Q/E) - shift facing direction
  if (key.name === 'q') {
    player.facing = (player.facing + 7) % 8; // Counter-clockwise
    return;
  }
  if (key.name === 'e') {
    player.facing = (player.facing + 1) % 8; // Clockwise
    return;
  }

  // Shoot (Space) - combat phase only
  if (key.name === 'space' && state.round.phase === 'combat') {
    const dir = DIRECTIONS[player.facing];
    tryShoot(player, state.players, state.map, dir, state.now, state.events);
    return;
  }

  // Reload (R)
  if (key.name === 'r') {
    tryReload(player, state.now, state.events);
    return;
  }

  // Plant bomb (T only) or defuse (CT only) - combat phase only
  if (key.name === 'f' && state.round.phase === 'combat') {
    // T player with bomb attempting to plant
    if (player.team === 'T' && player.hasBomb && !state.round.bomb.planted) {
      const tile = state.map.tileAt(player.pos.x, player.pos.y);
      if (tile === 'A' || tile === 'B') {
        // Start plant if not already planting
        if (player.plantingUntil === 0) {
          player.plantingUntil = state.now + ROUND.bombPlantMs;
          pushLog(state, `[BOMB] ${player.name} begins planting at ${tile}...`);
        }
      } else {
        pushLog(state, `[${player.name}] Not at a bomb site (A or B).`);
      }
    }
    // CT player attempting to defuse planted bomb
    else if (player.team === 'CT' && state.round.bomb.planted) {
      if (player.pos.x === state.round.bomb.x && player.pos.y === state.round.bomb.y) {
        // Start defuse if not already defusing
        if (player.defusingUntil === 0) {
          player.defusingUntil = state.now + ROUND.bombDefuseMs;
          state.round.bomb.defuser = player.id;
          state.round.bomb.defuseStart = state.now;
          pushLog(state, `[BOMB] ${player.name} begins defusing...`);
        }
      } else {
        pushLog(state, `[${player.name}] Move to the bomb (*) to defuse it.`);
      }
    }
    return;
  }
}

/**
 * Check if a tile is occupied by an alive player.
 * Used to block movement into occupied spaces.
 *
 * @param {object} state - Game state
 * @param {number} x, y - Tile coordinates
 * @param {number} ignoreId - Player ID to ignore (typically the moving player)
 * @returns {boolean} True if another alive player is at (x, y)
 */
function tileOccupied(state, x, y, ignoreId) {
  for (const p of state.players) {
    if (!p.alive) continue;
    if (p.id === ignoreId) continue;
    if (p.pos.x === x && p.pos.y === y) {
      return true;
    }
  }
  return false;
}

/**
 * Handle a player purchase during the buy phase.
 *
 * @param {object} state - Game state
 * @param {object} player - Buying player
 * @param {string} item - Weapon slot key or 'armor'
 */
function buy(state, player, item) {
  if (state.round.phase !== 'buy') return;

  // ===== Weapons (smg / rifle / awp — pistol is free default) =====
  if (WEAPONS[item]) {
    const w = WEAPONS[item];
    if (item === 'pistol') return; // Always free, already owned
    if (player.inventory[item]) {
      pushLog(state, `[${player.name}] Already own ${w.name}.`);
      return;
    }
    if (player.money < w.price) {
      pushLog(state, `[${player.name}] Need $${w.price} for ${w.name} (have $${player.money}).`);
      return;
    }
    player.money -= w.price;
    player.inventory[item] = true;
    setWeapon(player, item);
    pushLog(state, `[${player.name}] Bought ${w.name}.`);
    return;
  }

  // ===== Armor =====
  if (item === 'armor') {
    if (player.armor >= EQUIPMENT.armor.value) {
      pushLog(state, `[${player.name}] Already have full armor.`);
      return;
    }
    if (player.money < EQUIPMENT.armor.price) {
      pushLog(state, `[${player.name}] Need $${EQUIPMENT.armor.price} for Armor Vest (have $${player.money}).`);
      return;
    }
    player.money -= EQUIPMENT.armor.price;
    player.armor = Math.max(player.armor, EQUIPMENT.armor.value);
    pushLog(state, `[${player.name}] Bought Armor Vest.`);
    return;
  }
}

// ===== Game Tick =====
/**
 * Main game tick. Called every TICK_MS (100ms) by the server.
 *
 * Updates:
 *   - Reload timers
 *   - Plant/defuse progress
 *   - Bomb fuse
 *   - Round phase transitions
 *   - Win conditions
 *   - Events (kills, etc.)
 *
 * @param {object} state - Game state (mutated in place)
 */
function tick(state) {
  if (state.matchOver) {
    return;
  }

  state.now = nowMs();
  state.tickCounter += 1;

  // ===== Combat Phase Updates =====
  if (state.round.phase === 'combat') {
    finalizeReloads(state.players, state.now);  // Complete any finished reloads
    handlePlantProgress(state);                  // Update bomb planting progress
    handleDefuseProgress(state);                 // Update bomb defuse progress
    handleBombFuse(state);                       // Check if bomb explodes
  } else {
    // Even in other phases, finalize reloads (players might reload while shopping)
    finalizeReloads(state.players, state.now);
  }

  // ===== Event Processing =====
  drainEvents(state);                            // Log kill events, etc.

  // ===== Phase Transitions & Win Conditions =====
  if (state.round.phase === 'combat') {
    // Check if round has ended (all players of a team dead, bomb exploded, etc.)
    const result = checkRoundEnd(state);
    if (result) {
      finishRound(state, result);
    }
    // Check if combat time ran out (CT wins if bomb not planted)
    else if (state.now >= state.round.phaseEndsAt) {
      if (!state.round.bomb.planted) {
        finishRound(state, { winner: 'CT', reason: 'Time expired: CT wins.' });
      }
    }

  } else if (state.round.phase === 'buy') {
    // Transition from buy to combat when time expires
    if (state.now >= state.round.phaseEndsAt) {
      state.round.phase = 'combat';
      state.round.phaseStart = state.now;
      state.round.phaseEndsAt = state.now + ROUND.combatTimeMs;
      for (const p of state.players) {
        p.buyMenuOpen = false; // Close all buy menus
      }
      pushLog(state, '[ROUND] Combat phase starts!');
    }

  } else if (state.round.phase === 'resolve') {
    // Transition from resolve to next round or end match
    if (state.now >= state.round.phaseEndsAt) {
      // Check if match is over (someone reached winsRequired or maxRounds)
      if (state.score.T >= state.winsRequired || state.score.CT >= state.winsRequired ||
          state.round.number >= state.maxRounds) {
        state.matchOver = true;
        return;
      }
      // Otherwise start next round
      startNewRound(state);
    }
  }
}

/**
 * Update bomb planting progress.
 *
 * When a T player with the bomb holds F at a bomb site (A or B),
 * they progress toward planting. If they move away or die, progress resets.
 * When planting completes, they earn a reward and T must defend.
 *
 * @param {object} state - Game state
 */
function handlePlantProgress(state) {
  for (const p of state.players) {
    // Only T players with bomb and active plant timer
    if (!p.alive || p.team !== 'T' || !p.hasBomb || p.plantingUntil === 0) {
      continue;
    }

    const tile = state.map.tileAt(p.pos.x, p.pos.y);

    // Plant progress is lost if player moves away from bomb site
    if (tile !== 'A' && tile !== 'B') {
      p.plantingUntil = 0;
      continue;
    }

    // Plant timer completed — bomb is now planted
    if (state.now >= p.plantingUntil) {
      state.round.bomb.planted = true;
      state.round.bomb.x = p.pos.x;
      state.round.bomb.y = p.pos.y;
      state.round.bomb.plantedAt = state.now;
      state.round.bomb.site = tile;
      p.hasBomb = false;
      p.plantingUntil = 0;

      // Reward planter
      p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.plantReward);
      pushLog(state, `[BOMB] ${p.name} planted the bomb at ${tile}! +$${ECONOMY.plantReward}`);
    }
  }
}

/**
 * Update bomb defusing progress.
 *
 * When a CT player holds F on the planted bomb,
 * they progress toward defusing. If they move away or die, progress resets.
 * When defusing completes, CT wins the round.
 *
 * @param {object} state - Game state
 */
function handleDefuseProgress(state) {
  if (!state.round.bomb.planted) {
    return; // No bomb to defuse
  }

  for (const p of state.players) {
    // No defuse in progress
    if (p.defusingUntil === 0) {
      continue;
    }

    // Defuse progress is lost if player dies or moves away from bomb
    if (!p.alive || p.pos.x !== state.round.bomb.x || p.pos.y !== state.round.bomb.y) {
      p.defusingUntil = 0;
      continue;
    }

    // Defuse timer completed — bomb is defused
    if (state.now >= p.defusingUntil) {
      p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.defuseReward);
      pushLog(state, `[BOMB] ${p.name} defused the bomb! +$${ECONOMY.defuseReward}`);
      finishRound(state, { winner: 'CT', reason: 'Bomb defused.' });
      return;
    }
  }
}

/**
 * Check if the bomb has exploded.
 *
 * If the bomb was planted and the fuse timer expired,
 * kill all nearby players and end the round with T winning.
 *
 * @param {object} state - Game state
 */
function handleBombFuse(state) {
  if (!state.round.bomb.planted) {
    return; // No bomb
  }

  if (state.now >= state.round.bomb.plantedAt + state.round.bombFuseMs) {
    // Bomb explodes!
    pushLog(state, '[BOMB] BOOM! The bomb has exploded.');

    // Kill all players within 6 tiles of the bomb
    for (const p of state.players) {
      if (!p.alive) {
        continue;
      }

      const d = chebyshevDistance(p.pos, { x: state.round.bomb.x, y: state.round.bomb.y });
      if (d <= 6) {
        p.health = 0;
        p.alive = false;
        p.deaths += 1;
      }
    }

    finishRound(state, { winner: 'T', reason: 'Bomb exploded.' });
  }
}

/**
 * Check if the round has ended (all of a team dead, bomb planted/defused, etc.).
 *
 * @param {object} state - Game state
 * @returns {object|null} End condition { winner, reason }, or null if round continues
 */
function checkRoundEnd(state) {
  const tAlive = state.players.filter((p) => p.team === 'T'  && p.alive).length;
  const cAlive = state.players.filter((p) => p.team === 'CT' && p.alive).length;

  // All T dead and bomb not planted → CT wins
  if (tAlive === 0 && !state.round.bomb.planted) {
    return { winner: 'CT', reason: 'All Terrorists eliminated.' };
  }

  // All CT dead and bomb not planted → T wins
  if (cAlive === 0 && !state.round.bomb.planted) {
    return { winner: 'T', reason: 'All Counter-Terrorists eliminated.' };
  }

  return null; // Round continues
}

/**
 * Finish the current round and transition to the resolve phase.
 *
 * Awards money to winning and losing teams, increments score,
 * and checks if the match is over.
 *
 * @param {object} state - Game state
 * @param {object} result - End condition { winner, reason }
 */
function finishRound(state, result) {
  state.round.phase = 'resolve';
  state.round.phaseStart = state.now;
  state.round.phaseEndsAt = state.now + ROUND.resolveTimeMs;

  // Increment winning team's score
  state.score[result.winner] += 1;

  // Create round result message
  state.round.lastResult =
    `${result.winner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} win: ${result.reason} ` +
    `Score ${state.score.T}:${state.score.CT}`;
  pushLog(state, '[ROUND END] ' + state.round.lastResult);

  // Award money to all players based on win/loss
  for (const p of state.players) {
    if (p.team === result.winner) {
      p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.roundWinReward);
    } else {
      p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.roundLossReward);
    }
  }

  // Check if match is over
  if (state.score.T >= state.winsRequired || state.score.CT >= state.winsRequired ||
      state.round.number >= state.maxRounds) {
    state.matchOver = true;
  }
}

/**
 * Process and log all events that occurred this tick.
 *
 * Events include:
 *   - Kills: log and transfer bomb to next T player if needed
 *   - Reloads: log start of reload
 *
 * @param {object} state - Game state
 */
function drainEvents(state) {
  for (const e of state.events) {
    if (e.type === 'kill') {
      const shooter = state.players.find((p) => p.id === e.shooterId);
      const victim  = state.players.find((p) => p.id === e.victimId);

      if (!shooter || !victim) {
        continue;
      }

      // Log the kill
      pushLog(state, `[KILL] ${shooter.name} (${shooter.team}) eliminated ${victim.name} (${victim.team}) with ${WEAPONS[e.weapon].name}`);

      // If victim had the bomb, give it to another T player
      if (victim.hasBomb) {
        victim.hasBomb = false;
        const tMates = state.players.filter((p) => p.team === 'T' && p.alive);
        if (tMates.length > 0) {
          tMates[0].hasBomb = true;
          pushLog(state, `[BOMB] Bomb passed to ${tMates[0].name}.`);
        }
      }

    } else if (e.type === 'reload-start') {
      const p = state.players.find((pl) => pl.id === e.playerId);
      if (p) {
        pushLog(state, `[RELOAD] ${p.name} reloading...`);
      }
    }
  }

  // Clear events for next tick
  state.events.length = 0;
}

module.exports = { createState, startNewRound, tick, handlePlayerKey, pushLog };
