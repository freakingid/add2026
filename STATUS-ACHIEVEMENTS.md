---

## Achievement system (Phase 6 complete)

See **`ACHIEVEMENTS.md`** for the full specification and **`ACHIEVEMENT-BLUEPRINT.md`** for the implementation plan.

**Files created:**
- `src/events.js` — synchronous pub/sub bus (zero imports; leaf node)
- `src/achievements.js` — subscriber module; module-local state only

**Files modified (Phase 1 emitters):**
- `src/player.js` — `bolt:fired` emit in `fireVolley()`
- `src/level.js` — `initAchievements()` call in `newGame()`
- `src/render.js` — `drawAchievementBanner()` pull from `popAchievementBanner()`

**Phase 1 decisions:**

- **Synchronous pub/sub over a frame-drained queue.** Handlers run immediately at the emit call site (same pattern as `sfx.*` audio calls). Achievement handlers are read-only relative to `G` — they write only module-local tracking state — so mid-frame execution has no observable side effects on the sim. A queued bus would add a drain step in `update.js` for no benefit at this scale.

- **`popAchievementBanner()` pull architecture.** `achievements.js` pushes to a module-local `_bannerQueue`; `render.js` pulls one entry per frame via `popAchievementBanner()`. This keeps the dependency arrow correct: render pulls from achievements; achievements never call into render. Multiple unlocks in quick succession queue and display sequentially (2.5 s each). Module-level `_currentBanner` state in `render.js` holds the active banner across frames; a new pop only happens when the current banner expires or the queue was empty.

- **Module-local state, not on `G`.** All achievement tracking counters live as `let` variables in `achievements.js`. `G` is the game sim state; achievement bookkeeping is a separate concern (per CLAUDE.md non-negotiable: no `G` entries for achievement state). `initAchievements()` resets module-local state on each new game; named handler references allow `off()`/`on()` deduplication across `newGame()` calls.

