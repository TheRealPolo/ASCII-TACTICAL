# ASCII-TACTICAL

A **multiplayer real-time tactical shooter** that runs entirely in your terminal. Two teams, one bomb, no mercy. Play **locally on LAN** or **globally via internet** with automatic room discovery.

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

### Option A: Local Play (LAN)

**1. Start the server** (one terminal):

```bash
node server.js
# or: node server.js <port>   (default: 7777)
```

**2. Connect each player** (separate terminal per player):

```bash
node index.js localhost Alice T
node index.js localhost Bob CT
```

### Option B: Global Play (Internet Multiplayer)

**1. Start the matchmaking hub** (on a public server, once):

```bash
node matchmaking.js
# or: node matchmaking.js <port>   (default: 7776)
```

**2. Host a game room** (any player with a public IP):

```bash
node server.js 7777 --mm mm.yourdomain.com --name "My Room"
```

**3. Join via room browser** (on any machine with internet):

```bash
node index.js --mm mm.yourdomain.com Alice T
```

This shows all live rooms. Navigate with `W/S` or `↑/↓`, press `ENTER` to join, `R` to refresh, `^C` to quit.

### Direct Connection (Explicit IP)

If you know the game server's IP:

```bash
node index.js 192.168.1.100 Alice T
```

### Arguments

| Argument | Default     | Options            |
|----------|-------------|--------------------|
| `host`   | `localhost` | any IP or hostname |
| `--mm`   | disabled    | matchmaking server |
| `name`   | `Player`    | any string         |
| `team`   | `auto`      | `T`, `CT`, `auto`  |

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

| Slot | Item           | Cost    | Damage | Magazine | Range |
|------|----------------|---------|--------|----------|-------|
| 1    | Glock-18       | Free    | 18     | 20       | 8     |
| 2    | MP5-SD         | $1,500  | 22     | 30       | 10    |
| 3    | AK-47          | $2,700  | 34     | 30       | 16    |
| 4    | AWP            | $4,750  | 150    | 5        | 30    |
| 5    | Armor Vest     | $1,000  | —      | —        | —     |

- **Glock-18** is your free default sidearm — always available, no purchase needed.
- **AWP** deals 150 damage, enough for a one-shot kill even through full armor.
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
├── matchmaking.js     # Room discovery hub — port 7776 (optional, for global play)
├── index.js           # Client — terminal UI and input
└── src/
    ├── game.js        # Round logic, win conditions, player input
    ├── combat.js      # Shooting, damage, line-of-sight (Bresenham)
    ├── render.js      # ANSI terminal renderer, HUD layout, room browser
    ├── map.js         # Map data and spatial queries
    ├── player.js      # Player factory and state
    ├── config.js      # Balance parameters (weapons, economy, timing)
    └── input.js       # Raw keyboard input handler
```

---

## Network Protocol

The server broadcasts full game state to all clients every **100 ms** over TCP using newline-delimited JSON. The client never simulates authoritative game logic — all decisions are made server-side.

---

## Global Multiplayer (Matchmaking)

For **internet-wide multiplayer**, use the optional matchmaking server:

### How It Works

1. **Matchmaking Hub** (`matchmaking.js`) runs on a public IP (e.g., VPS, cloud server)
   - Port: 7776 (configurable)
   - Maintains a **live list of active game rooms**
   - Game servers register with their details (name, player count, status)
   - Servers send **heartbeat every 10 seconds** — rooms go stale after 35s of silence

2. **Game Servers** register with the matchmaking hub:
   ```bash
   node server.js 7777 --mm matchmaking.yourdomain.com --name "Tournament Room 1"
   ```
   - Works even behind NAT (matchmaking sees the connecting IP)
   - Automatically re-registers on reconnect

3. **Players** browse available rooms:
   ```bash
   node index.js --mm matchmaking.yourdomain.com Alice T
   ```
   - Live room list shows: name, player count, current phase (lobby/combat)
   - Navigate with `W/S` or arrow keys, `ENTER` to join
   - On selection, client disconnects from matchmaking and connects directly to the game server

### Why This Design?

- **Decoupled**: Game servers don't depend on the matchmaking server to run — if MM goes down, active games continue
- **Scalable**: Multiple game servers can register with one matchmaking hub
- **Simple**: No complex relay or proxy logic — players connect directly to the game server
- **Resilient**: Servers auto-reconnect to matchmaking if the hub restarts

---

## Development

### Dev Setup

No build step required. Just edit code and restart the server.

**Local play:**
```bash
# Terminal 1: Server
nodemon server.js

