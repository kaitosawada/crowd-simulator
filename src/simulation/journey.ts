import { LoopRoute, STAIRS, UPPER_FLOOR } from './layout';
import type { Vec2 } from './types';

export interface JourneyPoint extends Vec2 { elevation: number }
/** One finite trip: ground-floor gate, stairs, one upper-floor lap, stairs, gate. */
export class Journey {
  readonly points: JourneyPoint[] = [];
  readonly distances: number[] = [0];
  readonly length: number;
  constructor(readonly stairIndex: number, direction: 1 | -1, lane: number) {
    const stair = STAIRS[stairIndex], loop = new LoopRoute();
    const entry = stair.x > 0 ? 66 + Math.PI * 9 / 2 + 34 : loop.length - Math.PI * 9 / 2 - 34;
    const add = (x: number, z: number, elevation: number) => this.points.push({ x, z, elevation });
    const upX = stair.x + 0.85 + lane * 0.2, downX = stair.x - 0.85 + lane * 0.2;
    add(upX, -32.5, 0); add(upX, stair.bottom, 0); add(upX, stair.top, UPPER_FLOOR);
    add(upX, 12, UPPER_FLOOR);
    for (let i = 0, n = Math.ceil(loop.length / 2); i <= n; i++) {
      const p = loop.sample(entry + direction * loop.length * i / n, lane).position;
      add(p.x, p.z, UPPER_FLOOR);
    }
    add(downX, 12, UPPER_FLOOR); add(downX, stair.top, UPPER_FLOOR);
    add(downX, stair.bottom, 0); add(downX, -32.5, 0);
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      this.distances.push(this.distances[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.distances.at(-1)!;
  }
  sample(progress: number): JourneyPoint {
    const s = Math.max(0, Math.min(this.length, progress));
    let i = 1;
    while (i < this.points.length - 1 && this.distances[i] < s) i++;
    const a = this.points[i - 1], b = this.points[i];
    const t = (s - this.distances[i - 1]) / (this.distances[i] - this.distances[i - 1]);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, elevation: a.elevation + (b.elevation - a.elevation) * t };
  }
  project(position: Vec2, previous: number): number {
    let best = previous, distance = Infinity;
    for (let s = Math.max(0, previous - 1); s <= Math.min(this.length, previous + 3); s += 0.1) {
      const p = this.sample(s), d = Math.hypot(p.x - position.x, p.z - position.z);
      if (d < distance) { distance = d; best = s; }
    }
    return best;
  }
}
