import { behaviorRegistry } from './behaviors';
import { colliders, constrainPosition, isWalkable, LoopRoute } from './layout';
import { SpatialHash } from './SpatialHash';
import type { AgentBehavior, AgentState, BehaviorFactory, Neighbor, Vec2 } from './types';

export const MAX_AGENTS = 500;
export class Simulation {
  readonly route = new LoopRoute();
  readonly agents: AgentState[] = [];
  readonly spatialHash = new SpatialHash();
  time = 0;
  paused = false;
  speed = 1;
  algorithm = 'avoidance';
  private behaviors = new Map<number, AgentBehavior>();
  private randomState = 20260906;
  private accumulator = 0;
  private nextId = 0;
  constructor(count = 48) { this.setCount(count); }
  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  setCount(count: number) {
    count = Math.max(0, Math.min(MAX_AGENTS, Math.round(count)));
    while (this.agents.length > count) this.behaviors.delete(this.agents.pop()!.id);
    while (this.agents.length < count) {
      const id = this.nextId++, direction = id % 2 ? 1 : -1;
      let progress = 0, lane = 0, position: Vec2 = { x: 0, z: 0 };
      for (let attempt = 0; attempt < 80; attempt++) {
        progress = this.random() * this.route.length;
        lane = (this.random() - 0.5) * 7;
        position = this.route.sample(progress, lane).position;
        if (isWalkable(position, 0.32) && this.agents.every(a => Math.hypot(a.position.x - position.x, a.position.z - position.z) > 0.8)) break;
      }
      constrainPosition(position, 0.3);
      const agent: AgentState = { id, position, progress, lane, direction, radius: 0.3, preferredSpeed: 1.15 + this.random() * 0.5, velocity: { x: 0, z: 0 }, distance: 0 };
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
    this.agents.length = 0; this.behaviors.clear(); this.nextId = 0;
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
    for (const a of this.agents) this.spatialHash.insert({ id: a.id, position: { ...a.position }, velocity: { ...a.velocity }, radius: a.radius });
    if (player) this.spatialHash.insert(player);
    const velocities = this.agents.map(a => {
      a.progress = this.route.project(a.position, a.progress);
      const target = this.route.sample(a.progress + a.direction * 2.5, a.lane).position;
      const dx = target.x - a.position.x, dz = target.z - a.position.z, length = Math.hypot(dx, dz) || 1;
      const velocity = this.behaviors.get(a.id)!.computeVelocity(a, {
        dt, time: this.time, desiredVelocity: { x: dx / length * a.preferredSpeed, z: dz / length * a.preferredSpeed },
        neighbors: this.spatialHash.query(a.position, 4.5), obstacles: colliders,
      });
      // Keep an experimental behavior returning invalid values from corrupting the world.
      if (!Number.isFinite(velocity.x) || !Number.isFinite(velocity.z)) return { x: 0, z: 0 };
      const magnitude = Math.hypot(velocity.x, velocity.z), limit = a.preferredSpeed * 2;
      return magnitude > limit ? { x: velocity.x * limit / magnitude, z: velocity.z * limit / magnitude } : velocity;
    });
    this.agents.forEach((a, i) => {
      const blend = 1 - Math.exp(-dt * 5);
      a.velocity.x += (velocities[i].x - a.velocity.x) * blend;
      a.velocity.z += (velocities[i].z - a.velocity.z) * blend;
      const oldX = a.position.x, oldZ = a.position.z;
      a.position.x += a.velocity.x * dt; a.position.z += a.velocity.z * dt;
      constrainPosition(a.position, a.radius);
      a.velocity.x = (a.position.x - oldX) / dt; a.velocity.z = (a.position.z - oldZ) / dt;
      a.distance += Math.hypot(a.position.x - oldX, a.position.z - oldZ);
    });
  }
  get averageSpeed() { return this.agents.reduce((sum, a) => sum + Math.hypot(a.velocity.x, a.velocity.z), 0) / (this.agents.length || 1); }
}
