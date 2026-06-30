/* =========================================================================
   render-entities.js — enemy + projectile sprites.

   drawEnemies dispatches by e.type to the per-type sprite (Picker/Forklift/
   Security/Sorter/Cleaner/Drone/Manager) and draws the berserk aura; drawEbolts
   renders each projectile kind (bolt / arc box / drop package + reticle / homing
   missile). The Cleaner cone reuses coneRayDist so the drawn spray clips to walls.
   ========================================================================= */
import { ctx } from "./canvas.js";
import { G } from "./state.js";
import { ENEMY } from "./config.js";
import { COL } from "./palette.js";
import { coneRayDist } from "./enemies.js";

export function drawEnemies(){
  for (const e of G.enemies){
    // Berserk aura: orange pulsing ring around any robot buffed by a Manager death.
    if (e.berserk > 0 && e.spawn <= 0){
      const pulse = 0.5 + 0.5 * Math.sin(e.bob * 4);
      ctx.fillStyle = "rgba(255,100,20," + (0.13 + 0.09*pulse).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 7 + pulse * 3, 0, Math.PI*2);
      ctx.fill();
    }
    // Alarm aura: cyan pulsing ring around any robot buffed by a Scanner's alarm.
    if (e.alarmed > 0 && e.spawn <= 0){
      const pulse = 0.5 + 0.5 * Math.sin(e.bob * 5);
      ctx.fillStyle = "rgba(127,224,255," + (0.12 + 0.10*pulse).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 6 + pulse * 3, 0, Math.PI*2);
      ctx.fill();
    }
    if (e.type === "forklift") drawForklift(e);
    else if (e.type === "security") drawSecurity(e);
    else if (e.type === "sorter") drawSorter(e);
    else if (e.type === "cleaner") drawCleaner(e);
    else if (e.type === "drone") drawDrone(e);
    else if (e.type === "manager") drawManager(e);
    else if (e.type === "scanner") drawScanner(e);
    else if (e.type === "inventory") drawInventory(e);
    else drawPicker(e);
  }
}

function drawPicker(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const bobY = Math.sin(e.bob) * 1.5;
  const x = e.x, y = e.y + bobY;
  const flash = e.hitFlash > 0;

  // tread/base
  ctx.fillStyle = "#3a1f1c";
  ctx.fillRect(x - r, y + r*0.4, r*2, r*0.7);
  // body
  ctx.fillStyle = flash ? "#ffffff" : COL.picker;
  ctx.fillRect(x - r, y - r, r*2, r*1.6);
  // top panel
  ctx.fillStyle = COL.pickerPanel;
  ctx.fillRect(x - r*0.7, y - r*0.8, r*1.4, r*0.5);
  // single eye, tracks Dan
  const ea = Math.atan2(G.dan.y - e.y, G.dan.x - e.x);
  const ex = x + Math.cos(ea) * r*0.25;
  const ey = y + Math.sin(ea) * r*0.25 - r*0.1;
  ctx.fillStyle = COL.pickerEye;
  ctx.beginPath();
  ctx.arc(ex, ey, r*0.32, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = "#7a3a12";
  ctx.beginPath();
  ctx.arc(ex, ey, r*0.14, 0, Math.PI*2);
  ctx.fill();
  // outline
  ctx.strokeStyle = "#5e1b14";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - r, y - r, r*2, r*1.6);
}

