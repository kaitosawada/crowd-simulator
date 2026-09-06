import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { benches, gates, obstacles, planters, STAIRS, UPPER_FLOOR } from '../simulation/layout';
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
    for (const z of [-34, 34]) {
      this.box(0, 0.45, z, 100, 0.9, 0.25, m.stone);
      this.box(0, 7.9, z, 100, 1, 0.35, m.white);
      this.box(0, 4.15, z, 99.5, 6.5, 0.08, m.glass);
      for (let x = -50; x <= 50; x += 4) this.box(x, 4.1, z, 0.095, 6.5, 0.18, m.steel);
      for (const y of [1.1, 4.5, 7.4]) this.box(0, y, z, 100, 0.09, 0.15, m.steel);
    }
    for (const x of [-50, 50]) {
      this.box(x, 0.45, 0, 0.25, 0.9, 68, m.stone);
      this.box(x, 7.9, 0, 0.35, 1, 68, m.white);
      this.box(x, 4.15, 0, 0.08, 6.5, 68, m.glass);
      for (let z = -34; z <= 34; z += 4) this.box(x, 4.1, z, 0.18, 6.5, 0.095, m.steel);
      for (const y of [1.1, 4.5, 7.4]) this.box(x, y, 0, 0.15, 0.09, 68, m.steel);
    }
  }
  private buildCore() {
    const m = this.materials;
    this.box(0, 3.85, 0, 68, 7.7, 36, m.stone);
    this.box(0, 7.8, 0, 68.4, 0.2, 36.4, m.white);
    const names = ['KIOSK / キオスク', 'CONCOURSE COFFEE', 'BOOKS & TRAVEL', 'EKI MARKET'];
    for (const z of [-18.17, 18.17]) {
      // Keep the ground-floor concourse wall plain; storefronts belong upstairs.
      [-25, -9, 9, 25].forEach((x, i) => {
        this.box(x, 5.65, z, 13.5, 2.8, 0.16, m.dark);
        this.box(x, 5.55, z + Math.sign(z) * 0.1, 12.8, 2.4, 0.08, m.glass);
        for (let j = -2; j <= 2; j++) this.box(x + j * 2.5, 5.6, z + Math.sign(z) * 0.17, 0.06, 2.5, 0.12, m.steel);
        this.box(x, 7.05, z, 13.5, 0.1, 0.3, m.light);
        const tex = canvasTexture(1024, 128, ctx => {
          ctx.fillStyle = '#d8d6c9'; ctx.fillRect(0, 0, 1024, 128);
          ctx.fillStyle = '#2f443b'; ctx.font = '500 44px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(names[i], 512, 81);
        });
        this.panel(tex, x, 7.42, z + Math.sign(z) * 0.2, 11, 0.65, z < 0 ? Math.PI : 0);
        for (const y of [4.8, 5.4, 6]) this.box(x, y, z + Math.sign(z) * 0.2, 11.2, 0.09, 0.05, m.wood);
      });
    }
    for (const x of [-34.05, 34.05]) for (let z = -16; z <= 16; z += 0.6) this.box(x, 3.9, z, 0.2, 7.4, 0.14, m.wood);
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
    const m = this.materials, count = 28;
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
      this.panel(down, s.x, 6.8, s.top + 0.4, 4.6, 1.05);
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
      this.panel(signTexture('1F 改札', 'GATES / Arrivals & departures', '→'), s.x, 2.7, -33.7, 6, 1.2);
    }
  }
  private buildColumns() {
    const m = this.materials;
    for (const p of obstacles) {
      this.cylinder(p.x, 4.15, p.z, 0.57, 8.3, m.white);
      this.cylinder(p.x, 0.5, p.z, 0.61, 1, m.steel);
      this.cylinder(p.x, 2.6, p.z, 0.581, 0.18, m.dark);
      this.cylinder(p.x, 7.7, p.z, 0.66, 0.22, m.steel);
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
    // Open center skylight, with timber acoustic slats over all four concourses.
    for (const z of [-26, 26]) {
      this.box(0, 8.55, z, 100, 0.22, 16, m.white, this.ceiling);
      for (let x = -49; x <= 49; x += 0.75) this.box(x, 8.24, z, 0.12, 0.4, 15.6, m.wood, this.ceiling);
      for (const offset of [-4.5, 4.5]) this.box(0, 8.0, z + offset, 98, 0.05, 0.18, m.light, this.ceiling);
      for (let x = -48; x <= 48; x += 8) this.box(x, 7.85, z, 0.28, 0.45, 16, m.white, this.ceiling);
    }
    for (const x of [-42, 42]) {
      this.box(x, 8.55, 0, 16, 0.22, 36, m.white, this.ceiling);
      for (let z = -17.5; z <= 17.5; z += 0.75) this.box(x, 8.24, z, 15.5, 0.4, 0.12, m.wood, this.ceiling);
      for (const offset of [-4.5, 4.5]) this.box(x + offset, 8.0, 0, 0.18, 0.05, 36, m.light, this.ceiling);
    }
  }
  private panel(texture: THREE.Texture, x: number, y: number, z: number, w: number, h: number, angle = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, z); mesh.rotation.y = angle; this.group.add(mesh);
  }
  private buildSignage() {
    for (const z of [-26, 26]) for (const x of [-23, 23]) {
      for (const floor of [0, 1]) {
        const y = floor * UPPER_FLOOR + 3.05;
        const tex = signTexture(floor ? '2F 商店街・周回通路' : '1F 改札・階段', floor ? 'SHOPS / Clockwise & counterclockwise' : 'GATES / Stairs at east & west', floor ? '2F' : '1F');
        this.box(x, y, z, 0.18, 1.1, 6.4, this.materials.dark);
        this.panel(tex, x + 0.101, y, z, 6.35, 1.08, Math.PI / 2);
        this.panel(tex, x - 0.101, y, z, 6.35, 1.08, -Math.PI / 2);
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
