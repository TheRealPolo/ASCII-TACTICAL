/**
 * Combat System
 *
 * Handles:
 *   - Line-of-sight detection (raycasting with Bresenham's algorithm)
 *   - Weapon firing and ballistics
 *   - Damage application and death handling
 *   - Reload mechanics
 */

const { WEAPONS, ECONOMY } = require('./config');

// ===== Line-of-Sight Raycasting =====
/**
 * Generate tiles along a line from (x0, y0) to (x1, y1).
 *
 * Uses Bresenham's line algorithm (efficient, integer-only).
 * Yields tiles EXCLUDING the start point, INCLUDING the end point.
 *
 * @param {number} x0, y0 - Start position
 * @param {number} x1, y1 - End position
 * @yields {object} { x, y } for each tile along the line
 */
function* lineTiles(x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    // Stop at end point
    if (x === x1 && y === y1) {
      return;
    }

    // Advance along the major axis
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }

    yield { x, y };
  }
}

/**
 * Calculate Chebyshev (chess-king) distance between two points.
 * This is the distance used for shooting range calculations.
 * A player at distance 3 can move in any of 8 directions and reach you in 3 moves.
 *
 * @param {object} a, b - Points { x, y }
 * @returns {number} Chebyshev distance
 */
function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Check if two points have line-of-sight (LoS).
 * True if no LoS-blocking tiles exist between them.
 *
 * Used to determine if a player can see/shoot another player.
 *
 * @param {object} map - Map with blocksLOS method
 * @param {number} x0, y0 - Observer position
 * @param {number} x1, y1 - Target position
 * @returns {boolean} True if line-of-sight exists
 */
function hasLineOfSight(map, x0, y0, x1, y1) {
  for (const { x, y } of lineTiles(x0, y0, x1, y1)) {
    // Reached target without obstruction
    if (x === x1 && y === y1) {
      return true;
    }

    // Hit an obstruction
    if (map.blocksLOS(x, y)) {
      return false;
    }
  }

  return true;
}

/**
 * Find the nearest visible enemy within range.
 *
 * Useful for AI logic (not used by human players).
 * Returns the closest alive opponent who is within range and has LoS.
 *
 * @param {object} shooter - Player doing the searching
 * @param {array} players - All players in the game
 * @param {object} map - Map for LoS checks
 * @param {number} range - Maximum distance to consider (weapon range)
 * @returns {object|null} Nearest visible enemy, or null if none visible
 */
function findNearestVisibleEnemy(shooter, players, map, range) {
  let best = null;
  let bestDist = Infinity;

  for (const p of players) {
    // Skip dead players and teammates
    if (!p.alive) continue;
    if (p.team === shooter.team) continue;

    const d = chebyshevDistance(shooter.pos, p.pos);

    // Skip if too far away
    if (d > range) continue;

    // Skip if no line of sight (blocked by walls)
    if (!hasLineOfSight(map, shooter.pos.x, shooter.pos.y, p.pos.x, p.pos.y)) {
      continue;
    }

    // Update best if this enemy is closer
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }

  return best;
}

/**
 * Raycast a projectile from a shooter in a direction.
 *
 * Traces a ray step-by-step until it hits something:
 *   - An enemy → return info about hit
 *   - A wall/cover → return info about wall
 *   - Map edge → return last valid position
 *   - Max range → return final position
 *
 * @param {object} shooter - Shooting player
 * @param {number} dx, dy - Direction vector (from DIRECTIONS)
 * @param {array} players - All players in the game
 * @param {object} map - Map for obstacle checks
 * @param {number} range - Maximum distance bullet travels
 * @returns {object} { hit: 'wall'|'enemy'|'edge'|'range', target?, x, y }
 */
