'use strict';
/* IBI Screen Recorder Studio — v2.0 studio tools: hotkeys, transitions extras, clipboard, replay buffer UI,
   output timer, multiview, scene collections, stats, and the Help assistant. Loaded after ui.js. */

/* ───────────── hotkeys (editable, like OBS Settings → Hotkeys) ───────────── */
const HOTKEY_ACTIONS = [
  ['rec', 'Start / stop recording', 'Ctrl+Alt+R'],
  ['pause', 'Pause / resume recording', 'Ctrl+Alt+P'],
  ['shot', 'Screenshot of the output', 'Ctrl+Alt+S'],
  ['transition', 'Transition (Studio Mode)', 'Ctrl+Alt+T'],
  ['mute', 'Mute / unmute the microphone', 'Ctrl+Alt+M'],
  ['replayToggle', 'Start / stop the Replay Buffer', 'Ctrl+Alt+Shift+B'],
  ['replaySave', 'Save Replay', 'Ctrl+Alt+B'],
  ['multiview', 'Open Multiview', 'Ctrl+Alt+V'],
  ['undo', 'Undo', 'Ctrl+Z'],
  ['redo', 'Redo', 'Ctrl+Y'],
  ['help', 'Open the Help assistant', 'F1'],
];
function hotkeyOf(id) { const d = HOTKEY_ACTIONS.find(a => a[0] === id); return S.hotkeys && Object.prototype.hasOwnProperty.call(S.hotkeys, id) ? S.hotkeys[id] : (d ? d[2] : ''); }
function comboOf(e) {
  const c = e.code || '';
  let k = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F\d{1,2}$/.test(c) ? c : /^Numpad\d$/.test(c) ? 'Num' + c.slice(6) : ({ Space: 'Space', Enter: 'Enter', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Pause: 'Pause' })[c];
  if (!k) return '';
  return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.metaKey ? 'Win+' : '') + k;
}
const HOTKEY_RUN = {
  rec: () => toggleRecording(), pause: () => pauseRecording(), shot: () => takeScreenshot(), transition: () => doTransition(),
  mute: () => { const s = firstMic(); if (s) { toggleMute(s.id); toast(s.name + (s.audio.muted ? ' muted' : ' unmuted')); } else toast('There is no microphone in the Program scene.'); },
  replayToggle: () => toggleReplay(), replaySave: () => doSaveReplay(), multiview: () => openMultiview(),
  undo: () => doUndo(false), redo: () => doUndo(true), help: () => HELP.open(),
};
// Returns true when the key press was a hotkey (called first by the global keydown handler in ui.js).
function handleHotkey(e) {
  if (HK_CAPTURE) return false;
  const combo = comboOf(e); if (!combo) return false;
  const inField = typing(e.target);
  if (inField && !/Alt\+|^F\d/.test(combo)) return false;   // typing keeps its own Ctrl+Z / Ctrl+Y
  if ($('.modal-scrim') && !/Alt\+|^F1$/.test(combo)) return false;
  for (const [id] of HOTKEY_ACTIONS) { if (hotkeyOf(id) && hotkeyOf(id) === combo) { e.preventDefault(); HOTKEY_RUN[id](); return true; } }
  const m = /^Ctrl\+Alt\+(\d)$/.exec(combo);
  if (m) { const sc = coll.scenes[+m[1] - 1]; if (sc) { e.preventDefault(); selectScene(sc.id); return true; } }
  return false;
}
let HK_CAPTURE = null;
function hotkeyEditorHtml() {
  return '<p class="hint">Click <b>Change</b>, then press the new key combination (Esc cancels). Shortcuts work while this window is active; while you work in other apps use <b>Mini Controls</b>.</p>' +
    '<table class="tbl"><thead><tr><th>Action</th><th>Keys</th><th></th></tr></thead><tbody>' +
    HOTKEY_ACTIONS.map(a => '<tr><td>' + esc(a[1]) + '</td><td><kbd data-hk-show="' + a[0] + '">' + esc(hotkeyOf(a[0]) || '—') + '</kbd></td><td><div class="hk-btns"><button type="button" class="btn sm" data-hk="' + a[0] + '">Change</button><button type="button" class="btn sm" data-hk-clear="' + a[0] + '">Clear</button></div></td></tr>').join('') +
    '<tr><td>Switch to scene 1 … 9</td><td><kbd>Ctrl+Alt+1 … 9</kbd></td><td></td></tr>' +
    '<tr><td>Nudge the selected source</td><td><kbd>Arrow keys</kbd> (Shift = 10 px)</td><td></td></tr>' +
    '<tr><td>Fit / centre / reset the selected source</td><td><kbd>Ctrl+F</kbd> <kbd>Ctrl+D</kbd> <kbd>Ctrl+R</kbd></td><td></td></tr>' +
    '<tr><td>Remove / rename / properties</td><td><kbd>Delete</kbd> <kbd>F2</kbd> <kbd>Enter</kbd></td><td></td></tr>' +
    '</tbody></table><div class="btn-row"><button type="button" class="btn" data-hk-reset>Reset all to defaults</button></div>';
}
function bindHotkeyEditor(root) {
  root.addEventListener('click', e => {
    const ch = e.target.closest('[data-hk]'), cl = e.target.closest('[data-hk-clear]'), rs = e.target.closest('[data-hk-reset]');
    const show = id => { const k = $('[data-hk-show="' + id + '"]', root); if (k) k.textContent = hotkeyOf(id) || '—'; };
    if (cl) { S.hotkeys[cl.dataset.hkClear] = ''; saveSettings(); show(cl.dataset.hkClear); }
    if (rs) { S.hotkeys = {}; saveSettings(); HOTKEY_ACTIONS.forEach(a => show(a[0])); toast('Hotkeys reset to the defaults.'); }
    if (ch) {
      const id = ch.dataset.hk, k = $('[data-hk-show="' + id + '"]', root);
      k.textContent = 'Press keys…'; ch.disabled = true;
      HK_CAPTURE = ev => {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;
        ev.preventDefault(); ev.stopPropagation();
        document.removeEventListener('keydown', HK_CAPTURE, true); HK_CAPTURE = null; ch.disabled = false;
        if (ev.key === 'Escape') { show(id); return; }
        const combo = comboOf(ev);
        if (!combo) { toast('That key cannot be used.'); show(id); return; }
        if (!/^(Ctrl|Alt|F\d)/.test(combo)) { toast('Use a combination with Ctrl or Alt, or a function key (F1–F12), so it does not clash with typing.'); show(id); return; }
        const clash = HOTKEY_ACTIONS.find(a => a[0] !== id && hotkeyOf(a[0]) === combo);
        if (clash) { S.hotkeys[clash[0]] = ''; show(clash[0]); toast(combo + ' was used for “' + clash[1] + '” — moved here.'); }
        S.hotkeys[id] = combo; saveSettings(); show(id);
      };
      document.addEventListener('keydown', HK_CAPTURE, true);
    }
  });
}

