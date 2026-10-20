// FFmpeg engine: finds FFmpeg, probes files, builds the command for each action,
// tries encoders in order (hardware first, then software), and reports progress.
use serde::Deserialize;
use std::{
    io::{BufRead, BufReader, Read},
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::OnceLock,
    thread,
};

const NO_WINDOW: u32 = 0x0800_0000;

#[derive(Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Options {
    pub quality: String,   // high | balanced | small
    pub video_fmt: String, // mp4 | mkv | webm
    pub image_fmt: String, // jpg | png | webp | bmp
    pub audio_fmt: String, // mp3 | wav | flac | opus | m4a
    pub crop: String,      // 1:1, 16:9 ...
    pub image_layout: String, // row | column (photo merge)
    pub trim_start: f64,
    pub trim_end: f64, // 0 = to the end
}

impl Default for Options {
    fn default() -> Self {
        Options {
            quality: "balanced".into(),
            video_fmt: "mp4".into(),
            image_fmt: "jpg".into(),
            audio_fmt: "mp3".into(),
            crop: "1:1".into(),
            image_layout: "row".into(),
            trim_start: 0.0,
            trim_end: 10.0,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Image,
    Audio,
    Video,
    Unknown,
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase()
}

pub fn kind_of(p: &Path) -> Kind {
    match ext_of(p).as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "bmp" | "heic" | "heif" | "tif" | "tiff" => Kind::Image,
        "mp3" | "wav" | "flac" | "ogg" | "opus" | "m4a" | "aac" | "wma" => Kind::Audio,
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" | "wmv" | "flv" => Kind::Video,
        _ => Kind::Unknown,
    }
}

fn cap(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

fn sv(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| x.to_string()).collect()
}

// ---------- finding and running FFmpeg ----------

pub fn find_ffmpeg() -> Option<PathBuf> {
    static F: OnceLock<Option<PathBuf>> = OnceLock::new();
    F.get_or_init(|| {
        if let Ok(p) = std::env::var("REVAMPER_FFMPEG") {
            let p = PathBuf::from(p);
            if p.is_file() {
                return Some(p);
            }
        }
        let mut starts: Vec<PathBuf> = Vec::new();
        if let Ok(e) = std::env::current_exe() {
            if let Some(d) = e.parent() {
                starts.push(d.to_path_buf());
            }
        }
        if let Ok(d) = std::env::current_dir() {
            starts.push(d);
        }
        for s in starts {
            for dir in s.ancestors() {
                for rel in ["ffmpeg/bin/ffmpeg.exe", "vendor/ffmpeg/bin/ffmpeg.exe", "ffmpeg.exe"] {
                    let c = dir.join(rel);
                    if c.is_file() {
                        return Some(c);
                    }
                }
            }
        }
        None
    })
    .clone()
}

fn cmd(ff: &Path) -> Command {
    let mut c = Command::new(ff);
    c.creation_flags(NO_WINDOW);
    c
}

fn encoders(ff: &Path) -> &'static Vec<String> {
    static E: OnceLock<Vec<String>> = OnceLock::new();
    E.get_or_init(|| {
        let mut names = Vec::new();
        if let Ok(o) = cmd(ff).args(["-hide_banner", "-encoders"]).output() {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            for line in text.lines() {
                let mut it = line.split_whitespace();
                let flags = it.next().unwrap_or("");
                let name = it.next().unwrap_or("");
                if flags.len() == 6 && (flags.starts_with('V') || flags.starts_with('A')) && !name.is_empty() {
                    names.push(name.to_string());
                }
            }
        }
        names
    })
}

#[derive(Default, Debug)]
pub struct Probe {
    pub duration: Option<f64>,
    pub has_audio: bool,
    pub has_video: bool,
    pub size: Option<(u32, u32)>,
}

fn parse_hms(t: &str) -> Option<f64> {
    let p: Vec<&str> = t.split(':').collect();
    if p.len() != 3 {
        return None;
    }
    Some(p[0].parse::<f64>().ok()? * 3600.0 + p[1].parse::<f64>().ok()? * 60.0 + p[2].parse::<f64>().ok()?)
}

fn find_size(line: &str) -> Option<(u32, u32)> {
    for tok in line.split(|c: char| c == ' ' || c == ',' || c == '[') {
        if let Some((a, b)) = tok.split_once('x') {
            if let (Ok(w), Ok(h)) = (a.parse::<u32>(), b.parse::<u32>()) {
                if w >= 16 && h >= 16 {
                    return Some((w, h));
                }
            }
        }
    }
    None
}