function rayCastShoot(shooter, dx, dy, players, map, range) {
  let x = shooter.pos.x;
  let y = shooter.pos.y;

  for (let step = 1; step <= range; step++) {
    // Advance along ray
    x += dx;
    y += dy;

    // Hit map edge
    if (!map.inBounds(x, y)) {
      return { hit: 'edge', x: x - dx, y: y - dy };
    }

    // Hit wall or cover
    if (map.blocksLOS(x, y)) {
      return { hit: 'wall', x, y };
    }

    // Check if ray hits a player
    for (const p of players) {
      if (!p.alive) continue;
      if (p.id === shooter.id) continue; // Don't hit self
      if (p.pos.x === x && p.pos.y === y) {
        return { hit: 'enemy', target: p, x, y };
      }
    }
  }

  // Ray traveled full distance without hitting anything
  return { hit: 'range', x, y };
}

/**
 * Attempt to fire the shooter's current weapon.
 *
 * Checks:
 *   - Alive and not reloading
 *   - Has ammo loaded (auto-reloads from reserve if not)
 *   - Cooldown expired
 *
 * If all checks pass:
 *   - Decrements ammo
 *   - Raycasts in the direction the player is facing
 *   - Applies damage if hits a player
 *   - Pushes a 'shot' event
 *
 * @param {object} shooter - Shooting player
 * @param {array} players - All players in the game
 * @param {object} map - Map for raycasting
 * @param {object} dirVec - Direction with { dx, dy }
 * @param {number} now - Current server timestamp
 * @param {array} events - Event list to log shot event
 * @returns {object|null} Shot event object, or null if blocked
 */
function tryShoot(shooter, players, map, dirVec, now, events) {
  // Check if player is alive
  if (!shooter.alive) {
    return null;
  }

  // Check if reloading
  if (now < shooter.reloadingUntil) {
    return null;
  }

  const w = WEAPONS[shooter.weapon];

  // Check if fire rate cooldown has elapsed
  if (now - shooter.lastShotAt < w.cooldownMs) {
    return null;
  }

  // Check if ammo is loaded
  if (shooter.ammo.current <= 0) {
    // Attempt to reload and retry
    tryReload(shooter, now, events);
    return null;
  }

  // All checks passed — fire!
  shooter.lastShotAt = now;
  shooter.ammo.current -= 1;

  // Raycast the projectile
  const result = rayCastShoot(shooter, dirVec.dx, dirVec.dy, players, map, w.range);

  // Create shot event
  const event = {
    type: 'shot',
    shooterId: shooter.id,
    weapon: shooter.weapon,
    from: { x: shooter.pos.x, y: shooter.pos.y },
    to: { x: result.x, y: result.y },
    hit: result.hit,
    targetId: result.target ? result.target.id : null,
    at: now,
  };

  // Apply damage if hit an enemy
  if (result.hit === 'enemy') {
    applyDamage(shooter, result.target, w.damage, events, now);
    event.damage = w.damage;
  }

  events.push(event);
  return event;
}

/**
 * Apply damage from a shot to a victim.
 *
 * Damage flow:
 *   1. Armor absorbs 50% of damage (up to its current value)
 *   2. Remaining damage reduces health
 *   3. If health <= 0: victim dies, shooter earns kill reward
 *
 * @param {object} shooter - Player dealing damage
 * @param {object} victim - Player taking damage
 * @param {number} damage - Base damage amount
 * @param {array} events - Event list (kill event pushed here)
 * @param {number} now - Current timestamp
 */
function applyDamage(shooter, victim, damage, events, now) {
  // Armor reduces damage (50% effectiveness)
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, Math.floor(damage / 2));
    victim.armor -= absorbed;
    damage -= absorbed;
  }

  // Apply remaining damage to health
  victim.health -= damage;

  // Check if victim is killed
  if (victim.health <= 0) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;

    // Reward shooter
    shooter.kills += 1;
    shooter.money = Math.min(ECONOMY.maxMoney, shooter.money + ECONOMY.killReward);

    // Log kill event
    events.push({
      type: 'kill',
      shooterId: shooter.id,
      victimId: victim.id,
      weapon: shooter.weapon,
      at: now,
      reward: ECONOMY.killReward,
    });

    // Note: bomb handling (dropping bomb if victim carried it) is done in game.js
  }
}

