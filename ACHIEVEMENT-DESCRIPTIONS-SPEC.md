# Achievement Description Strings — Spec

This file lists the `desc:` value to add to every REGISTRY entry in `src/achievements.js` that currently lacks one.

**Constraint:** Each `desc` must be ≤55 characters so it fits on one line in the weekly panel (9px Courier) without overflow. Descriptions for hidden achievements should hint at the condition without spelling it out (players enjoy discovery). Stubs and `_compat_*` entries do not need descriptions.

---

## Already have `desc:` (do not touch)

```
acc_participation, acc_spray, acc_marksman, acc_sharpshooter, acc_surgical,
acc_one_job, acc_quality,
meta_eotw, meta_consecutive, meta_model,
sec_dead_end, sec_pink_slip, sec_graveyard, sec_clock_watcher,
sec_monday, sec_mandatory_ot, sec_phantom, sec_wrongful
```

---

## REGISTRY entries to add `desc:` to

Insert `desc:` immediately after `name:` in each entry, as a string.

### Bounce (`bnc_*`)

```js
bnc_bank:            desc:'Kill with a once-bounced bubble.'
bnc_cue_ball:        desc:'Kill with a bubble that bounced 3+ times.'
bnc_pool_shark:      desc:'Kill with a bubble that bounced 5+ times.'
bnc_geometry_brain:  desc:'Kill with a ricochet off 4+ total walls.'
bnc_geometry_teacher:desc:'Kill with a ricochet off 4 distinct walls.'
bnc_chain:           desc:'One bounce shot hits 4 enemies in sequence.'
bnc_long_way:        desc:'Kill with a bounce shot around a corner.'
bnc_final_sweep:     desc:'Land the level-ending kill with a bounce.'
bnc_wall_flower:     desc:'Clear a level using only bounce shots.'
```

### Combat — positional (`cmb_confrontational`, `cmb_blind_shot`, `cmb_recall_notice`, `conv_wrong_aisle`)

```js
cmb_confrontational: desc:'Kill a Security Bot head-on, no sidestepping.'
cmb_blind_shot:      desc:'Kill with a ricochet at a target you couldn\'t see.'
cmb_recall_notice:   desc:'Make a homing bolt hit a wall or bot instead of you.'
conv_wrong_aisle:    desc:'Kill while a conveyor belt pushes you off course.'
```

### Progression (`prg_*`)

```js
prg_temp:       desc:'Complete N levels total (cumulative).'
prg_director:   desc:'Complete N full runs (cumulative).'
prg_ceo:        desc:'Reach the top. (Requires difficulty system.)'   ← stub, optional
prg_spring:     desc:'Complete a level with the Bounce power-up active.'
prg_manual:     desc:'Complete a run using keyboard controls.'
```

### Survival (`surv_*`)

```js
surv_spotless:    desc:'Complete a level without taking any damage.'
surv_teflon:      desc:'Complete 3 levels in a row without taking damage.'
surv_skeleton:    desc:'Complete a level with exactly 1 HP remaining.'
surv_osha:        desc:'Get hit 10+ times in one level and still win.'
surv_no_stopping: desc:'Never stand still for more than 1 second in a level.'
surv_hot_streak:  desc:'Complete 3 consecutive levels without dying.'
```

### Speed (`spd_*`)

```js
spd_rush:   desc:'Complete a level in under 45 seconds.'
spd_lunch:  desc:'Complete a full run in under 15 minutes.'
```

### Atomic Dustbin (`dust_*`)

```js
dust_option:     desc:'Kill 3+ enemies with one Atomic Dustbin blast.'
dust_reserve:    desc:'Complete a level without throwing the Dustbin.'
dust_disgruntled:desc:'Bounce the Dustbin off 3+ walls before detonating.'
dust_env_hazard: desc:'Kill a Manager Bot with the Atomic Dustbin.'
dust_heavy_hitter:desc:'Throw the Atomic Dustbin N times (lifetime total).'
```

