# ASCII Tactical

A not fun local multiplayer tactical shooter in your terminal. Think Counter-Strike but in ASCII art. Pure Node.js, no complicated setup.

---

## SNAPSHOT CHANGELOG

### Latest
- **New TUI layout** — map and HUD side by side in an 80-column frame with box borders
- **Visual bars** — health and armor displayed as `█░` block bars (green → yellow → red)
- **Integrated scoreboard** — K/D and HP for all players visible at all times
- **Server logs** — colored output with timestamps and event labels (JOIN, LEAVE, GAME, MATCH)
- **Fixed text overflow** — long event messages and player names are now clamped to fit the frame