function drawForklift(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const x = e.x, y = e.y;
  const flash = e.hitFlash > 0;
  const charging = e.mode === "charge";
  // face the charge direction while locking/charging, else toward Dan
  const face = (charging || e.mode === "lock") ? e.cdir : Math.atan2(G.dan.y - e.y, G.dan.x - e.x);

  // wind-up telegraph: blinking red beam down the charge lane
  if (e.mode === "lock"){
    if ((Math.floor(e.timer * 16) % 2) === 0){
      ctx.strokeStyle = "rgba(255,91,77,0.75)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(e.cdir)*140, y + Math.sin(e.cdir)*140);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(face);
  // forks out front
  ctx.fillStyle = COL.forkliftFork;
  ctx.fillRect(r*0.55, -r*0.72, r*0.9, r*0.24);
  ctx.fillRect(r*0.55,  r*0.48, r*0.9, r*0.24);
  // chassis
  ctx.fillStyle = flash ? "#ffffff" : (charging ? COL.chargeWarn : COL.forkliftBody);
  ctx.fillRect(-r, -r*0.82, r*1.7, r*1.64);
  // hazard stripe
  ctx.fillStyle = flash ? "#ffffff" : COL.forkliftDark;
  ctx.fillRect(-r*0.2, -r*0.82, r*0.4, r*1.64);
  // cab
  ctx.fillStyle = flash ? "#ffffff" : "#2b2410";
  ctx.fillRect(-r*0.92, -r*0.5, r*0.6, r);
  // outline
  ctx.strokeStyle = "#5a4410";
  ctx.lineWidth = 2;
  ctx.strokeRect(-r, -r*0.82, r*1.7, r*1.64);
  ctx.restore();

  // HP pips above
  const max = ENEMY.forklift.hp;
  const pw = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? "#ffd23f" : "#3a2f12";
    ctx.fillRect(x - r + h*pw, y - r - 9, pw - 2, 3);
  }
}

function drawSecurity(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const x = e.x, y = e.y;
  const flash = e.hitFlash > 0;
  const winding = e.winding > 0;
  // Face the latched aim while telegraphing, else track Dan.
  const face = winding ? e.aim : Math.atan2(G.dan.y - e.y, G.dan.x - e.x);

  // Telegraph: a thin charging beam down the aim lane just before firing.
  if (winding){
    ctx.strokeStyle = "rgba(139,228,255," + (0.5 + 0.5*Math.sin(e.winding*60)).toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.aim)*120, y + Math.sin(e.aim)*120);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(face);

  // taser prongs out front (spark when winding)
  ctx.fillStyle = winding ? COL.bolt : COL.securityTrim;
  ctx.fillRect(r*0.6, -r*0.5, r*0.7, r*0.16);
  ctx.fillRect(r*0.6,  r*0.34, r*0.7, r*0.16);
  if (winding){
    ctx.fillStyle = COL.boltCore;
    ctx.beginPath();
    ctx.arc(r*1.3, 0, r*0.22 + Math.sin(e.winding*70)*1.5, 0, Math.PI*2);
    ctx.fill();
  }

  // chassis
  ctx.fillStyle = flash ? "#ffffff" : COL.securityBody;
  ctx.fillRect(-r*0.9, -r*0.85, r*1.7, r*1.7);
  // armored shoulders
  ctx.fillStyle = flash ? "#ffffff" : COL.securityDark;
  ctx.fillRect(-r*0.9, -r*0.85, r*0.45, r*1.7);
  // visor (brightens while charging a shot)
  ctx.fillStyle = flash ? "#ffffff" : COL.securityVisor;
  ctx.globalAlpha = winding ? 1 : 0.85;
  ctx.fillRect(r*0.05, -r*0.34, r*0.6, r*0.68);
  ctx.globalAlpha = 1;
  // outline
  ctx.strokeStyle = "#11151c";
  ctx.lineWidth = 2;
  ctx.strokeRect(-r*0.9, -r*0.85, r*1.7, r*1.7);
  ctx.restore();

  // HP pips above (3)
  const max = ENEMY.security.hp;
  const pw = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? COL.bolt : "#22303a";
    ctx.fillRect(x - r + h*pw, y - r - 9, pw - 2, 3);
  }
}

