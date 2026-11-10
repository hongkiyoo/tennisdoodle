// Share links: the whole scene is packed into the URL hash, so no server is needed.
import { type PlayerId, type Scene, type Stroke, isScene } from './scene';

const ORDER: Record<Scene['mode'], PlayerId[]> = { doubles: ['A1', 'A2', 'B1', 'B2'], singles: ['A1', 'B1'] };

/** Fewer points for the link: keep points at least `gap` metres apart, always keep the last one. */
function thin(pts: number[], gap = 0.4): number[] {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const last = i === pts.length - 2;
    if (last || Math.hypot(pts[i] - out[out.length - 2], pts[i + 1] - out[out.length - 1]) >= gap) {
      out.push(pts[i], pts[i + 1]);
    }
  }
  return out;
}

const dm = (n: number) => Math.round(n * 10); // decimetres keep the link short

export function encodeScene(s: Scene): string {
  const data = [
    1, // format version
    s.mode === 'doubles' ? 2 : 1,
    ORDER[s.mode].map(id => {
      const p = s.players.find(q => q.id === id)!;
      return p.name ? [dm(p.x), dm(p.y), p.name] : [dm(p.x), dm(p.y)];
    }),
    [dm(s.ball.x), dm(s.ball.y)],
    (s.strokes ?? []).map(k => [k.kind === 'shot' ? 1 : 0, ...thin(k.pts).map(dm)]),
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeScene(code: string): Scene | null {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const [v, m, players, ball, strokes] = JSON.parse(new TextDecoder().decode(bytes));
    if (v !== 1) return null;
    const mode = m === 2 ? 'doubles' : 'singles';
    const scene: Scene = {
      mode,
      players: ORDER[mode].map((id, i) => {
        const [x, y, name] = players[i];
        return { id, team: id[0] as 'A' | 'B', x: x / 10, y: y / 10, ...(name ? { name: String(name) } : {}) };
      }),
      ball: { x: ball[0] / 10, y: ball[1] / 10 },
      strokes: (strokes as number[][]).map(([kind, ...pts]): Stroke => ({
        kind: kind === 1 ? 'shot' : 'move', pts: pts.map(n => n / 10),
      })),
    };
    return isScene(scene) ? scene : null;
  } catch {
    return null;
  }
}

export function shareUrl(s: Scene): string {
  return `${location.origin}${location.pathname}#s=${encodeScene(s)}`;
}
