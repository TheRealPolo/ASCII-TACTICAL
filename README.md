# ASCII-TACTICAL

A **LOCAL** multiplayer real-time tactical shooter that runs entirely in your terminal. Two teams, one bomb, no mercy.

```
┌──────────────────────────────┬─────────────────────────────────────────────┐
│  #############################   │  Round  3 / 16        [BUY PHASE 18s]   │
│  #........A.......#..........#│  ────────────────────────────────────────  │
│  #....[T].........|..[CT]....#│  TERRORISTS           COUNTER-TERRORISTS   │
│  #.................=.........#│  Alice    ♥100  $2500  Bob      ♥100 $2500 │
│  #..............B............#│  Charlie  ♥100  $800   Dave     ♥100 $800  │
│  ##############################  │  ───────────────────────────────────────│
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Inspired by Counter-Strike. Built on pure Node.js with zero dependencies.

---

## Features

- **Team-based combat** — Terrorists vs Counter-Terrorists, 2–10 players per match
- **Bomb mechanics** — plant at site A or B, defuse before detonation
- **Three-phase rounds** — Buy → Combat → Resolve, first to 9 wins (best of 16)
- **Economy system** — earn money from kills and objectives, spend it on weapons and gear
- **Line-of-sight** — Bresenham raycasting; walls and cover block shots
- **8-directional movement and aiming** — tactical positioning matters
- **ASCII map** — 30×20 tactical layout with two bomb sites, cover, and water hazards
- **Live HUD** — real-time stats panel with money, health, armor, kill log, and scoreboard

---

## Requirements

- **Node.js** v14 or later
- A terminal with ANSI color support (any modern terminal)

---

## Installation

```bash
git clone https://github.com/TheRealPolo/ASCII-TACTICAL.git
cd ASCII-TACTICAL
```

No `npm install` needed — zero external dependencies.

---

## Running the Game

**1. Start the server** (one terminal window):

```bash
node server.js
# or: node server.js <port>   (default: 7777)
```

**2. Connect each player** (separate terminal per player):

```bash
node index.js [host] [name] [team]
```

| Argument | Default     | Options            |
|----------|-------------|--------------------|
| `host`   | `localhost` | any IP or hostname |
| `name`   | random      | any string         |
| `team`   | `auto`      | `T`, `CT`, `auto`  |

**Examples:**

```bash
node index.js localhost Alice T
node index.js localhost Bob CT
node index.js 197.000.00.0 Charlie auto
```

The match lobby starts a countdown once 2+ players are connected and launches automatically.

---

## Controls

| Key       | Action                                      |
|-----------|---------------------------------------------|
| `W A S D` | Move (cardinal directions)                  |
| `Q / E`   | Rotate facing (8 directions)                |
| `Space`   | Shoot                                       |
| `R`       | Reload                                      |
| `F`       | Plant bomb (T at site A/B) / Defuse (CT)    |
| `B`       | Toggle buy menu (buy phase only)            |
| `1–5`     | Buy item or switch weapon in buy menu       |
| `Tab`     | Toggle scoreboard                           |
| `Ctrl+C`  | Quit                                        |

---

## Round Flow

```
Buy Phase (20s) → Combat Phase (150s) → Resolve Phase (5s) → next round
```

- **Buy Phase:** Purchase weapons and equipment before the round starts.
- **Combat Phase:** Terrorists must plant the bomb at site A or B. Counter-Terrorists must stop them.
  - Planting takes **3 seconds** (stand on the site and hold `F`).
  - Once planted, the bomb detonates after **30 seconds**.
  - Defusing takes **5 seconds** (CT must complete before detonation).
- **Win conditions:**
  - **T wins** — bomb detonates, or all CTs eliminated.
  - **CT wins** — bomb defused, all Ts eliminated, or time expires with no plant.

---

## Economy

| Event              | Payout  |
|--------------------|---------|
| Kill               | +$300   |
| Bomb planted       | +$400   |
| Bomb defused       | +$400   |
| Round win          | +$3,200 |
| Round loss         | +$1,400 |

Money is capped at **$16,000**.

### Shop (buy phase)

| Slot | Item           | Cost    |
|------|----------------|---------|
| 1    | Pistol         | $500    |
| 2    | Rifle          | $2,500  |
| 3    | Sniper         | $4,700  |
| 4    | Medkit         | $400    |
| 5    | Armor Vest     | $1,000  |

- **Medkit** restores 50 HP.
- **Armor Vest** absorbs 50% of incoming damage (up to 50 points).

---

## Map Legend

| Symbol | Meaning          |
|--------|------------------|
| `#`    | Wall             |
| `.`    | Floor            |
| `A`    | Bomb site A      |
| `B`    | Bomb site B      |
| `~`    | Water (hazard)   |
| `|`    | Vertical cover   |
| `=`    | Horizontal cover |
| `T`    | Terrorist player |
| `C`    | CT player        |
| `*`    | Bomb             |

