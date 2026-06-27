# ACHIEVEMENTS.md
## Achievement System Specification — Atomic Dustbin Dan

Referenced by `CLAUDE.md` (code map) and `GDD.md` (design intent). Do not reproduce contents in either file; cross-reference only.

---

## System Overview

Two achievement dimensions:
- **Weekly challenges** — 5 active per ISO calendar week, same for all players globally, drawn from a rotating pool. Reset at week rollover; incomplete progress is lost until that set cycles back.
- **Lifetime achievements** — never reset, permanently accumulate across all sessions, all tiered Bronze → Silver → Gold → Platinum → Diamond.

All achievement tracking is event-driven via a shared pub/sub bus (`src/events.js`).

---

## Event System (`src/events.js`)

A minimal pub/sub module. API:
- `emit(eventName, payload)` — fire an event
- `on(eventName, handler)` — subscribe
- `off(eventName, handler)` — unsubscribe

No module other than `src/achievements.js` imports from `achievements.js`. Dependency flows one way.

### Required Emitters

| Module | Events to emit |
|---|---|
| `player.js` | `player:hit`, `player:hp_changed` (hp, maxHp), `player:moved`, `player:stood_still` (durationMs), `player:died` |
| `projectile.js` / `ebolts.js` | `bolt:fired` (kind, isTripleShotActive), `bolt:hit` (targetType, bounceCount, uniqueWallCount, simultaneousKills), `bolt:missed`, `bolt:expired` |
| `enemies.js` | `enemy:died` (type, killerKind, bounceCount, timeAliveMs), `enemy:spawned` (type, timeInLevel), `enemy:fired` (type) |
| `workers.js` | `worker:rescued` (workerIndex, timeInLevelMs, playerHP, followingDurationMs), `worker:died`, `worker:following_start`, `worker:following_tick` (durationMs) |
| `items.js` / `powerups.js` | `powerup:collected` (kind), `vending:used` |
| `dustbin.js` | `dustbin:thrown`, `dustbin:bounced` (totalWallCount, uniqueWallCount), `dustbin:detonated` (killCount) |
| `level.js` | `level:start` (enemyCount, workerCount, availableWorkerIndices), `level:end` (stats), `run:start`, `run:end` (stats), `level:all_enemies_dead` |
| `world.js` | `conveyor:push_start`, `conveyor:push_tick` |

---

## XP & Badge System

XP is awarded on weekly achievement completion and on lifetime tier unlocks. Earning a higher tier does not re-award lower tier XP. XP thresholds for display (total XP → visual rank) are **TODO** after playtesting.

### Lifetime Tier Badges

| Tier | Symbol | Unlock Condition |
|---|---|---|
| Bronze | 🥉 | Cross tier 1 threshold |
| Silver | 🥈 | Cross tier 2 threshold |
| Gold | 🥇 | Cross tier 3 threshold |
| Platinum | 🏆 | Cross tier 4 threshold |
| Diamond | 💎 | Cross tier 5 threshold |

Badge display lives in the Lifetime Achievements modal, one badge per achievement showing current tier and progress toward next.

---

## Weekly Achievement System

### Rotation Logic

- Active week set determined by: `setIndex = isoWeekNumber % totalSets`
- `isoYear` and `isoWeekNumber` computed in UTC to ensure global sync.
- Pool contains sets for 20+ weeks before repeating (100+ total weekly slots). Set assignments: **TODO** after achievement list is finalized — assign 5 per week, balancing difficulty across each week's set.

### Persistence

- Progress stored in `localStorage` under key `weekly_{isoYear}_{isoWeek}` as a JSON object keyed by achievement ID.
- On session load: compare stored week key to current ISO week. If mismatch, award XP for completed achievements, discard incomplete progress, initialize new week key.

### Title Screen Display

