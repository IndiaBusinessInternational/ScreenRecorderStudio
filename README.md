# IBI Screen Recorder Studio v2.1

A browser-based screen recorder laid out like OBS Studio — by **India Business International**.
Everything runs in the browser tab; nothing that is recorded is uploaded anywhere.

Live: https://recorder.indiabusinessinternational.online/ (until DNS is added: https://indiabusinessinternational.github.io/ScreenRecorderStudio/)

## Features
- **Scenes** — add, rename, duplicate, reorder, remove; click to switch with a transition.
- **Sources** — Display Capture (screen / window / tab, with system or tab audio), Video Capture Device (webcam),
  Audio Input Capture (microphone), Media Source (video/audio file), Image, Text (live `{time}` `{date}` `{datetime}`), Color Source.
  Show/hide, lock, drag to reorder, "add existing" to share one source across scenes.
- **Preview editing** — select, drag, resize with handles (corners keep the aspect ratio, Shift = free),
  snapping to edges and centre (Alt = off), arrow-key nudge, right-click Transform menu (fit, stretch, centre,
  rotate 90°, flip, reset), crop, webcam circle bubble.
- **Filters** — opacity, brightness, contrast, saturation, hue, blur, rounded/circle shape, border, chroma key (OBS formula).
- **Audio Mixer** — stereo peak meters (−60…0 dB, green/yellow/red, 1.5 s peak hold), dB faders, mute, monitoring,
  gain (−30…+30 dB), mono downmix, hide from mixer, vertical/horizontal layout.
- **Scene Transitions** — Cut, Fade, Fade to Black, Slide, Swipe, with duration. Audio follows the scene.
- **Studio Mode** — Preview and Program side by side, Transition button.
- **Recording** — MP4 (H.264/AAC), WebM (VP9 or VP8/Opus), MKV (H.264/Opus); YouTube-recommended bitrates; pause/resume;
  countdown; save straight to a chosen folder (crash-safe, no size limit) or to Downloads; WebM/MKV get a real duration.
- **Mini Controls** — always-on-top floating window (Document Picture-in-Picture) to stop/pause/mute while working in other apps.
- Screenshot (PNG), fullscreen projector, picture-in-picture output, recordings list with in-app playback.
- **Picture health check (v1.1)** — every second each screen/camera is checked; a black picture switches to a second drawing method by itself, then warns with the fix (two-graphics-chip laptops, minimised window, protected video); sharing stopped mid-recording opens a dialog; each saved recording is checked and flagged if black.
- **Shared window/tab always fits (v1.2)** — when the shared surface changes size (a Chrome tab or window instead of the screen, or a window resized mid-recording) a capture that filled the canvas is re-fitted (OBS fit-to-screen bounding box); a capture spilling off the top-left corner is repaired. Missed frames count only while recording.
- Stats: FPS, render time, missed frames, size, bitrate. Keyboard shortcuts (Ctrl+Alt+R/P/S/T/M, Ctrl+Alt+1…9).
- Standard IBI app features: version badge, IBI logo, light/dark switch, installable PWA (banner, header and menu Install),
  backup & restore of the whole scene collection, edge-to-edge phone layout, Open Graph tags.

## v2.1
- **Demo video** (`demo/en.mp4`, 3:45, narrated + captioned; ⋮ → Watch the demo video, or ask the Help assistant). Built with a copy of the IBI Apps demo pipeline (puppeteer capture → edge-tts Ava → Chrome-composed captions → ffmpeg).
- Controls dock regrouped into compact pairs so every control is visible without scrolling; Help button moved above the docks on desktop.

## v2.0 — OBS feature parity (everything a browser can do)
Compared against the installed OBS Studio 32.2.2 (its plugins and locale files):
- **Sources:** Window Capture and Chrome Tab Capture (share box opens on that tab), Image Slide Show, Scene (nested), Live Captions (speech → subtitles, 17 languages).
- **Video filters:** Color Key, Luma Key, Sharpen, Scroll, blending modes (plus the v1 colour correction, chroma key, shape, border).
- **Audio filters:** Noise Gate (AudioWorklet), Compressor, Limiter, 3-band EQ, Balance, Sync Offset (delay), Invert Polarity — wired in OBS order.
- **Transitions:** Fade to Color, Luma Wipe (8 shapes), Stinger (your video, transition point), per-scene Transition Override.
- **Output:** Replay Buffer (Save Replay keeps at least the last N seconds), Output Timer (auto-stop), audio monitoring device.
- **Studio:** Undo/Redo, copy/paste transform & filters, Multiview, Scene Collections, editable hotkeys, Stats window.
- **Help assistant:** built-in, answers from the app's own guide, offline, no AI key (minimise keeps the chat; Esc minimises).

## Not possible in a browser
Live streaming (RTMP) and a virtual camera — use OBS Studio for those. Phones cannot share their screen from a browser
(camera + microphone recording works).

## Files
`index.html` · `app.css` · `theme.js` (applies the theme before paint) · `core.js` (engine: sources, audio, compositor,
recorder) · `ui.js` (docks, dialogs, settings) · `sw.js` (network-first; bump `CACHE` each release) · `manifest.json` · `icons/`.

## Versioning
Badge in `index.html`, `APP_VERSION` in `core.js`, `?v=` on the asset tags, `CACHE` in `sw.js`, this heading, and an annotated git tag — all the same.
