# Achievement System — Implementation Blueprint
## Atomic Dustbin Dan

This document is the implementation spec for the achievement system. It is produced from a design session cross-referencing `ACHIEVEMENTS.md`, `STATUS.md`, and `CLAUDE.md`. Hand it to Claude Code as supporting context.

---

## TASK 1 — Corrected Required Emitters Table

Cross-referenced every row of the ACHIEVEMENTS.md table against STATUS.md's Architecture Map. Corrections and notes follow the table.

| Module | Events to emit | Status |
|---|---|---|
| `player.js` | `player:hit`, `player:hp_changed` (hp, maxHp), `player:moved`, `player:stood_still` (durationMs), `player:died` | **Partially correct — see notes** |
| `projectiles.js` | `bolt:fired` (kind, isTripleShotActive), `bolt:hit` (targetType, bounceCount, uniqueWallCount, simultaneousKills), `bolt:missed`, `bolt:expired` | **Module name wrong — see notes** |
| `enemies.js` | `enemy:died` (type, killerKind, bounceCount, timeAliveMs), `enemy:spawned` (type, timeInLevel), `enemy:fired` (type) | **Correct, with payload additions — see notes** |
| `workers.js` | `worker:rescued` (workerIndex, timeInLevelMs, playerHP, followingDurationMs), `worker:died`, `worker:following_start`, `worker:following_tick` (durationMs) | **Partially correct — see notes** |
| `player.js` (power-ups/vending) | `powerup:collected` (kind), `vending:used` | **Wrong module attribution — see notes** |
| `dustbin.js` | `dustbin:thrown`, `dustbin:bounced` (totalWallCount, uniqueWallCount), `dustbin:detonated` (killCount) | **Correct** |
| `level.js` | `level:start` (enemyCount, workerCount, availableWorkerIndices), `level:end` (stats), `run:start`, `run:end` (stats), `level:all_enemies_dead` | **Partially correct — see notes** |
| `world.js` | `conveyor:push_start`, `conveyor:push_tick` | **Wrong module — see notes** |
| `combat.js` | *(not in original table)* | **Missing — see notes** |
| `input.js` | *(not in original table)* | **Missing — see notes** |

### Corrections and Notes

**`projectiles.js`, not `ebolts.js`:** ACHIEVEMENTS.md lists `projectile.js / ebolts.js`. The real module is `src/projectiles.js`; there is no `ebolts.js`. The `G.ebolts` pool lives entirely inside `projectiles.js`. Use `projectiles.js` throughout.

**`player.js` — shot-fired events belong here, not `projectiles.js`:** `fireVolley`/`fireBubble` live in `player.js` (STATUS Architecture Map). `bolt:fired` is emitted from `player.js` at the call site of `fireVolley`. `projectiles.js` handles enemy bolts (`fireEnemyBolt/Arc/Drop/Homing`) and the shared ebolt pool; it should emit `enemy:fired` via delegation OR the emitter for enemy shots goes in `enemies.js` at the call sites of those fire helpers. Either is fine; placing enemy-shot events in `enemies.js` (where the per-type AI decides to fire) is cleaner and avoids coupling `projectiles.js` to the event bus.

**`bolt:hit` payload — `bounceCount` and `uniqueWallCount`:** Soap shots are tracked in `G.shots` (updated in `player.js`). Neither `bounceCount` nor `uniqueWallCount` is currently a field on a shot object. These must be **added to the shot object** when bounce is active: increment `shot.bounceCount` in the wall-bounce branch of `updateShots`, and maintain `shot.wallsHit` (a `Set` of stringified tile coords) for unique wall tracking. Both fields are zero-initialized on shot creation. The payload at hit time reads them directly off the shot object.

**`bolt:hit` payload — `simultaneousKills`:** This requires knowing how many enemies died from the same trigger pull in the same frame. The cleanest approach is a frame-scoped counter `G._frameKills` reset at the top of each `update()` tick and incremented in `killEnemy`. The `bolt:hit` event must be emitted *after* all hit resolution for the frame, so it can read the final counter. This is the only field that requires cross-frame bookkeeping. **Simpler alternative:** drop `simultaneousKills` from `bolt:hit` and emit a separate `player:multi_kill` (count) event from `killEnemy` when the count crosses 2. Recommended — it decouples per-shot events from frame aggregation.

**`player:hit` vs `player:hp_changed`:** The architecture has three damage paths: `hitDanRanged`, `hitDanArea`, and `meleeContact`, all in `combat.js`. `player:hit` and `player:hp_changed` are both most naturally emitted from `combat.js`, not `player.js` — that is where the damage resolves and the HP changes. The ACHIEVEMENTS.md attribution to `player.js` is wrong. Move both to `combat.js`.

**`player:died`:** Dan's death is detected in `update.js` (the `dan.hp <= 0` → `G.state = 'dead'` branch). Emit `player:died` there. Alternatively, wire it into `hitDanRanged`/`hitDanArea` in `combat.js` at the point where HP drops to 0. The `combat.js` approach is cleaner; `update.js` is the fallback if the death check is only in the orchestrator.

**`player:moved` / `player:stood_still`:** `getMoveVec()` is called in `player.js`'s `updateDan`. The "no input" detection is most naturally tracked in `player.js` using a `G.dan.stillMs` accumulator incremented when `getMoveVec()` returns a zero vector, reset otherwise. `player:stood_still` fires when the accumulator crosses 1000 ms and resets. `player:moved` can fire on every frame with non-zero input or be dropped — most achievements only need `player:stood_still`.

**`powerup:collected` and `vending:used`:** Power-up pickup happens in `updatePickups` inside `level.js`. Vending contact is handled in `vending.js`'s `updateVending`. The ACHIEVEMENTS.md attribution to `items.js / powerups.js` is wrong — neither module exists. **Corrected attribution: `level.js` for `powerup:collected`, `vending.js` for `vending:used`.**

