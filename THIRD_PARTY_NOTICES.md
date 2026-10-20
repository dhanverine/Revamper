# Third-party notices

Revamper itself is MIT licensed (see LICENSE).

## FFmpeg

Revamper runs FFmpeg as a separate program to process files. The installer includes an
unmodified **LGPL v3, shared-library** build of FFmpeg (no GPL components, no x264/x265).

- FFmpeg project: https://ffmpeg.org (licence: LGPL v2.1+/v3, see `ffmpeg/LICENSE.txt` in the install folder)
- Build used: https://github.com/BtbN/FFmpeg-Builds (`ffmpeg-n9.0-latest-win64-lgpl-shared-9.0`)
- Source code for FFmpeg is available from the links above. You can replace the DLLs in `ffmpeg/bin`
  with your own build of the same major versions.

Some video and audio formats are covered by patents in some countries (for example H.264, HEVC, AAC).
Revamper uses the codecs that ship with Windows or with the FFmpeg build above; you are responsible for
using it in line with the laws where you live.

## Other

- Tauri (MIT/Apache-2.0), Vite (MIT), Rajdhani and JetBrains Mono fonts (SIL Open Font Licence 1.1).