- **`localStorage` keys:** `add_weekly_{isoYear}_{isoWeek}`, `add_lifetime`, `add_xp`, `add_eotw_streak` (all prefixed `add_` to namespace the game's storage).

**Phase 2 decisions:**

- **All emitters wired (Blueprint Task 5).** Every module now imports `emit` from `events.js` and fires events at the specified call sites: `combat.js` (`player:hit`, `player:hp_changed`, `player:died`, `enemy:died` with full payload); `player.js` (`bolt:fired` already Phase 1, plus `player:stood_still`, `conveyor:push_start/tick`, `bolt:hit`, `bolt:missed/expired`, shot-object fields `bounceCount`/`wallsHit`/`danPosAtFire`); `enemies.js` (`enemy:spawned`, `enemy:fired` at all four fire branches); `workers.js` (`worker:following_start/tick`, `worker:rescued`, `worker:died`); `level.js` (`run:start`, `level:start`, `level:end`, `powerup:collected`); `vending.js` (`vending:used`); `dustbin.js` (`dustbin:thrown`, `dustbin:bounced`, `dustbin:detonated`); `update.js` (`level:all_enemies_dead`, `run:end`); `input.js` (`run:input_mode_set`).

- **`enemy:died` opts extended.** `killEnemy(index, opts)` now accepts `killerKind`, `bounceCount`, `uniqueWallCount`, `hadLOSAtFire`, `timeAliveMs` in the opts object. Call sites that pass nothing use defaults (`killerKind:'mop'`, zero counts, `hadLOSAtFire:true`). `updateShots` in `player.js` passes the shot's accumulated fields at hit time; `dustbin.js` passes `killerKind:'dustbin'`. The `score:false` friendly-fire path continues to work unchanged.

- **Shot-object tracking fields.** `fireBubble` now initialises `bounceCount:0`, `wallsHit:null` (lazy Set), `danPosAtFire:{x,y}`, and `spawnTime` on every shot. `updateShots` increments `bounceCount` and adds to `wallsHit` at each wall bounce (per-axis and corner cases). `hadLOSAtFire` is computed at hit time via `hasLineOfSight(shot.danPosAtFire, enemy)` (one raycast at hit, not at fire — zero extra cost at fire time). Worker `index` (stable within level) and `_following`/`_followingMs` fields added to worker objects at spawn in `runSpawnRule`.

- **`level:all_enemies_dead` guard.** `update.js` checks `G.terminals.length === 0 && G.enemies.length === 0` once per frame and uses `G._allEnemiesDeadEmitted` (reset in `loadLevel`, set by the update check) to ensure the event fires exactly once per level. Terminals splice on destroy, so the empty array is the reliable "all terminals gone" signal.

- **localStorage schema wired.** `achievements.js` maintains: `add_lifetime` (per-achievement `{tier,progress}` map), `add_weekly_meta` (sentinel `{key}` for rollover detection), `add_weekly_{YYYY_WW}` (per-achievement `{unlocked,progress}` for current week). On `initAchievements()`, if the stored week key differs from `isoWeekKey()`, the old weekly key is left as a tombstone (no cleanup) and fresh weekly state is initialized — incomplete weekly progress does NOT carry over to the new week (by design). Same-week re-init loads existing data unchanged.

- **`G._levelStartTime` / `G._runStartTime` / `G._allEnemiesDeadEmitted`.** Three new tracking fields added to `G` in `state.js`. These are set by game lifecycle code (`level.js`, `update.js`), not by `achievements.js`, so they aren't achievement-module state on `G` — they're timing primitives used by emitter call sites. `achievements.js` never writes to `G`.

- **80/80 headless tests pass (Phase 2), 149/149 (Phase 3), 211/211 (Phase 4), 219/219 (Phase 5)** (`node test-achievements.js`). Phase 2: 22 sections covering pub/sub correctness, isoWeekKey format, init round-trip, cmb_foam_party Bronze trigger and cross-session persistence, all payload shapes, week rollover discard, parallel lifetime counters, and banner queue behaviour. Phase 3: 8 additional sections (23–30) covering Progression, Survival, Speed, Worker Rescue, Atomic Dustbin, Power-Ups & Items, Score stubs, and Combat. Phase 4: 6 additional sections (31–36) covering bounce-shot thresholds, final-sweep/wall-flower, accuracy at level:end, the Confrontational cross-product math (unit-tested directly), Blind Shot / Wrong Aisle, and Recall Notice. Phase 5: Section 37 covers `getWeeklyAchievements()` shape (6 entries, EOTW meta slot, well-formedness, fresh-week zeros, and reflecting a completed accuracy weekly).

**Phase 3 decisions:**

- **REGISTRY table in achievements.js.** Every achievement is now declared in a module-local `REGISTRY` object `{ name, tiers[], weekly, stub? }`. `_inc(id)` and `_weeklyInc(id)` consult this table; stubs short-circuit immediately without touching progress or banners. This avoids duplicating ID strings across scattered if-chains and makes tier thresholds easy to audit against ACHIEVEMENTS.md.

- **Generic `_checkTiers` + `_inc` helpers.** A single `_checkTiers(id)` walks from the current tier to the new one and pushes banners for each promoted tier in sequence. `_inc(id, amount)` calls `_incLifetime` then `_checkTiers` — one call site per achievement per handler. Per-type lifetime counters (cmb_whistleblower / cmb_blue_collar / cmb_pest_control / cmb_middle_mgmt) all flow through the same helper.

- **cmb_grounded / cmb_early_retirement use spawned+fired+died triplet.** `enemy:spawned` sets a per-session flag; `enemy:fired` clears it (grounded) or clears a kill-before-fire flag (early_retirement); `enemy:died` reads the flags. This avoids storing instance IDs — there's at most one active tracking slot per type per level (the last spawned). Works correctly for the single-enemy-type-per-level constraint; safe for "mixed" since each type still has its own flag.

- **surv_skeleton reads `_session.levelEndHp` set by player:hp_changed.** The level:end payload doesn't carry HP; the last `player:hp_changed` before level:end is taken as Dan's HP at the moment of exit. This is accurate because HP only changes at damage/heal events.

- **wrk_nick threshold = 10 HP (half of maxHp 20).** The `worker:rescued` payload carries `playerHP` but not `maxHp`. Blueprint says "≤ half health" — we use the fixed threshold ≤10 since maxHp is always 20 in the current game. If maxHp ever becomes variable, the `player:hp_changed` payload (which carries `maxHp`) can be used to maintain a `_session.danMaxHp` field.

- **Score stubs registered but short-circuit.** `scr_bonus`, `scr_quarterly`, `scr_annual` exist in REGISTRY with `stub:true` and `tiers:null`. `_inc` and `_weeklyInc` check `reg.stub` before doing anything. No progress is ever stored; no banner is ever pushed. They will remain stubs until playtesting calibrates the thresholds.

- **`prg_ceo` registered as stub** (`stub:true, stubReason:'requires difficulty system'`). No activation path until the difficulty system is designed.

- **Phase 2 counter IDs preserved for localStorage compatibility.** `wrk_total_rescued`, `pwr_stocked`, `pwr_vending_total` are still tracked alongside their Phase 3 canonical equivalents (`wrk_union_rep` etc.) so stored progress from Phase 2 sessions isn't lost. These compat entries appear in REGISTRY with dummy names prefixed `_compat_`.

- **`dust_disgruntled` implemented in Phase 3 (not Phase 4)** because it only needs `dustbin:bounced.totalWallCount` — no per-shot state. The blueprint listed it under Phase 4, but it fits Phase 3's "no per-shot tracking" constraint. Handled in `_onDustbinBounced`.

- **`cmb_cleaning_spree` / `cmb_downsizing` use a sliding time window.** `_session.recentKillTimes` is an array of `Date.now()` timestamps, filtered on each kill to the last 10 seconds. If ≥10 kills, Downsizing fires; else if ≥5, Cleaning Spree fires. Both can fire on the same kill. Same pattern for `cmb_deep_clean` (cleaner-specific, 5s window, 3 kills).

**Phase 4 decisions:**

- **Bounce + complex-positional kills read an enriched `enemy:died` payload — `achievements.js` still imports only `events.js`.** Phase 4 conditions need Dan's positional/movement state at kill time (move-history for Confrontational, belt vector + aim for Wrong Aisle, bot position for the converging-axis math). Rather than break the one-way dependency (achievements → events only), `killEnemy` in `combat.js` snapshots that state into the `enemy:died` payload: `pos` (bot), `danPos`, `danMoveHistory` (the live ring buffer), `danOnBelt`, `danAimAngle`, `beltPush` (from `pushAtWorld`). `combat.js` already imports `G` and now `world.pushAtWorld`. (Alt: have `achievements.js` reach into `G.dan` directly per the blueprint's literal text — rejected; it would reverse the dependency invariant kept since Phase 1.)

