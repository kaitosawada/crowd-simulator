import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import { STAIRS, UPPER_FLOOR } from '../src/simulation/layout';
import { PlayerController } from '../src/player/PlayerController';

class InputSurface extends EventTarget {
  matches() { return false; }
  focus() {}
  setPointerCapture() {}
  hasPointerCapture() { return false; }
  releasePointerCapture() {}
  async requestPointerLock() { throw new Error('Pointer lock unavailable'); }
}
function dispatch(surface: EventTarget, type: string, properties: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties); surface.dispatchEvent(event);
}

test('double-tapping W sprints faster than walking', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const fakeWindow = new InputSurface(), fakeDocument = new InputSurface(), canvas = new InputSurface();
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true });
  try {
    const camera = new PerspectiveCamera();
    const player = new PlayerController(camera, canvas as unknown as HTMLCanvasElement, () => {});
    player.enter(false);
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    dispatch(fakeWindow, 'keyup', { code: 'KeyW' });
    const walked = player.position.x + 27;
    player.reset();
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    dispatch(fakeWindow, 'keyup', { code: 'KeyW' });
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    const sprinted = player.position.x + 27;
    assert.ok(sprinted > walked * 1.5, `double-tap W should sprint (walked ${walked}, sprinted ${sprinted})`);
    player.reset();
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    dispatch(fakeWindow, 'keyup', { code: 'KeyW' });
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    dispatch(fakeWindow, 'keydown', { code: 'KeyS' });
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    assert.ok(player.position.x + 27 < sprinted, 'pressing S cancels the double-tap sprint');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('player input works immediately, pauses for settings, and supports drag without pointer lock', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const fakeWindow = new InputSurface(), fakeDocument = new InputSurface(), canvas = new InputSurface();
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true });
  try {
    const camera = new PerspectiveCamera();
    let fallbackNotified = false;
    const player = new PlayerController(camera, canvas as unknown as HTMLCanvasElement, locked => { fallbackNotified = !locked; });
    player.enter(false);
    assert.equal(camera.position.y, 1.7);
    const start = { ...player.position };
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    for (let i = 0; i < 60; i++) player.update(1 / 60);
    assert.ok(player.position.x > start.x + 2, 'W moves the initial player forward along the concourse');
    assert.ok(Math.abs(player.position.z - start.z) < 0.01);

    player.setInputEnabled(false);
    const stopped = { ...player.position };
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    for (let i = 0; i < 60; i++) player.update(1 / 60);
    assert.deepEqual(player.position, stopped, 'opening settings stops movement and ignores held movement keys');
    player.setInputEnabled(true);
    player.update(1 / 60);
    assert.deepEqual(player.position, stopped, 'closing settings does not reuse stale keys');

    dispatch(fakeWindow, 'keydown', { code: 'KeyD' });
    for (let i = 0; i < 30; i++) player.update(1 / 60);
    assert.ok(player.position.z > stopped.z + 0.8, 'strafe follows the view orientation');
    dispatch(fakeWindow, 'keyup', { code: 'KeyD' });

    const yaw = player.yaw;
    dispatch(canvas, 'pointerdown', { button: 0, pointerId: 1 });
    dispatch(fakeDocument, 'mousemove', { movementX: 100, movementY: 20 });
    dispatch(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse' });
    assert.ok(player.yaw < yaw, 'drag rotates the camera without pointer lock');
    assert.ok(player.pitch < 0);

    dispatch(canvas, 'pointerdown', { button: 0, pointerId: 2 });
    dispatch(canvas, 'pointerup', { pointerId: 2, pointerType: 'mouse' });
    await Promise.resolve();
    assert.ok(fallbackNotified, 'a rejected click-to-lock request leaves drag controls available');

    player.setInputEnabled(false);
    const heading = player.yaw;
    dispatch(canvas, 'pointerdown', { button: 0, pointerId: 3 });
    dispatch(fakeDocument, 'mousemove', { movementX: 100, movementY: 0 });
    assert.equal(player.yaw, heading, 'settings also suspend mouse look');

    player.setInputEnabled(true);
    player.position.x = STAIRS[0].x; player.position.z = STAIRS[0].bottom - 1;
    player.yaw = Math.PI;
    dispatch(fakeWindow, 'keydown', { code: 'KeyW' });
    for (let i = 0; i < 600; i++) player.update(1 / 60);
    assert.equal(player.floor, 1); assert.equal(player.stair, null);
    assert.equal(player.elevation, UPPER_FLOOR);
    assert.ok(Math.abs(camera.position.y - (UPPER_FLOOR + 1.7)) < 0.03);
    player.yaw = 0;
    for (let i = 0; i < 640; i++) player.update(1 / 60);
    assert.equal(player.floor, 0); assert.equal(player.stair, null);
    assert.equal(player.elevation, 0);
    player.reset(); assert.equal(player.neighbor.elevation, 0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
