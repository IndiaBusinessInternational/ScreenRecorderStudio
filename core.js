'use strict';
/* IBI Screen Recorder Studio — ENGINE: utilities, saved state, sources, audio mixer, compositor, recorder.
 * Everything runs in this browser tab; nothing is uploaded. ui.js draws the docks and dialogs on top of this. */
const APP_NAME = 'IBI Screen Recorder Studio';
const APP_VERSION = 'v1.1';

/* ───────────── utilities ───────────── */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clone = o => JSON.parse(JSON.stringify(o));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ibisr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ibisr.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const dbToLin = db => db <= -100 ? 0 : Math.pow(10, db / 20);
const linToDb = v => v <= 0 ? -Infinity : 20 * Math.log10(v);
const fmtDb = db => (db <= -100 || !isFinite(db)) ? '-inf dB' : (db > 0 ? '+' : '') + db.toFixed(1) + ' dB';

// Dates are shown the IBI way, in India time: "7 Oct 2026, Wednesday, 11:31:00 AM".
const DTF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
function dParts(d, f) { const p = {}; (f || DTF).formatToParts(d).forEach(x => { p[x.type] = x.value; }); return p; }
function fmtDate(v) {
  const d = new Date(v); if (isNaN(d)) return '';
  const p = dParts(d);
  return p.day + ' ' + p.month + ' ' + p.year + ', ' + p.weekday + ', ' + String(p.hour).padStart(2, '0') + ':' + p.minute + ':' + p.second + ' ' + String(p.dayPeriod || '').toUpperCase();
}
const STF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
function fileStamp(d) {
  const p = dParts(d || new Date(), STF);
  return { date: p.year + '-' + p.month + '-' + p.day, time: String(p.hour).padStart(2, '0') + '-' + p.minute + '-' + p.second + ' ' + String(p.dayPeriod || '').toUpperCase() };
}
const TF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
const DF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
function fmtClock(d) { const p = dParts(d, TF); return String(p.hour).padStart(2, '0') + ':' + p.minute + ':' + p.second + ' ' + String(p.dayPeriod || '').toUpperCase(); }
function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function fmtSize(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(b < 10 ? 2 : b < 100 ? 1 : 0) : b) + ' ' + u[i];
}
function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'IBI Recording'; }

function toast(msg, kind, action) {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || ''); t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = action.label; b.addEventListener('click', () => { t.remove(); action.run(); }); t.appendChild(b); }
  box.appendChild(t);
  const life = action ? 9000 : (kind === 'err' ? 6500 : 3800);
  setTimeout(() => t.classList.add('out'), life); setTimeout(() => t.remove(), life + 400);
}

