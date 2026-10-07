/* IBI Media Player — the player library. v1.5.1 (6 Oct 2026: no control-bar flicker; v1.5.0 volume to 300 %; v1.4.1 an opened file plays at once; v1.4.0 photo slideshow; born v1.0.0 27 Sep 2026)
 *
 * One file, no dependencies. `IBIPlayer.mount(root, options)` builds a complete audio/video
 * player inside `root` and returns a small API; `index.html` mounts it standalone, and the
 * IBI YouTube Grower mounts the same file on its 🎧 Player page with its own video library.
 *
 * What it does, by the standard set by YouTube Premium, VLC and Windows Media Player:
 *   • plays every format the browser can decode (MP4/H.264/H.265*, WebM/VP9/AV1, MKV*, MOV*,
 *     MP3, M4A/AAC, WAV, FLAC, OGG/Opus …); a file the browser cannot decode says so plainly;
 *   • speed 0.25× to 4× in 0.05 steps — presets 0.25 0.5 0.75 1 1.25 1.5 1.75 2 plus a
 *     custom slider — with the pitch preserved (switchable);
 *   • seek bar you can drag or tap, with a hover time, buffered ranges and a live position;
 *   • photos (JPG, PNG, WebP, GIF, AVIF, BMP, SVG) as a slideshow in the same playlist, 3–30 s each;
 *   • ±10 s, previous/next, shuffle, repeat off/all/one, volume 0–300 % (boost + limiter), mute, captions (.vtt/.srt),
 *     picture-in-picture, full screen, a playlist with drag-and-drop and folder open;
 *   • keyboard: Space/K play, J/L ±10 s, ←/→ ±5 s, ↑/↓ volume, M mute, F full screen,
 *     C captions, < > speed ±0.25, Shift+< > ±0.05, , . frame step (paused), 0–9 seek to %,
 *     Home/End, N/P next/previous, I picture-in-picture, R repeat, Esc closes menus;
 *   • remembers where you stopped in each file, the volume, the speed and the repeat mode;
 *   • lock-screen / headset controls through the Media Session API;
 *   • opens files handed to the installed app (file_handlers) and a ?src=URL query.
 *   * H.265/HEVC, MKV and MOV depend on the operating system's decoders; Chrome on Windows 11
 *     plays them when the codec is installed.
 */
