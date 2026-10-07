'use strict';
/* IBI Screen Recorder Studio — UI: docks, preview editing, dialogs, settings, install, backup, hotkeys, mini controls. */

const ic = n => '<svg class="ic"><use href="#i-' + n + '"/></svg>';
const SEL = { item: null };                       // selected scene-item id in the scene being edited
const isPhone = () => matchMedia('(max-width: 700px)').matches;
const typing = el => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
const LIVE_TYPES = ['display', 'webcam', 'mic'];
function audioCapable(s) { return s.type === 'mic' || s.type === 'media' || (s.type === 'display' && s.settings.audio); }

/* ───────────── dialogs & menus ───────────── */
function modal(o) {
  const root = $('#modalRoot'), prevFocus = document.activeElement;
  const scrim = document.createElement('div'); scrim.className = 'modal-scrim';
  scrim.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">' +
    '<div class="modal-h"><h2>' + esc(o.title) + '</h2><button type="button" class="ib" data-x aria-label="Close" title="Close">' + ic('close') + '</button></div>' +
    (o.tabs ? '<div class="tabs" role="tablist">' + o.tabs.map((t, i) => '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (i === (o.tabIndex || 0)) + '">' + esc(t[1]) + '</button>').join('') + '</div>' : '') +
    '<div class="modal-b">' + (o.body || '') + '</div>' + (o.foot ? '<div class="modal-f">' + o.foot + '</div>' : '') + '</div>';
  root.appendChild(scrim);
  const el = scrim.firstElementChild; let closed = false, downOnScrim = false;
  const m = { el, body: $('.modal-b', el), closed: () => closed };
  m.close = v => {
    if (closed) return; closed = true; scrim.remove(); document.removeEventListener('keydown', onKey, true);
    if (o.onClose) o.onClose(v);
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) try { prevFocus.focus({ preventScroll: true }); } catch (e) {}
  };
  const dismiss = () => (o.onDismiss ? o.onDismiss() : m.close());
  const onKey = e => { if (e.key === 'Escape' && root.lastElementChild === scrim && !$('.menu')) { e.preventDefault(); e.stopPropagation(); dismiss(); } };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('pointerdown', e => { downOnScrim = e.target === scrim; });
  scrim.addEventListener('click', e => { if (e.target === scrim && downOnScrim) dismiss(); });
  $$('[data-x]', el).forEach(b => b.addEventListener('click', dismiss));
  if (o.tabs) {
    const show = (id, silent) => { $$('.tabs [data-tab]', el).forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id))); $$('.tab-pane', el).forEach(p => { p.hidden = p.dataset.pane !== id; }); m.body.scrollTop = 0; if (o.onTab && !silent) o.onTab(id); };
    $$('.tabs [data-tab]', el).forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
    m.showTab = show; show(o.tabs[o.tabIndex || 0][0], true);   // the caller fills the first tab itself
  }
  setTimeout(() => { if (closed) return; const f = o.focus ? $(o.focus, el) : el.querySelector('.modal-b input:not([type=hidden]):not([disabled]):not([type=checkbox]):not([type=range]), .modal-b textarea, .modal-f .btn.primary'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} }, 40);
  return m;
}
function confirmDlg(title, html, okLabel, danger) {
  return new Promise(res => {
    const m = modal({ title, body: '<p>' + html + '</p>', foot: '<button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + esc(okLabel || 'OK') + '</button>', onClose: v => res(!!v), focus: '[data-ok]' });
    $('[data-no]', m.el).addEventListener('click', () => m.close(false));
    $('[data-ok]', m.el).addEventListener('click', () => m.close(true));
  });
}
function promptDlg(title, label, value) {
  return new Promise(res => {
    const m = modal({ title, body: '<label class="field"><span>' + esc(label) + '</span><input type="text" class="inp" maxlength="80" value="' + esc(value || '') + '"></label>', foot: '<button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn primary" data-ok>OK</button>', onClose: v => res(v == null ? null : v) });
    const inp = $('input', m.el);
    const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); toast('Please type a name.'); return; } m.close(v); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    setTimeout(() => inp.select(), 60);
    $('[data-no]', m.el).addEventListener('click', () => m.close(null));
    $('[data-ok]', m.el).addEventListener('click', ok);
  });
}
function closeMenu() { $$('.menu, .menu-scrim').forEach(x => x.remove()); }
function openMenu(at, items) {
  closeMenu();
  const scrim = document.createElement('div'); scrim.className = 'menu-scrim';
  const mu = document.createElement('div'); mu.className = 'menu'; mu.setAttribute('role', 'menu');
  items.filter(Boolean).forEach(it => {
    if (it.sep) { mu.appendChild(document.createElement('hr')); return; }
    if (it.header) { const h = document.createElement('div'); h.className = 'm-hd'; h.textContent = it.header; mu.appendChild(h); return; }
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    if (it.danger) b.className = 'danger';
    b.disabled = !!it.disabled;
    b.innerHTML = (it.icon ? ic(it.icon) : '<span style="width:18px;flex:0 0 auto"></span>') + '<span>' + esc(it.label) + '</span>' + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '');
    b.addEventListener('click', () => { closeMenu(); it.run(); });
    mu.appendChild(b);
  });
  scrim.addEventListener('pointerdown', e => { e.preventDefault(); closeMenu(); });
  scrim.addEventListener('contextmenu', e => { e.preventDefault(); closeMenu(); });
  document.body.appendChild(scrim); document.body.appendChild(mu);
  let x, y;
  if (at && at.getBoundingClientRect) { const r = at.getBoundingClientRect(); x = r.right - mu.offsetWidth; y = r.bottom + 4; if (y + mu.offsetHeight > innerHeight - 8) y = r.top - mu.offsetHeight - 4; }
  else { x = at.x; y = at.y; }
  x = clamp(x, 8, innerWidth - mu.offsetWidth - 8); y = clamp(y, 8, Math.max(8, innerHeight - mu.offsetHeight - 8));
  mu.style.left = x + 'px'; mu.style.top = y + 'px';
  const btns = $$('button:not(:disabled)', mu); if (btns[0]) btns[0].focus({ preventScroll: true });
  mu.addEventListener('keydown', e => {
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); }
  });
}
function autoSize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 600) + 'px'; }

/* ───────────── stage layout ───────────── */
const STG = {
  prog: { stage: $('#stageProg'), canvas: progCanvas, ov: $('#ovProg'), dom: $('#domProg') },
  prev: { stage: $('#stagePrev'), canvas: prevCanvas, ov: $('#ovPrev'), dom: $('#domPrev') },
};
const editStage = () => coll.studio ? STG.prev : STG.prog;
function layoutStage(g) {
  if (!g.stage.offsetParent && !document.fullscreenElement) return;
  const r = g.stage.getBoundingClientRect(), W = coll.canvas.w, H = coll.canvas.h;
  if (r.width < 2 || r.height < 2) return;
  const k = Math.min(r.width / W, r.height / H), cw = Math.max(1, Math.floor(W * k)), ch = Math.max(1, Math.floor(H * k));
  const left = Math.floor((r.width - cw) / 2), top = Math.floor((r.height - ch) / 2);
  [g.canvas, g.ov, g.dom].forEach(el => { el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.width = cw + 'px'; el.style.height = ch + 'px'; });
  const dpr = window.devicePixelRatio || 1;
  g.ov.width = Math.round(cw * dpr); g.ov.height = Math.round(ch * dpr);
  g.cssW = cw; g.cssH = ch;
}
function layoutAll() {
  document.documentElement.style.setProperty('--ar', coll.canvas.w + ' / ' + coll.canvas.h);
  layoutStage(STG.prog); if (coll.studio) layoutStage(STG.prev);
  rebuildPlaceholders();
}
const ro = new ResizeObserver(() => layoutAll());
ro.observe(STG.prog.stage); ro.observe(STG.prev.stage);
document.addEventListener('fullscreenchange', () => setTimeout(layoutAll, 60));

/* placeholders for sources that are not running (shown on screen only — never recorded) */
function rebuildPlaceholders() {
  STG.prog.dom.innerHTML = ''; STG.prev.dom.innerHTML = '';
  const g = editStage(), sc = editScene(); if (!sc || !g.cssW) return;
  const k = g.cssW / coll.canvas.w;
  sc.items.forEach(it => {
    const s = coll.sources[it.sourceId]; if (!s || !it.visible || !SOURCE_TYPES[s.type].video) return;
    const rt = rtOf(s.id);
    const needsFile = (s.type === 'image' || s.type === 'media') && rt.status !== 'live';
    const needsStart = (s.type === 'display' || s.type === 'webcam') && rt.status !== 'live';
    if (!needsFile && !needsStart) return;
    const b = itemBox(it), d = document.createElement('div');
    d.className = 'ph';
    d.style.left = Math.round(b.x * k) + 'px'; d.style.top = Math.round(b.y * k) + 'px'; d.style.width = Math.round(b.w * k) + 'px'; d.style.height = Math.round(b.h * k) + 'px';
    const big = b.w * k > 170 && b.h * k > 90;
    const msg = rt.status === 'starting' ? 'Starting…' : (rt.err || (needsFile ? 'No file chosen' : s.type === 'display' ? 'Not sharing yet' : 'Camera is off'));
    d.innerHTML = (big ? ic(SOURCE_TYPES[s.type].icon) + '<b>' + esc(s.name) + '</b><small>' + esc(msg) + '</small>' : '') +
      (rt.status === 'starting' ? '' : '<button type="button" class="btn sm primary" data-ph="' + s.id + '">' + (needsFile ? 'Choose file' : s.type === 'display' ? 'Start capture' : 'Start camera') + '</button>');
    g.dom.appendChild(d);
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ph]'); if (!b) return;
  const s = coll.sources[b.dataset.ph]; if (!s) return;
  if (s.type === 'image' || s.type === 'media') openProps(s.id, 'props'); else startSource(s.id);
});

/* ───────────── scenes dock ───────────── */
function renderScenes() {
  const ul = $('#sceneList'), cur = editSceneId();
  ul.innerHTML = coll.scenes.map(sc => '<li role="option" tabindex="-1" data-scene="' + sc.id + '" class="' + (sc.id === cur ? 'sel' : '') + (coll.studio && sc.id === coll.program ? ' prog' : '') + '" aria-selected="' + (sc.id === cur) + '" title="' + (coll.studio && sc.id === coll.program ? 'On Program (being recorded)' : '') + '"><span class="nm">' + esc(sc.name) + '</span><button type="button" class="ib" data-scene-more aria-label="Scene options">' + ic('dots') + '</button></li>').join('');
}
function selectScene(id) {
  if (!sceneById(id)) return;
  if (coll.studio) { coll.preview = id; saveColl(); }
  else goProgram(id);
  SEL.item = null; renderAll();
}
$('#sceneList').addEventListener('click', e => {
  const li = e.target.closest('[data-scene]'); if (!li) return;
  if (e.target.closest('[data-scene-more]')) { sceneMenu(li.dataset.scene, e.target.closest('button')); return; }
  selectScene(li.dataset.scene);
});
$('#sceneList').addEventListener('dblclick', e => {
  const li = e.target.closest('[data-scene]'); if (!li || e.target.closest('button')) return;
  if (coll.studio) { coll.preview = li.dataset.scene; doTransition(); } else renameScene(li.dataset.scene);
});
$('#sceneList').addEventListener('contextmenu', e => { const li = e.target.closest('[data-scene]'); if (!li) return; e.preventDefault(); sceneMenu(li.dataset.scene, { x: e.clientX, y: e.clientY }); });
$('#sceneList').addEventListener('keydown', e => {
  const i = coll.scenes.findIndex(s => s.id === editSceneId());
  if (e.key === 'ArrowDown' && coll.scenes[i + 1]) { e.preventDefault(); selectScene(coll.scenes[i + 1].id); focusSceneRow(); }
  else if (e.key === 'ArrowUp' && coll.scenes[i - 1]) { e.preventDefault(); selectScene(coll.scenes[i - 1].id); focusSceneRow(); }
  else if (e.key === 'F2') { e.preventDefault(); renameScene(editSceneId()); }
  else if (e.key === 'Delete') { e.preventDefault(); removeScene(editSceneId()); }
});
function focusSceneRow() { const li = $('#sceneList li.sel'); if (li) li.focus(); }
function sceneMenu(id, at) {
  const i = coll.scenes.findIndex(s => s.id === id);
  openMenu(at, [
    coll.studio ? { label: 'Send to Program', icon: 'arrow', run: () => { coll.preview = id; doTransition(); } } : null,
    { label: 'Rename', icon: 'text', hint: 'F2', run: () => renameScene(id) },
    { label: 'Duplicate', icon: 'copy', run: () => duplicateScene(id) },
    { label: 'Move up', icon: 'up', disabled: i === 0, run: () => moveScene(id, -1) },
    { label: 'Move down', icon: 'down', disabled: i === coll.scenes.length - 1, run: () => moveScene(id, 1) },
    { sep: true },
    { label: 'Remove', icon: 'trash', danger: true, disabled: coll.scenes.length < 2, run: () => removeScene(id) },
  ]);
}
async function addScene() {
  const name = await promptDlg('Add Scene', 'Scene name', uniqueSceneName('Scene ' + (coll.scenes.length + 1)));
  if (!name) return;
  const sc = { id: uid(), name: uniqueSceneName(name), items: [] };
  const i = coll.scenes.findIndex(s => s.id === editSceneId());
  coll.scenes.splice(i + 1, 0, sc); saveColl(); selectScene(sc.id);
}
async function renameScene(id) {
  const sc = sceneById(id); if (!sc) return;
  const name = await promptDlg('Rename Scene', 'Scene name', sc.name);
  if (!name || name === sc.name) return;
  sc.name = coll.scenes.some(s => s !== sc && s.name.toLowerCase() === name.toLowerCase()) ? uniqueSceneName(name) : name;
  saveColl(); renderAll();
}
async function duplicateScene(id) {
  const sc = sceneById(id); if (!sc) return;
  const name = await promptDlg('Duplicate Scene', 'Name of the copy', uniqueSceneName(sc.name + ' copy'));
  if (!name) return;
  const copy = { id: uid(), name: uniqueSceneName(name), items: sc.items.map(it => Object.assign(clone(it), { id: uid() })) };
  coll.scenes.splice(coll.scenes.indexOf(sc) + 1, 0, copy); saveColl(); selectScene(copy.id);
}
async function removeScene(id) {
  const sc = sceneById(id); if (!sc) return;
  if (coll.scenes.length < 2) { toast('A collection needs at least one scene.'); return; }
  if (!(await confirmDlg('Remove Scene', 'Remove the scene <b>' + esc(sc.name) + '</b>? Sources used only in this scene are removed too.', 'Remove', true))) return;
  const i = coll.scenes.indexOf(sc); coll.scenes.splice(i, 1);
  const next = coll.scenes[Math.max(0, i - 1)].id;
  if (coll.program === id) { coll.program = next; TR.active = false; }
  if (coll.preview === id) coll.preview = next;
  gcSources(); updateGates(0); saveColl(); SEL.item = null; renderAll();
}
function moveScene(id, d) {
  const i = coll.scenes.findIndex(s => s.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= coll.scenes.length) return;
  const [sc] = coll.scenes.splice(i, 1); coll.scenes.splice(j, 0, sc); saveColl(); renderScenes();
}
function gcSources() {
  const used = new Set(); coll.scenes.forEach(sc => sc.items.forEach(it => used.add(it.sourceId)));
  Object.keys(coll.sources).forEach(id => { if (!used.has(id)) { stopSource(id); RT.delete(id); delete coll.sources[id]; idb.del('blobs', id); } });
}