pub fn probe(ff: &Path, path: &Path) -> Probe {
    let mut p = Probe::default();
    let out = cmd(ff).args(["-hide_banner", "-nostdin", "-i"]).arg(path).output();
    let text = match out {
        Ok(o) => String::from_utf8_lossy(&o.stderr).to_string(),
        Err(_) => return p,
    };
    if let Some(i) = text.find("Duration: ") {
        let t = text[i + 10..].split(',').next().unwrap_or("").trim().to_string();
        p.duration = parse_hms(&t);
    }
    for line in text.lines() {
        if line.contains(" Video: ") && !line.contains("attached pic") {
            p.has_video = true;
            if p.size.is_none() {
                p.size = find_size(line);
            }
        }
        if line.contains(" Audio: ") {
            p.has_audio = true;
        }
    }
    p
}

fn tail(err: &str) -> String {
    let line = err.lines().rev().map(|l| l.trim()).find(|l| !l.is_empty()).unwrap_or("FFmpeg failed");
    let mut s: String = line.chars().take(200).collect();
    if s.is_empty() {
        s = "FFmpeg failed".into();
    }
    s
}

fn run_ffmpeg(ff: &Path, args: &[String], dur: Option<f64>, prog: &mut dyn FnMut(Option<f64>)) -> Result<(), String> {
    let mut child = cmd(ff)
        .args(["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats"])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start FFmpeg: {e}"))?;
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = thread::spawn(move || {
        let mut b = Vec::new();
        let _ = stderr.read_to_end(&mut b);
        String::from_utf8_lossy(&b).to_string()
    });
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if let Some(v) = line.strip_prefix("out_time_us=") {
            if let (Ok(us), Some(d)) = (v.trim().parse::<f64>(), dur) {
                if d > 0.0 {
                    prog(Some((us / 1e6 / d * 100.0).clamp(0.0, 99.0)));
                }
            }
        }
    }
    let status = child.wait();
    let err = reader.join().unwrap_or_default();
    match status {
        Ok(s) if s.success() => Ok(()),
        _ => Err(tail(&err)),
    }
}

// ---------- encoder choices ----------

fn video_plans(have: &[String], q: &str, ext: &str) -> Vec<Vec<String>> {
    let has = |n: &str| have.iter().any(|x| x == n);
    let (qsv, mf, crf, br) = match q {
        "high" => ("21", "80", "26", "6M"),
        "small" => ("32", "45", "38", "1800k"),
        _ => ("26", "65", "32", "3500k"),
    };
    let ab = if q == "small" { "96k" } else { "160k" };
    let webm = ext == "webm";
    let audio: Vec<String> = if webm {
        if has("libopus") { sv(&["-c:a", "libopus", "-b:a", ab]) } else { sv(&["-an"]) }
    } else if has("aac") {
        sv(&["-c:a", "aac", "-b:a", ab])
    } else {
        sv(&["-an"])
    };
    let mut vids: Vec<Vec<String>> = Vec::new();
    if webm {
        if has("libvpx-vp9") {
            vids.push(sv(&["-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-pix_fmt", "yuv420p"]));
        }
        if has("libsvtav1") {
            vids.push(sv(&["-c:v", "libsvtav1", "-crf", crf, "-preset", "8", "-pix_fmt", "yuv420p"]));
        }
    } else {
        if has("h264_qsv") {
            vids.push(sv(&["-c:v", "h264_qsv", "-global_quality", qsv]));
        }
        if has("h264_mf") {
            vids.push(sv(&["-c:v", "h264_mf", "-rate_control", "quality", "-quality", mf, "-pix_fmt", "yuv420p"]));
            vids.push(sv(&["-c:v", "h264_mf", "-b:v", br, "-pix_fmt", "yuv420p"]));
        }
        if has("libsvtav1") {
            vids.push(sv(&["-c:v", "libsvtav1", "-crf", crf, "-preset", "8", "-pix_fmt", "yuv420p"]));
        }
        if has("libaom-av1") {
            vids.push(sv(&["-c:v", "libaom-av1", "-crf", crf, "-b:v", "0", "-cpu-used", "8", "-pix_fmt", "yuv420p"]));
        }
        if ext == "mkv" && has("libvpx-vp9") {
            vids.push(sv(&["-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-pix_fmt", "yuv420p"]));
        }
    }
    vids.into_iter()
        .map(|mut v| {
            v.extend(audio.clone());
            if ext == "mp4" {
                v.extend(sv(&["-movflags", "+faststart"]));
            }
            v
        })
        .collect()
}