/* IndexedDB: image/media files of sources, and the recording-folder handle. */
const idb = (() => {
  let p = null;
  function db() {
    if (!p) p = new Promise((res, rej) => {
      const r = indexedDB.open('ibisr', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('blobs'); r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return p;
  }
  async function op(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  return {
    get: (s, k) => op(s, 'readonly', x => x.get(k)).catch(() => undefined),
    set: (s, k, v) => op(s, 'readwrite', x => x.put(v, k)),
    del: (s, k) => op(s, 'readwrite', x => x.delete(k)).catch(() => {}),
    keys: s => op(s, 'readonly', x => x.getAllKeys()).catch(() => []),
  };
})();

/* ───────────── capabilities ───────────── */
const CAN = {
  display: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
  media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  mstp: typeof MediaStreamTrackProcessor === 'function',
  folder: typeof window.showDirectoryPicker === 'function',
  docPip: 'documentPictureInPicture' in window,
  recorder: typeof MediaRecorder === 'function',
  wakeLock: 'wakeLock' in navigator,
};

/* ───────────── saved state ───────────── */
const SOURCE_TYPES = {
  display: { label: 'Display Capture', icon: 'monitor', video: true, audio: true, live: true, desc: 'Your whole screen, one window or a browser tab — with its sound' },
  webcam: { label: 'Video Capture Device', icon: 'webcam', video: true, audio: false, live: true, desc: 'A webcam, or the phone camera' },
  mic: { label: 'Audio Input Capture', icon: 'mic', video: false, audio: true, live: true, desc: 'A microphone or line-in' },
  media: { label: 'Media Source', icon: 'film', video: true, audio: true, desc: 'A video or audio file from this device' },
  image: { label: 'Image', icon: 'image', video: true, desc: 'A logo, photo or overlay (PNG, JPG, GIF, WebP, SVG)' },
  text: { label: 'Text', icon: 'text', video: true, desc: 'Titles and captions — can show the live time and date' },
  color: { label: 'Color Source', icon: 'color', video: true, desc: 'A solid colour block or background' },
};
const DEF_SETTINGS = {
  format: 'auto', vkbps: 0, akbps: 160, countdown: 3, fileName: 'IBI Recording {date} {time}',
  confirmStop: false, miniOnRecord: true, snap: true, mixerLayout: 'vertical', dockH: 300, autoStart: true,
};
let S = Object.assign({}, DEF_SETTINGS, LS.get('settings', {}));
function saveSettings() { LS.set('settings', S); }

function defFilters() { return { opacity: 100, brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, shape: 'rect', radius: 24, borderW: 0, borderColor: '#ffffff', chroma: { on: false, color: '#00ff00', similarity: 400, smoothness: 80, spill: 100 } }; }
function defAudio() { return { volDb: 0, muted: false, monitor: false, gainDb: 0, mono: false, hidden: false }; }
function defSettingsFor(type) {
  switch (type) {
    case 'display': return { audio: true, cursor: 'always' };
    case 'webcam': return { deviceId: '', res: '1080', fps: 30, facing: 'user' };
    case 'mic': return { deviceId: '', ns: true, ec: true, agc: false };
    case 'media': return { fileName: '', loop: true, restart: true };
    case 'image': return { fileName: '' };
    case 'text': return { text: 'Your text here', font: 'Segoe UI', size: 72, bold: true, italic: false, color: '#ffffff', bg: '#000000', bgOpacity: 0, outlineW: 0, outlineColor: '#000000', align: 'left' };
    case 'color': return { color: '#35C0ED', w: coll ? coll.canvas.w : 1920, h: coll ? coll.canvas.h : 1080 };
  }
  return {};
}
function makeSource(type, name) {
  return { id: uid(), type, name, settings: defSettingsFor(type), filters: defFilters(), audio: defAudio(), nat: null };
}
function makeItem(sourceId, extra) {
  return Object.assign({ id: uid(), sourceId, x: 0, y: 0, sx: 1, sy: 1, rot: 0, flipH: false, flipV: false, crop: { l: 0, t: 0, r: 0, b: 0 }, visible: true, locked: false, fit: false }, extra || {});
}
let coll = null;
function defaultCollection() {
  coll = { v: 1, canvas: { w: 1920, h: 1080 }, fps: 30, scenes: [], sources: {}, program: '', preview: '', transition: { type: 'fade', ms: 300 }, studio: false };
  const items = [];
  if (CAN.display) {
    const d = makeSource('display', 'Display Capture'); coll.sources[d.id] = d; items.push(makeItem(d.id, { fit: 'fit' }));
  } else {
    const w = makeSource('webcam', 'Camera'); coll.sources[w.id] = w; items.push(makeItem(w.id, { fit: 'fit' }));
  }
  const m = makeSource('mic', 'Mic/Aux'); coll.sources[m.id] = m; items.unshift(makeItem(m.id));
  const sc = { id: uid(), name: CAN.display ? 'Screen Recording' : 'Camera Recording', items };
  coll.scenes.push(sc); coll.program = coll.preview = sc.id;
  return coll;
}
function normalizeCollection(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.scenes) || !c.scenes.length || typeof c.sources !== 'object') return null;
  const out = { v: 1, canvas: { w: clamp(+((c.canvas || {}).w) || 1920, 160, 7680), h: clamp(+((c.canvas || {}).h) || 1080, 160, 7680) }, fps: [24, 25, 30, 48, 50, 60].includes(+c.fps) ? +c.fps : 30, scenes: [], sources: {}, program: '', preview: '', transition: { type: 'fade', ms: 300 }, studio: !!c.studio };
  out.canvas.w -= out.canvas.w % 2; out.canvas.h -= out.canvas.h % 2;
  for (const id in c.sources) {
    const s = c.sources[id]; if (!s || !SOURCE_TYPES[s.type]) continue;
    out.sources[id] = { id, type: s.type, name: String(s.name || SOURCE_TYPES[s.type].label).slice(0, 80), settings: Object.assign(defSettingsFor(s.type), s.settings || {}), filters: Object.assign(defFilters(), s.filters || {}), audio: Object.assign(defAudio(), s.audio || {}), nat: s.nat && s.nat.w > 0 ? { w: +s.nat.w, h: +s.nat.h } : null };
    out.sources[id].filters.chroma = Object.assign(defFilters().chroma, (s.filters || {}).chroma || {});
  }
  c.scenes.forEach(sc => {
    if (!sc || !Array.isArray(sc.items)) return;
    out.scenes.push({ id: String(sc.id || uid()), name: String(sc.name || 'Scene').slice(0, 80), items: sc.items.filter(it => it && out.sources[it.sourceId]).map(it => Object.assign(makeItem(it.sourceId), it, { crop: Object.assign({ l: 0, t: 0, r: 0, b: 0 }, it.crop || {}) })) });
  });
  if (!out.scenes.length) return null;
  const ids = out.scenes.map(s => s.id);
  out.program = ids.includes(c.program) ? c.program : ids[0];
  out.preview = ids.includes(c.preview) ? c.preview : out.program;
  if (c.transition && TRANSITIONS[c.transition.type]) out.transition = { type: c.transition.type, ms: clamp(+c.transition.ms || 300, 50, 20000) };
  return out;
}
let saveT = 0;
function saveColl() { clearTimeout(saveT); saveT = setTimeout(() => { if (!LS.set('collection', coll)) toast('Could not save the scene collection in this browser (storage full or blocked).', 'err'); }, 250); }
const sceneById = id => coll.scenes.find(s => s.id === id);
const editSceneId = () => coll.studio ? coll.preview : coll.program;
const editScene = () => sceneById(editSceneId());
function uniqueSourceName(base) {
  const names = new Set(Object.values(coll.sources).map(s => s.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!names.has((base + ' ' + i).toLowerCase())) return base + ' ' + i;
}
function uniqueSceneName(base) {
  const names = new Set(coll.scenes.map(s => s.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!names.has((base + ' ' + i).toLowerCase())) return base + ' ' + i;
}

/* ───────────── source runtime ───────────── */
const RT = new Map();   // sourceId → { status, err, stream, frame, video, img, w, h, au, ... }  (never saved)
function rtOf(id) { let r = RT.get(id); if (!r) { r = { status: 'idle', err: '', w: 0, h: 0 }; RT.set(id, r); } return r; }
let onSourcesChanged = () => {};   // ui.js replaces this
function setSourcesChangedHook(fn) { onSourcesChanged = fn; }

function friendlyErr(e, s) {
  const n = e && e.name, t = SOURCE_TYPES[s.type].label;
  if (n === 'NotAllowedError') return s.type === 'display' ? 'Screen sharing was cancelled or blocked.' : 'Permission was refused. Allow the ' + (s.type === 'mic' ? 'microphone' : 'camera') + ' in the address-bar padlock → Site settings.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No ' + (s.type === 'mic' ? 'microphone' : 'camera') + ' was found. Plug one in, or pick another device in Properties.';
  if (n === 'NotReadableError') return 'The device is busy — another app (Zoom, Teams, OBS…) may be using it.';
  if (e && e.message === 'nofile') return 'Choose a file in Properties.';
  return t + ': ' + ((e && e.message) || 'could not start.');
}

async function startSource(id, opts) {
  opts = opts || {};
  const s = coll.sources[id]; if (!s) return false;
  const rt = rtOf(id);
  if (rt.status === 'live' || rt.status === 'starting') return rt.status === 'live';
  rt.status = 'starting'; rt.err = ''; onSourcesChanged();
  try {
    if (s.type === 'display') await startDisplay(s, rt);
    else if (s.type === 'webcam') await startWebcam(s, rt);
    else if (s.type === 'mic') await startMic(s, rt);
    else if (s.type === 'image') await startImage(s, rt);
    else if (s.type === 'media') await startMedia(s, rt);
    rt.status = 'live';
  } catch (e) {
    teardown(rt);
    rt.status = (e && e.name === 'NotAllowedError' && s.type === 'display') || (e && e.message === 'nofile') ? 'idle' : 'error';
    rt.err = friendlyErr(e, s);
    if (!opts.quiet) toast(s.name + ' — ' + rt.err, 'err');
  }
  onSourcesChanged();
  return rt.status === 'live';
}
function stopSource(id) {
  const rt = RT.get(id); if (!rt) return;
  teardown(rt);
  const s = coll.sources[id];
  rt.status = s && (s.type === 'text' || s.type === 'color') ? 'live' : 'idle';
  onSourcesChanged();
}
async function restartSource(id) { stopSource(id); return startSource(id); }
function teardown(rt) {
  rt.ending = true;
  if (rt.stream) rt.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
  if (rt.reader) { try { rt.reader.cancel(); } catch (e) {} }
  if (rt.frame) { try { rt.frame.close(); } catch (e) {} }
  if (rt.video) { try { rt.video.pause(); rt.video.srcObject = null; rt.video.removeAttribute('src'); rt.video.load(); } catch (e) {} rt.video.remove(); }
  if (rt.img && rt.img.remove) rt.img.remove();
  if (rt.url) URL.revokeObjectURL(rt.url);
  detachAudio(rt);
  rt.stream = rt.reader = rt.frame = rt.video = rt.img = rt.url = rt.track = null; rt.w = rt.h = 0; rt.needsPlay = false; rt.warn = ''; rt.blackSec = 0; rt.triedVideo = false; rt.path = '';
  rt.ending = false;
}
function noteNat(s, w, h) {
  if (!w || !h) return;
  if (!s.nat || s.nat.w !== w || s.nat.h !== h) { s.nat = { w, h }; saveColl(); }
  coll.scenes.forEach(sc => sc.items.forEach(it => { if (it.sourceId === s.id && it.fit) applyPendingFit(sc, it); }));
}
// Two independent ways to read a live video track. VideoFrames (MediaStreamTrackProcessor) are the fast path;
// a <video> element is the classic path. The health check below switches a source to the <video> path by itself
// if the fast path gives a black picture, and remembers that choice for this browser (v1.1).
let PREFER_VIDEO = LS.get('drawPath', '') === 'video';
function attachVideo(s, rt, track) {
  rt.track = track; rt.path = '';
  if (CAN.mstp && !PREFER_VIDEO) {
    try {
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      rt.reader = reader; rt.path = 'frames';
      (async () => {
        try {
          for (;;) {
            const r = await reader.read(); if (r.done) break;
            if (rt.reader !== reader) { r.value.close(); break; }
            if (rt.frame) rt.frame.close();
            rt.frame = r.value;
            if (r.value.displayWidth !== rt.w || r.value.displayHeight !== rt.h) { rt.w = r.value.displayWidth; rt.h = r.value.displayHeight; noteNat(s, rt.w, rt.h); }
          }
        } catch (e) {}
      })();
      return;
    } catch (e) { rt.reader = null; }
  }
  attachVideoElement(s, rt, track);
}
function attachVideoElement(s, rt, track) {
  // A <video> kept inside the viewport (2 px, see .hidden-media) so the browser never pauses it. No autoplay
  // attribute: Chrome pauses muted *autoplay* videos that it thinks are off screen.
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([track]);
  v.addEventListener('resize', () => { if (v.videoWidth) { rt.w = v.videoWidth; rt.h = v.videoHeight; noteNat(s, rt.w, rt.h); } });
  v.addEventListener('pause', () => { if (rt.video === v && !rt.ending) v.play().catch(() => {}); });
  document.getElementById('hiddenMedia').appendChild(v); v.play().catch(() => { rt.needsPlay = true; });
  rt.video = v; rt.path = 'video';
}
function switchToVideoPath(s, rt) {
  if (!rt.track || rt.path === 'video' || rt.track.readyState !== 'live') return false;
  rt.reader = null;                                   // the frame loop sees this and stops (the track itself keeps running)
  if (rt.frame) { try { rt.frame.close(); } catch (e) {} rt.frame = null; }
  attachVideoElement(s, rt, rt.track);
  return true;
}

/* source health (v1.1): a screen or camera that sends a black picture is the classic Windows "black screen
   capture" (laptops with two graphics chips, protected video, a minimised window). Check every second:
   1) black on the fast path → switch to the <video> path once; 2) still black → warn the user with the fix. */
const HC = document.createElement('canvas'); HC.width = 32; HC.height = 18;
const hctx = HC.getContext('2d', { willReadFrequently: true });
function lumaStats(src, sx, sy, sw, sh) {
  try { hctx.clearRect(0, 0, 32, 18); hctx.drawImage(src, sx, sy, sw, sh, 0, 0, 32, 18); } catch (e) { return null; }
  const d = hctx.getImageData(0, 0, 32, 18).data; let sum = 0, mx = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 2 + d[i + 1] * 5 + d[i + 2]) / 8; sum += l; if (l > mx) mx = l; }
  return { mean: sum / (d.length / 4), max: mx };
}
let onHealth = () => {};
function setHealthHook(fn) { onHealth = fn; }
function checkSourceHealth() {
  RT.forEach((rt, id) => {
    const s = coll.sources[id];
    if (!s || (s.type !== 'display' && s.type !== 'webcam') || rt.status !== 'live') return;
    const d = drawableOf(s, rt);
    if (!d) { rt.noFrame = (rt.noFrame || 0) + 1; return; }
    rt.noFrame = 0;
    const st = lumaStats(d.src, 0, 0, d.w, d.h);
    const black = !st || st.max < 20;
    rt.blackSec = black ? (rt.blackSec || 0) + 1 : 0;
    if (rt.blackSec >= 3 && rt.path === 'frames') {
      if (switchToVideoPath(s, rt)) { rt.blackSec = 0; rt.triedVideo = true; console.warn(s.name + ': black picture on the VideoFrame path — switched to the <video> path'); }
      return;
    }
    if (!black && rt.path === 'video' && rt.triedVideo && !PREFER_VIDEO) { PREFER_VIDEO = true; LS.set('drawPath', 'video'); }
    const warn = rt.blackSec >= 3 ? 'black' : '';
    if (warn !== (rt.warn || '')) { rt.warn = warn; onSourcesChanged(); if (warn) onHealth(s, 'black'); }
  });
}
setInterval(checkSourceHealth, 1000);

async function startDisplay(s, rt) {
  if (!CAN.display) throw new Error('This browser cannot share the screen. Use Chrome or Edge on a computer.');
  const st = s.settings;
  const video = { frameRate: { ideal: Math.max(coll.fps, 30), max: 60 }, width: { ideal: 3840 }, height: { ideal: 2160 } };
  if (st.cursor) video.cursor = st.cursor;
  const opts = { video, audio: st.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false } : false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include' };
  if (st.audio) opts.systemAudio = 'include';
  const stream = await navigator.mediaDevices.getDisplayMedia(opts);
  rt.stream = stream;
  const vt = stream.getVideoTracks()[0];
  try { vt.contentHint = 'detail'; } catch (e) {}
  const cfg = vt.getSettings ? vt.getSettings() : {};
  rt.surface = cfg.displaySurface || ''; rt.label = vt.label || '';
  vt.addEventListener('ended', () => { if (rt.stream === stream && !rt.ending) { stopSource(s.id); if (REC.state === 'recording' || REC.state === 'paused') onHealth(s, 'stopped'); else toast(s.name + ': screen sharing stopped.'); } });
  attachVideo(s, rt, vt);
  const at = stream.getAudioTracks()[0];
  if (at) attachAudio(s, rt, ac().createMediaStreamSource(new MediaStream([at])));
  rt.hasAudio = !!at;
}
async function startWebcam(s, rt) {
  if (!CAN.media) throw new Error('This browser has no camera access.');
  const st = s.settings;
  const res = { '480': [640, 480], '720': [1280, 720], '1080': [1920, 1080], '1440': [2560, 1440], '2160': [3840, 2160] }[st.res];
  const v = { frameRate: { ideal: +st.fps || 30 } };
  if (res) { v.width = { ideal: res[0] }; v.height = { ideal: res[1] }; }
  if (st.deviceId) v.deviceId = { exact: st.deviceId }; else v.facingMode = st.facing || 'user';
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
  catch (e) {
    if ((e.name === 'OverconstrainedError' || e.name === 'NotFoundError') && v.deviceId) { delete v.deviceId; stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); toast(s.name + ': the saved camera was not found — using the default camera.'); }
    else throw e;
  }
  rt.stream = stream;
  const vt = stream.getVideoTracks()[0];
  rt.label = vt.label || '';
  vt.addEventListener('ended', () => { if (rt.stream === stream && !rt.ending) { stopSource(s.id); rt.status = 'error'; rt.err = 'The camera was disconnected.'; onSourcesChanged(); } });
  attachVideo(s, rt, vt);
}
async function startMic(s, rt) {
  if (!CAN.media) throw new Error('This browser has no microphone access.');
  const st = s.settings;
  const a = { echoCancellation: !!st.ec, noiseSuppression: !!st.ns, autoGainControl: !!st.agc };
  if (st.deviceId) a.deviceId = { exact: st.deviceId };
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: a, video: false }); }
  catch (e) {
    if ((e.name === 'OverconstrainedError' || e.name === 'NotFoundError') && a.deviceId) { delete a.deviceId; stream = await navigator.mediaDevices.getUserMedia({ audio: a, video: false }); toast(s.name + ': the saved microphone was not found — using the default one.'); }
    else throw e;
  }
  rt.stream = stream;
  const at = stream.getAudioTracks()[0];
  rt.label = at.label || '';
  at.addEventListener('ended', () => { if (rt.stream === stream && !rt.ending) { stopSource(s.id); rt.status = 'error'; rt.err = 'The microphone was disconnected.'; onSourcesChanged(); } });
  attachAudio(s, rt, ac().createMediaStreamSource(stream));
  rt.hasAudio = true;
}
async function startImage(s, rt) {
  const blob = await idb.get('blobs', s.id);
  if (!blob) throw new Error('nofile');
  const img = new Image();
  rt.url = URL.createObjectURL(blob); img.src = rt.url;
  await img.decode();
  document.getElementById('hiddenMedia').appendChild(img);   // in the document so animated GIFs keep moving
  rt.img = img; rt.w = img.naturalWidth || 1; rt.h = img.naturalHeight || 1; noteNat(s, rt.w, rt.h);
}
async function startMedia(s, rt) {
  const blob = await idb.get('blobs', s.id);
  if (!blob) throw new Error('nofile');
  const v = document.createElement('video');
  v.playsInline = true; v.loop = !!s.settings.loop; v.preload = 'auto';
  rt.url = URL.createObjectURL(blob); v.src = rt.url;
  document.getElementById('hiddenMedia').appendChild(v);
  rt.video = v;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('This file cannot be played here (unsupported format).')); });
  rt.w = v.videoWidth; rt.h = v.videoHeight; if (rt.w) noteNat(s, rt.w, rt.h);
  v.addEventListener('resize', () => { if (v.videoWidth) { rt.w = v.videoWidth; rt.h = v.videoHeight; noteNat(s, rt.w, rt.h); } });
  attachAudio(s, rt, ac().createMediaElementSource(v));
  rt.hasAudio = true;
  v.play().catch(() => { rt.needsPlay = true; });
}
function mediaControl(id, what) {
  const rt = RT.get(id); if (!rt || !rt.video || coll.sources[id].type !== 'media') return;
  const v = rt.video;
  if (what === 'restart') { v.currentTime = 0; v.play().catch(() => {}); }
  else if (what === 'play') v.play().catch(() => {});
  else if (what === 'pause') v.pause();
  else if (what === 'toggle') { if (v.paused) v.play().catch(() => {}); else v.pause(); }
}
// Retry blocked plays on the first tap/click anywhere (browsers allow sound only after a gesture).
document.addEventListener('pointerdown', () => {
  resumeAudio();
  RT.forEach(rt => { if (rt.needsPlay && rt.video) { rt.needsPlay = false; rt.video.play().catch(() => {}); } });
}, true);
document.addEventListener('keydown', resumeAudio, true);

