/* =========================================================================
   combat.js — shared damage / death resolution.

   The cross-cutting "something got hurt" code, used by the player (soap shots),
   enemies (melee contact), and projectiles (ranged/area hits). Centralizing it
   keeps the i-frame + knockback + scoring rules in one place.
   ========================================================================= */
import { CFG, ENEMY } from "./config.js";
import { COL } from "./palette.js";
import { G } from "./state.js";
import { addFloat } from "./effects.js";
import { sfx } from "./audio.js";

// Apply a ranged hit to Dan: shared i-frame + a lighter knockback along the
// bolt's travel direction.
export function hitDanRanged(b){
  G.dan.hp -= b.dmg;
  sfx.hurt();
  G.dan.iframe = CFG.DAN_IFRAME;
  const a = Math.atan2(b.vy, b.vx);
  G.dan.kvx = Math.cos(a) * CFG.KNOCKBACK_SPEED * 0.6;
  G.dan.kvy = Math.sin(a) * CFG.KNOCKBACK_SPEED * 0.6;
}

// Area impact (arc landing): shared i-frame + radial knockback away from the
// blast center.
export function hitDanArea(x, y, dmg){
  G.dan.hp -= dmg;
  sfx.hurt();
  G.dan.iframe = CFG.DAN_IFRAME;
  const a = Math.atan2(G.dan.y - y, G.dan.x - x);
  G.dan.kvx = Math.cos(a) * CFG.KNOCKBACK_SPEED * 0.6;
  G.dan.kvy = Math.sin(a) * CFG.KNOCKBACK_SPEED * 0.6;
}

// dx,dy point from the enemy toward Dan; knock Dan AWAY (down +dx/dy).
export function meleeContact(e, dx, dy, dist, dmg){
  e.hp -= CFG.MELEE_DMG_TO_BOT;   // Dan's mop strikes on contact
  e.hitFlash = 0.1;

  if (dmg > 0 && G.dan.iframe <= 0){
    G.dan.hp -= dmg;
    sfx.hurt();
    G.dan.iframe = CFG.DAN_IFRAME;
    G.dan.kvx = (dx/dist) * CFG.KNOCKBACK_SPEED;
    G.dan.kvy = (dy/dist) * CFG.KNOCKBACK_SPEED;
  }

  if (e.hp <= 0){
    const idx = G.enemies.indexOf(e);
    if (idx >= 0) killEnemy(idx);
  }
}

// Friendly fire: apply projectile damage to a ground robot (enemy `e`). Death
// routes through the no-score kill path — no points/float, but full death FX and
// a caught Manager still pulses (GDD 6.1.8/6.1.9, §9). Returns true if it died.
export function damageEnemy(e, dmg){
  e.hp -= dmg;
  e.hitFlash = 0.1;
  if (e.hp <= 0){
    const idx = G.enemies.indexOf(e);
    if (idx >= 0) killEnemy(idx, { score: false });
    return true;
  }
  return false;
}

// `score:false` (e.g. robot-on-robot missile/bolt friendly fire) skips the points
// award + score float but keeps the death sound, Manager berserk pulse, and splice.
export function killEnemy(index, { score = true } = {}){
  const e = G.enemies[index];
  if (score){
    G.score += ENEMY[e.type].points;
    addFloat(e.x, e.y - 16, "+" + ENEMY[e.type].points, COL.amber);
  }
  sfx.enemyDie();

  // Manager on-death: emit a berserk pulse that buffs all nearby robots (GDD 6.1.9).
  // Berserk effect: increased speed + increased melee damage for `berserDur` seconds.
  // If two Managers die near the same robot, the timer refreshes to whichever is longer.
  if (e.type === "manager"){
    const md = ENEMY.manager;
    for (const other of G.enemies){
      if (other === e) continue;   // will be spliced out below
      if (Math.hypot(other.x - e.x, other.y - e.y) <= md.berserRadius){
        other.berserk = Math.max(other.berserk || 0, md.berserDur);
      }
    }
    // Expanding ring telegraph for the pulse (drawn in drawMarks as "berserk" kind)
    G.marks.push({ x:e.x, y:e.y, life:1.5, kind:"berserk" });
  }

  G.enemies.splice(index, 1);
}

export function destroyTerminal(index){
  const t = G.terminals[index];
  G.score += CFG.TERMINAL.points;
  addFloat(t.x, t.y - 18, "+" + CFG.TERMINAL.points, COL.atomic);
  sfx.terminalDie();
  G.terminals.splice(index, 1);
}
