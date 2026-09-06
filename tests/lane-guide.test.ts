import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import { createLaneGuide, LANE_COLORS } from '../src/render/LaneGuide';
import { LoopRoute, STAIRS, UPPER_FLOOR, STAIR_STEPS } from '../src/simulation/layout';

for (const separated of [true, false]) {
  test(`lane bands have valid, local triangles (separated=${separated})`, () => {
    const mesh = createLaneGuide(new LoopRoute(), separated);
    const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const vertices = [0, 1, 2].map(j => indices.getX(i + j));
      for (const vertex of vertices) assert.ok(vertex >= 0 && vertex < positions.count);
      const heights = vertices.map(vertex => positions.getY(vertex));
      assert.ok(Math.max(...heights) - Math.min(...heights) < 0.3, 'triangle must not bridge floors');
      const xs = vertices.map(vertex => positions.getX(vertex));
      const zs = vertices.map(vertex => positions.getZ(vertex));
      assert.ok(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) < 12,
        'closing seam must not cut across the station');
    }
    mesh.geometry.dispose(); mesh.material.dispose();
  });
  test(`stair bands cover both flights above every tread (separated=${separated})`, () => {
    const mesh = createLaneGuide(new LoopRoute(), separated);
    const positions = mesh.geometry.getAttribute('position'), colors = mesh.geometry.getAttribute('color');
    for (const stair of STAIRS) for (const direction of separated ? [1, -1] : [0]) {
      const color = new Color(direction === 1 ? LANE_COLORS.up : direction === -1 ? LANE_COLORS.down : LANE_COLORS.shared);
      const vertices = Array.from({ length: positions.count }, (_, i) => i).filter(i =>
        Math.abs(positions.getX(i) - stair.x) < stair.halfWidth &&
        Math.abs(colors.getX(i) - color.r) < 1e-6 && Math.abs(colors.getY(i) - color.g) < 1e-6 && Math.abs(colors.getZ(i) - color.b) < 1e-6);
      assert.ok(vertices.length > 0);
      const xs = vertices.map(i => positions.getX(i));
      assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 1.4) < 1e-5);
      assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - stair.x - direction * 0.85) < 1e-5);
      for (let step = 1; step <= STAIR_STEPS; step++) {
        assert.ok(vertices.some(i => Math.abs(positions.getY(i) - (step / STAIR_STEPS * UPPER_FLOOR + 0.04)) < 1e-5),
          `missing visible marking on tread ${step}`);
      }
    }
    mesh.geometry.dispose(); mesh.material.dispose();
  });
}