/* ───────────── sources dock ───────────── */
const selItem = () => { const sc = editScene(); return sc && sc.items.find(it => it.id === SEL.item) || null; };
function selectItem(id) { SEL.item = id; renderSources(); renderCtxbar(); }
function renderSources() {
  const ul = $('#sourceList'), sc = editScene();
  if (!sc || !sc.items.length) { ul.innerHTML = '<li class="empty">No sources yet. Click <b>+</b> below to add your screen, camera, microphone, an image or text.</li>'; return; }
  ul.innerHTML = sc.items.map(it => {
    const s = coll.sources[it.sourceId], T = SOURCE_TYPES[s.type], rt = rtOf(s.id);
    const live = LIVE_TYPES.includes(s.type) || s.type === 'image' || s.type === 'media';
    const needs = live && rt.status !== 'live' && rt.status !== 'starting';
    return '<li role="option" tabindex="-1" draggable="true" data-item="' + it.id + '" class="' + (it.id === SEL.item ? 'sel' : '') + (it.visible ? '' : ' hid') + '" aria-selected="' + (it.id === SEL.item) + '" title="' + esc(T.label + (rt.err ? ' — ' + rt.err : '')) + '">' +
      ic(T.icon) + (live ? '<span class="st-dot ' + rt.status + '" aria-label="' + rt.status + '"></span>' : '') +
      '<span class="nm">' + esc(s.name) + '</span>' +
      (rt.warn ? '<button type="button" class="ib warn" data-row="warn" aria-label="Problem with ' + esc(s.name) + '" title="Black picture — click for the fix">' + ic('warn') + '</button>' : '') +
      (needs ? '<button type="button" class="btn sm" data-row="start">' + ((s.type === 'image' || s.type === 'media') ? 'File' : 'Start') + '</button>' : '') +
      '<button type="button" class="ib ' + (it.visible ? '' : 'off') + '" data-row="vis" aria-label="' + (it.visible ? 'Hide' : 'Show') + ' ' + esc(s.name) + '" title="' + (it.visible ? 'Hide' : 'Show') + '">' + ic(it.visible ? 'eye' : 'eyeoff') + '</button>' +
      '<button type="button" class="ib ' + (it.locked ? 'on' : 'off') + '" data-row="lock" aria-label="' + (it.locked ? 'Unlock' : 'Lock') + ' ' + esc(s.name) + '" title="' + (it.locked ? 'Unlock' : 'Lock') + '">' + ic(it.locked ? 'lock' : 'unlock') + '</button>' +
      '<button type="button" class="ib" data-row="more" aria-label="Options for ' + esc(s.name) + '">' + ic('dots') + '</button></li>';
  }).join('');
}
$('#sourceList').addEventListener('click', e => {
  const li = e.target.closest('[data-item]'); if (!li) return;
  const it = editScene().items.find(x => x.id === li.dataset.item); if (!it) return;
  const b = e.target.closest('[data-row]');
  if (!b) { selectItem(it.id); return; }
  const s = coll.sources[it.sourceId];
  if (b.dataset.row === 'vis') { it.visible = !it.visible; updateGates(0); saveColl(); renderSources(); renderMixer(true); rebuildPlaceholders(); }
  else if (b.dataset.row === 'warn') { healthDialog(s, 'black'); }
  else if (b.dataset.row === 'lock') { it.locked = !it.locked; saveColl(); renderSources(); }
  else if (b.dataset.row === 'start') { selectItem(it.id); if (s.type === 'image' || s.type === 'media') openProps(s.id, 'props'); else startSource(s.id); }
  else if (b.dataset.row === 'more') { selectItem(it.id); itemMenu(it, b); }
});
$('#sourceList').addEventListener('dblclick', e => { const li = e.target.closest('[data-item]'); if (!li || e.target.closest('button')) return; const it = editScene().items.find(x => x.id === li.dataset.item); if (it) openProps(it.sourceId, 'props'); });
$('#sourceList').addEventListener('contextmenu', e => { const li = e.target.closest('[data-item]'); if (!li) return; e.preventDefault(); const it = editScene().items.find(x => x.id === li.dataset.item); if (it) { selectItem(it.id); itemMenu(it, { x: e.clientX, y: e.clientY }); } });
$('#sourceList').addEventListener('keydown', e => {
  const sc = editScene(), i = sc.items.findIndex(x => x.id === SEL.item);
  if (e.key === 'ArrowDown' && sc.items[i + 1]) { e.preventDefault(); selectItem(sc.items[i + 1].id); focusSrcRow(); }
  else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); selectItem(sc.items[i - 1].id); focusSrcRow(); }
  else if (e.key === 'F2' && i >= 0) { e.preventDefault(); renameSource(sc.items[i].sourceId); }
  else if ((e.key === 'Delete') && i >= 0) { e.preventDefault(); removeItem(sc.items[i]); }
  else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); openProps(sc.items[i].sourceId, 'props'); }
});
function focusSrcRow() { const li = $('#sourceList li.sel'); if (li) li.focus(); }
// drag to reorder (desktop)
let dragItemId = null;
$('#sourceList').addEventListener('dragstart', e => { const li = e.target.closest('[data-item]'); if (!li) return; dragItemId = li.dataset.item; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragItemId); } catch (er) {} });
$('#sourceList').addEventListener('dragover', e => {
  const li = e.target.closest('[data-item]'); if (!li || !dragItemId) return; e.preventDefault();
  $$('#sourceList li').forEach(x => x.classList.remove('drop-above', 'drop-below'));
  const r = li.getBoundingClientRect(); li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
});
$('#sourceList').addEventListener('drop', e => {
  const li = e.target.closest('[data-item]'); if (!li || !dragItemId) return; e.preventDefault();
  const sc = editScene(), from = sc.items.findIndex(x => x.id === dragItemId); if (from < 0) return;
  const above = li.classList.contains('drop-above'); const [it] = sc.items.splice(from, 1);
  let to = sc.items.findIndex(x => x.id === li.dataset.item); if (to < 0) to = sc.items.length; else if (!above) to++;
  sc.items.splice(to, 0, it); dragItemId = null; saveColl(); renderSources();
});
$('#sourceList').addEventListener('dragend', () => { dragItemId = null; $$('#sourceList li').forEach(x => x.classList.remove('drop-above', 'drop-below')); });

function moveItem(it, how) {
  const sc = editScene(), i = sc.items.indexOf(it); if (i < 0) return;
  sc.items.splice(i, 1);
  const j = how === 'top' ? 0 : how === 'bottom' ? sc.items.length : clamp(i + (how === 'up' ? -1 : 1), 0, sc.items.length);
  sc.items.splice(j, 0, it); saveColl(); renderSources();
}
async function removeItem(it) {
  const s = coll.sources[it.sourceId];
  if (!(await confirmDlg('Remove Source', 'Remove <b>' + esc(s.name) + '</b> from this scene?', 'Remove', true))) return;
  const sc = editScene(); sc.items = sc.items.filter(x => x !== it);
  if (SEL.item === it.id) SEL.item = null;
  gcSources(); updateGates(0); saveColl(); renderAll();
}
async function renameSource(id) {
  const s = coll.sources[id]; if (!s) return;
  const name = await promptDlg('Rename Source', 'Source name', s.name);
  if (!name || name === s.name) return;
  s.name = Object.values(coll.sources).some(x => x !== s && x.name.toLowerCase() === name.toLowerCase()) ? uniqueSourceName(name) : name;
  saveColl(); renderAll();
}
function webcamBubble(it) {
  const s = coll.sources[it.sourceId], n = natSize(s);
  s.filters.shape = 'circle';
  it.crop = n.w > n.h ? { l: Math.floor((n.w - n.h) / 2), r: Math.ceil((n.w - n.h) / 2), t: 0, b: 0 } : { t: Math.floor((n.h - n.w) / 2), b: Math.ceil((n.h - n.w) / 2), l: 0, r: 0 };
  it.rot = 0; transformItem(it, 'corner'); saveColl(); rebuildPlaceholders();
}
function itemMenu(it, at) {
  const s = coll.sources[it.sourceId], rt = rtOf(s.id), T = SOURCE_TYPES[s.type], sc = editScene(), i = sc.items.indexOf(it);
  const tf = m => () => { transformItem(it, m); saveColl(); rebuildPlaceholders(); };
  openMenu(at, [
    { label: 'Properties', icon: 'gear', hint: 'Enter', run: () => openProps(s.id, 'props') },
    T.video ? { label: 'Filters', icon: 'filter', run: () => openProps(s.id, 'filters') } : null,
    LIVE_TYPES.includes(s.type) ? (rt.status === 'live' ? { label: s.type === 'display' ? 'Stop capture' : 'Turn off', icon: 'stop', run: () => stopSource(s.id) } : { label: s.type === 'display' ? 'Start capture' : 'Turn on', icon: 'play', run: () => startSource(s.id) }) : null,
    s.type === 'display' && rt.status === 'live' ? { label: 'Change what is shared…', icon: 'monitor', run: () => restartSource(s.id) } : null,
    s.type === 'media' && rt.video ? { label: rt.video.paused ? 'Play' : 'Pause', icon: rt.video.paused ? 'play' : 'pause', run: () => mediaControl(s.id, 'toggle') } : null,
    s.type === 'media' && rt.video ? { label: 'Restart', icon: 'arrow', run: () => mediaControl(s.id, 'restart') } : null,
    { label: 'Rename', icon: 'text', hint: 'F2', run: () => renameSource(s.id) },
    T.video ? { header: 'Transform' } : null,
    T.video ? { label: 'Fit to screen', icon: 'full', hint: 'Ctrl+F', run: tf('fit') } : null,
    T.video ? { label: 'Stretch to screen', icon: 'full', run: tf('stretch') } : null,
    T.video ? { label: 'Center to screen', icon: 'monitor', hint: 'Ctrl+D', run: tf('center') } : null,
    T.video ? { label: 'Rotate 90° clockwise', icon: 'arrow', run: tf('rotR') } : null,
    T.video ? { label: 'Rotate 90° anticlockwise', icon: 'arrow', run: tf('rotL') } : null,
    T.video ? { label: 'Flip horizontal', icon: 'layout', run: tf('flipH') } : null,
    T.video ? { label: 'Flip vertical', icon: 'layout', run: tf('flipV') } : null,
    T.video ? { label: 'Reset transform', icon: 'close', hint: 'Ctrl+R', run: tf('reset') } : null,
    s.type === 'webcam' ? { label: 'Webcam bubble (circle, bottom-right)', icon: 'webcam', run: () => webcamBubble(it) } : null,
    { header: 'Order' },
    { label: 'Move to top', icon: 'up', disabled: i === 0, run: () => moveItem(it, 'top') },
    { label: 'Move up', icon: 'up', disabled: i === 0, run: () => moveItem(it, 'up') },
    { label: 'Move down', icon: 'down', disabled: i === sc.items.length - 1, run: () => moveItem(it, 'down') },
    { label: 'Move to bottom', icon: 'down', disabled: i === sc.items.length - 1, run: () => moveItem(it, 'bottom') },
    { sep: true },
    { label: it.visible ? 'Hide' : 'Show', icon: it.visible ? 'eyeoff' : 'eye', run: () => { it.visible = !it.visible; updateGates(0); saveColl(); renderAll(); } },
    { label: it.locked ? 'Unlock' : 'Lock', icon: it.locked ? 'unlock' : 'lock', run: () => { it.locked = !it.locked; saveColl(); renderSources(); } },
    { label: 'Remove', icon: 'trash', danger: true, hint: 'Del', run: () => removeItem(it) },
  ]);
}

