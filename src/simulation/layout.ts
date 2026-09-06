import type { CircleObstacle, Vec2 } from './types';

export const LAYOUT = { outerX: 50, outerZ: 34, innerX: 34, innerZ: 18, height: 8.4 } as const;
export const obstacles: CircleObstacle[] = [];
for (const x of [-40, -24, -8, 8, 24, 40]) {
  for (const z of [-31, 31]) obstacles.push({ x, z, radius: 0.65 });
}
for (const x of [-47, 47]) {
  for (const z of [-16, 0, 16]) obstacles.push({ x, z, radius: 0.65 });
}
// Planters and benches sit at the inner edge and are shared with the visual scene.
export const planters = [-24, 0, 24].flatMap(x => [-20.2, 20.2].map(z => ({ x, z, radius: 1.05 })));
export const benches = [-12, 12].flatMap(x => [-20, 20].map(z => ({ x, z, halfX: 2, halfZ: 0.65 })));
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

export function constrainPosition(p: Vec2, radius: number): void {
  p.x = Math.max(-LAYOUT.outerX + radius, Math.min(LAYOUT.outerX - radius, p.x));
  p.z = Math.max(-LAYOUT.outerZ + radius, Math.min(LAYOUT.outerZ - radius, p.z));
  outsideBox(p, LAYOUT.innerX, LAYOUT.innerZ, radius);
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), r = radius + c.radius;
    if (d < r) { p.x = c.x + (d ? dx / d : 1) * r; p.z = c.z + (d ? dz / d : 0) * r; }
  }
  for (const b of benches) outsideBox(p, b.halfX, b.halfZ, radius, b.x, b.z);
}
export function isWalkable(p: Vec2, radius = 0.3): boolean {
  const constrained = { ...p };
  constrainPosition(constrained, radius);
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
