import * as THREE from 'three';
import { constrainMovement } from '../simulation/layout';
import type { Neighbor } from '../simulation/types';

export class PlayerController {
  readonly position = { x: -27, z: 25 };
  readonly velocity = { x: 0, z: 0 };
  floor: 0 | 1 = 0;
  stair: number | null = null;
  elevation = 0;
  active = false;
  yaw = -Math.PI / 2;
  pitch = 0;
  private keys = new Set<string>();
  private distance = 0;
  private dragging = false;
  private inputEnabled = true;
  private dragDistance = 0;
  constructor(private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement, private onLockChange: (locked: boolean) => void) {
    window.addEventListener('keydown', event => {
      if (!this.active || !this.inputEnabled || (event.target as HTMLElement)?.matches('input, select, button, textarea, [contenteditable="true"]')) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        this.keys.add(event.code); if (this.active) event.preventDefault();
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.keys.clear(); });
    document.addEventListener('pointerlockchange', () => { this.keys.clear(); onLockChange(document.pointerLockElement === canvas); });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !this.active || !this.inputEnabled) return;
      canvas.focus();
      if (document.pointerLockElement !== canvas) { this.dragging = true; this.dragDistance = 0; canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener('pointerup', e => {
      const clicked = this.dragging && this.dragDistance < 5;
      this.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (clicked && e.pointerType !== 'touch') void this.lock();
    });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    canvas.addEventListener('lostpointercapture', () => { this.dragging = false; });
    document.addEventListener('mousemove', e => {
      if (!this.active || !this.inputEnabled || (document.pointerLockElement !== canvas && !this.dragging)) return;
      this.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.yaw -= e.movementX * 0.002; this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - e.movementY * 0.002));
    });
  }
  async lock() {
    if (!this.active || !this.inputEnabled || document.pointerLockElement === this.canvas) return;
    try { await this.canvas.requestPointerLock(); } catch { this.onLockChange(false); }
  }
  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    this.keys.clear(); this.dragging = false; this.velocity.x = this.velocity.z = 0;
  }
  enter(requestLock = true) {
    this.active = true; this.keys.clear(); this.update(0); if (requestLock) void this.lock();
  }
  exit() { this.active = false; this.setInputEnabled(false); if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  reset() { this.floor = 0; this.stair = null; this.elevation = 0; this.position.x = -27; this.position.z = 25; this.yaw = -Math.PI / 2; this.pitch = 0; this.distance = 0; this.velocity.x = this.velocity.z = 0; }
  update(dt: number) {
    if (!this.active) return;
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const length = Math.hypot(forward, right) || 1;
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4.8 : 2.4;
    const vx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) / length * speed;
    const vz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) / length * speed;
    const blend = 1 - Math.exp(-dt * 12);
    this.velocity.x += (vx - this.velocity.x) * blend; this.velocity.z += (vz - this.velocity.z) * blend;
    const oldX = this.position.x, oldZ = this.position.z;
    // Substeps ensure the player cannot tunnel through columns or benches at low FPS.
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    for (let i = 0; i < steps; i++) { const previous = { ...this.position }; this.position.x += this.velocity.x * dt / steps; this.position.z += this.velocity.z * dt / steps; constrainMovement(this.position, previous, this, 0.32); }
    if (dt > 0) { this.velocity.x = (this.position.x - oldX) / dt; this.velocity.z = (this.position.z - oldZ) / dt; }
    this.distance += Math.hypot(this.position.x - oldX, this.position.z - oldZ);
    this.camera.position.set(this.position.x, this.elevation + 1.7 + (Math.hypot(this.velocity.x, this.velocity.z) > 0.1 ? Math.sin(this.distance * 7) * 0.025 : 0), this.position.z);
    this.camera.rotation.order = 'YXZ'; this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
  get neighbor(): Neighbor { return { id: -1, elevation: this.elevation, position: this.position, velocity: this.velocity, radius: 0.45 }; }
}