/* add source: pick a type, then "create new" or "add existing" (the OBS flow) */
function addSourceDialog() {
  const m = modal({
    title: 'Add Source', wide: true,
    body: '<div class="type-grid">' + Object.keys(SOURCE_TYPES).map(t => {
      const T = SOURCE_TYPES[t], off = (t === 'display' && !CAN.display) || ((t === 'webcam' || t === 'mic') && !CAN.media);
      return '<button type="button" data-type="' + t + '"' + (off ? ' disabled' : '') + '>' + ic(T.icon) + '<span><b>' + esc(T.label) + '</b><small>' + esc(off ? (t === 'display' ? 'Phones and tablets cannot share the screen from a browser — use a computer.' : 'Not available in this browser.') : T.desc) + '</small></span></button>';
    }).join('') + '</div>',
  });
  $$('[data-type]', m.el).forEach(b => b.addEventListener('click', () => { m.close(); createSourceDialog(b.dataset.type); }));
}
function createSourceDialog(type) {
  const T = SOURCE_TYPES[type], sc = editScene();
  const existing = Object.values(coll.sources).filter(s => s.type === type && !sc.items.some(it => it.sourceId === s.id));
  const m = modal({
    title: 'Create / Select Source — ' + T.label,
    body: '<label class="check"><input type="radio" name="mode" value="new" checked> Create new</label>' +
      '<label class="field"><span>Name</span><input type="text" class="inp" id="csName" maxlength="80" value="' + esc(uniqueSourceName(type === 'mic' ? 'Mic/Aux' : type === 'webcam' ? 'Camera' : T.label)) + '"></label>' +
      (existing.length ? '<label class="check"><input type="radio" name="mode" value="old"> Add existing (the same source, shared with its other scenes)</label><label class="field"><span>Existing source</span><select id="csOld">' + existing.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select></label>' : '') +
      '<label class="check"><input type="checkbox" id="csVis" checked> Make source visible</label>' +
      (type === 'display' ? '<p class="note">After OK, choose the screen, window or tab to share. For sound: tick <b>Also share system audio</b> (Entire screen) or <b>Also share tab audio</b> (a Chrome tab).</p>' : ''),
    foot: '<button type="button" class="btn" data-x>Cancel</button><button type="button" class="btn primary" id="csOk">OK</button>',
  });
  const nameIn = $('#csName', m.el);
  nameIn.addEventListener('focus', () => { const r = $('input[value=new]', m.el); if (r) r.checked = true; });
  const oldSel = $('#csOld', m.el); if (oldSel) oldSel.addEventListener('focus', () => { $('input[value=old]', m.el).checked = true; });
  const ok = () => {
    const mode = ($('input[name=mode]:checked', m.el) || {}).value, vis = $('#csVis', m.el).checked;
    let s, it;
    if (mode === 'old' && oldSel) {
      s = coll.sources[oldSel.value];
      const tpl = coll.scenes.map(x => x.items.find(i => i.sourceId === s.id)).find(Boolean);
      it = makeItem(s.id, tpl ? { x: tpl.x, y: tpl.y, sx: tpl.sx, sy: tpl.sy, rot: tpl.rot, flipH: tpl.flipH, flipV: tpl.flipV, crop: clone(tpl.crop) } : { fit: 'fit' });
    } else {
      const nm = nameIn.value.trim(); if (!nm) { nameIn.focus(); toast('Please type a name.'); return; }
      s = makeSource(type, uniqueSourceName(nm)); coll.sources[s.id] = s;
      const hasVisual = sc.items.some(x => SOURCE_TYPES[coll.sources[x.sourceId].type].video);
      const fit = type === 'display' || type === 'media' ? 'fit' : type === 'webcam' ? (hasVisual ? 'corner' : 'fit') : type === 'image' ? 'fitIfLarge' : false;
      it = makeItem(s.id, { fit });
    }
    it.visible = vis;
    if (type === 'color') sc.items.push(it); else sc.items.unshift(it);
    if (type === 'text') transformItem(it, 'center');
    if (type === 'color') rtOf(s.id).status = 'live';
    if (type === 'text') rtOf(s.id).status = 'live';
    m.close(); SEL.item = it.id; saveColl(); updateGates(0); renderAll();
    if (mode !== 'old') {
      if (type === 'display' || type === 'webcam' || type === 'mic') startSource(s.id).then(okd => { if (okd && type !== 'display') openProps(s.id, 'props'); });
      else openProps(s.id, 'props');
    }
  };
  $('#csOk', m.el).addEventListener('click', ok);
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
}

/* ───────────── context bar ───────────── */
function renderCtxbar() {
  const it = selItem(), s = it && coll.sources[it.sourceId];
  $('#selName').textContent = s ? s.name : 'No source selected';
  $('#cbProps').disabled = !s; $('#cbFilters').disabled = !(s && SOURCE_TYPES[s.type].video);
  const cap = $('#cbCapture');
  if (s && LIVE_TYPES.includes(s.type)) {
    const live = rtOf(s.id).status === 'live';
    cap.hidden = false; cap.innerHTML = ic(live ? 'stop' : 'play') + '<span>' + (live ? (s.type === 'display' ? 'Stop capture' : 'Turn off') : (s.type === 'display' ? 'Start capture' : 'Turn on')) + '</span>';
  } else cap.hidden = true;
}

/* ───────────── audio mixer ───────────── */
let mixKey = '';
const faderToDb = p => p <= 0 ? -100 : 60 * (p / 1000 - 1);
const dbToFader = db => db <= -100 ? 0 : clamp(Math.round((db / 60 + 1) * 1000), 0, 1000);
function mixerSources() {
  const ids = [], add = sc => { if (sc) sc.items.forEach(it => { const s = coll.sources[it.sourceId]; if (s && audioCapable(s) && !ids.includes(s.id)) ids.push(s.id); }); };
  add(sceneById(coll.program)); if (coll.studio) add(sceneById(coll.preview));
  return ids.map(id => coll.sources[id]);
}
function renderMixer(force) {
  const box = $('#mixer'), all = mixerSources(), shown = all.filter(s => !s.audio.hidden);
  box.className = 'dock-b mixer ' + (S.mixerLayout === 'horizontal' ? 'horizontal' : 'vertical');
  $('#mixHidden').textContent = (all.length - shown.length) + ' hidden';
  const key = S.mixerLayout + '|' + shown.map(s => s.id + s.name + rtOf(s.id).status).join(',');
  if (key !== mixKey || force) {
    mixKey = key;
    box.innerHTML = shown.length ? shown.map(s => {
      const off = rtOf(s.id).status !== 'live';
      return '<div class="strip" data-src="' + s.id + '"><div class="s-name" title="' + esc(s.name + (off ? ' (not running)' : '')) + '">' + esc(s.name) + (off ? ' ⏸' : '') + '</div><div class="s-db"></div>' +
        '<div class="s-body"><canvas class="meter" aria-hidden="true"></canvas><input type="range" class="fader" min="0" max="1000" step="1" aria-label="Volume of ' + esc(s.name) + '"></div>' +
        '<div class="s-btns"><button type="button" class="ib" data-mx="mute"></button><button type="button" class="ib" data-mx="mon"></button><button type="button" class="ib" data-mx="more" aria-label="Audio options for ' + esc(s.name) + '" title="Options">' + ic('dots') + '</button></div></div>';
    }).join('') : '<div class="empty">No audio sources in this scene. Add an <b>Audio Input Capture</b> (microphone), or a Display Capture with sound.</div>';
  }
  shown.forEach(s => syncStrip(s));
}
function syncStrip(s) {
  const el = $('.strip[data-src="' + s.id + '"]'); if (!el) return;
  const au = s.audio;
  el.classList.toggle('muted', !!au.muted);
  $('.s-db', el).textContent = fmtDb(au.volDb);
  const f = $('.fader', el); if (document.activeElement !== f) f.value = dbToFader(au.volDb);
  f.setAttribute('aria-valuetext', fmtDb(au.volDb));
  const mb = $('[data-mx=mute]', el); mb.innerHTML = ic(au.muted ? 'volx' : 'vol'); mb.className = 'ib ' + (au.muted ? 'warn' : ''); mb.title = au.muted ? 'Unmute' : 'Mute'; mb.setAttribute('aria-label', (au.muted ? 'Unmute ' : 'Mute ') + s.name); mb.setAttribute('aria-pressed', String(!!au.muted));
  const hb = $('[data-mx=mon]', el); hb.innerHTML = ic('head'); hb.className = 'ib ' + (au.monitor ? 'on' : 'off'); hb.title = au.monitor ? 'Monitoring ON — you hear it on this computer (click to turn off)' : 'Monitoring off — click to listen on this computer'; hb.setAttribute('aria-label', 'Monitor ' + s.name); hb.setAttribute('aria-pressed', String(!!au.monitor));
}
$('#mixer').addEventListener('input', e => {
  const f = e.target.closest('.fader'); if (!f) return;
  const s = coll.sources[f.closest('.strip').dataset.src]; if (!s) return;
  s.audio.volDb = Math.round(faderToDb(+f.value) * 10) / 10; applyAudio(s.id); syncStrip(s); saveColl(); syncMini();
});
$('#mixer').addEventListener('dblclick', e => { const f = e.target.closest('.fader'); if (!f) return; const s = coll.sources[f.closest('.strip').dataset.src]; s.audio.volDb = 0; applyAudio(s.id); f.blur(); syncStrip(s); saveColl(); });
$('#mixer').addEventListener('click', e => {
  const b = e.target.closest('[data-mx]'); if (!b) return;
  const s = coll.sources[b.closest('.strip').dataset.src]; if (!s) return;
  if (b.dataset.mx === 'mute') toggleMute(s.id);
  else if (b.dataset.mx === 'mon') { s.audio.monitor = !s.audio.monitor; applyAudio(s.id); syncStrip(s); saveColl(); if (s.audio.monitor) toast('Monitoring ' + s.name + ' — use headphones to avoid echo.'); }
  else stripMenu(s, b);
});
function toggleMute(id) { const s = coll.sources[id]; if (!s) return; s.audio.muted = !s.audio.muted; applyAudio(id); syncStrip(s); saveColl(); syncMini(); }
function stripMenu(s, at) {
  const rt = rtOf(s.id);
  openMenu(at, [
    { label: s.audio.muted ? 'Unmute' : 'Mute', icon: s.audio.muted ? 'vol' : 'volx', run: () => toggleMute(s.id) },
    { label: 'Advanced audio (gain, mono, monitoring)', icon: 'gear', run: () => openProps(s.id, 'audio') },
    { label: 'Properties', icon: 'gear', run: () => openProps(s.id, 'props') },
    LIVE_TYPES.includes(s.type) && rt.status !== 'live' ? { label: 'Start', icon: 'play', run: () => startSource(s.id) } : null,
    { label: 'Rename', icon: 'text', run: () => renameSource(s.id) },
    { label: 'Reset volume to 0 dB', icon: 'vol', run: () => { s.audio.volDb = 0; applyAudio(s.id); syncStrip(s); saveColl(); } },
    { label: 'Hide from mixer', icon: 'eyeoff', run: () => { s.audio.hidden = true; saveColl(); renderMixer(true); } },
  ]);
}
function mixerMenu(at) {
  const hidden = mixerSources().filter(s => s.audio.hidden);
  openMenu(at, [
    { label: 'Show all hidden (' + hidden.length + ')', icon: 'eye', disabled: !hidden.length, run: () => { hidden.forEach(s => { s.audio.hidden = false; }); saveColl(); renderMixer(true); } },
    { label: 'Vertical layout', icon: 'layout', disabled: S.mixerLayout !== 'horizontal', run: () => { S.mixerLayout = 'vertical'; saveSettings(); renderMixer(true); } },
    { label: 'Horizontal layout', icon: 'layout', disabled: S.mixerLayout === 'horizontal', run: () => { S.mixerLayout = 'horizontal'; saveSettings(); renderMixer(true); } },
  ]);
}
let meterColors = null;
function readMeterColors() { const cs = getComputedStyle(document.documentElement); meterColors = ['--m-g', '--m-y', '--m-r', '--m-g0', '--m-y0', '--m-r0', '--panel'].map(v => cs.getPropertyValue(v).trim() || '#888'); }
function drawMeters() {
  if (!meterColors) readMeterColors();
  const [g, y, r, g0, y0, r0, bgc] = meterColors;
  $$('#mixer .strip').forEach(el => {
    const s = coll.sources[el.dataset.src], rt = RT.get(el.dataset.src), cv = $('canvas.meter', el); if (!s || !cv) return;
    const lv = rt && rt.au ? meterRead(rt) : [-100, -100], hold = rt && rt.hold ? rt.hold : [-100, -100];
    const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const x = cv.getContext('2d'); x.fillStyle = bgc; x.fillRect(0, 0, W, H);
    const vert = H > W, frac = db => clamp((db + 60) / 60, 0, 1), zones = [[-60, -20, g, g0], [-20, -9, y, y0], [-9, 0, r, r0]];
    for (let c = 0; c < 2; c++) {
      const level = frac(s.audio.muted ? -100 : lv[c]), pk = frac(s.audio.muted ? -100 : hold[c]);
      zones.forEach(([a, b, on, off]) => {
        const fa = frac(a), fb = frac(b), lit = clamp(level, fa, fb);
        if (vert) {
          const bw = (W - 2 * dpr) / 2, bx = c * (bw + 2 * dpr);
          x.fillStyle = off; x.fillRect(bx, H - fb * H, bw, (fb - fa) * H);
          if (lit > fa) { x.fillStyle = on; x.fillRect(bx, H - lit * H, bw, (lit - fa) * H); }
        } else {
          const bh = (H - 2 * dpr) / 2, by = c * (bh + 2 * dpr);
          x.fillStyle = off; x.fillRect(fa * W, by, (fb - fa) * W, bh);
          if (lit > fa) { x.fillStyle = on; x.fillRect(fa * W, by, (lit - fa) * W, bh); }
        }
      });
      if (pk > 0.01) {
        x.fillStyle = pk > frac(-9) ? r : pk > frac(-20) ? y : g;
        if (vert) { const bw = (W - 2 * dpr) / 2; x.fillRect(c * (bw + 2 * dpr), H - pk * H, bw, 2 * dpr); }
        else { const bh = (H - 2 * dpr) / 2; x.fillRect(pk * W - 2 * dpr, c * (bh + 2 * dpr), 2 * dpr, bh); }
      }
    }
  });
}

/* ───────────── transitions dock ───────────── */
function renderTransitions() {
  $('#trType').value = coll.transition.type; $('#trMs').value = coll.transition.ms;
  $('#trMs').disabled = coll.transition.type === 'cut';
}
$('#trType').addEventListener('change', e => { coll.transition.type = TRANSITIONS[e.target.value] ? e.target.value : 'fade'; saveColl(); renderTransitions(); });
$('#trMs').addEventListener('change', e => { coll.transition.ms = clamp(Math.round(+e.target.value || 300), 50, 20000); e.target.value = coll.transition.ms; saveColl(); });
function doTransition() {
  if (!coll.studio) return;
  if (coll.preview === coll.program) { toast('Preview and Program already show the same scene.'); return; }
  goProgram(coll.preview); renderAll();
}
setTransitionEndHook(() => { renderScenes(); });

/* ───────────── studio mode ───────────── */
function setStudio(on) {
  coll.studio = !!on;
  if (on) coll.preview = coll.program;
  $('#wrapPrev').hidden = !on; $('#studioMid').hidden = !on; $('#progLab').hidden = !on;
  STG.prog.ov.classList.toggle('passive', on);
  $('#trHint').textContent = on ? 'Clicking a scene loads it into Preview. The Transition button sends it to Program (what is recorded).' : 'Used when you click a scene, and by the Transition button in Studio Mode.';
  SEL.item = null; saveColl(); renderAll();
  requestAnimationFrame(layoutAll);
}

/* ───────────── controls & recording flow ───────────── */
async function startSceneSources(sceneId) {
  const sc = sceneById(sceneId); if (!sc) return;
  const need = sc.items.filter(it => it.visible).map(it => coll.sources[it.sourceId]).filter(s => s && LIVE_TYPES.includes(s.type) && rtOf(s.id).status !== 'live');
  for (const s of need.filter(s => s.type === 'display')) await startSource(s.id);   // the screen picker needs the click — first
  await Promise.all(need.filter(s => s.type !== 'display').map(s => startSource(s.id, { quiet: false })));
}
let cdState = null;
function countdown(n) {
  return new Promise(res => {
    const box = $('#countdown'), num = $('#cdNum'); let left = n;
    box.hidden = false; num.textContent = left;
    const t = setInterval(() => { left--; if (left <= 0) { finish(true); } else num.textContent = left; }, 1000);
    const finish = v => { clearInterval(t); box.hidden = true; cdState = null; res(v); };
    cdState = { cancel: () => finish(false) };
  });
}
async function startRecordingFlow() {
  if (REC.state !== 'idle') return;
  if (!supportedFormats().length) { toast('This browser cannot record video. Please use Chrome or Edge.', 'err'); return; }
  REC.state = 'starting'; renderControls();
  try {
    ac(); resumeAudio();
    if (FOLDER.handle && !(await folderReady(true))) toast('No permission for the “' + FOLDER.name + '” folder — this recording goes to Downloads.', 'err');
    if (S.autoStart) await startSceneSources(coll.program);
    const prog = sceneById(coll.program);
    const offDisplay = prog.items.filter(it => it.visible && coll.sources[it.sourceId].type === 'display' && rtOf(it.sourceId).status !== 'live');
    if (offDisplay.length && !(await confirmDlg('Screen is not shared', 'Display Capture is not running, so your screen will not be in the recording. Record anyway?', 'Record anyway'))) { REC.state = 'idle'; renderControls(); return; }
    if (S.miniOnRecord && CAN.docPip && !MINI.win && navigator.userActivation && navigator.userActivation.isActive) await openMini(true);
    if (+S.countdown > 0 && !(await countdown(+S.countdown))) { REC.state = 'idle'; renderControls(); toast('Recording cancelled.'); return; }
    REC.state = 'idle';
    STATS.dropped = 0; STATS.total = 0;
    await beginRecording();
    toast('Recording started' + (REC.out ? ' — saving to “' + FOLDER.name + '”.' : '.'), 'ok');
  } catch (e) {
    REC.state = 'idle'; renderControls(); toast('Could not start recording: ' + e.message, 'err');
  }
}
async function stopRecordingFlow() {
  if (REC.state !== 'recording' && REC.state !== 'paused') return;
  if (S.confirmStop && !(await confirmDlg('Stop Recording', 'Stop the recording now?', 'Stop recording', true))) return;
  const e = await stopRecording();
  if (!e) return;
  if (e.error) return;
  verifyRecording(e);
  toast((e.where === 'folder' ? 'Saved in “' + e.folder + '”: ' : 'Saved to Downloads: ') + e.name + ' (' + fmtSize(e.size) + ', ' + fmtDur(e.ms) + ')', 'ok', { label: 'Recordings', run: openLibrary });
}
function toggleRecording() { if (REC.state === 'recording' || REC.state === 'paused') stopRecordingFlow(); else if (REC.state === 'idle') startRecordingFlow(); }
function renderControls() {
  const st = REC.state, on = st === 'recording' || st === 'paused';
  const rb = $('#btnRec');
  rb.classList.toggle('on', on); rb.disabled = st === 'starting' || st === 'stopping';
  rb.querySelector('use').setAttribute('href', on ? '#i-stop' : '#i-rec');
  $('#btnRecLab').textContent = st === 'starting' ? 'Starting…' : st === 'stopping' ? 'Saving…' : on ? 'Stop Recording' : 'Start Recording';
  const pb = $('#btnPause');
  pb.disabled = !on; pb.classList.toggle('paused', st === 'paused');
  pb.querySelector('use').setAttribute('href', st === 'paused' ? '#i-play' : '#i-pause');
  $('#btnPauseLab').textContent = st === 'paused' ? 'Resume Recording' : 'Pause Recording';
  $('#btnStudio').setAttribute('aria-pressed', String(!!coll.studio));
  const mb = $('#btnMini'); mb.hidden = !CAN.docPip; mb.setAttribute('aria-pressed', String(!!MINI.win));
  $('#recPill').hidden = !on; $('#recPill').classList.toggle('paused', st === 'paused');
  document.title = on ? (st === 'paused' ? '⏸ ' : '● ') + 'REC — ' + APP_NAME : APP_NAME;
  syncMini();
}
setRecHook(() => { renderControls(); statusTick(); });

/* ───────────── health warnings (v1.1) ───────────── */
let healthOpen = null;
function healthDialog(s, kind) {
  if (healthOpen && !healthOpen.closed()) { if (healthOpen.kind === kind && healthOpen.src === s.id) return; healthOpen.close(); }   // a newer problem replaces the old dialog
  const rec = REC.state === 'recording' || REC.state === 'paused';
  const isCam = s.type === 'webcam';
  let title, body, foot;
  if (kind === 'stopped') {
    title = 'Screen sharing stopped';
    body = '<p><b>' + esc(s.name) + '</b> stopped sharing (Chrome’s <b>Stop sharing</b> button, or the shared window was closed).</p><p>The recording is still running, but from now on it shows <b>no screen</b>.</p>';
    foot = '<button type="button" class="btn" data-h="keep">Keep recording</button><button type="button" class="btn danger" data-h="stop">Stop recording</button><button type="button" class="btn primary" data-h="share">Share screen again</button>';
  } else {
    title = isCam ? 'The camera picture is black' : 'Your screen is coming through black';
    body = isCam
      ? '<p>The camera is on, but it is sending a black picture.</p><ol><li>Open the camera’s <b>privacy shutter</b> or remove the lens cover.</li><li>Close other apps that use the camera (Zoom, Teams, the Camera app).</li><li>Click <b>Restart camera</b>.</li></ol>'
      : '<p>Screen sharing is running, but Windows is sending a <b>black picture</b>' + (rec ? ', so the recording is black too' : '') + '. The app has already tried its second drawing method.</p>' +
        '<p><b>Most common fix — laptops with two graphics chips</b> (the same issue OBS has):</p><ol><li>Open Windows <b>Settings</b> → <b>System</b> → <b>Display</b> → <b>Graphics</b>.</li><li>Find <b>Google Chrome</b> (or Microsoft Edge) in the list and click it → <b>Options</b>.</li><li>Choose <b>Power saving</b>, click <b>Save</b>.</li><li>Close Chrome completely, open it again, then click <b>Share screen again</b> here.</li></ol>' +
        '<p><b>Other causes:</b> you shared a window that is <b>minimised</b> (restore it); or the screen is playing <b>protected video</b> (Netflix, Prime Video, Hotstar show black on purpose). In the share picker, <b>Entire screen</b> is the safest choice.</p>';
    foot = (rec ? '<button type="button" class="btn danger" data-h="stop">Stop recording</button>' : '') + '<button type="button" class="btn" data-h="close">Close</button><button type="button" class="btn primary" data-h="share">' + (isCam ? 'Restart camera' : 'Share screen again') + '</button>';
  }
  healthOpen = modal({ title, body, foot }); healthOpen.kind = kind; healthOpen.src = s.id;
  healthOpen.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    const a = b.dataset.h; healthOpen.close();
    if (a === 'share') { await restartSource(s.id); }
    else if (a === 'stop') stopRecordingFlow();
  });
}
setHealthHook((s, kind) => {
  if (kind === 'black') toast(s.name + ': the picture is black.', 'err', { label: 'Fix', run: () => healthDialog(s, 'black') });
  healthDialog(s, kind);
});
// After saving, look inside the file: three frames, all black → say so at once instead of leaving it to be found later.
async function verifyRecording(e) {
  let url = LIB.urls.get(e.id), temp = false;
  try {
    if (!url && e.where === 'folder' && FOLDER.handle) { const fh = await FOLDER.handle.getFileHandle(e.name); url = URL.createObjectURL(await fh.getFile()); temp = true; }
    if (!url) return;
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 8000); });
    const D = isFinite(v.duration) && v.duration > 0 ? v.duration : e.ms / 1000;
    let bright = 0, checked = 0;
    for (const f of [0.2, 0.5, 0.8]) {
      v.currentTime = D * f;
      await new Promise((res, rej) => { v.onseeked = res; setTimeout(rej, 5000); });
      const st = lumaStats(v, 0, 0, v.videoWidth || 1, v.videoHeight || 1); checked++;
      if (st && st.max >= 20) bright++;
    }
    const sc = sceneById(coll.program), hasVisual = sc && sc.items.some(i => i.visible && isVisual(i));
    if (checked && !bright && hasVisual) {
      const srcs = sc.items.map(i => coll.sources[i.sourceId]);
      const d = srcs.find(x => x.type === 'display') || srcs.find(x => x.type === 'webcam');
      toast('Warning: “' + e.name + '” looks completely black.', 'err', { label: 'Why?', run: () => { if (d) healthDialog(d, 'black'); else openHelp(); } });
      const rec = LIB.list.find(x => x.id === e.id); if (rec) { rec.black = true; LS.set('library', LIB.list); }
    }
  } catch (er) { /* not decodable here (e.g. MKV in some browsers) — nothing to report */ }
  finally { if (temp && url) URL.revokeObjectURL(url); }
}