function drawSorter(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const flash = e.hitFlash > 0;
  const scared = e.canSee;
  // Nervous shake while fleeing.
  const sh = scared ? Math.sin(e.bob * 6) * 1.6 : 0;
  const x = e.x + sh, y = e.y;

  ctx.save();
  ctx.translate(x, y);

  // squat rounded chassis
  ctx.fillStyle = flash ? "#ffffff" : COL.sorterBody;
  ctx.fillRect(-r*0.95, -r*0.7, r*1.9, r*1.5);
  ctx.fillStyle = flash ? "#ffffff" : COL.sorterDark;
  ctx.fillRect(-r*0.95, r*0.2, r*1.9, r*0.6);    // lower tray/lip
  ctx.strokeStyle = "#2c3520";
  ctx.lineWidth = 2;
  ctx.strokeRect(-r*0.95, -r*0.7, r*1.9, r*1.5);

  // two big nervous eyes (wide & jittering when scared)
  const eyeR = scared ? r*0.34 : r*0.26;
  const dartx = scared ? Math.sin(e.bob*7)*r*0.10 : 0;
  for (const sx of [-r*0.4, r*0.4]){
    ctx.fillStyle = "#11140d";
    ctx.fillRect(sx - eyeR, -r*0.42, eyeR*2, eyeR*2);
    ctx.fillStyle = flash ? "#ffffff" : COL.sorterEye;
    ctx.beginPath();
    ctx.arc(sx + dartx, -r*0.42 + eyeR, eyeR*0.62, 0, Math.PI*2);
    ctx.fill();
  }
  // little antenna — droops calm, springs up when panicking
  ctx.strokeStyle = COL.sorterDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r*0.7);
  ctx.lineTo(scared ? r*0.1 : r*0.3, -r*(scared ? 1.15 : 0.95));
  ctx.stroke();
  ctx.fillStyle = scared ? COL.chargeWarn : COL.sorterEye;
  ctx.beginPath();
  ctx.arc(scared ? r*0.1 : r*0.3, -r*(scared ? 1.15 : 0.95), r*0.13, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // HP pips above (2)
  const max = ENEMY.sorter.hp;
  const pw = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? COL.sorterEye : "#2c3520";
    ctx.fillRect(x - r + h*pw, y - r - 11, pw - 2, 3);
  }
}