**`worker:died`:** `killWorker` is in `workers.js`. Emit `worker:died` there. The payload should include `{ workerIndex }`. Note: the `worker:following_tick` event requires tracking how long a worker has been following Dan — this is not a current field on worker objects. Add `w.followingMs` (accumulated in `updateWorkers` while Dan is within rescue range, reset on pickup) and emit `worker:following_tick` each frame while following, plus `worker:following_start` on the frame it begins.

**`level:start` payload — `enemyCount`:** There are no pre-spawned enemies at level start in the current architecture; enemies emit from terminals over time. `enemyCount` should be interpreted as the terminal count × max-per-terminal, or simply the total terminal count. Clarify: use `terminalCount` rather than `enemyCount` in the payload, or drop this field. The relevant achievement (`cmb_zero_waste`) can be tracked by counting kills against terminal count.

**`level:end` and `run:end` stats:** These should carry a stats snapshot struct. Design in Task 4 specifies the exact shape.

**`level:all_enemies_dead`:** No current code tracks when all enemies are simultaneously dead (terminals may still spawn). For `cmb_zero_waste`, the correct trigger is when all terminals are destroyed AND `G.enemies.length === 0`. This logic belongs in `update.js`'s frame-update loop, gated by a `G._allEnemiesDeadEmitted` flag that resets on `level:start`.

**`conveyor:push_start` / `conveyor:push_tick` — wrong module:** Conveyor push is applied in `world.js` (`applyBeltPush`) and consumed in `player.js` (via `clampNet`) and `update.js` (for enemies). The `G.dan.onBelt` flag (set each frame in `player.js`) is the most convenient source. Move conveyor events to `player.js`: emit `conveyor:push_start` on the frame `G.dan.onBelt` transitions from false to true, and `conveyor:push_tick` each frame it remains true. Include the push vector in the payload: `{ dx, dy }` from `pushAt(dan.x, dan.y)`.

**Missing emitter: `combat.js`** must emit `player:hit` and `player:hp_changed` (corrected from `player.js`). It also is where `killEnemy` lives — enemy death events that carry kill-context data (`killerKind`, `bounceCount`) must originate here or be passed in as payload fields.

**Missing emitter: `input.js`** for `prg_manual` (gamepad achievement). Emit `run:input_mode_set` (mode) from `startRun(mode)` in `input.js`.

### Corrected Required Emitters Table (Final)

| Module | Events to emit |
|---|---|
| `player.js` | `bolt:fired` (kind, isTripleShotActive), `player:moved`, `player:stood_still` (durationMs), `conveyor:push_start`, `conveyor:push_tick` (dx, dy) |
| `combat.js` | `player:hit` (dmg, source), `player:hp_changed` (hp, maxHp), `player:died`, `enemy:died` (type, killerKind, bounceCount, uniqueWallCount, timeAliveMs, isBounceKill, hadLOSAtFire) |
| `projectiles.js` | `bolt:hit` (targetType, bounceCount, uniqueWallCount), `bolt:missed`, `bolt:expired` |
| `enemies.js` | `enemy:spawned` (type, timeInLevel), `enemy:fired` (type) |
| `workers.js` | `worker:rescued` (workerIndex, timeInLevelMs, playerHP, followingDurationMs), `worker:died` (workerIndex), `worker:following_start` (workerIndex), `worker:following_tick` (workerIndex, durationMs) |
| `level.js` | `level:start` (terminalCount, workerCount), `level:end` (stats), `run:start`, `run:end` (stats), `powerup:collected` (kind) |
| `vending.js` | `vending:used` (variant, hpGained) |
| `dustbin.js` | `dustbin:thrown`, `dustbin:bounced` (totalWallCount, uniqueWallCount), `dustbin:detonated` (killCount) |
| `update.js` | `level:all_enemies_dead`, `player:died` (if not handled in `combat.js`) |
| `input.js` | `run:input_mode_set` (mode) |

---

## TASK 2 — Flagged Items: Firm Decisions

### Blind Shot (`cmb_blind_shot`)
**Decision: Implement. Cost is low; the data is already computable.**

A soap shot object in `G.shots` already carries its origin (`x`, `y` at fire time). Add one field: `shot.hadLOSAtFire = hasLineOfSight({x: dan.x, y: dan.y}, target)` — but this is circular because you don't know the target at fire time.

**Correct implementation:** At fire time, store `shot.danPosAtFire = {x: dan.x, y: dan.y}`. At hit time (inside `updateShots` when an enemy is struck), compute `hadLOS = hasLineOfSight(shot.danPosAtFire, {x: enemy.x, y: enemy.y})`. If `!hadLOS` AND `shot.bounceCount > 0`, the condition is met. Pass `hadLOSAtFire: !hadLOS` in the `enemy:died` payload (or `bolt:hit` payload — either works; `enemy:died` is cleaner since it co-locates all kill context).

`hasLineOfSight` already exists in `world.js` and is called at runtime, so this is a single call per hit. No raycast at fire time required — the raycast runs at hit time using the stored Dan position. Total new state: one `{x,y}` object per active shot (~9 max). Negligible.

### Confrontational (`cmb_confrontational`)
**Decision: Confirm the suggested definition with one refinement.**

Definition: The kill lands on a Security Bot, AND in the 500 ms window before the kill, Dan received no movement input with a lateral component relative to the Dan→bot axis.

**Precise coded form:**
- Track `G.dan.moveHistory`: a ring buffer of `{dx, dy, t}` entries, one per frame, capped to last 500 ms. Reset on level start.
- At kill time of a Security Bot: compute the Dan→bot unit vector `(ux, uy)`. For each entry in `moveHistory` within the last 500 ms, compute the lateral component: `lateral = |dx * uy - dy * ux|` (the 2D cross-product magnitude). If ANY entry has `lateral > 0.1` (threshold to exclude floating-point noise), the condition fails. All entries must be zero-lateral or zero-magnitude.
- "No movement input" (zero-magnitude) counts as non-lateral and does not fail the condition.

This is slightly stricter than "on a converging axis" (which would require positive radial velocity) but simpler to implement and more readable: sidestep at any point in the window = disqualified. Confirmed.

### Wrong Aisle (`conv_wrong_aisle`)
**Decision: Confirm with a tightened facing check.**