- **`G.dan.moveHistory` ring buffer + `G.dan.lastAimAngle`, maintained in `player.js`.** `updateDan` pushes one `{dx,dy,t}` per frame from `getMoveVec()` (intent, not velocity — per blueprint Task 2 / `surv_no_stopping` rationale) and trims to the last 500 ms by timestamp; `lastAimAngle` snapshots `G.dan.angle` each frame. Both are added to Dan's init in `level.js`. These are timing/input primitives owned by game code (like `stillInputMs`/`_prevOnBelt`), not achievement state on `G`.

- **Confrontational = pure cross-product check, exported + unit-tested.** `noLateralMovement(history, danPos, botPos, threshold=0.1)` computes the Dan→bot unit vector and fails if ANY history entry's lateral magnitude `|dx·uy − dy·ux|` exceeds the threshold; zero-input and zero-distance entries pass (degenerate = head-on). Exported from `achievements.js` so the math is tested directly (Section 34) independent of the event plumbing. Only Security kills are evaluated.

- **Wrong Aisle = `aimFightsBelt(aimAngle, beltPush, threshold=π/4)`, also exported/unit-tested.** Returns false when the belt isn't pushing; otherwise true when the aim heading differs from `atan2(beltPush.dy,beltPush.dx)` by more than 45° (the blueprint's tightened threshold — 90° would count diagonals as "with the flow"). Gated on `danOnBelt` at kill time.

