import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from '../src/simulation/Simulation';
import { Journey } from '../src/simulation/journey';
import { constrainMovement, EXITS, SHOPS, STAIRS, UPPER_FLOOR, type WalkingSurface } from '../src/simulation/layout';

test('walkers displaced ahead continue forward without returning to the old projection window', () => {
  for (const [origin, destination, direction] of [[2, 3, 1], [3, 2, -1]]) {
    const journey = new Journey(0, 1, 0, { origin, destination, purpose: 'transit' });
    const previous = 22.5;
    journey.startNavigation(previous);
    const position = { x: direction * 7, z: -26 };
    const result = journey.navigate(position, previous, { floor: 0, stair: null, elevation: 0 }, 0.3);
    assert.ok(result.progress > previous + 6.8, 'recognize progress made while avoiding');
    assert.ok(direction * (result.target.x - position.x) > 1, 'target stays ahead');
  }
});

test('sideways avoidance rejoins farther ahead instead of pulling directly back to the lane', () => {
  const journey = new Journey(0, 1, 0, { origin: 2, destination: 3, purpose: 'transit' });
  const result = journey.navigate({ x: 0, z: -30 }, 22.5, { floor: 0, stair: null, elevation: 0 }, 0.3);
  assert.ok(result.target.x > 5, 'use the open diagonal toward the destination');
  assert.ok(Math.abs(result.progress - 22.5) < 0.11, 'lookahead is not counted as distance already walked');
});

test('forward rejoining does not cut through a column', () => {
  const journey = new Journey(0, 1, 0, { origin: 2, destination: 3, purpose: 'transit' });
  // A longer diagonal crosses the column at (-8, -31); the local approach is clear.
  const result = journey.navigate({ x: -11, z: -33 }, 11.5, { floor: 0, stair: null, elevation: 0 }, 0.3);
  assert.ok(result.target.x < -9, 'retain the local target when the shortcut is blocked');
});

test('forward rejoining respects the next shop stop', () => {
  const journey = new Journey(0, 1, 0, { origin: 0, destination: 1, purpose: 'shopping', shops: [1] });
  const stop = journey.stops[0], position = journey.sample(stop.progress);
  const result = journey.navigate(position, stop.progress - 6,
    { floor: 1, stair: null, elevation: UPPER_FLOOR }, 0.3, stop.progress);
  assert.ok(result.progress <= stop.progress);
  assert.deepEqual(result.target, position, 'still visit the shop before taking the return leg');
});

test('displaced walkers clear the stair exit lane before taking a forward shortcut', () => {
  for (const stair of [0, 1]) {
    const journey = new Journey(stair, 1, 0), passage = journey.stairPassages[0];
    const progress = passage.end + 0.1, point = journey.sample(progress);
    journey.startNavigation(progress);
    const position = { x: point.x + (stair === 0 ? 1 : -1), z: point.z };
    const result = journey.navigate(position, progress, { floor: 1, stair: null, elevation: UPPER_FLOOR }, 0.3);
    assert.equal(result.target.x, passage.exit.x, 'keep the exit lane instead of cutting toward the ring');
    assert.ok(result.target.z > position.z, 'continue out of the stair opening');
    assert.ok(result.target.z <= 12, 'retain the landing approach before turning');
  }
});

