// Scene model. Units are metres; origin is the centre of the net.
// +y is toward the bottom of the screen, where our team (A) stands.

export type Mode = 'singles' | 'doubles';
export type Team = 'A' | 'B';
export type PlayerId = 'A1' | 'A2' | 'B1' | 'B2';
export type PieceId = PlayerId | 'ball';

export interface Pt { x: number; y: number }
export interface Player extends Pt { id: PlayerId; team: Team }
export interface Scene { mode: Mode; players: Player[]; ball: Pt }

export interface Preset {
  key: string;
  mode: Mode;
  name: string;
  desc: string;
  pos: Partial<Record<PieceId, [number, number]>> & { ball: [number, number] };
}

export const PRESETS: Preset[] = [
  {
    key: 'standard', mode: 'doubles', name: '기본 (원업 원백)',
    desc: '서버는 베이스라인, 파트너는 애드 코트 네트 앞.',
    pos: { A1: [1.0, 12.3], A2: [-2.6, 3.0], B1: [-3.6, -12.2], B2: [2.2, -6.6], ball: [1.4, 12.0] },
  },
  {
    key: 'bothback', mode: 'doubles', name: '투백',
    desc: '둘 다 베이스라인. 강한 리턴과 로브에 대비.',
    pos: { A1: [1.0, 12.3], A2: [-3.0, 11.9], B1: [-3.6, -12.2], B2: [2.2, -6.6], ball: [1.4, 12.0] },
  },
  {
    key: 'bothup', mode: 'doubles', name: '투업 (네트 점령)',
    desc: '서브 앤 발리 후 둘 다 네트로.',
    pos: { A1: [1.9, 4.2], A2: [-2.2, 3.4], B1: [-3.4, -11.6], B2: [2.2, -6.6], ball: [0.6, -9.5] },
  },
  {
    key: 'iform', mode: 'doubles', name: 'I 포메이션',
    desc: '파트너가 센터라인 위에 낮게 서서 리턴 방향을 흔듦.',
    pos: { A1: [0.3, 12.3], A2: [0.0, 2.4], B1: [-3.6, -12.2], B2: [2.2, -6.6], ball: [0.7, 12.0] },
  },
  {
    key: 'aussie', mode: 'doubles', name: '오스트레일리안',
    desc: '서버와 파트너가 같은 쪽. 크로스 리턴 봉쇄.',
    pos: { A1: [0.6, 12.3], A2: [2.6, 3.0], B1: [-3.6, -12.2], B2: [2.2, -6.6], ball: [1.0, 12.0] },
  },
  {
    key: 's-serve', mode: 'singles', name: '서브',
    desc: '우리가 듀스 코트에서 서브.',
    pos: { A1: [0.8, 12.3], B1: [-2.6, -12.2], ball: [1.2, 12.0] },
  },
  {
    key: 's-return', mode: 'singles', name: '리턴',
    desc: '상대가 듀스 코트에서 서브, 우리가 리턴.',
    pos: { A1: [2.6, 12.2], B1: [-0.8, -12.3], ball: [-1.2, -12.0] },
  },
];

export function presetsFor(mode: Mode): Preset[] {
  return PRESETS.filter(p => p.mode === mode);
}

export function sceneFromPreset(p: Preset): Scene {
  const ids: PlayerId[] = p.mode === 'doubles' ? ['A1', 'A2', 'B1', 'B2'] : ['A1', 'B1'];
  return {
    mode: p.mode,
    players: ids.map(id => {
      const [x, y] = p.pos[id]!;
      return { id, team: id[0] as Team, x, y };
    }),
    ball: { x: p.pos.ball[0], y: p.pos.ball[1] },
  };
}

export function defaultScene(mode: Mode): Scene {
  return sceneFromPreset(presetsFor(mode)[0]);
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Validates data read back from storage before trusting it. */
export function isScene(v: unknown): v is Scene {
  if (!v || typeof v !== 'object') return false;
  const s = v as Scene;
  if (s.mode !== 'singles' && s.mode !== 'doubles') return false;
  if (!s.ball || !finite(s.ball.x) || !finite(s.ball.y)) return false;
  if (!Array.isArray(s.players) || s.players.length !== (s.mode === 'doubles' ? 4 : 2)) return false;
  return s.players.every(p =>
    p && ['A1', 'A2', 'B1', 'B2'].includes(p.id) && (p.team === 'A' || p.team === 'B') && finite(p.x) && finite(p.y));
}