Definition: At the moment of kill, `G.dan.onBelt` is true AND Dan's current aim direction differs from the belt's push direction by more than 45°.

**Precise coded form:**
- At kill time: read `pushAt(dan.x, dan.y)` → `{dx, dy}` push vector.
- Read Dan's current facing: use the last known fire angle (`G.dan.lastFireAngle`, already tracked for the "hold last heading" gamepad behavior described in STATUS.md Controls section). If in keyboard mode with no fire key held, use `G.dan.aimAngle` (the mouse-aim angle).
- Compute the angle of the push vector: `beltAngle = Math.atan2(dy, dx)`.
- Compute angular difference. If `|angleDiff| > Math.PI / 4` (45°), condition is met.

"Pushed off course" is captured by the belt being active (not just any conveyor present on the map). Confirmed with the tighter angular threshold — 90° would be too generous (nearly perpendicular is still "going with the flow" on a diagonal); 45° captures the intended "you're fighting the belt or going crosswise."

### No Stopping (`surv_no_stopping`)
**Decision: Confirm. Zero movement input, not zero velocity.**

Using `getMoveVec()` returning a zero vector as the signal is correct and consistent with the rest of the input architecture (CLAUDE.md: "Player-action code NEVER reads raw keys/axes — it calls `input.js`'s `getMoveVec()`"). Using zero velocity instead would create false positives (Dan pinned against a wall by a belt is "moving" in intent but not in position). The achievement is about player agency, not physics outcome. Confirmed.

The `player:stood_still` emitter (in `player.js`) accumulates a `dan.stillInputMs` counter on zero-`getMoveVec()` frames and resets it on any non-zero frame. Emits once when it crosses 1000 ms, then resets.

### Geometry Brain vs. Geometry Teacher
**Decision: Keep both.**

They are genuinely distinct in the scenario they reward and the skill they recognize:
- `bnc_geometry_brain` (4+ total bounces, wall may repeat): rewards high-bounce artistry, including tight-corner pong shots.
- `bnc_geometry_teacher` (4+ unique walls): rewards architectural routing across multiple surfaces — a harder and rarer skill.

They diverge whenever the same wall is hit twice. A shot bouncing off wall A → B → A → B has Brain (4 total) but not Teacher (only 2 unique). Both are tracked on the shot object using fields already planned: `shot.bounceCount` (integer) and `shot.wallsHit` (Set of stringified tile coords). No additional state needed. Keep both.

### CEO (`prg_ceo`)
**Decision: Stub only. Do not activate.**

Mark the registry entry with `{ stub: true, stubReason: "requires difficulty system" }`. The achievement system will skip stub entries during event processing (handlers are not registered for them).

When a difficulty system is eventually designed, it needs to expose: (a) a numeric difficulty level or named tier that can be queried at run-end, (b) a "continued" flag (`G.continued` or equivalent) that is set if the player has restarted after death mid-run. CEO activates when difficulty tier is at maximum AND `!G.continued` at `run:end`.

### Score Thresholds
**Decision: Leave as TODO stubs. Register in the achievement registry with `{ stub: true, stubReason: "thresholds not set" }`.**

Score achievements (`scr_bonus`, `scr_quarterly`, `scr_annual`) will have their handlers registered but will short-circuit immediately on any event until their `thresholds` arrays are populated. A sentinel value (e.g. `thresholds: null`) signals stub state to the handler. No behavior until values are filled post-playtesting.

### Heavy Hitter (`dust_heavy_hitter`)
**Decision: Confirm cumulative lifetime across all sessions.**

`dust_heavy_hitter` counts throws in `lifetime_achievements.dust_heavy_hitter.progress`. This is the same storage path as all other lifetime achievements — it persists in `localStorage` across browser sessions and is never reset by a week rollover. Confirmed.

---

## TASK 3 — Design of `src/events.js`

### Module Specification

`src/events.js` is a minimal pub/sub bus. It is a singleton — importing it from any module gives the same instance. No other module other than `src/achievements.js` should *subscribe* to events; any module may emit.

### Exported API

```js
export function emit(eventName, payload = {}) { … }
export function on(eventName, handler) { … }
export function off(eventName, handler) { … }
```

**`emit(eventName, payload)`**
- `eventName`: string. Convention: `namespace:action` using lowercase with colons (e.g. `enemy:died`, `player:hit`). No enforcement at runtime — names are strings, but authors must follow this convention for discoverability.
- `payload`: plain object. Always provided as a second argument; defaults to `{}` so subscribers can destructure unconditionally.
- Calls all registered handlers for `eventName` in registration order.
- If no handlers are registered, is a no-op (does not throw).
- Does NOT queue events for later dispatch. Events are synchronous and fire immediately.

**`on(eventName, handler)`**
- Registers `handler` as a subscriber for `eventName`.
- `handler` is a function: `(payload) => void`.
- Calling `on` with the same `handler` and same `eventName` twice does NOT register it twice (deduplication by reference).

**`off(eventName, handler)`**
- Removes `handler` from the subscriber list for `eventName`.
- If `handler` is not registered, is a no-op.

### Internal Data Structure

```js
const _listeners = {}; // { [eventName: string]: Set<Function> }
```

A plain object keyed by event name, values are `Set` instances. `Set` gives O(1) deduplication on `add` and O(1) `delete`, and iterates in insertion order (consistent with `on` registration order).

### Error Handling

If a subscriber throws, the error is caught, logged with `console.error`, and iteration continues to the next subscriber. One broken subscriber must not silence others. Pattern:

```js
for (const handler of (_listeners[eventName] ?? [])) {
  try { handler(payload); }
  catch (e) { console.error(`[events] handler error for "${eventName}":`, e); }
}
```

### Why Synchronous Over a Frame-Drained Queue

The game already handles audio this way: STATUS.md notes `audio.js` fires sounds at the state change (not queued and drained later). Achievement handlers are similarly cheap (increment a counter, maybe write localStorage). A synchronous bus matches the existing pattern and requires no drain step in `update.js`. The only disadvantage — handlers running mid-frame could mutate state visible later in the same frame — is a non-issue because `achievements.js` handlers are read-only relative to game state (they only write their own tracking state and localStorage, never `G.*`).

