/* =========================================================================
   palette.js — colors, grounded in the warehouse / janitorial world.
   Rendering-only data, kept out of the logic modules. No imports.
   ========================================================================= */

export const COL = {
  floorA:"#1c1f26", floorB:"#20242c", grid:"#2a2f39",
  shelfTop:"#9c6b3a", shelfSide:"#6f4a25", shelfEdge:"#caa06a",
  steel:"#454b55",
  danBody:"#2f6fb0", danTrim:"#1d4f86", danSkin:"#e3b58a", danMop:"#c8cdd4",
  bubbleFill:"rgba(120,210,255,0.32)", bubbleRim:"rgba(190,240,255,0.95)",
  picker:"#c0392b", pickerPanel:"#e6e9ec", pickerEye:"#ffd23f",
  forkliftBody:"#e0a32e", forkliftDark:"#8a6418", forkliftFork:"#c9ccd1", chargeWarn:"#ff5b4d",
  securityBody:"#2b3340", securityDark:"#1a202a", securityTrim:"#cfd6df", securityVisor:"#ff3b5c",
  bolt:"#8be4ff", boltCore:"#ffffff", boltGlow:"rgba(110,200,255,0.5)",
  sorterBody:"#7a8a5c", sorterDark:"#55633f", sorterEye:"#ffe27a",
  box:"#c79a5b", boxDark:"#9c7338", boxTape:"#e6d4ad",
  cleanerBody:"#2f8f86", cleanerDark:"#1f6259", cleanerTank:"#bfe9d2", cleanerNozzle:"#cfd6df",
  spray:"#9bff7a", sprayDark:"#5fd06a",
  droneBody:"#3b4a63", droneDark:"#26303f", droneRotor:"rgba(180,214,255,0.45)",
  droneEye:"#ff5b6e", droneLight:"#7fe0ff", droneShadow:"rgba(0,0,0,0.30)",
  bomb:"#b5742e", bombDark:"#7c4d1a", bombStripe:"#ffd23f", bombLight:"#ff4d4d",
  managerBody:"#1e2d40", managerDark:"#111c28", managerTrim:"#8090a8", managerEye:"#e04020",
  missile:"#703020", missileFin:"#9aa0a8", missileWarhead:"#ff5020",
  terminal:"#3a4250", terminalLit:"#5dff8f",
  amber:"#ffb627", soap:"#5fd2ff", atomic:"#5dff8f", text:"#e8ebef",
};

// Spawner-terminal emitter tint by the enemy type it produces (readability for
// when levels eventually mix types). Falls back to the generic green.
export const TERMINAL_TINT = {
  picker: "#ff6a5a", forklift: "#ffc24a", security: COL.bolt, sorter: "#b7c98a",
  cleaner: COL.spray, drone: "#a6c8ff", manager: "#ff7020",
};