/**
 * Bot auto-aim variant: fire at a known target.
 *
 * Unlike tryShoot, this doesn't raycast; it directly targets a player.
 * Used for AI bots. Includes an accuracy roll based on bot skill.
 * Ammo is consumed even if the shot misses.
 *
 * @param {object} shooter - Bot/AI player
 * @param {object} target - Target player to aim at
 * @param {array} players - All players
 * @param {object} map - Map for LoS validation
 * @param {number} now - Timestamp
 * @param {array} events - Event list
 * @returns {object|null} { hit: true } on success, null on failure
 */
function tryShootAt(shooter, target, players, map, now, events) {
  if (!shooter.alive) {
    return null;
  }

  if (now < shooter.reloadingUntil) {
    return null;
  }

  const w = WEAPONS[shooter.weapon];

  if (now - shooter.lastShotAt < w.cooldownMs) {
    return null;
  }

  if (shooter.ammo.current <= 0) {
    tryReload(shooter, now, events);
    return null;
  }

  // Consume ammo regardless of outcome
  shooter.lastShotAt = now;
  shooter.ammo.current -= 1;

  // Re-validate range and LoS at fire time (target may have moved)
  const dist = chebyshevDistance(shooter.pos, target.pos);
  if (dist > w.range) {
    events.push({ type: 'shot', shooterId: shooter.id, miss: 'range', at: now });
    return null;
  }

  if (!hasLineOfSight(map, shooter.pos.x, shooter.pos.y, target.pos.x, target.pos.y)) {
    events.push({ type: 'shot', shooterId: shooter.id, miss: 'los', at: now });
    return null;
  }

  // Accuracy roll based on bot skill level
  const accuracy = ({ easy: 0.35, normal: 0.65, hard: 0.85 })[shooter.botSkill] || 0.6;
  if (Math.random() > accuracy) {
    events.push({ type: 'shot', shooterId: shooter.id, miss: 'aim', at: now });
    return null;
  }

  // Shot hit! Apply damage
  applyDamage(shooter, target, w.damage, events, now);
  events.push({
    type: 'shot',
    shooterId: shooter.id,
    targetId: target.id,
    weapon: shooter.weapon,
    hit: 'enemy',
    damage: w.damage,
    at: now,
  });

  return { hit: true };
}

/**
 * Attempt to start reloading the player's current weapon.
 *
 * Reloading is async: this function sets a timer,
 * and finalizeReloads() completes it.
 *
 * Fails if:
 *   - Already reloading
 *   - Magazine is already full
 *   - No reserve ammo available
 *
 * @param {object} player - Player to reload
 * @param {number} now - Timestamp
 * @param {array} events - Event list
 * @returns {boolean} True if reload started, false if blocked
 */
function tryReload(player, now, events) {
  if (now < player.reloadingUntil) {
    return false; // Already reloading
  }

  const w = WEAPONS[player.weapon];

  if (player.ammo.current >= w.magazine) {
    return false; // Magazine is full
  }

  if (player.ammo.reserve <= 0) {
    return false; // No reserve ammo
  }

  // Start reload timer
  player.reloadingUntil = now + w.reloadMs;
  events.push({ type: 'reload-start', playerId: player.id, at: now });

  return true;
}

/**
 * Finalize all in-progress reloads.
 *
 * Called every tick. When a reload timer expires:
 *   - Transfer ammo from reserve to magazine
 *   - Reset reload timer
 *
 * @param {array} players - All players in the game
 * @param {number} now - Current timestamp
 */
function finalizeReloads(players, now) {
  for (const p of players) {
    if (!p.alive) {
      continue;
    }

    // Check if a reload is in progress and time has expired
    if (p.reloadingUntil > 0 && now >= p.reloadingUntil) {
      const w = WEAPONS[p.weapon];
      const needed = w.magazine - p.ammo.current; // Slots to fill
      const taken = Math.min(needed, p.ammo.reserve); // What we can take

      // Transfer ammo
      p.ammo.current += taken;
      p.ammo.reserve -= taken;
      p.reloadingUntil = 0; // Reload complete
    }
  }
}

module.exports = {
  lineTiles,
  hasLineOfSight,
  chebyshevDistance,
  findNearestVisibleEnemy,
  rayCastShoot,
  tryShoot,
  tryShootAt,
  tryReload,
  finalizeReloads,
};
