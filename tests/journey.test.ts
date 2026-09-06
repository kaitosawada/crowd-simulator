import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from '../src/simulation/Simulation';
import { Journey } from '../src/simulation/journey';
import { constrainMovement, EXITS, SHOPS, STAIRS, UPPER_FLOOR, type WalkingSurface } from '../src/simulation/layout';

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
    const onStair: WalkingSurface = { floor: 0, stair: STAIRS.indexOf(s), elevation: UPPER_FLOOR / 2 };
    const sideways = { x: s.x + s.halfWidth + 1, z: 0 };
    constrainMovement(sideways, { x: s.x, z: 0 }, onStair, 0.32);
    assert.equal(sideways.x, s.x + s.halfWidth - 0.32);
    assert.equal(onStair.elevation, UPPER_FLOOR / 2);
  }
});

test('all entrance/exit pairs and shop frontages are continuously traversable', () => {
  for (let origin = 0; origin < EXITS.length; origin++) for (let destination = 0; destination < EXITS.length; destination++) {
    if (origin === destination) continue;
    for (const purpose of ['transit', 'shopping'] as const) for (const lane of [-0.6, 0.6]) {
      const journey = new Journey(EXITS[origin].x < 0 ? 0 : 1, origin % 2 ? 1 : -1, lane,
        { origin, destination, purpose, shops: purpose === 'shopping' ? [(origin + destination) % SHOPS.length] : [] });
      const surface: WalkingSurface = { floor: 0, stair: null, elevation: 0 };
      let previous = journey.sample(0);
      for (let progress = 0.15; progress < journey.length; progress += 0.15) {
        const expected = journey.sample(progress), position = { x: expected.x, z: expected.z };
        constrainMovement(position, previous, surface, 0.32);
        assert.ok(Math.hypot(position.x - expected.x, position.z - expected.z) < 0.001,
          `${purpose} ${origin}→${destination} lane ${lane} blocked at ${JSON.stringify(expected)}`);
        assert.ok(Math.abs(surface.elevation - expected.elevation) < 0.04, 'continuous stair elevation');
        previous = expected;
      }
      assert.equal(surface.floor, 0);
      assert.equal(surface.stair, null);
    }
  }
});

test('diverse errands visit shops, wait, resume, and leave through all six exits', () => {
  const simulation = new Simulation(48);
  assert.deepEqual(new Set(simulation.agents.map(a => a.purpose)), new Set(['transit', 'shopping', 'stroll']));
  assert.deepEqual(new Set(simulation.agents.map(a => a.floor)), new Set([0, 1]));
  const exits = new Set<number>(), shops = new Set<number>(), waited = new Set<number>(), resumed = new Set<number>();
  for (let i = 0; i < 18000; i++) {
    const before = simulation.agents.map(a => ({ elevation: a.elevation, trips: a.trips, dwell: a.dwellRemaining, x: a.position.x, z: a.position.z, journey: simulation.journeys.get(a.id)! }));
    simulation.update(1 / 30);
    for (const a of simulation.agents) {
      const previous = before[a.id];
      if (a.trips > previous.trips) {
        exits.add(previous.journey.options.destination);
        const next = simulation.journeys.get(a.id)!;
        assert.notEqual(next.options.origin, previous.journey.options.origin);
        assert.ok(Math.hypot(a.position.x - next.points[0].x, a.position.z - next.points[0].z) < 0.01);
        continue;
      }
      assert.ok(Math.abs(a.elevation - previous.elevation) < 0.08, 'no floor teleportation');
      if (a.dwellRemaining > 0) {
        waited.add(a.id);
        const stop = previous.journey.stops[a.stopIndex];
        shops.add(stop.shop);
        assert.equal(a.floor, 1);
        const target = previous.journey.sample(stop.progress);
        assert.ok(Math.hypot(a.position.x - target.x, a.position.z - target.z) < 0.46);
        if (previous.dwell > 0) {
          assert.equal(a.position.x, previous.x); assert.equal(a.position.z, previous.z);
          assert.ok(a.dwellRemaining < previous.dwell);
        }
      } else if (waited.has(a.id) && Math.hypot(a.velocity.x, a.velocity.z) > 0.5) resumed.add(a.id);
    }
  }
  assert.equal(exits.size, 6);
  assert.equal(shops.size, 8);
  assert.ok(waited.size > 20);
  for (const id of waited) assert.ok(resumed.has(id), `agent ${id} never resumed`);
  for (const a of simulation.agents) assert.ok(a.trips >= 1, `agent ${a.id} never exited (${a.purpose}, ${a.progress})`);
});

test('neighbors and the player are perceived on the same elevation only', () => {
  const simulation = new Simulation(2);
  for (const a of simulation.agents) a.position = { x: 0, z: 26 };
  simulation.agents[0].floor = 0; simulation.agents[0].stair = null; simulation.agents[0].elevation = 0;
  simulation.agents[1].floor = 1; simulation.agents[1].stair = null; simulation.agents[1].elevation = UPPER_FLOOR;
  const seen: number[][] = [];
  simulation.setAgentBehavior(0, () => ({ name: 'observe', computeVelocity: (_a, context) => { seen.push(context.neighbors.map(n => n.id)); return { x: 0, z: 0 }; } }));
  simulation.update(1 / 30, { id: -1, position: { x: 1, z: 26 }, elevation: UPPER_FLOOR, velocity: { x: 0, z: 0 }, radius: 0.45 });
  assert.ok(!seen[0].includes(1)); assert.ok(!seen[0].includes(-1));
  simulation.update(1 / 30, { id: -1, position: { x: 1, z: 26 }, elevation: 0, velocity: { x: 0, z: 0 }, radius: 0.45 });
  assert.ok(seen[1].includes(-1));
});