fn image_args(have: &[String], ext: &str, q: &str) -> Result<Vec<String>, String> {
    let has = |n: &str| have.iter().any(|x| x == n);
    let need = |n: &str| -> Result<(), String> {
        if has(n) { Ok(()) } else { Err(format!("This FFmpeg build has no {n} encoder")) }
    };
    let mut v = sv(&["-frames:v", "1"]);
    match ext {
        "png" => {
            need("png")?;
            v.extend(sv(&["-c:v", "png", "-compression_level", "9"]));
        }
        "webp" => {
            need("libwebp")?;
            let qq = match q { "high" => "90", "small" => "60", _ => "80" };
            v.extend(sv(&["-c:v", "libwebp", "-quality", qq]));
        }
        "bmp" => {
            need("bmp")?;
            v.extend(sv(&["-c:v", "bmp"]));
        }
        _ => {
            need("mjpeg")?;
            let qq = match q { "high" => "2", "small" => "8", _ => "4" };
            v.extend(sv(&["-c:v", "mjpeg", "-q:v", qq]));
        }
    }
    Ok(v)
}

fn audio_plan(have: &[String], fmt: &str, q: &str) -> Result<(Vec<String>, String), String> {
    let has = |n: &str| have.iter().any(|x| x == n);
    let br = match q { "high" => "192k", "small" => "96k", _ => "128k" };
    let (enc, extra, ext): (&str, Vec<&str>, &str) = match fmt {
        "wav" => ("pcm_s16le", vec![], "wav"),
        "flac" => ("flac", vec![], "flac"),
        "opus" => ("libopus", vec!["-b:a", br], "opus"),
        "m4a" => ("aac", vec!["-b:a", br], "m4a"),
        _ => ("libmp3lame", vec!["-b:a", br], "mp3"),
    };
    if !has(enc) {
        return Err(format!("This FFmpeg build has no {enc} encoder"));
    }
    let mut v = sv(&["-vn", "-c:a", enc]);
    v.extend(extra.iter().map(|x| x.to_string()));
    Ok((v, ext.to_string()))
}

fn norm_img(e: &str) -> &str {
    if e == "jpeg" { "jpg" } else { e }
}

fn image_keep_target(e: &str) -> String {
    match norm_img(e) {
        "png" => "png".into(),
        "webp" => "webp".into(),
        _ => "jpg".into(),
    }
}

fn audio_keep_target(e: &str) -> &'static str {
    match e {
        "opus" | "ogg" => "opus",
        "m4a" | "aac" => "m4a",
        _ => "mp3",
    }
}

fn crop_filter(ratio: &str) -> Result<String, String> {
    let (a, b) = ratio.split_once(':').ok_or("Bad crop ratio")?;
    let (w, h): (u32, u32) = (a.trim().parse().map_err(|_| "Bad crop ratio")?, b.trim().parse().map_err(|_| "Bad crop ratio")?);
    if w == 0 || h == 0 {
        return Err("Bad crop ratio".into());
    }
    Ok(format!("crop='min(iw,ih*{w}/{h})':'min(ih,iw*{h}/{w})'"))
}

fn out_path(src: &Path, suffix: &str, ext: &str) -> PathBuf {
    let dir = src.parent().unwrap_or_else(|| Path::new("."));
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let base = if suffix.is_empty() { stem.to_string() } else { format!("{stem}_{suffix}") };
    let mut p = dir.join(format!("{base}.{ext}"));
    let mut n = 2;
    while p.exists() {
        p = dir.join(format!("{base} ({n}).{ext}"));
        n += 1;
    }
    p
}