test('both stairs and both directions form a continuous, traversable gate-to-gate trip', () => {
  for (const stair of [0, 1]) for (const direction of [1, -1] as const) for (const lane of [-0.6, -0.3, 0, 0.3, 0.6]) {
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

test('walkers displaced beside either stair return to the entrance and complete the floor transition', () => {
  for (const stairIndex of [0, 1]) for (const passageIndex of [0, 1]) for (const side of [-1, 1]) {
    // Also cover a route projection that has already run beyond the stair flight.
    for (const pastFlight of [false, true]) {
      const simulation = new Simulation(1);
      const journey = new Journey(stairIndex, 1, 0);
      simulation.journeys.set(0, journey);
      const agent = simulation.agents[0], passage = journey.stairPassages[passageIndex], stair = STAIRS[stairIndex];
      journey.startNavigation(passage.start);
      const direction = Math.sign(passage.exit.z - passage.entrance.z);
      Object.assign(agent, {
        position: { x: stair.x + side * (stair.halfWidth + agent.radius), z: passage.entrance.z + direction * 2 },
        floor: passage.entrance.elevation === 0 ? 0 : 1, stair: null, elevation: passage.entrance.elevation,
        progress: pastFlight ? passage.end + 1 : passage.start + 2, stopIndex: 0, dwellRemaining: 0,
      });
      let entered = false, completed = false;
      for (let i = 0; i < 1800; i++) {
        const previousElevation = agent.elevation;
        simulation.update(1 / 30);
        if (!entered && agent.stair === null) assert.ok(agent.progress <= passage.start, 'cannot skip the entrance');
        assert.ok(Math.abs(agent.elevation - previousElevation) < 0.08, 'must not teleport to another floor');
        if (agent.stair !== null) entered = true;
        if (entered && agent.stair === null && agent.elevation === passage.exit.elevation) { completed = true; break; }
      }
      assert.ok(completed, `stair ${stairIndex}, passage ${passageIndex}, side ${side}, past flight ${pastFlight}`);
    }
  }
});

test('walkers pushed onto a stair during a flat route return to their intended floor', () => {
  for (const stairIndex of [0, 1]) for (const floor of [0, 1] as const) {
    const simulation = new Simulation(1), journey = new Journey(stairIndex, 1, 0);
    simulation.journeys.set(0, journey);
    const agent = simulation.agents[0], stair = STAIRS[stairIndex];
    const progress = floor === 1 ? journey.stairPassages[0].end + 5 : 5;
    journey.startNavigation(progress);
    Object.assign(agent, { position: { x: stair.x, z: floor === 1 ? stair.top - 0.2 : stair.bottom + 0.2 },
      floor, stair: stairIndex, elevation: floor === 1 ? UPPER_FLOOR - 0.06 : 0.06,
      progress, stopIndex: 0, dwellRemaining: 0 });
    for (let i = 0; i < 90 && agent.stair !== null; i++) {
      simulation.update(1 / 30);
      assert.equal(agent.progress, progress, 'keep the original route while recovering');
    }
    assert.equal(agent.stair, null);
    assert.equal(agent.floor, floor);
    assert.equal(agent.elevation, floor * UPPER_FLOOR);
  }
});

test('walkers returning to the upper landing clear the opening before rejoining the side corridor', () => {
  for (const stairIndex of [0, 1]) {
    const simulation = new Simulation(1), stair = STAIRS[stairIndex];
    const journey = new Journey(stairIndex, 1, 0,
      { origin: stairIndex, destination: 1 - stairIndex, purpose: 'shopping', shops: [stairIndex === 0 ? 0 : 3] });
    simulation.journeys.set(0, journey);
    simulation.setAlgorithm('route');
    const agent = simulation.agents[0], progress = journey.stairPassages[0].end + 17;
    journey.startNavigation(progress);
    Object.assign(agent, { position: { x: stair.x, z: stair.top - 0.1 },
      floor: 1, stair: stairIndex, elevation: UPPER_FLOOR - 0.03,
      progress, velocity: { x: 0, z: 0 }, stopIndex: 0, dwellRemaining: 0 });
    let reachedLanding = false;
    for (let frame = 0; frame < 300; frame++) {
      simulation.update(1 / 30);
      if (agent.stair === null) reachedLanding = true;
      if (reachedLanding) {
        assert.equal(agent.stair, null, 'do not descend again while rejoining the upper corridor');
        assert.equal(agent.elevation, UPPER_FLOOR);
      }
    }
    assert.ok(reachedLanding);
    assert.ok(Math.abs(agent.position.x - stair.x) > stair.halfWidth + agent.radius, 'clear the side of the opening');
    assert.ok(agent.progress > progress + 3, 'resume the journey after recovering');
  }
});

test('all entrance/exit pairs and shop frontages are continuously traversable', () => {
  for (let origin = 0; origin < EXITS.length; origin++) for (let destination = 0; destination < EXITS.length; destination++) {
    if (origin === destination) continue;
    for (const purpose of ['transit', 'shopping'] as const) for (const lane of [-0.6, -0.3, 0, 0.3, 0.6]) {
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

test('journeys spread across the north and south corridors', () => {
  for (const [origin, destination] of [[2, 3], [4, 5]]) {
    const positions = [-0.6, 0.6].map(lane => {
      const journey = new Journey(0, 1, lane, { origin, destination, purpose: 'transit' });
      return journey.points.filter(p => Math.abs(p.x) < 1);
    });
    assert.ok(positions.every(points => points.length > 0));
    assert.ok(Math.abs(positions[0][0].z - positions[1][0].z) >= 6, 'use at least six meters of corridor width');
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
        const shop = SHOPS[stop.shop];
        assert.ok(Math.abs(a.position.x - shop.x) < 6.75 && Math.abs(a.position.z) < 18,
          'customers dwell inside the shop');
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
  // A stop begun near 600 seconds may still be within its scheduled dwell.
  // Give the observed shoppers time to finish, with a bounded restart deadline.
  for (let i = 0; i < 2700 && [...waited].some(id => !resumed.has(id)); i++) {
    simulation.update(1 / 30);
    for (const a of simulation.agents) {
      if (waited.has(a.id) && a.dwellRemaining === 0 && Math.hypot(a.velocity.x, a.velocity.z) > 0.5) resumed.add(a.id);
    }
  }
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
