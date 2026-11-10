import type { Mode, Player, Pt } from './scene';

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
  return `<g class="piece team-${p.team}" data-id="${p.id}" transform="translate(${p.x} ${p.y})">
    ${hit ? '<circle class="hit" r="0.95"/>' : ''}
    <g class="body">
      <circle class="shadow" cx="0.07" cy="0.12" r="0.5"/>
      <circle class="disc" r="0.5"/>
      <text>${p.id}</text>
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
