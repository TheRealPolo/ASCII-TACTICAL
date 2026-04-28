/**
 * Game Configuration
 *
 * Central location for game balance parameters.
 * Tweak these values to adjust gameplay difficulty and pacing.
 */

// Game tick rate (milliseconds between each server update)
const TICK_MS = 100;

// ===== Weapons =====
// CS-style loadout: pistol (free default), smg, rifle, awp
// Slots:  pistol · smg · rifle · awp
const WEAPONS = {
  pistol: {
    name: 'Glock-18',
    slot: 'pistol',
    range: 8,
    damage: 18,
    magazine: 20,
    reserve: 120,
    cooldownMs: 350,
    reloadMs: 1400,
    price: 0,          // Default sidearm — always free
  },
  smg: {
    name: 'MP5-SD',
    slot: 'smg',
    range: 10,
    damage: 22,
    magazine: 30,
    reserve: 120,
    cooldownMs: 280,   // Fast fire rate
    reloadMs: 1900,
    price: 1500,
  },
  rifle: {
    name: 'AK-47',
    slot: 'rifle',
    range: 16,
    damage: 34,
    magazine: 30,
    reserve: 90,
    cooldownMs: 500,
    reloadMs: 2400,
    price: 2700,
  },
  awp: {
    name: 'AWP',
    slot: 'awp',
    range: 30,
    damage: 110,       // One-shot kill (100 HP + armor considered)
    magazine: 5,
    reserve: 30,
    cooldownMs: 200,  // Very slow fire rate
    reloadMs: 3200,
    price: 4750,
  },
};

// ===== Equipment =====
// Armor absorbs 50% of incoming damage (up to its value).
const EQUIPMENT = {
  armor: {
    name: 'Armor Vest',
    price: 1000,
    value: 50,        // Absorbs up to 50 damage (at 50% reduction)
  },
};

// ===== Economy (Money System) =====
// Players earn money from kills, objectives, and round wins.
// Money is capped at maxMoney to prevent buying everything.
const ECONOMY = {
  startMoney: 1000,       // Starting money each round
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

// Ordered list of weapon slot keys — used for display and switch shortcuts
const WEAPON_SLOTS = ['pistol', 'smg', 'rifle', 'awp'];

module.exports = {
  TICK_MS,
  WEAPONS,
  WEAPON_SLOTS,
  EQUIPMENT,
  ECONOMY,
  ROUND,
  TEAM,
  DIRECTIONS,
};