- 5 weekly achievement slots shown with name, description, and progress indicator where applicable (e.g., "3 of 5 workers rescued this week").
- 6th slot: **"Employee of the Week"** — "Complete all 5 weekly achievements this week." Shows `n of 5 unlocked`. Awards bonus XP if all 5 are completed in the same calendar week.

---

## Lifetime Achievement System

- Stored in `localStorage` under key `lifetime_achievements` as a JSON object: `{ [achievementId]: { tier: 0–5, progress: number } }`. Tier 0 = unearned.
- Progress increments on relevant events; tier upgrades automatically when a threshold is crossed.
- Hidden achievements stored normally but display as `???` in the UI until first earned.

---

## UI Structure

### Title Screen
- Weekly panel: 5 slots + "Employee of the Week" 6th slot, all with progress indicators.
- "View All Achievements" button → Lifetime Achievements modal.

### In-Play Notification
- Non-blocking banner (suggest: bottom-center overlay) appears when any achievement is earned or a lifetime tier is unlocked.
- Synthesized congratulatory sound via Web Audio API. No external asset.
- No game pause.

### Post-Level Modal
- Auto-shown if any weekly achievement made progress during the level.
- Lists each progressed achievement and its current state (e.g., "Hero of the Warehouse — 3 of 5 workers rescued this week").
- "View Lifetime Achievements" button → Lifetime Achievements modal.

### Lifetime Achievements Modal
- Organized by category (matching sections below).
- Each achievement: tier badge row (greyed tiers not yet earned), progress bar to next tier.
- Hidden achievements shown as `???` until first earned.
- Accessible from title screen and post-level modal.

---

## Stats Tracked (Independent of Achievements)

The following are tracked per-level and cumulative per-run, displayed on the end-of-run screen regardless of achievement state:

- **Shot accuracy** — shots fired (1 per trigger pull regardless of power-up), hits (each individual bullet connecting with enemy or dispatch terminal). Triple shot with all 3 bullets connecting = 3 hits on 1 shot fired.
- **Workers rescued** — count and which levels.
- **Enemies killed** — total and by type.
- **Damage taken** — total hits received.
- **Time per level** and total run time.

---

## Achievement Registry

Tier thresholds listed as `B / S / G / P / D` (Bronze / Silver / Gold / Platinum / Diamond) representing the count required to unlock each tier.

**W** = Weekly-eligible. **H** = Hidden until first earned.

---

### 🎯 Accuracy

**Rule:** 1 shot fired per trigger pull regardless of active power-up. Triple shot = 1 shot fired. Each individual bullet that connects with any enemy or dispatch terminal = 1 hit. A triple shot where all 3 bullets connect = 3 hits / 1 shot fired = 300% contribution. Per-level accuracy and cumulative run accuracy tracked as stats independent of achievements.

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `acc_participation` | Participation Trophy | Complete a level with ≤50% shot accuracy. | Y | N | 5/15/35/75/150 |
| `acc_spray` | Spray and Pray | Complete a level with ≤30% shot accuracy. | N | Y | 3/10/25/50/100 |
| `acc_marksman` | Marksman | Complete a level with ≥75% shot accuracy. | Y | N | 5/15/35/75/150 |
| `acc_sharpshooter` | Sharpshooter | Complete a level with ≥85% shot accuracy. | Y | N | 3/10/25/50/100 |
| `acc_surgical` | Surgical | Complete a level with ≥95% shot accuracy. | Y | N | 1/5/15/35/75 |
| `acc_one_job` | One Job | Complete a level without missing a single shot. | N | Y | 1/3/10/25/50 |
| `acc_quality` | Quality over Quantity | Kill every enemy in a level using 10 or fewer shots. | Y | N | 3/10/25/50/100 |

---

