// Small panel for Trim and Crop: shows a preview of the first file and lets you choose before running.
import "./fonts.js";
import "./options.css";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, saveSettings, applyPalette } from "./palettes.js";
import { kindsOf, rowsFor, RATIOS } from "./kinds.js";

applyPalette(document.documentElement, loadSettings());
listen("settings-changed", (e) => applyPalette(document.documentElement, e.payload));
addEventListener("storage", () => applyPalette(document.documentElement, loadSettings()));

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let job = { action: "", paths: [], kind: "", duration: 0 };
let ratio = "1:1", fx = 0.5, fy = 0.5, sc = 0.85;
let tS = 0, tE = 0;
let thumbTimer = null;

const fmt = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};
const parse = (v) => String(v).trim().split(":").reduce((a, x) => a * 60 + (parseFloat(x) || 0), 0);
const hide = () => invoke("hide_options").catch(() => {});

// ---------- option rows (click, scroll the mouse wheel, or use the arrow keys) ----------
let vals = {};
function buildRow(row, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  const lab = document.createElement("span");
  lab.className = "lab";
  lab.textContent = row.label;
  const grp = document.createElement("div");
  grp.className = "chips";
  grp.setAttribute("role", "radiogroup");
  grp.tabIndex = 0;
  const btns = row.opts.map(([v, text]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.setAttribute("role", "radio");
    b.tabIndex = -1;
    b.dataset.v = v;
    b.textContent = text;
    b.addEventListener("click", () => pick(v));
    grp.appendChild(b);
    return b;
  });
  const values = row.opts.map((o) => o[0]);
  function paint() {
    btns.forEach((b) => b.setAttribute("aria-checked", b.dataset.v === String(vals[row.key])));
  }
  function pick(v) {
    vals[row.key] = v;
    paint();
    onChange && onChange(v);
  }
  const step = (d) => {
    const i = values.indexOf(String(vals[row.key]));
    pick(values[(i + d + values.length) % values.length]);
  };
  grp.addEventListener("wheel", (e) => { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  grp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
  });
  if (!values.includes(String(vals[row.key]))) vals[row.key] = values[0];
  paint();
  wrap.append(lab, grp);
  return wrap;
}

// ---------- crop ----------
function layoutCrop() {
  const img = $("img"), box = $("crop"), stage = $("stage");
  if (!img.naturalWidth) return;
  const cw = stage.clientWidth, ch = stage.clientHeight, ia = img.naturalWidth / img.naturalHeight;
  const dw = ia > cw / ch ? cw : ch * ia, dh = ia > cw / ch ? cw / ia : ch;
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
  const [rw, rh] = ratio.split(":").map(Number), r = rw / rh;
  const maxW = ia > r ? dh * r : dw, maxH = ia > r ? dh : dw / r;
  const w = maxW * sc, h = maxH * sc;
  box.style.width = w + "px";
  box.style.height = h + "px";
  box.style.left = ox + (dw - w) * fx + "px";
  box.style.top = oy + (dh - h) * fy + "px";
  box._m = { ox, oy, dw, dh, w, h, maxW, maxH, r };
  const sz = $("sz");
  if (sz) { sz.value = Math.round(sc * 100); $("szv").textContent = Math.round(sc * 100) + "%"; }
}

