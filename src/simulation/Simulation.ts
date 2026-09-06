import { behaviorRegistry } from './behaviors';
import { colliders, constrainMovement, EXITS, LoopRoute, obstacles, SHOPS, UPPER_FLOOR } from './layout';
import { Journey } from './journey';
import { SpatialHash } from './SpatialHash';
import type { AgentBehavior, AgentState, BehaviorFactory, Neighbor } from './types';

export const MAX_AGENTS = 1000;

export class Simulation {
  readonly route = new LoopRoute();
  readonly agents: AgentState[] = [];
  readonly spatialHash = new SpatialHash();
  time = 0;
  paused = false;
  speed = 1;
  algorithm = 'avoidance';
  readonly journeys = new Map<number, Journey>();
  private behaviors = new Map<number, AgentBehavior>();
  private randomState = 20260906;
  private accumulator = 0;
  private nextId = 0;
  constructor(count = 1000) { this.setCount(count); }
  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  private place(agent: AgentState, journey: Journey, progress: number) {
    const point = journey.sample(progress);
    agent.progress = progress;
    agent.position = { x: point.x, z: point.z };
    agent.elevation = point.elevation;
    agent.floor = point.elevation >= UPPER_FLOOR ? 1 : 0;
    agent.stair = point.elevation > 0 && point.elevation < UPPER_FLOOR ? (point.x < 0 ? 0 : 1) : null;
    agent.stopIndex = journey.stops.filter(stop => stop.progress < progress).length;
    agent.dwellRemaining = 0;
  }
  private createJourney(id: number, trips: number, direction: 1 | -1, lane: number) {
    const origin = (id + trips) % EXITS.length;
    const destination = (origin + 1 + Math.floor(this.random() * (EXITS.length - 1))) % EXITS.length;
    const kind = (id + trips) % 10;
    const purpose = kind < 4 ? 'transit' : kind < 9 ? 'shopping' : 'stroll';
    const shop = Math.floor(this.random() * SHOPS.length);
    const shops = purpose === 'shopping' ? (kind === 8 ? [shop, (shop + 1) % SHOPS.length] : [shop]) : [];
    return new Journey(EXITS[origin].x < 0 ? 0 : 1, direction, lane, { origin, destination, purpose, shops, dwellScale: 0.7 + this.random() * 0.8 });
  }
  setCount(count: number) {
    count = Math.max(0, Math.min(MAX_AGENTS, Math.round(count)));
    while (this.agents.length > count) { const id = this.agents.pop()!.id; this.behaviors.delete(id); this.journeys.delete(id); }
    while (this.agents.length < count) {
      const id = this.nextId++, direction = Math.floor(id / 2) % 2 ? 1 : -1;
      const lane = (this.random() - 0.5) * 1.2;
      const journey = this.createJourney(id, 0, direction, lane);
      this.journeys.set(id, journey);
      const agent: AgentState = { id, position: { x: 0, z: 0 }, progress: 0, lane, direction, radius: 0.3,
        preferredSpeed: 1.15 + this.random() * 0.5, velocity: { x: 0, z: 0 }, distance: 0,
        floor: 0, stair: null, elevation: 0, active: true, trips: 0,
        purpose: journey.options.purpose, stopIndex: 0, dwellRemaining: 0 };
      // Populate both floors immediately, at different stages of their errands.
      this.place(agent, journey, this.random() * journey.length * 0.9);
      this.agents.push(agent);
      this.behaviors.set(id, behaviorRegistry.get(this.algorithm)!.factory(id));
    }
  }
  setAlgorithm(name: string) {
    const entry = behaviorRegistry.get(name);
    if (!entry) throw new Error(`Unknown behavior: ${name}`);
    this.algorithm = name;
    for (const a of this.agents) this.behaviors.set(a.id, entry.factory(a.id));
  }
  /** Assign a unique stateful behavior to one agent, without affecting its neighbors. */
  setAgentBehavior(id: number, factory: BehaviorFactory) {
    if (!this.behaviors.has(id)) throw new Error(`Unknown agent: ${id}`);
    this.behaviors.set(id, factory(id));
  }
  reset() {
    const count = this.agents.length;
    this.agents.length = 0; this.behaviors.clear(); this.journeys.clear(); this.nextId = 0;
    this.randomState = 20260906; this.time = 0; this.accumulator = 0;
    this.setCount(count);
  }
  update(realDt: number, player?: Neighbor) {
    if (this.paused) return;
    this.accumulator += Math.min(realDt, 0.1) * this.speed;
    const step = 1 / 30;
    while (this.accumulator >= step) { this.step(step, player); this.accumulator -= step; }
  }
  private step(dt: number, player?: Neighbor) {
    this.time += dt;
    this.spatialHash.clear();
    // Snapshot decisions before integration so iteration order cannot change perception.
    for (const a of this.agents) if (a.active) this.spatialHash.insert({ elevation: a.elevation, id: a.id, position: { ...a.position }, velocity: { ...a.velocity }, radius: a.radius });
    if (player) this.spatialHash.insert(player);
    const velocities = this.agents.map(a => {
      if (!a.active) return { x: 0, z: 0 };
      const journey = this.journeys.get(a.id)!;
      if (a.dwellRemaining > 0) {
        a.dwellRemaining = Math.max(0, a.dwellRemaining - dt);
        if (a.dwellRemaining === 0) a.stopIndex++;
        return { x: 0, z: 0 };
      }
      const stop = journey.stops[a.stopIndex];
      a.progress = journey.project(a.position, a.progress, stop?.progress);
      const target = journey.sample(Math.min(a.progress + 1.2, stop?.progress ?? journey.length));
      const dx = target.x - a.position.x, dz = target.z - a.position.z, length = Math.hypot(dx, dz) || 1;
      if (stop && stop.progress - a.progress < 1 && Math.hypot(a.position.x - target.x, a.position.z - target.z) < 0.45) {
        a.progress = stop.progress; a.dwellRemaining = stop.duration;
        a.velocity = { x: 0, z: 0 };
        return { x: 0, z: 0 };
      }
      const velocity = this.behaviors.get(a.id)!.computeVelocity(a, {
        dt, time: this.time, desiredVelocity: { x: dx / length * a.preferredSpeed, z: dz / length * a.preferredSpeed },
        neighbors: this.spatialHash.query(a.position, 4.5).filter(n => Math.abs((n.elevation ?? 0) - a.elevation) < 1.5), obstacles: a.floor === 0 && a.stair === null ? colliders : obstacles,
      });
      // Keep an experimental behavior returning invalid values from corrupting the world.
      if (!Number.isFinite(velocity.x) || !Number.isFinite(velocity.z)) return { x: 0, z: 0 };
      const magnitude = Math.hypot(velocity.x, velocity.z), limit = a.preferredSpeed * 2;
      return magnitude > limit ? { x: velocity.x * limit / magnitude, z: velocity.z * limit / magnitude } : velocity;
    });
    this.agents.forEach((a, i) => {
      if (!a.active) return;
      const blend = 1 - Math.exp(-dt * 5);
      a.velocity.x += (velocities[i].x - a.velocity.x) * blend;
      a.velocity.z += (velocities[i].z - a.velocity.z) * blend;
      const oldX = a.position.x, oldZ = a.position.z;
      a.position.x += a.velocity.x * dt; a.position.z += a.velocity.z * dt;
      constrainMovement(a.position, { x: oldX, z: oldZ }, a, a.radius);
      a.velocity.x = (a.position.x - oldX) / dt; a.velocity.z = (a.position.z - oldZ) / dt;
      a.distance += Math.hypot(a.position.x - oldX, a.position.z - oldZ);
      const journey = this.journeys.get(a.id)!;
      if (a.progress > journey.length - 1 && Math.hypot(a.position.x - journey.points.at(-1)!.x, a.position.z - journey.points.at(-1)!.z) < 0.6) {
        // A completed errand is followed by a new trip through another entrance.
        a.trips++; a.velocity = { x: 0, z: 0 };
        const next = this.createJourney(a.id, a.trips, a.direction, a.lane);
        a.purpose = next.options.purpose;
        this.journeys.set(a.id, next);
        this.place(a, next, 0);
      }
    });
  }
  get averageSpeed() { return this.agents.reduce((sum, a) => sum + Math.hypot(a.velocity.x, a.velocity.z), 0) / (this.agents.filter(a => a.active).length || 1); }
}