### 💥 Bounce Shot

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `bnc_bank` | Bank Shot | Kill an enemy with a bubble that bounced exactly once. | Y | N | 10/30/75/150/300 |
| `bnc_cue_ball` | Cue Ball | Kill an enemy with a bubble that bounced 3+ times. | Y | N | 5/20/50/100/200 |
| `bnc_pool_shark` | Pool Shark | Kill an enemy with a bubble that bounced 5+ times. | Y | N | 3/10/25/50/100 |
| `bnc_geometry_brain` | Geometry Brain | Kill an enemy with a shot that ricocheted 4+ times total (same wall may count twice). | Y | N | 3/10/25/50/100 |
| `bnc_geometry_teacher` | Geometry Teacher | Kill an enemy with a shot that bounced off 4+ *unique* walls. Distinct from Geometry Brain. | Y | N | 3/10/25/50/100 |
| `bnc_chain` | Chain Reaction | One bounce shot hits 4+ enemies in sequence. | Y | N | 3/10/25/50/100 |
| `bnc_long_way` | The Long Way Round | Kill an enemy with a bounce shot that travels around a corner. | Y | N | 5/15/35/75/150 |
| `bnc_final_sweep` | Final Sweep | Land the level-ending kill with a bounce shot. | Y | N | 5/15/35/75/150 |
| `bnc_wall_flower` | Wall Flower | Kill every enemy in a level using only bounce shots. | Y | N | 1/5/15/30/60 |

---

### 🧹 Survival & Damage

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `surv_spotless` | Spotless Record | Complete a level without taking any damage. | Y | N | 5/15/35/75/150 |
| `surv_teflon` | Teflon Dan | Complete 3 consecutive levels without taking any damage. | Y | N | 3/10/25/50/100 |
| `surv_skeleton` | Skeleton Crew | Complete a level with exactly 1 HP remaining. | Y | N | 3/10/25/50/100 |
| `surv_osha` | OSHA Violation | Get hit 10+ times in one level and still complete it. | N | N | 3/10/25/50/100 |
| `surv_no_stopping` | No Stopping | Complete a level without standing still for more than 1 second at any time. "Standing still" = no movement input received for 1+ continuous seconds. | Y | N | 3/10/25/50/100 |
| `surv_hot_streak` | Hot Streak | Complete 3 consecutive levels without dying. | Y | N | 1/5/15/30/60 |

---

### ⚡ Speed

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `spd_rush` | Rush Job | Complete a level in under 45 seconds. | Y | N | 5/15/35/75/150 |
| `spd_lunch` | Lunch Break | Complete a full run in under 15 minutes. | Y | N | 3/10/25/50/100 |

---

### 💣 Atomic Dustbin

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `dust_option` | Atomic Option | Kill 3+ enemies simultaneously with the Atomic Dustbin detonation. | Y | N | 3/10/25/50/100 |
| `dust_reserve` | Strategic Reserve | Complete a level without throwing the Atomic Dustbin. | Y | N | 5/15/35/75/150 |
| `dust_disgruntled` | Disgruntled Employee | Bounce the Atomic Dustbin off 3+ walls before detonation. | N | Y | 3/10/25/50/100 |
| `dust_env_hazard` | Environmental Hazard | Kill a Manager Bot with the Atomic Dustbin. | Y | N | 3/10/25/50/100 |
| `dust_heavy_hitter` | Heavy Hitter | Throw the Atomic Dustbin N times (cumulative lifetime). | N | N | 50/150/350/750/1500 |

---

### 👷 Worker Rescue