Cover blocks both movement and line-of-sight.

---

## Project Structure

```
ASCII-TACTICAL/
├── server.js          # Game server — authoritative state, port 7777
├── index.js           # Client — terminal UI and input
└── src/
    ├── game.js        # Round logic, win conditions, player input
    ├── combat.js      # Shooting, damage, line-of-sight (Bresenham)
    ├── render.js      # ANSI terminal renderer, HUD layout
    ├── map.js         # Map data and spatial queries
    ├── player.js      # Player factory and state
    ├── config.js      # Balance parameters (weapons, economy, timing)
    └── input.js       # Raw keyboard input handler
```

---

## Network Protocol

The server broadcasts full game state to all clients every **100 ms** over TCP using newline-delimited JSON. The client never simulates authoritative game logic — all decisions are made server-side.



---

## Development

### Dev Setup

No build step required. Just edit code and restart the server.

```bash
# Terminal 1: Server with auto-restart (requires nodemon)
npm install -g nodemon
nodemon server.js

# Terminal 2+: Client(s)
node index.js localhost Alice T
```

---

### Code Overview

**Server (`server.js`)**
- Hosts TCP server on port 7777
- Runs game tick loop (100 ms intervals)
- Maintains authoritative game state
- Broadcasts state to all connected clients
- Handles player input and disconnections

**Client (`index.js`)**
- Connects to server via TCP
- Receives game state updates
- Renders terminal UI (map + HUD)
- Captures raw keyboard input
- Sends player commands (move, rotate, shoot, buy)

**Game Engine (`src/game.js`)**
- Round state machine: `LOBBY` → `BUY` → `COMBAT` → `RESOLVE` → loop
- Player input processing (movement, shooting, planting, defusing)
- Win condition checking
- Economy calculation
- Bomb state tracking

**Combat System (`src/combat.js`)**
- Weapon properties (damage, fire rate, reload time, spread)
- Shooting raycast using Bresenham's line algorithm
- Damage calculation with armor absorption
- Line-of-sight checks for visibility

**Rendering (`src/render.js`)**
- ANSI terminal UI layout (map + stats panel)
- Color codes for teams, UI elements, death info
- HUD panels: money, health, armor, inventory, kill log, scoreboard
- Dynamic viewport resizing

**Map System (`src/map.js`)**
- Static 30×20 ASCII map data
- Tile type lookup, walkability checks
- Spawn point definitions
- Pathfinding queries

---

### Game State Structure

The server broadcasts a game state object every tick:

```javascript
{
  phase: "BUY" | "COMBAT" | "RESOLVE" | "LOBBY",
  round: 1,
  maxRounds: 16,
  timeRemaining: 18000, // ms
  
  players: {
    <playerId>: {
      id: string,
      name: string,
      team: "T" | "CT",
      x: number, y: number,
      direction: 0-7, // 8 cardinal directions
      health: number,
      maxHealth: 100,
      armor: number,
      money: number,
      weapon: null | { type: "pistol"|"rifle"|"sniper", ammo: number },
      alive: boolean,
      kills: number,
      deaths: number
    }
  },
  
  bomb: {
    x: number, y: number,
    planted: boolean,
    plantedAt: number, // timestamp
    detonatesAt: number | null
  },
  
  scores: {
    T: number,
    CT: number
  },
  
  events: [ // Last 50 events (kills, plants, defuses)
    { type: "kill", killer: "Alice", victim: "Bob", time: 123456 },
    ...
  ]
}
```

