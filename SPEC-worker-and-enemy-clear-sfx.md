# SPEC — Worker Exit Sounds + Last-Enemy-Cleared Sound

Status: ready for implementation
Audio direction confirmed via `sfx-audition.html` (audition session, this thread)

## 1. Summary

Two independent behavior changes, both sound-only (no gameplay/scoring changes):

**A. Worker exit sounds** — split today's one-size-fits-all "last worker gone" sound
(`sfx.noWorkers()`) into three distinct outcomes based on *how* the level's workers
were resolved:

| Outcome | New sound | Old behavior |
|---|---|---|
| Last worker killed by a robot | `last-worker-death` | played `noWorkers()` |
| Last worker rescued, zero workers killed this level | `all-workers-saved` | played `noWorkers()` |
| Last worker rescued, one or more workers were killed this level | `last-worker-saved` | played `noWorkers()` |

Additionally: when the **last** worker is killed by a robot, only `last-worker-death`
plays — the existing `any-worker-death` sound (`workerLost()`, unchanged) must NOT
also play for that kill. Non-last kills continue to play `any-worker-death` as today.

`noWorkers()` becomes dead code once this ships (see Phase 2 for removal).

**B. Last-enemy-cleared sound** — a new congratulatory sound, `last-enemy-cleared`,
plays once per level the moment the last enemy is destroyed AND no spawn terminals
remain — regardless of what destroyed that last enemy (player's mop, friendly fire,
Atomic Dustbin, etc). This hooks the *existing* `level:all_enemies_dead` event
(already emitted once per level in `update.js`) rather than touching every kill path.

## 2. Confirmed audio design

All four sounds are synthesized via the existing `tone()` / `noise()` / `sequence()`
helpers in `audio.js` — same engine, same file, no new dependencies. Exact synthesis
code is given in Phase 1 below; this section states the intent.

- **last-worker-death** — mournful, not alarming. A fast (~2x normal speed) minor-key
  descent over a sustained low sub-drone, with a dissonant tritone dyad on the final
  note. Distinct in character from the existing `any-worker-death` sound (which stays
  a dramatic klaxon-style sting) — this one reads as grief, not urgency.
- **all-workers-saved** — a big, bold 3-chord rising fanfare (square+triangle stack,
  widest voicing of the four new sounds) — but gain-matched to sit in roughly the same
  loudness range as `last-worker-saved` (peak gain ~0.13), not the louder ~0.26 peak it
  was auditioned at. No runtime volume parameter — the lower gain is simply baked into
  the literal values in the synthesis code, same pattern as every other sound in the
  file today.