/* text source: rendered into its own canvas, redrawn only when the text (or the clock in it) changes */
function textString(s) {
  const now = new Date();
  return String(s.settings.text || '').replace(/\{(time|date|datetime)\}/gi, (m, k) => {
    k = k.toLowerCase();
    if (k === 'time') return fmtClock(now);
    if (k === 'date') return DF.format(now);
    return fmtDate(now);
  });
}
function textCanvas(s, rt) {
  rt = rt || rtOf(s.id);
  const st = s.settings, str = textString(s);
  const key = str + '|' + st.font + st.size + st.bold + st.italic + st.color + st.bg + st.bgOpacity + st.outlineW + st.outlineColor + st.align;
  if (rt.tc && rt.tKey === key) return rt.tc;
  const c = rt.tc || (rt.tc = document.createElement('canvas'));
  const x = c.getContext('2d');
  const size = clamp(+st.size || 72, 6, 600), ow = clamp(+st.outlineW || 0, 0, 40);
  const font = (st.italic ? 'italic ' : '') + (st.bold ? '700 ' : '400 ') + size + 'px "' + String(st.font || 'Segoe UI').replace(/"/g, '') + '", "Segoe UI", system-ui, sans-serif';
  x.font = font;
  const lines = str.split('\n'), lh = Math.round(size * 1.25), pad = Math.round(size * 0.22) + ow;
  let mw = 1; lines.forEach(l => { mw = Math.max(mw, Math.ceil(x.measureText(l).width)); });
  c.width = Math.min(8192, mw + pad * 2); c.height = Math.min(8192, lines.length * lh + pad * 2);
  x.font = font; x.textBaseline = 'middle';
  if (+st.bgOpacity > 0) { x.globalAlpha = clamp(st.bgOpacity / 100, 0, 1); x.fillStyle = st.bg; x.fillRect(0, 0, c.width, c.height); x.globalAlpha = 1; }
  lines.forEach((l, i) => {
    const tw = x.measureText(l).width;
    const tx = st.align === 'center' ? (c.width - tw) / 2 : st.align === 'right' ? c.width - pad - tw : pad;
    const ty = pad + i * lh + lh / 2;
    if (ow > 0) { x.lineJoin = 'round'; x.lineWidth = ow * 2; x.strokeStyle = st.outlineColor; x.strokeText(l, tx, ty); }
    x.fillStyle = st.color; x.fillText(l, tx, ty);
  });
  rt.tKey = key;
  return c;
}

/* ───────────── geometry ───────────── */
function natSize(s) {
  if (s.type === 'color') return { w: +s.settings.w || 1, h: +s.settings.h || 1 };
  if (s.type === 'text') { const c = textCanvas(s); return { w: c.width, h: c.height }; }
  const rt = RT.get(s.id);
  if (rt && rt.w) return { w: rt.w, h: rt.h };
  if (s.nat) return s.nat;
  return { w: coll.canvas.w, h: coll.canvas.h };
}
function itemBox(it) {
  const s = coll.sources[it.sourceId], n = natSize(s), c = it.crop;
  let w = Math.max(1, n.w - c.l - c.r), h = Math.max(1, n.h - c.t - c.b);
  if (it.rot % 180) { const t = w; w = h; h = t; }
  return { x: it.x, y: it.y, w: w * it.sx, h: h * it.sy, nw: w, nh: h };
}
function isVisual(it) { const s = coll.sources[it.sourceId]; return !!(s && SOURCE_TYPES[s.type].video && !(s.type === 'media' && RT.get(s.id) && RT.get(s.id).status === 'live' && !RT.get(s.id).w)); }
function transformItem(it, mode) {
  const W = coll.canvas.w, H = coll.canvas.h, b = itemBox(it);
  if (mode === 'fit') { const k = Math.min(W / b.nw, H / b.nh); it.sx = it.sy = k; it.x = (W - b.nw * k) / 2; it.y = (H - b.nh * k) / 2; }
  else if (mode === 'stretch') { it.sx = W / b.nw; it.sy = H / b.nh; it.x = 0; it.y = 0; }
  else if (mode === 'center') { it.x = (W - b.w) / 2; it.y = (H - b.h) / 2; }
  else if (mode === 'centerH') { it.x = (W - b.w) / 2; }
  else if (mode === 'centerV') { it.y = (H - b.h) / 2; }
  else if (mode === 'corner') { const k = (W * 0.24) / b.nw, m = Math.round(W * 0.02); it.sx = it.sy = k; it.x = W - b.nw * k - m; it.y = H - b.nh * k - m; }
  else if (mode === 'reset') { it.sx = it.sy = 1; it.rot = 0; it.flipH = it.flipV = false; it.crop = { l: 0, t: 0, r: 0, b: 0 }; it.x = 0; it.y = 0; }
  else if (mode === 'flipH') it.flipH = !it.flipH;
  else if (mode === 'flipV') it.flipV = !it.flipV;
  else if (mode === 'rotR' || mode === 'rotL' || mode === 'rot180') {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const add = mode === 'rotR' ? 90 : mode === 'rotL' ? 270 : 180;
    if (add !== 180) { const t = it.sx; it.sx = it.sy; it.sy = t; }
    it.rot = (it.rot + add) % 360;
    const nb = itemBox(it); it.x = cx - nb.w / 2; it.y = cy - nb.h / 2;
  }
  it.fit = false;
}
function applyPendingFit(sc, it) {
  const mode = it.fit; if (!mode) return;
  if (mode === 'fitIfLarge') { const b = itemBox(it); transformItem(it, (b.nw > coll.canvas.w || b.nh > coll.canvas.h) ? 'fit' : 'center'); }
  else transformItem(it, mode === 'corner' ? 'corner' : 'fit');
  it.fit = false; saveColl();
}

/* ───────────── audio engine ───────────── */
const AU = { ctx: null, mix: null, dest: null };
function ac() {
  if (AU.ctx) return AU.ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  AU.ctx = new C({ latencyHint: 'interactive' });
  AU.mix = AU.ctx.createGain();
  AU.dest = AU.ctx.createMediaStreamDestination();
  AU.dest.channelCount = 2;
  AU.mix.connect(AU.dest);
  return AU.ctx;
}
function resumeAudio() { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); }
function attachAudio(s, rt, node) {
  const c = ac();
  const a = { node, fader: c.createGain(), up: c.createGain(), gate: c.createGain(), mon: c.createGain(), split: c.createChannelSplitter(2), aL: c.createAnalyser(), aR: c.createAnalyser() };
  a.up.channelCount = 2; a.up.channelCountMode = 'explicit'; a.up.channelInterpretation = 'speakers';   // mono mics show on both meters
  a.aL.fftSize = a.aR.fftSize = 1024; a.buf = new Float32Array(1024);
  node.connect(a.fader);
  a.fader.connect(a.gate); a.gate.connect(AU.mix);
  a.fader.connect(a.up); a.up.connect(a.split); a.split.connect(a.aL, 0); a.split.connect(a.aR, 1);
  a.fader.connect(a.mon); a.mon.connect(c.destination);
  a.gate.gain.value = gateTarget(s.id);
  rt.au = a; rt.lvl = [-100, -100]; rt.hold = [-100, -100]; rt.holdT = [0, 0];
  applyAudio(s.id);
}
function detachAudio(rt) {
  const a = rt.au; if (!a) return;
  ['node', 'fader', 'up', 'gate', 'mon', 'split'].forEach(k => { try { a[k].disconnect(); } catch (e) {} });
  rt.au = null; rt.hasAudio = false;
}
function applyAudio(id) {
  const s = coll.sources[id], rt = RT.get(id); if (!s || !rt || !rt.au) return;
  const a = rt.au, au = s.audio, t = AU.ctx.currentTime;
  a.fader.gain.setTargetAtTime(au.muted ? 0 : dbToLin(au.volDb) * dbToLin(au.gainDb || 0), t, 0.012);
  a.mon.gain.setTargetAtTime(au.monitor ? 1 : 0, t, 0.012);
  a.fader.channelCountMode = au.mono ? 'explicit' : 'max';
  a.fader.channelCount = au.mono ? 1 : 2;
  a.fader.channelInterpretation = 'speakers';
}
function inScene(sceneId, sourceId) { const sc = sceneById(sceneId); return !!(sc && sc.items.some(it => it.sourceId === sourceId && it.visible)); }
function gateTarget(sourceId) { return inScene(coll.program, sourceId) ? 1 : 0; }
function updateGates(ms) {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime, d = Math.max(0.01, (ms || 0) / 1000);
  RT.forEach((rt, id) => {
    if (!rt.au || !coll.sources[id]) return;
    const g = rt.au.gate.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(gateTarget(id), t + d);
  });
}
function meterRead(rt) {
  // Peak level per channel in dBFS, with a 20 dB/s fall-off and a 1.5 s peak hold (the OBS "fast" meter).
  const a = rt.au; if (!a) return null;
  const now = performance.now(), dt = Math.min(0.25, (now - (rt.mT || now)) / 1000); rt.mT = now;
  [a.aL, a.aR].forEach((an, i) => {
    an.getFloatTimeDomainData(a.buf);
    let pk = 0; for (let j = 0; j < a.buf.length; j++) { const v = Math.abs(a.buf[j]); if (v > pk) pk = v; }
    const db = Math.max(-100, linToDb(pk));
    rt.lvl[i] = db >= rt.lvl[i] ? db : Math.max(db, rt.lvl[i] - 20 * dt);
    if (db >= rt.hold[i] || now - rt.holdT[i] > 1500) { rt.hold[i] = db; rt.holdT[i] = now; }
  });
  return rt.lvl;
}

