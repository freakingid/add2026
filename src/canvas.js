/* =========================================================================
   canvas.js — the drawing surface and its 2D context, shared by input
   (listener targets / coordinate mapping) and every render module.
   ========================================================================= */

export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

export const VIEW_W = canvas.width;   // 960
export const VIEW_H = canvas.height;  // 640
