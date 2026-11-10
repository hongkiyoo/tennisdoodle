import type { Mode, Player, Pt, Scene, Stroke } from './scene';

// ITF court dimensions in metres (half-lengths from the centre of the net).
export const COURT = {
  halfLength: 11.885,      // 23.77 m baseline to baseline
  halfDoubles: 5.485,      // 10.97 m
  halfSingles: 4.115,      // 8.23 m
  service: 6.40,           // net to service line
  post: 6.40,              // doubles net posts: 0.914 m outside each sideline
  line: 0.06,
} as const;

const { halfLength: L, halfDoubles: DW, halfSingles: SW, service: SV, post: P, line: LW } = COURT;

// Margins around the court so players standing behind the baseline stay on screen.
export const HALF_W = DW + 0.7;
export const HALF_H = L + 1.2;
export const MINI_VIEWBOX = `${-HALF_W} ${-HALF_H} ${2 * HALF_W} ${2 * HALF_H}`;

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function courtMarkup(mode: Mode): string {
  const dim = mode === 'singles'
    ? `<rect class="alley-dim" x="${-DW}" y="${-L}" width="${DW - SW}" height="${2 * L}"/>
       <rect class="alley-dim" x="${SW}" y="${-L}" width="${DW - SW}" height="${2 * L}"/>`
    : '';
  return `
    <rect class="runoff" x="-200" y="-200" width="400" height="400"/>
    <rect class="surface" x="${-DW}" y="${-L}" width="${2 * DW}" height="${2 * L}"/>
    ${dim}
    <g class="lines" stroke-width="${LW}">
      <rect x="${-DW}" y="${-L}" width="${2 * DW}" height="${2 * L}"/>
      <line x1="${-SW}" y1="${-L}" x2="${-SW}" y2="${L}"/>
      <line x1="${SW}" y1="${-L}" x2="${SW}" y2="${L}"/>
      <line x1="${-SW}" y1="${-SV}" x2="${SW}" y2="${-SV}"/>
      <line x1="${-SW}" y1="${SV}" x2="${SW}" y2="${SV}"/>
      <line x1="0" y1="${-SV}" x2="0" y2="${SV}"/>
      <line x1="0" y1="${-L}" x2="0" y2="${-L + 0.15}"/>
      <line x1="0" y1="${L}" x2="0" y2="${L - 0.15}"/>
    </g>
    <line class="net-shadow" x1="${-P}" y1="0.08" x2="${P}" y2="0.08"/>
    <line class="net" x1="${-P}" y1="0" x2="${P}" y2="0"/>
    <circle class="post" cx="${-P}" cy="0" r="0.11"/>
    <circle class="post" cx="${P}" cy="0" r="0.11"/>`;
}

/** `hit` adds an invisible larger circle so the touch target is at least ~44pt. */
export function playerMarkup(p: Player, hit: boolean): string {
  const label = p.name || p.id;
  const size = label.length <= 2 ? 0.42 : label.length === 3 ? 0.33 : 0.27;
  return `<g class="piece team-${p.team}" data-id="${p.id}" transform="translate(${p.x} ${p.y})">
    ${hit ? '<circle class="hit" r="0.95"/>' : ''}
    <g class="body">
      <circle class="shadow" cx="0.07" cy="0.12" r="0.5"/>
      <circle class="disc" r="0.5"/>
      <text style="font-size:${size}px">${esc(label)}</text>
    </g>
  </g>`;
}

export function ballMarkup(b: Pt, hit: boolean): string {
  return `<g class="piece ball" data-id="ball" transform="translate(${b.x} ${b.y})">
    ${hit ? '<circle class="hit" r="0.8"/>' : ''}
    <g class="body">
      <circle class="shadow" cx="0.06" cy="0.1" r="0.22"/>
      <circle class="ball-disc" r="0.22"/>
      <path class="seam" d="M-0.15,-0.15 Q0,0 -0.15,0.15 M0.15,-0.15 Q0,0 0.15,0.15"/>
    </g>
  </g>`;
}

/** Smooth path through the points plus a filled arrowhead at the end. */
export function strokeMarkup(s: Stroke): string {
  const p = s.pts, n = p.length;
  if (n < 4) return '';
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < n - 2; i += 2) {
    d += ` Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  }
  d += ` L${p[n - 2]} ${p[n - 1]}`;

  // Direction of the arrowhead: from a point about 0.6 m back along the stroke.
  const ex = p[n - 2], ey = p[n - 1];
  let bx = p[0], by = p[1];
  for (let i = n - 4; i >= 0; i -= 2) {
    bx = p[i]; by = p[i + 1];
    if (Math.hypot(ex - bx, ey - by) >= 0.6) break;
  }
  const a = Math.atan2(ey - by, ex - bx), len = 0.6, wing = 0.45;
  const lx = ex - len * Math.cos(a - wing), ly = ey - len * Math.sin(a - wing);
  const rx = ex - len * Math.cos(a + wing), ry = ey - len * Math.sin(a + wing);
  const head = `${ex.toFixed(2)},${ey.toFixed(2)} ${lx.toFixed(2)},${ly.toFixed(2)} ${rx.toFixed(2)},${ry.toFixed(2)}`;
  return `<g class="stroke ${s.kind}">
    <path class="under" d="${d}"/><path class="line" d="${d}"/><polygon points="${head}"/>
  </g>`;
}

/** Small static preview of a whole scene (formation cards, saved list). */
export function miniSceneSvg(s: Scene): string {
  return `<svg viewBox="${MINI_VIEWBOX}" aria-hidden="true">${courtMarkup(s.mode)}
    ${(s.strokes ?? []).map(strokeMarkup).join('')}
    ${s.players.map(p => playerMarkup(p, false)).join('')}${ballMarkup(s.ball, false)}</svg>`;
}