---

### Network Protocol

**TCP Messages (newline-delimited JSON)**

**Client → Server:**
```javascript
{ "action": "move", "direction": "w" }           // WASD
{ "action": "rotate", "direction": "q" }         // Q/E
{ "action": "shoot" }
{ "action": "reload" }
{ "action": "plant" }
{ "action": "defuse" }
{ "action": "toggleBuy" }
{ "action": "buy", "item": 1 }                   // 1-5
{ "action": "switchWeapon", "weaponIndex": 0 }
```

**Server → Client:**
```javascript
{ "type": "state", "data": {...gameState...} }
{ "type": "chat", "player": "Alice", "message": "Nice shot!" }
{ "type": "error", "message": "Invalid action" }
```

---

### Extending the Game

#### Add a New Weapon

Edit `src/config.js`:

```javascript
export const WEAPONS = {
  rifle: {
    name: "Rifle",
    damage: 30,
    fireRate: 100,  // ms between shots
    reloadTime: 2000,
    ammo: 30,
    cost: 2500
  },
  // Add your weapon here:
  flamethrower: {
    name: "Flamethrower",
    damage: 15,
    fireRate: 50,
    reloadTime: 3000,
    ammo: 100,
    cost: 5000
  }
};
```

Then update `src/combat.js` to handle special behavior (e.g., area damage).

#### Create a Custom Map

Edit `src/map.js`, replace the `MAP` array:

```javascript
export const MAP = [
  "#####################",
  "#........A..........#",
  "#............#......#",
  "#...T........#..C...#",
  "#...B...............#",
  "#####################",
  // ...
];
```

Ensure the map is 30 chars wide and 20 chars tall. Use:
- `#` for walls
- `.` for floors
- `A`, `B` for bomb sites
- `~` for water (impassable)
- `|`, `=` for cover (blocks LOS but not movement)

#### Tweak Game Balance

Edit `src/config.js` to adjust:
- Round timings (`BUY_TIME`, `COMBAT_TIME`, etc.)
- Economy payouts
- Health and armor values
- Money cap

---

### Debugging Tips

**Print game state:**

In `server.js`, add logging in the tick loop:

```javascript
console.log("Round:", game.state.round);
console.log("Phase:", game.state.phase);
console.log("Players:", Object.keys(game.state.players).length);
```

**Watch a player's actions:**

In `src/game.js`, add logging to `handleInput()`:

```javascript
console.log(`[${player.name}] Action: ${action}`);
```

**Trace shooting:**

In `src/combat.js`, log the raycast results:

```javascript
console.log(`[SHOOT] From (${x},${y}) direction ${dir}, hit:`, hitResult);
```

**Monitor network traffic:**

In `server.js`, log all messages:

```javascript
socket.on("message", (msg) => {
  console.log(`[${socket.playerId}] ← ${msg}`);
});
```

---

### Common Issues

**"EADDRINUSE" error on startup**
- Another process is using port 7777
- Kill it: `lsof -i :7777 | grep -v PID | awk '{print $2}' | xargs kill` (macOS/Linux)
- Or use a different port: `node server.js 8888`

**Client disconnects immediately**
- Check server is running: `node server.js`
- Verify hostname/IP: try `localhost` first, then your actual IP
- Check firewall: port 7777 must be open

**Input not responding**
- Terminal must be in raw mode (handled by `src/input.js`)
- If stuck, press `Ctrl+C` to exit

**Rendering glitches**
- Terminal may be too small (needs ≥80×24)
- Try resizing or using a different terminal app

---


## License

MIT