function drawCleaner(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const x = e.x, y = e.y;
  const flash = e.hitFlash > 0;
  const d = ENEMY.cleaner;
  const winding = e.mode === "spray" && e.windup > 0;
  const active  = e.mode === "spray" && e.spraying;

  // --- spray cone (telegraph while winding, damaging green when active) ---
  // The cone is CLIPPED to wall geometry: each radial slice is truncated at the
  // first shelf, so the spray visibly stops at walls instead of bleeding through.
  if (winding || active){
    const half = d.sprayHalfAngle;
    const SEG = 16;
    ctx.save();
    if (active){
      const g = ctx.createRadialGradient(x, y, r*0.5, x, y, d.sprayRange);
      g.addColorStop(0, "rgba(155,255,122,0.45)");
      g.addColorStop(1, "rgba(95,208,106,0.04)");
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = "rgba(155,255,122,0.10)";   // faint warning during windup
    }
    // Build the clipped outline: apex + an arc whose radius is wall-limited.
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s <= SEG; s++){
      const aa = e.face - half + (s / SEG) * (2 * half);
      const rr = coneRayDist(x, y, aa, d.sprayRange);
      ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    ctx.closePath();
    ctx.fill();
    if (active){
      // animated droplets drifting outward, each clamped to its slice's clip
      ctx.fillStyle = COL.spray;
      for (let i = 0; i < 7; i++){
        const t = (e.bob * 0.6 + i * 0.9) % 1;
        const aa = e.face - half + (i / 6) * (2 * half) + Math.sin(e.bob + i) * 0.05;
        const clip = coneRayDist(x, y, aa, d.sprayRange);
        const rr = clip * (0.25 + t * 0.7);
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(x + Math.cos(aa)*rr, y + Math.sin(aa)*rr, 2.2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(e.face);
  // nozzle pointing along the spray heading
  ctx.fillStyle = active ? COL.spray : COL.cleanerNozzle;
  ctx.fillRect(r*0.5, -r*0.22, r*0.9, r*0.44);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  // round tank chassis
  ctx.fillStyle = flash ? "#ffffff" : COL.cleanerBody;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : COL.cleanerDark;
  ctx.fillRect(-r*0.85, r*0.1, r*1.7, r*0.7);     // lower band
  // solution tank window
  ctx.fillStyle = flash ? "#ffffff" : COL.cleanerTank;
  ctx.fillRect(-r*0.45, -r*0.55, r*0.9, r*0.7);
  ctx.fillStyle = COL.sprayDark;
  ctx.fillRect(-r*0.45, -r*0.2, r*0.9, r*0.35);    // liquid level
  ctx.strokeStyle = "#143b35";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();

  // HP pips above (2)
  const max = ENEMY.cleaner.hp;
  const pw = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? COL.spray : "#1f3a33";
    ctx.fillRect(x - r + h*pw, y - r - 10, pw - 2, 3);
  }
}

// Aerial bomber. Drawn ELEVATED (body-anchored: e.x,e.y is the body you see and
// shoot) with a cast ground-shadow below it to read as flying. Rotors spin; the
// underside payload light pulses red as a bomb arms (complements the reticle).
function drawDrone(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const d = ENEMY.drone;
  const flash = e.hitFlash > 0;
  const bobY = Math.sin(e.bob) * 2;
  const x = e.x, y = e.y + bobY;             // hovering body
  const arming = e.dropCd < 0.34;            // about to drop -> underside warns

  // --- cast ground shadow (fixed below the body => altitude cue) ---
  const gy = e.y + d.altitude;
  ctx.fillStyle = COL.droneShadow;
  ctx.beginPath();
  ctx.ellipse(x, gy, r * 0.9, r * 0.42, 0, 0, Math.PI*2);
  ctx.fill();

  // --- rotor arms + spinning discs (four corners) ---
  const arm = r * 1.05;
  const corners = [[-1,-1],[1,-1],[-1,1],[1,1]];
  ctx.strokeStyle = flash ? "#ffffff" : COL.droneDark;
  ctx.lineWidth = 2.4;
  for (const [cx, cy] of corners){
    const ax = x + cx*arm*0.62, ay = y + cy*arm*0.62;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke();
    // motor hub
    ctx.fillStyle = flash ? "#ffffff" : COL.droneDark;
    ctx.beginPath(); ctx.arc(ax, ay, r*0.22, 0, Math.PI*2); ctx.fill();
    // spinning rotor blur (two crossed translucent blades)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(e.rotor * (cx*cy < 0 ? 1 : -1));   // alternate spin direction
    ctx.fillStyle = COL.droneRotor;
    ctx.beginPath(); ctx.ellipse(0, 0, r*0.62, r*0.14, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, r*0.14, r*0.62, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // --- central chassis ---
  ctx.fillStyle = flash ? "#ffffff" : COL.droneBody;
  ctx.beginPath();
  ctx.arc(x, y, r*0.7, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : COL.droneDark;
  ctx.fillRect(x - r*0.5, y - r*0.16, r*1.0, r*0.32);   // body band
  ctx.strokeStyle = "#161c26";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r*0.7, 0, Math.PI*2);
  ctx.stroke();

  // sensor eye, tracks Dan
  const ea = Math.atan2(G.dan.y - e.y, G.dan.x - e.x);
  const ex = x + Math.cos(ea) * r*0.2, ey = y + Math.sin(ea) * r*0.2;
  ctx.fillStyle = flash ? "#ffffff" : COL.droneEye;
  ctx.beginPath(); ctx.arc(ex, ey, r*0.26, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#3a0d12";
  ctx.beginPath(); ctx.arc(ex, ey, r*0.11, 0, Math.PI*2); ctx.fill();

  // underside payload light: cyan idle, pulsing red while a bomb arms
  const lit = arming
    ? (Math.floor(performance.now()/90) % 2 === 0)
    : false;
  ctx.fillStyle = arming ? (lit ? COL.bombLight : "#7c2a2a") : COL.droneLight;
  ctx.globalAlpha = arming ? 1 : 0.7;
  ctx.beginPath(); ctx.arc(x, y + r*0.42, r*0.16, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;

  // HP pips above (2)
  const max = ENEMY.drone.hp;
  const pwid = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? COL.droneLight : "#1c2533";
    ctx.fillRect(x - r + h*pwid, y - r - 12, pwid - 2, 3);
  }
}

// Rare corporate overlord. Boss-tier: large dark-navy chassis, a missile launcher
// arm, and a red visor that flares while winding up a shot. HP pips = 6.
function drawManager(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const x = e.x, y = e.y;
  const flash = e.hitFlash > 0;
  const winding = e.winding > 0;
  const face = winding ? e.aim : Math.atan2(G.dan.y - e.y, G.dan.x - e.x);

  // Launch-telegraph: targeting beam down the aim lane, intensifies as it builds.
  if (winding){
    const intensity = 1 - e.winding / ENEMY.manager.windup;   // 0..1
    ctx.strokeStyle = "rgba(255,80,20," + (0.25 + 0.55*intensity).toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.setLineDash([6,5]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.aim)*180, y + Math.sin(e.aim)*180);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(face);

  // Missile launcher tube extending from the front
  ctx.fillStyle = flash ? "#ffffff" : COL.missileFin;
  ctx.fillRect(r*0.58, -r*0.26, r*1.05, r*0.52);   // tube
  ctx.fillStyle = flash ? "#ffffff" : COL.missile;
  ctx.fillRect(r*1.42, -r*0.15, r*0.46, r*0.30);   // warhead stub (armed)
  if (winding){
    // Warhead tip brightens orange as it's about to launch
    ctx.fillStyle = COL.missileWarhead;
    ctx.beginPath();
    ctx.arc(r*1.88, 0, r*0.14, 0, Math.PI*2);
    ctx.fill();
  }

  // Body: boxy executive chassis (wider than tall = imposing silhouette)
  ctx.fillStyle = flash ? "#ffffff" : COL.managerBody;
  ctx.fillRect(-r, -r*0.88, r*1.82, r*1.78);
  // Left shoulder plate (darker armour panel)
  ctx.fillStyle = flash ? "#ffffff" : COL.managerDark;
  ctx.fillRect(-r, -r*0.88, r*0.40, r*1.78);
  // Lower trim band
  ctx.fillStyle = flash ? "#ffffff" : COL.managerDark;
  ctx.fillRect(-r, r*0.52, r*1.82, r*0.38);
  // Lapel / insignia stripe
  ctx.fillStyle = flash ? "#ffffff" : COL.managerTrim;
  ctx.fillRect(r*0.14, -r*0.88, r*0.11, r*1.08);

  // Visor: narrow red slit (flares brighter while telegraphing a shot)
  ctx.fillStyle = flash ? "#ffffff" : COL.managerEye;
  ctx.globalAlpha = winding ? 1 : 0.88;
  ctx.fillRect(r*0.20, -r*0.44, r*0.52, r*0.34);
  ctx.globalAlpha = 1;
  if (winding){
    // Hot white core — the "eye" charges up
    ctx.fillStyle = "rgba(255,200,150,0.7)";
    ctx.fillRect(r*0.22, -r*0.42, r*0.48, r*0.30);
  }

  // Outline
  ctx.strokeStyle = "#0a1018";
  ctx.lineWidth = 2;
  ctx.strokeRect(-r, -r*0.88, r*1.82, r*1.78);
  ctx.restore();

  // HP pips above (6) — red to mark boss tier
  const max = ENEMY.manager.hp;
  const pw = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? COL.managerEye : "#1a1020";
    ctx.fillRect(x - r + h*pw, y - r - 11, pw - 2, 4);
  }
}

// Support / alarm emitter. Round chassis with a rotating radar dish + sweep wedge;
// while alarming, the chassis flushes red and an expanding alarm ring broadcasts.
function drawScanner(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const x = e.x, y = e.y;
  const flash = e.hitFlash > 0;
  const alarming = e.alarming;

  // Alarm broadcast: expanding red pulse ring while active.
  if (alarming){
    const t = (e.bob * 0.5) % 1;
    ctx.strokeStyle = "rgba(255,91,77," + (0.55 * (1 - t)).toFixed(2) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4 + t * 26, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(x, y);

  // round chassis (flushes red while alarming)
  ctx.fillStyle = flash ? "#ffffff" : (alarming ? COL.scannerAlarm : COL.scannerBody);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : COL.scannerDark;
  ctx.fillRect(-r*0.85, r*0.1, r*1.7, r*0.7);          // lower band
  ctx.strokeStyle = "#161c2a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();

  // rotating radar dish + sweep wedge
  ctx.save();
  ctx.rotate(e.sweep);
  ctx.fillStyle = alarming ? "rgba(255,91,77,0.16)" : "rgba(127,224,255,0.14)";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r*1.45, -0.38, 0.38); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = alarming ? COL.scannerAlarm : COL.scannerSweep;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r*0.95, 0); ctx.stroke();   // dish arm
  ctx.fillStyle = alarming ? COL.scannerAlarm : COL.scannerDish;
  ctx.beginPath(); ctx.arc(r*0.95, 0, r*0.22, 0, Math.PI*2); ctx.fill();    // dish head
  ctx.restore();

  // central sensor eye
  ctx.fillStyle = flash ? "#ffffff" : (alarming ? "#ffd23f" : COL.scannerSweep);
  ctx.beginPath(); ctx.arc(0, 0, r*0.22, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // HP pips above (2)
  const max = ENEMY.scanner.hp;
  const pw = (2*r) / max;
  for (let h = 0; h < max; h++){
    ctx.fillStyle = h < e.hp ? COL.scannerSweep : "#222a3a";
    ctx.fillRect(x - r + h*pw, y - r - 10, pw - 2, 3);
  }
}

// Wanderer / worker-hunter. A low, dark crawler with a grabber claw out front and
// a single eye that glows violet while wandering, hot red while hunting a worker.
function drawInventory(e){
  const grow = e.spawn > 0 ? (1 - e.spawn/0.4) : 1;
  const r = e.r * grow;
  const flash = e.hitFlash > 0;
  const hunting = e.mode === "hunt" && e.target;
  // Face travel/target direction.
  const face = hunting
    ? Math.atan2(e.target.y - e.y, e.target.x - e.x)
    : (e.heading ?? 0);
  const bobY = Math.sin(e.bob) * 1.2;
  const x = e.x, y = e.y + bobY;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(face);

  // skittering legs (three a side), animated
  ctx.strokeStyle = flash ? "#ffffff" : COL.inventoryDark;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++){
    const lx = i * r * 0.5;
    const kick = Math.sin(e.bob * 2 + i) * r * 0.22;
    ctx.beginPath();
    ctx.moveTo(lx, -r*0.5); ctx.lineTo(lx + kick, -r*1.05);
    ctx.moveTo(lx,  r*0.5); ctx.lineTo(lx - kick,  r*1.05);
    ctx.stroke();
  }

  // grabber claw out front (snaps while hunting)
  const snap = hunting ? Math.abs(Math.sin(e.bob * 3)) * r * 0.28 : r * 0.12;
  ctx.fillStyle = flash ? "#ffffff" : COL.inventoryClaw;
  ctx.fillRect(r*0.7, -r*0.5 - snap, r*0.5, r*0.22);
  ctx.fillRect(r*0.7,  r*0.28 + snap, r*0.5, r*0.22);

  // low carapace body
  ctx.fillStyle = flash ? "#ffffff" : COL.inventoryBody;
  ctx.fillRect(-r*0.9, -r*0.6, r*1.7, r*1.2);
  ctx.fillStyle = flash ? "#ffffff" : COL.inventoryDark;
  ctx.fillRect(-r*0.9, -r*0.6, r*0.5, r*1.2);     // dark rear plate
  ctx.strokeStyle = "#211a2c";
  ctx.lineWidth = 2;
  ctx.strokeRect(-r*0.9, -r*0.6, r*1.7, r*1.2);

  // single hunting eye
  ctx.fillStyle = flash ? "#ffffff" : (hunting ? COL.inventoryHunt : COL.inventoryEye);
  ctx.beginPath(); ctx.arc(r*0.25, 0, r*0.26, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1a1226";
  ctx.beginPath(); ctx.arc(r*0.32, 0, r*0.1, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // HP pip above (1)
  ctx.fillStyle = e.hp > 0 ? COL.inventoryEye : "#2a2036";
  ctx.fillRect(x - r*0.5, y - r - 9, r, 3);
}

