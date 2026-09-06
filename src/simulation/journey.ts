import { EXITS, LoopRoute, SHOPS, STAIRS, UPPER_FLOOR, type WalkingSurface } from './layout';
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
  readonly stairPassages: { start: number; end: number; entrance: JourneyPoint; exit: JourneyPoint }[] = [];
  private passageIndex = 0;
  private enteredPassage = false;
  constructor(readonly stairIndex: number, direction: 1 | -1, lane: number, options?: JourneyOptions, separation = 1) {
    this.options = options ?? { origin: stairIndex, destination: stairIndex, purpose: 'stroll' };
    const { origin, destination, purpose } = this.options;
    this.exitStairIndex = EXITS[destination].x < 0 ? 0 : 1;
    const loop = new LoopRoute();
    const sampleRing = (progress: number) => {
      const { tangent } = loop.sample(progress);
      // Use the broad north/south corridors, tapering through the corners
      // to preserve clearance beside the east/west stairs.
      return loop.sample(progress, lane * separation * (1 + 4 * tangent.x ** 2)).position;
    };
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
        const p = sampleRing(from + travelDirection * distance * i / count);
        add(p.x, p.z, elevation);
      }
    };
    const portal = (index: number, arriving: boolean) => {
      const exit = EXITS[index];
      if (exit.stair === null) return { x: exit.x + lane * 2 * separation, z: exit.z };
      // Gate piers leave passable gaps 0.85 beside the centre; without lanes
      // every walker shares one gap since the middle is solid.
      const side = separation ? (arriving ? 0.85 : -0.85) : 0.85;
      return { x: exit.x + side + lane * 0.2 * separation, z: exit.z };
    };
    const start = portal(origin, true), end = portal(destination, false);
    add(start.x, start.z, 0);
    if (EXITS[origin].stair !== null) add(start.x, -14, 0);
    if (purpose === 'transit') {
      ring(exitEntry(origin), exitEntry(destination), 0, false, true);
    } else {
      const stair = STAIRS[stairIndex], upX = stair.x + (0.85 + lane * 0.2) * separation;
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
        add(shop.x + lane * 6 * separation, shop.z, UPPER_FLOOR);
        this.stops.push({ progress: this.distances.at(-1)!, duration: shop.duration * (this.options.dwellScale ?? 1), shop: shopIndex });
        const p = sampleRing(entry);
        add(p.x, p.z, UPPER_FLOOR);
        current = entry;
      }
      ring(current, upperEntry(this.exitStairIndex), UPPER_FLOOR, false, true);
      const down = STAIRS[this.exitStairIndex], downX = down.x + (-0.85 + lane * 0.2) * separation;
      add(downX, 12, UPPER_FLOOR); add(downX, down.top, UPPER_FLOOR);
      add(downX, down.bottom, 0); add(downX, -14, 0);
      if (EXITS[destination].stair !== this.exitStairIndex) {
        ring(lowerEntry(this.exitStairIndex), exitEntry(destination), 0, false, true);
      }
    }
    if (EXITS[destination].stair !== null) add(end.x, -14, 0);
    add(end.x, end.z, 0);
    this.length = this.distances.at(-1)!;
    for (let i = 1; i < this.points.length; i++) {
      const entrance = this.points[i - 1], exit = this.points[i];
      if (entrance.elevation !== exit.elevation) {
        this.stairPassages.push({ start: this.distances[i - 1], end: this.distances[i], entrance, exit });
      }
    }
  }
  get gateApproach() { return this.distances[1]; }
  startNavigation(progress: number) {
    this.passageIndex = this.stairPassages.filter(p => p.end <= progress).length;
    this.enteredPassage = false;
  }
  /** A displaced walker must approach a stair through its entrance, not its side. */
  navigate(position: Vec2, previous: number, surface: WalkingSurface, radius: number, limit = this.length) {
    let pending = this.stairPassages[this.passageIndex];
    if (surface.stair !== null) {
      const onPlannedPassage = pending && surface.stair === (pending.entrance.x < 0 ? 0 : 1) &&
        (this.enteredPassage || previous >= pending.start - 1.2 && previous <= pending.end + 1.2);
      if (!onPlannedPassage) {
        // Avoidance can push a walker back into a flight after leaving it.
        // Return to the route's floor before continuing along the concourse.
        const upper = this.sample(previous).elevation >= UPPER_FLOOR / 2;
        const stair = STAIRS[surface.stair];
        return { progress: previous, target: { x: position.x, z: upper ? stair.top + 1.2 : stair.bottom - 1.2,
          elevation: upper ? UPPER_FLOOR : 0 } };
      }
      this.enteredPassage = true;
    }
    if (pending) {
      if (this.enteredPassage && surface.stair === null && surface.elevation === pending.exit.elevation) {
        pending = this.stairPassages[++this.passageIndex];
        this.enteredPassage = false;
      }
    }
    const passage = surface.stair === null && pending?.entrance.elevation === surface.elevation ? pending : undefined;
    const progress = this.project(position, passage ? Math.min(previous, passage.start) : previous,
      Math.min(limit, passage?.start ?? this.length));
    let target = this.sample(Math.min(progress + 1.2, limit));
    if (passage && passage.start <= limit && progress + 1.2 >= passage.start) {
      const stair = STAIRS[passage.entrance.x < 0 ? 0 : 1];
      const direction = Math.sign(passage.exit.z - passage.entrance.z);
      const outside = Math.abs(position.x - stair.x) > stair.halfWidth - radius - 0.2;
      if (outside) {
        const approachZ = passage.entrance.z - direction * (radius + 0.6);
        // First clear the side wall, then move across to the entrance.
        target = {
          x: direction * (position.z - passage.entrance.z) > -radius - 0.2 ? position.x : passage.entrance.x,
          z: approachZ,
          elevation: passage.entrance.elevation,
        };
      }
    }
    return { progress, target };
  }
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
