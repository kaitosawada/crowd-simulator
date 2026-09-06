import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from '../src/simulation/Simulation';
import { Journey } from '../src/simulation/journey';
import { constrainMovement, STAIRS, UPPER_FLOOR, type WalkingSurface } from '../src/simulation/layout';

test('both stairs and both directions form a continuous, traversable gate-to-gate trip', () => {
  for (const stair of [0, 1]) for (const direction of [1, -1] as const) for (const lane of [-0.6, 0.6]) {
    const journey = new Journey(stair, direction, lane);
    const surface: WalkingSurface = { floor: 0, stair: null, elevation: 0 };
    let previous = journey.sample(0);
    const visited = new Set<number>();
    for (let progress = 0.1; progress <= journey.length; progress += 0.1) {
      const expected = journey.sample(progress), position = { x: expected.x, z: expected.z };
      constrainMovement(position, previous, surface, 0.32);
      assert.ok(Math.hypot(position.x - expected.x, position.z - expected.z) < 0.001, `blocked at ${JSON.stringify(expected)}`);
      assert.ok(Math.abs(surface.elevation - expected.elevation) < 0.02);
      visited.add(surface.floor); previous = { ...position, elevation: surface.elevation };
    }
    assert.deepEqual([...visited], [0, 1]);
    assert.equal(surface.floor, 0); assert.equal(surface.stair, null);
  }
});

test('stair sides and upper openings prevent sideways entry, falling, and floor teleportation', () => {
  for (const s of STAIRS) for (const floor of [0, 1] as const) {
    const surface: WalkingSurface = { floor, stair: null, elevation: floor * UPPER_FLOOR };
    const previous = { x: s.x - s.halfWidth - 0.4, z: 0 };
    const position = { x: previous.x + 0.3, z: 0 };
    constrainMovement(position, previous, surface, 0.32);
    assert.ok(position.x <= s.x - s.halfWidth - 0.32);
    assert.equal(surface.floor, floor); assert.equal(surface.stair, null);
    const onStair: WalkingSurface = { floor: 0, stair: STAIRS.indexOf(s), elevation: 2.1 };
    const sideways = { x: s.x + s.halfWidth + 1, z: 0 };
    constrainMovement(sideways, { x: s.x, z: 0 }, onStair, 0.32);
    assert.equal(sideways.x, s.x + s.halfWidth - 0.32);
    assert.equal(onStair.elevation, 2.1);
  }
});

test('48 NPCs leave gates, climb, visit all four sides upstairs, descend and return in both directions', () => {
  const simulation = new Simulation(48);
  const visited = simulation.agents.map(() => new Set<string>());
  const gates = new Set<number>(), directions = new Set<number>();
  for (let i = 0; i < 18000; i++) {
    const heights = simulation.agents.map(a => a.elevation);
    simulation.update(1 / 30);
    for (const a of simulation.agents) {
      assert.ok(Math.abs(a.elevation - heights[a.id]) < 0.08, 'no floor teleportation');
      if (a.active && a.floor === 0 && a.position.z < -30) gates.add(Math.sign(a.position.x));
      if (a.floor === 1 && a.stair === null) {
        directions.add(a.direction);
        if (a.position.z < -22) visited[a.id].add('north');
        if (a.position.z > 22) visited[a.id].add('south');
        if (a.position.x < -38) visited[a.id].add('west');
        if (a.position.x > 38) visited[a.id].add('east');
      }
    }
  }
  assert.equal(gates.size, 2); assert.equal(directions.size, 2);
  for (const a of simulation.agents) {
    assert.ok(a.trips >= 1, `agent ${a.id} did not return`);
    assert.equal(visited[a.id].size, 4, `agent ${a.id} must make a full lap`);
  }
});

test('neighbors and the player are perceived on the same elevation only', () => {
  const simulation = new Simulation(2);
  for (const a of simulation.agents) { a.active = true; a.position = { x: 0, z: 26 }; }
  simulation.agents[1].floor = 1; simulation.agents[1].elevation = UPPER_FLOOR;
  const seen: number[][] = [];
  simulation.setAgentBehavior(0, () => ({ name: 'observe', computeVelocity: (_a, context) => { seen.push(context.neighbors.map(n => n.id)); return { x: 0, z: 0 }; } }));
  simulation.update(1 / 30, { id: -1, position: { x: 1, z: 26 }, elevation: UPPER_FLOOR, velocity: { x: 0, z: 0 }, radius: 0.45 });
  assert.ok(!seen[0].includes(1)); assert.ok(!seen[0].includes(-1));
  simulation.update(1 / 30, { id: -1, position: { x: 1, z: 26 }, elevation: 0, velocity: { x: 0, z: 0 }, radius: 0.45 });
  assert.ok(seen[1].includes(-1));
});
