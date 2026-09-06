import type { CircleObstacle, Vec2 } from './types';

export const LAYOUT = { outerX: 50, outerZ: 34, innerX: 34, innerZ: 18, height: 12.6 } as const;
export const UPPER_FLOOR = 6;
export const STAIR_STEPS = 28;
export const STAIRS = [-46, 46].map(x => ({ x, halfWidth: 2.5, bottom: -10, top: 10 }));
export const EXITS = [
  { x: -46, z: -32.5, name: '西改札', english: 'WEST GATES', stair: 0 },
  { x: 46, z: -32.5, name: '東改札', english: 'EAST GATES', stair: 1 },
  { x: -16, z: -32.5, name: '北口 A', english: 'NORTH A', stair: null },
  { x: 16, z: -32.5, name: '北口 B', english: 'NORTH B', stair: null },
  { x: -16, z: 32.5, name: '南口 A', english: 'SOUTH A', stair: null },
  { x: 16, z: 32.5, name: '南口 B', english: 'SOUTH B', stair: null },
];
export const SHOPS = [-1, 1].flatMap(side => [
  { x: -25, name: 'キオスク', english: 'KIOSK', duration: 12 },
  { x: -9, name: 'カフェ', english: 'CONCOURSE COFFEE', duration: 45 },
  { x: 9, name: '書店', english: 'BOOKS & TRAVEL', duration: 30 },
  { x: 25, name: 'マーケット', english: 'EKI MARKET', duration: 22 },
].map(shop => ({ ...shop, z: side * 19.5 })));
export interface BoxObstacle extends Vec2 { halfX: number; halfZ: number }
/** Shop-local depth runs inward from the frontage, on either side of the core. */
export function shopPoint(shop: number, x: number, depth: number): Vec2 {
  return { x: SHOPS[shop].x + x, z: Math.sign(SHOPS[shop].z) * (18 - depth) };
}
export const SHOP_QUEUE_SIZE = 6;
export const shopInteriors = SHOPS.map((_, shop) => ({
  entrance: shopPoint(shop, -4, -1.5),
  exit: shopPoint(shop, 4, -1.5),
  // Leave 1.2 m between the rear wall (depth 8) and the counter's back edge.
  counter: { ...shopPoint(shop, -4, 6.5), halfX: 1, halfZ: 0.3 },
  queue: Array.from({ length: SHOP_QUEUE_SIZE }, (_, i) => shopPoint(shop, -4, 5.55 - i)),
  activities: [5.8, 2.5].flatMap(depth => [-1.5, 0.5, 2.5].map(x => shopPoint(shop, x, depth))),
}));
// The ground floor remains solid. Upstairs the same boxes drive rendering and collisions.
export const upperCore: BoxObstacle[] = [{ x: 0, z: 0, halfX: 34, halfZ: 5 }];
for (const side of [-1, 1]) {
  upperCore.push({ x: 0, z: side * 7.5, halfX: 34, halfZ: 2.5 });
  let edge = -34;
  for (const shop of SHOPS.filter(s => Math.sign(s.z) === side)) {
    const left = shop.x - 6.75;
    upperCore.push({ x: (edge + left) / 2, z: side * 14, halfX: (left - edge) / 2, halfZ: 4 });
    edge = shop.x + 6.75;
    for (const [x, halfX] of [[-5.975, 0.775], [0, 2.8], [5.975, 0.775]]) {
      upperCore.push({ x: shop.x + x, z: side * 18, halfX, halfZ: 0.1 });
    }
  }
  upperCore.push({ x: (edge + 34) / 2, z: side * 14, halfX: (34 - edge) / 2, halfZ: 4 });
}
export const shopFurniture: BoxObstacle[] = shopInteriors.flatMap((room, shop) => [
  room.counter,
  ...room.activities.map((p, i) => ({ x: p.x, z: p.z + Math.sign(SHOPS[shop].z) * (i < 3 ? -0.9 : 0.9), halfX: 0.65, halfZ: 0.3 })),
]);
const upperSolids = [...upperCore, ...shopFurniture];
export interface WalkingSurface { floor: 0 | 1; stair: number | null; elevation: number }
export const obstacles: CircleObstacle[] = [];
for (const x of [-40, -24, -8, 8, 24, 40]) {
  for (const z of [-31, 31]) obstacles.push({ x, z, radius: 0.65 });
}
// East/west circulation stays clear for the stair flights and their approaches.
// Planters and benches sit at the inner edge and are shared with the visual scene.
export const planters = [-24, 0, 24].flatMap(x => [-20.2, 20.2].map(z => ({ x, z, radius: 1.05 })));
export const benches = [-12, 12].flatMap(x => [-20, 20].map(z => ({ x, z, halfX: 2, halfZ: 0.65 })));
export const gates = STAIRS.flatMap(s => [-1.7, 0, 1.7].map(dx => ({ x: s.x + dx, z: -32, halfX: 0.15, halfZ: 0.9 })));
export const colliders = [...obstacles, ...planters];