/* ───────────── transitions extras (Fade to Color, Luma Wipe, Stinger) + per-scene override ───────────── */
function renderTransitionExtras() {
  const box = $('#trExtra'); if (!box) return;
  const t = coll.transition;
  let h = '';
  if (t.type === 'fadecolor') h = '<label class="field row"><span>Colour</span><input type="color" id="trColor" value="' + esc(t.color) + '"></label>';
  else if (t.type === 'wipe') h = '<label class="field"><span>Wipe</span><select id="trWipe">' + Object.keys(WIPES).map(k => '<option value="' + k + '"' + (k === t.wipe ? ' selected' : '') + '>' + esc(WIPES[k]) + '</option>').join('') + '</select></label>';
  else if (t.type === 'stinger') h = '<p class="hint">' + (STING.ready ? 'Video: <b>' + esc(STING.name) + '</b> (' + STING.video.duration.toFixed(1) + ' s)' : 'Choose a short video (WebM with transparency is best).') + '</p>' +
    '<div class="btn-row"><button type="button" class="btn sm" id="trStFile">' + ic('folder') + (STING.ready ? 'Change video…' : 'Choose video…') + '</button></div><input type="file" id="trStIn" accept="video/*" hidden>' +
    '<label class="field"><span>Transition point (scene changes at)</span><span class="with-unit"><input type="number" id="trPoint" min="0" max="20000" step="50" value="' + t.point + '"><span class="unit">ms</span></span></label>';
  box.innerHTML = h;
  $('#trMs').closest('.field').hidden = t.type === 'stinger';
  const on = (id, ev, fn) => { const el = $('#' + id); if (el) el.addEventListener(ev, fn); };
  on('trColor', 'input', e => { t.color = e.target.value; saveColl(); });
  on('trWipe', 'change', e => { t.wipe = e.target.value; saveColl(); });
  on('trPoint', 'change', e => { t.point = clamp(Math.round(+e.target.value || 0), 0, 20000); e.target.value = t.point; saveColl(); });
  on('trStFile', 'click', () => $('#trStIn').click());
  on('trStIn', 'change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    await idb.set('blobs', 'stinger', f);
    const ok = await loadStinger();
    if (ok) { if (t.point > STING.video.duration * 1000) t.point = Math.round(STING.video.duration * 500); saveColl(); toast('Stinger ready: ' + f.name, 'ok'); }
    else toast('That video cannot be played here.', 'err');
    renderTransitionExtras();
  });
}
function transitionOverrideDialog(sceneId) {
  const sc = sceneById(sceneId); if (!sc) return;
  const cur = sc.tr || { type: '', ms: coll.transition.ms };
  const m = modal({
    title: 'Transition override — ' + sc.name,
    body: '<p class="hint">Use a different transition when switching <b>to</b> this scene (OBS “Transition Override”).</p>' +
      '<label class="field"><span>Transition</span><select id="toType"><option value="">Use the default (' + esc(TRANSITIONS[coll.transition.type]) + ')</option>' + Object.keys(TRANSITIONS).map(k => '<option value="' + k + '"' + (k === cur.type ? ' selected' : '') + '>' + esc(TRANSITIONS[k]) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Duration</span><span class="with-unit"><input type="number" id="toMs" min="50" max="20000" step="50" value="' + cur.ms + '"><span class="unit">ms</span></span></label>',
    foot: '<button type="button" class="btn" data-x>Cancel</button><button type="button" class="btn primary" id="toOk">Save</button>',
  });
  $('#toOk', m.el).addEventListener('click', () => {
    const type = $('#toType', m.el).value, ms = clamp(Math.round(+$('#toMs', m.el).value || 300), 50, 20000);
    sc.tr = type ? { type, ms } : null; saveColl(); m.close(); renderScenes();
    toast(type ? sc.name + ' now uses ' + TRANSITIONS[type] + '.' : sc.name + ' uses the default transition.', 'ok');
  });
}

/* ───────────── copy / paste transform & filters ───────────── */
const CLIP = { transform: null, filters: null };
function copyTransform(it) { CLIP.transform = { x: it.x, y: it.y, sx: it.sx, sy: it.sy, rot: it.rot, flipH: it.flipH, flipV: it.flipV, crop: clone(it.crop) }; toast('Transform copied.'); }
function pasteTransform(it) { if (!CLIP.transform) return; Object.assign(it, clone(CLIP.transform)); it.fit = false; saveColl(); rebuildPlaceholders(); toast('Transform pasted.'); }
function copyFilters(s) { CLIP.filters = clone(s.filters); toast('Filters copied from ' + s.name + '.'); }
function pasteFilters(s) { if (!CLIP.filters) return; s.filters = clone(CLIP.filters); rtOf(s.id).tKey = ''; saveColl(); toast('Filters pasted to ' + s.name + '.'); }

/* ───────────── replay buffer + output timer ───────────── */
function toggleReplay() {
  if (RB.on) { stopReplayBuffer(); toast('Replay Buffer stopped.'); }
  else if (startReplayBuffer()) toast('Replay Buffer on — press Save Replay (' + (hotkeyOf('replaySave') || 'button') + ') to keep the last ' + (S.replaySec || 30) + ' seconds.', 'ok');
}
async function doSaveReplay() {
  const b = $('#btnSaveReplay'); if (b) b.disabled = true;
  const e = await saveReplay();
  if (b) b.disabled = !RB.on;
  if (e) toast('Replay saved: ' + e.name + ' (' + fmtDur(e.ms) + ')', 'ok', { label: 'Recordings', run: openLibrary });
}
function renderReplay() {
  const b = $('#btnReplay'), sv = $('#btnSaveReplay'); if (!b) return;
  b.setAttribute('aria-pressed', String(RB.on)); $('#btnReplayLab').textContent = RB.on ? 'Stop Replay' : 'Replay Buffer';
  sv.disabled = !RB.on;
  const st = $('#stReplay'); if (st) { st.hidden = !RB.on; st.textContent = 'Replay buffer: ' + (S.replaySec || 30) + ' s'; }
}
setReplayHook(renderReplay);
setInterval(() => {   // Output Timer (OBS Tools → Output Timer): stop the recording after the set time
  const min = +S.autoStopMin || 0;
  if (min > 0 && REC.state === 'recording' && recElapsed() >= min * 60000) {
    stopRecording().then(e => { if (e) { toast('Output timer: stopped after ' + min + ' min. Saved ' + e.name, 'ok', { label: 'Recordings', run: openLibrary }); verifyRecording(e); } });
  }
}, 1000);

/* ───────────── undo / redo ───────────── */
function doUndo(redo) {
  if (REC.state === 'starting' || REC.state === 'stopping') return;
  if (undoStep(redo)) toast(redo ? 'Redone.' : 'Undone.', '', { label: redo ? 'Undo' : 'Redo', run: () => doUndo(!redo) });
  else toast(redo ? 'Nothing to redo.' : 'Nothing to undo.');
}
setCollectionHook(() => { SEL.item = null; if (PROPS) PROPS.m.close('done'); renderAll(); layoutAll(); renderTransitionExtras(); });

/* ───────────── multiview (OBS View → Multiview) ───────────── */
function openMultiview() {
  const tiles = coll.scenes.map(sc => '<button type="button" class="mv-tile" data-mv="' + sc.id + '" title="Click: ' + (coll.studio ? 'load into Preview' : 'switch to this scene') + ' · double-click: ' + (coll.studio ? 'send to Program' : 'switch with a cut') + '"><canvas></canvas><span>' + esc(sc.name) + '</span></button>').join('');
  const m = modal({ title: 'Multiview', wide: true, body: '<div class="mv-top"><div class="mv-big"><canvas id="mvPrev"></canvas><span>Preview</span></div><div class="mv-big"><canvas id="mvProg"></canvas><span>Program</span></div></div><div class="mv-grid">' + tiles + '</div><p class="hint">Green border = Preview, red border = Program (being recorded).</p>', foot: '<button type="button" class="btn" id="mvFull">' + ic('full') + 'Full screen</button><button type="button" class="btn primary" data-x>Close</button>', onClose: () => { live = false; } });
  m.el.classList.add('mv-modal');
  let live = true, last = 0;
  const draw = now => {
    if (!live) return;
    if (now - last > 90) {
      last = now;
      const W = coll.canvas.w, H = coll.canvas.h;
      const paint = (cv, sc) => { const r = cv.getBoundingClientRect(); const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.width * H / W)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); renderScene(x, sc, w / W, 0); };
      paint($('#mvPrev', m.el), sceneById(coll.studio ? coll.preview : coll.program));
      const pc = $('#mvProg', m.el), r = pc.getBoundingClientRect(), w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.width * H / W));
      if (pc.width !== w || pc.height !== h) { pc.width = w; pc.height = h; }
      pc.getContext('2d').drawImage(progCanvas, 0, 0, w, h);
      $$('.mv-tile', m.el).forEach(b => { paint($('canvas', b), sceneById(b.dataset.mv)); b.classList.toggle('pv', b.dataset.mv === (coll.studio ? coll.preview : '')); b.classList.toggle('pg', b.dataset.mv === coll.program); });
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  m.el.addEventListener('click', e => { const b = e.target.closest('[data-mv]'); if (b) selectScene(b.dataset.mv); });
  m.el.addEventListener('dblclick', e => { const b = e.target.closest('[data-mv]'); if (!b) return; if (coll.studio) { coll.preview = b.dataset.mv; doTransition(); } else goProgram(b.dataset.mv, { cut: true }); renderAll(); });
  $('#mvFull', m.el).addEventListener('click', () => { const el = m.el; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); });
}

