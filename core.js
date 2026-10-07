'use strict';
/* IBI Screen Recorder Studio — ENGINE: utilities, saved state, sources, audio mixer, compositor, recorder.
 * Everything runs in this browser tab; nothing is uploaded. ui.js draws the docks and dialogs on top of this. */
const APP_NAME = 'IBI Screen Recorder Studio';
const APP_VERSION = 'v2.1';

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
  slideshow: { label: 'Image Slide Show', icon: 'image', video: true, desc: 'Several images shown one after another, with a fade' },
  scene: { label: 'Scene', icon: 'layout', video: true, desc: 'Another scene placed inside this one (nested scene)' },
  captions: { label: 'Live Captions', icon: 'text', video: true, desc: 'Speech turned into on-screen subtitles as you talk' },
};
// Display Capture opens the share picker on one tab: Entire screen, Window or Chrome tab (OBS has separate
// Display / Window capture sources; here they are one source with a preferred surface).
const SURFACES = { monitor: 'Display Capture', window: 'Window Capture', browser: 'Chrome Tab Capture' };
function typeLabel(s) { return s.type === 'display' && SURFACES[s.settings.surface] ? SURFACES[s.settings.surface] : SOURCE_TYPES[s.type].label; }
function typeIcon(s) { return s.type === 'display' && s.settings.surface === 'window' ? 'layout' : s.type === 'display' && s.settings.surface === 'browser' ? 'list' : SOURCE_TYPES[s.type].icon; }
const DEF_SETTINGS = {
  format: 'auto', vkbps: 0, akbps: 160, countdown: 3, fileName: 'IBI Recording {date} {time}',
  confirmStop: false, miniOnRecord: true, snap: true, mixerLayout: 'vertical', dockH: 300, autoStart: true,
  hotkeys: {}, replaySec: 30, autoStopMin: 0, monitorSink: '', helpSeen: false,
};
let S = Object.assign({}, DEF_SETTINGS, LS.get('settings', {}));
function saveSettings() { LS.set('settings', S); }

