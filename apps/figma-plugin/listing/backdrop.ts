// The site's backdrop for the covers: its own shader and the home page's look. Bundle it for the page
// (`npx rolldown apps/figma-plugin/listing/backdrop.ts --format iife -o backdrop.js`), add it to
// assets.html?only=cover, call paintBackdrop on the cover's canvas, then screenshot the cover.
import { startBackdrop } from '../../web/src/lib/backdrop'

// The cover's look: halfway between the home page's backdrop and the inner pages' quieter one
// (Backdrop.astro, `full` and `subtle`).
const LOOK = {
  colorA: '#0e0e11',
  colorB: '#353642',
  contrast: 0.9,
  detail: 0.9,
  speed: 0.06,
  grain: 0.78,
  light: false,
}
;(globalThis as unknown as { paintBackdrop: unknown }).paintBackdrop = (canvas: HTMLCanvasElement) =>
  startBackdrop(canvas, () => LOOK)