- **last-worker-saved** — a small, subdued 2-chord rise (narrower voicing, quieter,
  same square+triangle character family as all-workers-saved, but clearly the "little
  sibling," not a full fanfare).
- **last-enemy-cleared** — triumphant/aggressive, not polite. Three rising sawtooth
  power-chord stomps with no final held chord — the stomps themselves carry the
  "we got the last of you" feeling.

## 3. Current code (read fresh from GitHub for this spec)

### `src/workers.js` — the two call sites that need to change

```js
// Inventory Bot kills a worker on contact (GDD 6.1.6 / 7.3): no points, gone for
// the level. Safe to call with a worker that's already left the array.
export function killWorker(w){
  const i = G.workers.indexOf(w);
  if (i < 0) return;
  addFloat(w.x, w.y - 14, "WORKER LOST", COL.chargeWarn);
  sfx.workerLost();
  G.workers.splice(i, 1);
  emit('worker:died', { workerIndex: w.index ?? i });
  if (G.workers.length === 0) sfx.noWorkers();   // last human gone (GDD 7, 10)
}

// Award the escalating rescue value, count it, and remove the worker.
function rescueWorker(i){
  const w = G.workers[i], d = CFG.WORKER;
  const pts = d.rescueBase * Math.pow(2, G.rescued);   // 100, 200, 400, 800, 1600
  G.score += pts;
  sfx.rescue(G.rescued);   // pitch climbs with each rescue this level (0-based)
  G.rescued++;
  addFloat(w.x, w.y - 14, "+" + pts + " SAVED", COL.atomic);
  emit('worker:rescued', { ... });
  G.workers.splice(i, 1);
  if (G.rescued === d.count) addFloat(G.dan.x, G.dan.y - 30, "ALL " + d.count + " SAVED!", COL.amber);
  if (G.workers.length === 0) sfx.noWorkers();   // last human gone (GDD 7, 10)
}
```

### `src/state.js` — where new per-level state goes

`G` already resets several one-shot per-level flags in `level.js`'s `loadLevel()`
(`_allEnemiesDeadEmitted`, `_levelEndEmitted`, etc). We add one more of the same kind:
`_levelWorkerKilled` — tracks whether ANY worker (not just the last) was killed by a
robot this level, so the rescue path can tell `all-workers-saved` apart from
`last-worker-saved`.

### `src/level.js` — existing per-level reset block (loadLevel), line ~387-391

```js
G.dustbin = null; G.dustbinPickups = []; G.workers = [];
G.rescued = 0; G.spawnTimer = 0.6; G.pickupTimer = 0;
G._allEnemiesDeadEmitted = false;
G._levelEndEmitted = false;     // re-arm the levelclear level:end one-shot
G._showAchievementModal = false;
```

### `src/update.js` — existing one-shot event, our hook point for last-enemy-cleared

```js
// level:all_enemies_dead — fires once when all terminals are gone AND no active
// enemies remain (terminals splice on destroy, so length === 0 = all dead).
if (!G._allEnemiesDeadEmitted
    && G.terminals.length === 0
    && G.enemies.length === 0) {
  G._allEnemiesDeadEmitted = true;
  emit('level:all_enemies_dead');
}
```

This already fires exactly once per level, at the right moment, regardless of what
killed the last enemy (it's driven by `G.enemies.length === 0`, not by which kill path
triggered it). Today only `achievements.js` listens to `level:all_enemies_dead`. We add
a second listener that plays the new sound.

### `src/events.js` — pub/sub bus (unchanged, just noting the API)

```js
export function emit(eventName, payload = {}) { ... }
export function on(eventName, handler) { ... }
```
Header comment says "Only achievements.js subscribes" — this becomes stale once we
add a second subscriber; Phase 2 updates that comment.

## 4. Design decisions worth flagging

- **Where does the last-enemy-cleared listener live?** Two reasonable options:
  (a) a new tiny module, or (b) directly in `audio.js` itself, since `audio.js`
  already imports `events.js`-adjacent concerns are not currently wired that way — today
  every `sfx.*` call is invoked *by* game code, not self-triggered by events. To keep
  the existing architecture (game code decides when to call `sfx.*`; `audio.js` never
  imports `events.js`) we do NOT have `audio.js` subscribe to the event itself.
  Instead, we add the `on('level:all_enemies_dead', ...)` subscription in `update.js`
  (which already imports both `sfx` and `emit`/the event bus) right next to where the
  event is emitted. This is the smallest, most local change and matches the existing
  pattern of `update.js` calling `sfx.*` directly elsewhere (e.g. `sfx.conveyor(...)`).
- **Guarding against double-fire**: `G._allEnemiesDeadEmitted` already guards the
  `emit()` call to once-per-level, so the new listener doesn't need its own guard.
- **Worker sound mutual exclusivity**: the spec in TODO item 4 requires that when the
  last worker is killed, `any-worker-death` must NOT also play. This means `killWorker`
  needs an if/else, not two independent checks — see Phase 1 code.

## 5. Files touched

| File | Change |
|---|---|
| `src/audio.js` | Remove `noWorkers()`. Add `sfx.lastWorkerDeath()`, `sfx.allWorkersSaved()`, `sfx.lastWorkerSaved()`, `sfx.lastEnemyCleared()`. |
| `src/state.js` | Add `_levelWorkerKilled:false` to `G`. |
| `src/level.js` | Reset `G._levelWorkerKilled = false;` in `loadLevel()`'s existing reset block. |
| `src/workers.js` | Rewrite `killWorker()` and `rescueWorker()` per Phase 1. |
| `src/update.js` | Add `on('level:all_enemies_dead', () => sfx.lastEnemyCleared())` near the existing emit. |
| `src/events.js` | Update stale header comment ("Only achievements.js subscribes"). |

## 6. Verified final synthesis code

The four methods below were run against the **actual** `tone()` / `sequence()` /
`ensure()` implementations from `audio.js` (not a reimplementation) inside a stubbed
AudioContext harness — all four execute with no errors. This is the exact code to add
to the `sfx` object in `audio.js`.

```js
  // The LAST human worker was killed by a robot — mournful, not alarming.
  // Fast (~2x speed) minor-key descent over a sustained sub-drone, closing on a
  // dissonant tritone dyad. Deliberately distinct from the dramatic klaxon-style
  // `workerLost` sting: this reads as grief, not urgency. One-shot, never throttled.
  lastWorkerDeath(){ if (!ensure()) return;
    tone({ type:"sine", freq:98, dur:0.85, gain:0.22, attack:0.08 });
    sequence([{freq:392,dur:0.2},{freq:349,dur:0.2}], { type:"bassoon", gain:0.28, gap:0.025 });
    tone({ type:"bassoon", freq:294, dur:0.4, gain:0.26, delay:0.45 });
    tone({ type:"bassoon", freq:208, dur:0.4, gain:0.18, delay:0.45 }); },  // tritone below

  // The LAST worker was rescued and NO worker was killed by a robot this level —
  // a perfect-clear celebration. Big 3-chord rising fanfare, gain-matched to sit in
  // the same loudness range as `lastWorkerSaved` below (not louder).
  allWorkersSaved(){ if (!ensure()) return;
    tone({ type:"square", freq:330, dur:0.18, gain:0.09 });
    tone({ type:"square", freq:392, dur:0.18, gain:0.08 });
    tone({ type:"triangle", freq:494, dur:0.18, gain:0.065 });
    tone({ type:"square", freq:392, dur:0.18, gain:0.095, delay:0.18 });
    tone({ type:"square", freq:494, dur:0.18, gain:0.085, delay:0.18 });
    tone({ type:"triangle", freq:587, dur:0.18, gain:0.07, delay:0.18 });
    tone({ type:"square", freq:523, dur:0.75, gain:0.13, delay:0.36 });
    tone({ type:"square", freq:659, dur:0.75, gain:0.12, delay:0.36 });
    tone({ type:"triangle", freq:784, dur:0.75, gain:0.10, delay:0.36 });
    tone({ type:"square", freq:1047, dur:0.75, gain:0.09, delay:0.36 });
    tone({ type:"triangle", freq:1319, dur:0.75, gain:0.06, delay:0.36 }); },

  // The LAST worker was rescued, but one or more workers WERE killed by a robot
  // this level — a small positive nod, not a full celebration. Same square+triangle
  // character family as `allWorkersSaved`, narrower voicing and quieter — its "little
  // sibling," clearly less than a perfect-clear fanfare.
  lastWorkerSaved(){ if (!ensure()) return;
    tone({ type:"square", freq:392, dur:0.16, gain:0.10 });
    tone({ type:"triangle", freq:494, dur:0.16, gain:0.08 });
    tone({ type:"square", freq:523, dur:0.45, gain:0.13, delay:0.17 });
    tone({ type:"triangle", freq:659, dur:0.45, gain:0.10, delay:0.17 }); },

  // The last enemy in the level is destroyed AND no spawn terminals remain —
  // triumphant, not polite: three rising sawtooth power-chord stomps, no final held
  // chord. Fires regardless of what destroyed the last enemy (mop, friendly fire,
  // Atomic Dustbin, etc) via the `level:all_enemies_dead` event.
  lastEnemyCleared(){ if (!ensure()) return;
    tone({ type:"sawtooth", freq:196, dur:0.1, gain:0.22 });
    tone({ type:"sawtooth", freq:294, dur:0.1, gain:0.16 });
    tone({ type:"sawtooth", freq:233, dur:0.1, gain:0.24, delay:0.11 });
    tone({ type:"sawtooth", freq:349, dur:0.1, gain:0.18, delay:0.11 });
    tone({ type:"sawtooth", freq:294, dur:0.16, gain:0.27, delay:0.22 });
    tone({ type:"sawtooth", freq:440, dur:0.16, gain:0.20, delay:0.22 }); },
```

`noWorkers()` (the old method these replace) should be deleted once the new methods
are wired up and confirmed working — see Phase 2.

## 7. Final `workers.js` logic

```js
export function killWorker(w){
  const i = G.workers.indexOf(w);
  if (i < 0) return;
  addFloat(w.x, w.y - 14, "WORKER LOST", COL.chargeWarn);
  G._levelWorkerKilled = true;
  if (G.workers.length === 1){
    // this IS the last worker — last-worker-death replaces any-worker-death, not both
    sfx.lastWorkerDeath();
  } else {
    sfx.workerLost();
  }
  G.workers.splice(i, 1);
  emit('worker:died', { workerIndex: w.index ?? i });
}
```

Note the `G.workers.length === 1` check (not `=== 0`): at the point this check runs,
the dying worker hasn't been spliced out of `G.workers` yet, so "this is the last
worker" means the array currently has exactly one entry (this one). The splice happens
after the sound decision, same as the original code's ordering.

```js
function rescueWorker(i){
  const w = G.workers[i], d = CFG.WORKER;
  const pts = d.rescueBase * Math.pow(2, G.rescued);
  G.score += pts;
  sfx.rescue(G.rescued);
  G.rescued++;
  addFloat(w.x, w.y - 14, "+" + pts + " SAVED", COL.atomic);
  emit('worker:rescued', { ... });   // unchanged payload
  G.workers.splice(i, 1);
  if (G.rescued === d.count) addFloat(G.dan.x, G.dan.y - 30, "ALL " + d.count + " SAVED!", COL.amber);
  if (G.workers.length === 0){
    if (G._levelWorkerKilled) sfx.lastWorkerSaved();
    else sfx.allWorkersSaved();
  }
}
```

Here the `G.workers.length === 0` check runs AFTER the splice (matching the original
code's structure) since `rescueWorker` splices before this check today. This is fine —
unlike `killWorker`, there's no ambiguity here because rescue always removes exactly
the one worker being rescued, and by this point it's already gone.

`sfx.rescue(G.rescued)` on the last rescue plays unchanged, exactly as it does today
for every non-last rescue — the spec doesn't ask to suppress it, and TODO item 7 only
says not to play `last-worker-saved` when `all-workers-saved` plays (it doesn't
mention `rescue()`). If Paul wants `rescue()` suppressed on the very last save too,
that's a one-line follow-up, not part of this spec.

## 8. Phased Claude Code prompts

See `CLAUDE-CODE-PROMPTS-worker-and-enemy-clear-sfx.md` for copy-pasteable prompts
covering:
- Phase 1: add the 4 new `sfx.*` methods to `audio.js`, remove `noWorkers()`.
- Phase 2: add `_levelWorkerKilled` to `state.js` + reset in `level.js`; rewrite
  `killWorker()`/`rescueWorker()` in `workers.js`.
- Phase 3: wire the `level:all_enemies_dead` listener in `update.js`; update the
  stale comment in `events.js`.

Each phase includes its own smoke test and manual test steps, and can be run as a
separate Claude Code session per the project's usual workflow.