/* ───────────── compositor ───────────── */
const TRANSITIONS = { cut: 'Cut', fade: 'Fade', fadeblack: 'Fade to Black', slide: 'Slide', swipe: 'Swipe' };
const progCanvas = document.getElementById('progCanvas');
const pctx = progCanvas.getContext('2d', { alpha: false });
const prevCanvas = document.getElementById('prevCanvas');
const vctx = prevCanvas.getContext('2d', { alpha: false });
const tmpCanvas = document.createElement('canvas');
const tctx = tmpCanvas.getContext('2d', { alpha: false });
const TR = { active: false, from: '', to: '', t0: 0, ms: 300, type: 'fade' };
const STATS = { frames: 0, fps: 0, lastT: 0, secT: 0, dropped: 0, total: 0, renderMs: 0 };
let PREV_SCALE = 0.5;

function sizeCanvases() {
  const W = coll.canvas.w, H = coll.canvas.h;
  if (progCanvas.width !== W || progCanvas.height !== H) { progCanvas.width = W; progCanvas.height = H; }
  if (tmpCanvas.width !== W || tmpCanvas.height !== H) { tmpCanvas.width = W; tmpCanvas.height = H; }
  PREV_SCALE = Math.min(1, 960 / W);
  const pw = Math.round(W * PREV_SCALE), ph = Math.round(H * PREV_SCALE);
  if (prevCanvas.width !== pw || prevCanvas.height !== ph) { prevCanvas.width = pw; prevCanvas.height = ph; }
}
function filterString(f) {
  const p = [];
  if (+f.brightness !== 100) p.push('brightness(' + f.brightness + '%)');
  if (+f.contrast !== 100) p.push('contrast(' + f.contrast + '%)');
  if (+f.saturate !== 100) p.push('saturate(' + f.saturate + '%)');
  if (+f.hue) p.push('hue-rotate(' + f.hue + 'deg)');
  if (+f.blur > 0) p.push('blur(' + f.blur + 'px)');
  return p.join(' ');
}
function shapePath(ctx, f, w, h) {
  if (f.shape === 'circle') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (f.shape === 'rounded') { const r = Math.min(+f.radius || 0, w / 2, h / 2); if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r); else ctx.rect(-w / 2, -h / 2, w, h); }
  else ctx.rect(-w / 2, -h / 2, w, h);
}
function drawableOf(s, rt) {
  switch (s.type) {
    case 'display': case 'webcam':
      if (rt.frame) return { src: rt.frame, w: rt.frame.displayWidth, h: rt.frame.displayHeight };
      if (rt.video && rt.video.videoWidth) return { src: rt.video, w: rt.video.videoWidth, h: rt.video.videoHeight };
      return null;
    case 'media': return rt.video && rt.video.videoWidth && rt.video.readyState >= 2 ? { src: rt.video, w: rt.video.videoWidth, h: rt.video.videoHeight } : null;
    case 'image': return rt.img ? { src: rt.img, w: rt.w, h: rt.h } : null;
    case 'text': { const c = textCanvas(s, rt); return { src: c, w: c.width, h: c.height }; }
    case 'color': return { color: s.settings.color, w: +s.settings.w || 1, h: +s.settings.h || 1 };
  }
  return null;
}
// Chroma key (green screen) — the OBS formula: distance in CbCr from the key colour, minus similarity, over smoothness, plus spill reduction.
function chromaKey(rt, src, sx, sy, sw, sh, dw, dh, ck) {
  const W = Math.max(1, Math.min(1280, Math.round(Math.abs(dw)))), H = Math.max(1, Math.round(Math.abs(dh) * W / Math.abs(dw)));
  const c = rt.ck || (rt.ck = document.createElement('canvas'));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = rt.ckx || (rt.ckx = c.getContext('2d', { willReadFrequently: true }));
  x.clearRect(0, 0, W, H); x.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const hex = String(ck.color || '#00ff00').replace('#', ''), kr = parseInt(hex.slice(0, 2), 16) / 255, kg = parseInt(hex.slice(2, 4), 16) / 255, kb = parseInt(hex.slice(4, 6), 16) / 255;
  const kcb = -0.1146 * kr - 0.3854 * kg + 0.5 * kb, kcr = 0.5 * kr - 0.4542 * kg - 0.0458 * kb;
  const sim = (+ck.similarity || 400) / 1000, smooth = Math.max(0.001, (+ck.smoothness || 80) / 1000), spill = Math.max(0.001, (+ck.spill || 100) / 1000);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const cb = -0.1146 * r - 0.3854 * g + 0.5 * b, cr = 0.5 * r - 0.4542 * g - 0.0458 * b;
    const dist = Math.sqrt((cb - kcb) * (cb - kcb) + (cr - kcr) * (cr - kcr));
    const base = dist - sim;
    const a = Math.pow(clamp(base / smooth, 0, 1), 1.5);
    const sp = Math.pow(clamp(base / spill, 0, 1), 1.5);
    if (sp < 1) { const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; d[i] = (lum + (r - lum) * sp) * 255; d[i + 1] = (lum + (g - lum) * sp) * 255; d[i + 2] = (lum + (b - lum) * sp) * 255; }
    d[i + 3] = d[i + 3] * a;
  }
  x.putImageData(img, 0, 0);
  return c;
}
function drawItem(ctx, it, s) {
  const rt = rtOf(s.id), d = drawableOf(s, rt);
  if (!d) return;
  const b = itemBox(it); if (b.w < 0.5 || b.h < 0.5) return;
  const f = s.filters, cr = it.crop;
  ctx.save();
  ctx.globalAlpha = clamp((+f.opacity) / 100, 0, 1);
  const fs = filterString(f); if (fs) ctx.filter = fs;
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  if (it.rot) ctx.rotate(it.rot * Math.PI / 180);
  ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
  const dw = it.rot % 180 ? b.h : b.w, dh = it.rot % 180 ? b.w : b.h;
  if (f.shape && f.shape !== 'rect') { ctx.beginPath(); shapePath(ctx, f, dw, dh); ctx.clip(); }
  if (d.color) { ctx.fillStyle = d.color; ctx.fillRect(-dw / 2, -dh / 2, dw, dh); }
  else {
    const sw = d.w - cr.l - cr.r, sh = d.h - cr.t - cr.b;
    if (sw > 0 && sh > 0) {
      try {
        if (f.chroma && f.chroma.on) ctx.drawImage(chromaKey(rt, d.src, cr.l, cr.t, sw, sh, dw, dh, f.chroma), -dw / 2, -dh / 2, dw, dh);
        else ctx.drawImage(d.src, cr.l, cr.t, sw, sh, -dw / 2, -dh / 2, dw, dh);
      } catch (e) {}
    }
  }
  if (+f.borderW > 0) {
    ctx.filter = 'none'; ctx.lineWidth = +f.borderW * 2; ctx.strokeStyle = f.borderColor;
    ctx.beginPath(); shapePath(ctx, f, dw, dh); ctx.stroke();   // clipped, so the inner half shows as a crisp border
  }
  ctx.restore();
}
function renderScene(ctx, sc, scale, ox) {
  if (!sc) return;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, (ox || 0) * scale, 0);
  for (let i = sc.items.length - 1; i >= 0; i--) {
    const it = sc.items[i]; if (!it.visible) continue;
    const s = coll.sources[it.sourceId]; if (!s || !SOURCE_TYPES[s.type].video) continue;
    drawItem(ctx, it, s);
  }
  ctx.restore();
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function renderProgram(now) {
  const W = coll.canvas.w, H = coll.canvas.h;
  pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.globalAlpha = 1; pctx.filter = 'none';
  pctx.fillStyle = '#000'; pctx.fillRect(0, 0, W, H);
  if (TR.active) {
    const t = (now - TR.t0) / TR.ms;
    if (t >= 1) { TR.active = false; onTransitionEnd(); }
    else {
      const e = ease(clamp(t, 0, 1)), from = sceneById(TR.from), to = sceneById(TR.to);
      if (TR.type === 'fade') {
        renderScene(pctx, from, 1, 0);
        tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.fillStyle = '#000'; tctx.fillRect(0, 0, W, H); renderScene(tctx, to, 1, 0);
        pctx.globalAlpha = e; pctx.drawImage(tmpCanvas, 0, 0); pctx.globalAlpha = 1;
      } else if (TR.type === 'fadeblack') {
        if (e < 0.5) { renderScene(pctx, from, 1, 0); pctx.fillStyle = 'rgba(0,0,0,' + (e * 2) + ')'; }
        else { renderScene(pctx, to, 1, 0); pctx.fillStyle = 'rgba(0,0,0,' + ((1 - e) * 2) + ')'; }
        pctx.fillRect(0, 0, W, H);
      } else if (TR.type === 'slide') {
        renderScene(pctx, from, 1, -e * W); renderScene(pctx, to, 1, (1 - e) * W);
      } else {   // swipe: the new scene slides in over the old one
        renderScene(pctx, from, 1, 0);
        pctx.fillStyle = '#000'; pctx.fillRect((1 - e) * W, 0, W, H);
        renderScene(pctx, to, 1, (1 - e) * W);
      }
      return;
    }
  }
  renderScene(pctx, sceneById(coll.program), 1, 0);
}
function renderPreview() {
  vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.globalAlpha = 1; vctx.filter = 'none';
  vctx.fillStyle = '#000'; vctx.fillRect(0, 0, prevCanvas.width, prevCanvas.height);
  renderScene(vctx, sceneById(coll.preview), PREV_SCALE, 0);
}
let onTransitionEnd = () => {};
function setTransitionEndHook(fn) { onTransitionEnd = fn; }
function goProgram(toId, opts) {
  opts = opts || {};
  if (!sceneById(toId) || (toId === coll.program && !TR.active)) return;
  const type = opts.cut ? 'cut' : coll.transition.type, ms = coll.transition.ms;
  const from = coll.program;
  coll.program = toId;
  if (type !== 'cut' && from !== toId) { TR.active = true; TR.from = from; TR.to = toId; TR.t0 = performance.now(); TR.ms = ms; TR.type = type; }
  else TR.active = false;
  updateGates(type === 'cut' ? 0 : ms);
  // Media sources set to "restart when the scene becomes active"
  const sc = sceneById(toId);
  sc.items.forEach(it => { const s = coll.sources[it.sourceId]; if (s && s.type === 'media' && s.settings.restart && it.visible) mediaControl(s.id, 'restart'); });
  saveColl();
}