A queued bus would only be necessary if handlers needed to observe a fully-settled frame. None of the achievement conditions require that — they react to discrete events, not frame-end aggregations.

### Event Name Convention

`namespace:action` — all lowercase, colon separator. Namespaces: `player`, `bolt`, `enemy`, `worker`, `level`, `run`, `powerup`, `vending`, `dustbin`, `conveyor`.

---

## TASK 4 — Design of `src/achievements.js`

### Initialization

`achievements.js` exports one function: `initAchievements()`. It must be called once, from `level.js`'s `newGame()` function, before the first `run:start` event fires. (Alternatively, it can be called at the module's import side-effect, but an explicit `init()` call is easier to test and sequence.)

`initAchievements()` does:
1. Loads and validates localStorage state (see persistence below).
2. Detects week rollover: if the stored week key doesn't match the current ISO week, awards XP for completed weekly achievements, discards incomplete weekly progress, initializes a new week key.
3. Checks time-based hidden achievements (`sec_graveyard`, `sec_clock_watcher`, `sec_monday`) at session load.
4. Subscribes all handlers via `on(...)` calls.

No handler registration should happen at module import time — it should happen inside `initAchievements()` so tests can control when it fires.

### Session State (in memory, on `G` or local to the module)

Keep achievement tracking state as module-local variables inside `achievements.js`. Do NOT put it on `G` — `G` is the game sim state; achievement bookkeeping is separate concern.

```js
let _session = {
  levelStartTime: 0,         // ms timestamp, set on level:start
  runStartTime: 0,           // ms timestamp, set on run:start
  levelShotsHits: 0,         // hits this level
  levelShotsFired: 0,        // trigger pulls this level
  levelEnemiesKilled: 0,
  levelDamageTaken: 0,
  levelWorkersRescued: 0,
  levelPowerupsCollected: 0,
  levelVendingUsed: 0,
  levelDustbinThrown: false,
  runWorkersRescued: 0,
  runWorkersAvailable: 0,
  runPowerupsCollected: 0,
  runVendingUsed: 0,
  consecutiveDamageFreeCount: 0,  // for surv_teflon
  authLevelsCompleted: new Set(), // for wrk_shop_steward, prg_spring
  levelWorkersAvailable: 0,
  levelWorkersRescuedIndices: new Set(),
  allWorkersRescuedAllLevels: true, // for wrk_nobody
  bounceShotKillsThisLevel: 0, // for bnc_wall_flower
  nonBounceShotKillsThisLevel: 0,
  managerEncounterHit: false,  // for cmb_above_pay_grade
  managerSpawnTime: 0,         // for cmb_overtime_denied
  weeklyProgress: {},          // loaded from localStorage
  weeklyKey: '',               // e.g. "weekly_2026_26"
};
```

Per-level stats reset in the `level:start` handler. Per-run stats reset in `run:start`.

### Persistence: localStorage Schema

