import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { benches, EXITS, gates, LAYOUT, obstacles, planters, SHOPS, shopInteriors, shopFurniture, upperCore, STAIRS, STAIR_STEPS, UPPER_FLOOR } from '../simulation/layout';
import { canvasTexture, floorMaterial, signTexture } from './materials';

/** Procedural architecture. No external assets or network requests at runtime. */
export class Station {
  readonly group = new THREE.Group();
  readonly ceiling = new THREE.Group();
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  private materials = {
    stone: new THREE.MeshStandardMaterial({ color: '#dddcd2', roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#e9e7dd', roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#243a35', roughness: 0.42, metalness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ color: '#87938d', roughness: 0.3, metalness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: '#9e7650', roughness: 0.7 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#d5af4e', roughness: 0.6 }),
    light: new THREE.MeshBasicMaterial({ color: '#fff5d8' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f654b', roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#b9d8d2', metalness: 0.12, roughness: 0.15, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  };
  constructor(scene: THREE.Scene) {
    scene.add(this.group); this.group.add(this.ceiling);
    this.buildFloor(); this.buildUpperFloor(); this.buildStairs(); this.buildGates(); this.buildOuterWalls(); this.buildCore(); this.buildColumns(); this.buildFurniture(); this.buildCeiling(); this.buildSignage(); this.buildExterior();
    // Merge repeated slats and beams as well; the ceiling remains separately toggleable.
    const ceilingBatches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of this.ceiling.children) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      mesh.updateMatrix();
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      const batch = ceilingBatches.get(mesh.material);
      if (batch) batch.push(geometry); else ceilingBatches.set(mesh.material, [geometry]);
    }
    this.ceiling.clear();
    for (const [material, geometries] of ceilingBatches) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.receiveShadow = true;
      this.ceiling.add(mesh); geometries.forEach(g => g.dispose());
    }
    for (const [material, geometries] of this.batches) {
      const geometry = mergeGeometries(geometries);
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh); geometries.forEach(g => g.dispose());
    }
    this.batches.clear();
  }
  private box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent?: THREE.Group) {
    if (parent) {
      const mesh = new THREE.Mesh(this.boxGeometry, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return;
    }
    const geometry = this.boxGeometry.clone(); geometry.scale(w, h, d); geometry.translate(x, y, z);
    const batch = this.batches.get(material); if (batch) batch.push(geometry); else this.batches.set(material, [geometry]);
  }
  private cylinder(x: number, y: number, z: number, r: number, h: number, material: THREE.Material) {
    const geometry = this.cylinderGeometry.clone(); geometry.scale(r, h, r); geometry.translate(x, y, z);
    const batch = this.batches.get(material); if (batch) batch.push(geometry); else this.batches.set(material, [geometry]);
  }
  private buildFloor() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(100, 0.5, 68), floorMaterial());
    floor.position.y = -0.26; floor.receiveShadow = true; this.group.add(floor);
    this.box(0, -0.5, 0, 101, 0.5, 69, this.materials.dark);
    // Dark inlays frame the open circulation route.
    for (const z of [-32.5, -19, 19, 32.5]) this.box(0, 0.012, z, 97, 0.025, 0.14, this.materials.steel);
    for (const x of [-48.5, 48.5]) this.box(x, 0.012, 0, 0.14, 0.025, 65, this.materials.steel);
    // Continuous tactile guidance loop.
    for (const z of [-27.3, 27.3]) {
      this.box(0, 0.026, z, 86.6, 0.025, 0.42, this.materials.yellow);
      for (let x = -43; x < 43; x += 0.3) for (let j = -1; j <= 1; j++) this.box(x, 0.044, z + j * 0.11, 0.21, 0.017, 0.035, this.materials.yellow);
    }
    for (const x of [-43.3, 43.3]) {
      this.box(x, 0.026, 0, 0.42, 0.025, 55, this.materials.yellow);
      for (let z = -27; z < 27; z += 0.3) for (let j = -1; j <= 1; j++) this.box(x + j * 0.11, 0.044, z, 0.035, 0.017, 0.21, this.materials.yellow);
    }
  }
  private buildOuterWalls() {
    const m = this.materials;
    const height = LAYOUT.height;
    for (const z of [-34, 34]) {
      const exits = EXITS.filter(exit => Math.sign(exit.z) === Math.sign(z)).sort((a, b) => a.x - b.x);
      let edge = -50;
      for (const exit of [...exits, { x: 53 }]) {
        const right = exit.x - 3, width = right - edge, center = (right + edge) / 2;
        this.box(center, 0.45, z, width, 0.9, 0.25, m.stone);
        this.box(center, 2.1, z, width, 2.4, 0.08, m.glass);
        edge = exit.x + 3;
      }
      this.box(0, height - 0.4, z, 100, 0.8, 0.35, m.white);
      this.box(0, (height + 2.5) / 2, z, 99.5, height - 4.1, 0.08, m.glass);
      for (let x = -50; x <= 50; x += 4) {
        const aboveDoor = exits.some(exit => Math.abs(exit.x - x) < 3);
        const bottom = aboveDoor ? 3.3 : 0.9;
        this.box(x, (height - 0.8 + bottom) / 2, z, 0.095, height - 0.8 - bottom, 0.18, m.steel);
      }
      for (const y of [4.5, 8.4, height - 0.8]) this.box(0, y, z, 100, 0.09, 0.15, m.steel);
      for (const exit of exits) {
        for (const dx of [-3, 3]) this.box(exit.x + dx, 1.65, z, 0.18, 3.3, 0.4, m.dark);
        this.box(exit.x, 3.4, z, 6.2, 0.3, 0.5, m.dark);
        this.box(exit.x, 0.025, z - Math.sign(z) * 1.5, 5.8, 0.05, 3, m.yellow);
        this.panel(signTexture(exit.name, exit.english, 'EXIT'), exit.x, 2.8, z - Math.sign(z) * 0.25, 5.5, 0.9, z < 0 ? 0 : Math.PI);
      }
    }
    for (const x of [-50, 50]) {
      this.box(x, 0.45, 0, 0.25, 0.9, 68, m.stone);
      this.box(x, height - 0.4, 0, 0.35, 0.8, 68, m.white);
      this.box(x, height / 2, 0, 0.08, height - 1.8, 68, m.glass);
      for (let z = -34; z <= 34; z += 4) this.box(x, height / 2, z, 0.18, height - 1.8, 0.095, m.steel);
      for (const y of [1.1, 4.5, 8.4, height - 0.8]) this.box(x, y, 0, 0.15, 0.09, 68, m.steel);
    }
  }

  private buildCore() {
    const m = this.materials;
    // Keep the structural top below the shop floors instead of sharing their surface.
    const coreHeight = UPPER_FLOOR - 0.2;
    this.box(0, coreHeight / 2, 0, 68, coreHeight, 36, m.stone);
    // Solid service core and partitions leave real rooms on the upper floor.
    for (const wall of upperCore) {
      this.box(wall.x, UPPER_FLOOR + 1.75, wall.z, wall.halfX * 2, 3.5, wall.halfZ * 2, m.stone);
    }
    this.box(0, UPPER_FLOOR + 3.6, 0, 68.4, 0.2, 36.4, m.white, this.ceiling);
    const floor = floorMaterial();
    SHOPS.forEach((shop, index) => {
      const side = Math.sign(shop.z), room = shopInteriors[index];
      this.box(shop.x, UPPER_FLOOR - 0.05, side * 14, 13.5, 0.1, 8, floor);
      // Fascia, metal jambs and lettering each stand proud of the wall.
      this.box(shop.x, UPPER_FLOOR + 3.08, side * 18, 13.5, 0.96, 0.36, m.dark);
      this.panel(signTexture(shop.name, shop.english, '2F'), shop.x, UPPER_FLOOR + 3.05,
        side * 18.3, 10, 0.7, side < 0 ? Math.PI : 0);
      for (const [offset, label, english] of [[-4, '入口', 'IN'], [4, '出口', 'OUT']] as const) {
        for (const dx of [-1.2, 1.2]) this.box(shop.x + offset + dx, UPPER_FLOOR + 1.4, side * 18, 0.12, 2.8, 0.44, m.steel);
        // Keep the door label below the shop-name panel; their faces share a depth.
        this.panel(signTexture(label, english, offset < 0 ? '↓' : '↑'), shop.x + offset, UPPER_FLOOR + 2.3,
          side * 18.3, 2.1, 0.45, side < 0 ? Math.PI : 0);
      }
      this.box(shop.x, UPPER_FLOOR + 3.35, side * 14, 10, 0.08, 0.3, m.light);
      for (const point of room.queue) {
        this.box(point.x, UPPER_FLOOR + 0.015, point.z, 0.8, 0.03, 0.07, m.yellow);
      }
      const service = room.counter;
      this.panel(signTexture('レジ', 'ORDER / PAY', '●'), service.x, UPPER_FLOOR + 2,
        service.z + side * 0.05, 2, 0.5, side < 0 ? Math.PI : 0);
      const furniture = shopFurniture.slice(index * 7, (index + 1) * 7);
      furniture.forEach((item, i) => {
        const cafe = index % 4 === 1 && i > 0;
        this.box(item.x, UPPER_FLOOR + (cafe ? 0.75 : 0.9), item.z, item.halfX * 2,
          0.12, item.halfZ * 2, m.wood);
        this.box(item.x, UPPER_FLOOR + 0.35, item.z, item.halfX * 1.7, 0.7, item.halfZ * 1.7, m.dark);
        if (i > 0) {
          for (const dx of [-0.4, 0, 0.4]) {
            if (cafe) this.cylinder(item.x + dx, UPPER_FLOOR + 0.88, item.z, 0.07, 0.16, m.white);
            else this.box(item.x + dx, UPPER_FLOOR + 1.08, item.z, 0.22, 0.25, 0.32, i % 2 ? m.yellow : m.white);
          }
        }
      });
    });
  }
  private buildUpperFloor() {
    const floor = floorMaterial(), y = UPPER_FLOOR - 0.18;
    for (const z of [-26, 26]) this.box(0, y, z, 100, 0.36, 16, floor);
    for (const stair of STAIRS) {
      const sign = Math.sign(stair.x);
      // Leave a real opening above the entire stair flight.
      this.box(sign * 42, y, -14, 16, 0.36, 8, floor);
      this.box(sign * 42, y, 14, 16, 0.36, 8, floor);
      this.box(sign * 38.75, y, 0, 9.5, 0.36, 20, floor);
      this.box(sign * 49.25, y, 0, 1.5, 0.36, 20, floor);
      for (const x of [stair.x - stair.halfWidth, stair.x + stair.halfWidth]) {
        this.box(x, UPPER_FLOOR + 0.55, 0, 0.08, 1.1, 20, this.materials.glass);
        this.box(x, UPPER_FLOOR + 1.1, 0, 0.09, 0.09, 20, this.materials.steel);
        for (let z = -10; z <= 10; z += 2) this.box(x, UPPER_FLOOR + 0.55, z, 0.07, 1.1, 0.07, this.materials.steel);
      }
      this.box(stair.x, UPPER_FLOOR + 0.55, -10, 5, 1.1, 0.08, this.materials.glass);
      this.box(stair.x, UPPER_FLOOR + 1.1, -10, 5, 0.09, 0.09, this.materials.steel);
    }
    for (const z of [-26, 26]) this.box(0, UPPER_FLOOR + 0.015, z, 83, 0.03, 0.18, this.materials.yellow);
  }
  private buildStairs() {
    const m = this.materials, count = STAIR_STEPS;
    for (const s of STAIRS) {
      const depth = (s.top - s.bottom) / count;
      for (let i = 0; i < count; i++) {
        const height = (i + 1) / count * UPPER_FLOOR;
        const z = s.bottom + (i + 0.5) * depth;
        this.box(s.x, height / 2, z, s.halfWidth * 2, height, depth, m.stone);
        this.box(s.x, height + 0.01, z - depth / 2 + 0.045, s.halfWidth * 2, 0.025, 0.09, m.yellow);
      }
      for (const x of [s.x - s.halfWidth, s.x + s.halfWidth]) {
        for (let i = 0; i <= 10; i++) this.box(x, i / 10 * UPPER_FLOOR + 0.5, s.bottom + i * 2, 0.07, 1, 0.07, m.steel);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, Math.hypot(20, UPPER_FLOOR)), m.steel);
        rail.position.set(x, UPPER_FLOOR / 2 + 1, 0); rail.rotation.x = -Math.atan2(UPPER_FLOOR, 20); this.group.add(rail);
      }
      const up = signTexture('2F 商店街 ↑', 'SHOPS / Stairs', '↑');
      this.panel(up, s.x, 2.7, s.bottom - 0.3, 4.6, 1.05, Math.PI);
      const down = signTexture('1F 改札 ↓', 'GATES / Stairs', '↓');
      this.panel(down, s.x, UPPER_FLOOR + 2.6, s.top + 0.4, 4.6, 1.05);
    }
  }
  private buildGates() {
    const m = this.materials;
    for (const s of STAIRS) {
      // Two open lanes: arrivals on the right, departures on the left.
      for (const gate of gates.filter(g => Math.abs(g.x - s.x) < s.halfWidth)) {
        this.box(gate.x, 0.5, gate.z, gate.halfX * 2, 1, gate.halfZ * 2, m.steel);
        this.box(gate.x, 1.02, -31.5, 0.22, 0.06, 0.32, m.dark);
        this.box(gate.x, 0.8, -31.05, 0.12, 0.08, 0.03, m.light);
      }
    }
  }
  private buildColumns() {
    const m = this.materials;
    for (const p of obstacles) {
      this.cylinder(p.x, LAYOUT.height / 2, p.z, 0.57, LAYOUT.height, m.white);
      this.cylinder(p.x, 0.5, p.z, 0.61, 1, m.steel);
      this.cylinder(p.x, 2.6, p.z, 0.581, 0.18, m.dark);
      this.cylinder(p.x, LAYOUT.height - 0.7, p.z, 0.66, 0.22, m.steel);
    }
  }
  private buildFurniture() {
    const m = this.materials;
    for (const p of planters) {
      this.cylinder(p.x, 0.4, p.z, 0.94, 0.8, m.stone);
      this.cylinder(p.x, 0.81, p.z, 0.86, 0.035, m.dark);
      this.cylinder(p.x, 1.55, p.z, 0.085, 1.6, m.wood);
      for (let i = 0; i < 7; i++) {
        const geometry = new THREE.IcosahedronGeometry(0.68, 1);
        geometry.scale(1, 0.8, 1); geometry.translate(p.x + Math.sin(i * 2.4) * 0.48, 2 + (i % 3) * 0.32, p.z + Math.cos(i * 2.4) * 0.48);
        const batch = this.batches.get(m.leaf); if (batch) batch.push(geometry); else this.batches.set(m.leaf, [geometry]);
      }
    }
    for (const p of benches) {
      for (let i = -2; i <= 2; i++) this.box(p.x, 0.5, p.z + i * 0.19, 4, 0.1, 0.15, m.wood);
      for (const x of [-1.5, 1.5]) this.box(p.x + x, 0.25, p.z, 0.09, 0.5, 0.9, m.steel);
      this.box(p.x, 0.9, p.z - Math.sign(p.z) * 0.42, 4, 0.6, 0.1, m.wood);
    }
    // Departure display totems stay within the non-walkable central block.
    for (const x of [-33.9, 33.9]) {
      const texture = canvasTexture(512, 768, ctx => {
        ctx.fillStyle = '#17352d'; ctx.fillRect(0, 0, 512, 768);
        ctx.fillStyle = '#edcf78'; ctx.font = 'bold 38px sans-serif'; ctx.fillText('出発のご案内', 38, 70);
        ctx.fillStyle = '#92ac9c'; ctx.font = '20px sans-serif'; ctx.fillText('DEPARTURES / 出発', 40, 111);
        const destinations = ['東京  Tokyo', '横浜  Yokohama', '新宿  Shinjuku', '大宮  Omiya', '熱海  Atami'];
        destinations.forEach((text, i) => {
          const y = 183 + i * 103; ctx.fillStyle = '#dce5d9'; ctx.font = '27px sans-serif'; ctx.fillText(`12:${String(30 + i * 4).padStart(2, '0')}`, 35, y); ctx.fillText(text, 155, y);
          ctx.fillStyle = '#82998b'; ctx.font = '18px sans-serif'; ctx.fillText(i % 2 ? 'Local  各駅停車' : 'Rapid  快速', 155, y + 30);
          ctx.fillStyle = '#3a5147'; ctx.fillRect(35, y + 52, 440, 1);
        });
        ctx.fillStyle = '#edcf78'; ctx.font = '20px sans-serif'; ctx.fillText('SIMULATION · 架空の運行案内', 35, 728);
      });
      this.panel(texture, x + Math.sign(x) * 0.16, 2.7, 0, 2.1, 3.15, Math.sign(x) * Math.PI / 2);
    }
  }
  private buildCeiling() {
    const m = this.materials;
    const y = LAYOUT.height;
    // Broad glazed ribbons above the circulation lanes open the view to the sky.
    for (const z of [-26, 26]) {
      this.box(0, y + 0.15, z, 100, 0.16, 8, m.glass, this.ceiling);
      for (const side of [-1, 1]) {
        this.box(0, y, z + side * 6, 100, 0.22, 4, m.white, this.ceiling);
        for (let x = -49; x <= 49; x += 1.5) this.box(x, y - 0.3, z + side * 6, 0.12, 0.4, 3.7, m.wood, this.ceiling);
        this.box(0, y - 0.5, z + side * 4.2, 98, 0.05, 0.18, m.light, this.ceiling);
      }
      for (let x = -48; x <= 48; x += 12) this.box(x, y - 0.4, z, 0.2, 0.4, 16, m.white, this.ceiling);
    }
    for (const x of [-42, 42]) {
      this.box(x, y + 0.15, 0, 8, 0.16, 36, m.glass, this.ceiling);
      for (const side of [-1, 1]) {
        this.box(x + side * 6, y, 0, 4, 0.22, 36, m.white, this.ceiling);
        for (let z = -17.5; z <= 17.5; z += 1.5) this.box(x + side * 6, y - 0.3, z, 3.7, 0.4, 0.12, m.wood, this.ceiling);
        this.box(x + side * 4.2, y - 0.5, 0, 0.18, 0.05, 36, m.light, this.ceiling);
      }
      for (const z of [-12, 0, 12]) this.box(x, y - 0.4, z, 16, 0.4, 0.2, m.white, this.ceiling);
    }
  }

  private panel(texture: THREE.Texture, x: number, y: number, z: number, w: number, h: number, angle = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, z); mesh.rotation.y = angle; this.group.add(mesh);
  }
  private buildSignage() {
    for (const z of [-26, 26]) for (const x of [-23, 23]) {
      for (const floor of [0, 1]) {
        const y = floor * UPPER_FLOOR + (floor ? 3.05 : 4.3);
        const tex = signTexture(floor ? '2F カフェ・買い物' : '1F 北口・南口・改札', floor ? 'COFFEE / BOOKS / MARKET' : 'NORTH / SOUTH / GATES', floor ? '2F' : '1F');
        this.box(x, y, z, 0.18, 1.1, 6.4, this.materials.dark);
        this.panel(tex, x + 0.16, y, z, 6.35, 1.08, Math.PI / 2);
        this.panel(tex, x - 0.16, y, z, 6.35, 1.08, -Math.PI / 2);
      }
    }
    const station = signTexture('品川 / SHINAGAWA', '1F Gates · 2F Shops', 'JY', '#a0c4ab');
    this.panel(station, 0, 2.7, 18.4, 10, 1.6);
    this.panel(station, 0, 2.7, -18.4, 10, 1.6, Math.PI);
  }
  private buildExterior() {
    const m = this.materials;
    this.box(0, -1.9, 0, 250, 1, 220, new THREE.MeshStandardMaterial({ color: '#c5cbbd', roughness: 1 }));
    // Quiet silhouettes beyond the glazing give daylight and distance a context.
    const city = new THREE.MeshStandardMaterial({ color: '#c7d2cd', roughness: 0.95 });
    for (let i = 0; i < 14; i++) {
      const x = (i - 7) * 16, h = 9 + ((i * 17) % 25), z = -65 - (i % 3) * 12;
      this.box(x, h / 2 - 2, z, 10 + i % 4, h, 12, city);
      for (let y = 2; y < h - 2; y += 3) this.box(x, y, z + 6.05, 8, 0.08, 0.05, m.white);
    }
    // Tracks are only an exterior cue; the walkable model stays inside the station.
    for (const z of [43, 47, 51]) {
      this.box(0, -1.22, z, 150, 0.05, 2.5, m.steel);
      for (const offset of [-0.7, 0.7]) this.box(0, -1.1, z + offset, 150, 0.14, 0.08, m.dark);
      for (let x = -74; x < 75; x += 1) this.box(x, -1.16, z, 0.16, 0.08, 2.2, m.wood);
    }
  }
  setOverview(enabled: boolean) { this.ceiling.visible = !enabled; }
}
