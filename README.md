# ASCII Tactical

A fun multiplayer tactical shooter in your terminal. Think Counter-Strike but in ASCII art. Pure Node.js, no complicated setup.

---

## What is this?

Two teams fight it out:
- **Terrorists** try to plant a bomb at site A or B
- **Counter-Terrorists** try to stop them and defuse the bomb

You earn money by eliminating enemies and winning rounds. Buy better weapons, armor, and medical kits. Simple as that.

---

## Quick Start (2 minutes)

### Need:
- Node.js installed ([get it here](https://nodejs.org))
- A terminal
- Friends on the same WiFi (or just test solo on one PC)

### Step 1: Get the code
```bash
git clone https://github.com/yourusername/ascii-tactical.git
cd ascii-tactical
```

### Step 2: Start the server
```bash
npm run server
```

### Step 3: Connect as a player
Open **another terminal window** and run:
```bash
npm run client
```

Do this for each player. That's it!

---

## Playing with Friends (Different PCs)

### Find your server's IP

**Windows:**
Open PowerShell and type:
```
ipconfig
```
Look for `IPv4 Address` (something like `192.168.0.50`)

**Mac/Linux:**
Open Terminal and type:
```
ifconfig
```
Look for `inet` (something like `192.168.0.50`)

### One person starts the server
```bash
npm run server
```

### Everyone else connects to that IP
```bash
node index.js 192.168.0.50 "YourName" auto
```

Replace `192.168.0.50` with the actual IP from above. That's it!

---

## How to Play

### Controls
```
W/A/S/D  → Move
Q/E      → Turn left/right
SPACE    → Shoot
R        → Reload
1/2/3    → Switch weapon
B        → Buy stuff (only during buy phase)
F        → Plant/defuse bomb
TAB      → See everyone's score
Ctrl+C   → Quit
```

### Terrorists (Red team)
1. One of you has the bomb
2. Carry it to site A or B (marked on the map)
3. Press F to plant it (takes 3 seconds)
4. Defend it for 30 seconds until it explodes
5. **WIN** = Bomb explodes or all Counter-Terrorists are dead

### Counter-Terrorists (Cyan team)
1. Guard sites A and B
2. Stop Terrorists from planting the bomb
3. If they plant it, go to the bomb and press F to defuse it (takes 5 seconds)
4. **WIN** = Defuse the bomb or kill all Terrorists

---

## Economy System

**Earn money by:**
- Killing an enemy: +$300
- Planting the bomb: +$400
- Defusing the bomb: +$400
- Your team wins a round: +$3200
- Your team loses a round: +$1400

**You start with:** $800 per round

**Use it to buy:**

| Item | Price | What it does |
|------|-------|------|
| Pistol | $500 | Basic gun |
| Rifle | $2,500 | Good gun, medium range |
| Sniper | $4,700 | Powerful, long range |
| Armor | $1,000 | Takes 50% of damage |
| Medkit | $400 | Heals you 50 HP |

---

## The Map

```
A = Bomb site (top left)
B = Bomb site (top right)
# = Walls (can't walk through)
~ = Water (can't walk through)
| or = = Obstacles (you can hide behind)
T = You or a teammate
C = Enemy Counter-Terrorist
* = The planted bomb
```

---

## Strategy Tips

**For Terrorists:**
- Stick together, don't go alone
- Protect the bomb carrier
- Plant the bomb and camp it

**For Counter-Terrorists:**
- Cover both sites (split your team)
- Listen for footsteps (watch the event log)
- If they plant, rush to defuse

---

## Common Problems

### "Can't connect to server"
- Make sure the server is running (`npm run server`)
- Check you have the right IP address
- Make sure you're on the same WiFi

### "Terminal looks broken"
- Make a your terminal window bigger
- Use a modern terminal (Windows Terminal, iTerm2, etc.)

### "Someone's name is cut off / stuff looks weird"
- Expand your terminal window a bit more

---

## Game Flow

1. **Waiting Room (Lobby)**
   - Wait until 2+ players join
   - Countdown starts at 50 seconds

2. **Buy Phase (20 seconds)**
   - Everyone buys weapons and gear
   - Press B to open the shop

3. **Combat Phase (up to 150 seconds)**
   - Terrorists try to plant
   - Counter-Terrorists try to stop them
   - Shoot, move, reload

4. **Result Phase (5 seconds)**
   - See who won the round
   - Get your money reward
   - Next round starts

5. **Match Over**
   - First to 9 wins (best of 16 rounds)
   - Game ends, you can quit

---

## Want to Change Things?

Edit `src/config.js` to:
- Change weapon damage/range
- Adjust starting money
- Tweak bomb timer (currently 30 seconds)
- Change bomb plant time (currently 3 seconds)

---

## What's Inside

```
ascii-tactical/
├── index.js          ← Client (you run this to play)
├── server.js         ← Server (runs the game)
├── src/
│   ├── game.js       (core game logic)
│   ├── combat.js     (shooting, damage, etc.)
│   ├── map.js        (the map)
│   ├── player.js     (player stuff)
│   ├── render.js     (drawing to terminal)
│   └── config.js     (settings to tweak)
└── package.json      (project info)
```

Have fun!