(() => {
  const box = $("crop"), stage = $("stage");
  let drag = null;
  // move the box
  box.addEventListener("pointerdown", (e) => {
    box.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, fx, fy };
  });
  box.addEventListener("pointermove", (e) => {
    if (!drag || !box._m) return;
    const { dw, dh, w, h } = box._m;
    if (dw - w > 1) fx = clamp(drag.fx + (e.clientX - drag.x) / (dw - w), 0, 1);
    if (dh - h > 1) fy = clamp(drag.fy + (e.clientY - drag.y) / (dh - h), 0, 1);
    layoutCrop();
  });
  box.addEventListener("pointerup", () => { drag = null; });

  // resize from a corner: the opposite corner stays where it is
  box.querySelectorAll(".hd").forEach((hd) => {
    let rs = null;
    hd.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      hd.setPointerCapture(e.pointerId);
      const m = box._m, sr = stage.getBoundingClientRect();
      const left = m.ox + (m.dw - m.w) * fx, top = m.oy + (m.dh - m.h) * fy;
      const hx = hd.dataset.x === "1", hy = hd.dataset.y === "1";
      rs = { sr, ax: hx ? left : left + m.w, ay: hy ? top : top + m.h, sx: hx ? 1 : -1, sy: hy ? 1 : -1 };
    });
    hd.addEventListener("pointermove", (e) => {
      if (!rs) return;
      const m = box._m, px = e.clientX - rs.sr.left, py = e.clientY - rs.sr.top;
      const availX = rs.sx > 0 ? m.ox + m.dw - rs.ax : rs.ax - m.ox;
      const availY = rs.sy > 0 ? m.oy + m.dh - rs.ay : rs.ay - m.oy;
      const w = clamp(Math.abs(px - rs.ax), m.maxW * 0.1, Math.max(m.maxW * 0.1, Math.min(availX, availY * m.r)));
      const h = w / m.r;
      const left = rs.sx > 0 ? rs.ax : rs.ax - w, top = rs.sy > 0 ? rs.ay : rs.ay - h;
      sc = clamp(w / m.maxW, 0.1, 1);
      fx = m.dw - w > 1 ? clamp((left - m.ox) / (m.dw - w), 0, 1) : 0.5;
      fy = m.dh - h > 1 ? clamp((top - m.oy) / (m.dh - h), 0, 1) : 0.5;
      layoutCrop();
    });
    hd.addEventListener("pointerup", () => { rs = null; });
  });

  // mouse wheel over the picture resizes the box
  stage.addEventListener("wheel", (e) => {
    if (job.action !== "crop") return;
    e.preventDefault();
    sc = clamp(sc + (e.deltaY < 0 ? 0.05 : -0.05), 0.1, 1);
    layoutCrop();
  }, { passive: false });
})();
$("img").addEventListener("load", () => { if (job.action === "crop") layoutCrop(); });

// ---------- trim ----------
function layoutTrim() {
  const d = job.duration || 0;
  if (!d) return;
  const a = (tS / d) * 100, b = (tE / d) * 100;
  $("hS").style.left = a + "%";
  $("hE").style.left = b + "%";
  $("fill").style.left = a + "%";
  $("fill").style.width = Math.max(0, b - a) + "%";
  $("tS").value = fmt(tS);
  $("tE").value = fmt(tE);
  $("keep").textContent = `keeps ${(tE - tS).toFixed(1)} s`;
}
function previewAt(t) {
  if (job.kind !== "video") return;
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    invoke("thumb", { path: job.paths[0], t }).then((u) => { $("img").src = u; }).catch(() => {});
  }, 140);
}
function setStart(v) { tS = clamp(v, 0, Math.max(0, tE - 0.1)); layoutTrim(); previewAt(tS); }
function setEnd(v) { tE = clamp(v, Math.min(job.duration, tS + 0.1), job.duration); layoutTrim(); previewAt(Math.max(0, tE - 0.1)); }

["hS", "hE"].forEach((id) => {
  const h = $(id);
  h.addEventListener("pointerdown", (e) => { h.setPointerCapture(e.pointerId); h._d = true; });
  h.addEventListener("pointermove", (e) => {
    if (!h._d) return;
    const r = $("track").getBoundingClientRect();
    const t = clamp((e.clientX - r.left) / r.width, 0, 1) * job.duration;
    id === "hS" ? setStart(t) : setEnd(t);
  });
  h.addEventListener("pointerup", () => { h._d = false; });
});
$("tS").addEventListener("change", () => setStart(parse($("tS").value)));
$("tE").addEventListener("change", () => setEnd(parse($("tE").value)));