/* frame clock: a Worker timer, because a hidden or covered window stops requestAnimationFrame
   (and slows page timers to once a second) — the recording would freeze while you work in other apps. */
const ticker = new Worker(URL.createObjectURL(new Blob(['let t=0;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data);}'], { type: 'text/javascript' })));
let lastTick = 0;
ticker.onmessage = () => {
  const now = performance.now(), target = 1000 / coll.fps;
  if (lastTick) {
    const gap = now - lastTick;
    STATS.total++;
    if (gap > target * 1.9) { const miss = Math.round(gap / target) - 1; STATS.dropped += miss; STATS.total += miss; }
  }
  lastTick = now;
  const t0 = performance.now();
  try { renderProgram(now); if (coll.studio) renderPreview(); } catch (e) { console.error(e); }
  const took = performance.now() - t0;
  STATS.renderMs = STATS.renderMs ? STATS.renderMs * 0.95 + took * 0.05 : took;
  STATS.frames++;
  if (now - STATS.secT >= 1000) { STATS.fps = STATS.frames * 1000 / (now - STATS.secT || 1000); STATS.frames = 0; STATS.secT = now; }
  if (REC.state === 'recording' && REC.vtrack && REC.vtrack.requestFrame) REC.vtrack.requestFrame();
};
function setFps(fps) { coll.fps = fps; lastTick = 0; ticker.postMessage(1000 / fps); }

