// Small HUD notice in the corner of the screen: progress, done, or error for each job.
import "./fonts.js";
import "./toast.css";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, applyPalette } from "./palettes.js";

applyPalette(document.documentElement, loadSettings());
listen("settings-changed", (e) => applyPalette(document.documentElement, e.payload));
addEventListener("storage", () => applyPalette(document.documentElement, loadSettings()));

const $ = (id) => document.getElementById(id);
const card = $("card");
let hideTimer = null;
let output = null;

const hide = () => invoke("hide_toast").catch(() => {});

listen("job-update", (e) => {
  const j = e.payload;
  clearTimeout(hideTimer);
  output = j.output || null;
  card.dataset.state = j.state;
  $("act").textContent = j.action.toUpperCase() + (j.total > 1 ? ` ${j.index}/${j.total}` : "");
  $("name").textContent = j.name;
  const indet = j.state === "running" && j.percent == null;
  card.dataset.indet = indet ? "1" : "0";
  $("fill").style.width = j.state === "running" ? (j.percent == null ? "" : j.percent + "%") : "100%";
  if (j.state === "running") {
    $("msg").textContent = j.percent == null ? "working" : Math.floor(j.percent) + "%";
    $("hint").textContent = "";
  } else if (j.state === "done") {
    $("msg").textContent = "done";
    $("hint").textContent = j.output ? "Click to show in folder" : "";
    if (j.index >= j.total) hideTimer = setTimeout(hide, 6000);
  } else {
    $("msg").textContent = "failed";
    $("hint").textContent = j.message;
    if (j.index >= j.total) hideTimer = setTimeout(hide, 9000);
  }
});

card.addEventListener("click", () => {
  if (card.dataset.state === "done" && output) {
    invoke("reveal", { path: output }).catch(() => {});
    hide();
  }
});
$("x").addEventListener("click", (ev) => { ev.stopPropagation(); hide(); });