- **Blind Shot uses the existing `hadLOSAtFire` payload field.** `player.js` already computes `hasLineOfSight(shot.danPosAtFire, enemy)` at hit time (Phase 2). The handler fires `cmb_blind_shot` only when `isBounceKill && hadLOSAtFire === false` — a ricochet that killed a target Dan couldn't see when he pulled the trigger.

- **Bounce thresholds split Brain vs Teacher on the same payload.** `bnc_geometry_brain` reads `bounceCount` (4+ total, walls may repeat); `bnc_geometry_teacher` reads `uniqueWallCount` (4+ distinct walls, from `shot.wallsHit.size`). `bnc_long_way` ("around a corner") = `uniqueWallCount >= 2` on a bounce kill. `bnc_bank` is `bounceCount === 1` exactly; `cue_ball`/`pool_shark` are `>=3`/`>=5`.

- **`bnc_final_sweep` checks `_session.lastKillWasBounce` at `level:all_enemies_dead`.** Every `enemy:died` records whether that kill was a bounce; the all-enemies-dead handler reads the most-recent flag. `bnc_wall_flower` tracks `levelNonBounceKill` (set by any non-bounce kill) + `levelAnyKill`, and at `level:end` awards only if there was ≥1 kill and none were non-bounce.

- **`bnc_chain` wired but dormant (no pierce mechanic).** `shot.chainCount` is added in `player.js` and incremented on each enemy hit, but soap shots are consumed on first contact, so `chainCount` never exceeds 1 — the handler (`>=4`) can't fire in current gameplay. Wired per the Phase 4 spec rather than stubbed (per design decision) so it activates automatically if a pierce mechanic is ever added; a test asserts it fires when the payload carries `chainCount >= 4`. (Alt: make bounce shots pierce enemies — rejected; that changes the Bounce power-up's feel and the max-shots non-negotiable.)

- **Accuracy is evaluated once at `level:end` from `levelShotsFired` vs `levelBoltHits`.** `bolt:fired` increments fired (one per trigger); `bolt:hit` increments hits (one per connecting bullet, so a Triple can give 3 hits / 1 fired → accuracy can exceed 1.0). `acc_one_job` ("no missed shots") = `hits >= fired`; `acc_quality` = `fired <= 10 && levelAllEnemiesDeadReached`. No award when zero shots were fired.

- **Recall Notice via a new `bolt:homing_redirected` event from `projectiles.js`.** Homing missiles get `targetedDan:true` at creation (they always acquire Dan). `updateHoming` emits `bolt:homing_redirected` when a Dan-targeting missile detonates on a wall or runs into a ground robot (i.e. anything but Dan); range-expiry and Dan-hits do not emit. The handler increments `cmb_recall_notice`. (`projectiles.js` now imports `emit` — it was the one emitter module the blueprint left off the Phase 2 wiring.)

**Phase 5 decisions (UI — weekly panel + full banner):**

- **`getWeeklyAchievements()` returns a fixed 6-entry array — placeholder active set.** The 5 active weekly slots + the `meta_eotw` slot. The active set is meant to be selected by `setIndex = isoWeekNumber % totalSets`, but the per-set rotation table isn't authored yet, so `_activeWeeklyIds()` returns the first 5 weekly-eligible, non-stub, non-`_compat` achievements from `REGISTRY` for every week (clearly commented as the single body to replace once the rotation exists; `_isoWeekNumber()` is already computed for forward-compat). Each entry is `{ id, name, description, progress, target, unlocked }`. The accuracy-set placeholders (`acc_participation/marksman/sharpshooter/surgical/quality`) gained `desc:` fields in `REGISTRY` so the panel shows real one-liners; all other entries fall back to `''`.