/* ───────────── recorder ───────────── */
const FORMATS = [
  { id: 'mp4', label: 'MP4 (H.264 + AAC) — plays everywhere', ext: 'mp4', types: ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1.4d0033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4'] },
  { id: 'webm-vp9', label: 'WebM (VP9 + Opus) — smaller files', ext: 'webm', types: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp09.00.41.08,opus'] },
  { id: 'webm-vp8', label: 'WebM (VP8 + Opus) — light on the CPU', ext: 'webm', types: ['video/webm;codecs=vp8,opus', 'video/webm'] },
  { id: 'mkv', label: 'MKV (H.264 + Opus) — crash-safe, for editors', ext: 'mkv', types: ['video/x-matroska;codecs=avc1,opus'] },
];
function supportedFormats() {
  if (!CAN.recorder) return [];
  return FORMATS.map(f => Object.assign({}, f, { mime: f.types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) })).filter(f => f.mime);
}
function pickFormat() {
  const list = supportedFormats(); if (!list.length) return null;
  if (S.format !== 'auto') { const f = list.find(x => x.id === S.format); if (f) return f; }
  return list.find(x => x.id === 'mp4') || list[0];
}
// YouTube's recommended upload bitrates (SDR) — used when Video bitrate is "Auto".
function recommendedKbps(w, h, fps) {
  const p = Math.min(w, h), hi = fps > 30;
  if (p <= 480) return hi ? 4000 : 2500;
  if (p <= 720) return hi ? 7500 : 5000;
  if (p <= 1080) return hi ? 12000 : 8000;
  if (p <= 1440) return hi ? 24000 : 16000;
  return hi ? 53000 : 35000;
}
const REC = { state: 'idle', mr: null, chunks: [], bytes: 0, t0: 0, pausedMs: 0, pauseT: 0, fmt: null, out: null, writeQ: null, rate: [], vtrack: null, err: null, wake: null, name: '' };
let onRecChanged = () => {};
function setRecHook(fn) { onRecChanged = fn; }
function recElapsed() {
  if (REC.state === 'idle' || !REC.t0) return 0;
  const now = REC.state === 'paused' ? REC.pauseT : performance.now();
  return Math.max(0, now - REC.t0 - REC.pausedMs);
}
function recBitrate() {
  const now = performance.now(); REC.rate = REC.rate.filter(r => now - r.t < 5000);
  if (REC.rate.length < 2) return 0;
  const bytes = REC.rate.slice(1).reduce((a, r) => a + r.b, 0), span = (REC.rate[REC.rate.length - 1].t - REC.rate[0].t) / 1000;
  return span > 0 ? bytes * 8 / 1000 / span : 0;
}
function buildFileName(ext, kind) {
  const st = fileStamp();
  const base = (kind === 'shot' ? 'IBI Screenshot {date} {time}' : (S.fileName || DEF_SETTINGS.fileName)).replace(/\{date\}/gi, st.date).replace(/\{time\}/gi, st.time).replace(/\{scene\}/gi, (sceneById(coll.program) || {}).name || 'Scene');
  return safeName(base) + '.' + ext;
}

/* recording folder (File System Access API): recordings stream straight to disk — no size limit, crash-safe */
const FOLDER = { handle: null, name: '' };
async function loadFolder() {
  if (!CAN.folder) return;
  const h = await idb.get('kv', 'folder');
  if (h) { FOLDER.handle = h; FOLDER.name = h.name; }
}
async function chooseFolder() {
  if (!CAN.folder) { toast('This browser saves to Downloads only. Chrome or Edge on a computer can save to a folder.'); return false; }
  try {
    const h = await window.showDirectoryPicker({ id: 'ibisr-rec', mode: 'readwrite', startIn: 'videos' });
    FOLDER.handle = h; FOLDER.name = h.name;
    await idb.set('kv', 'folder', h);
    toast('Recordings will be saved in “' + h.name + '”.', 'ok');
    return true;
  } catch (e) { if (e && e.name !== 'AbortError') toast('Could not use that folder: ' + e.message, 'err'); return false; }
}
async function forgetFolder() { FOLDER.handle = null; FOLDER.name = ''; await idb.del('kv', 'folder'); }
async function folderReady(ask) {
  const h = FOLDER.handle; if (!h) return false;
  try {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p === 'prompt' && ask) p = await h.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  } catch (e) { return false; }
}
async function uniqueFileIn(dir, name) {
  const dot = name.lastIndexOf('.'), stem = name.slice(0, dot), ext = name.slice(dot);
  for (let i = 1; i < 1000; i++) {
    const n = i === 1 ? name : stem + ' (' + i + ')' + ext;
    try { await dir.getFileHandle(n); } catch (e) { return n; }
  }
  return stem + ' ' + uid() + ext;
}

