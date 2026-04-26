/**
 * Game Configuration
 *
 * Central location for game balance parameters.
 * Tweak these values to adjust gameplay difficulty and pacing.
 */

// Game tick rate (milliseconds between each server update)
const TICK_MS = 100;

// ===== Weapons =====
// Properties: range (tiles), damage, magazine size, reserve ammo, cooldown, reload time, price
// Adjust these to balance weapon choices in the economy
const WEAPONS = {
  pistol: {
    name: 'Pistol',
    range: 15,        // How far bullets travel
    damage: 15,       // Damage per shot
    magazine: 12,     // Rounds loaded at once
    reserve: 60,      // Extra ammo available
    cooldownMs: 400,  // Minimum ms between shots
    reloadMs: 1500,   // Time to reload (hidden by other actions)
    price: 500,
  },
  rifle: {
    name: 'Rifle',
    range: 25,
    damage: 30,
    magazine: 30,
    reserve: 90,
    cooldownMs: 600,
    reloadMs: 2200,
    price: 2500,
  },
  sniper: {
    name: 'Sniper',
    range: 40,
    damage: 85,
    magazine: 5,
    reserve: 30,
    cooldownMs: 1500, // Slow fire rate
    reloadMs: 3000,
    price: 4700,
  },
};

// ===== Equipment =====
// Armor absorbs 50% of incoming damage (up to its value).
// Medkit restores health to 100.
const EQUIPMENT = {
  armor: {
    name: 'Armor Vest',
    price: 1000,
    value: 50,        // Absorbs up to 50 damage (at 50% reduction)
  },
  medkit: {
    name: 'Medkit',
    price: 400,
    value: 50,        // Restores up to 50 health
  },
};

// ===== Economy (Money System) =====
// Players earn money from kills, objectives, and round wins.
// Money is capped at maxMoney to prevent buying everything.
const ECONOMY = {
  startMoney: 800,        // Starting money each round
  killReward: 300,        // Bonus for eliminating opponent
  plantReward: 400,       // Bonus for planting bomb
  defuseReward: 400,      // Bonus for defusing bomb
  roundWinReward: 3200,   // Winning team gets this much
  roundLossReward: 1400,  // Losing team gets consolation money
  maxMoney: 16000,        // Cannot hold more than this
};

// ===== Round Timing =====
// Each round has three phases: buy, combat, resolve
const ROUND = {
  buyTimeMs: 20000,       // Time to purchase weapons/equipment
  combatTimeMs: 150000,   // Time to fight (bomb must be planted/defused before this)
  resolveTimeMs: 5000,    // Time to show results before next round
  bombPlantMs: 3000,      // Time required to plant bomb (reduced from 30s for playability)
  bombDefuseMs: 5000,     // Time required to defuse (reduced from 20s)
  bombFuseMs: 30000,      // Time before bomb explodes after plant
  winsRequired: 9,        // First team to X wins takes the match
  maxRounds: 16,          // Maximum rounds before declaring winner
};

// ===== Teams =====
const TEAM = { T: 'T', CT: 'CT' };

// ===== Movement Directions =====
// 8-directional movement. Used for rotation and ray-casting.
// Grid coordinates: x increases right, y increases down.
const DIRECTIONS = [
  { name: 'N',  dx:  0, dy: -1, glyph: '^' },  // Up
  { name: 'NE', dx:  1, dy: -1, glyph: '/' },  // Up-right
  { name: 'E',  dx:  1, dy:  0, glyph: '>' },  // Right
  { name: 'SE', dx:  1, dy:  1, glyph: '\\' }, // Down-right
  { name: 'S',  dx:  0, dy:  1, glyph: 'v' },  // Down
  { name: 'SW', dx: -1, dy:  1, glyph: '/' },  // Down-left
  { name: 'W',  dx: -1, dy:  0, glyph: '<' },  // Left
  { name: 'NW', dx: -1, dy: -1, glyph: '\\' }, // Up-left
];

module.exports = {
  TICK_MS,
  WEAPONS,
  EQUIPMENT,
  ECONOMY,
  ROUND,
  TEAM,
  DIRECTIONS,
};
