# Atomic Dustbin Dan — Game Design Document v2.0

Canonical design intent. This is "what the game should be." For what is actually
built and the decisions made along the way, see STATUS.md (and the STATUS-* split
files); for the cross-cutting rules, see CLAUDE.md. Section numbers here are stable —
STATUS.md references them.

**v2.0 note.** This revision folds in every design-affecting change made since v1.0:
the achievement system, the pause / save-load / options surface, the level-progression
overhaul (random map pool + playlist modes), the camera / screen-feedback effects, the
music system, and per-enemy corrections (notably the Manager's now-permanent berserk).
To keep existing section numbers stable for STATUS.md, newly-built systems that did not
exist in v1.0 are appended as §12–§14 rather than inserted; deferred ideas remain in
§11.

### Build status index

- **Built:** §2 Player (incl. §2.5 Vending Machines), §3 Power-ups, §4 Controls (full — keyboard+mouse and gamepad; device-agnostic `input.js`; plus §4.9 pause / options / controls surface), §5 Atomic Dustbin special, §6 Enemies (full roster: all 9 types + Dispatch Terminal + `"mixed"` sandbox — see `GDD-ENEMIES.md`), §7 Human workers + rescue scoring + Inventory Bot worker-hunting, §8.1 Level Definition format + loader + five hand-authored levels + conveyor push mechanic, §8.2 level-end, §8.3 progression + random map pool, §8.4 game modes + playlists, §10 audio (SFX + conveyor hum + music: title track + 5 gameplay tracks), §12 Save/Load + session persistence, §13 Achievements (weekly + lifetime; see `ACHIEVEMENTS.md`), §14 Camera & screen effects.
- **Designed, NOT yet built:** §10 sprite-art polish.

---

## 1. OVERVIEW

- **Title:** Atomic Dustbin Dan
- **Genre:** Top-down twin-stick arcade shooter
- **Platform:** Browser (HTML5 Canvas + JavaScript)
- **Perspective:** Top-down, tile-based
- **Player Count:** Single player
- **Win Condition:** None (endless levels)
- **Level End Conditions:** Two possible — see §8.2
- **Game Modes:** Level Plan or Hand-Authored Playlist, chosen at the title — see §8.4
- **Continuity:** A run can be saved to one of five slots and resumed later — see §12

---

## 2. PLAYER CHARACTER

**Name:** Dan (lead warehouse janitor). **Premise:** Dan noticed the warehouse robots
malfunctioning and attacking human workers. Armed with his janitorial supplies, he
decided to take action.

### 2.1 Health

- Dan has **20 HP**.
- Health is **hit-based** (not draining).
- Restored by **vending machine pickups**: small **+5 HP**, large **+10 HP**.
- Health **carries over between levels** (and is captured by save/load at the level boundary — §12).

### 2.2 Melee Attack

- **Weapon:** Mop / plunger.
- **Trigger:** Automatic — activates on contact with any robot.
- Both Dan and the robot take melee damage on contact.
- Dan is **knocked back** a fixed distance immediately after contact.
- Damage is **not continuous** — another melee event only occurs if Dan re-enters contact range.
- Melee damage to robots: **2 HP per hit**. Damage to Dan: per robot type (see §6).

### 2.3 Ranged Attack

- **Weapon:** Soap bubble launcher.
- **Projectile:** Soap bubbles at base; escalates to cleaning pods with power-ups.
- **Ammo:** Unlimited — no resource management.
- **Base fire rate:** Standard. **Base max shots on screen:** 3.
- **Trigger:** Left mouse click (primary), or keyboard directional fire keys (see §4).
- **Projectile lifespan:** Each shot travels a fixed distance/duration and self-destructs if it has not hit a target.

### 2.4 Visual Progression of Ranged Shots (cosmetic only)

| State | Visual |
| :---- | :---- |
| Base | Iridescent translucent soap bubbles |
| Triple Shot active | Larger, more opaque cleaning pods |
| Bounce active | Shots leave brief soapy trail on walls at ricochet point |

### 2.5 Vending Machines

Vending machines are static, interactable health-restoration objects placed in each
level. They are the sole means of restoring Dan's HP mid-run and are diegetically
consistent with the warehouse setting (break-room / floor vending).

**Two variants:**

| Variant | HP Restored | Visual |
| :---- | :---- | :---- |
| Small | +5 HP | Shorter/narrower unit, dim glow |
| Large | +10 HP | Taller/wider unit, brighter glow |

**Placement:** Procedurally placed at level generation time, flush against walls
(must not block corridors). Each level contains **1–3 machines**; quantity and
placement are weighted against level size and enemy density. Suggested default
ratio: 2 small : 1 large per level.

**Interaction:** Triggered by Dan walking into contact — no button press required.
On contact the machine immediately restores HP to Dan, capped at his 20 HP maximum.
The machine then enters a **depleted state** and cannot be used again. Machines do
not respawn within a level.

**Robots and machines:** Robots ignore vending machines entirely. Machines are not
destructible and do not participate in enemy pathfinding or AI behavior.

**Feedback:**
- *Active state:* lit screen / display with a soft ambient glow (suggest green or
  blue to contrast the warehouse palette).
- *On use:* brief flash, a dispensing sound cue, a floating "+5" or "+10" number
  rising from the machine, and rising heal rings from Dan's feet (§14, effect 9).
- *Depleted state:* screen goes dark / static, glow extinguished. Remains in level
  as a visual landmark only.

---

## 3. POWER-UPS

Power-ups are **shot-count based** — each pickup grants a fixed number of enhanced
shots (suggested: **75 shots per pickup**). Power-ups are **fully stackable**; each
tracks its remaining shot count independently.

### 3.1 Power-up Types

- **Rapid Fire** — doubles fire rate; increases max shots on screen.
- **Triple Shot** — each trigger fires 3 projectiles in a forward-facing fan spread; increases max shots on screen.
- **Bounce Shot** — all projectiles ricochet off walls; shots continue bouncing until lifespan expires.

### 3.2 Max Shots on Screen by Stack State

| Active Power-ups | Max Shots on Screen |
| :---- | :---- |
| None (base) | 3 |
| Rapid Fire only | 6 |
| Triple Shot only | 6 (3 per trigger, 2 volleys in flight) |
| Rapid Fire + Triple Shot | 9 (3 per trigger, 3 volleys in flight, faster) |
| + Bounce (any state) | Same as above — all shots now ricochet |

Implemented as `3 + 3·(Rapid) + 3·(Triple)`, volley-gated (see CLAUDE.md).

Active power-up shot counts are captured by save/load (§12) so a resumed run keeps
its remaining enhanced shots.

---

## 4. CONTROLS

### 4.1 Movement — Keyboard

WASD keys for four cardinal directions. North: W, East: D, South: S, West: A.
Diagonal movement is triggered by holding two adjacent cardinal keys simultaneously.

| Keys | Direction |
| :---- | :---- |
| W + A | Northwest |
| W + D | Northeast |
| S + A | Southwest |
| S + D | Southeast |

No dedicated single-key diagonal shortcuts. Movement cardinal keys are defined in
`CFG.KEYS.MOVE` for future remapping; diagonal combos are derived automatically
from those assignments at runtime.

### 4.2 Ranged Attack — Mouse

- **Mouse:** aim (Dan always faces the cursor).
- **Left Click:** fire in the direction of the cursor.

### 4.3 Ranged Attack — Keyboard Directional Fire

Four cardinal fire keys; diagonal fire is activated by holding two adjacent cardinal
fire keys simultaneously. Fire direction is the **normalized vector sum** of all
currently held cardinal fire keys — so combos produce diagonal angles naturally,
and holding two opposing keys (e.g. O + L) cancels to no fire.

Cardinal fire keys: North (O), East (P), South (L), West (K).

| Key(s) | Direction |
| :---- | :---- |
| O | North |
| P | East |
| L | South |
| K | West |
| O + K | Northwest |
| O + P | Northeast |
| L + K | Southwest |
| L + P | Southeast |

Fire cardinal keys are defined in `CFG.KEYS.FIRE` for future remapping; diagonal
combos are derived automatically from those assignments at runtime.

### 4.4 Special Item — Keyboard

`E` or `F` — deploy / throw the Atomic Dustbin.

### 4.5 Input Mode Selection

At the title screen, the player selects their input mode before play begins:

- **Spacebar** → Keyboard + mouse mode
- **A button (button 0) or Start button (button 9) on gamepad** → Gamepad mode

The title screen displays both options. Once a mode is selected, the opposing input
type is disabled for the session; to switch, the player must return to the title
screen (on death / game over). This design is intentional: keyboard input snaps to
8 directions while gamepad input is full 360° — mixing them mid-session would be
confusing.

On game-over and level-clear continue screens, prompts reflect the active mode:
"SPACE to continue" in keyboard mode; "A / START to continue" in gamepad mode.

`G.inputMode` is reset to `null` by `newGame()`, so returning to the title always
allows re-selection.

### 4.6 Movement — Gamepad

Left analog thumbstick (axes 0, 1): move Dan in full 360 degrees. Movement is
**normalized** — any push beyond the deadzone moves Dan at full speed regardless of
stick depth (not proportional). `CFG.GAMEPAD.moveDeadzone = 0.2`.

### 4.7 Ranged Attack — Gamepad

Right analog thumbstick (axes 2, 3): aim and fire in full 360 degrees. Dan fires
continuously whenever the stick is pushed beyond the deadzone. Fire rate respects
the same cooldown as keyboard fire — analog input does not bypass it.
`CFG.GAMEPAD.fireDeadzone = 0.2`.

### 4.8 Special Item — Gamepad

Any of: **LB** (left bumper, button 4), **RB** (right bumper, button 5), **LT**
(left trigger, button 6), or **RT** (right trigger, button 7) — deploy / throw the
Atomic Dustbin. Button indices per standard XInput / Browser Gamepad API mapping.

### 4.9 Pause, Options & Controls Screens

**Pause.** `ESC` (keyboard) or the gamepad's pause control opens the pause menu
mid-run; the game state moves to `paused` and the world freezes. Music ducks to ~40%
while paused and restores on resume. The pause root menu offers, in order:
**Continue**, **Options**, **Save & Quit**, **Quit**. Navigation is up/down + confirm,
routed by the active input mode.

**Options surface.** A single shared Options screen is reachable from **both** the
title screen (`O` / gamepad options control) and the pause menu. It owns three
independent volume sliders — **Master**, **Music**, **SFX** — plus a **Mute** toggle,
and a **CONTROLS ▸** entry. Left/right adjust the focused slider; changes persist to
local preferences immediately (§12). Back-navigation (`ESC` / B) returns to whichever
context opened Options.

**Controls screens.** Two reference panes with tab-switching:
- **Keyboard + Mouse pane** — a FIRE key grid and a matching MOVE grid (WASD + arrows),
  plus label columns for the special item, pause, mute, and mouse aim/fire.
- **Gamepad pane** — a flat controller schematic with leader lines to MOVE, AIM·FIRE,
  ATOMIC DUSTBIN, START·PAUSE, and BACK.

These screens are read-only reference for the current fixed bindings; live remapping
is not in scope (the `CFG.KEYS.*` tables exist for future remapping per §4.1/§4.3).

---

## 5. SPECIAL ITEM — THE ATOMIC DUSTBIN

A rare, glowing green deployable pickup. Dan carries **one at a time**. Glows green,
spins slowly when sitting on the floor as a pickup.

### 5.1 Deployment Physics

- **Stationary:** placed at Dan's current position immediately.
- **Moving:** thrown in Dan's movement direction; slides across the floor, decelerates via friction, and **bounces off walls**. Once fully stopped, the attract phase begins.
- **Throw distance (retuned):** the thrown bin now carries more momentum and travels
  meaningfully further before settling (roughly 2.3× the original distance — about
  nine tiles rather than four). This makes bounce-off-a-far-wall placement (§5.4) a
  more usable tool. Throw vs. drop is read from **movement input at deploy** (a held
  direction throws along it; centered = drop in place), so a knocked-back Dan still
  drops rather than flinging the bin.

### 5.2 Sequence of Effects

1. **Attract Phase (2.5 s):** once stationary, the dustbin opens and generates a vortex. All robots within a large radius are pulled toward it and **cannot fire** during this phase. Being caught skips a robot's entire AI tick — it can't self-move, fire, or melee Dan while held. Drones (which normally fly above obstacles) are also affected. Ground robots are dragged along walls; drones are pulled freely.
2. **Detonate:** massive AoE explosion. Destroys or heavily damages all robots within the blast radius. Dan is **immune to his own blast** (the special is a pure panic-button / crowd-control tool).

### 5.3 Scoring

- Robots destroyed by the dustbin award their **normal point value**, with the usual score float.
- A **"DAN'S SPECIAL!"** callout displays on detonation.
- A Manager caught in the blast still emits its on-death berserk pulse (harmless — everything near it is being detonated too).

### 5.4 Tactical Notes

- Throwing into a mob and letting it bounce off a far wall to settle in the center is advanced play — now more reliable given the increased throw distance (§5.1).
- Works as both a panic button and a precision crowd-control tool.
- Only one dustbin is ever active at a time (deploy is gated on there being no bin in flight, and Dan holds at most one).

---

## 6. ENEMIES

> See **`GDD-ENEMIES.md`** for the full enemy roster (§6.1) and canonical stat table (§6.2). That file is extracted here for token efficiency — include it only in sessions that touch enemy AI, stats, or new enemy types.
>
> Roster: 9 enemy types (Picker, Forklift, Scanner, Sorter, Drone, Inventory, Cleaner, Security, Manager) + the Dispatch Terminal spawner + a `"mixed"` sandbox pseudo-type for all-types levels. All are fully built. Per-enemy implementation decisions live in STATUS.md / STATUS-SYSTEMS.md under the corresponding subsystem entry.
>
> **Buff model (see GDD-ENEMIES.md §6.1.3 / §6.1.9):** both the Scanner's alarm and the Manager's on-death berserk raise a robot's speed, and add a **melee** damage bonus only to robots that already deal melee (`dmg > 0`). The Manager's berserk is now **permanent-until-death**, not a decaying timer.

---

## 7. HUMAN WORKERS

### 7.1 Basics

- **Count per level:** 5. Can be killed by Inventory Bot only (§6.1.6).
- Workers wander slowly, trying to avoid robots.
- **Seeking rescue:** when a worker has line of sight to Dan it moves **toward** Dan
  to make rescue easier — **unless** it is currently fleeing a nearby robot, which
  always takes priority. Priority order: flee a nearby robot > move toward Dan on LOS
  > wander.

### 7.2 Rescue Scoring (exponential doubling)

| Worker Rescued | Points | Running Total |
| :---- | :---- | :---- |
| 1st | 100 | 100 |
| 2nd | 200 | 300 |
| 3rd | 400 | 700 |
| 4th | 800 | 1,500 |
| 5th | 1,600 | 3,100 |

Rescuing all 5 earns a **full clear bonus** and a celebratory callout.

### 7.3 Rescue Mechanic

- Dan rescues a worker by moving into contact.
- If a worker is killed by an Inventory Bot before rescue, they are gone for the remainder of the level.

---

## 8. LEVEL STRUCTURE

### 8.1 Layout — Level Definition Format

> **Status: BUILT** (`level.js` + `world.js`). Generator, loader, five hand-authored levels, and conveyor push mechanic are all complete. Implementation decisions in STATUS.md → "Level Definition format & loader" and "Conveyors".

Every level — generated or hand-authored — is a plain data object: the **Level
Definition**. Procgen is a *producer* of these objects; hand-drawn set-piece levels
are written directly as these objects. The engine never branches on origin: it loads
a Level Definition and runs. This is what lets the conveyor mechanic, obstacle types,
and entity placement behave identically whether a level was generated or authored.

A Level Definition has three thin layers plus fixed set-piece placements.

#### 8.1.1 Layer 1 — Tile grid (static geometry)

A row-major array of equal-length strings; one character per tile. This is the only
layer that carries collision and line-of-sight. Grid dimensions are `cols × rows`;
a typical level is roughly 30 × 34 tiles.

| Char | Tile | Solid | Blocks LOS | Destructible |
| :--- | :--- | :--- | :--- | :--- |
| `.` | floor | no | no | — |
| `#` | wall | yes | yes | no |
| `S` | shelf | yes | yes | yes (Forklift charge only) |
| `P` | pallet | yes | yes | no |
| `o` | pillar | yes | yes | no |

Per-type flags are defined once in `CFG.TILES` so behavior is data-driven and new
tile types can be added without touching collision code. Conveyor cells are **not** a
tile type — they are plain `.` floor; the conveyor layer (§8.1.2) is the sole source
of truth for belt positions. The Sorter's arcing box clears walls via its projectile
arc (§6.1.4), not via any tile flag, so no "low wall" type is required.

#### 8.1.2 Layer 2 — Conveyor strips

A list of axis-aligned rectangles, each with a push direction and speed. The net push
applied at any cell is the **vector sum of every strip that covers it**.

```
conveyors: [
  { x: 1,  y: 16, w: 28, h: 2,  dir: "E", speed: 1.0 },
  { x: 14, y: 1,  w: 2,  h: 32, dir: "N", speed: 1.0 },
]
```

Each strip's `x, y, w, h` are in tile coordinates; `dir` is one of `N / S / E / W`;
`speed` is in the same units as entity movement per the `CFG` conveyor constant.

Because push is summed, **crossing strips produce a diagonal push at the overlap with
no special intersection type** — an East strip crossing a North strip pushes any
entity in the overlap cells to the Northeast. This is the entire intersection
mechanic. Two strips with the same axis and opposing directions cancel where they
overlap (avoid authoring this unless a dead zone is intended).

**Unavoidable belts** are an authoring concern, not a format feature: span a strip the
full width or height of the map and wall off every other route to the exit side, so
crossing the belt is the only path. The format already supports this — no flag needed.

#### 8.1.3 Layer 3 — Zones, placements, and spawn rules

**Zones** are tagged, non-colliding rectangles that hint where the placer puts things.
They carry no geometry of their own.

```
zones: [
  { x: 1, y: 24, w: 28, h: 9,  role: "spawn"  },
  { x: 1, y: 1,  w: 28, h: 13, role: "danger" },
  { x: 1, y: 18, w: 28, h: 5,  role: "cover"  },
]
```

Standard roles: `spawn`, `cover`, `combat`, `danger`. A level may define any subset;
roles may overlap spatially.

**Fixed placements** are hand-authored set pieces with exact tile coordinates. The
player start and the exit door are always fixed placements.

```
placements: [
  { type: "player", x: 15, y: 27 },
  { type: "exit",   x: 25, y: 1  },
]
```

**Spawn rules** are what keep procedural placement alive. Each rule asks the placer to
drop `count` entities of `type` into a named zone `role`, optionally avoiding a role.

```
spawnRules: [
  { type: "dispatchTerminal", count: 2, zone: "danger" },
  { type: "vendingSmall",     count: 1, zone: "cover"  },
  { type: "vendingLarge",     count: 1, zone: "danger" },
  { type: "worker",           count: 5, zone: "any", avoid: "spawn" },
  { type: "powerup",          count: 2, zone: "cover"  },
  { type: "atomicDustbin",    count: 1, zone: "danger" },
]
```

**Guaranteed placement each level** (per the original design intent, now expressed as
spawn rules): 1 exit door (fixed); 5 human workers; Dispatch Terminals scaling with
level; **two vending machines — one small in a `cover` zone, one large in a `danger`
zone** (the large unit is a deliberate risk/reward pull, §2.5); power-up pickups; and
1 rare Atomic Dustbin (`count` may be 0 on early levels).

> **Interaction with random map selection (§8.3):** on a hand-authored map the
> *terminal* spawn rules are rebuilt from the current level type at build time — the
> authored level's baked-in enemy composition is ignored — while its **non-terminal**
> rules (workers, power-ups, vending, dustbin) stay as authored. This keeps geometry
> and enemy composition on independent axes.

#### 8.1.4 Loader contract

The engine gains one loader that consumes a Level Definition and is the **only** entry
point to a playable level. It must:

- Parse the tile grid into the runtime collision/LOS structures, reading flags from `CFG.TILES`.
- **Bake conveyor strips into a per-cell push field**: a `cols × rows` array of `{dx, dy}` defaulting to zero, summing every covering strip's vector during the bake. Runtime push lookup is then O(1) per entity and intersections are already resolved. Drones ignore this field entirely (§6.1.5 — they fly above the belt).
- Resolve fixed placements to exact spawn positions; run spawn rules to scatter rule-based entities into their zones, honoring `avoid`, and never placing an entity on a solid tile.
- Validate: every level must have exactly one `player` and at least one `exit` placement, and every spawn rule's referenced zone role must exist (or be `"any"`).

Procgen's responsibility narrows to **emitting a valid Level Definition** — generating
the tile grid, choosing conveyor strips, tagging zones, and listing spawn rules — after
which it hands off to the same loader every hand-authored level uses.

### 8.2 Level End Conditions

1. **Find the Exit Door:** Dan reaches the exit and leaves. Level ends immediately; unrescued workers and uncollected points are forfeited.
2. **Rescue All 5 Workers:** full 3,100-point rescue bonus awarded (the escalating per-rescue values; §7.2) plus a celebratory callout. **Resolved:** this does **not** auto-complete the level — the exit door remains the only level-end trigger (see STATUS "Human workers & rescue").

### 8.3 Level Progression & Random Map Selection

- Endless. Each level raises difficulty: more terminals, faster spawns, more dangerous mix, higher proportion of mid/high-tier enemies.
- No story cutscenes between levels — arcade pacing.

**Two independent axes.** *Map layout* (tile geometry) and *level type* (enemy
composition) are now decoupled:

- **Level type** is chosen by the active game mode (§8.4) — the `LEVEL_PLAN` index in
  Level Plan mode, or the current playlist entry in Hand-Authored mode.
- **Map layout** is chosen at random **each level** from a pool of six: the procgen
  generator plus the five hand-authored maps (`receiving_dock`, `pick_and_pack`,
  `cold_storage_vault`, `mezzanine_ring`, `conveyor_hub`).

So a given level's difficulty (its enemy mix) is driven by progression, while its
geometry is a fresh random draw — the same enemy type can appear on any of the six
maps. The hand-authored maps, previously debug-only, are now live gameplay. As noted
in §8.1.3, an authored map's own baked-in enemy fields are discarded and its terminal
spawn rules are rebuilt from the current level type.

### 8.4 Game Modes & Playlists

The mode is chosen at the title screen and stored on `G.gameMode`:

- **Level Plan** (`"levelPlan"`) — the original `LEVEL_PLAN` progression. Enemy type
  advances by plan index; a random map is drawn each level; the tail loops on the
  `"mixed"` all-types sandbox.
- **Hand-Authored Playlist** (`"handAuthored"`) — enemy types are driven by a loaded
  external **JSON playlist**; a random map is still drawn each level; the sequence
  loops on its last entry.

**Playlists** are external JSON files loaded at boot (e.g. `warehouse-warmup.json`).
Each drives the per-level enemy type sequence and may optionally pin a music track
per entry (`"music": "<track_id>"`; unknown ids are stripped with a warning, and
entries with no field fall back to music auto-rotation — §10). The player picks a
playlist at the title before starting a Hand-Authored run. Save/load records which
mode and (if applicable) which playlist and index a run was on (§12).

---

## 9. SCORING SUMMARY

Per-enemy point values are canonical in §6.2. Worker rescue values are in §7.2.
High score is tracked globally and displayed on the title / game-over screen; it is
stored separately from save slots (§12).

**No-score kills:** robots destroyed by another robot's projectile — i.e. Security
taser bolts or Manager seeking missiles striking a ground robot (§6.1.8, §6.1.9) —
award **no points** to Dan. Only kills Dan causes (soap shots, mop, or the Atomic
Dustbin per §5.3) score. Robots killed by friendly fire still play their death SFX
and, for a caught Manager, still fire the berserk pulse — Dan gets the chaos and FX
but no free points.

---

## 10. VISUAL AND AUDIO STYLE

- **Aesthetic:** retro arcade, chunky pixel art, limited palette. *(Sprite-art polish NOT yet built.)*
- **Setting:** warehouse interior — shelving, concrete floors, loading zones, break-room elements.
- **Projectile visuals:** base iridescent soap bubbles; Triple Shot larger opaque cleaning pods; Bounce leaves a soapy trail on walls at ricochet points.
- **Atomic Dustbin:** glowing green, spins as a floor pickup; dramatic vortex + explosion on detonation.
- **Screen feel:** a suite of camera / screen-feedback effects (shake, flash, vignette, tints, punch-zoom, heal rings) is layered over combat and pickups — see §14 for the full effect list.

### 10.1 SFX

Retro arcade SFX via the Web Audio API — synthesized only, no audio file assets. Core
cues include pop/splash on hit, the Scanner alarm, and the dustbin detonation
explosion, plus a broad set of game-feel additions and the sustained conveyor hum.
`M` mutes. See STATUS-AUDIO.md for the full SFX inventory and bus routing.

- **Worker-death cue:** a worker being killed plays a **dramatic, prominent** sting
  (clearly more noticeable than a generic hit) so the loss reads unmistakably.
- **Last-worker cue:** when the **final** worker leaves the level — by rescue *or* by
  being killed — a **unique** one-shot SFX signals that there are no more humans left
  to save.

### 10.2 Music

Synthesized chiptune-style music via the Web Audio API (no audio files): one title
track plus **five gameplay tracks** (`bouncy_warehouse`, `robot_rampage`, `soap_opera`,
`conveyor_blues`, `overtime_mania`), each a full multi-bar loop with verse / fill /
chorus / return structure. A look-ahead scheduler keeps timing independent of the
render loop. Music runs on its own audio bus (independent Music volume, §4.9), **ducks**
while paused and restores on resume, and **fades out** on level clear. Track selection
follows the active playlist's optional per-entry `music` field, otherwise auto-rotates
each level. Full scheduler / voice details are in STATUS-AUDIO.md.

---

## 11. FUTURE OPTIONAL FEATURES

Features considered during design but deferred from the current roadmap. Not in CLAUDE.md or the active STATUS.md checklist; not expected in any current implementation session. Revisit when a relevant system creates a natural hook.

### 11.1 The Scenic Route (Achievement)

Achievement concept: "Step on every walkable tile in a level." Requires per-frame spatial coverage tracking — a `cols × rows` boolean visited-grid updated each frame as Dan moves. Deferred because the CPU overhead and implementation complexity are not justified for a single achievement. Revisit if a tile-visit tracking system is added for another purpose.

### 11.2 Vending Machine Cooldown

Instead of permanently single-use, vending machines could enter a cooldown period and become usable again after a fixed time. This would unlock achievement concepts that currently make no sense (e.g., "use a vending machine 5 times in one level"). Deferred; current design is single-use within a level.

### 11.3 Control Remapping

The `CFG.KEYS.MOVE` / `CFG.KEYS.FIRE` tables and the read-only Controls panes (§4.9)
lay groundwork for live key/button remapping, but remapping UI is not built. Revisit
if players request custom bindings.

---

## 12. SAVE / LOAD & SESSION PERSISTENCE

> **Status: BUILT** (`savegame.js` + `pause.js`). `savegame.js` is a pure
> localStorage leaf with no game-state imports; `pause.js` owns the save picker,
> quit confirm, and on-canvas name entry. Game states: `title | playing | paused | levelclear | dead`.

**Save slots.** Five slots. From the pause menu, **Save & Quit** writes the current
run to a chosen slot (with an overwrite confirm if occupied) after the player enters a
name (max 20 chars, typed on a canvas name-entry screen). A saved run can be resumed
from the title's Load screen; resuming rebuilds the level fresh at the saved level
number rather than restoring exact in-level entity state.

**What a save captures:** player name, timestamp, score, level number, game mode,
playlist name/filename/index (Hand-Authored mode), Dan's HP and dustbin-carry flag,
and remaining Rapid / Triple / Bounce power-up shot counts. Save is taken at the level
boundary — mid-level entity positions, in-flight projectiles, and rescued-worker state
are intentionally not part of the schema.

**High score is global, not per-slot.** It lives under its own storage key and persists
independently of any save slot.

**Preferences** (Master / Music / SFX volumes, mute) persist separately as well, so
audio settings survive across runs and are shared by all slots. Every slider adjustment
in Options (§4.9) writes all volumes back to storage so no value is ever dropped.

---

## 13. ACHIEVEMENTS

> **Status: BUILT** (`events.js` + `achievements.js`). **Full specification lives in
> `ACHIEVEMENTS.md`** — that is the canonical source; this section is design-intent
> summary only and deliberately does not reproduce the achievement list.

Two dimensions:

- **Weekly challenges** — 5 active per ISO calendar week, the same set for all players
  globally, drawn from a rotating pool. They reset at week rollover; incomplete
  progress is lost until that set cycles back. Surfaced on the title screen's weekly
  panel.
- **Lifetime achievements** — never reset; accumulate permanently across all sessions;
  tiered Bronze → Silver → Gold → Platinum → Diamond.

**Architecture.** Achievement tracking is event-driven via a one-way synchronous
pub/sub bus (`events.js`): gameplay modules `emit` events; only `achievements.js`
subscribes. No other module imports `achievements.js`. This keeps the tracking layer
fully decoupled from gameplay code.

**Design principle.** Prefer achievements that **teach good gameplay habits**; cut any
whose incentives would encourage degenerate or perverse play. See `ACHIEVEMENTS.md`
for the current roster, tiers, weekly pool, and the exact events each achievement
listens to.

---

## 14. CAMERA & SCREEN EFFECTS

> **Status: BUILT** (design session 2026-07-01). Screen-feedback layer over combat and
> pickups; implementation decisions in STATUS.md → "Camera effects" and
> `SPEC-camera-effects.md`.

Nine approved effects, each tied to a gameplay event so feedback reads instantly:

| # | Trigger | Effect |
|---|---|---|
| 1 | Sustained low HP | Pulsing red vignette while HP stays low |
| 2 | Dan dies | Larger shake + flash that fades into the DAN IS DOWN screen |
| 3 | Dustbin detonates | Radial shake + flash, scaled by kill count |
| 4 | Dustbin thrown / bounced | Tiny kick on throw, tiny shake per wall bounce |
| 5 | Manager berserk pulse | Shake + flash; buffed robots also get a meaner color tint + shimmy while berserk |
| 6 | Cleaner-spray slow active | Sustained "disoriented / sick" tint + gentle wobble, clears when the slow ends |
| 7 | Worker dies | Brief somber desaturation pulse, distinct from combat feedback |
| 8 | Power-up collected | Tiny camera punch-zoom, tinted to that power-up's color |
| 9 | Vending machine used | Heal rings rising from Dan's feet, delivering the restore visually |

**Deliberately out of scope** (from the same design session): per-hit shake on
`player:hit`; per-kill enemy-death shake; a last-enemy-cleared flash (this was once
built as `flash.js`, then removed, and is not being rebuilt); worker-rescued and
achievement-banner punches; conveyor-tick shake (it would be continuous and nauseating
over a sustained belt ride). A Scanner-alarm screen tint is noted as a natural future
fit for the same sustained-vignette machinery, but is undecided and unbuilt.

---

*End of Document — Atomic Dustbin Dan GDD v2.0*