/* ───────────── status bar ───────────── */
function statusTick() {
  const on = REC.state === 'recording' || REC.state === 'paused';
  const t = fmtDur(recElapsed());
  $('#stRecTime').textContent = REC.state === 'paused' ? t + ' (paused)' : t;
  $('#stRec').classList.toggle('recording', on);
  $('#recPillTime').textContent = REC.state === 'paused' ? 'PAUSED ' + t : t;
  $('#stSize').textContent = fmtSize(REC.bytes) + ' · ' + Math.round(on ? recBitrate() : 0).toLocaleString('en-IN') + ' kb/s';
  $('#stDest').textContent = 'Saves to: ' + (FOLDER.handle ? FOLDER.name : 'Downloads');
  const pct = STATS.total ? STATS.dropped * 100 / STATS.total : 0, dr = $('#stDrop');
  dr.textContent = 'Missed frames: ' + STATS.dropped.toLocaleString('en-IN') + ' (' + pct.toFixed(1) + '%)'; dr.classList.toggle('bad', pct > 1);
  $('#stRender').textContent = 'Render: ' + STATS.renderMs.toFixed(1) + ' ms';
  const fp = $('#stFps'); fp.textContent = STATS.fps.toFixed(2) + ' / ' + coll.fps.toFixed(2) + ' FPS'; fp.classList.toggle('bad', STATS.fps < coll.fps * 0.9);
  $('#stClock').textContent = fmtDate(new Date());
  syncMini();
}

/* ───────────── preview editing (select, move, resize, snap) ───────────── */
const DRAG = { mode: null, item: null, start: null, box: null, h: null, snapX: null, snapY: null, moved: false };
let hoverId = null, longPressT = 0;
function toCanvasPt(g, e) { const r = g.ov.getBoundingClientRect(); return { x: (e.clientX - r.left) * coll.canvas.w / r.width, y: (e.clientY - r.top) * coll.canvas.h / r.height, k: coll.canvas.w / r.width }; }
function hitItem(p) {
  const sc = editScene(); if (!sc) return null;
  for (const it of sc.items) {
    if (!it.visible || !isVisual(it)) continue;
    const b = itemBox(it);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return it;
  }
  return null;
}
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function handlePos(b, h) { return { x: b.x + (h.includes('w') ? 0 : h.includes('e') ? b.w : b.w / 2), y: b.y + (h.includes('n') ? 0 : h.includes('s') ? b.h : b.h / 2) }; }
function hitHandle(it, p, tol) { const b = itemBox(it); for (const h of HANDLES) { const q = handlePos(b, h); if (Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol) return h; } return null; }
const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
function bindOverlay(g, isEdit) {
  const ov = g.ov;
  ov.addEventListener('pointerdown', e => {
    if (!isEdit()) return;
    if (e.button === 2) return;
    try { ov.focus({ preventScroll: true }); } catch (er) {}
    const p = toCanvasPt(g, e), tol = (e.pointerType === 'touch' ? 20 : 9) * p.k;
    const sel = selItem();
    let h = sel && sel.visible && !sel.locked && isVisual(sel) ? hitHandle(sel, p, tol) : null;
    let it = h ? sel : hitItem(p);
    if (!h && sel && sel.visible && isVisual(sel)) { const b = itemBox(sel); if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) it = sel; }   // keep dragging the selected one when items overlap
    if (!it) { selectItem(null); return; }
    if (SEL.item !== it.id) selectItem(it.id);
    if (e.pointerType === 'touch') { clearTimeout(longPressT); const cx = e.clientX, cy = e.clientY; longPressT = setTimeout(() => { if (!DRAG.moved) { DRAG.mode = null; itemMenu(it, { x: cx, y: cy }); } }, 600); }
    if (it.locked) return;
    DRAG.mode = h ? 'resize' : 'move'; DRAG.h = h; DRAG.item = it; DRAG.start = p; DRAG.box = itemBox(it); DRAG.moved = false;
    DRAG.orig = { x: it.x, y: it.y, sx: it.sx, sy: it.sy };
    try { ov.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
  });
  ov.addEventListener('pointermove', e => {
    if (!isEdit()) return;
    const p = toCanvasPt(g, e);
    if (!DRAG.mode) {
      const sel = selItem(), tol = 9 * p.k;
      const h = sel && sel.visible && !sel.locked && isVisual(sel) ? hitHandle(sel, p, tol) : null;
      const it = hitItem(p); hoverId = it ? it.id : null;
      ov.style.cursor = h ? CURSORS[h] : it && !it.locked ? 'move' : 'default';
      return;
    }
    const dx = p.x - DRAG.start.x, dy = p.y - DRAG.start.y;
    if (!DRAG.moved && Math.hypot(dx, dy) < 3 * p.k) return;
    DRAG.moved = true; clearTimeout(longPressT);
    const it = DRAG.item, b = DRAG.box, W = coll.canvas.w, H = coll.canvas.h, snapD = S.snap && !e.altKey ? 10 * p.k : 0;
    DRAG.snapX = DRAG.snapY = null;
    if (DRAG.mode === 'move') {
      let nx = b.x + dx, ny = b.y + dy;
      if (snapD) {
        for (const [edge, off] of [[0, 0], [W / 2, b.w / 2], [W, b.w]]) { if (Math.abs(nx + off - edge) < snapD) { nx = edge - off; DRAG.snapX = edge; break; } }
        for (const [edge, off] of [[0, 0], [H / 2, b.h / 2], [H, b.h]]) { if (Math.abs(ny + off - edge) < snapD) { ny = edge - off; DRAG.snapY = edge; break; } }
      }
      it.x = Math.round(nx); it.y = Math.round(ny);
    } else {
      const h = DRAG.h, min = 8;
      let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
      if (h.includes('w')) x1 = Math.min(x2 - min, b.x + dx);
      if (h.includes('e')) x2 = Math.max(x1 + min, b.x + b.w + dx);
      if (h.includes('n')) y1 = Math.min(y2 - min, b.y + dy);
      if (h.includes('s')) y2 = Math.max(y1 + min, b.y + b.h + dy);
      if (snapD) {
        const sn = (v, edges) => { for (const ed of edges) if (Math.abs(v - ed) < snapD) return ed; return v; };
        if (h.includes('w')) x1 = sn(x1, [0, W / 2]); if (h.includes('e')) x2 = sn(x2, [W, W / 2]);
        if (h.includes('n')) y1 = sn(y1, [0, H / 2]); if (h.includes('s')) y2 = sn(y2, [H, H / 2]);
      }
      if (h.length === 2 && !e.shiftKey) {   // corners keep the aspect ratio (Shift = free), like OBS
        const ar = b.w / b.h; let w = x2 - x1, hh = y2 - y1;
        if (w / b.w > hh / b.h) hh = w / ar; else w = hh * ar;
        if (h.includes('w')) x1 = x2 - w; else x2 = x1 + w;
        if (h.includes('n')) y1 = y2 - hh; else y2 = y1 + hh;
      }
      it.sx = DRAG.orig.sx * (x2 - x1) / b.w; it.sy = DRAG.orig.sy * (y2 - y1) / b.h;
      it.x = Math.round(x1); it.y = Math.round(y1);
    }
    it.fit = false;
    rebuildPlaceholdersSoon();
  });
  const end = () => { clearTimeout(longPressT); if (DRAG.mode && DRAG.moved) { saveColl(); rebuildPlaceholders(); } DRAG.mode = null; DRAG.snapX = DRAG.snapY = null; };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
  ov.addEventListener('pointerleave', () => { hoverId = null; });
  ov.addEventListener('dblclick', e => { if (!isEdit()) return; const it = hitItem(toCanvasPt(g, e)); if (it) openProps(it.sourceId, 'props'); });
  ov.addEventListener('contextmenu', e => {
    e.preventDefault(); if (!isEdit()) return;
    const it = hitItem(toCanvasPt(g, e));
    if (it) { selectItem(it.id); itemMenu(it, { x: e.clientX, y: e.clientY }); }
    else openMenu({ x: e.clientX, y: e.clientY }, [
      { label: 'Add source…', icon: 'plus', run: addSourceDialog },
      { label: 'Fullscreen projector', icon: 'full', run: projector },
      document.pictureInPictureEnabled ? { label: 'Picture-in-picture output', icon: 'pip', run: pipOutput } : null,
      { label: 'Screenshot', icon: 'camera', run: takeScreenshot },
    ]);
  });
  ov.addEventListener('keydown', e => {
    if (!isEdit()) return;
    const it = selItem(); if (!it) return;
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv && !it.locked) { e.preventDefault(); it.x += mv[0]; it.y += mv[1]; saveColl(); rebuildPlaceholdersSoon(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeItem(it); }
    else if (e.key === 'Escape') { selectItem(null); }
    else if (e.key === 'Enter') { e.preventDefault(); openProps(it.sourceId, 'props'); }
  });
}
let phT = 0;
function rebuildPlaceholdersSoon() { if (phT) return; phT = requestAnimationFrame(() => { phT = 0; rebuildPlaceholders(); }); }
bindOverlay(STG.prog, () => !coll.studio);
bindOverlay(STG.prev, () => coll.studio);