"Available but not rescued" = worker was present in the level when Dan exited without rescuing them.

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `wrk_first_responder` | First Responder | Rescue a worker within 30 seconds of level start. | Y | N | 5/15/35/75/150 |
| `wrk_hero` | Hero of the Warehouse | Rescue all 5 workers in a single level. | Y | N | 5/15/35/75/150 |
| `wrk_nick` | In the Nick of Time | Rescue a worker while at half health or less. | Y | N | 5/15/35/75/150 |
| `wrk_danger_pay` | Danger Pay | Rescue a worker while at exactly 1 HP. | Y | N | 3/10/25/50/100 |
| `wrk_shop_steward` | Shop Steward | Rescue all 5 workers across every authored level in one run. | Y | N | 1/5/15/30/60 |
| `wrk_union_rep` | Union Rep | Rescue N workers total (cumulative lifetime). Subsumes Solidarity Forever. | N | N | 25/100/250/500/1000 |
| `wrk_last_man` | Last Man Standing | Rescue ≥1 worker on a level where all other available workers were not rescued. | Y | N | 3/10/25/50/100 |
| `wrk_attendance` | Perfect Attendance | End a full run with every available worker rescued. | Y | N | 1/5/15/30/60 |
| `wrk_zero_hour` | Zero Hour | Rescue all 5 workers AND complete the level without taking any damage. | Y | N | 1/5/15/30/60 |
| `wrk_escort` | Escort Duty | Have a worker actively following you for 5+ consecutive seconds; worker must either be rescued or still alive when Dan exits the level. | Y | N | 5/15/35/75/150 |
| `wrk_tag_team` | Tag Team | Kill an enemy within 2 seconds of rescuing a worker. | Y | N | 5/15/35/75/150 |
| `wrk_pacifist` | Pacifist Escort | Rescue all 5 workers in a level without killing any enemy. Atomic Dustbin kills void this; conveyor-caused deaths do not. | Y | Y | 1/3/10/25/50 |
| `wrk_nobody` | Nobody Left Behind | Complete a full run rescuing every available worker on every level. | Y | N | 1/3/10/25/50 |
| `wrk_unionized` | Unionized | Rescue at least 1 worker on every level of a full run. | Y | N | 3/10/25/50/100 |
| `wrk_understaffed` | Understaffed | Complete 5 consecutive levels without rescuing any workers. | N | Y | 1/3/10/25/50 |

---

### 🤖 Combat & Enemy-Specific

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `cmb_cleaning_spree` | Cleaning Spree | Kill 5 enemies within 10 seconds. | Y | N | 10/30/75/150/300 |
| `cmb_downsizing` | Downsizing | Kill 10 enemies within 10 seconds. | Y | N | 3/10/25/50/100 |
| `cmb_zero_waste` | Zero Waste | Kill every enemy in a level. | Y | N | 5/15/35/75/150 |
| `cmb_product_recall` | Product Recall | Destroy at least one of every enemy type in a single run. | Y | N | 3/10/25/50/100 |
| `cmb_grounded` | Grounded | Destroy a Drone before it fires at you. | Y | N | 5/20/50/100/200 |
| `cmb_confrontational` | Confrontational | Kill a Security Bot head-on without sidestepping. *Suggested definition: player and bot on converging axis, no lateral movement input from player in the 0.5s before kill. Confirm during architecting.* | Y | N | 5/20/50/100/200 |
| `cmb_above_pay_grade` | Above My Pay Grade | Survive a Manager Bot encounter without being hit once. | Y | N | 5/15/35/75/150 |
| `cmb_early_retirement` | Early Retirement | Kill a Manager Bot before it summons reinforcements. | Y | N | 5/15/35/75/150 |
| `cmb_overtime_denied` | Overtime Denied | Kill a Manager Bot within 10 seconds of it appearing. | Y | N | 5/15/35/75/150 |
| `cmb_whistleblower` | Whistleblower | Destroy N Security Bots (cumulative lifetime). | N | N | 10/50/150/300/600 |
| `cmb_deep_clean` | Deep Clean | Kill 3 Cleaner Bots within 5 seconds. | Y | N | 3/10/25/50/100 |
| `cmb_middle_mgmt` | Middle Management | Kill N Manager Bots (cumulative lifetime). Subsumes Corporate Restructuring. | N | N | 1/5/15/30/60 |
| `cmb_pest_control` | Pest Control | Destroy N Drones (cumulative lifetime). | N | N | 10/50/150/300/600 |
| `cmb_blue_collar` | Blue Collar | Kill N Picker Bots (cumulative lifetime). | N | N | 50/200/500/1000/2500 |
| `cmb_decommissioned` | Decommissioned | Kill N robots total (cumulative lifetime). Subsumes Mass Recall. | N | N | 500/2000/5000/10000/25000 |
| `cmb_foam_party` | Foam Party | Fire N bubbles total (cumulative lifetime). Subsumes Bubble Tea (Bronze=500) and Bubble Economy (≈Gold). | N | N | 500/2000/7500/20000/50000 |
| `cmb_recall_notice` | Recall Notice | Be targeted by a homing bolt and cause it to hit a wall or enemy instead of you. | Y | N | 5/20/50/100/200 |
| `cmb_blind_shot` | Blind Shot | Kill an enemy with a ricochet without having LOS to that enemy at the moment of firing. *Flag for architecting: requires LOS raycast at fire time.* | Y | N | 3/10/25/50/100 |

