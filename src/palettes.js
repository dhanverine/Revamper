// Colour presets and settings storage shared by the overlay and the settings window.
export const PALETTES = [
  { id: "cyan", name: "HUD cyan", line: "#38E8FF", hot: "#E4FDFF", fill: "#38E8FF", text: "#BFF6FF", drop: "#FFB347", slice: "rgba(4,22,34,.82)", hubbg: "rgba(3,14,24,.94)" },
  { id: "sanzo", name: "Vivid Sanzo", line: "#F6E700", hot: "#F6E700", fill: "#F3680F", text: "#FFD0B8", drop: "#97E4C2", slice: "rgba(17,31,67,.86)", hubbg: "rgba(9,18,42,.94)" },
  { id: "blend", name: "Cyan and citron", line: "#38E8FF", hot: "#F6E700", fill: "#F6E700", text: "#D8FBFF", drop: "#F3680F", slice: "rgba(6,20,40,.86)", hubbg: "rgba(4,14,30,.94)" },
  { id: "red", name: "Red alert", line: "#FF5A3C", hot: "#FFD9CF", fill: "#FF3B1F", text: "#FFB8A8", drop: "#38E8FF", slice: "rgba(32,6,8,.86)", hubbg: "rgba(20,4,6,.94)" },
  { id: "custom", name: "Custom" },
];
export const DESIGNS = [
  { id: "reactor", name: "Reactor", blurb: "Hex hub, bold plate arcs, dotted burst" },
  { id: "console", name: "Console", blurb: "Round hub, corner brackets, side readouts, scan sweep" },
];
export const DEFAULTS = { design: "reactor", palette: "sanzo", custom: { line: "#38e8ff", hot: "#f6e700", drop: "#ff7a2f" }, actions: { ask: true, quality: "balanced", videoFmt: "mp4", imageFmt: "jpg", audioFmt: "mp3", crop: "1:1", imageLayout: "row", trimStart: 0, trimEnd: 10 } };
const KEY = "revamper-settings";

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...s, custom: { ...DEFAULTS.custom, ...(s.custom || {}) }, actions: { ...DEFAULTS.actions, ...(s.actions || {}) } };
  } catch (_) {
    return { ...DEFAULTS };
  }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}
const mix = (a, b, t) => `color-mix(in srgb,${a} ${t}%,${b})`;
export function applyPalette(el, s) {
  let p = PALETTES.find((x) => x.id === s.palette) || PALETTES[1];
  if (p.id === "custom") {
    const { line, hot, drop } = s.custom;
    p = { line, hot, fill: hot, text: mix(line, "#fff", 45), drop, slice: mix(line, "#050810", 9), hubbg: mix(line, "#03060c", 5) };
  }
  for (const k of ["line", "hot", "fill", "text", "drop", "slice", "hubbg"]) el.style.setProperty("--" + k, p[k]);
  el.style.setProperty("--accent", p.hot);
}