- **Panel `unlocked` is derived (`progress >= 1 || stored.unlocked`).** Accumulating weeklies use `_weeklyInc` (bumps `progress`) and never flip the stored `unlocked` flag, which is only set by the one-shot `_weeklyUnlock` path. Per the blueprint's "completed at least once this week" semantics, the panel treats either signal as completion. `meta_eotw.progress` = count of active weeklies with `unlocked` true; its `target` = number of active weeklies (5).

- **Weekly panel = right-side column in `drawTitle()` (`screens.js`).** Drawn at `(VIEW_W-300, 64)` as a 6-row × ~28px list; it clears the centered title/options (centered at `VIEW_W/2`) and the lower-left fire legend. Name in white (dimmed grey when complete), description in small grey, progress right-aligned: a gold `✔` when complete, else `n / target` (when target>1) or `☐`. The EOTW meta row is amber with a divider above it. A `▸ VIEW ALL ACHIEVEMENTS` soap-colored text button sits below the list — **visual placeholder only**; interaction lands in Phase 6. `screens.js` now imports `getWeeklyAchievements` from `achievements.js` (one-way: render reads achievements).

- **Full in-play banner in `render.js`.** Bottom-center semi-transparent dark rounded rect; top line = achievement name (bold white), bottom line = subtext supplied by `achievements.js` at push time (`"Bronze unlocked"` for lifetime tiers, `"Weekly progress"` for weekly). 2500 ms display; the queue drains one at a time, with a new `popAchievementBanner()` only after the current banner expires or none is active (`_currentBanner`/`_bannerReceivedAt` module-locals in `render.js`).

- **`sfx.achievement()` (audio.js, 18th SFX) wired at the push site.** A short ascending two-tone square blip (784→1175 Hz), deliberately distinct from the triangle `rescue` up-blip. `achievements.js` imports `sfx` from `audio.js` and calls `sfx.achievement()` inside `_pushBanner` — the same one-way achievements→audio direct-call pattern every other module uses; the pub/sub bus is for tracking events only, not audio. (audio.js stays a leaf; importing it into achievements.js does not create a cycle. Headless tests shim `globalThis.window = {}` so `ensure()` safely no-ops.)

**Phase 6 decisions (UI — post-level modal + lifetime modal):**

- **`level:end` now fires on ENTERING `levelclear`, not in `nextLevel()`.** The post-level modal must read `getLevelAchievementSummary()` during the levelclear splash, but the level-end achievement conditions (accuracy, no-damage, speed, etc.) are computed inside the `level:end` handler. Previously that emit lived in `nextLevel()`, which runs only *after* the splash. `update.js` now emits `level:end` exactly once on the first levelclear frame (guarded by `G._levelEndEmitted`, re-armed in `loadLevel`), then checks the summary; `nextLevel()` no longer emits. Payload is unchanged (`levelTime`/`workersRescued`/`levelNumber`). (Alt: leave the emit in `nextLevel` and compute the summary speculatively — rejected; it would double-compute and risk drift from the real handler.)

- **Per-level progress log drives the post-level summary.** `_levelProgressLog` (module-local, keyed by id) is appended by `_inc`, `_checkTiers` (tier crossings), and `_weeklyUnlock`; cleared on `level:start` and in `initAchievements`. `getLevelAchievementSummary()` returns it as `{id,name,description,progress,target,isNew}` with NEW! entries (freshly promoted tiers / newly-unlocked weeklies) sorted first. Lifetime-only counters incremented via `_incLifetime` directly (foam_party, compat counters) appear only when they cross a tier (logged by `_checkTiers`), keeping the modal focused on meaningful per-level progress. Empty log → `update.js` skips the modal and the normal splash auto-advances.