(function () {
  "use strict";
  const VERSION = "1.5.1";
  const PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const RATE_MIN = 0.25, RATE_MAX = 4, RATE_STEP = 0.05;
  /* v1.3.0 — VOLUME BOOST past 100 %, VLC's standard (CEO, 1 Oct 2026: "I want more audio … increase the
   * volume further more, as per industry standards"). A <video>'s own volume stops at 1.0, so above 100 %
   * the sound runs through Web Audio: element → gain (up to 2.0 = 200 %) → a limiter → speakers. The
   * limiter is in the chain only while boosting, so 0–100 % sounds exactly as before. One AudioContext is
   * shared by every player on the page (browsers cap how many may exist).
   * v1.5.0 — up to 300 % (CEO, 1 Oct 2026: "can you increase to 300 % rise in volume ?"), VLC's own ceiling.
   * The 100 % notch sits at a third of the slider; the chain and limiter are unchanged. */
  const VOL_MAX = 3, VOL_STEP = 0.05;
  const VOL_PRESETS = [1, 1.5, 2, 3];
  let AUDIO_CTX = null;
  function audioCtx() {
    if (AUDIO_CTX) return AUDIO_CTX;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AUDIO_CTX = new C(); } catch { AUDIO_CTX = null; }
    return AUDIO_CTX;
  }
  function sameOrigin(u) {
    if (!u || /^(blob:|data:)/i.test(u)) return true;
    try { return new URL(u, location.href).origin === location.origin; } catch { return false; }
  }
  const VIDEO_EXT = ["mp4", "m4v", "webm", "mkv", "mov", "ogv", "3gp", "3g2", "avi", "ts", "mts", "m2ts", "mpg", "mpeg", "wmv", "flv"];
  const AUDIO_EXT = ["mp3", "m4a", "m4b", "aac", "wav", "flac", "ogg", "oga", "opus", "weba", "wma", "aiff", "aif", "amr", "mid", "caf"];
  const CAPTION_EXT = ["vtt", "srt"];
  // v1.4.0 — photos (slideshow). HEIC/HEIF are listed so they reach the playlist and get a plain "convert to JPG"
  // message: Chrome and Edge on Windows cannot decode them (Safari can).
  const IMAGE_EXT = ["jpg", "jpeg", "jfif", "pjpeg", "png", "apng", "webp", "gif", "avif", "bmp", "svg", "ico", "heic", "heif"];
  const PHOTO_SECS = [3, 5, 10, 15, 30];
  const MIME = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime", ogv: "video/ogg", "3gp": "video/3gpp",
    avi: "video/x-msvideo", ts: "video/mp2t", mpg: "video/mpeg", mpeg: "video/mpeg", wmv: "video/x-ms-wmv", flv: "video/x-flv",
    mp3: "audio/mpeg", m4a: "audio/mp4", m4b: "audio/mp4", aac: "audio/aac", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg",
    opus: 'audio/ogg; codecs="opus"', weba: "audio/webm", wma: "audio/x-ms-wma", aiff: "audio/aiff", aif: "audio/aiff", amr: "audio/amr", mid: "audio/midi", caf: "audio/x-caf",
    jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", pjpeg: "image/jpeg", png: "image/png", apng: "image/apng", webp: "image/webp", gif: "image/gif",
    avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon", heic: "image/heic", heif: "image/heif" };
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const extOf = (name) => { const m = /\.([a-z0-9]{1,5})(?:\?.*)?$/i.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };
  const kindOf = (name, mime) => {
    if (mime && mime.startsWith("video/")) return "video";
    if (mime && mime.startsWith("audio/")) return "audio";
    if (mime && mime.startsWith("image/")) return "image";
    const e = extOf(name);
    return VIDEO_EXT.includes(e) ? "video" : AUDIO_EXT.includes(e) ? "audio" : IMAGE_EXT.includes(e) ? "image" : CAPTION_EXT.includes(e) ? "caption" : "";
  };
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0");
  }
  const fmtRate = (r) => (Math.abs(r - 1) < 0.001 ? "Normal" : (Math.round(r * 100) / 100).toString().replace(/\.?0+$/, "") + "×");
  const roundRate = (r) => Math.round(clamp(r, RATE_MIN, RATE_MAX) / RATE_STEP) * RATE_STEP;

  /** SRT → WebVTT (the browser's <track> reads only VTT). */
  function srtToVtt(text) {
    return "WEBVTT\n\n" + String(text).replace(/\r/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2").trim() + "\n";
  }

  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/><text x="8.6" y="15.6" font-size="6.5" font-weight="700" fill="currentColor" stroke="none">10</text></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V2l5 4-5 4V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z"/><text x="8.6" y="15.6" font-size="6.5" font-weight="700" fill="currentColor" stroke="none">10</text></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.6 3 2.4-2.4-1.4-1.4L15.2 10.6 12.8 8.2l-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4z"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/></svg>',
    unfull: '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8zm4 8V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2zm-2 0H3V5h18z"/></svg>',
    cc: '<svg viewBox="0 0 24 24"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M3 6h13v2H3zm0 5h13v2H3zm0 5h9v2H3zm15-4 5 3-5 3z"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 12H4V8h16z"/></svg>',
    repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>',
    repeat1: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/><text x="9.4" y="15" font-size="7" font-weight="700" fill="currentColor" stroke="none">1</text></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M10.6 9.2 5.4 4H2v2h2.6l4.6 4.6zM14.5 4l2 2-12.5 12.5H2v2h2.8L17.9 7.4l2.1 2.1V4zm3.4 10.6-1.4 1.4 2 2H16v2h6v-6h-2v2.2z"/></svg>',
    speed: '<svg viewBox="0 0 24 24"><path d="M20.4 8.6A10 10 0 0 0 3.6 8.6l1.7 1A8 8 0 0 1 12 6a8 8 0 0 1 6.7 3.6zM12 22a10 10 0 0 0 8.4-4.6l-1.7-1A8 8 0 0 1 12 20a8 8 0 0 1-6.7-3.6l-1.7 1A10 10 0 0 0 12 22zm1.4-9.4 4.4-6.2-6.2 4.4a1.6 1.6 0 1 0 1.8 1.8z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4z"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M12 3v10.6A4 4 0 1 0 14 17V7h4V3z"/></svg>',
    photo: '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/></svg>',
    film: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zm2 2v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zm10-8v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zM10 6v12h4V6z"/></svg>',
    read: '<svg viewBox="0 0 24 24"><path d="M4 5h11v2H4zm0 4h11v2H4zm0 4h7v2H4zm0 4h7v2H4zm13.5-6a4.5 4.5 0 0 1 0 6.4l-1.4-1.4a2.5 2.5 0 0 0 0-3.6zm2.8-2.8a8.5 8.5 0 0 1 0 12l-1.4-1.4a6.5 6.5 0 0 0 0-9.2z"/></svg>',
  };

  const LIVE = new Set();   // v1.2.1 — every mounted player's <video>, so only one ever plays
  function mount(root, options) {
    const o = Object.assign({ items: [], title: "", autoplay: false, showOpen: true, accept: "" }, options || {});
    // v1.2.1 — every page-level listener is tied to this instance, so destroy() removes them all. A player
    // that was replaced (a host page redrawn) used to keep answering Space in the background: two voices at once.
    const ac = new AbortController();
    const onDoc = (ev, fn) => document.addEventListener(ev, fn, { signal: ac.signal });
    const onWin = (ev, fn) => window.addEventListener(ev, fn, { signal: ac.signal });
    const id = "ibp" + Math.random().toString(36).slice(2, 8);
    root.classList.add("ibp");
    root.innerHTML = `
      <div class="ibp-main">
        <div class="ibp-stage" tabindex="0" aria-label="Player. Space plays or pauses, arrows seek.">
          <video playsinline preload="metadata"></video>
          <img class="ibp-photo" alt="" decoding="async" draggable="false">
          <div class="ibp-art"><div class="ibp-art-ico">${ICON.music}</div><div class="ibp-art-title"></div><div class="ibp-art-sub"></div></div>
          <div class="ibp-empty">
            <div class="ibp-empty-ico">${ICON.open}</div>
            <div class="ibp-empty-t">Open audio, video or photo files</div>
            <div class="ibp-empty-s">Drop files or a folder here, or use Open. MP4, WebM, MKV, MOV, MP3, M4A, WAV, FLAC, OGG, and photos (JPG, PNG, WebP, GIF, AVIF) as a slideshow.</div>
            <div class="ibp-empty-b"><button type="button" class="ibp-btn ibp-btn-primary" data-act="open">Open files</button><button type="button" class="ibp-btn" data-act="open-folder">Open folder</button></div>
          </div>
          <div class="ibp-msg" hidden></div>
          <div class="ibp-flash" aria-hidden="true"></div>
          <button type="button" class="ibp-bigplay" data-act="play" aria-label="Play">${ICON.play}</button>
        </div>
        <div class="ibp-controls">
          <div class="ibp-seek" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
            <div class="ibp-seek-track"><div class="ibp-buf"></div><div class="ibp-prog"></div></div>
            <div class="ibp-knob"></div>
            <div class="ibp-tip">0:00</div>
          </div>
          <div class="ibp-row">
            <div class="ibp-left">
              <button type="button" class="ibp-ic" data-act="prev" aria-label="Previous (P)" title="Previous (P)">${ICON.prev}</button>
              <button type="button" class="ibp-ic" data-act="back" aria-label="Back 10 seconds (J)" title="Back 10 s (J)">${ICON.back}</button>
              <button type="button" class="ibp-ic ibp-play" data-act="play" aria-label="Play (Space)" title="Play (Space)">${ICON.play}</button>
              <button type="button" class="ibp-ic" data-act="fwd" aria-label="Forward 10 seconds (L)" title="Forward 10 s (L)">${ICON.fwd}</button>
              <button type="button" class="ibp-ic" data-act="next" aria-label="Next (N)" title="Next (N)">${ICON.next}</button>
              <span class="ibp-time"><span class="ibp-cur">0:00</span> / <span class="ibp-dur">0:00</span></span>
            </div>
            <div class="ibp-right">
              <button type="button" class="ibp-ic ibp-speedbtn" data-act="speed" aria-haspopup="menu" aria-label="Speed and volume" title="Speed and volume (&lt; &gt; speed, ↑ ↓ volume)"><span class="ibp-speed-label">1×</span></button>
              <div class="ibp-vol"><button type="button" class="ibp-ic" data-act="mute" aria-label="Mute (M)" title="Mute (M)">${ICON.vol}</button><input type="range" class="ibp-volrange ibp-volslider" min="0" max="${VOL_MAX}" step="${VOL_STEP}" value="1" aria-label="Volume, up to ${VOL_MAX * 100}%"><span class="ibp-volpct" aria-hidden="true">100%</span></div>
              <button type="button" class="ibp-ic ibp-ccbtn" data-act="cc" aria-label="Captions (C)" title="Captions (C)">${ICON.cc}</button>
              <button type="button" class="ibp-ic ibp-pipbtn" data-act="pip" aria-label="Picture in picture (I)" title="Picture in picture (I)">${ICON.pip}</button>
              <button type="button" class="ibp-ic" data-act="shuffle" aria-label="Shuffle" title="Shuffle">${ICON.shuffle}</button>
              <button type="button" class="ibp-ic ibp-repeatbtn" data-act="repeat" aria-label="Repeat (R)" title="Repeat (R)">${ICON.repeat}</button>
              <button type="button" class="ibp-ic ibp-readbtn" data-act="read" aria-haspopup="dialog" aria-label="Read text aloud" title="Read text aloud (choose a voice)">${ICON.read}</button>
              <button type="button" class="ibp-ic" data-act="list" aria-label="Playlist" title="Playlist">${ICON.list}</button>
              ${o.showOpen ? `<button type="button" class="ibp-ic" data-act="open" aria-label="Open files" title="Open files">${ICON.open}</button>` : ""}
              <button type="button" class="ibp-ic" data-act="full" aria-label="Full screen (F)" title="Full screen (F)">${ICON.full}</button>
            </div>
          </div>
        </div>
        <div class="ibp-menu ibp-speedmenu" hidden role="menu" aria-label="Speed and volume">
          <div class="ibp-menu-h">Speed and volume <button type="button" class="ibp-ic ibp-sm" data-act="closemenu" aria-label="Close">${ICON.close}</button></div>
          <div class="ibp-presets">${PRESETS.map((r) => `<button type="button" class="ibp-chip" data-rate="${r}">${fmtRate(r)}</button>`).join("")}</div>
          <div class="ibp-custom">
            <div class="ibp-custom-h"><span>Custom</span><b class="ibp-custom-val">1×</b></div>
            <div class="ibp-custom-row"><button type="button" class="ibp-chip ibp-step" data-step="-0.05" aria-label="Slower by 0.05">−</button><input type="range" class="ibp-raterange" min="${RATE_MIN}" max="${RATE_MAX}" step="${RATE_STEP}" value="1" aria-label="Custom speed"><button type="button" class="ibp-chip ibp-step" data-step="0.05" aria-label="Faster by 0.05">+</button></div>
            <div class="ibp-custom-scale"><span>0.25×</span><span>1×</span><span>2×</span><span>4×</span></div>
          </div>
          <label class="ibp-check"><input type="checkbox" class="ibp-pitch" checked> Keep the voice's pitch at every speed</label>
          <div class="ibp-volsec">
            <div class="ibp-custom-h"><span>Volume</span><b class="ibp-menuvol-val">100%</b></div>
            <div class="ibp-volpresets"><button type="button" class="ibp-chip" data-act="mute">Mute</button>${VOL_PRESETS.map((v) => `<button type="button" class="ibp-chip" data-vol="${v}">${v * 100}%</button>`).join("")}</div>
            <div class="ibp-custom-row"><button type="button" class="ibp-chip ibp-vstep" data-vstep="-${VOL_STEP}" aria-label="Quieter by 5%">−</button><input type="range" class="ibp-menuvol ibp-volslider" min="0" max="${VOL_MAX}" step="${VOL_STEP}" value="1" aria-label="Volume, up to ${VOL_MAX * 100}%"><button type="button" class="ibp-chip ibp-vstep" data-vstep="${VOL_STEP}" aria-label="Louder by 5%">+</button></div>
            <div class="ibp-custom-scale">${Array.from({ length: VOL_MAX + 1 }, (_, i) => `<span>${i ? i * 100 + "%" : "0"}</span>`).join("")}</div>
            <div class="ibp-volnote">Above 100% is a boost for quiet recordings. A limiter stops the loud parts from crackling. Keep it at 100% or lower on headphones and earphones — a 300% boost can harm your hearing.</div>
          </div>
          <div class="ibp-photosec">
            <div class="ibp-custom-h"><span>Photo slideshow · each photo shows for</span><b class="ibp-photosec-val">5 s</b></div>
            <div class="ibp-photochips">${PHOTO_SECS.map((s) => `<button type="button" class="ibp-chip" data-psec="${s}">${s} s</button>`).join("")}</div>
          </div>
        </div>
        <div class="ibp-menu ibp-readmenu" hidden role="dialog" aria-label="Read text aloud">
          <div class="ibp-menu-h">Read text aloud <button type="button" class="ibp-ic ibp-sm" data-act="closeread" aria-label="Close">${ICON.close}</button></div>
          <textarea class="ibp-readtext" rows="4" placeholder="Paste or type the text to read, or open a .txt file"></textarea>
          <div class="ibp-read-row">
            <label class="ibp-read-lab">Voice <select class="ibp-voices" aria-label="Voice"></select></label>
          </div>
          <div class="ibp-read-row">
            <label class="ibp-read-lab ibp-read-rate">Speed <b class="ibp-read-rateval">1×</b><input type="range" class="ibp-readrate" min="0.5" max="3" step="0.05" value="1" aria-label="Reading speed"></label>
          </div>
          <div class="ibp-read-row ibp-read-btns">
            <button type="button" class="ibp-btn ibp-btn-primary ibp-sm" data-act="readplay">${ICON.play} Read</button>
            <button type="button" class="ibp-btn ibp-sm" data-act="readpause">Pause</button>
            <button type="button" class="ibp-btn ibp-sm" data-act="readstop">Stop</button>
            <button type="button" class="ibp-btn ibp-sm" data-act="open-txt">Open .txt</button>
            <button type="button" class="ibp-btn ibp-sm" data-act="voicedefault" title="Use the chosen voice every time">Set as default</button>
          </div>
          <div class="ibp-read-hint"></div>
        </div>
      </div>
      <div class="ibp-split" role="separator" aria-orientation="vertical" aria-label="Resize the playlist — drag, or use the arrow keys; double-click resets" title="Drag to resize the playlist · double-click to reset" tabindex="0"></div>
      <aside class="ibp-list" aria-label="Playlist">
        <div class="ibp-list-h"><span class="ibp-list-title">Playlist</span><span class="ibp-list-count"></span>
          <span class="ibp-list-acts">${o.showOpen ? `<button type="button" class="ibp-btn ibp-sm" data-act="open">Open</button><button type="button" class="ibp-btn ibp-sm" data-act="open-folder">Folder</button><button type="button" class="ibp-btn ibp-sm" data-act="open-cc">Captions</button>` : ""}<button type="button" class="ibp-btn ibp-sm" data-act="clear">Clear</button><button type="button" class="ibp-ic ibp-sm ibp-list-close" data-act="list" aria-label="Close playlist">${ICON.close}</button></span></div>
        <ol class="ibp-items"></ol>
        <div class="ibp-list-empty">Nothing here yet.</div>
      </aside>
      <input type="file" class="ibp-file" multiple hidden accept="${o.accept || [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT, ...CAPTION_EXT].map((e) => "." + e).join(",") + ",video/*,audio/*,image/*"}">
      <input type="file" class="ibp-folder" multiple hidden webkitdirectory>
      <input type="file" class="ibp-ccfile" hidden accept=".vtt,.srt,text/vtt">
      <input type="file" class="ibp-txtfile" hidden accept=".txt,.md,text/plain">`;

    const $ = (s) => root.querySelector(s);
    const $$ = (s) => Array.from(root.querySelectorAll(s));
    const photo = $(".ibp-photo"), photoSecVal = $(".ibp-photosec-val");
    const stage = $(".ibp-stage"), video = $("video"), art = $(".ibp-art"), empty = $(".ibp-empty"), msg = $(".ibp-msg"), flash = $(".ibp-flash");
    const seek = $(".ibp-seek"), prog = $(".ibp-prog"), buf = $(".ibp-buf"), knob = $(".ibp-knob"), tip = $(".ibp-tip");
    const cur = $(".ibp-cur"), dur = $(".ibp-dur"), playBtns = $$("[data-act=play]"), speedLabel = $(".ibp-speed-label");
    const speedMenu = $(".ibp-speedmenu"), rateRange = $(".ibp-raterange"), customVal = $(".ibp-custom-val"), pitchBox = $(".ibp-pitch");
    const volRange = $(".ibp-volrange"), muteBtn = $(".ibp-vol [data-act=mute]"), volPct = $(".ibp-volpct"), menuVol = $(".ibp-menuvol"), menuVolVal = $(".ibp-menuvol-val"), fullBtn = $("[data-act=full]"), repeatBtn = $(".ibp-repeatbtn");
    const ccBtn = $(".ibp-ccbtn"), pipBtn = $(".ibp-pipbtn"), listEl = $(".ibp-list"), itemsEl = $(".ibp-items"), listCount = $(".ibp-list-count"), listEmpty = $(".ibp-list-empty");
    const fileIn = $(".ibp-file"), folderIn = $(".ibp-folder"), ccIn = $(".ibp-ccfile");

    // v1.2.0 — THE DIVIDER between player and playlist (desktop, >= 900 px): drag it left or right like the
    // playlist pane of Windows Media Player, so long titles and dates show in full. Remembered per browser;
    // arrow keys move it 20 px (Shift = 60), Home / End = narrowest / widest, double-click = default 340 px.
    const split = $(".ibp-split"), LIST_W = 340, LIST_MIN = 240;
    const listMax = () => Math.max(LIST_MIN, Math.min(root.clientWidth * 0.7, root.clientWidth - 360));
    function setListW(w, save) {
      if (!root.clientWidth) return 0;   // not on screen (a host page hid it) — keep the saved width
      const v = Math.round(clamp(w, LIST_MIN, listMax()));
      root.style.setProperty("--ibp-list-w", v + "px");
      split.setAttribute("aria-valuenow", String(v)); split.setAttribute("aria-valuemin", String(LIST_MIN)); split.setAttribute("aria-valuemax", String(Math.round(listMax())));
      if (save) LS("ibp:listW", String(v));
      return v;
    }
    const savedW = () => Number(LS("ibp:listW")) || LIST_W;
    split.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); try { split.setPointerCapture(e.pointerId); } catch {} split.focus({ preventScroll: true });
      const x0 = e.clientX, w0 = listEl.getBoundingClientRect().width;
      root.classList.add("ibp-resizing");
      const move = (ev) => setListW(w0 + (x0 - ev.clientX), false);
      const up = (ev) => { split.removeEventListener("pointermove", move); split.removeEventListener("pointerup", up); split.removeEventListener("pointercancel", up); root.classList.remove("ibp-resizing"); setListW(w0 + (x0 - ev.clientX), true); };
      split.addEventListener("pointermove", move); split.addEventListener("pointerup", up); split.addEventListener("pointercancel", up);
    });
    split.addEventListener("dblclick", () => { setListW(LIST_W, true); showFlash("Playlist width reset"); });
    split.addEventListener("keydown", (e) => {
      const cur = listEl.getBoundingClientRect().width, step = e.shiftKey ? 60 : 20;
      if (e.key === "ArrowLeft") setListW(cur + step, true);          // the divider moves left = a wider playlist
      else if (e.key === "ArrowRight") setListW(cur - step, true);
      else if (e.key === "Home") setListW(LIST_MIN, true);
      else if (e.key === "End") setListW(listMax(), true);
      else if (e.key === "Enter") setListW(LIST_W, true);
      else return;
      e.preventDefault();
    });
    onWin("resize", () => setListW(savedW(), false));

    const st = {
      items: [], index: -1, repeat: LS("ibp:repeat") || "off", shuffle: false, rate: Number(LS("ibp:rate")) || 1,
      volume: LS("ibp:volume") == null ? 1 : Number(LS("ibp:volume")), muted: LS("ibp:muted") === "1",
      pitch: LS("ibp:pitch") !== "0", dragging: false, blobUrl: "", ccUrl: "", hideTimer: 0, saveTimer: 0,
      photoSec: PHOTO_SECS.includes(Number(LS("ibp:photoSec"))) ? Number(LS("ibp:photoSec")) : 5,
    };

    /* v1.4.0 — PHOTO SLIDESHOW (CEO, 1 Oct 2026: "add the photo mode slideshow"). The standard of Windows Photos,
     * Google Photos and VLC: photos sit in the same playlist as audio and video; each shows for a set time
     * (3/5/10/15/30 s, default 5, remembered) and the playlist moves on — shuffle and repeat included. Space
     * pauses, ←/→ and J/L go to the previous/next photo, the seek bar is the photo's own clock, double-click
     * is full screen. The photo is fitted (never cropped), turned upright from its camera data by the browser,
     * and fades in. A clock replaces the <video>'s: ph.elapsed seconds, ticking only while ph.playing. */
    const ph = { playing: false, elapsed: 0, t0: 0, timer: 0 };
    const isPhoto = () => { const it = st.items[st.index]; return !!it && it.kind === "image"; };
    const playingNow = () => (isPhoto() ? ph.playing : !video.paused);
    const durNow = () => (isPhoto() ? st.photoSec : video.duration);
    function photoUrl(it) { if (!it.thumb) it.thumb = it.file ? URL.createObjectURL(it.file) : it.url; return it.thumb; }
    function uiPlaying(on) {
      playBtns.forEach((b) => { b.innerHTML = on ? ICON.pause : ICON.play; b.setAttribute("aria-label", on ? "Pause (Space)" : "Play (Space)"); });
      root.classList.toggle("ibp-playing", on);
      if (on) scheduleHide(); else root.classList.remove("ibp-hide");
    }
    function photoTick() {
      ph.elapsed = (performance.now() - ph.t0) / 1000;
      if (ph.elapsed >= st.photoSec) { ph.elapsed = st.photoSec; paintPhoto(); photoEnded(); return; }
      paintPhoto();
    }
    function photoPlay() {
      if (!isPhoto()) return;
      LIVE.forEach((v) => { if (!v.paused) v.pause(); });
      if (synth && synth.speaking) { synth.cancel(); root.classList.remove("ibp-reading"); }
      if (ph.elapsed >= st.photoSec) ph.elapsed = 0;
      ph.playing = true; ph.t0 = performance.now() - ph.elapsed * 1000;
      clearInterval(ph.timer); ph.timer = setInterval(photoTick, 100);
      uiPlaying(true);
    }
    function photoPause() { ph.playing = false; clearInterval(ph.timer); ph.timer = 0; uiPlaying(false); paintPhoto(); }
    function photoStop() { ph.playing = false; clearInterval(ph.timer); ph.timer = 0; ph.elapsed = 0; }
    function photoEnded() {
      if (st.repeat === "one") { ph.elapsed = 0; ph.t0 = performance.now(); return; }
      const j = nextIndex(1);
      if (j >= 0) load(j, true); else photoPause();   // end of the list with repeat off: stay on the last photo
    }
    function paintPhoto() {
      const d = st.photoSec, t = Math.min(ph.elapsed, d), f = t / d;
      prog.style.width = (f * 100) + "%"; knob.style.left = (f * 100) + "%"; buf.style.width = "100%";
      cur.textContent = fmtTime(t); dur.textContent = fmtTime(d);
      seek.setAttribute("aria-valuenow", String(Math.round(f * 100))); seek.setAttribute("aria-valuetext", `${Math.floor(t)} of ${d} seconds of this photo`);
      if (o.onTime) o.onTime(t, d);
    }
    function setPhotoSec(s, announce) {
      st.photoSec = PHOTO_SECS.includes(s) ? s : 5; LS("ibp:photoSec", String(st.photoSec));
      if (ph.playing) ph.t0 = performance.now() - Math.min(ph.elapsed, st.photoSec) * 1000;
      updatePhotoUI();
      if (announce) showFlash(`Each photo: ${st.photoSec} s`);
    }
    function updatePhotoUI() {
      photoSecVal.textContent = st.photoSec + " s";
      $$(".ibp-chip[data-psec]").forEach((b) => b.classList.toggle("ibp-on", Number(b.dataset.psec) === st.photoSec));
      // On a photo the speed button shows the slide time instead (the speed of a still picture means nothing).
      speedLabel.textContent = isPhoto() ? st.photoSec + " s" : (fmtRate(st.rate) === "Normal" ? "1×" : fmtRate(st.rate));
      if (isPhoto()) paintPhoto();
    }

    /* ---------------------------------- items ---------------------------------- */
    function keyOf(it) { return it.file ? `${it.file.name}|${it.file.size}|${it.file.lastModified}` : `url|${it.url}`; }
    /* v1.4.1 — `now: true` = the user OPENED these files (Windows "Open with" / double-click into the running
     * app, the Open and Folder buttons, a drop): play the first one at once, even when something else is
     * playing or was stopped midway, and even when that file is already in the playlist (it is not added
     * twice — its existing entry plays). The standard of VLC and Windows Media Player. CEO, 1 Oct 2026: the
     * installed app kept showing the old audio and he had to close the player before a new one would open. */
    function addItems(list, { play = true, now = false } = {}) {
      const added = [];
      let first = -1;
      for (const raw of list) {
        const it = makeItem(raw);
        if (!it) continue;
        const have = st.items.findIndex((x) => x.key === it.key);
        if (have >= 0) { if (first < 0) first = have; continue; }
        st.items.push(it); added.push(it);
        if (first < 0) first = st.items.length - 1;
      }
      renderList();
      if (now && first >= 0) { load(first, true); if (added.length > 1) showFlash(`${added.length} added to the playlist`); }
      else if (added.length && play && (st.index < 0 || !playingNow() && !(isPhoto() ? ph.elapsed : video.currentTime))) load(st.items.indexOf(added[0]), true);
      else if (st.index < 0 && st.items.length) load(0, false);
      return added.length;
    }
    const openNow = (files) => addItems(files.map((f) => ({ file: f })), { now: true });
    function makeItem(raw) {
        const it = raw.file
          ? { file: raw.file, name: raw.file.name, title: raw.title || raw.file.name.replace(/\.[^.]+$/, ""), mime: raw.file.type || MIME[extOf(raw.file.name)] || "", kind: kindOf(raw.file.name, raw.file.type) }
          : { url: raw.url, name: raw.name || decodeURIComponent(String(raw.url).split("/").pop() || ""), title: raw.title || decodeURIComponent(String(raw.url).split("/").pop() || "").replace(/\.[^.]+$/, ""), mime: raw.mime || MIME[extOf(raw.url)] || "", kind: raw.kind || kindOf(raw.url, raw.mime), poster: raw.poster || "" };
        if (it.kind === "caption") { attachCaptionFile(raw.file); return null; }
        if (!it.kind) { it.kind = "video"; }   // unknown extension: let the browser try
        it.key = keyOf(it);
        return it;
    }
    // v1.2.1 — replace the playlist with a host's fresh list, in the host's order, WITHOUT interrupting playback:
    // the playing item stays loaded and current, durations already read are kept, files the user opened
    // themselves stay at the end, and the list keeps its scroll position. Returns true when anything changed.
    function syncItems(list) {
      const cur = st.items[st.index] || null, old = new Map(st.items.map((x) => [x.key, x]));
      const fresh = [];
      for (const raw of list || []) { const it = raw.file ? null : makeItem(raw); if (it && !fresh.some((x) => x.key === it.key)) fresh.push(it); }
      fresh.forEach((x) => { const o = old.get(x.key); if (o && o.duration) x.duration = o.duration; });
      const keys = new Set(fresh.map((x) => x.key));
      const next = [...fresh, ...st.items.filter((x) => x.file && !keys.has(x.key))];
      if (cur && !next.some((x) => x.key === cur.key)) next.push(cur);   // never pull the playing item away
      const same = next.length === st.items.length && next.every((x, i) => x.key === st.items[i].key && x.name === st.items[i].name && x.title === st.items[i].title);
      if (same) return false;
      st.items = next.map((x) => (cur && x.key === cur.key ? Object.assign(cur, { name: x.name, title: x.title }) : x));
      st.index = cur ? st.items.indexOf(cur) : -1;
      const top = itemsEl.scrollTop;
      renderList(); itemsEl.scrollTop = top;
      if (st.index < 0 && st.items.length) load(0, false);
      return true;
    }
    function load(i, play) {
      if (i < 0 || i >= st.items.length) return;
      savePos();
      const it = st.items[i];
      st.index = i;
      if (st.blobUrl) { URL.revokeObjectURL(st.blobUrl); st.blobUrl = ""; }
      clearCaptions();
      hideMsg();
      photoStop();
      if (it.kind === "image") {
        // v1.4.0 — a photo: empty the <video> (its pause event is ignored in photo mode), show the picture, start the clock.
        if (!video.paused) video.pause();
        if (video.getAttribute("src")) { video.removeAttribute("src"); try { video.load(); } catch {} }
        root.classList.remove("ibp-audio"); root.classList.add("ibp-photo-mode");
        art.hidden = true; empty.hidden = true;
        photo.classList.remove("ibp-shown"); photo.alt = it.title;
        photo.src = photoUrl(it);
        if (/^(heic|heif)$/.test(extOf(it.name))) showMsg(`${it.name} is an iPhone HEIC photo. Chrome and Edge on Windows cannot show HEIC — save it as JPG (Photos app: … > Save as) and open it again.`);
        renderList(); updatePhotoUI(); paintPhoto(); setMediaSession(it);
        if (play) photoPlay(); else uiPlaying(false);
        if (o.onChange) o.onChange(it, i);
        return;
      }
      root.classList.remove("ibp-photo-mode"); photo.removeAttribute("src"); photo.classList.remove("ibp-shown");
      const src = it.file ? (st.blobUrl = URL.createObjectURL(it.file)) : it.url;
      // Say early when the browser has no decoder for this container.
      if (it.mime && video.canPlayType(it.mime) === "" && !/matroska|quicktime|x-msvideo|mp2t|ms-wmv|x-flv|mpeg$/.test(it.mime)) {
        showMsg(`This browser cannot play ${it.mime.split(";")[0]} files. Convert the file to MP4 (video) or MP3 (audio) and open it again.`);
      }
      // v1.3.0 — once the boost chain exists, a file from another site must be fetched with CORS or Web Audio
      // hands it on as silence. Same-site and local files never need it (and some servers refuse it).
      if (boost.src && !sameOrigin(src)) video.crossOrigin = "anonymous"; else video.removeAttribute("crossorigin");
      video.src = src;
      video.poster = it.poster || "";
      root.classList.toggle("ibp-audio", it.kind === "audio");
      $(".ibp-art-title").textContent = it.title;
      $(".ibp-art-sub").textContent = it.name === it.title ? "" : it.name;
      empty.hidden = true;
      art.hidden = it.kind !== "audio";
      const pos = Number(LS("ibp:pos:" + it.key)) || 0;
      video.addEventListener("loadedmetadata", () => { if (pos > 3 && pos < video.duration - 5) video.currentTime = pos; }, { once: true });
      applyRate(st.rate);
      video.playbackRate = st.rate;
      renderList();
      updatePhotoUI();   // puts the speed label back from "5 s" to the rate
      setMediaSession(it);
      if (play) video.play().catch(() => {});
      if (o.onChange) o.onChange(it, i);
    }
    function savePos() {
      const it = st.items[st.index];
      if (!it || !isFinite(video.duration)) return;
      const done = video.duration - video.currentTime < 5;
      LS("ibp:pos:" + it.key, done ? "0" : String(Math.floor(video.currentTime)));
    }
    function nextIndex(dir) {
      const n = st.items.length;
      if (!n) return -1;
      if (st.shuffle && n > 1) { let j; do { j = Math.floor(Math.random() * n); } while (j === st.index); return j; }
      const j = st.index + dir;
      if (j >= n) return st.repeat === "all" ? 0 : -1;
      if (j < 0) return st.repeat === "all" ? n - 1 : 0;
      return j;
    }
    function removeItem(i) {
      const wasCurrent = i === st.index;
      const [gone] = st.items.splice(i, 1);
      dropThumb(gone);
      if (wasCurrent) { photoStop(); uiPlaying(false); clearStage(); video.pause(); video.removeAttribute("src"); video.load(); st.index = -1; art.hidden = true; if (st.items.length) load(Math.min(i, st.items.length - 1), false); else { empty.hidden = false; setTitle(""); } }
      else if (i < st.index) st.index--;
      renderList();
    }
    function renderList() {
      listCount.textContent = st.items.length ? `${st.items.length}` : "";
      listEmpty.hidden = st.items.length > 0;
      // v1.4.0 — a photo shows its own thumbnail (lazy: only the rows on screen are decoded) and "Photo".
      itemsEl.innerHTML = st.items.map((it, i) => `<li class="ibp-item${i === st.index ? " ibp-current" : ""}" data-i="${i}" draggable="true">
        <span class="ibp-item-ico${it.kind === "image" ? " ibp-item-thumb" : ""}">${it.kind === "image" ? `<img src="${esc(photoUrl(it))}" alt="" loading="lazy" decoding="async" draggable="false">` : it.kind === "audio" ? ICON.music : ICON.film}</span>
        <span class="ibp-item-t"><span class="ibp-item-title">${esc(it.title)}</span><span class="ibp-item-sub">${it.kind === "image" ? "Photo" + (it.name !== it.title ? " · " + esc(it.name) : "") : esc(it.name !== it.title ? it.name : (it.kind === "audio" ? "Audio" : "Video"))}${it.duration && it.kind !== "image" ? " · " + fmtTime(it.duration) : ""}</span></span>
        <button type="button" class="ibp-ic ibp-sm ibp-item-rm" data-rm="${i}" aria-label="Remove from playlist">${ICON.trash}</button></li>`).join("");
      const c = itemsEl.querySelector(".ibp-current"); if (c && listEl.classList.contains("ibp-list-open")) c.scrollIntoView({ block: "nearest" });
      setTitle(st.items[st.index] ? st.items[st.index].title : "");
    }
    function setTitle(t) { if (o.onTitle) o.onTitle(t); }
    function dropThumb(it) { if (it && it.file && it.thumb) { URL.revokeObjectURL(it.thumb); it.thumb = ""; } }
    function clearStage() { root.classList.remove("ibp-photo-mode"); photo.removeAttribute("src"); photo.classList.remove("ibp-shown"); }

    /* --------------------------------- playback -------------------------------- */
    function togglePlay() {
      if (st.index < 0) { if (st.items.length) load(0, true); else fileIn.click(); return; }
      if (isPhoto()) { if (ph.playing) { photoPause(); showFlash("Slideshow paused"); } else photoPlay(); return; }
      if (video.paused) video.play().catch(() => {}); else video.pause();
    }
    // On a photo, "skip" means the previous/next item — what every photo viewer does with ← → and J/L.
    function seekBy(d) {
      if (isPhoto()) { if (d > 0) next(); else prev(); return; }
      if (!isFinite(video.duration)) return; video.currentTime = clamp(video.currentTime + d, 0, video.duration); showFlash(d > 0 ? `+${d} s` : `${d} s`);
    }
    function seekTo(frac) {
      if (isPhoto()) { ph.elapsed = clamp(frac, 0, 1) * st.photoSec; ph.t0 = performance.now() - ph.elapsed * 1000; paintPhoto(); return; }
      if (!isFinite(video.duration)) return; video.currentTime = clamp(frac, 0, 1) * video.duration;
    }
    function applyRate(r) {
      r = roundRate(r);
      st.rate = r;
      video.playbackRate = r;
      try { video.preservesPitch = st.pitch; video.mozPreservesPitch = st.pitch; video.webkitPreservesPitch = st.pitch; } catch {}
      if (!isPhoto()) speedLabel.textContent = fmtRate(r) === "Normal" ? "1×" : fmtRate(r);   // v1.4.0: a photo shows its slide time there
      customVal.textContent = fmtRate(r) === "Normal" ? "1×" : fmtRate(r);
      rateRange.value = String(r);
      $$(".ibp-chip[data-rate]").forEach((b) => b.classList.toggle("ibp-on", Math.abs(Number(b.dataset.rate) - r) < 0.001));
      LS("ibp:rate", String(r));
    }
    function setRate(r, announce = true) { applyRate(r); if (announce) showFlash(fmtRate(st.rate)); }
    /* v1.3.0 — volume 0–200 %. Up to 100 % it is the element's own volume, as before. Above 100 % the element
     * stays at 1.0 and a Web Audio gain adds the rest, with a limiter after it. The chain is built the first
     * time a boost is asked for, never before: once an element is routed into Web Audio it stays routed, and
     * a file from another site that does not allow it (CORS) would then play silent. */
    const boost = { src: null, gain: null, lim: null, clip: null, limited: false, failed: false };
    function boostBlocked() {
      if (boost.gain) return "";
      if (boost.failed || !(window.AudioContext || window.webkitAudioContext)) return "Volume boost is not available in this browser";
      if (!sameOrigin(video.currentSrc || video.src)) return "Volume boost works for files on this device or this site";
      const ua = navigator.userActivation;
      if (ua && !ua.hasBeenActive) return "Click or tap the player once, then boost";   // a context made before any click stays silent
      return "";
    }
    function boostChain() {
      if (boost.gain) return true;
      if (boostBlocked()) return false;
      const ctx = audioCtx();
      if (!ctx) { boost.failed = true; return false; }
      try {
        boost.src = ctx.createMediaElementSource(video);
        boost.gain = ctx.createGain();
        boost.lim = ctx.createDynamicsCompressor();
        // A limiter (−3 dBFS, 20:1, 1 ms attack) makes speech louder without the peaks clipping. A compressor
        // still lets the first millisecond of a sharp peak through, so a soft-clip stage after it rounds off
        // anything above 70 % of full scale and can never reach 100 %. Chosen by measurement on 1 Oct 2026
        // (a loud speech MP3, peaks −1.8 dBFS): 125/150/200 % = +2.6/+3.2/+4.0 dB louder, 0 clipped samples,
        // 2 % of the sound in the rounding zone at 200 %. A quiet recording gets the full +6 dB at 200 %.
        // v1.5.0 re-measured up to 300 %: loud file +3.9/+4.3/+4.6 dB at 200/250/300 % (the limiter holds the peaks,
        // ~5 % rounded); a recording 12 dB quieter +7.7 dB at 200 % and +11.3 dB at 300 %; 0 clipped samples throughout.
        // Rejected: limiter only (a 150 % boost touched full scale); compress-then-boost (+6 dB jump at 105 %
        // and 10–15 % of the sound saturated); oversample "2x" (its filter overshot past full scale).
        boost.lim.threshold.value = -3; boost.lim.knee.value = 0; boost.lim.ratio.value = 20;
        boost.lim.attack.value = 0.001; boost.lim.release.value = 0.1;
        boost.clip = ctx.createWaveShaper();
        const n = 4096, curve = new Float32Array(n), K = 0.7;
        for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1, a = Math.abs(x); curve[i] = a < K ? x : Math.sign(x) * (K + (1 - K) * Math.tanh((a - K) / (1 - K))); }
        boost.clip.curve = curve; boost.clip.oversample = "none";
        // Fixed wiring: limiter → soft clip → speakers. Only the gain's output is switched (see applyVolume).
        boost.lim.connect(boost.clip); boost.clip.connect(ctx.destination);
        boost.src.connect(boost.gain); boost.gain.connect(ctx.destination);
      } catch (e) { boost.failed = true; boost.src = boost.gain = boost.lim = boost.clip = null; return false; }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    // Returns false when the asked-for boost could not be applied (the caller then falls back to 100 %).
    function applyVolume() {
      const v = st.volume, boosting = v > 1;
      video.volume = Math.min(v, 1);
      if (boosting && !boostChain()) return false;
      if (boost.gain) {
        const ctx = AUDIO_CTX;
        boost.gain.gain.setTargetAtTime(Math.max(1, v), ctx.currentTime, 0.015);
        if (boosting !== boost.limited) {   // the limiter sits in the chain only while boosting
          // Targeted disconnects only: unplug exactly the old route, nothing else wired to these nodes.
          const cut = (a, b) => { try { a.disconnect(b); } catch {} };
          if (boosting) { cut(boost.gain, ctx.destination); boost.gain.connect(boost.lim); }
          else { cut(boost.gain, boost.lim); boost.gain.connect(ctx.destination); }
          boost.limited = boosting;
        }
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      }
      return true;
    }
    function volText() { return st.muted ? "Muted" : `Volume ${Math.round(st.volume * 100)}%${st.volume > 1 ? " · boost" : ""}`; }
    // how: "key" (always announce) · "slider" (announce only on entering/leaving the boost) · "init" (silent)
    function setVolume(v, how) {
      const was = st.volume;
      st.volume = Math.round(clamp(v, 0, VOL_MAX) * 100) / 100;
      if (!applyVolume()) {
        const why = boostBlocked();
        if (how === "init") { video.volume = 1; updateVolIcon(); return; }   // keep the saved boost; retried on the first click/key
        st.volume = 1; applyVolume(); showFlash(why || "Volume boost is not available"); how = "";
      }
      LS("ibp:volume", String(st.volume));
      if (how !== "init" && st.volume > 0 && st.muted) setMuted(false);
      updateVolIcon();
      if (how === "key" || (how === "slider" && (st.volume > 1) !== (was > 1))) showFlash(volText());
    }
    function setMuted(m) { st.muted = m; video.muted = m; LS("ibp:muted", m ? "1" : "0"); updateVolIcon(); }
    function updateVolIcon() {
      const pct = Math.round(st.volume * 100), boosting = st.volume > 1;
      muteBtn.innerHTML = st.muted || st.volume === 0 ? ICON.mute : ICON.vol;
      muteBtn.title = `${st.muted ? "Unmute" : "Mute"} (M) · volume ${pct}%`;
      [volRange, menuVol].forEach((r) => {
        r.value = String(st.volume);
        r.setAttribute("aria-valuetext", `${pct}%${boosting ? ", boost" : ""}${st.muted ? ", muted" : ""}`);
        // Fill: accent up to 100 %, orange for the boosted part (the slider spans 0–200 %, so 100 % is the middle).
        const eff = st.muted ? 0 : st.volume;
        r.style.setProperty("--a", (Math.min(eff, 1) / VOL_MAX * 100) + "%");
        r.style.setProperty("--b", (eff / VOL_MAX * 100) + "%");
        r.style.setProperty("--n", (100 / VOL_MAX) + "%");   // v1.5.0 — the 100 % notch
      });
      volPct.textContent = st.muted ? "Muted" : pct + "%";
      menuVolVal.textContent = st.muted ? "Muted" : pct + "%";
      root.classList.toggle("ibp-boosting", boosting && !st.muted);
      $$(".ibp-chip[data-vol]").forEach((b) => b.classList.toggle("ibp-on", !st.muted && Math.abs(Number(b.dataset.vol) - st.volume) < 0.001));
      const mc = $(".ibp-volpresets [data-act=mute]"); if (mc) mc.classList.toggle("ibp-on", st.muted);
    }
    function cycleRepeat() { st.repeat = st.repeat === "off" ? "all" : st.repeat === "all" ? "one" : "off"; LS("ibp:repeat", st.repeat); updateRepeat(); showFlash(st.repeat === "off" ? "Repeat off" : st.repeat === "all" ? "Repeat all" : "Repeat one"); }
    function updateRepeat() { repeatBtn.innerHTML = st.repeat === "one" ? ICON.repeat1 : ICON.repeat; repeatBtn.classList.toggle("ibp-on", st.repeat !== "off"); video.loop = st.repeat === "one"; }
    function toggleFull() {
      const el = root;
      if (document.fullscreenElement === el || root.classList.contains("ibp-fs-fallback")) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        root.classList.remove("ibp-fs-fallback");
      } else if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => root.classList.add("ibp-fs-fallback"));
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();   // iPhone: the video only
      else root.classList.add("ibp-fs-fallback");
    }
    async function togglePip() {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (document.pictureInPictureEnabled && st.items[st.index] && st.items[st.index].kind === "video") await video.requestPictureInPicture();
        else showFlash("Picture in picture is for video");
      } catch (e) { showFlash("Picture in picture is not available"); }
    }
    function showFlash(text) { flash.textContent = text; flash.classList.add("ibp-flash-on"); clearTimeout(flash._t); flash._t = setTimeout(() => flash.classList.remove("ibp-flash-on"), 700); }
    function showMsg(text) { msg.textContent = text; msg.hidden = false; }
    function hideMsg() { msg.hidden = true; }

    /* --------------------------------- captions -------------------------------- */
    function clearCaptions() { $$("track", video).forEach((t) => t.remove()); if (st.ccUrl) { URL.revokeObjectURL(st.ccUrl); st.ccUrl = ""; } ccBtn.classList.remove("ibp-on"); ccBtn.classList.remove("ibp-has"); }
    async function attachCaptionFile(file) {
      if (!file) return;
      const text = await file.text();
      const vtt = /^\s*WEBVTT/.test(text) ? text : srtToVtt(text);
      clearCaptions();
      st.ccUrl = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
      const tr = document.createElement("track");
      tr.kind = "subtitles"; tr.label = file.name; tr.srclang = "und"; tr.src = st.ccUrl; tr.default = true;
      video.appendChild(tr);
      tr.addEventListener("load", () => { tr.track.mode = "showing"; ccBtn.classList.add("ibp-on"); });
      ccBtn.classList.add("ibp-has");
      showFlash("Captions: " + file.name);
    }
    function toggleCaptions() {
      const tr = video.textTracks && video.textTracks[0];
      if (!tr) { ccIn.click(); return; }
      tr.mode = tr.mode === "showing" ? "hidden" : "showing";
      ccBtn.classList.toggle("ibp-on", tr.mode === "showing");
      showFlash(tr.mode === "showing" ? "Captions on" : "Captions off");
    }

    /* ------------------------------ media session ------------------------------ */
    function setMediaSession(it) {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: o.title || "IBI Media Player", artwork: it.poster ? [{ src: it.poster }] : [] });
        navigator.mediaSession.metadata.artwork = it.kind === "image" ? [{ src: photoUrl(it) }] : navigator.mediaSession.metadata.artwork;
        navigator.mediaSession.setActionHandler("play", () => (isPhoto() ? photoPlay() : video.play()));
        navigator.mediaSession.setActionHandler("pause", () => (isPhoto() ? photoPause() : video.pause()));
        navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-10));
        navigator.mediaSession.setActionHandler("seekforward", () => seekBy(10));
        navigator.mediaSession.setActionHandler("previoustrack", () => prev());
        navigator.mediaSession.setActionHandler("nexttrack", () => next());
        navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime != null) video.currentTime = d.seekTime; });
      } catch {}
    }
    // Browsing photos while the slideshow is paused keeps it paused (Windows Photos / Google Photos behaviour).
    const keepPlaying = () => (isPhoto() ? ph.playing : true);
    function next() { const j = nextIndex(1); if (j >= 0) load(j, keepPlaying()); else if (isPhoto()) { photoPause(); showFlash("Last item"); } else { video.pause(); } }
    function prev() { if (!isPhoto() && video.currentTime > 3) { video.currentTime = 0; return; } const j = nextIndex(-1); if (j >= 0) load(j, keepPlaying()); }

    /* -------------------------------- read aloud -------------------------------- */
    /* v1.1.0 (CEO, 27 Sep 2026: "provide as many voices as possible, both female and male, so
     * that we can select, also set a default voice"). The browser's own speech engine reads
     * any text in any voice the device offers — Windows ships Microsoft voices, Android ships
     * Google voices in Indian English and other languages, and Edge adds its online voices.
     * The chosen voice is remembered as the default (ibp:voice). Rate 0.5×–3× on the same
     * scale as the player; the engine itself clamps what it cannot do. */
    const readMenu = $(".ibp-readmenu"), readText = $(".ibp-readtext"), voiceSel = $(".ibp-voices"), readRate = $(".ibp-readrate"), readRateVal = $(".ibp-read-rateval"), readHint = $(".ibp-read-hint"), txtIn = $(".ibp-txtfile");
    const synth = window.speechSynthesis;
    let voices = [], utter = null;
    const FEMALE_RE = /female|woman|zira|hazel|heera|neerja|swara|pallavi|kavya|aashi|ananya|jenny|aria|ava|emma|sonia|libby|natasha|luna|samantha|karen|moira|tessa|veena|fiona|susan|catherine|serena|ayanda|leila|priya|vidya|sunita|salli|joanna|kimberly|ivy|nicole|raveena|aditi|kajal|google uk english female|google us english/i;
    const MALE_RE = /male|man\b|david|mark|george|james|prabhat|madhur|valluvar|kunal|rehaan|arjun|guy|andrew|christopher|brian|eric|roger|steffan|ryan|thomas|william|wayne|connor|liam|daniel|alex|fred|rishi|arthur|oliver|ravi|matthew|joey|justin|brian|google uk english male/i;
    // v1.1.1 — the word itself decides first ("UK English Female" was read as Male because "Female" contains "male").
    const genderOf = (v) => /female|woman/i.test(v.name) ? "Female" : /\bmale\b|\bman\b/i.test(v.name) ? "Male" : FEMALE_RE.test(v.name) ? "Female" : MALE_RE.test(v.name) ? "Male" : "";
    // v1.1.1 — the CEO's chosen default: Google's "US English" (female, online) wherever the device has it.
    const PREFERRED_DEFAULT = /^(google )?us english$/i;
    function loadVoices() {
      if (!synth) { readHint.textContent = "This browser has no speech engine."; return; }
      voices = synth.getVoices().slice().sort((a, b) => {
        const pa = /^(en-IN|ta-IN|hi-IN)/.test(a.lang) ? 0 : /^en/.test(a.lang) ? 1 : 2, pb = /^(en-IN|ta-IN|hi-IN)/.test(b.lang) ? 0 : /^en/.test(b.lang) ? 1 : 2;
        return pa - pb || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
      });
      const saved = LS("ibp:voice") || "";
      const preferred = saved ? voices.find((v) => v.voiceURI === saved) : (voices.find((v) => PREFERRED_DEFAULT.test(v.name)) || voices.find((v) => v.default));
      const groups = {};
      voices.forEach((v, i) => { const g = /^(en-IN|ta-IN|hi-IN)/.test(v.lang) ? "India" : /^en/.test(v.lang) ? "English, other regions" : "Other languages"; (groups[g] = groups[g] || []).push(`<option value="${i}"${v === preferred ? " selected" : ""}>${esc(v.name.replace(/^Microsoft |^Google /, ""))} · ${esc(v.lang)}${genderOf(v) ? " · " + genderOf(v) : ""}${v.localService ? "" : " · online"}</option>`); });
      voiceSel.innerHTML = Object.entries(groups).map(([g, opts]) => `<optgroup label="${g} (${opts.length})">${opts.join("")}</optgroup>`).join("") || `<option value="">No voices found yet — try again in a moment</option>`;
      readHint.textContent = voices.length ? `${voices.length} voices on this device. The default is marked; pick another and press Set as default.` : "";
    }
    if (synth) { loadVoices(); synth.addEventListener && synth.addEventListener("voiceschanged", loadVoices); setTimeout(loadVoices, 800); }
    function currentVoice() { const v = voices[Number(voiceSel.value)]; return v || null; }
    function speak() {
      if (!synth) return;
      const text = readText.value.trim();
      if (!text) { readHint.textContent = "Type or paste some text first, or open a .txt file."; readText.focus(); return; }
      if (synth.paused && synth.speaking) { synth.resume(); return; }
      synth.cancel();
      if (!video.paused) video.pause();
      utter = new SpeechSynthesisUtterance(text);
      const v = currentVoice(); if (v) { utter.voice = v; utter.lang = v.lang; }
      utter.rate = Number(readRate.value) || 1;
      utter.onstart = () => { root.classList.add("ibp-reading"); readHint.textContent = `Reading with ${v ? v.name.replace(/^Microsoft |^Google /, "") : "the default voice"} at ${fmtRate(utter.rate) === "Normal" ? "1×" : fmtRate(utter.rate)}.`; };
      utter.onend = utter.onerror = (e) => { root.classList.remove("ibp-reading"); if (e && e.type === "error" && e.error !== "interrupted" && e.error !== "canceled") readHint.textContent = "The voice could not read this: " + e.error; };
      utter.onboundary = (e) => { if (e.name === "word" && utter) { const done = Math.round(e.charIndex / text.length * 100); readHint.textContent = `Reading… ${done}%`; } };
      synth.speak(utter);
    }
    readRate.addEventListener("input", () => { readRateVal.textContent = fmtRate(Number(readRate.value)) === "Normal" ? "1×" : fmtRate(Number(readRate.value)); if (synth && synth.speaking) { const t = readText.value; const pos = 0; void pos; void t; } });
    txtIn.addEventListener("change", async () => { const f = txtIn.files[0]; if (f) { readText.value = await f.text(); readHint.textContent = `${f.name} loaded — press Read.`; } txtIn.value = ""; });
    onDoc("click", (e) => { if (!readMenu.hidden && !e.target.closest(".ibp-readmenu") && !e.target.closest("[data-act=read]")) readMenu.hidden = true; });
    onWin("beforeunload", () => { if (synth && synth.speaking) synth.cancel(); });

    /* ---------------------------------- events --------------------------------- */
    LIVE.add(video);
    video.addEventListener("play", () => { LIVE.forEach((v) => { if (v !== video && !v.paused) v.pause(); }); if (!root.isConnected) { video.pause(); return; }  if (synth && synth.speaking) { synth.cancel(); root.classList.remove("ibp-reading"); } playBtns.forEach((b) => { b.innerHTML = ICON.pause; b.setAttribute("aria-label", "Pause (Space)"); }); root.classList.add("ibp-playing"); scheduleHide(); });
    video.addEventListener("pause", () => { if (isPhoto()) return; playBtns.forEach((b) => { b.innerHTML = ICON.play; b.setAttribute("aria-label", "Play (Space)"); }); root.classList.remove("ibp-playing"); root.classList.remove("ibp-hide"); savePos(); });
    // v1.4.0 — the photo fades in once decoded; a picture the browser cannot decode says so and the slideshow moves on.
    photo.addEventListener("load", () => { photo.classList.add("ibp-shown"); });
    photo.addEventListener("error", () => {
      const it = st.items[st.index]; if (!it || it.kind !== "image" || !photo.getAttribute("src")) return;
      if (!/^(heic|heif)$/.test(extOf(it.name))) showMsg(`Cannot show ${it.name}: this browser cannot open this picture. JPG, PNG, WebP, GIF and AVIF work everywhere.`);
    });
    photo.addEventListener("click", () => togglePlay());
    photo.addEventListener("dblclick", () => toggleFull());
    video.addEventListener("ended", () => { savePos(); if (st.repeat !== "one") next(); });
    video.addEventListener("timeupdate", () => { if (!st.dragging) paint(); if (!st.saveTimer) st.saveTimer = setTimeout(() => { st.saveTimer = 0; savePos(); }, 5000); });
    video.addEventListener("durationchange", () => { const it = st.items[st.index]; if (it && isFinite(video.duration)) { it.duration = video.duration; const li = itemsEl.querySelector(`.ibp-item[data-i="${st.index}"] .ibp-item-sub`); if (li && !/·/.test(li.textContent)) li.textContent += " · " + fmtTime(video.duration); } paint(); });
    video.addEventListener("progress", paintBuffer);
    video.addEventListener("loadedmetadata", () => { paint(); const it = st.items[st.index]; if (it && it.kind === "video" && video.videoWidth === 0 && video.audioTracks !== undefined) { /* audio-only container */ } });
    video.addEventListener("error", () => {
      if (isPhoto()) return;
      const e = video.error; const it = st.items[st.index];
      const why = !e ? "" : e.code === 4 ? "the browser has no decoder for this file's format or codec" : e.code === 3 ? "the file is damaged or its codec is not supported" : e.code === 2 ? "the file could not be read" : "playback was stopped";
      if (boost.src && video.crossOrigin) { showMsg(`Cannot play ${it ? it.name : "this file"}: its website does not allow it while the volume boost is in use. Reload the page and play it at 100% or less.`); return; }
      showMsg(`Cannot play ${it ? it.name : "this file"}: ${why}. MP4 (H.264 + AAC) and MP3 play everywhere; MKV, MOV and HEVC depend on the codecs installed on this device.`);
    });
    video.addEventListener("ratechange", () => { if (Math.abs(video.playbackRate - st.rate) > 0.001) applyRate(video.playbackRate); });
    // v1.3.0 — while boosting, the element sits at 1.0 on purpose; only a change from outside (e.g. the
    // browser's own controls) below 100 % is adopted.
    video.addEventListener("volumechange", () => { if (st.dragging) return; st.muted = video.muted; if (!(st.volume > 1 && video.volume === 1)) st.volume = Math.round(video.volume * 100) / 100; updateVolIcon(); });
    // A boost saved last time but not yet allowed (no click on the page yet) is applied at the first play/click/key.
    const retryBoost = () => { if (st.volume > 1 && !boost.gain && !boostBlocked()) applyVolume(); if (AUDIO_CTX && AUDIO_CTX.state === "suspended" && boost.gain) AUDIO_CTX.resume().catch(() => {}); };
    video.addEventListener("play", retryBoost);
    onDoc("pointerdown", retryBoost); onDoc("keydown", retryBoost);
    video.addEventListener("click", () => togglePlay());
    video.addEventListener("dblclick", () => toggleFull());
    art.addEventListener("click", () => togglePlay());

    function paint() {
      if (isPhoto()) { paintPhoto(); return; }
      const d = video.duration, t = video.currentTime;
      const f = isFinite(d) && d > 0 ? t / d : 0;
      prog.style.width = (f * 100) + "%"; knob.style.left = (f * 100) + "%";
      cur.textContent = fmtTime(t); dur.textContent = isFinite(d) ? fmtTime(d) : "–:––";
      seek.setAttribute("aria-valuenow", String(Math.round(f * 100))); seek.setAttribute("aria-valuetext", `${fmtTime(t)} of ${fmtTime(d)}`);
      if (o.onTime) o.onTime(t, d);
    }
    function paintBuffer() {
      try { const d = video.duration; if (!isFinite(d) || !video.buffered.length) return; let end = 0; for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime + 1) end = Math.max(end, video.buffered.end(i)); buf.style.width = (end / d * 100) + "%"; } catch {}
    }
    // Seek bar: pointer events so a finger and a mouse behave the same; the knob follows while dragging.
    const fracAt = (clientX) => { const r = seek.getBoundingClientRect(); return clamp((clientX - r.left) / r.width, 0, 1); };
    // v1.4.0 — durNow() is the photo's slide time on a photo, the media duration otherwise.
    seek.addEventListener("pointerdown", (e) => { const D = durNow(); if (!isFinite(D)) return; st.dragging = true; seek.setPointerCapture(e.pointerId); const f = fracAt(e.clientX); prog.style.width = knob.style.left = (f * 100) + "%"; cur.textContent = fmtTime(f * D); tip.textContent = fmtTime(f * D); tip.style.left = (f * 100) + "%"; root.classList.add("ibp-scrub"); });
    seek.addEventListener("pointermove", (e) => { const f = fracAt(e.clientX), D = durNow(); tip.textContent = isFinite(D) ? fmtTime(f * D) : ""; tip.style.left = (f * 100) + "%"; if (st.dragging) { prog.style.width = knob.style.left = (f * 100) + "%"; cur.textContent = fmtTime(f * D); } });
    seek.addEventListener("pointerup", (e) => { if (!st.dragging) return; st.dragging = false; root.classList.remove("ibp-scrub"); seekTo(fracAt(e.clientX)); });
    seek.addEventListener("pointercancel", () => { st.dragging = false; root.classList.remove("ibp-scrub"); });
    seek.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") { seekBy(-5); e.preventDefault(); } if (e.key === "ArrowRight") { seekBy(5); e.preventDefault(); } });

    volRange.addEventListener("input", () => setVolume(Number(volRange.value), "slider"));
    menuVol.addEventListener("input", () => setVolume(Number(menuVol.value), "slider"));
    rateRange.addEventListener("input", () => setRate(Number(rateRange.value), false));
    pitchBox.addEventListener("change", () => { st.pitch = pitchBox.checked; LS("ibp:pitch", st.pitch ? "1" : "0"); applyRate(st.rate); });
    root.addEventListener("click", (e) => {
      const chip = e.target.closest(".ibp-chip[data-rate]"); if (chip) { setRate(Number(chip.dataset.rate)); return; }
      const vch = e.target.closest(".ibp-chip[data-vol]"); if (vch) { setVolume(Number(vch.dataset.vol), "key"); return; }
      const pch = e.target.closest(".ibp-chip[data-psec]"); if (pch) { setPhotoSec(Number(pch.dataset.psec), true); return; }
      const vst = e.target.closest(".ibp-vstep"); if (vst) { setVolume(st.volume + Number(vst.dataset.vstep), "key"); return; }
      const step = e.target.closest(".ibp-step"); if (step) { setRate(st.rate + Number(step.dataset.step)); return; }
      const rm = e.target.closest("[data-rm]"); if (rm) { removeItem(Number(rm.dataset.rm)); return; }
      const li = e.target.closest(".ibp-item"); if (li) { load(Number(li.dataset.i), true); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const act = b.dataset.act;
      if (act === "play") togglePlay();
      else if (act === "back") seekBy(-10);
      else if (act === "fwd") seekBy(10);
      else if (act === "prev") prev();
      else if (act === "next") next();
      // v1.3.0 — on a touch screen there is no hover slider, so the speaker button opens the Volume section
      // (with Mute in it); with a mouse it mutes, as before.
      else if (act === "mute" && TOUCH() && !b.closest(".ibp-menu")) { toggleMenu(speedMenu, speedMenu.hidden, menuVol); }
      else if (act === "mute") { setMuted(!st.muted); showFlash(volText()); }
      else if (act === "speed") toggleMenu(speedMenu, null, isPhoto() ? $(".ibp-chip[data-psec].ibp-on") : null);
      else if (act === "closemenu") toggleMenu(speedMenu, false);
      else if (act === "read") { readMenu.hidden = !readMenu.hidden; if (!readMenu.hidden) { speedMenu.hidden = true; loadVoices(); readText.focus({ preventScroll: true }); } }
      else if (act === "closeread") readMenu.hidden = true;
      else if (act === "readplay") speak();
      else if (act === "readpause") { if (synth && synth.speaking && !synth.paused) { synth.pause(); readHint.textContent = "Paused — press Read to continue."; } }
      else if (act === "readstop") { if (synth) synth.cancel(); root.classList.remove("ibp-reading"); readHint.textContent = "Stopped."; }
      else if (act === "open-txt") txtIn.click();
      else if (act === "voicedefault") { const v = currentVoice(); if (v) { LS("ibp:voice", v.voiceURI); readHint.textContent = `Default voice: ${v.name.replace(/^Microsoft |^Google /, "")}.`; showFlash("Default voice saved"); } }
      else if (act === "cc") toggleCaptions();
      else if (act === "pip") togglePip();
      else if (act === "shuffle") { st.shuffle = !st.shuffle; b.classList.toggle("ibp-on", st.shuffle); showFlash(st.shuffle ? "Shuffle on" : "Shuffle off"); }
      else if (act === "repeat") cycleRepeat();
      else if (act === "full") toggleFull();
      else if (act === "list") listEl.classList.toggle("ibp-list-open");
      else if (act === "open") fileIn.click();
      else if (act === "open-folder") folderIn.click();
      else if (act === "open-cc") ccIn.click();
      else if (act === "clear") { photoStop(); uiPlaying(false); clearStage(); hideMsg(); video.pause(); video.removeAttribute("src"); video.load(); st.items.forEach(dropThumb); st.items = []; st.index = -1; art.hidden = true; empty.hidden = false; renderList(); updatePhotoUI(); }
    });
    function TOUCH() { return window.matchMedia && window.matchMedia("(hover: none)").matches; }
    function toggleMenu(m, force, focusEl) { const open = force == null ? m.hidden : force; m.hidden = !open; if (open) { (focusEl || rateRange).focus({ preventScroll: true }); if (focusEl) focusEl.scrollIntoView({ block: "nearest" }); } }
    onDoc("click", (e) => { if (!speedMenu.hidden && !e.target.closest(".ibp-speedmenu") && !e.target.closest("[data-act=speed]") && !e.target.closest(".ibp-vol")) speedMenu.hidden = true; });
    fileIn.addEventListener("change", () => { openNow(Array.from(fileIn.files)); fileIn.value = ""; });
    folderIn.addEventListener("change", () => { const fs = Array.from(folderIn.files).filter((f) => kindOf(f.name, f.type)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); openNow(fs); folderIn.value = ""; });
    ccIn.addEventListener("change", () => { attachCaptionFile(ccIn.files[0]); ccIn.value = ""; });
    // Drag & drop anywhere on the player.
    ["dragenter", "dragover"].forEach((ev) => root.addEventListener(ev, (e) => { e.preventDefault(); root.classList.add("ibp-dragover"); }));
    ["dragleave", "drop"].forEach((ev) => root.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "dragleave" && e.relatedTarget && root.contains(e.relatedTarget)) return; root.classList.remove("ibp-dragover"); }));
    root.addEventListener("drop", async (e) => {
      const items = e.dataTransfer && e.dataTransfer.items;
      const files = [];
      if (items && items.length && items[0].webkitGetAsEntry) {
        const walk = async (entry) => { if (entry.isFile) await new Promise((r) => entry.file((f) => { files.push(f); r(); }, r)); else if (entry.isDirectory) { const rd = entry.createReader(); let batch; do { batch = await new Promise((r) => rd.readEntries(r, () => r([]))); for (const en of batch) await walk(en); } while (batch.length); } };
        for (const it of Array.from(items)) { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (en) await walk(en); }
      } else if (e.dataTransfer) files.push(...Array.from(e.dataTransfer.files));
      const media = files.filter((f) => kindOf(f.name, f.type)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (media.length) openNow(media); else showFlash("No playable files in the drop");
    });
    // Playlist re-ordering by drag.
    let dragFrom = -1;
    itemsEl.addEventListener("dragstart", (e) => { const li = e.target.closest(".ibp-item"); if (!li) return; dragFrom = Number(li.dataset.i); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); });
    itemsEl.addEventListener("dragover", (e) => { if (dragFrom >= 0) { e.preventDefault(); e.stopPropagation(); } });
    itemsEl.addEventListener("drop", (e) => { const li = e.target.closest(".ibp-item"); if (dragFrom < 0 || !li) return; e.preventDefault(); e.stopPropagation(); const to = Number(li.dataset.i); const [m] = st.items.splice(dragFrom, 1); st.items.splice(to, 0, m); if (st.index === dragFrom) st.index = to; else if (dragFrom < st.index && to >= st.index) st.index--; else if (dragFrom > st.index && to <= st.index) st.index++; dragFrom = -1; renderList(); });
    itemsEl.addEventListener("dragend", () => { dragFrom = -1; });

    // Keyboard, when the player has focus or nothing else is being typed into.
    function onKey(e) {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" && e.target.type !== "range" || tag === "textarea" || e.target.isContentEditable) return;
      if (!root.isConnected) return;   // v1.2.1 — a player no longer on the page never reacts
      if (o.keysGlobal === false && !root.contains(e.target)) return;
      if (e.target === split) return;   // the divider owns its own arrow keys
      const k = e.key;
      let handled = true;
      if (k === " " || k === "k" || k === "K") togglePlay();
      else if (k === "j" || k === "J") seekBy(-10);
      else if (k === "l" || k === "L") seekBy(10);
      else if (k === "ArrowLeft") seekBy(-5);
      else if (k === "ArrowRight") seekBy(5);
      else if (k === "ArrowUp") setVolume(st.volume + VOL_STEP, "key");     // v1.3.0 — on past 100 % up to 200 %, like VLC
      else if (k === "ArrowDown") setVolume(st.volume - VOL_STEP, "key");
      else if (k === "m" || k === "M") { setMuted(!st.muted); showFlash(volText()); }
      else if (k === "f" || k === "F") toggleFull();
      else if (k === "c" || k === "C") toggleCaptions();
      else if (k === "i" || k === "I") togglePip();
      else if (k === "r" || k === "R") cycleRepeat();
      else if (k === "n" || k === "N") next();
      else if (k === "p" || k === "P") prev();
      else if (k === ">" ) setRate(st.rate + 0.25);
      else if (k === "<") setRate(st.rate - 0.25);
      else if ((k === "." || k === ",") && isPhoto()) { /* frame step means nothing on a still photo */ }
      else if (k === "." && e.shiftKey === false && video.paused) { video.currentTime = Math.min(video.duration || 0, video.currentTime + 1 / 30); }
      else if (k === "," && video.paused) { video.currentTime = Math.max(0, video.currentTime - 1 / 30); }
      else if (k === "Home") seekTo(0);
      else if (k === "End") seekTo(1);
      else if (/^[0-9]$/.test(k)) seekTo(Number(k) / 10);
      else if (k === "Escape") { if (!speedMenu.hidden) speedMenu.hidden = true; else if (listEl.classList.contains("ibp-list-open")) listEl.classList.remove("ibp-list-open"); else handled = false; }
      else handled = false;
      if (handled) e.preventDefault();
    }
    onDoc("keydown", onKey);
    // Shift+, and Shift+. are < and > on most keyboards; 0.05 steps with Alt.
    onDoc("keydown", (e) => { if (e.altKey && (e.key === "." || e.key === ">")) { setRate(st.rate + 0.05); e.preventDefault(); } if (e.altKey && (e.key === "," || e.key === "<")) { setRate(st.rate - 0.05); e.preventDefault(); } });

    // Controls hide while playing video and the pointer is still.
    /* v1.5.1 — NO FLICKER (CEO, 6 Oct 2026, on the Grower's Player page: the control bar kept flickering). With the
     * cursor resting on the bar, hiding it (opacity, a 6 px slide, pointer-events off) changed what was under the
     * still cursor; Chrome then dispatched a pointermove that had not moved, which showed the bar, which hid again
     * 2.6 s later — a loop. The standard every player follows (YouTube, VLC): the controls never hide while the
     * pointer is ON them, and only a real movement counts. */
    const controlsEl = $(".ibp-controls");
    let overControls = false, lastPX = -1, lastPY = -1;
    if (controlsEl) {
      controlsEl.addEventListener("pointerenter", () => { overControls = true; clearTimeout(st.hideTimer); root.classList.remove("ibp-hide"); });
      controlsEl.addEventListener("pointerleave", () => { overControls = false; scheduleHide(); });
    }
    // Geometry, not events: a cursor already resting where the bar re-appears gets no pointerenter.
    function pointerOnControls() {
      if (overControls) return true;
      if (!controlsEl || lastPX < 0) return false;
      const b = controlsEl.getBoundingClientRect();
      return lastPX >= b.left && lastPX <= b.right && lastPY >= b.top - 8 && lastPY <= b.bottom;
    }
    function scheduleHide() { clearTimeout(st.hideTimer); root.classList.remove("ibp-hide"); if (playingNow() && !pointerOnControls() && !root.classList.contains("ibp-audio")) st.hideTimer = setTimeout(() => { if (speedMenu.hidden && !pointerOnControls()) root.classList.add("ibp-hide"); }, 2600); }
    root.addEventListener("pointerleave", () => { lastPX = lastPY = -1; overControls = false; scheduleHide(); }, { passive: true });   // left the player: it may hide
    root.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" && e.clientX === lastPX && e.clientY === lastPY) return;   // a layout change, not a move
      lastPX = e.clientX; lastPY = e.clientY; scheduleHide();
    }, { passive: true });
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => root.addEventListener(ev, scheduleHide, { passive: true }));
    onDoc("fullscreenchange", () => { const on = document.fullscreenElement === root; root.classList.toggle("ibp-fs", on); fullBtn.innerHTML = on ? ICON.unfull : ICON.full; });
    onWin("beforeunload", savePos);
    onDoc("visibilitychange", () => { if (document.hidden) savePos(); });

    // Initial state.
    setVolume(st.volume, "init"); setMuted(st.muted); pitchBox.checked = st.pitch; applyRate(st.rate); updateRepeat(); updatePhotoUI();
    setListW(savedW(), false); requestAnimationFrame(() => setListW(savedW(), false));   // again once laid out
    if (!document.pictureInPictureEnabled) pipBtn.hidden = true;
    if (o.items && o.items.length) addItems(o.items, { play: o.autoplay });

    // Files handed to the installed app ("Open with" / double-click). The manifest's launch_handler is
    // "focus-existing", so a running window receives them here — v1.4.1: they play NOW (openNow), and the
    // window is brought forward by the browser.
    if ("launchQueue" in window && window.launchQueue.setConsumer) {
      try { window.launchQueue.setConsumer(async (p) => { const fs = []; for (const h of p.files || []) { try { fs.push(await h.getFile()); } catch {} } if (fs.length) openNow(fs); }); } catch {}
    }

    return {
      version: VERSION, video, add: (list, play) => addItems(list, { play: play !== false }), open: (list) => addItems(list, { now: true }), sync: (list) => syncItems(list), play: () => (isPhoto() ? photoPlay() : video.play()), pause: () => (isPhoto() ? photoPause() : video.pause()),
      setRate, seekTo, next, prev, get state() { return { ...st }; }, openFiles: () => fileIn.click(),
      destroy() { savePos(); ac.abort(); photoStop(); st.items.forEach(dropThumb); video.pause(); if (boost.src) { try { boost.src.disconnect(); boost.gain.disconnect(); boost.lim.disconnect(); boost.clip.disconnect(); } catch {} } video.removeAttribute("src"); try { video.load(); } catch {} LIVE.delete(video); if (synth && synth.speaking) synth.cancel(); if (st.blobUrl) URL.revokeObjectURL(st.blobUrl); root.innerHTML = ""; root.classList.remove("ibp"); },
    };
  }

  window.IBIPlayer = { mount, VERSION, PRESETS, RATE_MIN, RATE_MAX, RATE_STEP };
})();