/* ───────────── scene collections (OBS Scene Collection menu) ───────────── */
function collIndex() {
  let ix = LS.get('collections', null);
  if (!ix || !Array.isArray(ix.list) || !ix.list.length) { ix = { list: [{ id: 'main', name: 'Untitled' }], current: 'main' }; LS.set('collections', ix); }
  if (!ix.list.some(c => c.id === ix.current)) ix.current = ix.list[0].id;
  return ix;
}
function currentCollName() { const ix = collIndex(); return (ix.list.find(c => c.id === ix.current) || {}).name || 'Untitled'; }
function switchCollection(id, fresh) {
  if (REC.state !== 'idle' || RB.on) { toast('Stop recording and the Replay Buffer first.'); return; }
  const ix = collIndex();
  LS.set('coll.' + ix.current, coll);
  ix.current = id; LS.set('collections', ix);
  const next = fresh ? null : LS.get('coll.' + id, null);
  if (next) LS.set('collection', next); else { try { localStorage.removeItem('ibisr.collection'); } catch (e) {} }
  location.reload();
}
function openCollections() {
  const draw = () => {
    const ix = collIndex();
    return '<p class="hint">A scene collection is a complete set of scenes and sources — e.g. one for “Tutorials”, one for “Product videos”. Switching reloads the app.</p><div class="rec-list">' +
      ix.list.map(c => '<div class="rec-item"><div class="ri-main"><b>' + esc(c.name) + '</b><small>' + (c.id === ix.current ? 'In use now' : '') + '</small></div><div class="ri-btns">' +
        (c.id === ix.current ? '' : '<button type="button" class="btn sm primary" data-cl="use" data-id="' + c.id + '">Switch to it</button>') +
        '<button type="button" class="btn sm" data-cl="ren" data-id="' + c.id + '">Rename</button>' +
        '<button type="button" class="btn sm" data-cl="dup" data-id="' + c.id + '">Duplicate</button>' +
        (c.id === ix.current ? '' : '<button type="button" class="ib" data-cl="del" data-id="' + c.id + '" aria-label="Remove ' + esc(c.name) + '" title="Remove">' + ic('trash') + '</button>') + '</div></div>').join('') + '</div>';
  };
  const m = modal({ title: 'Scene Collections', wide: true, body: '<div id="clBody">' + draw() + '</div>', foot: '<button type="button" class="btn" id="clNew">' + ic('plus') + 'New collection</button><span class="spacer"></span><button type="button" class="btn primary" data-x>Close</button>' });
  const redraw = () => { $('#clBody', m.el).innerHTML = draw(); };
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-cl]'); if (!b) return;
    const ix = collIndex(), c = ix.list.find(x => x.id === b.dataset.id); if (!c) return;
    if (b.dataset.cl === 'use') switchCollection(c.id);
    else if (b.dataset.cl === 'ren') { const n = await promptDlg('Rename collection', 'Name', c.name); if (n) { c.name = n.slice(0, 60); LS.set('collections', ix); redraw(); } }
    else if (b.dataset.cl === 'dup') {
      const n = await promptDlg('Duplicate collection', 'Name of the copy', c.name + ' copy'); if (!n) return;
      const id = uid(); LS.set('coll.' + id, c.id === ix.current ? coll : LS.get('coll.' + c.id, null)); ix.list.push({ id, name: n.slice(0, 60) }); LS.set('collections', ix); redraw();
    } else if (b.dataset.cl === 'del') {
      if (!(await confirmDlg('Remove collection', 'Remove <b>' + esc(c.name) + '</b>? Its scenes are deleted from this browser.', 'Remove', true))) return;
      ix.list = ix.list.filter(x => x.id !== c.id); try { localStorage.removeItem('ibisr.coll.' + c.id); } catch (er) {} LS.set('collections', ix); redraw();
    }
  });
  $('#clNew', m.el).addEventListener('click', async () => {
    const n = await promptDlg('New scene collection', 'Name', 'Collection ' + (collIndex().list.length + 1)); if (!n) return;
    const ix = collIndex(), id = uid(); ix.list.push({ id, name: n.slice(0, 60) }); LS.set('collections', ix);
    switchCollection(id, true);
  });
}