// ---------- opening, running ----------
function message(text) {
  $("empty").textContent = text;
  $("empty").hidden = false;
  $("run").disabled = true;
}

listen("options-open", (e) => {
  const p = e.payload;
  job = { action: p.action, paths: p.paths, kind: p.kind, duration: p.duration || 0 };
  const kinds = kindsOf(p.paths);
  vals = { ...loadSettings().actions };
  const name = p.paths[0].split(/[\\/]/).pop();
  $("title").textContent = p.action.toUpperCase();
  $("file").textContent = name + (p.paths.length > 1 ? `  +${p.paths.length - 1} more` : "");
  $("run").textContent = p.action[0].toUpperCase() + p.action.slice(1);
  $("run").disabled = false;
  $("empty").hidden = true;
  $("crop").hidden = true;
  $("stage").hidden = p.action !== "crop" && p.action !== "trim";
  $("trimUi").hidden = p.action !== "trim";
  $("rows").replaceChildren();
  $("hint").textContent = "";
  $("img").removeAttribute("src");
  $("img").style.visibility = p.thumb ? "visible" : "hidden";
  if (p.thumb) $("img").src = p.thumb;

  if (p.action === "crop") {
    if (p.kind !== "image" && p.kind !== "video") return message("Crop works on photos and video.");
    ratio = RATIOS.includes(vals.crop) ? vals.crop : "1:1";
    vals.crop = ratio;
    fx = fy = 0.5;
    $("crop").hidden = false;
    $("rows").appendChild(buildRow({ key: "crop", label: "Ratio", opts: RATIOS.map((r) => [r, r]) }, (v) => { ratio = v; layoutCrop(); }));
    const sz = document.createElement("div");
    sz.className = "row";
    sz.innerHTML = '<span class="lab">Size<b id="szv"></b></span><input type="range" id="sz" min="10" max="100" step="1" />';
    $("rows").appendChild(sz);
    sc = 0.85;
    $("sz").addEventListener("input", () => { sc = $("sz").value / 100; layoutCrop(); });
    $("hint").textContent = "Drag the box to move it. Drag a corner, use the slider or scroll over the picture to resize.";
    layoutCrop();
  } else if (p.action === "trim") {
    if (p.kind !== "video" && p.kind !== "audio") return message("Trim works on video and audio.");
    if (p.kind === "audio") { $("stage").hidden = true; }
    tS = 0;
    tE = job.duration;
    $("track").hidden = !job.duration;
    if (!job.duration) {
      $("tS").value = "0:00.0";
      $("tE").value = "0:10.0";
      $("keep").textContent = "length unknown";
    } else {
      layoutTrim();
    }
  } else {
    rowsFor(p.action, kinds).forEach((r) => $("rows").appendChild(buildRow(r)));
    $("hint").textContent = "Scroll or click to change. Enter to run.";
  }
});

function run() {
  if ($("run").disabled) return;
  const o = { ...loadSettings().actions, ...vals };
  if (job.action === "crop") {
    o.crop = ratio; o.cropX = fx; o.cropY = fy; o.cropScale = sc;
  } else if (job.action === "trim") {
    o.trimStart = job.duration ? tS : parse($("tS").value);
    const end = job.duration ? tE : parse($("tE").value);
    o.trimEnd = job.duration && end >= job.duration - 0.05 ? 0 : end;
  }
  // remember the choices (not the one-off crop position or trim times) for next time
  const saved = loadSettings();
  saved.actions = { ...saved.actions, ...vals };
  saveSettings(saved);
  emit("settings-changed", saved).catch(() => {});
  invoke("run_action", { action: job.action, paths: job.paths, options: o }).catch(() => {});
  hide();
}
$("run").addEventListener("click", run);
$("cancel").addEventListener("click", hide);
$("x").addEventListener("click", hide);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") hide();
  else if (e.key === "Enter" && e.target.tagName !== "BUTTON") run();
});
