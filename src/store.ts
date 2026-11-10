// Saved scenes, kept in this device's localStorage.
import { type Scene, isScene } from './scene';

export interface Saved { id: string; name: string; at: number; scene: Scene }

const KEY = 'tennisdoodle.saved.v1';
const MAX = 100;

export function listSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v)
      ? v.filter((s): s is Saved => s && typeof s.id === 'string' && typeof s.name === 'string' && isScene(s.scene))
      : [];
  } catch { return []; }
}

function write(list: Saved[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); return true; } catch { return false; }
}

export function addSaved(name: string, scene: Scene): boolean {
  const item: Saved = { id: Date.now().toString(36), name, at: Date.now(), scene: JSON.parse(JSON.stringify(scene)) };
  return write([item, ...listSaved()]);
}

export function removeSaved(id: string): void {
  write(listSaved().filter(s => s.id !== id));
}