function drawOverlays() {
  [STG.prog, STG.prev].forEach(g => {
    if (!g.cssW) return;
    const x = g.ov.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, g.ov.width, g.ov.height);
    if (g !== editStage()) return;
    const sc = editScene(); if (!sc) return;
    const dpr = window.devicePixelRatio || 1, k = g.cssW / coll.canvas.w * dpr;
    const acc = '#35C0ED';
    sc.items.slice().reverse().forEach(it => {
      if (!it.visible || !isVisual(it)) return;
      const s = coll.sources[it.sourceId], rt = rtOf(s.id), b = itemBox(it);
      const X = b.x * k, Y = b.y * k, Wd = b.w * k, Ht = b.h * k;
      const idle = (s.type === 'display' || s.type === 'webcam' || s.type === 'image' || s.type === 'media') && rt.status !== 'live';
      if (idle) { x.save(); x.fillStyle = 'rgba(40,46,58,.55)'; x.fillRect(X, Y, Wd, Ht); x.setLineDash([6 * dpr, 5 * dpr]); x.strokeStyle = 'rgba(200,210,225,.8)'; x.lineWidth = 1.5 * dpr; x.strokeRect(X + .5, Y + .5, Wd - 1, Ht - 1); x.restore(); }
      if (it.id === SEL.item) {
        x.save(); x.strokeStyle = acc; x.lineWidth = 2 * dpr; if (it.locked) x.setLineDash([5 * dpr, 4 * dpr]); x.strokeRect(X, Y, Wd, Ht); x.restore();
        if (!it.locked) { const hs = (isPhone() ? 12 : 8) * dpr; HANDLES.forEach(h => { const q = handlePos(b, h); x.fillStyle = acc; x.fillRect(q.x * k - hs / 2, q.y * k - hs / 2, hs, hs); x.strokeStyle = '#04141b'; x.lineWidth = 1 * dpr; x.strokeRect(q.x * k - hs / 2, q.y * k - hs / 2, hs, hs); }); }
      } else if (it.id === hoverId) { x.save(); x.strokeStyle = 'rgba(53,192,237,.7)'; x.lineWidth = 1 * dpr; x.strokeRect(X, Y, Wd, Ht); x.restore(); }
    });
    if (DRAG.snapX != null || DRAG.snapY != null) {
      x.save(); x.strokeStyle = '#ff4fd8'; x.lineWidth = 1 * dpr; x.setLineDash([4 * dpr, 4 * dpr]);
      if (DRAG.snapX != null) { x.beginPath(); x.moveTo(DRAG.snapX * k, 0); x.lineTo(DRAG.snapX * k, g.ov.height); x.stroke(); }
      if (DRAG.snapY != null) { x.beginPath(); x.moveTo(0, DRAG.snapY * k); x.lineTo(g.ov.width, DRAG.snapY * k); x.stroke(); }
      x.restore();
    }
  });
}
function uiLoop() { try { drawOverlays(); drawMeters(); } catch (e) { console.error(e); } requestAnimationFrame(uiLoop); }

