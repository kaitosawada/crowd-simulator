import * as THREE from 'three';
import { MAX_AGENTS } from '../simulation/Simulation';
import type { AgentState } from '../simulation/types';

const palette = ['#374e4b', '#a48767', '#535963', '#b3a18d', '#344355', '#8c5c48', '#6b7764', '#c2baaa'];
/** A fixed number of draw calls for every population; limbs are animated per instance. */
export class CrowdRenderer {
  readonly group = new THREE.Group();
  private parts: Record<string, THREE.InstancedMesh> = {};
  private dummy = new THREE.Object3D();
  private root = new THREE.Matrix4();
  private matrix = new THREE.Matrix4();
  private rotation = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3(1, 1, 1);
  private colors = new THREE.Color();
  private headings = new Map<number, number>();
  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const standard = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    this.add('body', new THREE.CapsuleGeometry(0.205, 0.36, 3, 7), standard('#ffffff'));
    this.add('head', new THREE.SphereGeometry(0.137, 10, 7), standard('#ffffff'));
    this.add('hair', new THREE.SphereGeometry(0.141, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.54), standard('#34332e'));
    this.add('leftArm', new THREE.CapsuleGeometry(0.067, 0.46, 3, 6), standard('#ffffff'));
    this.add('rightArm', new THREE.CapsuleGeometry(0.067, 0.46, 3, 6), standard('#ffffff'));
    this.add('leftLeg', new THREE.CapsuleGeometry(0.084, 0.59, 3, 6), standard('#333c41'));
    this.add('rightLeg', new THREE.CapsuleGeometry(0.084, 0.59, 3, 6), standard('#333c41'));
    this.add('leftShoe', new THREE.BoxGeometry(0.15, 0.11, 0.29), standard('#292e2e'));
    this.add('rightShoe', new THREE.BoxGeometry(0.15, 0.11, 0.29), standard('#292e2e'));
    this.add('bag', new THREE.BoxGeometry(0.29, 0.38, 0.14), standard('#5c4a3d'));
    const shadow = new THREE.MeshBasicMaterial({ map: this.shadowTexture(), transparent: true, depthWrite: false, opacity: 0.25 });
    this.add('shadow', new THREE.PlaneGeometry(1.2, 1.2), shadow);
  }
  private add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_AGENTS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
    mesh.castShadow = name !== 'shadow'; mesh.receiveShadow = false; mesh.frustumCulled = false;
    this.parts[name] = mesh; this.group.add(mesh);
  }
  private shadowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(20,30,25,.7)'); gradient.addColorStop(1, 'rgba(20,30,25,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }
  private part(name: string, index: number, x: number, y: number, z: number, angle = 0, sx = 1, sy = 1, sz = 1) {
    this.dummy.position.set(x, y, z); this.dummy.rotation.set(angle, 0, 0); this.dummy.scale.set(sx, sy, sz); this.dummy.updateMatrix();
    this.matrix.multiplyMatrices(this.root, this.dummy.matrix); this.parts[name].setMatrixAt(index, this.matrix);
  }
  update(agents: readonly AgentState[], dt: number, colorByDirection: boolean) {
    agents = agents.filter(a => a.active);
    const active = new Set(agents.map(a => a.id));
    for (const id of this.headings.keys()) if (!active.has(id)) this.headings.delete(id);
    agents.forEach((a, i) => {
      const speed = Math.hypot(a.velocity.x, a.velocity.z);
      let heading = this.headings.get(a.id) ?? Math.atan2(a.velocity.x, a.velocity.z);
      if (speed > 0.05) {
        const desired = Math.atan2(a.velocity.x, a.velocity.z);
        heading += Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading)) * Math.min(1, dt * 9);
      }
      this.headings.set(a.id, heading);
      const phase = a.distance * 5.1, stride = Math.sin(phase) * Math.min(0.48, speed * 0.3), bob = Math.abs(Math.sin(phase)) * 0.025;
      const height = 0.94 + ((a.id * 7) % 13) / 100;
      this.position.set(a.position.x, a.elevation, a.position.z); this.rotation.setFromAxisAngle(this.up, heading); this.scale.set(1, height, 1);
      this.root.compose(this.position, this.rotation, this.scale);
      this.part('body', i, 0, 1.15 + bob, 0, 0, 1, 1, 0.72);
      this.part('head', i, 0, 1.64 + bob, 0.015, 0, 0.9, 1.15, 1);
      this.part('hair', i, 0, 1.67 + bob, 0.005, 0, 0.94, 1.1, 1.04);
      this.part('leftArm', i, -0.265, 1.13 + bob, -Math.sin(stride) * 0.19, -stride);
      this.part('rightArm', i, 0.265, 1.13 + bob, Math.sin(stride) * 0.19, stride);
      this.part('leftLeg', i, -0.105, 0.49 + bob, Math.sin(stride) * 0.26, stride);
      this.part('rightLeg', i, 0.105, 0.49 + bob, -Math.sin(stride) * 0.26, -stride);
      this.part('leftShoe', i, -0.105, 0.08 + Math.max(0, Math.sin(phase)) * 0.09, Math.sin(stride) * 0.61 + 0.035);
      this.part('rightShoe', i, 0.105, 0.08 + Math.max(0, -Math.sin(phase)) * 0.09, -Math.sin(stride) * 0.61 + 0.035);
      const hasBag = a.id % 3 !== 0;
      this.part('bag', i, 0, 1.12 + bob, -0.2, 0, hasBag ? 1 : 0, 1, 1);
      this.part('shadow', i, 0, 0.055, 0, -Math.PI / 2, 0.8, 0.8, 1);
      this.colors.set(colorByDirection ? (a.direction === 1 ? '#c77b43' : '#517c77') : palette[a.id % palette.length]);
      for (const name of ['body', 'leftArm', 'rightArm']) this.parts[name].setColorAt(i, this.colors);
      this.colors.set(['#c6a58c', '#a78166', '#dcc0a6', '#b79477'][a.id % 4]); this.parts.head.setColorAt(i, this.colors);
    });
    for (const mesh of Object.values(this.parts)) { mesh.count = agents.length; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
}
