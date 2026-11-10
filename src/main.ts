import './style.css';
import {
  HALF_H, HALF_W, ballMarkup, courtMarkup, miniSceneSvg, playerMarkup, strokeMarkup,
} from './court';
import {
  type Mode, type PieceId, type PlayerId, type Pt, type Scene, type Stroke, type StrokeKind,
  NAME_MAX, defaultScene, isScene, presetsFor, sceneFromPreset, withNames,
} from './scene';
import { decodeScene, shareUrl } from './share';
import { addSaved, listSaved, removeSaved } from './store';

const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;

const board = $<SVGSVGElement>('#board');
const gCourt = $<SVGGElement>('#court');
const gStrokes = $<SVGGElement>('#strokes');
const gLive = $<SVGGElement>('#live');
const gPieces = $<SVGGElement>('#pieces');
const toolbar = $<HTMLElement>('.toolbar');
const safeTop = $<HTMLElement>('#safe-top');
const barMain = $<HTMLElement>('#bar-main');
const barDraw = $<HTMLElement>('#bar-draw');
const undoButtons = [$<HTMLButtonElement>('#btn-undo'), $<HTMLButtonElement>('#btn-undo2')];
const toastEl = $<HTMLElement>('#toast');

// ---------- state ----------
const STORE_KEY = 'tennisdoodle.scene.v1';
const MAX_HISTORY = 50;

function loadScene(): Scene | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return isScene(v) ? v : null;
  } catch { return null; }
}
function saveScene() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(scene)); } catch { /* storage unavailable */ }
}

let scene: Scene = loadScene() ?? defaultScene('doubles');
const history: string[] = [];
let drawMode = false;
let strokeKind: StrokeKind = 'move';
let lastPresetKey: string | null = null;

function updateUndo() { for (const b of undoButtons) b.disabled = history.length === 0; }
function remember(snapshot: string) {
  history.push(snapshot);
  if (history.length > MAX_HISTORY) history.shift();
  updateUndo();
}
function undo() {
  const prev = history.pop();
  if (prev) { scene = JSON.parse(prev); render(); saveScene(); }
  updateUndo();
}
/** Replace the scene as one undoable step. */
function setScene(next: Scene) {
  remember(JSON.stringify(scene));
  scene = next;
  render();
  saveScene();
}
const clone = (s: Scene): Scene => JSON.parse(JSON.stringify(s));

function piece(id: PieceId): Pt {
  return id === 'ball' ? scene.ball : scene.players.find(p => p.id === id)!;
}

let toastTimer = 0;
function toast(msg: string, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, ms);
}

// ---------- layout: fit the court between the status bar and the toolbar ----------
let bounds = { xmin: -HALF_W, xmax: HALF_W, ymin: -HALF_H, ymax: HALF_H };

function layout() {
  const W = board.clientWidth, H = board.clientHeight;
  if (!W || !H) return;
  const top = safeTop.offsetHeight;
  const bottom = toolbar.offsetHeight;
  const freeH = Math.max(1, H - top - bottom);
  const s = Math.min((W - 12) / (2 * HALF_W), freeH / (2 * HALF_H)); // px per metre
  const x0 = -W / 2 / s;
  const y0 = -(top + freeH / 2) / s;
  board.setAttribute('viewBox', `${x0} ${y0} ${W / s} ${H / s}`);
  const pad = 0.5;
  bounds = {
    xmin: x0 + pad, xmax: x0 + W / s - pad,
    ymin: y0 + top / s + pad, ymax: y0 + (H - bottom) / s - pad,
  };
}
new ResizeObserver(layout).observe(board);
new ResizeObserver(layout).observe(toolbar);

// ---------- render ----------
let renderedMode: Mode | null = null;

function render() {
  if (renderedMode !== scene.mode) {
    gCourt.innerHTML = courtMarkup(scene.mode);
    renderedMode = scene.mode;
  }
  gStrokes.innerHTML = (scene.strokes ?? []).map(strokeMarkup).join('');
  gPieces.innerHTML = scene.players.map(p => playerMarkup(p, true)).join('') + ballMarkup(scene.ball, true);
}

// ---------- pointer handling: one entry per finger ----------
type Gesture =
  | { type: 'drag'; id: PieceId; g: SVGGElement; dx: number; dy: number; sx: number; sy: number; bubble: HTMLDivElement; moved: boolean; before: string }
  | { type: 'draw'; pts: number[] };
const gestures = new Map<number, Gesture>();
let lastTap: { id: PieceId; t: number } | null = null;