# Terminal 2+: Client(s)
node index.js localhost Alice T
```

**Global multiplayer testing (on localhost):**
```bash
# Terminal 1: Matchmaking hub
node matchmaking.js

# Terminal 2: Game server (registers with MM)
node server.js 7777 --mm localhost --name "Dev Room"

# Terminal 3+: Clients (browse rooms)
node index.js --mm localhost Alice T
node index.js --mm localhost Bob CT
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
{ "type": "join",  "name": "Alice", "team": "T" }   // Initial handshake
{ "type": "key",   "str": "w",  "key": { "name": "w",      "ctrl": false } }  // Move
{ "type": "key",   "str": " ",  "key": { "name": "space",  "ctrl": false } }  // Shoot
{ "type": "key",   "str": "f",  "key": { "name": "f",      "ctrl": false } }  // Plant/Defuse
{ "type": "key",   "str": "b",  "key": { "name": "b",      "ctrl": false } }  // Buy menu
{ "type": "ping",  "t": 1234567890 }                // Latency probe
```

**Server → Client:**
```javascript
{ "type": "yourId",  "id": 1, "team": "T" }
{ "type": "lobby",   "players": [...], "countdown": 9, "minPlayers": 2, "maxPlayers": 10 }
{ "type": "state",   "state": { players, score, round, eventLog, matchOver, ... } }
{ "type": "pong",    "t": 1234567890 }
{ "type": "error",   "message": "..." }
```

---

### Extending the Game

#### Add a New Weapon

Edit `src/config.js`, add an entry to the `WEAPONS` object:

```javascript
const WEAPONS = {
  // ... existing weapons ...
  flamethrower: {
    name: 'Flamethrower',
    slot: 'heavy',
    range: 5,
    damage: 15,
    magazine: 100,
    reserve: 200,
    cooldownMs: 50,
    reloadMs: 3000,
    price: 5000,
  },
};
```

Then add `'flamethrower'` to `WEAPON_SLOTS` and update `src/combat.js` for any special behavior (e.g., area damage).

#### Create a Custom Map

Edit `src/map.js`, replace the `RAW_MAP` array:

```javascript
const RAW_MAP = [
  "##############################",
  "#........A..........#.......B#",
  "#............#...............#",
  "#............................#",
  "#............................#",
  // ... 20 rows total
];
```

Ensure the map is exactly **30 chars wide** and **20 rows tall**. Use:
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

---

## Changelog

### v1.0 — Global Multiplayer
- Added **matchmaking server** (`matchmaking.js`) for internet-wide room discovery
- Game servers can register with `--mm` flag and advertise themselves globally
- **Room browser UI** in the client: live list of active games, navigate with `W/S` / `↑/↓`, `ENTER` to join
- Servers auto-heartbeat every 10s; stale rooms expire after 35s
- Clients connect directly to game servers (no relay — matchmaking only handles discovery)
- Added `--name` and `--host` flags to `server.js` for room naming and NAT traversal
- **Ping / latency tracking** displayed in the HUD (rolling average of last 20 RTT samples)
- `npm run server` / `npm run client` scripts added to `package.json`

### BETAv0.3 — Shop overhaul & CS weapons
- Replaced generic weapons with CS-style loadout: **Glock-18** (free), **MP5-SD**, **AK-47**, **AWP**
- Added 4th weapon slot (`smg`); weapon switch keys are now `1`–`4`
- Buy menu redesigned: shows owned status (✓), grays out already-purchased items, integrates close hint
- Removed medkit from the shop
- Starting money increased $800 → $1,000
- Armor purchase now blocked if already at full armor

### BETAv0.2 — Map change
- New map layout with redesigned bomb sites A and B

### BETAv0.1 — Initial release
- Local multiplayer over TCP (Node.js, zero dependencies)
- T vs CT with buy phase, combat phase, bomb plant/defuse
- ASCII terminal renderer with ANSI colors and aim-line overlay
- 8-directional movement and facing
