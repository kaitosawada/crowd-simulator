import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation, MAX_AGENTS } from '../src/simulation/Simulation';
import { constrainPosition, isWalkable, LoopRoute } from '../src/simulation/layout';
import { PredictiveAvoidanceBehavior } from '../src/simulation/behaviors';
import { SpatialHash } from '../src/simulation/SpatialHash';

test('closed route is continuous and all supported lanes stay inside the concourse', () => {
  const route = new LoopRoute();
  assert.deepEqual(route.sample(0), route.sample(route.length));
  for (let s = 0; s < route.length; s += 0.3) {
    for (const lane of [-3.5, 0, 3.5]) {
      const p = route.sample(s, lane).position;
      assert.ok(isWalkable(p), `Route at ${s}, lane ${lane} must be walkable`);
      const next = route.sample(s + 0.05, lane).position;
      assert.ok(Math.hypot(p.x - next.x, p.z - next.z) < 0.09);
    }
  }
});
test('wall, central block, column, and bench constraints keep a disk out of geometry', () => {
  for (const p of [{ x: 80, z: 28 }, { x: 0, z: 0 }, { x: -24, z: 31 }, { x: 12, z: 20 }, { x: -24, z: 20.2 }]) {
    constrainPosition(p, 0.32); assert.ok(isWalkable(p, 0.32));
  }
});
test('spatial hash finds neighbors across cell boundaries without returning far agents', () => {
  const hash = new SpatialHash(3);
  for (const [id, x] of [[0, 2.9], [1, 3.1], [2, 20]]) hash.insert({ id, position: { x, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.3 });
  assert.deepEqual(hash.query({ x: 3, z: 0 }, 1).map(a => a.id), [0, 1]);
});
test('bidirectional walkers complete more than a full lap without leaving walkable space', () => {
  const simulation = new Simulation(24);
  for (let i = 0; i < 10000; i++) {
    simulation.update(1 / 30);
    if (i % 30 === 0) for (const a of simulation.agents) {
      assert.ok(Number.isFinite(a.position.x) && Number.isFinite(a.position.z));
      assert.ok(isWalkable(a.position, a.radius), `agent ${a.id} at ${JSON.stringify(a.position)}`);
    }
  }
  for (const a of simulation.agents) assert.ok(a.distance > simulation.route.length, `agent ${a.id} moved ${a.distance}`);
});
test('pause, speed, population bounds, and reset are deterministic', () => {
  const simulation = new Simulation(12), start = structuredClone(simulation.agents);
  simulation.paused = true; simulation.update(0.1); assert.equal(simulation.time, 0);
  simulation.paused = false; simulation.speed = 2; simulation.update(0.1); assert.ok(Math.abs(simulation.time - 0.2) < 0.0001);
  simulation.reset(); assert.deepEqual(simulation.agents, start);
  simulation.setCount(MAX_AGENTS + 100); assert.equal(simulation.agents.length, MAX_AGENTS);
  simulation.setCount(-10); assert.equal(simulation.agents.length, 0); assert.equal(simulation.averageSpeed, 0);
});
test('predictive behavior changes course for the player ahead but route-only behavior does not', () => {
  const simulation = new Simulation(1), agent = simulation.agents[0];
  agent.position = { x: 0, z: 26 }; agent.velocity = { x: 1.3, z: 0 };
  const behavior = new PredictiveAvoidanceBehavior();
  const desiredVelocity = { x: 1.3, z: 0 };
  const context = { dt: 1 / 30, time: 0, desiredVelocity, obstacles: [], neighbors: [{ id: -1, position: { x: 1.4, z: 26 }, velocity: { x: 0, z: 0 }, radius: 0.45 }] };
  const result = behavior.computeVelocity(agent, context);
  assert.ok(Math.abs(result.z) > 0.1); assert.ok(result.x < desiredVelocity.x);
});
test('per-agent behaviors are independent and invalid custom output cannot poison state', () => {
  const simulation = new Simulation(2);
  simulation.setAgentBehavior(0, () => ({ name: 'stop', computeVelocity: () => ({ x: 0, z: 0 }) }));
  const start = { ...simulation.agents[0].position };
  for (let i = 0; i < 30; i++) simulation.update(1 / 30);
  assert.deepEqual(simulation.agents[0].position, start); assert.ok(simulation.agents[1].distance > 0.1);
  simulation.setAgentBehavior(0, () => ({ name: 'invalid', computeVelocity: () => ({ x: NaN, z: Infinity }) }));
  simulation.update(1 / 30); assert.ok(Number.isFinite(simulation.agents[0].position.x));
});
test('500 walkers remain finite and constrained under accelerated simulation', () => {
  const simulation = new Simulation(500); simulation.speed = 2;
  for (let i = 0; i < 180; i++) simulation.update(1 / 30);
  assert.equal(simulation.agents.length, 500);
  for (const a of simulation.agents) assert.ok(isWalkable(a.position, a.radius));
});
