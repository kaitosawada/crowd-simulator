import * as THREE from 'three';
import { LoopRoute, STAIRS, STAIR_STEPS, UPPER_FLOOR } from '../simulation/layout';
import { sampleLane } from '../simulation/journey';

export const LANE_COLORS = { corridor: '#397bdb', up: '#169b80', down: '#e88832', shared: '#9570d5' };
type Point = [number, number, number];

/** Floor markings follow the route envelope and the actual stair treads/risers. */
export function createLaneGuide(loop: LoopRoute, separated: boolean): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  function polygon(points: Point[], color: string) {
    const base = positions.length / 3, c = new THREE.Color(color);
    for (const point of points) { positions.push(...point); colors.push(c.r, c.g, c.b); }
    for (let i = 1; i < points.length - 1; i++) indices.push(base, base + i, base + i + 1);
  }
  function strip(x: number, half: number, z0: number, y0: number, z1: number, y1: number, color: string) {
    polygon([[x - half, y0, z0], [x + half, y0, z0], [x + half, y1, z1], [x - half, y1, z1]], color);
  }
  function arrow(x: number, y: number, z: number, direction: number, half = 0.35) {
    polygon([[x - half, y, z - direction * 0.22], [x + half, y, z - direction * 0.22],
      [x, y, z + direction * 0.26]], '#ffffff');
  }
  const steps = 240;
  for (const elevation of [0, UPPER_FLOOR]) {
    const base = positions.length / 3, color = new THREE.Color(LANE_COLORS.corridor);
    for (let i = 0; i < steps; i++) {
      const progress = i / steps * loop.length;
      for (const side of [-1, 1]) {
        const p = separated ? sampleLane(loop, progress, side * 0.6) : loop.sample(progress, side * 0.5).position;
        positions.push(p.x, elevation + 0.06, p.z); colors.push(color.r, color.g, color.b);
      }
      // Close each floor's ring onto itself, never onto the next mesh's vertices.
      const a = base + i * 2, b = base + ((i + 1) % steps) * 2;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  for (const stair of STAIRS) {
    const depth = (stair.top - stair.bottom) / STAIR_STEPS;
    for (const direction of separated ? [1, -1] : [0]) {
      const x = stair.x + direction * 0.85, half = 0.7;
      const color = direction === 1 ? LANE_COLORS.up : direction === -1 ? LANE_COLORS.down : LANE_COLORS.shared;
      strip(x, half, stair.bottom - 6, 0.06, stair.bottom, 0.06, color);
      for (let i = 0; i < STAIR_STEPS; i++) {
        const z = stair.bottom + i * depth, y = (i + 1) / STAIR_STEPS * UPPER_FLOOR;
        strip(x, half, z, y + 0.04, z + depth, y + 0.04, color);
        strip(x, half, z - 0.015, i / STAIR_STEPS * UPPER_FLOOR + 0.04, z - 0.015, y + 0.04, color);
        if (i % 4 === 2) {
          if (direction) arrow(x, y + 0.05, z + depth / 2, direction);
          else for (const d of [-1, 1]) arrow(x + d * 0.32, y + 0.05, z + depth / 2, d, 0.23);
        }
      }
      strip(x, half, stair.top, UPPER_FLOOR + 0.04, stair.top + 4, UPPER_FLOOR + 0.04, color);
      for (const [z, y] of [[stair.bottom - 2, 0], [stair.top + 1, UPPER_FLOOR]]) {
        if (direction) arrow(x, y + 0.07, z, direction);
        else for (const d of [-1, 1]) arrow(x + d * 0.32, y + 0.07, z, d, 0.23);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
    side: THREE.DoubleSide, fog: false, toneMapped: false,
  }));
  mesh.renderOrder = 1;
  return mesh;
}
