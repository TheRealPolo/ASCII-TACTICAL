/**
 * Map Data and Spatial Queries
 *
 * The map is 30x20 tiles. Tile types:
 *   #  = Wall (blocks movement and line-of-sight)
 *   .  = Floor (walkable)
 *   A  = Bomb site A (walkable, objective location)
 *   B  = Bomb site B (walkable, objective location)
 *   ~  = Water/danger (blocks movement, does NOT block line-of-sight)
 *   |  = Vertical cover (blocks movement and LoS)
 *   =  = Horizontal cover (blocks movement and LoS)
 *
 * Future expansions could add destructible cover or special tile effects.
 */

const RAW_MAP = [
  '##############################',
  '#............................#',
  '#............................#',
  '#............................#',
  '#......#####.......#####.....#',
  '#......#...#.......#...#.....#',
  '#...A..#...#.......#...#..B..#', // Bomb sites A and B
  '#......#...#.......#...#.....#',
  '#......#####.......#####.....#',
  '#............................#',
  '#............~~~~............#', // Water hazard (no movement)
  '#............~~~~............#',
  '#............................#',
  '#......===.........===.......#', // Horizontal cover
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
];

const WIDTH = 30;
const HEIGHT = 20;

/**
 * Check if a tile is walkable (players can move through it).
 * Walkable: floor, bomb sites (not walls, cover, or water).
 */
function isWalkableTile(c) {
  return c === '.' || c === 'A' || c === 'B';
}

/**
 * Check if a tile blocks line-of-sight (bullets cannot pass through).
 * Blocks LoS: walls and cover (not water or floor).
 */
function blocksLOSTile(c) {
  return c === '#' || c === '|' || c === '=';
}

/**
 * Create and initialize the map.
 * Returns an object with spatial query methods.
 *
 * @returns {object} Map object with methods: inBounds, tileAt, isWalkable, blocksLOS
 */
function createMap() {
  // Convert string rows into 2D character grid
  const tiles = RAW_MAP.map((row) => row.split(''));

  // Validate dimensions
  if (tiles.length !== HEIGHT) {
    throw new Error('map height mismatch');
  }
  for (const row of tiles) {
    if (row.length !== WIDTH) {
      throw new Error('map width mismatch');
    }
  }

  // Extract objective locations (bomb sites A and B)
  const objectives = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (tiles[y][x] === 'A') {
        objectives.push({ name: 'A', x, y });
      }
      if (tiles[y][x] === 'B') {
        objectives.push({ name: 'B', x, y });
      }
    }
  }

  // Spawn zones: a few tiles per team. Distributed along the map edges.
  const spawnsCT = [
    { x: 5,  y: 2 }, { x: 7,  y: 2 }, { x: 9,  y: 2 }, { x: 11, y: 2 },
  ];
  const spawnsT = [
    { x: 18, y: 17 }, { x: 20, y: 17 }, { x: 22, y: 17 }, { x: 24, y: 17 },
  ];

  return {
    width: WIDTH,
    height: HEIGHT,
    tiles,
    objectives,
    spawnsT,
    spawnsCT,

    /**
     * Check if coordinates are within map bounds.
     */
    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
    },

    /**
     * Get the tile character at (x, y).
     * Returns '#' (wall) if out of bounds.
     */
    tileAt(x, y) {
      if (!this.inBounds(x, y)) {
        return '#'; // Out of bounds treated as impassable
      }
      return tiles[y][x];
    },

    /**
     * Check if a tile is walkable (players can move there).
     */
    isWalkable(x, y) {
      return this.inBounds(x, y) && isWalkableTile(tiles[y][x]);
    },

    /**
     * Check if a tile blocks line-of-sight (for bullets and vision).
     */
    blocksLOS(x, y) {
      return !this.inBounds(x, y) || blocksLOSTile(tiles[y][x]);
    },
  };
}

module.exports = { createMap, WIDTH, HEIGHT };
