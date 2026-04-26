/**
 * Player Factory
 *
 * Creates and manages player objects. Players are plain objects with properties
 * that are mutated in-place by game logic (no class-based design for simplicity).
 */

const { WEAPONS, ECONOMY } = require('./config');

let nextId = 1; // Auto-incrementing player ID

/**
 * Create a new player object.
 *
 * @param {object} options
 * @param {string} options.team - 'T' or 'CT'
 * @param {string} options.name - Display name
 * @param {object} options.spawn - Starting position { x, y }
 * @param {number} options.spawnIdx - Which spawn point in the list
 * @param {string} options.weapon - Starting weapon key
 * @returns {object} Player object
 */
function createPlayer({ team, name, spawn, spawnIdx = 0, weapon = 'pistol' }) {
  const w = WEAPONS[weapon];
  return {
    // === Identity ===
    id: nextId++,
    name,
    team,

    // === Position & Facing ===
    pos: { x: spawn.x, y: spawn.y },     // Current position
    spawn: { x: spawn.x, y: spawn.y },   // Spawn point (for respawning)
    spawnIdx,                            // Which spawn in the rotation
    facing: team === 'T' ? 0 : 4,        // 0-7 direction (8 directions)

    // === Health & Armor ===
    health: 100,
    armor: 0,                            // Absorbs damage before health

    // === Weapons & Ammo ===
    weapon,                              // Current weapon key
    ammo: { current: w.magazine, reserve: w.reserve }, // Magazine + reserve
    inventory: { pistol: true, rifle: false, sniper: false }, // Owned weapons
    lastShotAt: 0,                       // Timestamp for fire rate limiting
    reloadingUntil: 0,                   // Timestamp when reload finishes

    // === Economy ===
    money: ECONOMY.startMoney,
    kills: 0,
    deaths: 0,

    // === Bomb / Objectives ===
    hasBomb: false,                      // Carrying the bomb
    plantingUntil: 0,                    // Timestamp when planting finishes
    defusingUntil: 0,                    // Timestamp when defusing finishes

    // === UI State ===
    buyMenuOpen: false,                  // Shop is visible on client
    showStats: false,                    // Stats table visible on client
    alive: true,
    connected: true,
  };
}

/**
 * Reset a player's state for the start of a new round.
 * Keeps money, kills/deaths, but resets health, position, ammo, status.
 *
 * @param {object} player - Player to reset
 * @param {object} map - Map with spawn points
 */
function resetForRound(player, map) {
  const spawns = player.team === 'T' ? map.spawnsT : map.spawnsCT;
  const idx = player.spawnIdx % spawns.length;

  // Respawn player
  player.pos = { x: spawns[idx].x, y: spawns[idx].y };
  player.health = 100;
  player.alive = true;

  // Reset facing direction (T starts facing east, CT west)
  player.facing = player.team === 'T' ? 0 : 4;

  // Clear action timers
  player.plantingUntil = 0;
  player.defusingUntil = 0;
  player.reloadingUntil = 0;

  // Clear bomb
  player.hasBomb = false;

  // Reset ammo to full magazine
  const w = WEAPONS[player.weapon];
  player.ammo = { current: w.magazine, reserve: w.reserve };
}

/**
 * Switch to a different weapon.
 *
 * @param {object} player - Player to equip
 * @param {string} weaponKey - Weapon to switch to (must be in inventory)
 * @returns {boolean} True if switch was successful, false if weapon not owned
 */
function setWeapon(player, weaponKey) {
  // Must own the weapon
  if (!player.inventory[weaponKey]) {
    return false;
  }

  // Already using this weapon
  if (player.weapon === weaponKey) {
    return false;
  }

  // Switch weapon and refill ammo
  player.weapon = weaponKey;
  const w = WEAPONS[weaponKey];
  player.ammo = { current: w.magazine, reserve: w.reserve };
  return true;
}

module.exports = { createPlayer, resetForRound, setWeapon };
