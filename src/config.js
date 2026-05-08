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
    damage: 150,       // One-shot kill even through full armor (50 armor absorbs 75, 75 > 100 HP)
    magazine: 5,
    reserve: 30,
    cooldownMs: 1300,  // Very slow fire rate (~0.75 shots/sec)
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

// ===== Grenades / Utility =====
// Three utility types: explosive frag, vision-blocking smoke, blinding flash.
// Grenades land instantly at the calculated target tile; fuse counts down there.
const GRENADES = {
  frag: {
    name: 'Frag Grenade',
    price: 300,
    travelSteps: 6,   // Max tiles the grenade travels before landing
    fuseMs: 2000,     // Milliseconds from throw to detonation
    radius: 3,        // Chebyshev blast radius
    maxDamage: 80,    // Damage at ground zero
    minDamage: 20,    // Damage at edge of radius
  },
  smoke: {
    name: 'Smoke Grenade',
    price: 300,
    travelSteps: 6,
    fuseMs: 2000,
    radius: 2,        // Smoke cloud Chebyshev radius
    durationMs: 8000, // How long the cloud persists
  },
  flash: {
    name: 'Flash Grenade',
    price: 200,
    travelSteps: 5,
    fuseMs: 1500,
    radius: 4,        // Flash effect Chebyshev radius (walls block it)
    blindMs: 2000,    // Max blind duration (full at center, less at edge)
  },
};

const GRENADE_SLOTS = ['frag', 'smoke', 'flash'];

module.exports = {
  TICK_MS,
  WEAPONS,
  WEAPON_SLOTS,
  GRENADES,
  GRENADE_SLOTS,
  EQUIPMENT,
  ECONOMY,
  ROUND,
  TEAM,
  DIRECTIONS,
};