function outsideBox(p: Vec2, hx: number, hz: number, radius: number, cx = 0, cz = 0) {
  const lx = p.x - cx, lz = p.z - cz;
  const qx = Math.max(-hx, Math.min(hx, lx)), qz = Math.max(-hz, Math.min(hz, lz));
  const dx = lx - qx, dz = lz - qz, distance = Math.hypot(dx, dz);
  if (distance > 0 && distance < radius) {
    p.x = cx + qx + dx / distance * radius;
    p.z = cz + qz + dz / distance * radius;
  } else if (distance === 0) {
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) p.x = cx + Math.sign(lx || 1) * (hx + radius);
    else p.z = cz + Math.sign(lz || 1) * (hz + radius);
  }
}

export function constrainPosition(p: Vec2, radius: number, floor: 0 | 1 = 0): void {
  p.x = Math.max(-LAYOUT.outerX + radius, Math.min(LAYOUT.outerX - radius, p.x));
  p.z = Math.max(-LAYOUT.outerZ + radius, Math.min(LAYOUT.outerZ - radius, p.z));
  if (floor === 0) outsideBox(p, LAYOUT.innerX, LAYOUT.innerZ, radius);
  else if (Math.abs(p.x) < LAYOUT.innerX + radius && Math.abs(p.z) < LAYOUT.innerZ + 0.1 + radius) {
    for (const b of upperSolids) outsideBox(p, b.halfX, b.halfZ, radius, b.x, b.z);
  }
  for (const c of floor === 0 ? colliders : obstacles) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), r = radius + c.radius;
    if (d < r) { p.x = c.x + (d ? dx / d : 1) * r; p.z = c.z + (d ? dz / d : 0) * r; }
  }
  for (const b of floor === 0 ? [...benches, ...gates] : []) outsideBox(p, b.halfX, b.halfZ, radius, b.x, b.z);
}
export function isWalkable(p: Vec2, radius = 0.3, floor: 0 | 1 = 0): boolean {
  const constrained = { ...p };
  constrainPosition(constrained, radius, floor);
  return Math.hypot(constrained.x - p.x, constrained.z - p.z) < 0.001;
}

/** Uniform arc-length parameterization of a rounded rectangular, closed route. */
export class LoopRoute {
  private readonly straightX = 66;
  private readonly straightZ = 34;
  private readonly radius = 9;
  readonly length = 2 * (this.straightX + this.straightZ) + 2 * Math.PI * this.radius;

  sample(progress: number, lane = 0): { position: Vec2; tangent: Vec2 } {
    let s = ((progress % this.length) + this.length) % this.length;
    const arc = Math.PI / 2 * this.radius;
    const lengths = [66, arc, 34, arc, 66, arc, 34, arc];
    let segment = 0;
    while (segment < 7 && s >= lengths[segment]) s -= lengths[segment++];
    let x = 0, z = 0, tx = 0, tz = 0;
    if (segment === 0) { x = -33 + s; z = -26; tx = 1; }
    else if (segment === 2) { x = 42; z = -17 + s; tz = 1; }
    else if (segment === 4) { x = 33 - s; z = 26; tx = -1; }
    else if (segment === 6) { x = -42; z = 17 - s; tz = -1; }
    else {
      const corner = (segment - 1) / 2;
      const angle = -Math.PI / 2 + corner * Math.PI / 2 + s / this.radius;
      const cx = [33, 33, -33, -33][corner], cz = [-17, 17, 17, -17][corner];
      x = cx + Math.cos(angle) * this.radius; z = cz + Math.sin(angle) * this.radius;
      tx = -Math.sin(angle); tz = Math.cos(angle);
    }
    return { position: { x: x - tz * lane, z: z + tx * lane }, tangent: { x: tx, z: tz } };
  }

  project(position: Vec2, previous: number): number {
    let best = previous, min = Infinity;
    for (let offset = -4; offset <= 4; offset += 0.5) {
      const point = this.sample(previous + offset).position;
      const d = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
      if (d < min) { min = d; best = previous + offset; }
    }
    return ((best % this.length) + this.length) % this.length;
  }
}

/** Shared floor transitions for players and NPCs. Stair sides and floor openings are solid. */
export function constrainMovement(p: Vec2, previous: Vec2, surface: WalkingSurface, radius: number) {
  constrainPosition(p, radius, surface.floor);
  if (surface.stair === null) {
    for (let i = 0; i < STAIRS.length; i++) {
      const s = STAIRS[i];
      const insideWidth = Math.abs(p.x - s.x) <= s.halfWidth - radius;
      const atEntrance = surface.floor === 0 ? previous.z <= s.bottom : previous.z >= s.top;
      if (insideWidth && atEntrance) {
        const crossed = surface.floor === 0 ? p.z >= s.bottom : p.z <= s.top;
        if (crossed) { surface.stair = i; break; }
        continue;
      }
      outsideBox(p, s.halfWidth, (s.top - s.bottom) / 2, radius, s.x, (s.top + s.bottom) / 2);
    }
  }
  if (surface.stair !== null) {
    const s = STAIRS[surface.stair];
    p.x = Math.max(s.x - s.halfWidth + radius, Math.min(s.x + s.halfWidth - radius, p.x));
    surface.elevation = Math.max(0, Math.min(1, (p.z - s.bottom) / (s.top - s.bottom))) * UPPER_FLOOR;
    if (p.z < s.bottom) { surface.floor = 0; surface.stair = null; }
    else if (p.z > s.top) { surface.floor = 1; surface.stair = null; }
  } else surface.elevation = surface.floor * UPPER_FLOOR;
}