fn finish(ff: &Path, head: Vec<String>, plans: Vec<Vec<String>>, out: &Path, dur: Option<f64>, prog: &mut dyn FnMut(Option<f64>)) -> Result<PathBuf, String> {
    if plans.is_empty() {
        return Err("No suitable encoder in this FFmpeg build".into());
    }
    let mut last = String::from("Encoding failed");
    for plan in plans {
        let mut args = head.clone();
        args.extend(plan);
        args.push(out.to_string_lossy().to_string());
        prog(if dur.is_some() { Some(0.0) } else { None });
        match run_ffmpeg(ff, &args, dur, prog) {
            Ok(()) => return Ok(out.to_path_buf()),
            Err(e) => {
                println!("[job  ] ffmpeg failed: {e}\n[job  ] args: {:?}", args);
                last = e;
                let _ = std::fs::remove_file(out);
            }
        }
    }
    Err(last)
}

// ---------- one file, one action ----------

pub fn process(ff: &Path, action: &str, file: &Path, o: &Options, prog: &mut dyn FnMut(Option<f64>)) -> Result<PathBuf, String> {
    if !matches!(action, "compress" | "convert" | "crop" | "trim" | "extract") {
        return Err(format!("Unknown action: {action}"));
    }
    let kind = kind_of(file);
    if kind == Kind::Unknown {
        return Err(format!("Unsupported file type: .{}", ext_of(file)));
    }
    let have = encoders(ff);
    let q = o.quality.as_str();
    let ext_in = ext_of(file);
    let info = probe(ff, file);
    let mut dur = info.duration;
    let mut vf: Vec<String> = Vec::new();
    let plans: Vec<Vec<String>>;
    let out: PathBuf;

    match kind {
        Kind::Image => {
            if action == "trim" || action == "extract" {
                return Err(format!("{} works on video or audio, not images", cap(action)));
            }
            let target = if action == "convert" {
                let cur = norm_img(&ext_in).to_string();
                let f = o.image_fmt.clone();
                if f == cur { (if f == "jpg" { "png" } else { "jpg" }).to_string() } else { f }
            } else {
                image_keep_target(&ext_in)
            };
            if action == "crop" {
                vf.push(crop_filter(&o.crop)?);
            }
            plans = vec![image_args(have, &target, q)?];
            let suffix = match action { "compress" => "compressed", "crop" => "cropped", _ => "" };
            out = out_path(file, suffix, &target);
            dur = None;
        }
        Kind::Audio => {
            if action == "crop" {
                return Err("Crop works on images and video".into());
            }
            if action == "extract" {
                return Err("Extract needs a video file".into());
            }
            let target = if action == "convert" {
                let f = o.audio_fmt.clone();
                if f == audio_keep_target(&ext_in) || f == ext_in { (if f == "mp3" { "wav" } else { "mp3" }).to_string() } else { f }
            } else {
                audio_keep_target(&ext_in).to_string()
            };
            let (a, e) = audio_plan(have, &target, q)?;
            plans = vec![a];
            let suffix = match action { "compress" => "compressed", "trim" => "trimmed", _ => "" };
            out = out_path(file, suffix, &e);
        }
        Kind::Video => {
            if action == "extract" {
                if !info.has_audio {
                    return Err("This video has no audio track".into());
                }
                let (a, e) = audio_plan(have, &o.audio_fmt, q)?;
                plans = vec![a];
                out = out_path(file, "audio", &e);
            } else {
                let mut target = if action == "convert" { o.video_fmt.clone() } else { "mp4".to_string() };
                if !matches!(target.as_str(), "mp4" | "mkv" | "webm") {
                    target = "mp4".into();
                }
                if action == "convert" && target == ext_in {
                    target = (if target == "mp4" { "mkv" } else { "mp4" }).to_string();
                }
                if action == "crop" {
                    vf.push(crop_filter(&o.crop)?);
                }
                vf.push("scale=trunc(iw/2)*2:trunc(ih/2)*2".into());
                plans = video_plans(have, q, &target);
                let suffix = match action { "compress" => "compressed", "crop" => "cropped", "trim" => "trimmed", _ => "" };
                out = out_path(file, suffix, &target);
            }
        }
        Kind::Unknown => unreachable!(),
    }

    let mut head: Vec<String> = Vec::new();
    if action == "trim" {
        let ts = o.trim_start.max(0.0);
        let te = o.trim_end.max(0.0);
        if te > 0.0 && te <= ts {
            return Err("Trim end must be after trim start".into());
        }
        head.push("-ss".into());
        head.push(format!("{ts}"));
        if te > 0.0 {
            head.push("-to".into());
            head.push(format!("{te}"));
        }
        dur = match info.duration {
            Some(d) => Some((if te > 0.0 { te.min(d) } else { d }) - ts),
            None => if te > 0.0 { Some(te - ts) } else { None },
        }
        .filter(|d| *d > 0.0);
    }
    head.push("-i".into());
    head.push(file.to_string_lossy().to_string());
    if !vf.is_empty() {
        head.push("-vf".into());
        head.push(vf.join(","));
    }
    finish(ff, head, plans, &out, dur, prog)
}

