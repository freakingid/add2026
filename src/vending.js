/* =========================================================================
   vending.js — vending machines (GDD 2.5).

   Static, contact-triggered HP restoration objects placed flush against walls.
   Two variants (small +5 / large +10). No button press — Dan walking into one
   restores HP (capped at maxHp), then the machine enters a permanent depleted
   state (single-use, no respawn within a level). Robots ignore them entirely:
   nothing in the enemy AI references G.vending, so they don't participate in
   pathfinding or collision.

   placeVendingMachines is called from buildLevel; updateVending from update().
   ========================================================================= */
import { CFG } from "./config.js";
import { G } from "./state.js";
import { randomFloorTileNearWall, tileCenter } from "./world.js";
import { addFloat } from "./effects.js";
import { COL } from "./palette.js";
import { sfx } from "./audio.js";

// Place the level's vending machines flush against walls. Test levels use a
// fixed CFG.VENDING.testPlacement list (manual 1–2 machines); full weighted
// procedural placement arrives with §8.1.
export function placeVendingMachines(){
  G.vending = [];
  const V = CFG.VENDING;
  for (const variant of V.testPlacement){
    const spot = randomFloorTileNearWall(V.minDistFromCenter);
    if (!spot) continue;                         // no wall-adjacent tile found
    const def = V[variant];
    const c = tileCenter(spot.tx, spot.ty);
    // Push the cabinet toward the wall so its back sits flush against it.
    const inset = CFG.TILE/2 - def.depth/2;
    G.vending.push({
      x: c.x + spot.dx * inset,
      y: c.y + spot.dy * inset,
      r: V.r,
      variant,
      heal: def.heal,
      dx: spot.dx, dy: spot.dy,                  // direction toward the wall (its back)
      depleted: false,
      glow: Math.random() * Math.PI * 2,         // ambient-glow phase
      flash: 0,                                  // brief dispense flash on use
    });
  }
}

export function updateVending(dt){
  for (const m of G.vending){
    m.glow += dt * 3;
    if (m.flash > 0) m.flash -= dt;
    if (m.depleted) continue;

    // Contact trigger — only fires when Dan can actually gain HP, so walking
    // past at full health doesn't waste a machine (GDD says "on contact … then
    // depleted"; this guard is the sensible reading — see STATUS).
    if (G.dan.hp >= G.dan.maxHp) continue;
    if (Math.hypot(m.x - G.dan.x, m.y - G.dan.y) <= m.r + G.dan.r){
      const before = G.dan.hp;
      G.dan.hp = Math.min(G.dan.maxHp, G.dan.hp + m.heal);   // capped at maxHp
      const gained = G.dan.hp - before;
      m.depleted = true;
      m.flash = 0.25;
      const color = m.variant === "large" ? COL.vendLarge : COL.vendSmall;
      addFloat(m.x, m.y - 20, "+" + gained, color);
      sfx.heal();
    }
  }
}