**Weekly state key:** `add_weekly_{isoYear}_{isoWeekNumber}` (prefixed `add_` to namespace the game's storage)

Value shape:
```json
{
  "acc_marksman": { "unlocked": false, "progress": 2 },
  "wrk_hero": { "unlocked": true, "progress": 5 },
  "meta_eotw": { "unlocked": false, "progress": 3 }
}
```

Only the 5 active weekly achievements for the current set are stored in this key. `progress` is an integer count of how many times the achievement has been completed this week. `unlocked` is true if completed at least once this week.

**Lifetime state key:** `add_lifetime`

Value shape:
```json
{
  "bnc_bank": { "tier": 2, "progress": 47 },
  "cmb_decommissioned": { "tier": 1, "progress": 823 },
  "prg_ceo": { "tier": 0, "progress": 0 }
}
```

Tier 0 = never unlocked. Progress is the raw count; tier thresholds are checked against the registry at runtime. All achievement IDs are present in the object after the first session (initialized with `{tier: 0, progress: 0}` if absent).

**XP key:** `add_xp` — a single integer, total accumulated XP across all time.

**EOTW consecutive key:** `add_eotw_streak` — value: `{ lastWeekKey: string, streak: number }`. Used for `meta_consecutive`.

### Week Rollover Detection

On `initAchievements()`:
```js
const currentKey = isoWeekKey(); // "2026_26"
const storedKey = JSON.parse(localStorage.getItem('add_weekly_meta'))?.key ?? null;
if (storedKey !== currentKey) {
  // Award XP for completed weekly achievements from last week
  // Discard stored progress (leave the old key as-is for the record, don't clean up)
  // Write a new 'add_weekly_meta' = { key: currentKey }
  // Initialize new weekly state
}
```

Store a separate `add_weekly_meta = { key: "2026_26" }` as a lightweight sentinel for the current week. Weekly state for old weeks can remain in localStorage (they're harmless orphans). No cleanup needed.

ISO week computation (UTC):
```js
function isoWeekKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}_${weekNo}`;
}
```

### Handler Architecture

One handler function per event name, registered via `on()`. Each handler receives the full payload and routes to whichever achievements care about that event.

Do NOT use a single dispatch handler — one handler per event makes each handler's responsibilities readable and avoids a giant switch.

Example:
```js
on('enemy:died', ({ type, killerKind, bounceCount, uniqueWallCount, hadLOSAtFire, timeAliveMs }) => {
  // cmb_grounded: Drone killed before it fires
  // bnc_bank, bnc_cue_ball, bnc_pool_shark, bnc_geometry_brain, etc.
  // cmb_recall_notice: homing bolt redirected
  // cmb_blind_shot: bounced kill without LOS
  // etc.
});
```

### In-Play Banner

`achievements.js` does not call into `screens.js` directly (that would reverse the dependency direction — `screens.js` is a render module). Instead, `achievements.js` writes to a module-local queue:

```js
let _bannerQueue = []; // [{ text, subtext, timestamp }]
```

When an achievement unlocks, push to `_bannerQueue`. Export a function:
```js
export function popAchievementBanner() { return _bannerQueue.shift() ?? null; }
```

`screens.js` (or `render.js`) calls `popAchievementBanner()` each frame and renders the current banner with a timestamp-based display duration (2.5 s suggested). Multiple unlocks in quick succession queue — only one banner visible at a time, next queued after the current expires.

This keeps the dependency arrow correct: render modules pull from achievements; achievements do not push into render.

### Post-Level Modal Data

Export from `achievements.js`:
```js
export function getLevelAchievementSummary() { … }
```

Returns an array of `{ id, name, progress, target, unlocked, isNew }` for any weekly achievement that received progress during the level. `render.js` / `screens.js` calls this during the `levelclear` state draw to populate the modal. "Made progress" = `_session` tracked at least one relevant event since `level:start`.

Track which achievements received progress this level with a `Set`: `_session.progressedThisLevel = new Set()`.

### Lifetime Modal Data

Export from `achievements.js`:
```js
export function getLifetimeAchievements() { … }
```

Returns the full registry with current tier and progress merged in from `add_lifetime` localStorage. Groups by category. Hidden achievements (`H: true`) return `{ id: '???', name: '???', description: '???' }` until `tier > 0`.

---

## TASK 5 — Exact `emit()` Calls Per Module

All calls use the named import: `import { emit } from './events.js';` at the top of each modified module.

---

### Module: `player.js`

**Location:** Inside `fireVolley()`, after the volley is confirmed (after the max-shots check passes)
```js
emit('bolt:fired', {
  kind: G.dan.bounceShots > 0 ? 'bounce' : 'standard',
  isTripleShotActive: G.dan.tripleShot > 0,
});
```

**Location:** In `updateDan()`, movement-input section — after `getMoveVec()` is read
```js
const mv = getMoveVec();
if (mv.x !== 0 || mv.y !== 0) {
  G.dan.stillInputMs = 0;
  // existing movement code
} else {
  G.dan.stillInputMs = (G.dan.stillInputMs ?? 0) + dt * 1000;
  if (G.dan.stillInputMs >= 1000 && !G.dan._stoodStillEmitted) {
    emit('player:stood_still', { durationMs: G.dan.stillInputMs });
    G.dan._stoodStillEmitted = true;
  }
  if (G.dan.stillInputMs < 1000) G.dan._stoodStillEmitted = false;
}
```
*(Add `stillInputMs: 0, _stoodStillEmitted: false` to Dan's initial state in `state.js`.)*

**Location:** In `updateDan()`, after belt push is resolved — after `clampNet` call and `G.dan.onBelt` is set
```js
const prevOnBelt = G.dan._prevOnBelt ?? false;
if (G.dan.onBelt && !prevOnBelt) {
  emit('conveyor:push_start');
}
if (G.dan.onBelt) {
  const bv = pushAt(Math.floor(G.dan.x / CFG.TILE), Math.floor(G.dan.y / CFG.TILE));
  emit('conveyor:push_tick', { dx: bv.dx, dy: bv.dy });
}
G.dan._prevOnBelt = G.dan.onBelt;
```
*(Add `_prevOnBelt: false` to Dan's initial state.)*

**Location:** In `updateShots()`, at the point a shot goes out of range / leaves the map without hitting
```js
emit('bolt:missed');
```

**Location:** In `updateShots()`, at the wall-bounce branch (when `CFG.BOUNCE` shot hits a wall)
```js
shot.bounceCount = (shot.bounceCount ?? 0) + 1;
const wallKey = `${tileX},${tileY}`;
shot.wallsHit = shot.wallsHit ?? new Set();
shot.wallsHit.add(wallKey);
```
*(No emit here — wall hits are payload fields on `bolt:hit` / `enemy:died`.)*

**Location:** In `updateShots()`, at the point a shot hits an enemy (before calling `killEnemy`)
```js
emit('bolt:hit', {
  targetType: enemy.type,
  bounceCount: shot.bounceCount ?? 0,
  uniqueWallCount: shot.wallsHit?.size ?? 0,
});
```
*(Shot also carries `shot.danPosAtFire` — set this at shot-creation time in `fireBubble()`.)*

---

### Module: `combat.js`

**Location:** In `hitDanRanged()` / `hitDanArea()` / `meleeContact()`, after damage is confirmed (after i-frame check passes, before or after HP decrement)
```js
emit('player:hit', { dmg: actualDmg, source: 'ranged' /* or 'melee' or 'area' */ });
emit('player:hp_changed', { hp: G.dan.hp, maxHp: G.dan.maxHp });
```

**Location:** In `hitDanRanged()` / `hitDanArea()` / `meleeContact()`, immediately after the `G.dan.hp <= 0` check (if death is detected here — verify against actual code)
```js
if (G.dan.hp <= 0) {
  emit('player:died');
}
```

**Location:** In `killEnemy(index, opts)`, after score is awarded and before the enemy is spliced from the array
```js
const e = G.enemies[index];
emit('enemy:died', {
  type: e.type,
  killerKind: opts.killerKind ?? 'mop',     // pass from call sites
  bounceCount: opts.bounceCount ?? 0,        // pass from updateShots
  uniqueWallCount: opts.uniqueWallCount ?? 0,
  hadLOSAtFire: opts.hadLOSAtFire ?? true,
  timeAliveMs: opts.timeAliveMs ?? 0,        // pass from call sites
  isBounceKill: (opts.bounceCount ?? 0) > 0,
});
```
*Call sites of `killEnemy` (in `player.js`, `dustbin.js`, `combat.js`) pass `opts.killerKind` etc. `updateShots` in `player.js` already has the shot object, so it passes `bounceCount`, `uniqueWallCount`, `hadLOSAtFire`, and `killerKind: 'bubble'`. The mop kill path passes `killerKind: 'mop'`. The dustbin blast path passes `killerKind: 'dustbin'`.*

---

### Module: `enemies.js`

**Location:** In `spawnEnemy()`, after the enemy object is pushed to `G.enemies`
```js
emit('enemy:spawned', {
  type: e.type,
  timeInLevel: performance.now() - G._levelStartTime,
});
```
*(Add `G._levelStartTime` — set in `level.js` at `loadLevel` time.)*

**Location:** In each per-type fire branch (`updateSecurity`, `updateSorter`, `updateDrone`, `updateManager`), at the point the ebolt is launched — after `fireEnemyBolt/Arc/Drop/Homing` is called
```js
emit('enemy:fired', { type: e.type });
```

---

### Module: `workers.js`

**Location:** In `updateWorkers()`, on the frame a worker enters seek-Dan mode (transitions to following) — add a `w._following` flag
```js
if (seekingDan && !w._following) {
  w._following = true;
  w._followingMs = 0;
  emit('worker:following_start', { workerIndex: w.index });
}
if (w._following) {
  w._followingMs += dt * 1000;
  emit('worker:following_tick', { workerIndex: w.index, durationMs: w._followingMs });
}
if (!seekingDan) {
  w._following = false;
}
```

**Location:** In `rescueWorker(w)`, after `G.rescued++` and score award
```js
emit('worker:rescued', {
  workerIndex: w.index,
  timeInLevelMs: performance.now() - G._levelStartTime,
  playerHP: G.dan.hp,
  followingDurationMs: w._followingMs ?? 0,
});
```

**Location:** In `killWorker(w)`, after the worker is spliced from `G.workers`
```js
emit('worker:died', { workerIndex: w.index });
```

---

### Module: `level.js`

**Location:** In `loadLevel()`, after the level is fully built and entities are seeded (end of function, just before returning)
```js
G._levelStartTime = performance.now();
emit('level:start', {
  terminalCount: G.terminals.length,
  workerCount: G.workers.length,
});
```

**Location:** In `nextLevel()`, before calling `loadLevel` for the next level — i.e., this fires at the moment the player exits through the door
```js
emit('level:end', {
  levelTime: performance.now() - G._levelStartTime,
  shotsHits: _statsThisLevel.hits,     // see Stats section below
  shotsFired: _statsThisLevel.fired,
  enemiesKilled: _statsThisLevel.kills,
  damageTaken: _statsThisLevel.damage,
  workersRescued: G.rescued,
  powerupsCollected: _statsThisLevel.powerups,
  vendingUsed: _statsThisLevel.vending,
  dustbinThrown: _statsThisLevel.dustbinThrown,
  levelNumber: G.level,
});
```

**Location:** In `newGame()`, after the full state reset
```js
emit('run:start');
```

**Location:** In the game-over / run-end path in `update.js` (see below — `level.js` may not be the right home for this; see `update.js` entry)

**Location:** In `updatePickups()` inside `level.js`, when a power-up is collected by Dan
```js
emit('powerup:collected', { kind: pickup.kind });
```

---

### Module: `vending.js`

**Location:** In `updateVending()`, after the heal is applied and the machine is depleted
```js
emit('vending:used', { variant: m.variant, hpGained: actualHeal });
```

---

### Module: `dustbin.js`

**Location:** In `updateDustbin()`, at the throw/deploy transition (when the dustbin enters slide state)
```js
emit('dustbin:thrown');
```

**Location:** In `updateDustbin()`, at the wall-bounce branch (when the bin reflects off a wall)
```js
G.dustbin.totalWallCount = (G.dustbin.totalWallCount ?? 0) + 1;
const wallKey = `${tileX},${tileY}`;
G.dustbin.wallsHit = G.dustbin.wallsHit ?? new Set();
G.dustbin.wallsHit.add(wallKey);
emit('dustbin:bounced', {
  totalWallCount: G.dustbin.totalWallCount,
  uniqueWallCount: G.dustbin.wallsHit.size,
});
```

**Location:** In `updateDustbin()`, in the detonation handler (when `killEnemy` calls fire for all in-blast enemies)
```js
emit('dustbin:detonated', { killCount: killsThisDetonation });
```
*(Count kills locally before splicing: accumulate into `let killsThisDetonation = 0` in the blast loop, emit after.)*

---

### Module: `update.js`

**Location:** At the top of the `playing` branch, after `G._allEnemiesDeadEmitted` is false — check condition each frame
```js
if (!G._allEnemiesDeadEmitted
    && G.terminals.every(t => t.destroyed)
    && G.enemies.length === 0) {
  G._allEnemiesDeadEmitted = true;
  emit('level:all_enemies_dead');
}
```
*(Add `G._allEnemiesDeadEmitted = false` to `buildLevel`.)*

**Location:** In the `dead` state branch, once (edge-triggered) — when `G.state` transitions to `'dead'`
```js
// If player:died not handled in combat.js, emit here:
emit('player:died');
emit('run:end', {
  runTime: performance.now() - G._runStartTime,
  levelsCompleted: G.level - 1,
  totalScore: G.score,
  inputMode: G.inputMode,
});
```

---

### Module: `input.js`

**Location:** In `startRun(mode)`, after `G.inputMode = mode` is set
```js
emit('run:input_mode_set', { mode });
```

---

## TASK 6 — UI Components Specification

### Title Screen Weekly Panel

**What data it reads:** Calls `getWeeklyAchievements()` from `achievements.js`, which returns the 5 active weekly achievements with current progress, plus the `meta_eotw` entry showing how many of the 5 are completed.

**Where in `screens.js`:** Inside `drawTitle()`, below the existing "KEYBOARD / GAMEPAD" option display. The panel does not overlap the fire legend (`drawFireLegend` is in the lower-left; the weekly panel goes right-of-center or as a sidebar column).

**Layout:** 6 rows (5 weekly + 1 EOTW), each row ~28px tall. For each entry:
- Achievement name (left-aligned, white)
- Short description (grey, smaller font)
- Progress indicator: if the achievement has a numeric threshold, show `n / target`; if it's binary (complete/not), show a checkmark or empty box.
- Completed achievements show a gold checkmark and dim the text slightly.

**Render discipline:** The weekly panel is drawn only when `G.state === 'title'`. It uses existing `ctx` calls, `COL` palette values, and the same font stack as the rest of `screens.js`. No new canvas context state.

---

### In-Play Achievement Banner

**Where in the render loop:** `render.js`'s `render()` function, after all world/entity draws and after the HUD, before any modal overlays. This ensures the banner is always on top of gameplay but under any modal.

**How it draws:** Each frame, call `popAchievementBanner()`. If non-null and within display duration (2.5 s):
- Render a semi-transparent dark rectangle, bottom-center of the viewport.
- Top line: achievement name in bold white.
- Bottom line: tier if lifetime (`"Bronze unlocked"`) or `"Weekly progress"` if weekly.
- Do NOT pause the game. Banner is cosmetic overlay only.

**Multiple concurrent unlocks:** The queue approach from Task 4 handles this. If two achievements unlock on the same frame, the second banner appears after the first's 2.5 s expires. Max queue depth: cap at 5 (discard oldest overflow) to prevent a long queue from stacking indefinitely.

**Sound:** Emit `sfx.achievement()` from `achievements.js` when pushing to the banner queue. `audio.js` needs a new `sfx.achievement()` function — a short ascending two-tone blip, distinct from `sfx.rescue`. Claude Code should implement this alongside the system.

---

### Post-Level Modal

**When it appears:** During the `levelclear` state, if `getLevelAchievementSummary()` returns a non-empty array. If the array is empty (no weekly progress this level), the modal is skipped and the level-clear screen shows normally.

**What triggers it:** `drawLevelClear()` in `screens.js` checks `getLevelAchievementSummary().length > 0` on the first frame of the `levelclear` state. Set a flag `G._showAchievementModal = true` then; subsequent frames render the modal.

**What it shows:**
- Header: "Achievement Progress"
- List: each entry from `getLevelAchievementSummary()` — name, description, `n / target` progress, "NEW!" badge if `isNew` (unlocked this level for the first time).
- Footer: two buttons: "Continue" (advances to next level via the normal level-clear path) and "View All Achievements" (opens the lifetime modal — see below).

**Dismissal:** "Continue" sets `G._showAchievementModal = false` and triggers the level advance (same as the existing level-clear keypress). This means the post-level modal intercepts the usual "press key to advance" flow; the player must explicitly dismiss the modal.

**Input:** In keyboard mode, `SPACE` or `ENTER` = Continue. In gamepad mode, `BTN_START` or `A (BTN_0)` = Continue. The "View All" button requires a second interaction model — for Phase 1 implementation, this button can be a no-op placeholder.

---

### Lifetime Achievements Modal

**Access points:** "View All Achievements" on the title screen (a new text button below the weekly panel), and "View All" on the post-level modal.

**Data:** Calls `getLifetimeAchievements()` from `achievements.js`. Returns achievements grouped by category in the order they appear in ACHIEVEMENTS.md.

**Layout:**
- Category headers (matching ACHIEVEMENTS.md emoji + name).
- Each achievement: a row with name, tier badge row (5 badges, greyed if not yet earned), progress bar to next tier, and short description.
- Hidden achievements (`H: true`, `tier === 0`): show as `??? — ???` with all badges greyed.
- Scrollable if content overflows — use a viewport-clipped canvas scissor rect with `G._lifetimeScrollY` state. Arrow keys / gamepad stick scroll.

**Dismissal:** `ESC` or `BACKSPACE` (keyboard) / `BTN_B` or back button (gamepad) closes the modal, returns to whichever surface opened it (title or post-level).

**Phase 1 note:** Implement as a stubbed overlay that shows category names and a placeholder list. Full layout in a later phase.

---

## TASK 7 — Implementation Order

### Phase 1: Event Bus + One Achievement End-to-End

**Goal:** `events.js` wired, one achievement fires a real in-play notification. Verifiable in the browser in under 10 minutes.

Steps:
1. Create `src/events.js` (full module as specified in Task 3).
2. Add `import { emit } from './events.js'` to `player.js`. Add the `bolt:fired` emit in `fireVolley`.
3. Create a minimal `src/achievements.js` with `initAchievements()` and one handler: `on('enemy:died', ...)` tracking `cmb_foam_party` (total shots fired). For now, use a module-local counter and `console.log` when a threshold is crossed.
4. Call `initAchievements()` from `newGame()` in `level.js`.
5. Add the banner pull to `render.js`: call `popAchievementBanner()` and draw a placeholder rectangle.

**Verification:** Fire bubbles until `cmb_foam_party` Bronze (500) fires (use console to confirm). Banner appears in-game.

---

### Phase 2: Core Emitters + localStorage

**Goal:** All emitters from Task 5 added to their respective modules. Lifetime persistence in localStorage. Weekly persistence scaffolded.

Steps:
1. Add `G._levelStartTime` to `level.js`'s `loadLevel`.
2. Add `combat.js` emitters (`player:hit`, `player:hp_changed`, `enemy:died` with full payload).
3. Add `level.js` emitters (`level:start`, `level:end`, `run:start`, `run:end`, `powerup:collected`).
4. Add `workers.js` emitters.
5. Add `vending.js` emitter.
6. Add `dustbin.js` emitters.
7. Add `enemies.js` emitters.
8. Add `update.js` emitters (`level:all_enemies_dead`, `player:died`, `run:end`).
9. Add `input.js` emitter.
10. Add shot-object fields to `player.js` (`bounceCount`, `wallsHit`, `danPosAtFire`).
11. Implement localStorage read/write in `achievements.js` for lifetime state.
12. Implement ISO week key and weekly state init.

**Verification:** Run headless tests — `test-achievements.js` (new file) that imports `events.js` and `achievements.js`, fires mock events, and asserts correct progress increments and localStorage writes. At least 20 checks.

---

### Phase 3: Achievement Registry — Straightforward Achievements

**Goal:** Implement all achievements that require only the events from Phase 2, no per-shot tracking state.

Categories: Progression, Survival, Speed, Worker Rescue (most), Atomic Dustbin, Power-Ups & Items, Score stubs.

**Verification:** Each achievement category gets at least 2 test cases in `test-achievements.js`.

---

### Phase 4: Bounce Shot + Complex Combat Achievements

**Goal:** Achievements requiring per-shot state (`bounceCount`, `wallsHit`, `danPosAtFire`) and complex conditions (Confrontational, Blind Shot, Wrong Aisle).

Steps:
1. Implement `shot.bounceCount` / `shot.wallsHit` / `shot.danPosAtFire` in `player.js` (Task 5 emitter section).
2. Implement bounce achievement handlers.
3. Implement `G.dan.moveHistory` ring buffer for `cmb_confrontational`.
4. Implement `conveyor:push_tick` handler for `conv_wrong_aisle`.
5. Implement `cmb_blind_shot` using `hadLOSAtFire` in `enemy:died` payload.

**Verification:** Headless tests for bounce payload correctness. Browser test: equip Bounce power-up, ricochet a kill, confirm `bnc_bank` increments.

---

### Phase 5: UI — Weekly Panel + Full Banner

**Goal:** Title screen shows real weekly achievements. Banner shows real achievement name.

Steps:
1. Implement `getWeeklyAchievements()` export.
2. Add weekly panel draw to `drawTitle()` in `screens.js`.
3. Implement `sfx.achievement()` in `audio.js`.
4. Wire banner draw in `render.js` with 2.5 s display.

---

### Phase 6: UI — Post-Level Modal + Lifetime Modal

**Goal:** Post-level modal shows real progress. Lifetime modal shows full registry.

Steps:
1. Implement `getLevelAchievementSummary()`.
2. Implement post-level modal in `drawLevelClear()`.
3. Implement `getLifetimeAchievements()`.
4. Implement lifetime modal draw (scrollable canvas, badge rows, hidden masking).

---

### Phase 7: Hidden + Time-Based Achievements + EOTW

**Goal:** `sec_*` time-based achievements, `meta_eotw` / `meta_consecutive` / `meta_model`, XP display.

---

## TASK 8 — Claude Code Handoff Prompt

```
You are implementing the achievement system for Atomic Dustbin Dan. This is a structured implementation — read the following files in order before writing any code:

1. /home/paulk/projects/game/add2026/CLAUDE.md — always-loaded spine; non-negotiables and code map.
2. /home/paulk/projects/game/add2026/STATUS.md — what is actually built and where the code lives.
3. /home/paulk/projects/game/add2026/ACHIEVEMENTS.md — full achievement specification.
4. /home/paulk/projects/game/add2026/ACHIEVEMENT-BLUEPRINT.md — implementation blueprint. This is your primary spec. Follow it exactly.

Your task for this session is **Phase 1** from the blueprint's Task 7.

## Phase 1 goals

1. Create `src/events.js` — implement exactly as specified in Task 3 of the blueprint (synchronous pub/sub, Set-based listener store, try/catch per subscriber, `emit`/`on`/`off` exports).

2. Create a minimal `src/achievements.js` — implement `initAchievements()` (exported), subscribe to `enemy:died`, track a module-local `_totalShotsFired` counter (for `cmb_foam_party`), and push to `_bannerQueue` when Bronze (500) threshold is crossed. Export `popAchievementBanner()`.

3. Edit `src/player.js` — add `import { emit } from './events.js'` and add the `bolt:fired` emit call in `fireVolley()` exactly as specified in Task 5.

4. Edit `src/level.js` — add `import { initAchievements } from './achievements.js'` and call `initAchievements()` inside `newGame()` after the state reset.

5. Edit `src/render.js` — add `import { popAchievementBanner } from './achievements.js'` and in `render()`, after the HUD draw call, add a banner draw: if `popAchievementBanner()` returns a non-null value and less than 2500 ms have elapsed since it was received, draw a semi-transparent dark rect bottom-center with the achievement text.

## Constraints

- Do not modify any non-negotiables from CLAUDE.md.
- Do not add any entry to `G` in state.js for achievement tracking state — keep it module-local in achievements.js.
- events.js must have zero imports (it is a leaf).
- achievements.js imports only from events.js and nothing from the game simulation modules — the dependency must flow one way.

## Tests

Before declaring done, write and run `test-achievements.js` using Node.js (headless, no DOM). The test file must:
- Import events.js and achievements.js directly (mock any DOM/localStorage with a simple stub).
- Call `initAchievements()`.
- Fire 499 `bolt:fired` events via `emit('bolt:fired', { kind: 'standard', isTripleShotActive: false })`.
- Assert `popAchievementBanner()` returns null (threshold not yet crossed).
- Fire one more `bolt:fired`.
- Assert `popAchievementBanner()` returns an object with `text` containing the achievement name.
- Include at least 5 total assertions.
- Run: `node test-achievements.js` and confirm all pass before declaring the session done.

## After implementation

Update STATUS.md:
- Change the Achievement system row in the "Current state" table from `🔲 Not built` to `🔧 In progress — Phase 1 complete`.
- Add a "Achievement system" subsystem decisions entry with: the pub/sub approach decision, the `popAchievementBanner` pull architecture, and the module-local state decision.
- Do NOT add any new entries to the Architecture Map yet — the full module descriptions go in after Phase 2.
```

---

## CLAUDE.md Conflict Check

One potential conflict to flag:

**Audio note:** `audio.js` is described in STATUS.md as "a leaf, called like `addFloat`" with "no central event bus" by design — the note even says "Alt: an event queue drained each frame — more indirection for no benefit at this scale." The achievement banner requires a new `sfx.achievement()` call. This is NOT a conflict — `achievements.js` can call `sfx.achievement()` directly, same as any other module. The pub/sub bus is for *achievement tracking events*; `audio.js` remains a direct-call leaf. The achievement banner sound is just one more `sfx.*` call at the push site in `achievements.js`. Import `sfx` from `audio.js` into `achievements.js` for this purpose. No architectural conflict.

No other conflicts found between ACHIEVEMENTS.md and CLAUDE.md non-negotiables. All non-negotiables (HP/score persist, one enemy per level, loader as sole entry point, `G.inputMode` device lock, knockback direction, worker rescue values) are untouched by the achievement system.