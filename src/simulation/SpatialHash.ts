import type { Neighbor, Vec2 } from './types';

/** Local neighbor queries avoid an all-pairs scan as the population grows. */
export class SpatialHash {
  private cells = new Map<string, Neighbor[]>();
  constructor(readonly cellSize = 3) {}
  clear() { this.cells.clear(); }
  insert(agent: Neighbor) {
    const key = this.key(agent.position.x, agent.position.z);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(agent); else this.cells.set(key, [agent]);
  }
  query(position: Vec2, radius: number): Neighbor[] {
    const result: Neighbor[] = [], size = this.cellSize;
    for (let x = Math.floor((position.x - radius) / size); x <= Math.floor((position.x + radius) / size); x++) {
      for (let z = Math.floor((position.z - radius) / size); z <= Math.floor((position.z + radius) / size); z++) {
        for (const agent of this.cells.get(`${x},${z}`) ?? []) {
          if ((agent.position.x - position.x) ** 2 + (agent.position.z - position.z) ** 2 < radius * radius) result.push(agent);
        }
      }
    }
    return result;
  }
  private key(x: number, z: number) { return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`; }
}