// WebM/MKV from MediaRecorder has no Duration, so players cannot seek it. Insert the Duration element into
// Segment › Info (Chrome writes no SeekHead/Cues, and the Segment has an unknown size, so nothing else moves).
async function fixMatroskaDuration(blob, ms) {
  try {
    const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1 << 16)).arrayBuffer());
    let p = 0;
    const readId = () => { const b = head[p]; const len = b & 0x80 ? 1 : b & 0x40 ? 2 : b & 0x20 ? 3 : b & 0x10 ? 4 : 0; if (!len) throw new Error('id'); let id = 0; for (let i = 0; i < len; i++) id = id * 256 + head[p + i]; p += len; return id; };
    const readSize = () => { const b = head[p]; let len = 1, mask = 0x80; while (len <= 8 && !(b & mask)) { len++; mask >>= 1; } if (len > 8) throw new Error('size'); let v = b & (mask - 1), unknown = v === mask - 1; for (let i = 1; i < len; i++) { v = v * 256 + head[p + i]; if (head[p + i] !== 0xff) unknown = false; } p += len; return { v, len, unknown }; };
    if (readId() !== 0x1A45DFA3) return blob;
    let sz = readSize(); p += sz.v;
    if (readId() !== 0x18538067) return blob;
    readSize();
    while (p < head.length - 16) {
      const idStart = p, id = readId(), s2 = readSize(), dataStart = p;
      if (id === 0x1549A966) {
        if (s2.unknown || dataStart + s2.v > head.length) return blob;
        const end = dataStart + s2.v; let scale = 1000000; p = dataStart;
        while (p < end) {
          const cid = readId(), cs = readSize();
          if (cid === 0x4489) return blob;   // already has a duration
          if (cid === 0x2AD7B1) { let v = 0; for (let i = 0; i < cs.v; i++) v = v * 256 + head[p + i]; scale = v || scale; }
          p += cs.v;
        }
        const dur = new Uint8Array(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88; new DataView(dur.buffer).setFloat64(3, ms * 1e6 / scale);
        const n = s2.v + 11, size8 = new Uint8Array(8); size8[0] = 0x01; let v = n; for (let i = 7; i >= 1; i--) { size8[i] = v % 256; v = Math.floor(v / 256); }
        return new Blob([blob.slice(0, idStart), head.slice(idStart, idStart + (dataStart - s2.len - idStart)), size8, head.slice(dataStart, end), dur, blob.slice(end)], { type: blob.type });
      }
      if (s2.unknown) return blob;
      p = dataStart + s2.v;
    }
  } catch (e) {}
  return blob;
}