function defFilters() { return { opacity: 100, brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, sharpen: 0, scrollX: 0, scrollY: 0, blend: 'source-over', shape: 'rect', radius: 24, borderW: 0, borderColor: '#ffffff', chroma: { on: false, color: '#00ff00', similarity: 400, smoothness: 80, spill: 100 }, colorKey: { on: false, color: '#00ff00', similarity: 80, smoothness: 50 }, lumaKey: { on: false, min: 0, max: 100, smooth: 5 } }; }
function defAudio() { return { volDb: 0, muted: false, monitor: false, gainDb: 0, mono: false, hidden: false, balance: 0, syncMs: 0, invert: false, gate: { on: false, open: -26, close: -32, attack: 25, hold: 200, release: 150 }, comp: { on: false, ratio: 10, threshold: -18, attack: 6, release: 60, gain: 0 }, limit: { on: false, threshold: -6, release: 60 }, eq: { on: false, low: 0, mid: 0, high: 0 } }; }
const NESTED_F = ['chroma', 'colorKey', 'lumaKey'], NESTED_A = ['gate', 'comp', 'limit', 'eq'];
function defSettingsFor(type) {
  switch (type) {
    case 'display': return { audio: true, cursor: 'always', surface: '' };
    case 'slideshow': return { files: [], interval: 5, fadeMs: 700, loop: true, random: false, w: coll ? coll.canvas.w : 1920, h: coll ? coll.canvas.h : 1080 };
    case 'scene': return { sceneId: '' };
    case 'captions': return { lang: 'en-IN', keepSec: 6, maxChars: 48, text: '', font: 'Segoe UI', size: 56, bold: true, italic: false, color: '#ffffff', bg: '#000000', bgOpacity: 60, outlineW: 0, outlineColor: '#000000', align: 'center' };
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
  coll = { v: 1, canvas: { w: 1920, h: 1080 }, fps: 30, scenes: [], sources: {}, program: '', preview: '', transition: { type: 'fade', ms: 300, color: '#000000', wipe: 'left', point: 500 }, studio: false };
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
    NESTED_F.forEach(k => { out.sources[id].filters[k] = Object.assign(defFilters()[k], (s.filters || {})[k] || {}); });
    NESTED_A.forEach(k => { out.sources[id].audio[k] = Object.assign(defAudio()[k], (s.audio || {})[k] || {}); });
  }
  c.scenes.forEach(sc => {
    if (!sc || !Array.isArray(sc.items)) return;
    out.scenes.push({ id: String(sc.id || uid()), name: String(sc.name || 'Scene').slice(0, 80), tr: sc.tr && TRANSITIONS[sc.tr.type] ? { type: sc.tr.type, ms: clamp(+sc.tr.ms || 300, 50, 20000) } : null, items: sc.items.filter(it => it && out.sources[it.sourceId]).map(it => Object.assign(makeItem(it.sourceId), it, { crop: Object.assign({ l: 0, t: 0, r: 0, b: 0 }, it.crop || {}) })) });
  });
  if (!out.scenes.length) return null;
  const ids = out.scenes.map(s => s.id);
  out.program = ids.includes(c.program) ? c.program : ids[0];
  out.preview = ids.includes(c.preview) ? c.preview : out.program;
  out.transition = Object.assign({ color: '#000000', wipe: 'left', point: 500 }, out.transition);
  if (c.transition && TRANSITIONS[c.transition.type]) Object.assign(out.transition, { type: c.transition.type, ms: clamp(+c.transition.ms || 300, 50, 20000), color: /^#[0-9a-f]{6}$/i.test(c.transition.color) ? c.transition.color : '#000000', wipe: WIPES[c.transition.wipe] ? c.transition.wipe : 'left', point: clamp(+c.transition.point || 500, 0, 20000) });
  return out;
}
let saveT = 0;
// Undo / Redo (v2.0, OBS Edit menu): every saved change is a step; scene switching and measured sizes are not.
const UNDO = { stack: [], redo: [], last: null };
const undoKey = c => JSON.stringify(c, (k, v) => (k === 'nat' || k === 'program' || k === 'preview' || k === 'studio') ? undefined : v);
function saveColl() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const snap = { key: undoKey(coll), json: JSON.stringify(coll) };
    if (UNDO.last && snap.key !== UNDO.last.key) { UNDO.stack.push(UNDO.last); if (UNDO.stack.length > 60) UNDO.stack.shift(); UNDO.redo = []; }
    UNDO.last = snap;
    if (!LS.set('collection', coll)) toast('Could not save the scene collection in this browser (storage full or blocked).', 'err');
  }, 250);
}
let onCollectionReplaced = () => {};
function setCollectionHook(fn) { onCollectionReplaced = fn; }
const LIVE_START = ['display', 'webcam', 'mic', 'captions'];   // need a click or a permission: never auto-started by undo
function replaceCollection(c) {
  const prog = coll.program, prev = coll.preview, studio = coll.studio;
  Object.keys(coll.sources).forEach(id => { if (!c.sources[id]) { stopSource(id); RT.delete(id); } });
  if (c.scenes.some(x => x.id === prog)) c.program = prog;
  if (c.scenes.some(x => x.id === prev)) c.preview = prev;
  c.studio = studio;
  coll = c;
  Object.values(coll.sources).forEach(s => { const rt = rtOf(s.id); if (ALWAYS_LIVE.includes(s.type)) rt.status = 'live'; else if (rt.status === 'idle' && !LIVE_START.includes(s.type)) startSource(s.id, { quiet: true }); if (rt.au) applyAudio(s.id); rt.tKey = ''; rt.sKey = ''; });
  sizeCanvases(); updateGates(0); LS.set('collection', coll);
  onCollectionReplaced();
}
function undoStep(redo) {
  clearTimeout(saveT);
  const cur = { key: undoKey(coll), json: JSON.stringify(coll) };
  if (UNDO.last && cur.key !== UNDO.last.key) { UNDO.stack.push(UNDO.last); UNDO.redo = []; UNDO.last = cur; }
  const from = redo ? UNDO.redo : UNDO.stack, to = redo ? UNDO.stack : UNDO.redo;
  const step = from.pop(); if (!step) return false;
  to.push(UNDO.last || cur);
  const c = normalizeCollection(JSON.parse(step.json)); if (!c) return false;
  replaceCollection(c);
  UNDO.last = { key: undoKey(coll), json: JSON.stringify(coll) };   // the normalised state, so the next save is not mistaken for a new edit (which would wipe Redo)
  return true;
}
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
    else if (s.type === 'slideshow') await startSlideshow(s, rt);
    else if (s.type === 'captions') await startCaptions(s, rt);
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
  rt.status = s && ALWAYS_LIVE.includes(s.type) ? 'live' : 'idle';
  onSourcesChanged();
}
async function restartSource(id) { stopSource(id); return startSource(id); }
const ALWAYS_LIVE = ['text', 'color', 'scene'];
function teardown(rt) {
  rt.ending = true;
  if (rt.stream) rt.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
  if (rt.reader) { try { rt.reader.cancel(); } catch (e) {} }
  if (rt.frame) { try { rt.frame.close(); } catch (e) {} }
  if (rt.video) { try { rt.video.pause(); rt.video.srcObject = null; rt.video.removeAttribute('src'); rt.video.load(); } catch (e) {} rt.video.remove(); }
  if (rt.img && rt.img.remove) rt.img.remove();
  if (rt.rec) { try { rt.rec.onend = null; rt.rec.abort(); } catch (e) {} rt.rec = null; }
  if (rt.slides) { rt.slides.forEach(im => { try { URL.revokeObjectURL(im.src); } catch (e) {} }); rt.slides = null; }
  if (rt.url) URL.revokeObjectURL(rt.url);
  detachAudio(rt);
  rt.stream = rt.reader = rt.frame = rt.video = rt.img = rt.url = rt.track = null; rt.w = rt.h = 0; rt.needsPlay = false; rt.warn = ''; rt.blackSec = 0; rt.triedVideo = false; rt.path = '';
  rt.ending = false;
}
function noteNat(s, w, h) {
  if (!w || !h) return;
  const old = s.nat, changed = !old || old.w !== w || old.h !== h;
  // v1.2: the shared surface changed size (another window/tab was chosen, or the window was resized).
  // Items that filled the canvas with the OLD size keep filling it with the new one — OBS "fit to screen"
  // bounding box / Loom behaviour. A capture left at the top-left corner and spilling off the canvas
  // (the v1.1 symptom: "only part of the window is in the video") is re-fitted too. Placed items keep their scale.
  const refit = [];
  if (s.type === 'display' || s.type === 'webcam') coll.scenes.forEach(sc => sc.items.forEach(it => {
    if (it.sourceId !== s.id || it.fit || it.locked) return;
    const m = (old && changed ? fittedMode(it, old) : '') || (spillsFromCorner(it, { w, h }) ? 'fit' : '');
    if (m) refit.push([it, m]);
  }));
  if (changed) s.nat = { w, h };
  refit.forEach(([it, m]) => transformItem(it, m));
  if (changed || refit.length) saveColl();
  coll.scenes.forEach(sc => sc.items.forEach(it => { if (it.sourceId === s.id && it.fit) applyPendingFit(sc, it); }));
}
function boxWith(it, nat) {
  const c = it.crop; let nw = Math.max(1, nat.w - c.l - c.r), nh = Math.max(1, nat.h - c.t - c.b);
  if (it.rot % 180) { const t = nw; nw = nh; nh = t; }
  return { w: nw * it.sx, h: nh * it.sy };
}
function spillsFromCorner(it, nat) {
  const b = boxWith(it, nat), W = coll.canvas.w, H = coll.canvas.h, tol = 4;
  return Math.abs(it.x) <= tol && Math.abs(it.y) <= tol && (b.w > W + tol || b.h > H + tol);
}
// Was this item filling the canvas (fit or stretch) when the source had size `nat`?
function fittedMode(it, nat) {
  const W = coll.canvas.w, H = coll.canvas.h, bx = boxWith(it, nat), bw = bx.w, bh = bx.h, tol = 4;
  const fullW = Math.abs(bw - W) < tol, fullH = Math.abs(bh - H) < tol;
  const centred = Math.abs(it.x + bw / 2 - W / 2) < tol && Math.abs(it.y + bh / 2 - H / 2) < tol;
  if (!centred || bw > W + tol || bh > H + tol) return '';
  if (fullW && fullH) return Math.abs(it.sx / it.sy - 1) < 0.01 ? 'fit' : 'stretch';
  return fullW || fullH ? 'fit' : '';
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
  if (st.surface) video.displaySurface = st.surface;   // opens the picker on Entire screen / Window / Chrome tab
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
async function startSlideshow(s, rt) {
  const n = (s.settings.files || []).length; if (!n) throw new Error('nofile');
  const slides = [];
  for (let i = 0; i < n; i++) {
    const b = await idb.get('blobs', s.id + '#' + i); if (!b) continue;
    const im = new Image(); im.src = URL.createObjectURL(b);
    try { await im.decode(); slides.push(im); } catch (e) { URL.revokeObjectURL(im.src); }
  }
  if (!slides.length) throw new Error('nofile');
  rt.slides = slides; rt.t0 = performance.now(); rt.sKey = '';
  rt.order = slides.map((_, i) => i);
  if (s.settings.random) for (let i = rt.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rt.order[i], rt.order[j]] = [rt.order[j], rt.order[i]]; }
}
function slideFrame(s, rt) {
  if (!rt.slides || !rt.slides.length) return null;
  const st = s.settings, W = +st.w || coll.canvas.w, H = +st.h || coll.canvas.h, iv = Math.max(1, +st.interval || 5) * 1000, fade = Math.min(+st.fadeMs || 0, iv / 2), n = rt.slides.length;
  const el = performance.now() - rt.t0; let k = Math.floor(el / iv), within = el - k * iv;
  if (!st.loop && k >= n) { k = n - 1; within = iv; }
  const cur = rt.order[k % n], prev = k > 0 ? rt.order[(k - 1) % n] : -1;
  const c = rt.ssc || (rt.ssc = document.createElement('canvas'));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; rt.sKey = ''; }
  const fading = prev >= 0 && within < fade, key = cur + '|' + (fading ? Math.round(within / fade * 40) : 's');
  if (rt.sKey !== key) {
    rt.sKey = key; const x = c.getContext('2d'); x.clearRect(0, 0, W, H);
    const fit = (im, a) => { const q = Math.min(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * q, h = im.naturalHeight * q; x.globalAlpha = a; x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); };
    if (fading) { fit(rt.slides[prev], 1); fit(rt.slides[cur], within / fade); } else fit(rt.slides[cur], 1);
    x.globalAlpha = 1;
  }
  return { src: c, w: W, h: H };
}
// Live Captions: the browser's speech recognition (Chrome/Edge send the audio to Google for this - said in the UI).
async function startCaptions(s, rt) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('Live captions need Chrome or Edge.');
  const r = new SR();
  r.lang = s.settings.lang || 'en-IN'; r.continuous = true; r.interimResults = true;
  rt.capFinal = []; rt.capInterim = '';
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) rt.capFinal.push({ t: t.trim(), at: Date.now() }); else interim += t; }
    rt.capInterim = interim;
  };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { rt.err = 'Microphone permission refused for captions.'; rt.status = 'error'; onSourcesChanged(); } };
  r.onend = () => { if (rt.rec === r && !rt.ending) { try { r.start(); } catch (e) {} } };   // Chrome stops after a pause - keep listening
  rt.rec = r; r.start();
}
function captionString(s, rt) {
  const keep = (+s.settings.keepSec || 6) * 1000, now = Date.now();
  rt.capFinal = (rt.capFinal || []).filter(x => now - x.at < keep);
  const words = [...rt.capFinal.map(x => x.t), rt.capInterim || ''].join(' ').replace(/\s+/g, ' ').trim().split(' ');
  const max = Math.max(16, +s.settings.maxChars || 48), lines = []; let line = '';
  words.forEach(w => { if (!w) return; if ((line + ' ' + w).trim().length > max) { lines.push(line.trim()); line = w; } else line += ' ' + w; });
  if (line.trim()) lines.push(line.trim());
  return lines.slice(-2).join('\n');
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
  const st = s.settings, str = s.type === 'captions' ? captionString(s, rt) : textString(s);
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
  if (s.type === 'captions') { const c = textCanvas(s); return { w: Math.max(c.width, 400), h: Math.max(c.height, 80) }; }
  if (s.type === 'slideshow') return { w: +s.settings.w || coll.canvas.w, h: +s.settings.h || coll.canvas.h };
  if (s.type === 'scene') return { w: coll.canvas.w, h: coll.canvas.h };
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
const AU = { ctx: null, mix: null, dest: null, gateReady: false };
// Noise gate as an AudioWorklet (OBS defaults: open -26 dB, close -32 dB, attack 25 ms, hold 200 ms, release 150 ms).
const GATE_SRC = `class G extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:'open',defaultValue:-26},{name:'close',defaultValue:-32},{name:'attack',defaultValue:25},{name:'hold',defaultValue:200},{name:'release',defaultValue:150}]}
constructor(){super();this.g=0;this.held=0;this.env=0;this.tg=0}
process(inp,out,p){const i=inp[0],o=out[0];if(!i||!i.length){for(const ch of o)ch.fill(0);return true}
const n=i[0].length,sr=sampleRate,op=Math.pow(10,p.open[0]/20),cl=Math.pow(10,p.close[0]/20),at=1/Math.max(1,p.attack[0]*sr/1000),rl=1/Math.max(1,p.release[0]*sr/1000),hd=p.hold[0]*sr/1000;
for(let k=0;k<n;k++){let pk=0;for(let c=0;c<i.length;c++){const v=Math.abs(i[c][k]);if(v>pk)pk=v}
this.env=Math.max(pk,this.env*0.9995);if(this.env>=op){this.held=hd;this.tg=1}else if(this.env<cl){if(this.held>0)this.held--;else this.tg=0}
this.g+=this.tg>this.g?Math.min(at,this.tg-this.g):-Math.min(rl,this.g-this.tg);
for(let c=0;c<o.length;c++)o[c][k]=(i[c]||i[0])[k]*this.g}return true}}
registerProcessor('ibisr-gate',G);`;
function ac() {
  if (AU.ctx) return AU.ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  AU.ctx = new C({ latencyHint: 'interactive' });
  AU.mix = AU.ctx.createGain();
  AU.dest = AU.ctx.createMediaStreamDestination();
  AU.dest.channelCount = 2;
  AU.mix.connect(AU.dest);
  if (AU.ctx.audioWorklet) AU.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([GATE_SRC], { type: 'text/javascript' }))).then(() => { AU.gateReady = true; RT.forEach((rt, id) => { if (rt.au) rewireAudio(id); }); }).catch(() => {});
  if (S.monitorSink && AU.ctx.setSinkId) AU.ctx.setSinkId(S.monitorSink).catch(() => {});
  return AU.ctx;
}
function resumeAudio() { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); }
function attachAudio(s, rt, node) {
  const c = ac();
  const a = { node, fader: c.createGain(), pan: c.createStereoPanner(), up: c.createGain(), gate: c.createGain(), mon: c.createGain(), split: c.createChannelSplitter(2), aL: c.createAnalyser(), aR: c.createAnalyser(),
    delay: c.createDelay(2), pol: c.createGain(), eqL: c.createBiquadFilter(), eqM: c.createBiquadFilter(), eqH: c.createBiquadFilter(), comp: c.createDynamicsCompressor(), compGain: c.createGain(), lim: c.createDynamicsCompressor(), wired: null };
  a.up.channelCount = 2; a.up.channelCountMode = 'explicit'; a.up.channelInterpretation = 'speakers';   // mono mics show on both meters
  a.aL.fftSize = a.aR.fftSize = 1024; a.buf = new Float32Array(1024);
  a.pol.gain.value = -1;
  a.eqL.type = 'lowshelf'; a.eqL.frequency.value = 250; a.eqM.type = 'peaking'; a.eqM.frequency.value = 1500; a.eqM.Q.value = 0.7; a.eqH.type = 'highshelf'; a.eqH.frequency.value = 4000;
  a.lim.ratio.value = 20; a.lim.knee.value = 0; a.lim.attack.value = 0.001;
  a.fader.connect(a.pan);
  a.pan.connect(a.gate); a.gate.connect(AU.mix);
  a.pan.connect(a.up); a.up.connect(a.split); a.split.connect(a.aL, 0); a.split.connect(a.aR, 1);
  a.pan.connect(a.mon); a.mon.connect(c.destination);
  a.gate.gain.value = gateTarget(s.id);
  rt.au = a; rt.lvl = [-100, -100]; rt.hold = [-100, -100]; rt.holdT = [0, 0];
  applyAudio(s.id);
}
// Audio filters (OBS order: sync offset > invert polarity > 3-band EQ > noise gate > compressor > limiter > fader > balance).
function rewireAudio(id) {
  const s = coll.sources[id], rt = RT.get(id); if (!s || !rt || !rt.au) return;
  const a = rt.au, fx = s.audio;
  const want = [fx.syncMs > 0 ? 'd' : '', fx.invert ? 'p' : '', fx.eq.on ? 'e' : '', fx.gate.on && AU.gateReady ? 'g' : '', fx.comp.on ? 'c' : '', fx.limit.on ? 'l' : ''].join('');
  if (want === a.wired) return;
  ['node', 'delay', 'pol', 'eqL', 'eqM', 'eqH', 'gateN', 'comp', 'compGain', 'lim'].forEach(k => { if (a[k]) try { a[k].disconnect(); } catch (e) {} });
  let cur = a.node; const link = n => { cur.connect(n); cur = n; };
  if (want.includes('d')) link(a.delay);
  if (want.includes('p')) link(a.pol);
  if (want.includes('e')) { link(a.eqL); link(a.eqM); link(a.eqH); }
  if (want.includes('g')) { if (!a.gateN) a.gateN = new AudioWorkletNode(AU.ctx, 'ibisr-gate', { outputChannelCount: [2] }); link(a.gateN); }
  if (want.includes('c')) { link(a.comp); link(a.compGain); }
  if (want.includes('l')) link(a.lim);
  cur.connect(a.fader);
  a.wired = want;
}
function detachAudio(rt) {
  const a = rt.au; if (!a) return;
  ['node', 'fader', 'pan', 'up', 'gate', 'mon', 'split', 'delay', 'pol', 'eqL', 'eqM', 'eqH', 'gateN', 'comp', 'compGain', 'lim'].forEach(k => { if (a[k]) try { a[k].disconnect(); } catch (e) {} });
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
  const fx = au, sm = (p, v) => p.setTargetAtTime(v, t, 0.02);
  a.delay.delayTime.value = clamp(+fx.syncMs || 0, 0, 2000) / 1000;
  sm(a.eqL.gain, +fx.eq.low || 0); sm(a.eqM.gain, +fx.eq.mid || 0); sm(a.eqH.gain, +fx.eq.high || 0);
  a.comp.threshold.value = clamp(+fx.comp.threshold, -60, 0); a.comp.ratio.value = clamp(+fx.comp.ratio, 1, 20); a.comp.attack.value = clamp(+fx.comp.attack, 0, 1000) / 1000; a.comp.release.value = clamp(+fx.comp.release, 1, 1000) / 1000; a.comp.knee.value = 6;
  sm(a.compGain.gain, dbToLin(+fx.comp.gain || 0));
  a.lim.threshold.value = clamp(+fx.limit.threshold, -60, 0); a.lim.release.value = clamp(+fx.limit.release, 1, 1000) / 1000;
  sm(a.pan.pan, clamp(+fx.balance || 0, -1, 1));
  rewireAudio(id);
  if (a.gateN) { const P = a.gateN.parameters; P.get('open').value = +fx.gate.open; P.get('close').value = +fx.gate.close; P.get('attack').value = +fx.gate.attack; P.get('hold').value = +fx.gate.hold; P.get('release').value = +fx.gate.release; }
}
function inScene(sceneId, sourceId, depth) {
  const sc = sceneById(sceneId); depth = depth || 0; if (!sc || depth > 8) return false;
  return sc.items.some(it => it.visible && (it.sourceId === sourceId || (coll.sources[it.sourceId] && coll.sources[it.sourceId].type === 'scene' && inScene(coll.sources[it.sourceId].settings.sceneId, sourceId, depth + 1))));
}
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
const TRANSITIONS = { cut: 'Cut', fade: 'Fade', fadeblack: 'Fade to Black', fadecolor: 'Fade to Color', slide: 'Slide', swipe: 'Swipe', wipe: 'Luma Wipe', stinger: 'Stinger' };
const WIPES = { left: 'Left to right', right: 'Right to left', down: 'Top to bottom', up: 'Bottom to top', radial: 'Circle out', clock: 'Clock', diamond: 'Diamond', barn: 'Barn doors' };
// Stinger: a video (often with transparency, WebM VP9) played over the switch; the scene changes at the transition point.
const STING = { video: null, url: '', ready: false, name: '' };
async function loadStinger() {
  if (STING.video) { STING.video.pause(); STING.video.remove(); URL.revokeObjectURL(STING.url); }
  STING.video = null; STING.ready = false; STING.name = '';
  const b = await idb.get('blobs', 'stinger'); if (!b) return false;
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
  STING.url = URL.createObjectURL(b); v.src = STING.url; document.getElementById('hiddenMedia').appendChild(v);
  await new Promise(r => { v.onloadeddata = r; v.onerror = r; });
  STING.video = v; STING.ready = v.readyState >= 2 && isFinite(v.duration); STING.name = b.name || 'stinger';
  return STING.ready;
}
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
  if (+f.sharpen > 0) p.push(sharpenFilter(f.sharpen));
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
    case 'captions': { const c = textCanvas(s, rt); return { src: c, w: c.width, h: c.height }; }
    case 'slideshow': return slideFrame(s, rt);
    case 'scene': {
      const sc = sceneById(s.settings.sceneId); if (!sc || SCENE_STACK.has(sc.id)) return null;
      const W = coll.canvas.w, H = coll.canvas.h, c = rt.nc || (rt.nc = document.createElement('canvas'));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      renderScene(x, sc, 1, 0);
      return { src: c, w: W, h: H };
    }
  }
  return null;
}
const SCENE_STACK = new Set();   // stops a scene from containing itself
// Sharpen (OBS "Sharpen" filter): an SVG convolution referenced from the canvas filter.
function sharpenFilter(amount) {
  const n = Math.round(clamp(+amount, 1, 100)), id = 'ibisrSh' + n;
  if (!document.getElementById(id)) {
    const k = (n / 100 * 1.2).toFixed(3), c = (1 + 4 * k).toFixed(3);
    let svg = document.getElementById('ibisrFx');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'ibisrFx'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute'; document.body.appendChild(svg); }
    svg.insertAdjacentHTML('beforeend', '<filter id="' + id + '" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -' + k + ' 0 -' + k + ' ' + c + ' -' + k + ' 0 -' + k + ' 0"/></filter>');
  }
  return 'url(#' + id + ')';
}
// Chroma key (green screen) — the OBS formula: distance in CbCr from the key colour, minus similarity, over smoothness, plus spill reduction.
function keysOn(f) { return (f.chroma && f.chroma.on) || (f.colorKey && f.colorKey.on) || (f.lumaKey && f.lumaKey.on); }
function chromaKey(rt, src, sx, sy, sw, sh, dw, dh, ck, f) {
  const W = Math.max(1, Math.min(1280, Math.round(Math.abs(dw)))), H = Math.max(1, Math.round(Math.abs(dh) * W / Math.abs(dw)));
  const c = rt.ck || (rt.ck = document.createElement('canvas'));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = rt.ckx || (rt.ckx = c.getContext('2d', { willReadFrequently: true }));
  x.clearRect(0, 0, W, H); x.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const hex = String(ck.color || '#00ff00').replace('#', ''), kr = parseInt(hex.slice(0, 2), 16) / 255, kg = parseInt(hex.slice(2, 4), 16) / 255, kb = parseInt(hex.slice(4, 6), 16) / 255;
  const kcb = -0.1146 * kr - 0.3854 * kg + 0.5 * kb, kcr = 0.5 * kr - 0.4542 * kg - 0.0458 * kb;
  const sim = (+ck.similarity || 400) / 1000, smooth = Math.max(0.001, (+ck.smoothness || 80) / 1000), spill = Math.max(0.001, (+ck.spill || 100) / 1000);
  const CK = !!ck.on, K2 = f.colorKey || {}, CO = !!K2.on, LK = f.lumaKey || {}, LU = !!LK.on;
  const hx = String(K2.color || '#00ff00').replace('#', ''), qr = parseInt(hx.slice(0, 2), 16) / 255, qg = parseInt(hx.slice(2, 4), 16) / 255, qb = parseInt(hx.slice(4, 6), 16) / 255;
  const csim = (+K2.similarity || 80) / 1000, csm = Math.max(0.001, (+K2.smoothness || 50) / 1000);
  const lmin = (+LK.min || 0) / 100, lmax = (LK.max == null ? 100 : +LK.max) / 100, lsm = Math.max(0.001, (+LK.smooth || 0) / 100);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    let a = 1;
    if (CK) {
      const cb = -0.1146 * r - 0.3854 * g + 0.5 * b, cr = 0.5 * r - 0.4542 * g - 0.0458 * b;
      const base = Math.sqrt((cb - kcb) * (cb - kcb) + (cr - kcr) * (cr - kcr)) - sim;
      a = Math.pow(clamp(base / smooth, 0, 1), 1.5);
      const sp = Math.pow(clamp(base / spill, 0, 1), 1.5);
      if (sp < 1) { const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; d[i] = (lum + (r - lum) * sp) * 255; d[i + 1] = (lum + (g - lum) * sp) * 255; d[i + 2] = (lum + (b - lum) * sp) * 255; }
    }
    if (CO) { const dist = Math.sqrt(((r - qr) ** 2 + (g - qg) ** 2 + (b - qb) ** 2) / 3); a *= Math.pow(clamp((dist - csim) / csm, 0, 1), 1.5); }
    if (LU) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; a *= clamp((l - lmin) / lsm + 0.5, 0, 1) * clamp((lmax - l) / lsm + 0.5, 0, 1); }
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
  if (f.blend && f.blend !== 'source-over') ctx.globalCompositeOperation = f.blend;   // OBS blending modes
  const fs = filterString(f); if (fs) ctx.filter = fs;
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  if (it.rot) ctx.rotate(it.rot * Math.PI / 180);
  ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
  const dw = it.rot % 180 ? b.h : b.w, dh = it.rot % 180 ? b.w : b.h;
  const scroll = +f.scrollX || +f.scrollY;
  if ((f.shape && f.shape !== 'rect') || scroll) { ctx.beginPath(); shapePath(ctx, f, dw, dh); ctx.clip(); }
  if (d.color) { ctx.fillStyle = d.color; ctx.fillRect(-dw / 2, -dh / 2, dw, dh); }
  else {
    const sw = d.w - cr.l - cr.r, sh = d.h - cr.t - cr.b;
    if (sw > 0 && sh > 0) {
      try {
        if (scroll) {   // OBS "Scroll" filter: the picture moves and wraps around (speed in source pixels per second)
          const t = performance.now() / 1000, ox = (((t * (+f.scrollX || 0) * dw / Math.max(1, sw)) % dw) + dw) % dw, oy = (((t * (+f.scrollY || 0) * dh / Math.max(1, sh)) % dh) + dh) % dh;
          const img = keysOn(f) ? chromaKey(rt, d.src, cr.l, cr.t, sw, sh, dw, dh, f.chroma, f) : null;
          for (let ix = -1; ix <= 0; ix++) for (let iy = -1; iy <= 0; iy++) {
            const X = -dw / 2 + ox + ix * dw, Y = -dh / 2 + oy + iy * dh;
            if (img) ctx.drawImage(img, X, Y, dw, dh); else ctx.drawImage(d.src, cr.l, cr.t, sw, sh, X, Y, dw, dh);
          }
        }
        else if (keysOn(f)) ctx.drawImage(chromaKey(rt, d.src, cr.l, cr.t, sw, sh, dw, dh, f.chroma, f), -dw / 2, -dh / 2, dw, dh);
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
  if (!sc || SCENE_STACK.has(sc.id)) return;
  SCENE_STACK.add(sc.id);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, (ox || 0) * scale, 0);
  for (let i = sc.items.length - 1; i >= 0; i--) {
    const it = sc.items[i]; if (!it.visible) continue;
    const s = coll.sources[it.sourceId]; if (!s || !SOURCE_TYPES[s.type].video) continue;
    drawItem(ctx, it, s);
  }
  ctx.restore();
  SCENE_STACK.delete(sc.id);
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function wipePath(x, kind, e, W, H) {
  if (kind === 'right') x.rect(W * (1 - e), 0, W * e, H);
  else if (kind === 'down') x.rect(0, 0, W, H * e);
  else if (kind === 'up') x.rect(0, H * (1 - e), W, H * e);
  else if (kind === 'radial') x.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * e, 0, Math.PI * 2);
  else if (kind === 'clock') { x.moveTo(W / 2, H / 2); x.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e); x.closePath(); }
  else if (kind === 'diamond') { const r = (W + H) / 2 * e; x.moveTo(W / 2, H / 2 - r); x.lineTo(W / 2 + r, H / 2); x.lineTo(W / 2, H / 2 + r); x.lineTo(W / 2 - r, H / 2); x.closePath(); }
  else if (kind === 'barn') x.rect(W / 2 * (1 - e), 0, W * e, H);
  else x.rect(0, 0, W * e, H);
}
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
      } else if (TR.type === 'fadeblack' || TR.type === 'fadecolor') {
        renderScene(pctx, e < 0.5 ? from : to, 1, 0);
        pctx.globalAlpha = e < 0.5 ? e * 2 : (1 - e) * 2; pctx.fillStyle = TR.type === 'fadecolor' ? TR.color : '#000'; pctx.fillRect(0, 0, W, H); pctx.globalAlpha = 1;
      } else if (TR.type === 'wipe') {
        renderScene(pctx, from, 1, 0);
        pctx.save(); pctx.beginPath(); wipePath(pctx, TR.wipe, e, W, H); pctx.clip();
        pctx.fillStyle = '#000'; pctx.fillRect(0, 0, W, H); renderScene(pctx, to, 1, 0); pctx.restore();
      } else if (TR.type === 'stinger') {
        renderScene(pctx, (now - TR.t0) < TR.point ? from : to, 1, 0);
        const v = STING.video;
        if (v && v.readyState >= 2) { const q = Math.max(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * q, h = v.videoHeight * q; try { pctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); } catch (er) {} }
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
  const target = sceneById(toId), tr = target.tr && TRANSITIONS[target.tr.type] ? Object.assign({}, coll.transition, target.tr) : coll.transition;   // per-scene override (OBS "Transition Override")
  let type = opts.cut ? 'cut' : tr.type, ms = tr.ms;
  if (type === 'stinger') { if (STING.ready) { ms = STING.video.duration * 1000; STING.video.currentTime = 0; STING.video.play().catch(() => {}); } else type = 'fade'; }
  const from = coll.program;
  coll.program = toId;
  if (type !== 'cut' && from !== toId) { TR.active = true; TR.from = from; TR.to = toId; TR.t0 = performance.now(); TR.ms = ms; TR.type = type; TR.color = tr.color || '#000000'; TR.wipe = tr.wipe || 'left'; TR.point = Math.min(+tr.point || ms / 2, ms); }
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
  if (lastTick && REC.state === 'recording') {   // like OBS: missed frames are counted only while recording
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
  if (RB.on && RB.vtrack && RB.vtrack.requestFrame) RB.vtrack.requestFrame();
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

/* Replay Buffer (OBS): keeps the last N seconds in memory; "Save Replay" writes them to a file.
   Two recorders run staggered by N seconds and each restarts every 2N, so one always holds at least N seconds. */
const RB = { on: false, recs: [], vtrack: null, timer: 0, fmt: null };
let onReplayChanged = () => {};
function setReplayHook(fn) { onReplayChanged = fn; }
function rbMake() {
  const stream = new MediaStream([RB.vtrack, AU.dest.stream.getAudioTracks()[0]]);
  const vk = +S.vkbps || recommendedKbps(coll.canvas.w, coll.canvas.h, coll.fps);
  const r = { mr: new MediaRecorder(stream, { mimeType: RB.fmt.mime, videoBitsPerSecond: vk * 1000, audioBitsPerSecond: (+S.akbps || 160) * 1000 }), chunks: [], t0: performance.now() };
  r.mr.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
  r.mr.start(1000);
  return r;
}
function startReplayBuffer() {
  if (RB.on) return true;
  RB.fmt = pickFormat(); if (!RB.fmt) { toast('This browser cannot record video.', 'err'); return false; }
  ac(); resumeAudio();
  RB.vtrack = progCanvas.captureStream(0).getVideoTracks()[0];
  RB.on = true; RB.recs = [rbMake()];
  const N = clamp(+S.replaySec || 30, 5, 300) * 1000;
  RB.second = setTimeout(() => { if (RB.on) RB.recs.push(rbMake()); }, N);
  RB.timer = setInterval(() => {   // restart whichever recorder is older than 2N
    if (!RB.on) return;
    RB.recs.forEach((r, i) => { if (performance.now() - r.t0 >= 2 * N) { try { r.mr.stop(); } catch (e) {} RB.recs[i] = rbMake(); } });
  }, 1000);
  onReplayChanged();
  return true;
}
function stopReplayBuffer() {
  if (!RB.on) return;
  RB.on = false; clearInterval(RB.timer); clearTimeout(RB.second);
  RB.recs.forEach(r => { try { r.mr.stop(); } catch (e) {} });
  RB.recs = []; try { RB.vtrack.stop(); } catch (e) {} RB.vtrack = null;
  onReplayChanged();
}
async function saveReplay() {
  if (!RB.on || !RB.recs.length) { toast('Start the Replay Buffer first.'); return null; }
  const r = RB.recs.reduce((a, b) => (a.t0 < b.t0 ? a : b));   // the one that has been running longest
  const ms = performance.now() - r.t0;
  await new Promise(res => { const h = () => { r.mr.removeEventListener('dataavailable', h); setTimeout(res, 0); }; r.mr.addEventListener('dataavailable', h); try { r.mr.requestData(); } catch (e) { res(); } setTimeout(res, 3000); });
  let blob = new Blob(r.chunks.slice(), { type: RB.fmt.mime.split(';')[0] });
  if (RB.fmt.ext === 'webm' || RB.fmt.ext === 'mkv') blob = await fixMatroskaDuration(blob, ms);
  const name = buildFileName(RB.fmt.ext).replace(/^IBI Recording/, 'IBI Replay');
  const entry = { id: uid(), name, size: blob.size, ms: Math.round(ms), mime: RB.fmt.mime, at: Date.now(), where: 'download', scene: (sceneById(coll.program) || {}).name || '', replay: true };
  try {
    if (FOLDER.handle && await folderReady(true)) {
      const n = await uniqueFileIn(FOLDER.handle, name), fh = await FOLDER.handle.getFileHandle(n, { create: true }), w = await fh.createWritable();
      await w.write(blob); await w.close(); entry.name = n; entry.where = 'folder'; entry.folder = FOLDER.name;
    } else {
      entry.url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = entry.url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }
  } catch (e) { toast('Saving the replay failed: ' + e.message, 'err'); return null; }
  addToLibrary(entry);
  return entry;
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
UNDO.last = { key: undoKey(coll), json: JSON.stringify(coll) };   // the state when the app opened is the first undo point
loadStinger().catch(() => {});
sizeCanvases();
ticker.postMessage(1000 / coll.fps);
