// What kind of file is this, and which choices make sense for it. Shared by the ring and the options panel.
const EXT = {
  image: ["jpg", "jpeg", "png", "webp", "bmp", "heic", "heif", "tif", "tiff"],
  audio: ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "wma"],
  video: ["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv"],
  archive: ["zip", "7z", "rar", "tar", "tgz"],
};
export const kindOf = (p) => {
  const e = (p.split(".").pop() || "").toLowerCase();
  for (const k in EXT) if (EXT[k].includes(e)) return k;
  return "unknown";
};
export const kindsOf = (paths) => [...new Set(paths.map(kindOf))];

const up = (a) => a.map((v) => [v, v.toUpperCase()]);
export const RATIOS = ["1:1", "4:5", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
const QUALITY = { key: "quality", label: "Quality", opts: [["high", "High"], ["balanced", "Balanced"], ["small", "Smallest"]] };

/** The choices to show for an action, given the kinds of files dropped. */
export function rowsFor(action, kinds) {
  const has = (k) => kinds.includes(k);
  const rows = [];
  if (action === "convert") {
    if (has("video")) rows.push({ key: "videoFmt", label: "Video to", opts: up(["mp4", "mkv", "webm"]) });
    if (has("image")) rows.push({ key: "imageFmt", label: "Photo to", opts: up(["jpg", "png", "webp", "bmp"]) });
    if (has("audio")) rows.push({ key: "audioFmt", label: "Audio to", opts: up(["mp3", "wav", "flac", "opus", "m4a"]) });
    if (rows.length) rows.push(QUALITY);
  } else if (action === "compress") {
    if (has("video") || has("image") || has("audio")) rows.push(QUALITY);
  } else if (action === "extract") {
    if (has("video")) rows.push({ key: "audioFmt", label: "Audio format", opts: up(["mp3", "wav", "flac", "opus", "m4a"]) });
  } else if (action === "merge") {
    if (has("image")) rows.push({ key: "imageLayout", label: "Photos", opts: [["row", "Side by side"], ["column", "Stacked"]] });
  }
  return rows;
}

export const needsPanel = (action, kinds, ask) => action === "crop" || action === "trim" || (ask && rowsFor(action, kinds).length > 0);
export const panelHeight = (action, kinds) => (action === "crop" ? 600 : action === "trim" ? 530 : 170 + rowsFor(action, kinds).length * 68);