// ---------- many files into one ----------

pub fn merge(ff: &Path, files: &[PathBuf], o: &Options, prog: &mut dyn FnMut(Option<f64>)) -> Result<PathBuf, String> {
    if files.len() < 2 {
        return Err("Merge needs at least two files".into());
    }
    let kind = kind_of(&files[0]);
    if kind == Kind::Unknown {
        return Err(format!("Unsupported file type: .{}", ext_of(&files[0])));
    }
    if files.iter().any(|f| kind_of(f) != kind) {
        return Err("Merge needs files of the same type (all photos, all video or all audio)".into());
    }
    let have = encoders(ff);
    let q = o.quality.as_str();
    let probes: Vec<Probe> = files.iter().map(|f| probe(ff, f)).collect();
    let total: Option<f64> = probes.iter().map(|p| p.duration).sum();
    let n = files.len();
    let mut head: Vec<String> = Vec::new();
    for f in files {
        head.push("-i".into());
        head.push(f.to_string_lossy().to_string());
    }
    let mut fc = String::new();
    let plans: Vec<Vec<String>>;
    let out: PathBuf;
    if kind == Kind::Image {
        // photos are placed side by side (row) or one above the other (column), scaled to a common size
        let row = o.image_layout != "column";
        let mut cat = String::new();
        for i in 0..n {
            let sc = if row { "scale=-2:2000" } else { "scale=2000:-2" };
            fc.push_str(&format!("[{i}:v:0]{sc},setsar=1[p{i}];"));
            cat.push_str(&format!("[p{i}]"));
        }
        fc.push_str(&format!("{cat}{}=inputs={n}[v]", if row { "hstack" } else { "vstack" }));
        head.push("-filter_complex".into());
        head.push(fc);
        head.extend(sv(&["-map", "[v]"]));
        let target = image_keep_target(&ext_of(&files[0]));
        plans = vec![image_args(have, &target, q)?];
        out = out_path(&files[0], "merged", &target);
        return finish(ff, head, plans, &out, None, prog);
    }
    if kind == Kind::Video {
        let (mut w, mut h) = probes.iter().find_map(|p| p.size).unwrap_or((1280, 720));
        w -= w % 2;
        h -= h % 2;
        let with_audio = probes.iter().all(|p| p.has_audio);
        let mut cat = String::new();
        for i in 0..n {
            fc.push_str(&format!(
                "[{i}:v:0]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v{i}];"
            ));
            cat.push_str(&format!("[v{i}]"));
            if with_audio {
                fc.push_str(&format!("[{i}:a:0]aresample=48000,aformat=channel_layouts=stereo[a{i}];"));
                cat.push_str(&format!("[a{i}]"));
            }
        }
        fc.push_str(&format!("{cat}concat=n={n}:v=1:a={}[v]{}", if with_audio { 1 } else { 0 }, if with_audio { "[a]" } else { "" }));
        head.push("-filter_complex".into());
        head.push(fc);
        head.extend(sv(&["-map", "[v]"]));
        if with_audio {
            head.extend(sv(&["-map", "[a]"]));
        }
        plans = video_plans(have, q, "mp4");
        out = out_path(&files[0], "merged", "mp4");
    } else {
        let mut cat = String::new();
        for i in 0..n {
            fc.push_str(&format!("[{i}:a:0]aresample=48000,aformat=channel_layouts=stereo[a{i}];"));
            cat.push_str(&format!("[a{i}]"));
        }
        fc.push_str(&format!("{cat}concat=n={n}:v=0:a=1[a]"));
        head.push("-filter_complex".into());
        head.push(fc);
        head.extend(sv(&["-map", "[a]"]));
        let (a, e) = audio_plan(have, audio_keep_target(&ext_of(&files[0])), q)?;
        plans = vec![a];
        out = out_path(&files[0], "merged", &e);
    }
    finish(ff, head, plans, &out, total, prog)
}
