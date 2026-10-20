// Overlay window: the ring that appears under the cursor while a file is dragged with Shift held.
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./fonts.js";
import "./ring.css";
import { RingView, sliceAt, ACTIONS, C } from "./ring.js";
import { loadSettings, applyPalette } from "./palettes.js";

// The ring is drawn at 600x600 and shown at half size. The window in tauri.conf.json must be 600 * SCALE.
const SCALE = 0.75;
const scene = document.querySelector(".ring-scene");
scene.style.transformOrigin = "0 0";
scene.style.transform = `scale(${SCALE})`;

const log = (m) => invoke("log", { msg: m }).catch(() => {});
let settings = loadSettings();
applyPalette(document.documentElement, settings);

// Build the ring once at launch so the first open is not a cold start.
const view = new RingView(document.getElementById("stage"), settings.design);
view.setPaused(true);

function applySettings(s) {
  settings = s;
  applyPalette(document.documentElement, s);
  view.setDesign(s.design);
}
listen("settings-changed", (e) => applySettings(e.payload));
addEventListener("storage", () => applySettings(loadSettings()));

// Frame-time log for each opening, to keep an eye on smoothness.
function watchFrames() {
  const deltas = [];
  let last = performance.now();
  const t0 = last;
  const step = (now) => {
    deltas.push(now - last);
    last = now;
    if (now - t0 < 700) requestAnimationFrame(step);
    else {
      const d = deltas.slice(1);
      if (!d.length) return;
      const avg = d.reduce((a, b) => a + b, 0) / d.length;
      log(`opening: ${d.length} frames, avg ${avg.toFixed(1)} ms (${(1000 / avg).toFixed(0)} fps), worst ${Math.max(...d).toFixed(1)} ms, over 20 ms: ${d.filter((x) => x > 20).length}`);
    }
  };
  requestAnimationFrame(step);
}

listen("menu-open", (e) => {
  const sent = e.payload.ts;
  view.setHot(-1);
  view.setPointer(0, 0);
  view.play(); // also resumes the idle spin
  requestAnimationFrame(() => {
    log(`menu painted ${Date.now() - sent} ms after Rust opened it`);
    watchFrames();
  });
});
listen("menu-close", () => {
  view.setHot(-1);
  // stop the idle animation once the ring has had time to leave the screen
  setTimeout(() => view.setPaused(true), 600);
});

// While a file is dragged the OS owns the mouse, so the drag position drives the highlight and tilt.
getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  const dpr = window.devicePixelRatio || 1;
  const x = p.position ? p.position.x / dpr / SCALE : C;
  const y = p.position ? p.position.y / dpr / SCALE : C;
  const idx = p.position ? sliceAt(x - C, y - C) : -1;
  if (p.type === "enter") {
    log(`drag ENTER with ${p.paths.length} file(s), first: ${p.paths[0]}`);
    view.setHot(idx);
  } else if (p.type === "over") {
    view.setHot(idx);
    view.setPointer((x - C) / C, (y - C) / C);
  } else if (p.type === "drop") {
    log(`DROP on slice: ${idx >= 0 ? ACTIONS[idx].n : "none (outside ring)"} | files: ${p.paths.join(" ; ")}`);
    if (idx >= 0) {
      view.flash(idx);
      invoke("run_action", { action: ACTIONS[idx].n.toLowerCase(), paths: p.paths, options: settings.actions }).catch((e) => log("run_action failed: " + e));
    }
    view.setHot(-1);
  } else if (p.type === "leave") {
    log("drag LEAVE");
    view.setHot(-1);
  }
});
log("overlay loaded, ring built");