function toBoard(e: PointerEvent): Pt {
  const m = board.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
const clampX = (x: number) => Math.min(bounds.xmax, Math.max(bounds.xmin, x));
const clampY = (y: number) => Math.min(bounds.ymax, Math.max(bounds.ymin, y));
const r2 = (n: number) => Math.round(n * 100) / 100;

function describe(id: PieceId, o: Pt): [string, string] {
  const name = id === 'ball' ? '공' : (scene.players.find(p => p.id === id)?.name || id);
  const d = Math.abs(o.y);
  const side = d < 0.1 ? '네트 위' : `네트에서 ${d.toFixed(1)} m`;
  const lr = Math.abs(o.x) < 0.1 ? '센터라인 위' : `센터에서 ${o.x > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(o.x).toFixed(1)} m`;
  return [`${name} · ${side}`, lr];
}

function placeBubble(b: HTMLDivElement, e: PointerEvent, id: PieceId, o: Pt) {
  const [main, sub] = describe(id, o);
  b.textContent = main;
  const small = document.createElement('small');
  small.textContent = sub;
  b.appendChild(small);
  // Keep the bubble above the finger; flip below when too close to the top.
  const above = e.clientY > 110;
  const x = Math.min(window.innerWidth - 90, Math.max(90, e.clientX));
  b.style.left = `${x}px`;
  b.style.top = `${above ? e.clientY - 56 : e.clientY + 110}px`;
}

function renderLive() {
  let html = '';
  for (const g of gestures.values()) {
    if (g.type === 'draw' && g.pts.length >= 4) html += strokeMarkup({ kind: strokeKind, pts: g.pts });
  }
  gLive.innerHTML = html;
}

board.addEventListener('pointerdown', e => {
  void keepAwake();
  if (drawMode) {
    e.preventDefault();
    const p = toBoard(e);
    gestures.set(e.pointerId, { type: 'draw', pts: [r2(clampX(p.x)), r2(clampY(p.y))] });
    try { board.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    return;
  }
  // Pick the piece whose centre is nearest the finger (touch areas overlap, e.g. ball in the server's hand).
  const p = toBoard(e);
  let id: PieceId | null = null, best = Infinity;
  for (const c of [...scene.players.map(q => q.id as PieceId), 'ball' as const]) {
    const o = piece(c), d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < (c === 'ball' ? 0.8 : 0.95) && d < best) { best = d; id = c; }
  }
  if (!id) return;
  const g = gPieces.querySelector<SVGGElement>(`[data-id="${id}"]`)!;
  e.preventDefault();
  const o = piece(id);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  document.body.appendChild(bubble);
  placeBubble(bubble, e, id, o);
  gestures.set(e.pointerId, { type: 'drag', id, g, dx: p.x - o.x, dy: p.y - o.y, sx: e.clientX, sy: e.clientY, bubble, moved: false, before: JSON.stringify(scene) });
  try { board.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  g.classList.add('lift');
  gPieces.appendChild(g); // draw the lifted piece on top
});

board.addEventListener('pointermove', e => {
  const gs = gestures.get(e.pointerId);
  if (!gs) return;
  e.preventDefault();
  const p = toBoard(e);
  if (gs.type === 'draw') {
    const x = r2(clampX(p.x)), y = r2(clampY(p.y));
    const n = gs.pts.length;
    if (Math.hypot(x - gs.pts[n - 2], y - gs.pts[n - 1]) >= 0.2) { gs.pts.push(x, y); renderLive(); }
    return;
  }
  // Ignore finger jitter under 5px so a tap stays a tap (needed for double-tap rename).
  if (!gs.moved && Math.hypot(e.clientX - gs.sx, e.clientY - gs.sy) < 5) return;
  gs.moved = true;
  const o = piece(gs.id);
  o.x = clampX(p.x - gs.dx);
  o.y = clampY(p.y - gs.dy);
  gs.g.setAttribute('transform', `translate(${o.x.toFixed(3)} ${o.y.toFixed(3)})`);
  placeBubble(gs.bubble, e, gs.id, o);
});

function endGesture(e: PointerEvent) {
  const gs = gestures.get(e.pointerId);
  if (!gs) return;
  gestures.delete(e.pointerId);

  if (gs.type === 'draw') {
    renderLive();
    const p = gs.pts, n = p.length;
    if (n >= 4 && Math.hypot(p[n - 2] - p[0], p[n - 1] - p[1]) >= 0.5) {
      const stroke: Stroke = { kind: strokeKind, pts: p };
      remember(JSON.stringify(scene));
      scene.strokes = [...(scene.strokes ?? []), stroke];
      render();
      saveScene();
    }
    return;
  }

  gs.g.classList.remove('lift');
  gs.bubble.remove();
  if (gs.moved) {
    const o = piece(gs.id);
    o.x = r2(o.x);
    o.y = r2(o.y);
    remember(gs.before);
    saveScene();
    lastTap = null;
  } else if (e.type === 'pointerup' && gs.id !== 'ball') {
    // Double-tap a player to rename.
    const now = performance.now();
    if (lastTap && lastTap.id === gs.id && now - lastTap.t < 380) {
      lastTap = null;
      openNameDialog(gs.id);
    } else {
      lastTap = { id: gs.id, t: now };
    }
  }
}
board.addEventListener('pointerup', endGesture);
board.addEventListener('pointercancel', endGesture);
board.addEventListener('lostpointercapture', endGesture);

// iOS Safari pinch gesture events (non-standard) — block page zoom.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

// ---------- drawing mode ----------
function setDrawMode(on: boolean) {
  drawMode = on;
  barMain.hidden = on;
  barDraw.hidden = !on;
  board.classList.toggle('drawing', on);
  if (on) toast('코트 위를 손가락으로 그어 화살표를 그리세요');
}
function setStrokeKind(k: StrokeKind) {
  strokeKind = k;
  $('#kind-move').setAttribute('aria-pressed', String(k === 'move'));
  $('#kind-shot').setAttribute('aria-pressed', String(k === 'shot'));
}
$('#btn-draw').addEventListener('click', () => setDrawMode(true));
$('#btn-draw-done').addEventListener('click', () => setDrawMode(false));
$('#kind-move').addEventListener('click', () => setStrokeKind('move'));
$('#kind-shot').addEventListener('click', () => setStrokeKind('shot'));
$('#btn-clear').addEventListener('click', () => {
  if (!scene.strokes?.length) { toast('지울 화살표가 없습니다'); return; }
  const next = clone(scene);
  next.strokes = [];
  setScene(next);
  toast('화살표를 모두 지웠습니다. 되돌리기로 복구할 수 있어요');
});
for (const b of undoButtons) b.addEventListener('click', undo);

// ---------- share ----------
$('#btn-share').addEventListener('click', async () => {
  const url = shareUrl(scene);
  if (navigator.share) {
    try { await navigator.share({ title: 'TennisDoodle 작전', url }); return; }
    catch (err) { if ((err as DOMException).name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('공유 링크를 복사했습니다');
  } catch {
    toast('링크를 복사하지 못했습니다');
  }
});

function openFromHash() {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  const shared = decodeScene(m[1]);
  window.history.replaceState(null, '', location.pathname + location.search);
  if (!shared) { toast('공유 링크를 읽지 못했습니다'); return; }
  setScene(shared);
  toast('공유받은 장면을 열었습니다');
}
window.addEventListener('hashchange', openFromHash);

// ---------- scene sheet: mode, formations, saved scenes ----------
const sheet = $<HTMLElement>('#sheet');
const presetList = $<HTMLElement>('#preset-list');
const savedList = $<HTMLUListElement>('#saved-list');
const savedEmpty = $<HTMLElement>('#saved-empty');
const saveForm = $<HTMLFormElement>('#save-form');
const saveName = $<HTMLInputElement>('#save-name');

function renderSheet() {
  $('#mode-singles').setAttribute('aria-pressed', String(scene.mode === 'singles'));
  $('#mode-doubles').setAttribute('aria-pressed', String(scene.mode === 'doubles'));
  $('#preset-title').textContent = scene.mode === 'doubles' ? '복식 포메이션' : '단식 배치';
  presetList.innerHTML = presetsFor(scene.mode).map(p => `
    <button class="preset" type="button" data-key="${p.key}" aria-current="${p.key === lastPresetKey}">
      ${miniSceneSvg(withNames(sceneFromPreset(p), scene))}
      <b>${p.name}</b><span>${p.desc}</span>
    </button>`).join('');

  const saved = listSaved();
  savedEmpty.hidden = saved.length > 0;
  savedList.innerHTML = '';
  for (const s of saved) {
    const li = document.createElement('li');
    li.className = 'saved';
    const when = new Date(s.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    li.innerHTML = `<button class="saved-open" type="button" data-open="${s.id}">${miniSceneSvg(s.scene)}
      <span><b></b><small>${s.scene.mode === 'doubles' ? '복식' : '단식'} · ${when}</small></span></button>
      <button class="saved-del" type="button" data-del="${s.id}">삭제</button>`;
    li.querySelector('b')!.textContent = s.name;
    savedList.appendChild(li);
  }
}

function openSheet() {
  saveForm.hidden = true;
  renderSheet();
  sheet.hidden = false;
}
function closeSheet() {
  sheet.hidden = true;
  $<HTMLButtonElement>('#btn-scenes').focus({ preventScroll: true });
}
$('#btn-scenes').addEventListener('click', openSheet);

function setMode(mode: Mode) {
  if (scene.mode === mode) return;
  lastPresetKey = null;
  setScene(withNames(defaultScene(mode), scene));
  renderSheet();
}
$('#mode-singles').addEventListener('click', () => setMode('singles'));
$('#mode-doubles').addEventListener('click', () => setMode('doubles'));

$('#btn-save-open').addEventListener('click', () => {
  saveForm.hidden = false;
  saveName.value = `작전 ${listSaved().length + 1}`;
  saveName.focus();
  saveName.select();
});
saveForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = saveName.value.trim() || `작전 ${listSaved().length + 1}`;
  if (addSaved(name, scene)) {
    saveForm.hidden = true;
    saveName.blur();
    renderSheet();
    toast(`‘${name}’ 저장했습니다`);
  } else {
    toast('저장 공간이 부족해 저장하지 못했습니다');
  }
});

let delTimer = 0;
sheet.addEventListener('click', e => {
  const t = e.target as Element;
  if (t.closest('[data-close]')) { closeSheet(); return; }

  const card = t.closest<HTMLButtonElement>('.preset');
  if (card) {
    const p = presetsFor(scene.mode).find(x => x.key === card.dataset.key);
    if (p) { lastPresetKey = p.key; setScene(withNames(sceneFromPreset(p), scene)); }
    closeSheet();
    return;
  }

  const open = t.closest<HTMLButtonElement>('[data-open]');
  if (open) {
    const s = listSaved().find(x => x.id === open.dataset.open);
    if (s) { setScene(clone(s.scene)); toast(`‘${s.name}’ 불러왔습니다`); }
    closeSheet();
    return;
  }

  // Delete asks once inline: first tap arms, second tap deletes.
  const del = t.closest<HTMLButtonElement>('[data-del]');
  if (del) {
    if (del.classList.contains('confirm')) {
      removeSaved(del.dataset.del!);
      renderSheet();
    } else {
      savedList.querySelectorAll('.saved-del.confirm').forEach(b => { b.classList.remove('confirm'); b.textContent = '삭제'; });
      del.classList.add('confirm');
      del.textContent = '삭제 확인';
      clearTimeout(delTimer);
      delTimer = window.setTimeout(() => { del.classList.remove('confirm'); del.textContent = '삭제'; }, 3000);
    }
  }
});

// ---------- player name editor ----------
const nameDialog = $<HTMLElement>('#name-dialog');
const nameForm = $<HTMLFormElement>('#name-form');
const nameInput = $<HTMLInputElement>('#name-input');
let editing: PlayerId | null = null;

function openNameDialog(id: PlayerId) {
  editing = id;
  const p = scene.players.find(q => q.id === id)!;
  $('#name-title').textContent = `${id} 이름`;
  nameInput.value = p.name ?? '';
  nameInput.placeholder = id;
  nameDialog.hidden = false;
  nameInput.focus();
}
function closeNameDialog() {
  nameDialog.hidden = true;
  nameInput.blur();
  editing = null;
}
function applyName(name: string) {
  if (!editing) return;
  const next = clone(scene);
  const p = next.players.find(q => q.id === editing)!;
  const trimmed = [...name.trim()].slice(0, NAME_MAX).join('');
  if (trimmed) p.name = trimmed; else delete p.name;
  if ((p.name ?? '') !== (scene.players.find(q => q.id === editing)!.name ?? '')) setScene(next);
  closeNameDialog();
}
nameForm.addEventListener('submit', e => { e.preventDefault(); applyName(nameInput.value); });
$('#name-reset').addEventListener('click', () => applyName(''));
nameDialog.addEventListener('click', e => { if ((e.target as Element).closest('[data-close]')) closeNameDialog(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!nameDialog.hidden) closeNameDialog();
    else if (!sheet.hidden) closeSheet();
    else if (drawMode) setDrawMode(false);
  }
  const typing = (e.target as Element).tagName === 'INPUT';
  if (!typing && (e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
});

// ---------- keep the screen on while the app is in use ----------
let wakeLock: WakeLockSentinel | null = null;
async function keepAwake() {
  if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed (e.g. low power mode) — fine */ }
}
document.addEventListener('visibilitychange', () => { void keepAwake(); });

// ---------- offline support ----------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable */ });
  });
}

render();
updateUndo();
layout();
openFromHash();
