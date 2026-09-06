import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from '../src/simulation/Simulation';
import { Journey } from '../src/simulation/journey';
import { constrainMovement, isWalkable, SHOPS, shopInteriors, shopPoint, UPPER_FLOOR } from '../src/simulation/layout';

function customer(simulation: Simulation, index: number, shop: number) {
  const a = simulation.agents[index];
  const journey = new Journey(0, 1, 0, { origin: 0, destination: 1, purpose: 'shopping', shops: [shop] });
  simulation.journeys.set(a.id, journey);
  const stop = journey.stops[0];
  journey.startNavigation(stop.progress);
  Object.assign(a, { floor: 1, stair: null, elevation: UPPER_FLOOR, progress: stop.progress,
    position: { ...shopInteriors[shop].entrance }, velocity: { x: 0, z: 0 }, stopIndex: 0, dwellRemaining: 0 });
  return { a, stop };
}

test('shop doors open only upstairs; walls and furniture stay solid for NPCs and players', () => {
  for (let shop = 0; shop < SHOPS.length; shop++) {
    for (const x of [-4, 4]) {
      const surface = { floor: 1 as const, stair: null, elevation: UPPER_FLOOR };
      let previous = shopPoint(shop, x, -1.5);
      for (let depth = -1.4; depth <= 1; depth += 0.1) {
        const expected = shopPoint(shop, x, depth), position = { ...expected };
        constrainMovement(position, previous, surface, 0.45);
        assert.deepEqual(position, expected);
        previous = position;
      }
      assert.ok(!isWalkable(shopPoint(shop, x, 1), 0.3, 0));
    }
    assert.ok(!isWalkable(shopPoint(shop, 0, 0), 0.3, 1));
    assert.ok(!isWalkable(shopPoint(shop, -4, 7.45), 0.3, 1));
    for (const point of [...shopInteriors[shop].queue, ...shopInteriors[shop].activities]) assert.ok(isWalkable(point, 0.45, 1));
  }
});

test('every shop admits, serves, hosts and releases a customer by walking', () => {
  const s = new Simulation(8);
  const phases = s.agents.map(() => new Set<string>());
  for (let shop = 0; shop < 8; shop++) customer(s, shop, shop);
  const completed = new Set<number>();
  for (let frame = 0; frame < 3600; frame++) {
    const before = s.agents.map(a => ({ ...a.position }));
    s.update(1 / 30);
    for (const a of s.agents) {
      const visit = s.shops.visits.get(a.id);
      if (visit) {
        phases[a.id].add(visit.phase);
        assert.ok(isWalkable(a.position, a.radius, 1));
        assert.ok(Math.hypot(a.position.x - before[a.id].x, a.position.z - before[a.id].z) < 0.1);
      } else if (phases[a.id].has('exiting')) completed.add(a.id);
    }
  }
  assert.equal(completed.size, 8);
  for (const seen of phases) assert.deepEqual(seen, new Set(['entering', 'queue', 'service', 'browsing', 'dwell', 'exiting']));
});

test('queue admission is bounded and removed customers release reservations', () => {
  const s = new Simulation(7);
  for (let i = 0; i < 7; i++) {
    const { a, stop } = customer(s, i, 0);
    assert.equal(s.shops.enter(a, stop), i < 6);
  }
  assert.equal(s.shops.visits.size, 6);
  s.setCount(3);
  assert.equal(s.shops.visits.size, 3);
  s.reset();
  assert.equal(s.shops.visits.size, 0);
});

test('a full queue is served in arrival order and every reserved bay is released', () => {
  const s = new Simulation(6), served: number[] = [];
  for (let i = 0; i < 6; i++) {
    const { a, stop } = customer(s, i, 1);
    s.shops.enter(a, stop);
    s.shops.visits.get(a.id)!.phase = 'queue';
    a.position = { ...shopInteriors[1].queue[i] };
  }
  for (let frame = 0; frame < 5400; frame++) {
    s.update(1 / 30);
    for (const [id, visit] of s.shops.visits) {
      if (visit.phase === 'service' && !served.includes(id)) served.push(id);
    }
    if (served.length === 6 && s.shops.visits.size === 0) break;
  }
  assert.deepEqual(served, [0, 1, 2, 3, 4, 5]);
  assert.equal(s.shops.visits.size, 0);
});

test('simultaneous arrivals cannot surround the first customer at the entrance', () => {
  const s = new Simulation(6), served: number[] = [];
  for (let i = 0; i < 6; i++) {
    const { a, stop } = customer(s, i, 1);
    a.position.x += (i % 3 - 1) * 0.8;
    a.position.z -= Math.floor(i / 3) * 1.1;
    s.shops.enter(a, stop);
  }
  for (let frame = 0; frame < 5400; frame++) {
    s.update(1 / 30);
    for (const [id, visit] of s.shops.visits) {
      if (visit.phase === 'service' && !served.includes(id)) served.push(id);
    }
    if (served.length === 6 && s.shops.visits.size === 0) break;
  }
  assert.deepEqual(served, [0, 1, 2, 3, 4, 5]);
  assert.equal(s.shops.visits.size, 0);
});

test('a customer who cleared the door releases the bay without converging on an outside point', () => {
  for (const shop of [1, 5]) {
    const s = new Simulation(1), { a, stop } = customer(s, 0, shop);
    s.shops.enter(a, stop);
    const visit = s.shops.visits.get(a.id)!;
    visit.phase = 'queue'; a.position = { ...shopInteriors[shop].queue[0] };
    s.shops.target(a, 1 / 30);
    assert.equal(visit.bay, 0);
    visit.phase = 'exiting'; a.dwellRemaining = 0;
    visit.path = [shopInteriors[shop].exit];
    a.position = shopPoint(shop, 4.7, -0.5);
    assert.equal(s.shops.target(a, 1 / 30), null);
    assert.equal(s.shops.visits.size, 0);
    const next = customer(s, 0, shop);
    s.shops.enter(a, next.stop);
    s.shops.visits.get(a.id)!.phase = 'queue';
    a.position = { ...shopInteriors[shop].queue[0] };
    s.shops.target(a, 1 / 30);
    assert.equal(s.shops.visits.get(a.id)!.bay, 0, 'the next customer can use the released bay');
  }
});

test('a full shop is passed by and lane toggles preserve an ongoing visit', () => {
  const s = new Simulation(7);
  for (let i = 0; i < 6; i++) {
    const { a, stop } = customer(s, i, 0);
    s.shops.enter(a, stop);
  }
  const { a: last } = customer(s, 6, 0);
  s.update(1 / 30);
  assert.equal(last.stopIndex, 1);
  assert.ok(!s.shops.visits.has(last.id));
  const first = s.agents[0], before = { ...first.position };
  s.setLaneSeparation(false);
  assert.deepEqual(first.position, before);
  assert.equal(s.shops.visits.get(first.id)?.phase, 'entering');
});