/* ───────────── properties dialog (Properties · Transform · Filters · Audio) ───────────── */
let PROPS = null;
const FLD = {
  num: (k, label, v, o) => '<label class="field"><span>' + esc(label) + '</span><span class="with-unit"><input type="number" data-k="' + k + '" value="' + esc(v) + '"' + (o && o.min != null ? ' min="' + o.min + '"' : '') + (o && o.max != null ? ' max="' + o.max + '"' : '') + ' step="' + ((o && o.step) || 1) + '" inputmode="decimal">' + (o && o.unit ? '<span class="unit">' + esc(o.unit) + '</span>' : '') + '</span></label>',
  range: (k, label, v, min, max, step, unit) => '<label class="field"><span>' + esc(label) + ': <output data-out="' + k + '">' + esc(v) + (unit || '') + '</output></span><input type="range" data-k="' + k + '" data-unit="' + esc(unit || '') + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + esc(v) + '"></label>',
  check: (k, label, v) => '<label class="check"><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '> ' + label + '</label>',
  select: (k, label, v, opts) => '<label class="field"><span>' + esc(label) + '</span><select data-k="' + k + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>',
  color: (k, label, v) => '<label class="field row"><span>' + esc(label) + '</span><input type="color" data-k="' + k + '" value="' + esc(v) + '"></label>',
  text: (k, label, v) => '<label class="field"><span>' + esc(label) + '</span><input type="text" data-k="' + k + '" value="' + esc(v) + '"></label>',
  area: (k, label, v) => '<label class="field"><span>' + esc(label) + '</span><textarea data-k="' + k + '" rows="3">' + esc(v) + '</textarea></label>',
};
const RESTART_KEYS = { display: ['settings.audio', 'settings.cursor'], webcam: ['settings.deviceId', 'settings.res', 'settings.fps', 'settings.facing'], mic: ['settings.deviceId', 'settings.ns', 'settings.ec', 'settings.agc'] };
async function deviceOptions(kind) {
  try { const list = await navigator.mediaDevices.enumerateDevices(); return list.filter(d => d.kind === kind); } catch (e) { return []; }
}
function statusLine(s) {
  const rt = rtOf(s.id);
  if (rt.status === 'live') {
    const res = rt.w ? ' · ' + rt.w + '×' + rt.h : '';
    const what = s.type === 'display' ? ({ monitor: 'Entire screen', window: 'Window', browser: 'Browser tab' }[rt.surface] || 'Shared') : s.type === 'webcam' ? 'Camera on' : 'Microphone on';
    return '<span class="st-dot live" style="display:inline-block"></span> ' + esc(what + (rt.label ? ': ' + rt.label : '') + res) + (s.type === 'display' ? (rt.hasAudio ? ' · with sound' : ' · no sound') : '') +
      (rt.path === 'video' && rt.triedVideo ? ' · compatibility mode' : '') +
      (rt.warn === 'black' ? '<br><span class="note warn">⚠ The picture is black. <button type="button" class="btn sm" data-p="why">Why and how to fix</button></span>' : '');
  }
  return '<span class="st-dot ' + rt.status + '" style="display:inline-block"></span> ' + esc(rt.status === 'starting' ? 'Starting…' : rt.err || 'Not running');
}
async function propsBody(s, it) {
  const st = s.settings, k = 'settings.';
  let h = '';
  if (s.type === 'display') {
    h += '<div class="sect"><p id="pStatus">' + statusLine(s) + '</p><div class="btn-row" id="pCapBtns"></div></div>' +
      FLD.check(k + 'audio', 'Capture audio (the tab’s sound, or Windows system sound when sharing the entire screen)', st.audio) +
      FLD.select(k + 'cursor', 'Mouse cursor', st.cursor, [['always', 'Always show'], ['motion', 'Show only while moving'], ['never', 'Hide']]) +
      '<p class="note">Changes apply the next time capture starts. In the share picker tick <b>Also share system audio</b> (Entire screen) or <b>Also share tab audio</b> (Chrome tab) to record sound. Chrome shows a “sharing” bar — you can hide it; recording continues.</p>';
  } else if (s.type === 'webcam' || s.type === 'mic') {
    const kind = s.type === 'webcam' ? 'videoinput' : 'audioinput', devs = await deviceOptions(kind);
    const labelled = devs.some(d => d.label);
    h += '<div class="sect"><p id="pStatus">' + statusLine(s) + '</p><div class="btn-row" id="pCapBtns"></div></div>';
    h += FLD.select(k + 'deviceId', 'Device', st.deviceId, [['', 'Default' + (s.type === 'webcam' ? ' camera' : ' microphone')]].concat(devs.filter(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => [d.deviceId, d.label || ((s.type === 'webcam' ? 'Camera ' : 'Microphone ') + (i + 1))])));
    if (!labelled) h += '<p class="note">Device names appear after you allow access once (click <b>Turn on</b>).</p>';
    if (s.type === 'webcam') {
      h += '<div class="grid2">' + FLD.select(k + 'res', 'Resolution', st.res, [['', 'Camera default'], ['480', '640×480'], ['720', '1280×720 (HD)'], ['1080', '1920×1080 (Full HD)'], ['1440', '2560×1440'], ['2160', '3840×2160 (4K)']]) +
        FLD.select(k + 'fps', 'Frame rate', st.fps, [[15, '15 FPS'], [24, '24 FPS'], [30, '30 FPS'], [60, '60 FPS']]) + '</div>' +
        FLD.select(k + 'facing', 'Phone camera (when Device is Default)', st.facing, [['user', 'Front (selfie)'], ['environment', 'Back']]) +
        '<div class="btn-row"><button type="button" class="btn" data-p="bubble">' + ic('webcam') + 'Make it a circle bubble (bottom-right)</button></div>';
    } else {
      h += FLD.check(k + 'ns', 'Noise suppression (removes fan and background hiss)', st.ns) + FLD.check(k + 'ec', 'Echo cancellation (use when not wearing headphones)', st.ec) + FLD.check(k + 'agc', 'Automatic gain (levels a soft or loud voice)', st.agc);
    }
  } else if (s.type === 'image' || s.type === 'media') {
    const rt = rtOf(s.id);
    h += '<div class="sect"><p>' + (st.fileName ? 'File: <b>' + esc(st.fileName) + '</b>' : 'No file chosen yet.') + '</p>' +
      (s.type === 'image' && rt.url ? '<img class="thumb" src="' + rt.url + '" alt="">' : '') +
      '<div class="btn-row"><button type="button" class="btn primary" data-p="file">' + ic('folder') + (st.fileName ? 'Choose another file…' : 'Choose file…') + '</button></div>' +
      '<input type="file" id="pFile" hidden accept="' + (s.type === 'image' ? 'image/*' : 'video/*,audio/*') + '"><p class="note">The file is kept in this browser (not uploaded) so the scene still works after a restart.</p></div>';
    if (s.type === 'media') h += FLD.check(k + 'loop', 'Loop', st.loop) + FLD.check(k + 'restart', 'Restart playback when this scene goes to Program', st.restart) +
      '<div class="btn-row"><button type="button" class="btn" data-p="mplay">' + ic('play') + 'Play / Pause</button><button type="button" class="btn" data-p="mrestart">' + ic('arrow') + 'Restart</button></div>';
  } else if (s.type === 'text') {
    h += FLD.area(k + 'text', 'Text', st.text) + '<p class="note">Live tokens: <code>{time}</code> → ' + esc(fmtClock(new Date())) + ' · <code>{date}</code> → ' + esc(DF.format(new Date())) + ' · <code>{datetime}</code> → full date and time.</p>' +
      '<div class="grid2">' + FLD.select(k + 'font', 'Font', st.font, ['Segoe UI', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Courier New', 'Consolas', 'Montserrat', 'Nirmala UI'].map(f => [f, f])) +
      FLD.num(k + 'size', 'Size', st.size, { min: 6, max: 600, unit: 'px' }) + '</div>' +
      FLD.check(k + 'bold', 'Bold', st.bold) + FLD.check(k + 'italic', 'Italic', st.italic) +
      FLD.select(k + 'align', 'Alignment', st.align, [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]) +
      '<div class="grid2">' + FLD.color(k + 'color', 'Colour', st.color) + FLD.color(k + 'outlineColor', 'Outline colour', st.outlineColor) + '</div>' +
      FLD.range(k + 'outlineW', 'Outline width', st.outlineW, 0, 20, 1, ' px') +
      '<div class="grid2">' + FLD.color(k + 'bg', 'Background', st.bg) + '</div>' + FLD.range(k + 'bgOpacity', 'Background opacity', st.bgOpacity, 0, 100, 1, '%');
  } else if (s.type === 'color') {
    h += FLD.color(k + 'color', 'Colour', st.color) + '<div class="grid2">' + FLD.num(k + 'w', 'Width', st.w, { min: 1, max: 7680, unit: 'px' }) + FLD.num(k + 'h', 'Height', st.h, { min: 1, max: 7680, unit: 'px' }) + '</div>' +
      '<div class="btn-row"><button type="button" class="btn" data-p="canvasSize">Use canvas size (' + coll.canvas.w + '×' + coll.canvas.h + ')</button></div>';
  }
  return h;
}
function transformBody(it) {
  const b = itemBox(it);
  return '<div class="grid2">' + FLD.num('item.x', 'Position X', Math.round(it.x), { unit: 'px' }) + FLD.num('item.y', 'Position Y', Math.round(it.y), { unit: 'px' }) +
    FLD.num('box.w', 'Width', Math.round(b.w), { min: 1, unit: 'px' }) + FLD.num('box.h', 'Height', Math.round(b.h), { min: 1, unit: 'px' }) + '</div>' +
    '<div class="btn-row">' + [['fit', 'Fit to screen'], ['stretch', 'Stretch to screen'], ['center', 'Center'], ['rotR', 'Rotate 90° ↻'], ['rotL', 'Rotate 90° ↺'], ['flipH', 'Flip horizontal'], ['flipV', 'Flip vertical'], ['reset', 'Reset']].map(x => '<button type="button" class="btn sm" data-tf="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<h3 class="sect" style="margin:6px 0 8px;font-size:14px">Crop (source pixels)</h3><div class="grid4">' + FLD.num('crop.l', 'Left', it.crop.l, { min: 0 }) + FLD.num('crop.t', 'Top', it.crop.t, { min: 0 }) + FLD.num('crop.r', 'Right', it.crop.r, { min: 0 }) + FLD.num('crop.b', 'Bottom', it.crop.b, { min: 0 }) + '</div>' +
    '<p class="note">Rotation: ' + it.rot + '°. Tip: drag the corner handles in the preview (Shift = free resize, Alt = no snapping); arrow keys nudge 1 px (Shift = 10 px).</p>';
}
function filtersBody(s) {
  const f = s.filters, c = f.chroma, k = 'filters.';
  return '<div class="sect"><h3>Colour correction</h3>' + FLD.range(k + 'opacity', 'Opacity', f.opacity, 0, 100, 1, '%') + FLD.range(k + 'brightness', 'Brightness', f.brightness, 0, 200, 1, '%') + FLD.range(k + 'contrast', 'Contrast', f.contrast, 0, 200, 1, '%') + FLD.range(k + 'saturate', 'Saturation', f.saturate, 0, 200, 1, '%') + FLD.range(k + 'hue', 'Hue shift', f.hue, -180, 180, 1, '°') + FLD.range(k + 'blur', 'Blur', f.blur, 0, 40, 1, ' px') + '</div>' +
    '<div class="sect"><h3>Shape and border</h3>' + FLD.select(k + 'shape', 'Shape', f.shape, [['rect', 'Rectangle'], ['rounded', 'Rounded corners'], ['circle', 'Circle / oval']]) + FLD.range(k + 'radius', 'Corner radius', f.radius, 0, 300, 1, ' px') + FLD.range(k + 'borderW', 'Border width', f.borderW, 0, 40, 1, ' px') + FLD.color(k + 'borderColor', 'Border colour', f.borderColor) + '</div>' +
    '<div class="sect"><h3>Chroma key (green screen)</h3>' + FLD.check('chroma.on', 'Remove a background colour', c.on) +
    FLD.select('chroma.preset', 'Key colour', ['#00ff00', '#0000ff', '#ff00ff'].includes(c.color) ? c.color : 'custom', [['#00ff00', 'Green'], ['#0000ff', 'Blue'], ['#ff00ff', 'Magenta'], ['custom', 'Custom']]) + FLD.color('chroma.color', 'Custom colour', c.color) +
    FLD.range('chroma.similarity', 'Similarity', c.similarity, 1, 1000, 1) + FLD.range('chroma.smoothness', 'Smoothness', c.smoothness, 1, 1000, 1) + FLD.range('chroma.spill', 'Key colour spill reduction', c.spill, 1, 1000, 1) +
    '<p class="note">Chroma key is worked out on the processor — use it on a webcam-sized source.</p></div>' +
    '<div class="btn-row"><button type="button" class="btn" data-p="resetFilters">Reset all filters</button></div>';
}
function audioBody(s) {
  const a = s.audio;
  return FLD.range('audio.fader', 'Volume', dbToFader(a.volDb), 0, 1000, 1).replace(/<output data-out="audio.fader">[^<]*<\/output>/, '<output data-out="audio.fader">' + fmtDb(a.volDb) + '</output>') +
    FLD.check('audio.muted', 'Mute', a.muted) +
    FLD.range('audio.gainDb', 'Gain (boost a quiet microphone)', a.gainDb, -30, 30, 0.5, ' dB') +
    FLD.check('audio.mono', 'Downmix to mono (fixes a voice heard only on one side)', a.mono) +
    FLD.select('audio.monitor', 'Audio monitoring', a.monitor ? '1' : '', [['', 'Monitor off'], ['1', 'Monitor and output (hear it on this computer)']]) +
    '<p class="note">Meters: green is safe, yellow (−20 to −9 dB) is good speech, red (above −9 dB) risks distortion.</p>';
}
async function openProps(sourceId, tab) {
  const s = coll.sources[sourceId]; if (!s) return;
  if (PROPS) PROPS.m.close('done');
  const T = SOURCE_TYPES[s.type], sc = editScene();
  let it = sc && sc.items.find(x => x.sourceId === sourceId);
  const tabs = [['props', 'Properties']];
  if (T.video && it) tabs.push(['transform', 'Transform']);
  if (T.video) tabs.push(['filters', 'Filters']);
  if (T.audio) tabs.push(['audio', 'Audio']);
  const snap = { s: clone({ settings: s.settings, filters: s.filters, audio: s.audio, name: s.name }), it: it ? clone(it) : null };
  let needRestart = false, restartT = 0, fileChanged = false;
  const tabIndex = Math.max(0, tabs.findIndex(t => t[0] === tab));
  const m = modal({
    title: 'Properties for “' + s.name + '”', wide: true, tabs, tabIndex,
    body: tabs.map(t => '<div class="tab-pane" data-pane="' + t[0] + '"></div>').join(''),
    foot: '<button type="button" class="btn" data-cancel>Cancel</button><button type="button" class="btn primary" data-done>Done</button>',
    onDismiss: () => m.close('done'),
    onClose: v => {
      PROPS = null; clearTimeout(restartT);
      if (v === 'cancel') {
        Object.assign(s, { settings: snap.s.settings, filters: snap.s.filters, audio: snap.s.audio });
        if (it && snap.it) Object.assign(it, snap.it);
        applyAudio(s.id); rtOf(s.id).tKey = '';
        if (needRestart && LIVE_TYPES.includes(s.type) && rtOf(s.id).status === 'live') restartSource(s.id);
        if (fileChanged) toast('The new file was kept (a file choice cannot be undone).');
      } else if (restartT && LIVE_TYPES.includes(s.type) && s.type !== 'display' && rtOf(s.id).status === 'live') restartSource(s.id);
      saveColl(); renderAll();
    },
    onTab: id => fill(id),
  });
  PROPS = { m, s, refresh: () => { const p = $('#pStatus', m.el); if (p) p.innerHTML = statusLine(s); capBtns(); } };
  $('[data-cancel]', m.el).addEventListener('click', () => m.close('cancel'));
  $('[data-done]', m.el).addEventListener('click', () => m.close('done'));
  const filled = {};
  async function fill(id, force) {
    if (filled[id] && !force) return;
    filled[id] = true;
    const pane = $('.tab-pane[data-pane="' + id + '"]', m.el);
    pane.innerHTML = id === 'props' ? await propsBody(s, it) : id === 'transform' ? transformBody(it) : id === 'filters' ? filtersBody(s) : audioBody(s);
    $$('textarea', pane).forEach(autoSize);
    if (id === 'props') capBtns();
  }
  function capBtns() {
    const box = $('#pCapBtns', m.el); if (!box) return;
    const live = rtOf(s.id).status === 'live';
    box.innerHTML = live
      ? (s.type === 'display' ? '<button type="button" class="btn" data-p="restart">' + ic('monitor') + 'Change what is shared…</button>' : '') + '<button type="button" class="btn" data-p="stop">' + ic('stop') + (s.type === 'display' ? 'Stop capture' : 'Turn off') + '</button>'
      : '<button type="button" class="btn primary" data-p="start">' + ic('play') + (s.type === 'display' ? 'Start capture' : 'Turn on') + '</button>';
  }
  const objFor = key => { const [o] = key.split('.'); return o === 'settings' ? s.settings : o === 'filters' ? s.filters : o === 'chroma' ? s.filters.chroma : o === 'audio' ? s.audio : o === 'item' ? it : o === 'crop' ? it.crop : null; };
  function onField(el, final) {
    const key = el.dataset.k; if (!key) return;
    const prop = key.split('.')[1];
    let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? +el.value : el.value;
    if ((el.type === 'number' || el.type === 'range') && !isFinite(v)) return;
    if (el.dataset.unit != null) { const out = $('[data-out="' + key + '"]', m.el); if (out) out.textContent = v + el.dataset.unit; }
    if (key === 'box.w' || key === 'box.h') {
      if (!final || v < 1) return; const b = itemBox(it);
      if (key === 'box.w') it.sx = v / b.nw; else it.sy = v / b.nh; it.fit = false; saveColl(); rebuildPlaceholders(); return;
    }
    if (key === 'audio.fader') { s.audio.volDb = Math.round(faderToDb(v) * 10) / 10; const out = $('[data-out="audio.fader"]', m.el); if (out) out.textContent = fmtDb(s.audio.volDb); applyAudio(s.id); renderMixer(); return; }
    if (key === 'audio.monitor') v = v === '1';
    if (key === 'chroma.preset') { if (v !== 'custom') { s.filters.chroma.color = v; const ci = $('[data-k="chroma.color"]', m.el); if (ci) ci.value = v; } return; }
    if (key === 'settings.fps' || key === 'settings.size' || key === 'settings.w' || key === 'settings.h') v = Math.max(1, Math.round(v));
    if (key.startsWith('crop.')) v = Math.max(0, Math.round(v));
    const o = objFor(key); if (!o) return;
    o[prop] = v;
    if (key === 'chroma.color') { const ps = $('[data-k="chroma.preset"]', m.el); if (ps) ps.value = ['#00ff00', '#0000ff', '#ff00ff'].includes(v) ? v : 'custom'; }
    if (key === 'filters.shape' && v === 'circle' && it && s.type === 'webcam' && !it.crop.l && !it.crop.r && !it.crop.t && !it.crop.b) { webcamBubble(it); fill('transform', true); }
    if (key === 'settings.loop' && rtOf(s.id).video) rtOf(s.id).video.loop = !!v;
    if (key.startsWith('audio.')) { applyAudio(s.id); renderMixer(); syncMini(); }
    if (key.startsWith('item.') || key.startsWith('crop.')) it.fit = false;
    if ((RESTART_KEYS[s.type] || []).includes(key)) {
      needRestart = true; clearTimeout(restartT);
      if (s.type !== 'display' && rtOf(s.id).status === 'live') restartT = setTimeout(() => { restartT = 0; restartSource(s.id).then(() => PROPS && PROPS.refresh()); }, 500);
    }
    if (key === 'settings.audio') renderMixer(true);
    saveColl(); rebuildPlaceholdersSoon();
  }
  m.el.addEventListener('input', e => { if (e.target.matches('textarea')) autoSize(e.target); if (e.target.dataset.k) onField(e.target, e.target.type !== 'number'); });
  m.el.addEventListener('change', e => { if (e.target.dataset.k) onField(e.target, true); });
  m.el.addEventListener('click', async e => {
    const tf = e.target.closest('[data-tf]');
    if (tf && it) { transformItem(it, tf.dataset.tf); saveColl(); rebuildPlaceholders(); fill('transform', true); return; }
    const b = e.target.closest('[data-p]'); if (!b) return;
    const a = b.dataset.p;
    if (a === 'start') { await startSource(s.id); fill('props', true); }
    else if (a === 'stop') { stopSource(s.id); fill('props', true); }
    else if (a === 'restart') { await restartSource(s.id); fill('props', true); }
    else if (a === 'bubble') { if (it) { webcamBubble(it); filled.transform = filled.filters = false; toast('Webcam is now a circle in the bottom-right corner.', 'ok'); } }
    else if (a === 'file') $('#pFile', m.el).click();
    else if (a === 'mplay') mediaControl(s.id, 'toggle');
    else if (a === 'mrestart') mediaControl(s.id, 'restart');
    else if (a === 'canvasSize') { s.settings.w = coll.canvas.w; s.settings.h = coll.canvas.h; saveColl(); fill('props', true); }
    else if (a === 'why') { healthDialog(s, 'black'); }
    else if (a === 'resetFilters') { s.filters = defFilters(); saveColl(); fill('filters', true); }
  });
  m.el.addEventListener('change', async e => {
    if (e.target.id !== 'pFile') return;
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      await idb.set('blobs', s.id, f);
      s.settings.fileName = f.name; fileChanged = true;
      if (it) it.fit = s.type === 'image' ? 'fitIfLarge' : 'fit';
      stopSource(s.id); await startSource(s.id);
      saveColl(); fill('props', true);
    } catch (er) { toast('Could not keep that file in this browser: ' + er.message, 'err'); }
  });
  await fill(tabs[tabIndex][0]);
}

/* ───────────── settings ───────────── */
const RES_PRESETS = [[1920, 1080, '1920×1080 — Full HD 16:9 (YouTube)'], [1280, 720, '1280×720 — HD 16:9'], [2560, 1440, '2560×1440 — 2K 16:9'], [3840, 2160, '3840×2160 — 4K 16:9'], [1080, 1920, '1080×1920 — vertical 9:16 (Shorts, Reels)'], [720, 1280, '720×1280 — vertical 9:16'], [1080, 1080, '1080×1080 — square 1:1'], [1080, 1350, '1080×1350 — portrait 4:5 (Instagram)']];
function openSettings(tab) {
  const fmts = supportedFormats(), rec = recommendedKbps(coll.canvas.w, coll.canvas.h, coll.fps);
  const busy = REC.state !== 'idle';
  const presetVal = (RES_PRESETS.find(p => p[0] === coll.canvas.w && p[1] === coll.canvas.h) || [0, 0]).slice(0, 2).join('x');
  const tabs = [['general', 'General'], ['output', 'Output'], ['video', 'Video'], ['hotkeys', 'Hotkeys'], ['backup', 'Backup & Restore'], ['about', 'About']];
  const m = modal({
    title: 'Settings', wide: true, tabs, tabIndex: Math.max(0, tabs.findIndex(t => t[0] === tab)),
    body:
      '<div class="tab-pane" data-pane="general">' +
        '<label class="field"><span>Theme</span><select id="sTheme"><option value="dark">Dark</option><option value="light">Light</option></select></label>' +
        '<label class="field"><span>Countdown before recording</span><select id="sCd"><option value="0">Off — start at once</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select></label>' +
        '<label class="check"><input type="checkbox" id="sAuto"> Start the screen, camera and microphone automatically when I press Start Recording</label>' +
        (CAN.docPip ? '<label class="check"><input type="checkbox" id="sMini"> Open Mini Controls (a small always-on-top window) when recording starts</label>' : '') +
        '<label class="check"><input type="checkbox" id="sConfirm"> Ask before stopping a recording</label>' +
        '<label class="check"><input type="checkbox" id="sSnap"> Snap sources to the edges and centre of the screen</label>' +
        '<div class="sect"><h3>Install app</h3><p class="hint" id="sInstTxt"></p><div class="btn-row"><button type="button" class="btn primary" id="sInstall">' + ic('install') + 'Install IBI Screen Recorder Studio</button></div></div>' +
      '</div>' +
      '<div class="tab-pane" data-pane="output">' +
        (busy ? '<p class="note warn">Stop the recording to change these.</p>' : '') +
        '<label class="field"><span>Recording format</span><select id="sFmt"' + (busy ? ' disabled' : '') + '><option value="auto">Automatic — MP4 when supported (recommended)</option>' + FORMATS.map(f => { const ok = fmts.find(x => x.id === f.id); return '<option value="' + f.id + '"' + (ok ? '' : ' disabled') + '>' + esc(f.label + (ok ? '' : ' — not supported in this browser')) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>Video bitrate</span><select id="sVk"' + (busy ? ' disabled' : '') + '><option value="0">Automatic — ' + (rec / 1000) + ' Mbps for ' + coll.canvas.w + '×' + coll.canvas.h + ' at ' + coll.fps + ' FPS (YouTube recommendation)</option>' + [2500, 4000, 6000, 8000, 12000, 16000, 24000, 35000, 50000].map(v => '<option value="' + v + '">' + (v / 1000) + ' Mbps</option>').join('') + '</select></label>' +
        '<label class="field"><span>Audio bitrate</span><select id="sAk"' + (busy ? ' disabled' : '') + '>' + [96, 128, 160, 192, 256, 320].map(v => '<option value="' + v + '">' + v + ' kbps' + (v === 160 ? ' (default)' : '') + '</option>').join('') + '</select></label>' +
        '<div class="sect"><h3>Recording folder</h3><p id="sFolder"></p>' +
          (CAN.folder ? '<div class="btn-row"><button type="button" class="btn primary" id="sPick"' + (busy ? ' disabled' : '') + '>' + ic('folder') + 'Choose folder…</button><button type="button" class="btn" id="sDl"' + (busy ? ' disabled' : '') + '>' + ic('download') + 'Use Downloads</button></div><p class="note">With a folder, the recording is written to disk while you record — no size limit, and a crash keeps everything up to that moment (file name ends in “(recording)”).</p>' : '<p class="note">This browser saves recordings to your Downloads folder. Chrome or Edge on a computer can save straight to a folder you choose.</p>') +
        '</div>' +
        '<label class="field"><span>File name</span><input type="text" class="inp" id="sName" maxlength="120"></label><p class="note">Tokens: <code>{date}</code>, <code>{time}</code>, <code>{scene}</code>. Example: <b id="sNameEx"></b></p>' +
      '</div>' +
      '<div class="tab-pane" data-pane="video">' +
        (busy ? '<p class="note warn">Stop the recording to change these.</p>' : '') +
        '<label class="field"><span>Canvas (output) resolution</span><select id="sRes"' + (busy ? ' disabled' : '') + '>' + RES_PRESETS.map(p => '<option value="' + p[0] + 'x' + p[1] + '">' + esc(p[2]) + '</option>').join('') + '<option value="custom">Custom…</option></select></label>' +
        '<div class="grid2" id="sCustom"><label class="field"><span>Width</span><input type="number" id="sW" min="160" max="7680" step="2"' + (busy ? ' disabled' : '') + '></label><label class="field"><span>Height</span><input type="number" id="sH" min="160" max="7680" step="2"' + (busy ? ' disabled' : '') + '></label></div>' +
        '<label class="field"><span>Frame rate</span><select id="sFps"' + (busy ? ' disabled' : '') + '>' + [24, 25, 30, 48, 50, 60].map(v => '<option value="' + v + '">' + v + ' FPS' + (v === 30 ? ' (tutorials, screen recording)' : v === 60 ? ' (games, fast motion)' : '') + '</option>').join('') + '</select></label>' +
        '<div class="btn-row"><button type="button" class="btn primary" id="sApplyVideo"' + (busy ? ' disabled' : '') + '>Apply video settings</button></div>' +
        '<p class="note">Sources are scaled to the new size. Larger sizes and 60 FPS need a faster computer — watch “Missed frames” in the status bar.</p>' +
      '</div>' +
      '<div class="tab-pane" data-pane="hotkeys">' + hotkeysTable() + '</div>' +
      '<div class="tab-pane" data-pane="backup">' +
        '<div class="sect"><h3>Download backup</h3><p class="hint">Saves every scene, source, filter, mixer setting and preference — plus the images and media files of your sources — in one .json file.</p><div class="btn-row"><button type="button" class="btn primary" id="sBackup">' + ic('download') + 'Download backup</button></div></div>' +
        '<div class="sect"><h3>Restore from backup</h3><p class="hint">Replaces the current scenes and settings with those in a backup file. You are asked to confirm first.</p><div class="btn-row"><button type="button" class="btn" id="sRestore"' + (busy ? ' disabled' : '') + '>' + ic('upload') + 'Restore from backup…</button></div></div>' +
        '<div class="sect"><h3>Start fresh</h3><p class="hint">Removes all scenes and sources and starts again with one “Screen Recording” scene. Your recordings are not touched.</p><div class="btn-row"><button type="button" class="btn danger" id="sReset"' + (busy ? ' disabled' : '') + '>' + ic('trash') + 'Reset scene collection</button></div></div>' +
      '</div>' +
      '<div class="tab-pane" data-pane="about">' + aboutHtml() + '</div>',
    foot: '<button type="button" class="btn primary" data-x>Close</button>',
  });
  const q = id => $('#' + id, m.el);
  q('sTheme').value = document.documentElement.getAttribute('data-theme');
  q('sTheme').addEventListener('change', e => setTheme(e.target.value));
  q('sCd').value = String(S.countdown); q('sCd').addEventListener('change', e => { S.countdown = +e.target.value; saveSettings(); });
  [['sAuto', 'autoStart'], ['sMini', 'miniOnRecord'], ['sConfirm', 'confirmStop'], ['sSnap', 'snap']].forEach(([id, key]) => { const el = q(id); if (!el) return; el.checked = !!S[key]; el.addEventListener('change', () => { S[key] = el.checked; saveSettings(); }); });
  const inst = installState(); q('sInstTxt').textContent = inst.text; q('sInstall').hidden = !!inst.installed;
  q('sInstall').addEventListener('click', doInstall);
  q('sFmt').value = fmts.find(f => f.id === S.format) ? S.format : 'auto';
  q('sFmt').addEventListener('change', e => { S.format = e.target.value; saveSettings(); });
  q('sVk').value = String(S.vkbps || 0); q('sVk').addEventListener('change', e => { S.vkbps = +e.target.value; saveSettings(); });
  q('sAk').value = String(S.akbps); q('sAk').addEventListener('change', e => { S.akbps = +e.target.value; saveSettings(); });
  const showFolder = () => { q('sFolder').innerHTML = 'Saving to: <b>' + esc(FOLDER.handle ? FOLDER.name + ' (folder)' : 'Downloads') + '</b>'; statusTick(); };
  showFolder();
  if (q('sPick')) { q('sPick').addEventListener('click', async () => { await chooseFolder(); showFolder(); }); q('sDl').addEventListener('click', async () => { await forgetFolder(); showFolder(); toast('Recordings will go to Downloads.'); }); }
  const nameEx = () => { q('sNameEx').textContent = buildFileName(pickFormat() ? pickFormat().ext : 'mp4'); };
  q('sName').value = S.fileName; nameEx();
  q('sName').addEventListener('input', e => { S.fileName = e.target.value.trim() || DEF_SETTINGS.fileName; saveSettings(); nameEx(); });
  const custom = () => { q('sCustom').hidden = q('sRes').value !== 'custom'; };
  q('sRes').value = presetVal !== '0x0' ? presetVal : 'custom'; q('sW').value = coll.canvas.w; q('sH').value = coll.canvas.h; custom();
  q('sRes').addEventListener('change', () => { custom(); if (q('sRes').value !== 'custom') { const [w, h] = q('sRes').value.split('x'); q('sW').value = w; q('sH').value = h; } });
  q('sFps').value = String(coll.fps);
  q('sApplyVideo').addEventListener('click', () => {
    let w = Math.round(+q('sW').value), h = Math.round(+q('sH').value), fps = +q('sFps').value;
    if (!(w >= 160 && w <= 7680 && h >= 160 && h <= 7680)) { toast('Width and height must be between 160 and 7680.', 'err'); return; }
    w -= w % 2; h -= h % 2;
    applyVideoSettings(w, h, fps); m.close();
    toast('Canvas is now ' + w + '×' + h + ' at ' + fps + ' FPS.', 'ok');
  });
  q('sBackup').addEventListener('click', downloadBackup);
  q('sRestore').addEventListener('click', () => $('#fileRestore').click());
  q('sReset').addEventListener('click', async () => { if (await confirmDlg('Reset scene collection', 'Remove <b>all scenes and sources</b> and start again? Download a backup first if you may want them back.', 'Reset', true)) resetCollection(); });
}
function applyVideoSettings(w, h, fps) {
  const W0 = coll.canvas.w, H0 = coll.canvas.h, fx = w / W0, fy = h / H0, k = Math.min(fx, fy);
  coll.scenes.forEach(sc => sc.items.forEach(it => {
    const s = coll.sources[it.sourceId]; if (!SOURCE_TYPES[s.type].video) return;
    const b = itemBox(it), full = Math.abs(b.x) < 2 && Math.abs(b.y) < 2 && Math.abs(b.w - W0) < 3 && Math.abs(b.h - H0) < 3;
    const fit = Math.abs(b.w - W0) < 3 || Math.abs(b.h - H0) < 3;
    const colorFull = s.type === 'color' && s.settings.w === W0 && s.settings.h === H0;
    if (colorFull) { s.settings.w = w; s.settings.h = h; }   // a full-canvas colour block stays full-canvas
    coll.canvas.w = w; coll.canvas.h = h;
    if (colorFull && full) { it.sx = it.sy = 1; it.x = it.y = 0; it.rot = 0; it.crop = { l: 0, t: 0, r: 0, b: 0 }; }
    else if (full || fit) { transformItem(it, 'fit'); }
    else { it.sx *= k; it.sy *= k; it.x = Math.round(it.x * fx); it.y = Math.round(it.y * fy); }
    coll.canvas.w = W0; coll.canvas.h = H0;
  }));
  coll.canvas.w = w; coll.canvas.h = h;
  sizeCanvases(); setFps(fps); saveColl(); renderAll(); layoutAll();
}
function hotkeysTable() {
  const rows = [['Ctrl + Alt + R', 'Start / stop recording'], ['Ctrl + Alt + P', 'Pause / resume recording'], ['Ctrl + Alt + S', 'Screenshot of the output'], ['Ctrl + Alt + T', 'Transition (Studio Mode)'], ['Ctrl + Alt + M', 'Mute / unmute the microphone'], ['Ctrl + Alt + 1 … 9', 'Switch to scene 1 … 9'], ['Arrow keys', 'Nudge the selected source 1 px (Shift: 10 px)'], ['Ctrl + F / Ctrl + D / Ctrl + R', 'Fit / centre / reset the selected source'], ['Delete', 'Remove the selected source or scene'], ['F2', 'Rename (in the Scenes or Sources list)'], ['Enter / double-click', 'Open properties'], ['Esc', 'Deselect, close a dialog or cancel the countdown']];
  return '<p class="hint">Shortcuts work while this window is active. For control while you work in other apps, use <b>Mini Controls</b>.</p><table class="tbl"><thead><tr><th>Keys</th><th>Action</th></tr></thead><tbody>' + rows.map(r => '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>').join('') + '</tbody></table>';
}
function aboutHtml() {
  return '<dl class="kv"><dt>App</dt><dd>' + APP_NAME + '</dd><dt>Version</dt><dd>' + APP_VERSION + '</dd><dt>By</dt><dd>India Business International</dd><dt>Privacy</dt><dd>Everything runs in this browser. Nothing you record is uploaded anywhere.</dd><dt>Browser</dt><dd>' + esc(browserName()) + '</dd></dl>' +
    '<div class="sect"><h3>Quick start</h3><ol><li>Click <b>Start Recording</b>.</li><li>Choose the screen, window or tab to share (tick the audio box for sound) and allow the microphone.</li><li>After the countdown, you are recording. Use <b>Pause</b> or <b>Stop Recording</b>. The video is saved automatically.</li></ol></div>' +
    '<div class="sect"><h3>What a browser cannot do</h3><ul><li><b>Live streaming</b> (YouTube Live, Facebook Live) needs an RTMP connection that browsers do not have — use OBS Studio for live streams.</li><li><b>Virtual camera</b> — a web page cannot create a camera for Zoom or Meet.</li><li><b>Screen sharing on phones</b> — Android and iPhone browsers do not allow it; camera and microphone recording work.</li><li>Global hotkeys only work while this window is active — use Mini Controls instead.</li></ul></div>' +
    '<div class="sect"><h3>Best results</h3><ul><li>Use Chrome or Edge on Windows or Mac.</li><li>Choose a recording folder (Settings → Output) for long recordings.</li><li>Close other heavy apps if “Missed frames” rises above 1%.</li></ul></div>';
}
function browserName() { const u = navigator.userAgent; return /Edg\//.test(u) ? 'Microsoft Edge' : /OPR\//.test(u) ? 'Opera' : /Chrome\//.test(u) ? 'Google Chrome' : /Firefox\//.test(u) ? 'Mozilla Firefox' : /Safari\//.test(u) ? 'Safari' : 'Unknown'; }
function openHelp() { modal({ title: 'Help & keyboard shortcuts', wide: true, body: aboutHtml() + '<div class="sect"><h3>Keyboard shortcuts</h3>' + hotkeysTable() + '</div>', foot: '<button type="button" class="btn primary" data-x>Close</button>' }); }

/* ───────────── backup & restore ───────────── */
function blobToDataUrl(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
async function downloadBackup() {
  const files = {}, skipped = [];
  for (const s of Object.values(coll.sources)) {
    if (s.type !== 'image' && s.type !== 'media') continue;
    const b = await idb.get('blobs', s.id); if (!b) continue;
    if (b.size > 60 * 1024 * 1024) { skipped.push(s.name); continue; }
    files[s.id] = { name: s.settings.fileName || '', type: b.type, data: await blobToDataUrl(b) };
  }
  const data = { app: APP_NAME, kind: 'scene-collection', version: APP_VERSION, created: new Date().toISOString(), settings: S, collection: coll, files };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const st = fileStamp(), name = 'IBI Screen Recorder Studio backup ' + st.date + ' ' + st.time + '.json';
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000);
  toast('Backup saved: ' + name + (skipped.length ? ' — files over 60 MB were left out: ' + skipped.join(', ') : ''), 'ok');
}
$('#fileRestore').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (er) { toast('That file is not a valid backup (not JSON).', 'err'); return; }
  const c = data && data.app === APP_NAME && data.kind === 'scene-collection' ? normalizeCollection(data.collection) : null;
  if (!c) { toast('That file is not an IBI Screen Recorder Studio backup.', 'err'); return; }
  const when = data.created ? fmtDate(data.created) : 'an unknown date';
  if (!(await confirmDlg('Restore from backup', 'Backup made on <b>' + esc(when) + '</b> with ' + c.scenes.length + ' scene(s) and ' + Object.keys(c.sources).length + ' source(s).<br><br>This <b>replaces</b> your current scenes and settings. Continue?', 'Restore', true))) return;
  try {
    RT.forEach((rt, id) => stopSource(id));
    for (const id of await idb.keys('blobs')) await idb.del('blobs', id);
    for (const id in (data.files || {})) { if (!c.sources[id]) continue; const r = await fetch(data.files[id].data); await idb.set('blobs', id, await r.blob()); }
    LS.set('collection', c);
    if (data.settings && typeof data.settings === 'object') LS.set('settings', Object.assign({}, DEF_SETTINGS, data.settings));
    toast('Backup restored — reloading…', 'ok');
    setTimeout(() => location.reload(), 700);
  } catch (er) { toast('Restore failed: ' + er.message, 'err'); }
});
async function resetCollection() {
  RT.forEach((rt, id) => stopSource(id));
  for (const id of await idb.keys('blobs')) await idb.del('blobs', id);
  RT.clear(); defaultCollection(); LS.set('collection', coll);
  location.reload();
}

/* ───────────── recordings history ───────────── */
function openLibrary() {
  const m = modal({ title: 'Recordings', wide: true, body: '<div id="libBody"></div>', foot: '<button type="button" class="btn" id="libClear">Clear list</button><span class="spacer"></span><button type="button" class="btn primary" data-x>Close</button>' });
  const draw = () => {
    const box = $('#libBody', m.el);
    const head = '<p class="hint">Saving to: <b>' + esc(FOLDER.handle ? FOLDER.name + ' (folder)' : 'Downloads') + '</b>' + (CAN.folder ? ' · <button type="button" class="btn sm" data-lib="folder">' + ic('folder') + 'Choose folder…</button>' : '') + '</p>';
    if (!LIB.list.length) { box.innerHTML = head + '<p>No recordings yet. Press <b>Start Recording</b> to make one.</p>'; return; }
    box.innerHTML = head + '<div class="rec-list">' + LIB.list.map(r => {
      const url = LIB.urls.get(r.id), inFolder = r.where === 'folder' && FOLDER.handle && FOLDER.name === r.folder;
      return '<div class="rec-item"><div class="ri-main"><b>' + esc(r.name) + '</b><small>' + esc(fmtDate(r.at)) + ' · ' + fmtDur(r.ms) + ' · ' + fmtSize(r.size) + '</small><small>' + (r.black ? '⚠ Picture is black · ' : '') + esc(r.error ? 'Not saved: ' + r.error : r.where === 'folder' ? 'In the folder “' + r.folder + '”' : 'In Downloads') + '</small></div><div class="ri-btns">' +
        (url || inFolder ? '<button type="button" class="btn sm" data-lib="play" data-id="' + r.id + '">' + ic('play') + 'Play</button>' : '') +
        (url ? '<button type="button" class="btn sm" data-lib="dl" data-id="' + r.id + '">' + ic('download') + 'Download again</button>' : '') +
        '<button type="button" class="ib" data-lib="del" data-id="' + r.id + '" aria-label="Remove from list" title="Remove from this list (the file is not deleted)">' + ic('close') + '</button></div></div>';
    }).join('') + '</div><p class="note">This list only remembers recordings; removing an entry never deletes the video file.</p>';
  };
  draw();
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-lib]'); if (!b) return;
    const r = LIB.list.find(x => x.id === b.dataset.id);
    if (b.dataset.lib === 'folder') { await chooseFolder(); draw(); statusTick(); }
    else if (b.dataset.lib === 'del') { removeFromLibrary(b.dataset.id); draw(); }
    else if (b.dataset.lib === 'dl' && r) { const a = document.createElement('a'); a.href = LIB.urls.get(r.id); a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); }
    else if (b.dataset.lib === 'play' && r) {
      let url = LIB.urls.get(r.id), temp = false;
      if (!url) {
        try { if (!(await folderReady(true))) throw new Error('no permission for the folder'); const fh = await FOLDER.handle.getFileHandle(r.name); url = URL.createObjectURL(await fh.getFile()); temp = true; }
        catch (er) { toast('Could not open the file: ' + er.message, 'err'); return; }
      }
      const pm = modal({ title: r.name, wide: true, body: '<video class="player" controls autoplay playsinline src="' + url + '"></video><p class="note">' + esc(fmtDur(r.ms) + ' · ' + fmtSize(r.size)) + '</p>', foot: '<button type="button" class="btn primary" data-x>Close</button>', onClose: () => { const v = $('video', pm.el); if (v) v.pause(); if (temp) URL.revokeObjectURL(url); } });
    }
  });
  $('#libClear', m.el).addEventListener('click', async () => { if (!LIB.list.length) return; if (await confirmDlg('Clear list', 'Clear the recordings list? The video files themselves are not deleted.', 'Clear list')) { LIB.list.forEach(r => removeFromLibrary(r.id)); draw(); } });
}