/* ───────────── stats (OBS View → Stats) ───────────── */
function gpuName() { try { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'Unknown'; } catch (e) { return 'Unknown'; } }
function openStats() {
  const gpu = gpuName();
  const m = modal({ title: 'Stats', wide: true, body: '<dl class="kv" id="stBody"></dl>', foot: '<button type="button" class="btn" id="stReset">Reset missed frames</button><button type="button" class="btn primary" data-x>Close</button>', onClose: () => clearInterval(t) });
  const paint = () => {
    const mem = performance.memory ? fmtSize(performance.memory.usedJSHeapSize) + ' of ' + fmtSize(performance.memory.jsHeapSizeLimit) : 'Not available';
    const pct = STATS.total ? (STATS.dropped * 100 / STATS.total).toFixed(1) : '0.0';
    const fmt = pickFormat();
    const rows = [['Frame rate', STATS.fps.toFixed(2) + ' / ' + coll.fps + ' FPS'], ['Average render time', STATS.renderMs.toFixed(2) + ' ms (budget ' + (1000 / coll.fps).toFixed(1) + ' ms)'], ['Missed frames (while recording)', STATS.dropped.toLocaleString('en-IN') + ' of ' + STATS.total.toLocaleString('en-IN') + ' (' + pct + '%)'],
      ['Canvas', coll.canvas.w + ' × ' + coll.canvas.h], ['Recording', REC.state === 'idle' ? 'Off' : REC.state + ' · ' + fmtDur(recElapsed()) + ' · ' + fmtSize(REC.bytes) + ' · ' + Math.round(recBitrate()).toLocaleString('en-IN') + ' kb/s'],
      ['Replay Buffer', RB.on ? 'On (' + (S.replaySec || 30) + ' s)' : 'Off'], ['Format', fmt ? fmt.label : 'Not supported'], ['Video bitrate setting', (+S.vkbps || recommendedKbps(coll.canvas.w, coll.canvas.h, coll.fps)) / 1000 + ' Mbps' + (+S.vkbps ? '' : ' (automatic)')],
      ['Audio', AU.ctx ? AU.ctx.sampleRate + ' Hz · ' + AU.ctx.state : 'Not started'], ['Memory used by the app', mem], ['Processor threads', navigator.hardwareConcurrency || '?'], ['Graphics', gpu], ['Browser', browserName()]];
    $('#stBody', m.el).innerHTML = rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
  };
  paint(); const t = setInterval(paint, 1000);
  $('#stReset', m.el).addEventListener('click', () => { STATS.dropped = 0; STATS.total = 0; paint(); });
}