- **Post-level modal gates the advance.** While `G._showAchievementModal` (or `G._showLifetimeModal`) is set, the levelclear block in `update.js` returns early without decrementing `G.transition`, so the splash never auto-advances. Continue calls `nextLevel()` directly. `target` shown per row is the next-tier threshold (the Diamond threshold once maxed).

- **`getLifetimeAchievements()` returns the grouped registry; raw map split out as `getLifetimeRaw()`.** The grouped form is `[{emoji,name,achievements:[{id,name,description,tier,progress,tiers,nextTarget,hidden}]}]`, ordered by `CATEGORIES` (ACHIEVEMENTS.md order, derived from id prefix). Stubs and `_compat_*` entries are excluded. Hidden achievements (`hidden:true` added to `acc_spray`/`acc_one_job`/`dust_disgruntled`/`wrk_understaffed`) at `tier === 0` are masked to `{id:'???',name:'???',description:'???'}` — "earned" = Bronze crossed (`tier >= 1`), so progress below the first threshold stays masked. The pre-existing headless tests inspected the old raw-map shape, so all `getLifetimeAchievements()[id]` test usages were migrated to `getLifetimeRaw()[id]`; the grouped function is tested by name in Section 38.

- **Modal input via `pollModals(dt)` (input.js), polled from `update.js` before state branching.** Device-agnostic per `G.inputMode`: keyboard SPACE/ENTER = Continue, V = View All, ESC/BACKSPACE = Back, ↑/↓ (or W/S) = scroll; gamepad BTN_START = Continue, BTN_VIEW (X, idx 2) = View All, BTN_BACK (B, idx 1) = Back, left-stick Y = scroll. On the **title** `G.inputMode` is still `null` (no run locked), so View All accepts either device there without locking the run's mode — the only deliberate exception to the device-agnostic routing, justified because opening a menu must not commit the player to a controller. New `CFG.GAMEPAD.BTN_BACK`/`BTN_VIEW`. Edge detection is per-frame held-state diffing (uniform across both devices), matching the existing `pollGamepad` `prevStart` pattern. The keydown/gamepad/mouse run-start paths are guarded so a lifetime modal over the title swallows the start input.

- **Lifetime modal = scrollable scissor-clipped overlay (`drawLifetimeModal`, screens.js), drawn last in `render()`** so it overlays the title and the post-level modal. Category headers (emoji + name), per-achievement 5-badge tier row (🥉🥈🥇🏆💎, greyed below earned tier via `globalAlpha`), a progress bar toward `nextTarget`, and a short description. Content height is measured during draw and written to `G._lifetimeMaxScroll` for `pollModals` to clamp `G._lifetimeScrollY` against next frame. `_lifetimeModalFrom` ('title' | 'postlevel') records the opener so Back returns to the right surface. The Phase 5 title "View All Achievements" placeholder is now live (`[V]` hint added).

- **Modal state lives on `G` (`_showAchievementModal`, `_showLifetimeModal`, `_lifetimeModalFrom`, `_lifetimeScrollY`, `_lifetimeMaxScroll`, `_levelEndEmitted`).** These are render/input flags read by `update.js`/`screens.js`/`input.js` and set by game lifecycle code — NOT achievement-tracking state, which stays module-local in `achievements.js` (per the Phase 1 non-negotiable). The blueprint UI spec names `G._showAchievementModal`/`G._lifetimeScrollY` explicitly; the rest follow the same convention as `G._allEnemiesDeadEmitted`.

- **233/233 headless tests pass** (`node test-achievements.js`). Section 38 adds 17 checks: empty-then-populated summary, summary well-formedness + isNew flagging + NEW!-first ordering + per-level reset, grouped lifetime shape + ordering (Accuracy first), hidden-masking (`???`) and unmask-on-Bronze, and stub/compat exclusion.
