import './style.css';
import { COURT, ballMarkup, courtMarkup, playerMarkup } from './court';
import {
  type Mode, type PieceId, type Pt, type Scene, type Preset,
  defaultScene, isScene, presetsFor, sceneFromPreset,
} from './scene';

const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;

const board = $<SVGSVGElement>('#board');
const gCourt = $<SVGGElement>('#court');
const gPieces = $<SVGGElement>('#pieces');
const toolbar = $<HTMLElement>('.toolbar');
const safeTop = $<HTMLElement>('#safe-top');
const btnSingles = $<HTMLButtonElement>('#mode-singles');
const btnDoubles = $<HTMLButtonElement>('#mode-doubles');
const btnUndo = $<HTMLButtonElement>('#btn-undo');
const btnPresets = $<HTMLButtonElement>('#btn-presets');
const sheet = $<HTMLElement>('#sheet');
const presetList = $<HTMLElement>('#preset-list');

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

function pushHistory() {
  history.push(JSON.stringify(scene));
  if (history.length > MAX_HISTORY) history.shift();
  btnUndo.disabled = false;
}
function undo() {
  const prev = history.pop();
  if (prev) { scene = JSON.parse(prev); render(); saveScene(); }
  btnUndo.disabled = history.length === 0;
}
function setScene(next: Scene) {
  pushHistory();
  scene = next;
  render();
  saveScene();
}

function piece(id: PieceId): Pt {
  return id === 'ball' ? scene.ball : scene.players.find(p => p.id === id)!;
}

// ---------- layout: fit the court between the status bar and the toolbar ----------
// Margins around the court so players standing behind the baseline stay on screen.
const HALF_W = COURT.halfDoubles + 0.7;
const HALF_H = COURT.halfLength + 1.2;
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
  gPieces.innerHTML = scene.players.map(p => playerMarkup(p, true)).join('') + ballMarkup(scene.ball, true);
  btnSingles.setAttribute('aria-pressed', String(scene.mode === 'singles'));
  btnDoubles.setAttribute('aria-pressed', String(scene.mode === 'doubles'));
}

// ---------- dragging (one entry per finger, so two pieces can move at once) ----------
interface Drag { id: PieceId; g: SVGGElement; dx: number; dy: number; bubble: HTMLDivElement; moved: boolean; before: string }
const drags = new Map<number, Drag>();

function toBoard(e: PointerEvent): Pt {
  const m = board.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

function describe(id: PieceId, o: Pt): [string, string] {
  const name = id === 'ball' ? '공' : id;
  const d = Math.abs(o.y);
  const side = d < 0.1 ? '네트 위' : `네트에서 ${d.toFixed(1)} m`;
  const lr = Math.abs(o.x) < 0.1 ? '센터라인 위' : `센터에서 ${o.x > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(o.x).toFixed(1)} m`;
  return [`${name} · ${side}`, lr];
}

function placeBubble(b: HTMLDivElement, e: PointerEvent, id: PieceId, o: Pt) {
  const [main, sub] = describe(id, o);
  b.innerHTML = `${main}<small>${sub}</small>`;
  // Keep the bubble above the finger; flip below when too close to the top.
  const above = e.clientY > 110;
  const x = Math.min(window.innerWidth - 90, Math.max(90, e.clientX));
  b.style.left = `${x}px`;
  b.style.top = `${above ? e.clientY - 56 : e.clientY + 110}px`;
}

board.addEventListener('pointerdown', e => {
  void keepAwake();
  const g = (e.target as Element).closest<SVGGElement>('.piece');
  if (!g) return;
  e.preventDefault();
  const id = g.dataset.id as PieceId;
  const o = piece(id), p = toBoard(e);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  document.body.appendChild(bubble);
  placeBubble(bubble, e, id, o);
  drags.set(e.pointerId, { id, g, dx: p.x - o.x, dy: p.y - o.y, bubble, moved: false, before: JSON.stringify(scene) });
  try { board.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  g.classList.add('lift');
  gPieces.appendChild(g); // draw the lifted piece on top
});

board.addEventListener('pointermove', e => {
  const d = drags.get(e.pointerId);
  if (!d) return;
  e.preventDefault();
  const p = toBoard(e), o = piece(d.id);
  o.x = Math.min(bounds.xmax, Math.max(bounds.xmin, p.x - d.dx));
  o.y = Math.min(bounds.ymax, Math.max(bounds.ymin, p.y - d.dy));
  d.moved = true;
  d.g.setAttribute('transform', `translate(${o.x.toFixed(3)} ${o.y.toFixed(3)})`);
  placeBubble(d.bubble, e, d.id, o);
});

function endDrag(e: PointerEvent) {
  const d = drags.get(e.pointerId);
  if (!d) return;
  drags.delete(e.pointerId);
  d.g.classList.remove('lift');
  d.bubble.remove();
  if (d.moved) {
    const o = piece(d.id);
    o.x = Math.round(o.x * 100) / 100;
    o.y = Math.round(o.y * 100) / 100;
    history.push(d.before);
    if (history.length > MAX_HISTORY) history.shift();
    btnUndo.disabled = false;
    saveScene();
  }
}
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);
board.addEventListener('lostpointercapture', endDrag);

// iOS Safari pinch gesture events (non-standard) — block page zoom.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

// ---------- toolbar ----------
function setMode(mode: Mode) {
  if (scene.mode === mode) return;
  setScene(defaultScene(mode));
}
btnSingles.addEventListener('click', () => setMode('singles'));
btnDoubles.addEventListener('click', () => setMode('doubles'));
btnUndo.addEventListener('click', undo);
btnUndo.disabled = true;

// ---------- preset sheet ----------
const VIEW_MINI = `${-HALF_W} ${-HALF_H} ${2 * HALF_W} ${2 * HALF_H}`;
let lastPresetKey: string | null = null;

function presetCard(p: Preset): string {
  const s = sceneFromPreset(p);
  return `<button class="preset" type="button" data-key="${p.key}" aria-current="${p.key === lastPresetKey}">
    <svg viewBox="${VIEW_MINI}" aria-hidden="true">${courtMarkup(p.mode)}
      ${s.players.map(pl => playerMarkup(pl, false)).join('')}${ballMarkup(s.ball, false)}</svg>
    <b>${p.name}</b><span>${p.desc}</span>
  </button>`;
}

function openSheet() {
  presetList.innerHTML = presetsFor(scene.mode).map(presetCard).join('');
  $<HTMLElement>('#sheet-title').textContent = scene.mode === 'doubles' ? '복식 포메이션' : '단식 배치';
  sheet.hidden = false;
  presetList.querySelector<HTMLButtonElement>('.preset')?.focus({ preventScroll: true });
}
function closeSheet() {
  sheet.hidden = true;
  btnPresets.focus({ preventScroll: true });
}
btnPresets.addEventListener('click', openSheet);
sheet.addEventListener('click', e => {
  const t = e.target as Element;
  if (t.closest('[data-close]')) { closeSheet(); return; }
  const card = t.closest<HTMLButtonElement>('.preset');
  if (!card) return;
  const p = presetsFor(scene.mode).find(x => x.key === card.dataset.key);
  if (p) { lastPresetKey = p.key; setScene(sceneFromPreset(p)); }
  closeSheet();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
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
layout();