/* ───────────── Help assistant (built-in, answers from the app's own guide; no AI key, no upload) ───────────── */
const KB = [
  { k: 'demo video tutorial watch how to use guide walkthrough', t: 'Watch the demo video', a: 'A 3-minute narrated walkthrough of the whole app: recording, sources, the mixer, scenes, Studio Mode and settings.', act: [['Play the demo video', 'demo']] },
  { k: 'start first recording how record begin screen video', t: 'Start my first recording', a: '<ol><li>Click <b>Start Recording</b> (Controls).</li><li>In the share box choose <b>Entire screen</b>, <b>Window</b> or <b>Chrome tab</b>, tick the audio switch for sound, click <b>Share</b>.</li><li>Allow the microphone if asked. After the countdown you are recording.</li><li>Click <b>Stop Recording</b> — the video saves automatically.</li></ol>', act: [['Start Recording', 'rec']] },
  { k: 'stop save where file saved downloads folder location find recordings list', t: 'Where are my recordings?', a: 'Recordings go to your <b>Downloads</b> folder, or to the folder you chose in <b>Settings → Output → Recording folder</b>. Click <b>Recordings</b> to see the list and play them.', act: [['Open Recordings', 'library'], ['Choose a folder', 'setOutput']] },
  { k: 'black dark blank video picture screen nothing recorded', t: 'My video is black', a: 'The app checks the picture every second. If Windows sends a black picture it switches drawing methods, then warns you with the fix. Most common fix (laptops with two graphics chips): Windows <b>Settings → System → Display → Graphics</b> → Google Chrome → <b>Power saving</b>, then restart Chrome. Also: don’t share a <b>minimised</b> window, and protected video (Netflix, Prime) records black on purpose.' },
  { k: 'part cut off cropped window tab only part visible fit screen', t: 'Only part of a window/tab is visible', a: 'A shared window or tab always re-fits the frame by itself. If a source still looks wrong, right-click it in the preview → <b>Fit to screen</b> (Ctrl+F).' },
  { k: 'hide sharing bar stop sharing chrome bar button visible in video', t: 'Hide Chrome’s “sharing your screen” bar', a: 'Click <b>Hide</b> on Chrome’s bar right after you click Share. Better: share a <b>Window</b> or <b>Chrome tab</b> instead of the entire screen — then the bar and Mini Controls are not in the video at all.' },
  { k: 'window capture single app application only one window', t: 'Record one window only', a: 'Add a source → <b>Window Capture</b>. The share box opens on the Window tab — pick the app. Only that window is recorded.', act: [['Add a source', 'srcAdd']] },
  { k: 'tab chrome tab browser tab website record tab audio', t: 'Record a Chrome tab', a: 'Add a source → <b>Chrome Tab Capture</b>, pick the tab and keep <b>Share tab audio</b> on. The tab is recorded even when you switch to another tab.', act: [['Add a source', 'srcAdd']] },
  { k: 'webcam camera face cam bubble circle round overlay corner', t: 'Add my webcam as a round bubble', a: 'Add a source → <b>Video Capture Device</b>. Then right-click it → <b>Webcam bubble (circle, bottom-right)</b>, or Properties → <b>Make it a circle bubble</b>.', act: [['Add a source', 'srcAdd']] },
  { k: 'microphone mic voice audio not recorded no sound quiet low', t: 'My voice is not recorded / too quiet', a: 'Check the <b>Mic/Aux</b> meter in the Audio Mixer moves when you talk. If it does not: click <b>Start</b> on the Mic source and allow the microphone; pick the right device in its Properties. Too quiet: its ⋯ → Advanced audio → <b>Gain</b> +6 dB, or turn on the <b>Compressor</b>.' },
  { k: 'system sound desktop audio computer sound youtube music pc audio', t: 'Record computer (system) sound', a: 'When sharing the <b>Entire screen</b>, tick <b>Also share system audio</b>. For a Chrome tab keep <b>Share tab audio</b> on. A single window cannot share its own sound in Chrome — use Entire screen or a tab for sound.' },
  { k: 'noise background fan hiss gate suppression echo', t: 'Remove background noise', a: 'Mic Properties: keep <b>Noise suppression</b> on. For more, open its ⋯ → Advanced audio → <b>Noise gate</b> (silences the mic between words).' },
  { k: 'pause resume break', t: 'Pause a recording', a: 'Click <b>Pause Recording</b> (or Ctrl+Alt+P). Click <b>Resume Recording</b> to continue — it stays one file.' },
  { k: 'mini controls floating small window on top other apps', t: 'Control recording while using other apps', a: '<b>Mini Controls</b> opens a small always-on-top window with the timer, Stop, Pause, Screenshot and Mic. It is visible in an entire-screen recording — turn it off in Settings → General, or share a window/tab instead.', act: [['Open Mini Controls', 'mini']] },
  { k: 'scene scenes switch change multiple layouts', t: 'What are scenes?', a: 'A scene is a layout (e.g. “Screen only”, “Screen + webcam”, “Webcam only”). Add scenes with <b>+</b> in the Scenes dock and click a scene to switch with the chosen transition. Ctrl+Alt+1…9 switches by keyboard.', act: [['Add a scene', 'sceneAdd']] },
  { k: 'studio mode preview program transition button', t: 'Studio Mode', a: 'Studio Mode shows <b>Preview</b> (what you edit) beside <b>Program</b> (what is recorded). Click scenes to load them into Preview, then press <b>Transition</b>.', act: [['Toggle Studio Mode', 'studio']] },
  { k: 'transition fade slide cut wipe stinger effect', t: 'Transitions', a: 'Pick a transition in the Scene Transitions dock: Cut, Fade, Fade to Black/Colour, Slide, Swipe, Luma Wipe (8 shapes) or Stinger (your own video). Right-click a scene → <b>Transition override</b> to give one scene its own.' },
  { k: 'text title caption subtitle clock time date', t: 'Add text or a clock', a: 'Add a source → <b>Text</b>. Type <code>{time}</code>, <code>{date}</code> or <code>{datetime}</code> to show a live clock.', act: [['Add a source', 'srcAdd']] },
  { k: 'captions live subtitles speech to text automatic transcribe', t: 'Live captions', a: 'Add a source → <b>Live Captions</b>. It turns your speech into on-screen subtitles in English, Tamil, Hindi and more. Chrome sends the speech to Google to do this.', act: [['Add a source', 'srcAdd']] },
  { k: 'image logo picture photo watermark overlay slideshow', t: 'Add a logo or slideshow', a: 'Add a source → <b>Image</b> for a logo, or <b>Image Slide Show</b> for several pictures with a fade. Drag to place, corner handles to resize.', act: [['Add a source', 'srcAdd']] },
  { k: 'green screen chroma key remove background', t: 'Green screen', a: 'Select the webcam → <b>Filters</b> → <b>Chroma key</b> on. Adjust Similarity until the green disappears. Color Key and Luma Key are there too.' },
  { k: 'move resize position drag size crop rotate flip', t: 'Move, resize, crop a source', a: 'Click a source in the preview, drag to move, drag the corner squares to resize (Shift = free). Right-click → Transform for fit, centre, rotate and flip; Properties → Transform for exact numbers and crop.' },
  { k: 'format mp4 webm mkv quality bitrate resolution size file', t: 'Video format and quality', a: '<b>Settings → Output</b>: MP4 (plays everywhere) is the default; bitrate “Automatic” follows YouTube’s recommendation. <b>Settings → Video</b> sets the size (1080p, 4K, vertical 9:16 for Shorts) and frame rate.', act: [['Open Output settings', 'setOutput']] },
  { k: 'vertical shorts reels 9:16 portrait instagram youtube shorts', t: 'Vertical video for Shorts/Reels', a: '<b>Settings → Video</b> → Canvas = <b>1080×1920 vertical</b> → Apply. Your sources are re-fitted automatically.', act: [['Open Video settings', 'setVideo']] },
  { k: 'replay buffer last 30 seconds instant replay clip save moment', t: 'Replay Buffer', a: 'Click <b>Start Replay Buffer</b>; the app keeps the last ' + (S.replaySec || 30) + ' seconds. Press <b>Save Replay</b> (Ctrl+Alt+B) to save that moment as a file.', act: [['Start Replay Buffer', 'replay']] },
  { k: 'timer auto stop automatically after minutes schedule', t: 'Stop automatically after N minutes', a: '<b>Settings → Output → Stop recording automatically after</b> — set the minutes (Output Timer).', act: [['Open Output settings', 'setOutput']] },
  { k: 'shortcut hotkey keyboard keys change', t: 'Keyboard shortcuts', a: 'Ctrl+Alt+R start/stop, Ctrl+Alt+P pause, Ctrl+Alt+S screenshot, Ctrl+Alt+B save replay, Ctrl+Z undo. Change them in <b>Settings → Hotkeys</b>.', act: [['Open Hotkeys', 'setHotkeys']] },
  { k: 'undo redo mistake deleted back', t: 'Undo a mistake', a: 'Press <b>Ctrl+Z</b> to undo and <b>Ctrl+Y</b> to redo (also in the ⋮ menu).' },
  { k: 'screenshot picture snapshot png image of screen', t: 'Take a screenshot', a: 'Click <b>Screenshot</b> (or Ctrl+Alt+S). A PNG of the output is saved to your folder or Downloads.' },
  { k: 'install app desktop icon shortcut pwa', t: 'Install as an app', a: 'Click <b>Install</b> at the top right (or ⋮ → Install app). It then opens from your desktop/Start menu in its own window.' },
  { k: 'backup restore move another computer save settings scenes', t: 'Backup and restore', a: '<b>Settings → Backup & Restore</b>: Download backup saves all scenes, sources and settings (with images) in one file; Restore loads it on any computer.', act: [['Open Backup', 'setBackup']] },
  { k: 'collection collections profiles sets different setups', t: 'Scene collections', a: '⋮ → <b>Scene Collections</b> keeps separate sets of scenes (e.g. Tutorials, Product videos) and switches between them.', act: [['Open Scene Collections', 'collections']] },
  { k: 'multiview all scenes grid overview', t: 'Multiview', a: '⋮ → <b>Multiview</b> shows every scene live in a grid; click to switch, double-click to cut.', act: [['Open Multiview', 'multiview']] },
  { k: 'stream live youtube facebook streaming broadcast rtmp', t: 'Can I live stream?', a: 'Not from a browser — live streaming (RTMP) needs a desktop program. Use <b>OBS Studio</b> (installed on this laptop) for live streams; use this app for recordings.' },
  { k: 'virtual camera zoom meet teams webcam output', t: 'Virtual camera for Zoom/Meet?', a: 'A web page cannot create a camera for other apps. Use OBS Studio’s Virtual Camera for that.' },
  { k: 'phone mobile android iphone screen share', t: 'Recording on a phone', a: 'Phones cannot share their screen from a browser. On a phone you can record the camera and microphone; for screen recording use a computer.' },
  { k: 'missed frames lag slow choppy stutter performance cpu', t: 'Video is choppy / missed frames', a: 'Watch <b>Missed frames</b> in the status bar (⋮ → Stats for details). Lower Settings → Video to 1280×720 or 30 FPS, close heavy apps, and turn off chroma key if not needed.', act: [['Open Stats', 'stats']] },
  { k: 'privacy upload server cloud safe data', t: 'Is my recording uploaded?', a: 'No. Everything runs in your browser and recordings are saved only on this computer. (Only Live Captions send speech to Google to turn it into text.)' },
];
const STOP = new Set('a an the to i my me is are do does how can what where why when which of in on for with it this that be it’s its you your please want need'.split(' '));
function kbTokens(s) { return String(s).toLowerCase().replace(/[^a-z0-9:+ ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, '')); }
function kbAnswer(q) {
  const qt = kbTokens(q); if (!qt.length) return null;
  let best = null, bestScore = 0;
  KB.forEach(e => {
    const et = new Set(kbTokens(e.k + ' ' + e.t)); let sc = 0;
    qt.forEach(w => { if (et.has(w)) sc += 2; else if ([...et].some(x => x.length > 3 && (x.startsWith(w) || w.startsWith(x)))) sc += 1; });
    sc = sc / Math.sqrt(qt.length);
    if (sc > bestScore) { bestScore = sc; best = e; }
  });
  return bestScore >= 1.1 ? best : null;
}
const HELP_ACT = {
  rec: () => toggleRecording(), library: () => openLibrary(), srcAdd: () => addSourceDialog(), sceneAdd: () => addScene(), studio: () => setStudio(!coll.studio),
  mini: () => openMini(), replay: () => toggleReplay(), stats: () => openStats(), multiview: () => openMultiview(), collections: () => openCollections(),
  demo: () => openDemo(), setOutput: () => openSettings('output'), setVideo: () => openSettings('video'), setHotkeys: () => openSettings('hotkeys'), setBackup: () => openSettings('backup'),
};
const HELP = (() => {
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'help-fab'; fab.id = 'helpFab'; fab.setAttribute('aria-label', 'Help assistant'); fab.title = 'Help assistant (F1)';
  fab.innerHTML = ic('help') + '<span class="pip" hidden>0</span>';
  const panel = document.createElement('section');
  panel.className = 'help-panel'; panel.id = 'helpPanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Help assistant');
  panel.innerHTML = '<div class="hp-h">' + ic('help') + '<b>Help assistant</b><span class="spacer"></span>' +
    '<button type="button" class="ib" data-hp="again" title="Start again — clear this chat" aria-label="Start again">↻</button>' +
    '<button type="button" class="ib" data-hp="min" title="Minimise — keep this chat and come back to it" aria-label="Minimise"><svg class="ic"><use href="#i-down"/></svg></button>' +
    '<button type="button" class="ib" data-hp="close" title="Close — end this chat" aria-label="Close">' + ic('close') + '</button></div>' +
    '<div class="hp-log" id="hpLog" aria-live="polite"></div>' +
    '<form class="hp-f" id="hpForm"><input type="text" id="hpIn" placeholder="Ask how to…" autocomplete="off" aria-label="Your question"><button type="submit" class="btn primary">Send</button></form>';
  document.body.appendChild(fab); document.body.appendChild(panel);
  const log = $('#hpLog', panel); let unread = 0, started = false;
  const pip = $('.pip', fab);
  const setPip = () => { pip.hidden = !unread; pip.textContent = unread; fab.title = unread ? 'Back to your help chat — ' + unread + ' answer' + (unread > 1 ? 's' : '') : 'Help assistant (F1)'; };
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function bubble(html, who) { const d = document.createElement('div'); d.className = 'hp-msg ' + who; d.innerHTML = html; log.appendChild(d); scroll(); if (who === 'bot' && panel.hidden) { unread++; setPip(); } return d; }
  function chips(list) { return '<div class="hp-chips">' + list.map(e => '<button type="button" class="hp-chip" data-q="' + esc(e.t) + '">' + esc(e.t) + '</button>').join('') + '</div>'; }
  function greet() {
    bubble('Hello! I can help you use <b>IBI Screen Recorder Studio</b>. Ask a question, or pick a topic:' + chips(KB.slice(0, 6)), 'bot');
  }
  function answer(q) {
    bubble(esc(q), 'me');
    const e = kbAnswer(q);
    if (e) bubble('<b>' + esc(e.t) + '</b><div>' + e.a + '</div>' + (e.act ? '<div class="hp-acts">' + e.act.map(a => '<button type="button" class="btn sm" data-hact="' + a[1] + '">' + esc(a[0]) + '</button>').join('') + '</div>' : ''), 'bot');
    else bubble('I’m not sure about that one. These topics may help:' + chips(KB.slice(6, 14)) + '<div class="hp-acts"><button type="button" class="btn sm" data-hact="help">Open the full guide</button></div>', 'bot');
  }
  function open() { panel.hidden = false; fab.hidden = true; unread = 0; setPip(); if (!started) { started = true; greet(); } scroll(); setTimeout(() => $('#hpIn', panel).focus({ preventScroll: true }), 30); }
  function minimise() { panel.hidden = true; fab.hidden = false; setPip(); fab.focus({ preventScroll: true }); }
  function clear() { log.innerHTML = ''; unread = 0; started = false; setPip(); }
  fab.addEventListener('click', open);
  panel.addEventListener('click', e => {
    const h = e.target.closest('[data-hp]'), c = e.target.closest('[data-q]'), a = e.target.closest('[data-hact]');
    if (h) { if (h.dataset.hp === 'min') minimise(); else if (h.dataset.hp === 'close') { clear(); minimise(); } else { clear(); started = true; greet(); } }
    if (c) answer(c.dataset.q);
    if (a) { const fn = a.dataset.hact === 'help' ? openHelp : HELP_ACT[a.dataset.hact]; if (fn) { minimise(); fn(); } }
  });
  $('#hpForm', panel).addEventListener('submit', e => { e.preventDefault(); const i = $('#hpIn', panel), v = i.value.trim(); if (!v) return; i.value = ''; answer(v); });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); minimise(); } });   // Esc minimises — never throws the chat away
  return { open, minimise, answer, kb: KB };
})();

/* first visit: a gentle pointer to the assistant */
if (!S.helpSeen) setTimeout(() => { toast('New here? The Help assistant (bottom-right, or F1) answers “how do I…” questions.', '', { label: 'Open', run: () => HELP.open() }); S.helpSeen = true; saveSettings(); }, 2500);

/* demo video (v2.1): the narrated walkthrough, played inside the app */
function openDemo() {
  const m = modal({ title: 'Demo video — how to use IBI Screen Recorder Studio', wide: true, body: '<video class="player" controls autoplay playsinline preload="metadata" poster="demo/poster.jpg" src="demo/en.mp4"></video><p class="note">About 3 minutes, with narration and captions. Use the speed button in the player (⋮) to watch faster.</p>', foot: '<button type="button" class="btn primary" data-x>Close</button>', onClose: () => { const v = $('video', m.el); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } } });
  $('video', m.el).addEventListener('error', () => toast('The demo video could not be loaded — check the internet connection.', 'err'));
}