---

### 🏭 Conveyor Belt

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `conv_flow` | Going with the Flow | Kill an enemy while being pushed by a conveyor. | Y | N | 5/20/50/100/200 |
| `conv_wrong_aisle` | Wrong Aisle | Get pushed off course by a conveyor and still kill your target. *Suggested definition: conveyor is actively pushing Dan at time of kill, and Dan's facing direction differs from push direction. Confirm during architecting.* | Y | N | 3/10/25/50/100 |

---

### 🛠️ Power-Ups & Items

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `itm_off_clock` | Off the Clock | Complete a level without picking up any power-ups. | Y | N | 5/15/35/75/150 |
| `itm_min_wage` | Minimum Wage Warrior | Complete a full run without picking up any power-ups. | Y | N | 3/10/25/50/100 |
| `itm_calories` | Watching My Calories | Complete a level without using a vending machine. | Y | N | 5/15/35/75/150 |
| `itm_no_refills` | No Refills | Complete a full run without using any vending machines. | Y | N | 3/10/25/50/100 |
| `itm_cost_cutting` | Cost Cutting | Complete a level without picking up any power-ups AND without using any vending machines. | Y | N | 3/10/25/50/100 |

---

### 📈 Score

All score thresholds are **TODO** — calibrate after playtesting. These achievements exist in the registry as stubs; thresholds must be filled before they can be activated.

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `scr_bonus` | Performance Bonus | Score more than [TODO] points in a single level. | Y | N | 5/15/35/75/150 |
| `scr_quarterly` | Quarterly Targets | Reach [TODO] points by the end of level 2. | Y | N | 5/15/35/75/150 |
| `scr_annual` | Annual Review | Score more than [TODO] points across an entire run. | Y | N | 3/10/25/50/100 |

---

### 📅 Progression

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `prg_temp` | The Temp | Complete N levels total (cumulative). Subsumes Permanent Staff, Shift Supervisor, Punch Card. | N | N | 1/10/25/50/100 |
| `prg_director` | Regional Director | Complete N full runs (cumulative). Subsumes Frequent Flyer. | N | N | 1/5/15/30/60 |
| `prg_ceo` | CEO | Complete a full run on the highest difficulty without continuing. *Flag: requires difficulty system. Stub only until difficulty system is designed.* | N | N | 1/3/10/25/50 |
| `prg_spring` | Spring Cleaning | Complete all authored levels in one sitting. | Y | N | 1/5/15/30/60 |
| `prg_manual` | Read the Manual | Complete a full level using gamepad controls. | N | N | 1/3/10/25/50 |

---

### 📅 Weekly Meta