/* ───────────── mini controls (Document Picture-in-Picture: stays on top of other apps) ───────────── */
const MINI = { win: null };
async function openMini(quiet) {
  if (!CAN.docPip) { toast('Mini Controls need Chrome or Edge (version 116 or newer) on a computer.'); return; }
  if (MINI.win) { try { MINI.win.focus(); } catch (e) {} return; }
  try {
    const w = await documentPictureInPicture.requestWindow({ width: 360, height: 92 });
    MINI.win = w;
    const d = w.document, dark = document.documentElement.getAttribute('data-theme') !== 'light';
    d.title = 'IBI Recorder';
    const style = d.createElement('style');
    style.textContent = 'body{margin:0;font:14px/1.3 "Segoe UI",system-ui,sans-serif;background:' + (dark ? '#1d2027' : '#fff') + ';color:' + (dark ? '#e9ecf2' : '#171a21') + ';display:flex;align-items:center;gap:6px;padding:8px;height:100vh;box-sizing:border-box}' +
      '.t{font-weight:700;font-variant-numeric:tabular-nums;min-width:92px;display:flex;align-items:center;gap:6px}.dot{width:10px;height:10px;border-radius:50%;background:#888}.on .dot{background:#e5383b}.pa .dot{background:#f5b301}' +
      'button{font:inherit;border:1px solid ' + (dark ? '#353a47' : '#d3d9e2') + ';background:' + (dark ? '#262a33' : '#f2f4f7') + ';color:inherit;border-radius:6px;min-height:36px;padding:4px 10px;cursor:pointer;flex:1 1 auto;white-space:nowrap}button:disabled{opacity:.45}' +
      'button.rec{background:#e5383b;border-color:#e5383b;color:#fff;font-weight:600}button.muted{color:#e5383b}';
    d.head.appendChild(style);
    d.body.innerHTML = '<span class="t" id="t"><span class="dot"></span><span id="tt">00:00:00</span></span><button id="r" class="rec">Start</button><button id="p">Pause</button><button id="sh" title="Screenshot">Shot</button><button id="mu" title="Mute the microphone">Mic</button>';
    d.getElementById('r').addEventListener('click', toggleRecording);
    d.getElementById('p').addEventListener('click', pauseRecording);
    d.getElementById('sh').addEventListener('click', takeScreenshot);
    d.getElementById('mu').addEventListener('click', () => { const s = firstMic(); if (s) toggleMute(s.id); else toast('There is no microphone in the Program scene.'); });
    w.addEventListener('pagehide', () => { MINI.win = null; renderControls(); });
    renderControls();
  } catch (e) { if (!quiet) toast('Could not open Mini Controls: ' + e.message, 'err'); }
}
function firstMic() { const sc = sceneById(coll.program); const it = sc && sc.items.find(i => coll.sources[i.sourceId].type === 'mic'); return it ? coll.sources[it.sourceId] : null; }
function syncMini() {
  const w = MINI.win; if (!w) return;
  try {
    const d = w.document, st = REC.state, on = st === 'recording' || st === 'paused';
    d.getElementById('t').className = 't ' + (st === 'paused' ? 'pa' : on ? 'on' : '');
    d.getElementById('tt').textContent = fmtDur(recElapsed());
    const r = d.getElementById('r'); r.textContent = on ? 'Stop' : st === 'idle' ? 'Start' : '…'; r.disabled = !(on || st === 'idle');
    const p = d.getElementById('p'); p.textContent = st === 'paused' ? 'Resume' : 'Pause'; p.disabled = !on;
    const mic = firstMic(), mu = d.getElementById('mu'); mu.disabled = !mic; mu.textContent = mic && mic.audio.muted ? 'Unmute' : 'Mic'; mu.className = mic && mic.audio.muted ? 'muted' : '';
  } catch (e) {}
}

