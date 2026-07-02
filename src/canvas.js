/* =========================================================================
   canvas.js — the drawing surface and its 2D context, shared by input
   (listener targets / coordinate mapping) and every render module.
   ========================================================================= */

export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

export let VIEW_W = canvas.width;
export let VIEW_H = canvas.height;
export let UI_SCALE = 1;

const BASE_W = 1280, BASE_H = 720;

export function setResolution(w, h){
  canvas.width = w;
  canvas.height = h;
  VIEW_W = w;
  VIEW_H = h;
  UI_SCALE = w / BASE_W;   // == h / BASE_H at both target resolutions (16:9)
}
