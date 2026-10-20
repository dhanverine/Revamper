# Revamper

Hold **Shift**, drag a file, and drop it on a slice of the ring that appears under your cursor.
Everything runs on your own computer. Nothing is uploaded. Free and open source (MIT).

| Slice    | What it does                                                         |
| -------- | -------------------------------------------------------------------- |
| Convert  | Photos, video or audio to another format (pick formats in Settings)  |
| Compress | Smaller files with the same look                                     |
| Crop     | Photos and video to a ratio such as 1:1 or 16:9                      |
| Trim     | Keep a section of a video or audio file                              |
| Merge    | Join several videos or audio files, or place photos side by side     |
| Extract  | Pull the audio out of a video                                        |

Results are saved next to the original with a suffix (for example `holiday_compressed.mp4`). Originals are never changed.
A small notice in the corner shows progress; click it to show the file in its folder.

Settings (tray icon): choose the ring design (Reactor or Console), the colours, and the options for each action.

Windows 10/11, 64-bit. Early development: expect rough edges. Please open an issue.

## Build from source

1. Install Node 22+, Rust (MSVC toolchain) and the WebView2 runtime.
2. `npm install`
3. `powershell -File scripts/get-ffmpeg.ps1` (downloads the LGPL FFmpeg build into `vendor/ffmpeg`; it is not stored in the repo)
4. Development: `npm run tauri dev`  |  Installer: `npm run tauri build` (output in `src-tauri/target/release/bundle/nsis`)

Pushing a tag such as `v0.1.0` builds the installer on GitHub Actions and attaches it to a release.

## Licences

Revamper is MIT. It runs an unmodified LGPL build of FFmpeg as a separate program. See `THIRD_PARTY_NOTICES.md`.

Unsigned builds can trigger a Windows SmartScreen warning ("More info", then "Run anyway").