async function beginRecording() {
  // Called by ui.js after sources are started and the countdown is done.
  const fmt = pickFormat();
  if (!fmt) throw new Error('This browser cannot record video (no MediaRecorder support).');
  ac(); await AU.ctx.resume().catch(() => {});
  // captureStream(0) + requestFrame() on every compositor tick: frames keep flowing even when the window is hidden.
  const cs = progCanvas.captureStream(0);
  const vtrack = cs.getVideoTracks()[0];
  const stream = new MediaStream([vtrack, AU.dest.stream.getAudioTracks()[0]]);
  const vk = +S.vkbps || recommendedKbps(coll.canvas.w, coll.canvas.h, coll.fps);
  const mr = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: vk * 1000, audioBitsPerSecond: (+S.akbps || 160) * 1000 });
  REC.name = buildFileName(fmt.ext);
  REC.out = null; REC.chunks = []; REC.bytes = 0; REC.rate = []; REC.err = null; REC.fmt = fmt; REC.vtrack = vtrack; REC.mr = mr; REC.vkbps = vk;
  if (FOLDER.handle && await folderReady(false)) {
    try {
      const dir = FOLDER.handle, finalName = await uniqueFileIn(dir, REC.name);
      const tmpName = finalName.replace(/\.(\w+)$/, ' (recording).$1');
      const fh = await dir.getFileHandle(tmpName, { create: true });
      REC.out = { dir, fh, tmpName, finalName, writable: await fh.createWritable() };
      REC.name = finalName;
    } catch (e) { REC.out = null; toast('Could not write to the folder — this recording will go to Downloads instead. (' + e.message + ')', 'err'); }
  }
  REC.writeQ = Promise.resolve();
  mr.ondataavailable = e => {
    if (!e.data || !e.data.size) return;
    REC.bytes += e.data.size; REC.rate.push({ t: performance.now(), b: e.data.size });
    if (REC.out) {
      const w = REC.out.writable, chunk = e.data;
      REC.writeQ = REC.writeQ.then(() => w.write(chunk)).catch(err => {
        if (!REC.err) { REC.err = err; toast('Writing to the folder failed (' + err.message + '). Keeping the rest in memory.', 'err'); }
        REC.chunks.push(chunk);
      });
    } else REC.chunks.push(e.data);
  };
  mr.onerror = e => { toast('Recording error: ' + ((e.error && e.error.message) || 'unknown') + '. Stopping.', 'err'); if (REC.state === 'recording' || REC.state === 'paused') stopRecording(); };
  const stopped = new Promise(res => { mr.onstop = res; });
  REC.stopped = stopped;
  mr.start(1000);
  REC.t0 = performance.now(); REC.pausedMs = 0; REC.pauseT = 0; REC.state = 'recording'; REC.startedAt = Date.now();
  if (CAN.wakeLock) navigator.wakeLock.request('screen').then(l => { REC.wake = l; }).catch(() => {});
  onRecChanged();
}
function pauseRecording() {
  if (REC.state === 'recording' && REC.mr.state === 'recording') { REC.mr.pause(); REC.pauseT = performance.now(); REC.state = 'paused'; onRecChanged(); }
  else if (REC.state === 'paused') { REC.mr.resume(); REC.pausedMs += performance.now() - REC.pauseT; REC.pauseT = 0; REC.state = 'recording'; onRecChanged(); }
}
async function stopRecording() {
  if (REC.state !== 'recording' && REC.state !== 'paused') return null;
  const dur = recElapsed();
  REC.state = 'stopping'; onRecChanged();
  try { REC.mr.stop(); } catch (e) {}
  await REC.stopped;
  try { REC.vtrack.stop(); } catch (e) {}
  if (REC.wake) { REC.wake.release().catch(() => {}); REC.wake = null; }
  const fmt = REC.fmt, isMkv = fmt.ext === 'webm' || fmt.ext === 'mkv';
  const entry = { id: uid(), name: REC.name, size: REC.bytes, ms: Math.round(dur), mime: fmt.mime, at: Date.now(), where: 'download', scene: (sceneById(coll.program) || {}).name || '' };
  try {
    await REC.writeQ;
    if (REC.out && !REC.err) {
      const o = REC.out;
      await o.writable.close();
      const file = await o.fh.getFile();
      const fixed = isMkv ? await fixMatroskaDuration(file, dur) : file;
      let moved = false;
      if (fixed === file && typeof o.fh.move === 'function') { try { await o.fh.move(o.finalName); moved = true; } catch (e) {} }
      if (!moved) {
        const fh = await o.dir.getFileHandle(o.finalName, { create: true });
        const w = await fh.createWritable(); await w.write(fixed); await w.close();
        await o.dir.removeEntry(o.tmpName).catch(() => {});
      }
      entry.where = 'folder'; entry.folder = FOLDER.name; entry.size = fixed.size;
    } else {
      if (REC.out) { try { await REC.out.writable.close(); } catch (e) {} }
      let blob = new Blob(REC.chunks, { type: fmt.mime.split(';')[0] });
      if (REC.out && REC.err) { const f = await REC.out.fh.getFile().catch(() => null); if (f) blob = new Blob([f, blob], { type: blob.type }); }
      if (isMkv) blob = await fixMatroskaDuration(blob, dur);
      entry.size = blob.size; entry.url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = entry.url; a.download = entry.name; document.body.appendChild(a); a.click(); a.remove();
    }
  } catch (e) {
    toast('Saving the recording failed: ' + e.message, 'err');
    entry.error = e.message;
  }
  REC.chunks = []; REC.out = null; REC.mr = null; REC.state = 'idle'; REC.t0 = 0;
  addToLibrary(entry);
  onRecChanged();
  return entry;
}

/* recordings history: metadata kept per browser; the files themselves are on disk (folder) or in Downloads */
const LIB = { list: LS.get('library', []), urls: new Map() };
function addToLibrary(e) {
  if (e.url) LIB.urls.set(e.id, e.url);
  const keep = Object.assign({}, e); delete keep.url;
  LIB.list.unshift(keep); LIB.list = LIB.list.slice(0, 300); LS.set('library', LIB.list);
}
function removeFromLibrary(id) {
  LIB.list = LIB.list.filter(x => x.id !== id); LS.set('library', LIB.list);
  const u = LIB.urls.get(id); if (u) { URL.revokeObjectURL(u); LIB.urls.delete(id); }
}

/* screenshot of the output (OBS "Screenshot (Output)") */
async function takeScreenshot() {
  const blob = await new Promise(res => progCanvas.toBlob(res, 'image/png'));
  if (!blob) { toast('Could not take the screenshot.', 'err'); return; }
  const name = buildFileName('png', 'shot');
  if (FOLDER.handle && await folderReady(true)) {
    try {
      const n = await uniqueFileIn(FOLDER.handle, name), fh = await FOLDER.handle.getFileHandle(n, { create: true });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      toast('Screenshot saved in “' + FOLDER.name + '”: ' + n, 'ok'); return;
    } catch (e) { toast('Folder write failed — downloading instead.', 'err'); }
  }
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
  toast('Screenshot saved to Downloads: ' + name, 'ok');
}

/* ───────────── boot of the engine ───────────── */
coll = normalizeCollection(LS.get('collection', null)) || defaultCollection();
sizeCanvases();
ticker.postMessage(1000 / coll.fps);