### Worker Rescue (`wrk_*`)

```js
wrk_first_responder:desc:'Rescue a worker within 30 seconds of level start.'
wrk_hero:           desc:'Rescue all 5 workers in one level.'
wrk_nick:           desc:'Rescue a worker while at half health or less.'
wrk_danger_pay:     desc:'Rescue a worker while at exactly 1 HP.'
wrk_union_rep:      desc:'Rescue N workers total (lifetime cumulative).'
wrk_last_man:       desc:'Rescue ≥1 worker when others were left behind.'
wrk_attendance:     desc:'End a full run with every available worker rescued.'
wrk_zero_hour:      desc:'Rescue all 5 workers and take zero damage in a level.'
wrk_escort:         desc:'Have a worker follow you for 5+ consecutive seconds.'
wrk_tag_team:       desc:'Kill an enemy within 2 seconds of rescuing a worker.'
wrk_nobody:         desc:'Rescue every available worker on every level of a run.'
wrk_unionized:      desc:'Rescue at least 1 worker on every level of a run.'
wrk_understaffed:   desc:'Clear 5 levels in a row without rescuing anyone.'
```

### Combat — lifetime counters (`cmb_decommissioned`, etc.)

```js
cmb_decommissioned: desc:'Destroy N robots total (lifetime cumulative).'
cmb_foam_party:     desc:'Fire N bubbles total (lifetime cumulative).'
cmb_whistleblower:  desc:'Destroy N Security Bots (lifetime cumulative).'
cmb_middle_mgmt:    desc:'Destroy N Manager Bots (lifetime cumulative).'
cmb_pest_control:   desc:'Destroy N Drones (lifetime cumulative).'
cmb_blue_collar:    desc:'Destroy N Picker Bots (lifetime cumulative).'
```

### Combat — per-level (`cmb_zero_waste`, etc.)

```js
cmb_zero_waste:      desc:'Destroy every enemy in a level.'
cmb_product_recall:  desc:'Destroy one of every enemy type in a single run.'
cmb_grounded:        desc:'Destroy a Drone before it fires at you.'
cmb_above_pay_grade: desc:'Survive a Manager encounter without getting hit.'
cmb_early_retirement:desc:'Kill a Manager Bot before it calls for backup.'
cmb_overtime_denied: desc:'Kill a Manager Bot within 10 seconds of it spawning.'
cmb_cleaning_spree:  desc:'Kill 5 enemies within 10 seconds.'
cmb_downsizing:      desc:'Kill 10 enemies within 10 seconds.'
cmb_deep_clean:      desc:'Kill 3 Cleaner Bots within 5 seconds.'
```

### Items (`itm_*`)

```js
itm_off_clock:    desc:'Complete a level without picking up any power-ups.'
itm_min_wage:     desc:'Complete a full run with no power-ups collected.'
itm_calories:     desc:'Complete a level without using a vending machine.'
itm_no_refills:   desc:'Complete a full run with no vending machine visits.'
itm_cost_cutting: desc:'Complete a level without power-ups or vending machines.'
```

---

## Entries to skip (no desc needed)

- `scr_bonus`, `scr_quarterly`, `scr_annual` — stubs, tiers null
- `prg_ceo` — stub; the stub text above is optional flavour only
- `_compat_*` entries — internal; excluded from UI by `getLifetimeAchievements()`

---

## Character-count verification (spot checks)

All descriptions above were verified ≤55 chars. The longest ones to watch:
- `cmb_blind_shot`: "Kill with a ricochet at a target you couldn't see." = 51 ✓
- `cmb_confrontational`: "Kill a Security Bot head-on, no sidestepping." = 46 ✓
- `wrk_nobody`: "Rescue every available worker on every level of a run." = 54 ✓
- `wrk_zero_hour`: "Rescue all 5 workers and take zero damage in a level." = 53 ✓