import { EXITS, LoopRoute, SHOPS, STAIRS, UPPER_FLOOR } from './layout';
import type { AgentState, Vec2 } from './types';

export interface JourneyPoint extends Vec2 { elevation: number }
export interface JourneyOptions {
  origin: number;
  destination: number;
  purpose: AgentState['purpose'];
  shops?: number[];
  dwellScale?: number;
}
export interface JourneyStop { progress: number; duration: number; shop: number }

/** Finite trips share the circulation ring, with explicit stair and shop approaches. */
export class Journey {
  readonly points: JourneyPoint[] = [];
  readonly distances: number[] = [0];
  readonly stops: JourneyStop[] = [];
  readonly length: number;
  readonly options: JourneyOptions;
  readonly exitStairIndex: number;
  constructor(readonly stairIndex: number, direction: 1 | -1, lane: number, options?: JourneyOptions) {
    this.options = options ?? { origin: stairIndex, destination: stairIndex, purpose: 'stroll' };
    const { origin, destination, purpose } = this.options;
    this.exitStairIndex = EXITS[destination].x < 0 ? 0 : 1;
    const loop = new LoopRoute();
    const add = (x: number, z: number, elevation: number) => {
      const previous = this.points.at(-1);
      if (previous) {
        const length = Math.hypot(x - previous.x, z - previous.z);
        if (length < 0.00001) return;
        this.distances.push(this.distances.at(-1)! + length);
      }
      this.points.push({ x, z, elevation });
    };
    const north = (x: number) => x + 33;
    const south = (x: number) => 66 + Math.PI * 9 / 2 + 34 + Math.PI * 9 / 2 + 33 - x;
    const lowerEntry = (index: number) => index === 1 ? 66 + Math.PI * 9 / 2 : loop.length - Math.PI * 9 / 2;
    const upperEntry = (index: number) => index === 1 ? 66 + Math.PI * 9 / 2 + 34 : loop.length - Math.PI * 9 / 2 - 34;
    const exitEntry = (index: number) => {
      const exit = EXITS[index];
      return exit.stair !== null ? lowerEntry(exit.stair) : exit.z < 0 ? north(exit.x) : south(exit.x);
    };
    const ring = (from: number, to: number, elevation: number, fullLap = false, shortest = false) => {
      const clockwise = ((to - from) % loop.length + loop.length) % loop.length;
      const travelDirection = shortest ? (clockwise <= loop.length / 2 ? 1 : -1) : direction;
      const distance = fullLap ? loop.length : travelDirection === 1 ? clockwise : (loop.length - clockwise) % loop.length;
      const count = Math.max(1, Math.ceil(distance / 1.5));
      for (let i = 0; i <= count; i++) {
        const p = loop.sample(from + travelDirection * distance * i / count, lane).position;
        add(p.x, p.z, elevation);
      }
    };
    const portal = (index: number, arriving: boolean) => {
      const exit = EXITS[index], x = exit.x + (exit.stair !== null ? (arriving ? 0.85 : -0.85) + lane * 0.2 : lane * 2);
      return { x, z: exit.z };
    };
    const start = portal(origin, true), end = portal(destination, false);
    add(start.x, start.z, 0);
    if (EXITS[origin].stair !== null) add(start.x, -14, 0);
    if (purpose === 'transit') {
      ring(exitEntry(origin), exitEntry(destination), 0, false, true);
    } else {
      const stair = STAIRS[stairIndex], upX = stair.x + 0.85 + lane * 0.2;
      if (EXITS[origin].stair !== stairIndex) {
        ring(exitEntry(origin), lowerEntry(stairIndex), 0, false, true);
        add(upX, -14, 0);
      }
      add(upX, stair.bottom, 0); add(upX, stair.top, UPPER_FLOOR); add(upX, 12, UPPER_FLOOR);
      let current = upperEntry(stairIndex);
      ring(current, current, UPPER_FLOOR);
      if (purpose === 'stroll') ring(current, current, UPPER_FLOOR, true);
      for (const shopIndex of this.options.shops ?? []) {
        const shop = SHOPS[shopIndex];
        const entry = shop.z < 0 ? north(shop.x) : south(shop.x);
        ring(current, entry, UPPER_FLOOR, false, true);
        // Spread customers along the frontage, away from through traffic.
        add(shop.x + lane * 6, shop.z, UPPER_FLOOR);
        this.stops.push({ progress: this.distances.at(-1)!, duration: shop.duration * (this.options.dwellScale ?? 1), shop: shopIndex });
        const p = loop.sample(entry, lane).position;
        add(p.x, p.z, UPPER_FLOOR);
        current = entry;
      }
      ring(current, upperEntry(this.exitStairIndex), UPPER_FLOOR, false, true);
      const down = STAIRS[this.exitStairIndex], downX = down.x - 0.85 + lane * 0.2;
      add(downX, 12, UPPER_FLOOR); add(downX, down.top, UPPER_FLOOR);
      add(downX, down.bottom, 0); add(downX, -14, 0);
      if (EXITS[destination].stair !== this.exitStairIndex) {
        ring(lowerEntry(this.exitStairIndex), exitEntry(destination), 0, false, true);
      }
    }
    if (EXITS[destination].stair !== null) add(end.x, -14, 0);
    add(end.x, end.z, 0);
    this.length = this.distances.at(-1)!;
  }
  get gateApproach() { return this.distances[1]; }
  sample(progress: number): JourneyPoint {
    const s = Math.max(0, Math.min(this.length, progress));
    let low = 1, high = this.points.length - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.distances[mid] < s) low = mid + 1; else high = mid;
    }
    const a = this.points[low - 1], b = this.points[low];
    const t = (s - this.distances[low - 1]) / (this.distances[low] - this.distances[low - 1]);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, elevation: a.elevation + (b.elevation - a.elevation) * t };
  }
  project(position: Vec2, previous: number, limit = this.length): number {
    let best = Math.min(previous, limit), distance = Infinity;
    for (let s = Math.max(0, previous - 1); s <= Math.min(limit, previous + 3); s += 0.1) {
      const p = this.sample(s), d = Math.hypot(p.x - position.x, p.z - position.z);
      if (d < distance) { distance = d; best = s; }
    }
    return best;
  }
}