| ID | Name | Description | W | H | Notes |
|---|---|---|---|---|---|
| `meta_eotw` | Employee of the Week | Complete all 5 weekly achievements in a single calendar week. Shown as the 6th slot on the title screen with `n of 5` progress. Awards bonus XP. | Bonus | N | Not counted among the 5 weekly slots. |
| `meta_consecutive` | Consecutive Weeks | Earn Employee of the Week two calendar weeks in a row. | N | Y | One-time hidden unlock. No further tiers. |
| `meta_model` | Model Employee | Earn Employee of the Week N times total (cumulative lifetime). | N | N | 1/5/10/25/52 |

---

### 🎭 Secret / Hidden / Joke

| ID | Name | Description | W | H | Thresholds B/S/G/P/D |
|---|---|---|---|---|---|
| `sec_dead_end` | Dead End Job | Die on level 1. | N | Y | 1/5/15/30/60 |
| `sec_pink_slip` | Pink Slip | Your very first game ever ends in a death on level 1. One-time only; no further tiers. | N | Y | 1 |
| `sec_graveyard` | Graveyard Shift | Play between midnight and 4:00 AM (local system time). | N | Y | 1/5/15/30/60 |
| `sec_clock_watcher` | Clock Watcher | Play between 5:00 PM and 5:15 PM on a weekday (M–F). | N | Y | 1/5/15/30/60 |
| `sec_monday` | Monday Morning | Play between 8:00 AM and 9:00 AM on a Monday. | N | Y | 1/5/15/30/60 |
| `sec_mandatory_ot` | Mandatory Overtime | Accumulate 2+ hours of continuous play time in a single session. | N | Y | 1/3/10/25/50 |
| `sec_phantom` | Phantom Paycheck | Stand completely still for 10 seconds during an active level. | N | Y | 1/5/15/30/60 |
| `sec_wrongful` | Wrongful Termination | Die in the same level in which you earned an achievement that session. | N | Y | 1/5/15/30/60 |

---

## Consolidation Map

The following named achievements from earlier brainstorm sessions are retired as standalone entries. Their milestone moments are preserved inside the tier thresholds of the listed parent:

| Retired Name | Absorbed Into | Tier That Matches |
|---|---|---|
| Solidarity Forever (100 workers) | Union Rep | Silver (100) |
| Bubble Tea (500th bubble) | Foam Party | Bronze (500) |
| Bubble Economy (10,000th bubble) | Foam Party | ~Gold (7,500) |
| Permanent Staff (10 levels) | The Temp | Silver (10) |
| Shift Supervisor (25 levels) | The Temp | Gold (25) |
| Punch Card (30 levels) | The Temp | ~Gold |
| Frequent Flyer (3 runs) | Regional Director | Silver (5) |
| Corporate Restructuring (5 Manager Bots) | Middle Management | Silver (5) |
| Mass Recall (2,000 robots) | Decommissioned | Silver (2,000) |

---

## Flags for Architecting Session

The following items need explicit discussion before Claude Code implementation:

- **CEO** — requires a difficulty system that does not yet exist. Implement as a stub; activate when difficulty is designed.
- **Blind Shot** — requires a LOS raycast at the moment of firing. Discuss implementation cost vs. value; may cut if too expensive.
- **Confrontational** — "head-on, no sidestepping" needs a precise coded definition. Suggested: converging axis + no lateral input in 0.5s window. Confirm before implementation.
- **Wrong Aisle** — "shoved off course" needs a precise coded definition. Suggested: conveyor active at moment of kill + Dan's aim direction differs from conveyor push direction. Confirm before implementation.
- **No Stopping** — "standing still" = zero movement input for 1+ continuous seconds. Confirm this is the right signal vs. zero velocity.
- **Geometry Brain vs. Geometry Teacher** — confirm whether to keep both or consolidate. They differ only when the same wall is hit twice (Brain counts it; Teacher does not).
- **Score achievements** — all thresholds TODO. Stubs in registry; do not activate until thresholds are set post-playtesting.
- **The Scenic Route** — not in this achievement system. See GDD.md §[Future Optional Features] for possible later addition.