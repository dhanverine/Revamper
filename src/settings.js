// Settings window: choose the ring design and colours, with a live preview.
import "./fonts.js";
import "./ring.css";
import "./settings.css";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { RingView, sliceAt, C } from "./ring.js";
import { PALETTES, DESIGNS, loadSettings, saveSettings, applyPalette } from "./palettes.js";

let s = loadSettings();
const root = document.documentElement;
applyPalette(root, s);
const view = new RingView(document.getElementById("stage"), s.design);
view.play();

const scene = document.getElementById("previewScene");
const preview = document.getElementById("preview");
function fit() {
  const k = Math.min(preview.clientWidth / 640, preview.clientHeight / 640, 1);
  scene.style.setProperty("--fit", k.toFixed(3));
}
addEventListener("resize", fit);
fit();

// Hover and tilt on the preview, same maths as the real overlay.
preview.addEventListener("pointermove", (e) => {
  const r = scene.getBoundingClientRect();
  const k = r.width / 600 || 1;
  const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
  view.setHot(sliceAt(x - C, y - C));
  view.setPointer((e.clientX - (r.left + r.width / 2)) / (preview.clientWidth / 2), (e.clientY - (r.top + r.height / 2)) / (preview.clientHeight / 2));
});
preview.addEventListener("pointerleave", () => { view.setHot(-1); view.setPointer(0, 0); });
preview.addEventListener("pointerdown", (e) => {
  const r = scene.getBoundingClientRect();
  const k = r.width / 600 || 1;
  const i = sliceAt((e.clientX - r.left) / k - C, (e.clientY - r.top) / k - C);
  if (i >= 0) view.flash(i);
});

function commit() {
  saveSettings(s);
  applyPalette(root, s);
  emit("settings-changed", s).catch(() => {});
}

const designsEl = document.getElementById("designs");
DESIGNS.forEach((d) => {
  const b = document.createElement("button");
  b.className = "opt";
  b.setAttribute("role", "radio");
  b.dataset.id = d.id;
  b.innerHTML = `<span><b>${d.name}</b><small>${d.blurb}</small></span>`;
  b.addEventListener("click", () => {
    s.design = d.id;
    view.setDesign(d.id);
    view.play();
    refresh();
    commit();
  });
  designsEl.appendChild(b);
});

const palEl = document.getElementById("palettes");
const cLine = document.getElementById("cLine"), cHot = document.getElementById("cHot"), cDrop = document.getElementById("cDrop");
PALETTES.forEach((p) => {
  const b = document.createElement("button");
  b.className = "opt";
  b.setAttribute("role", "radio");
  b.dataset.id = p.id;
  const sw = p.id === "custom" ? `<span class="sw rainbow"></span>` : `<span class="sw" style="background:linear-gradient(135deg,${p.line} 0 50%,${p.fill} 50% 100%)"></span>`;
  b.innerHTML = `${sw}<span><b>${p.name}</b></span>`;
  b.addEventListener("click", () => { s.palette = p.id; refresh(); commit(); });
  palEl.appendChild(b);
});
[[cLine, "line"], [cHot, "hot"], [cDrop, "drop"]].forEach(([el, k]) =>
  el.addEventListener("input", () => { s.palette = "custom"; s.custom[k] = el.value; refresh(); commit(); })
);

function refresh() {
  designsEl.querySelectorAll(".opt").forEach((b) => b.setAttribute("aria-checked", b.dataset.id === s.design));
  palEl.querySelectorAll(".opt").forEach((b) => b.setAttribute("aria-checked", b.dataset.id === s.palette));
  document.getElementById("custom").hidden = s.palette !== "custom";
  cLine.value = s.custom.line; cHot.value = s.custom.hot; cDrop.value = s.custom.drop;
}
refresh();

// Action options (used when a file is dropped on a slice)
document.querySelectorAll("#actions [data-k]").forEach((el) => {
  const k = el.dataset.k;
  el.value = s.actions[k];
  el.addEventListener("change", () => {
    s.actions[k] = el.type === "number" ? Math.max(0, parseFloat(el.value) || 0) : el.value;
    commit();
  });
});

// Launch at Windows startup
const auto = document.getElementById("autostart");
invoke("get_autostart").then((on) => { auto.checked = !!on; }).catch(() => {});
auto.addEventListener("change", () => {
  invoke("set_autostart", { enabled: auto.checked }).catch(() => { auto.checked = !auto.checked; });
});