/* ───────────── projector & picture-in-picture ───────────── */
function projector() { const el = $('#wrapProg'); if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(e => toast('Full screen was blocked: ' + e.message, 'err')); }
let pipVideo = null;
async function pipOutput() {
  if (!document.pictureInPictureEnabled) { toast('Picture-in-picture is not available in this browser.'); return; }
  if (document.pictureInPictureElement) { document.exitPictureInPicture(); return; }
  try {
    if (!pipVideo) { pipVideo = document.createElement('video'); pipVideo.muted = true; pipVideo.playsInline = true; $('#hiddenMedia').appendChild(pipVideo); pipVideo.addEventListener('leavepictureinpicture', () => { const s = pipVideo.srcObject; if (s) s.getTracks().forEach(t => t.stop()); pipVideo.srcObject = null; }); }
    pipVideo.srcObject = progCanvas.captureStream(30); await pipVideo.play(); await pipVideo.requestPictureInPicture();
  } catch (e) { toast('Picture-in-picture failed: ' + e.message, 'err'); }
}

/* ───────────── header: theme, menu, install ───────────── */
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('ibisr.theme', t); } catch (e) {}
  paintTheme(); meterColors = null;
}
function paintTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const b = $('#themeBtn'); b.setAttribute('aria-checked', String(dark)); b.setAttribute('aria-label', dark ? 'Dark theme on' : 'Light theme on');
  $('#themeLab').textContent = dark ? 'Dark' : 'Light';
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#16181d' : '#ffffff';
}
$('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));
matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => { let saved = null; try { saved = localStorage.getItem('ibisr.theme'); } catch (er) {} if (!saved) { document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark'); paintTheme(); meterColors = null; } });
$('#menuBtn').addEventListener('click', e => openMenu(e.currentTarget, [
  { label: 'Settings', icon: 'settings', run: () => openSettings() },
  { label: 'Recordings', icon: 'list', run: openLibrary },
  { label: 'Help & keyboard shortcuts', icon: 'help', run: openHelp },
  { sep: true },
  { label: 'Fullscreen projector', icon: 'full', run: projector },
  document.pictureInPictureEnabled ? { label: 'Picture-in-picture output', icon: 'pip', run: pipOutput } : null,
  CAN.docPip ? { label: 'Mini Controls', icon: 'pip', run: () => openMini() } : null,
  { sep: true },
  { label: 'Download backup', icon: 'download', run: downloadBackup },
  { label: 'Restore from backup…', icon: 'upload', disabled: REC.state !== 'idle', run: () => $('#fileRestore').click() },
  isStandalone() ? null : { label: 'Install app', icon: 'install', run: doInstall },
  { label: 'About ' + APP_NAME, icon: 'help', run: () => openSettings('about') },
]));

let deferredPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installState() {
  if (isStandalone()) return { installed: true, text: 'IBI Screen Recorder Studio is installed on this device.' };
  if (deferredPrompt) return { text: 'Install it to open from your desktop or home screen like a normal app, in its own window.' };
  if (isIOS) return { text: 'On iPhone/iPad: tap Share, then “Add to Home Screen”.' };
  return { text: 'Install it to open like a normal app. If the button does nothing, use the browser menu ⋮ → “Install IBI Screen Recorder Studio” (or “Add to Home screen”).' };
}
function updateInstallUI() {
  const inst = isStandalone();
  $('#installTop').hidden = inst;
  const can = !inst && (deferredPrompt || isIOS);
  $('#installBanner').hidden = !(can && Date.now() - Number(LS.get('installDismissed', 0)) > 24 * 3600 * 1000);
  if (isIOS) $('#ibText').textContent = 'Tap Share, then “Add to Home Screen”.';
}
async function doInstall() {
  if (isStandalone()) { toast('Already installed.'); return; }
  if (deferredPrompt) {
    const p = deferredPrompt; deferredPrompt = null;
    p.prompt(); const r = await p.userChoice.catch(() => ({}));
    if (r.outcome !== 'accepted') LS.set('installDismissed', Date.now());
    updateInstallUI(); return;
  }
  modal({ title: 'Install IBI Screen Recorder Studio', body: isIOS
    ? '<ol><li>Tap the <b>Share</b> button in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol>'
    : '<ol><li>Open the browser menu <b>⋮</b> (top-right in Chrome or Edge).</li><li>Choose <b>Install IBI Screen Recorder Studio</b> (or <b>Cast, save and share → Install page as app</b>; on a phone, <b>Add to Home screen</b>).</li><li>Confirm with <b>Install</b>.</li></ol><p class="note">Opened from another installed app? Choose <b>Open in Chrome</b> first — the install option only appears in the full browser. If you uninstalled it recently, wait a minute on the page.</p>',
    foot: '<button type="button" class="btn primary" data-x>OK</button>' });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; updateInstallUI(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; LS.set('installDismissed', 0); updateInstallUI(); toast('IBI Screen Recorder Studio installed.', 'ok'); });
$('#installTop').addEventListener('click', doInstall);
$('#ibInstall').addEventListener('click', doInstall);
$('#ibLater').addEventListener('click', () => { LS.set('installDismissed', Date.now()); $('#installBanner').hidden = true; toast('OK — Install is always at the top right and in the ⋮ menu.'); });

/* ───────────── dock splitter ───────────── */
function applyDockH() { document.documentElement.style.setProperty('--dock-h', clamp(S.dockH, 180, Math.max(200, innerHeight - 260)) + 'px'); }
(() => {
  const sp = $('#splitter'); let y0 = 0, h0 = 0, on = false;
  sp.addEventListener('pointerdown', e => { on = true; y0 = e.clientY; h0 = $('#docks').getBoundingClientRect().height; sp.classList.add('drag'); try { sp.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); });
  sp.addEventListener('pointermove', e => { if (!on) return; S.dockH = Math.round(h0 - (e.clientY - y0)); applyDockH(); });
  const end = () => { if (!on) return; on = false; sp.classList.remove('drag'); saveSettings(); };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => { S.dockH = 300; applyDockH(); saveSettings(); });
  sp.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); S.dockH += e.key === 'ArrowUp' ? 20 : -20; applyDockH(); saveSettings(); } });
  window.addEventListener('resize', applyDockH);
})();

/* ───────────── buttons with data-act ───────────── */
const ACT = {
  transition: doTransition,
  props: () => { const it = selItem(); if (it) openProps(it.sourceId, 'props'); else toast('Select a source first.'); },
  filters: () => { const it = selItem(); if (it) openProps(it.sourceId, 'filters'); else toast('Select a source first.'); },
  capture: () => { const it = selItem(); if (!it) return; const id = it.sourceId; if (rtOf(id).status === 'live') stopSource(id); else startSource(id); },
  sceneAdd: addScene,
  sceneDel: () => removeScene(editSceneId()),
  sceneDup: () => duplicateScene(editSceneId()),
  sceneUp: () => moveScene(editSceneId(), -1),
  sceneDown: () => moveScene(editSceneId(), 1),
  srcAdd: addSourceDialog,
  srcDel: () => { const it = selItem(); if (it) removeItem(it); else toast('Select a source first.'); },
  srcUp: () => { const it = selItem(); if (it) moveItem(it, 'up'); else toast('Select a source first.'); },
  srcDown: () => { const it = selItem(); if (it) moveItem(it, 'down'); else toast('Select a source first.'); },
  mixLayout: () => { S.mixerLayout = S.mixerLayout === 'horizontal' ? 'vertical' : 'horizontal'; saveSettings(); renderMixer(true); },
  mixMenu: (el) => mixerMenu(el),
  rec: toggleRecording,
  pause: pauseRecording,
  shot: takeScreenshot,
  studio: () => setStudio(!coll.studio),
  mini: () => { if (MINI.win) { try { MINI.win.close(); } catch (e) {} } else openMini(); },
  library: openLibrary,
  settings: () => openSettings(),
  cdCancel: () => { if (cdState) cdState.cancel(); },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act];
  if (fn) fn(b, e); else console.warn('No handler for', b.dataset.act);
});

/* ───────────── keyboard shortcuts ───────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && cdState) { e.preventDefault(); cdState.cancel(); return; }
  if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) {
    const k = e.key.toLowerCase(), code = e.code;
    const map = { KeyR: toggleRecording, KeyP: pauseRecording, KeyS: takeScreenshot, KeyT: doTransition, KeyM: () => { const s = firstMic(); if (s) { toggleMute(s.id); toast(s.name + (s.audio.muted ? ' muted' : ' unmuted')); } } };
    if (map[code]) { e.preventDefault(); map[code](); return; }
    if (/^Digit[1-9]$/.test(code)) { const sc = coll.scenes[+code.slice(5) - 1]; if (sc) { e.preventDefault(); selectScene(sc.id); } return; }
    void k;
  }
  if ($('.modal-scrim') || typing(e.target)) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const it = selItem(); if (!it || !isVisual(it)) return;
    const mode = { KeyF: 'fit', KeyD: 'center', KeyR: 'reset' }[e.code];
    if (mode) { e.preventDefault(); transformItem(it, mode); saveColl(); rebuildPlaceholders(); }
  }
});

/* ───────────── render everything ───────────── */
function renderAll() {
  renderScenes(); renderSources(); renderMixer(); renderTransitions(); renderControls(); renderCtxbar();
  $('#prevName').textContent = coll.studio ? '— ' + ((sceneById(coll.preview) || {}).name || '') : '';
  $('#progName').textContent = coll.studio ? '— ' + ((sceneById(coll.program) || {}).name || '') : '';
  rebuildPlaceholders();
}
setSourcesChangedHook(() => { renderSources(); renderMixer(); renderCtxbar(); rebuildPlaceholders(); if (PROPS) PROPS.refresh(); syncMini(); });

window.addEventListener('beforeunload', e => { if (REC.state === 'recording' || REC.state === 'paused' || REC.state === 'stopping') { e.preventDefault(); e.returnValue = ''; } });

/* ───────────── boot ───────────── */
(async function boot() {
  paintTheme(); applyDockH();
  $('#verBadge').textContent = APP_VERSION;
  // Studio mode is restored as saved
  const st = coll.studio; coll.studio = false; if (st) setStudio(true);
  await loadFolder();
  Object.values(coll.sources).forEach(s => { if (s.type === 'text' || s.type === 'color') rtOf(s.id).status = 'live'; });
  renderAll(); layoutAll(); updateInstallUI(); statusTick();
  requestAnimationFrame(uiLoop);
  setInterval(statusTick, 500);
  if (!CAN.recorder) toast('This browser cannot record video. Please use Chrome or Edge.', 'err');
  // Files (image/media) start at once; camera and microphone start only if permission was already given.
  const perm = async name => { try { return (await navigator.permissions.query({ name })).state; } catch (e) { return 'prompt'; } };
  const [cam, mic] = await Promise.all([perm('camera'), perm('microphone')]);
  for (const s of Object.values(coll.sources)) {
    if (s.type === 'image' || s.type === 'media') startSource(s.id, { quiet: true });
    else if (s.type === 'webcam' && cam === 'granted') startSource(s.id, { quiet: true });
    else if (s.type === 'mic' && mic === 'granted') startSource(s.id, { quiet: true });
  }
  updateGates(0);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller && REC.state === 'idle') toast('A new version of IBI Screen Recorder Studio is ready.', '', { label: 'Reload', run: () => location.reload() }); }); });
    }).catch(() => {});
  }
})();
