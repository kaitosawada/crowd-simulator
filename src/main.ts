import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXITS, SHOPS, STAIRS } from './simulation/layout';
import { Simulation } from './simulation/Simulation';
import { behaviorRegistry } from './simulation/behaviors';
import { Station } from './world/Station';
import { CrowdRenderer } from './render/CrowdRenderer';
import { PlayerController } from './player/PlayerController';
import { buildUI, icons } from './ui';
import './style.css';

buildUI();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const simulation = new Simulation(1000);
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  $('loading').innerHTML = '<strong>3D表示を開始できませんでした</strong><p>WebGL 2対応のブラウザで、ハードウェアアクセラレーションを有効にしてください。</p>';
  throw new Error('WebGL 2 is required.');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('viewport').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '駅のゲーム画面。クリックでマウス操作、WASDで移動、Escで設定。');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce5db');
scene.fog = new THREE.Fog('#dce5db', 85, 220);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
scene.environment = environment.texture; scene.environmentIntensity = 0.38;
room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f8f6df', '#a2aca1', 1.45));
const sun = new THREE.DirectionalLight('#fff1d6', 2.7);
sun.position.set(-28, 47, 38); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 58, bottom: -58, near: 1, far: 150 });
sun.shadow.normalBias = 0.025; sun.shadow.bias = -0.00015; sun.shadow.radius = 3;
scene.add(sun);
const fill = new THREE.DirectionalLight('#d5e6ef', 0.7); fill.position.set(30, 15, -45); scene.add(fill);
const station = new Station(scene);
const crowd = new CrowdRenderer(scene);
const camera = new THREE.PerspectiveCamera(57, window.innerWidth / window.innerHeight, 0.1, 350);
camera.position.set(-35, 4.5, 29);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(13, 2.6, 23);
orbit.enableDamping = true; orbit.dampingFactor = 0.07;
orbit.minDistance = 3; orbit.maxDistance = 125; orbit.maxPolarAngle = Math.PI / 2 - 0.025;
orbit.update();
let mode: 'walk' | 'overview' = 'walk';
let panelOpen = false;
let wasLocked = false;
let lockReleasedAt = -Infinity;
let colorByPurpose = false;
let toastTimeout: ReturnType<typeof setTimeout>;
function toast(message: string) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 3600); }
const player = new PlayerController(camera, renderer.domElement, locked => {
  document.body.classList.toggle('pointer-locked', locked);
  const released = wasLocked && !locked;
  wasLocked = locked;
  if (mode === 'walk' && !locked) $('view-hint').textContent = 'ドラッグで見回す · WASDで移動';
  if (released && mode === 'walk') { lockReleasedAt = performance.now(); setPanel(true); }
});

function setMode(next: 'walk' | 'overview', requestLock = true) {
  mode = next;
  document.body.classList.toggle('walking', next === 'walk');
  $('walk-mode').classList.toggle('active', next === 'walk');
  $('overview-mode').classList.toggle('active', next === 'overview');
  $('walk-mode').setAttribute('aria-pressed', String(next === 'walk'));
  $('overview-mode').setAttribute('aria-pressed', String(next === 'overview'));
  $('crosshair').hidden = next !== 'walk';
  station.setOverview(next === 'overview');
  if (next === 'walk') {
    orbit.enabled = false; player.setInputEnabled(true); player.enter(requestLock);
    $('view-hint').textContent = 'クリックでマウス操作を開始';
  } else {
    player.exit(); orbit.enabled = true;
    camera.position.set(-69, 72, 77); orbit.target.set(0, 0, 0); orbit.update();
    $('view-hint').textContent = 'ドラッグで回転 · スクロールでズーム · 1 でプレイヤーに戻る';
  }
  setPanel(false);
  renderer.domElement.focus();
}
$('walk-mode').addEventListener('click', () => setMode('walk'));
$('overview-mode').addEventListener('click', () => setMode('overview'));
function togglePause() {
  simulation.paused = !simulation.paused;
  $('pause').innerHTML = `${simulation.paused ? icons.play : icons.pause}<span>${simulation.paused ? '再開する' : '一時停止'}</span>`;
  $('pause').setAttribute('aria-pressed', String(simulation.paused));
  $('live-status').textContent = simulation.paused ? '一時停止中' : '進行中';
}
$('pause').addEventListener('click', togglePause);
$('reset').addEventListener('click', () => { simulation.reset(); player.reset(); toast('人数と設定を保ち、初期配置にリセットしました。'); });
const algorithm = $<HTMLSelectElement>('algorithm');
for (const [value, entry] of behaviorRegistry) { const option = document.createElement('option'); option.value = value; option.textContent = entry.label; algorithm.appendChild(option); }
algorithm.addEventListener('change', () => {
  simulation.setAlgorithm(algorithm.value);
  $('algorithm-note').textContent = behaviorRegistry.get(algorithm.value)?.description ?? '独自に登録された歩行アルゴリズムです。';
});
const population = $<HTMLInputElement>('population');
function setPopulation(count: number) {
  simulation.setCount(count); population.value = String(count); $('population-value').textContent = String(count);
  population.style.setProperty('--fill', `${count / 10}%`);
  document.querySelectorAll<HTMLButtonElement>('[data-count]').forEach(b => b.classList.toggle('selected', Number(b.dataset.count) === count));
}
population.addEventListener('input', () => setPopulation(Number(population.value)));
document.querySelectorAll<HTMLButtonElement>('[data-count]').forEach(b => b.addEventListener('click', () => setPopulation(Number(b.dataset.count))));
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.addEventListener('click', () => {
  simulation.speed = Number(b.dataset.speed); $('speed-value').textContent = `${simulation.speed.toFixed(1)}×`;
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => { button.classList.toggle('active', button === b); button.setAttribute('aria-pressed', String(button === b)); });
}));
$('color-toggle').addEventListener('change', e => { colorByPurpose = (e.target as HTMLInputElement).checked; $('direction-legend').hidden = !colorByPurpose; });
const routeGroup = new THREE.Group();
for (const journey of [...simulation.journeys.values()].slice(0, 10)) {
  const points = journey.points.map(p => new THREE.Vector3(p.x, p.elevation + 0.18, p.z));
  const color = { transit: '#548683', shopping: '#b2773e', stroll: '#8a72ac' }[journey.options.purpose];
  const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.8 }));
  route.computeLineDistances(); routeGroup.add(route);
  for (let s = 5; s < journey.length - 1; s += 15) {
    const p = journey.sample(s), next = journey.sample(s + 0.5);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.6, 3), new THREE.MeshBasicMaterial({ color }));
    arrow.position.set(p.x, p.elevation + 0.19, p.z);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(next.x - p.x, next.elevation - p.elevation, next.z - p.z).normalize());
    routeGroup.add(arrow);
  }
}
routeGroup.visible = false; scene.add(routeGroup);
$('route-toggle').addEventListener('change', e => { routeGroup.visible = (e.target as HTMLInputElement).checked; });
function setPanel(open: boolean) {
  panelOpen = open;
  document.body.classList.toggle('menu-open', open);
  $('settings').hidden = !open;
  $('settings').inert = !open;
  $('panel-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle').setAttribute('aria-label', open ? '設定を閉じる' : '設定を開く');
  player.setInputEnabled(!open && mode === 'walk');
  orbit.enabled = !open && mode === 'overview';
  if (open) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    $('panel-close').focus();
  } else renderer.domElement.focus();
}
$('panel-toggle').addEventListener('click', () => setPanel(!panelOpen));
$('panel-close').addEventListener('click', () => setPanel(false));
window.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.code === 'Escape') {
    // Let the browser release pointer lock first; its change event opens the menu.
    if (document.pointerLockElement === renderer.domElement || performance.now() - lockReleasedAt < 150) return;
    event.preventDefault(); setPanel(!panelOpen); return;
  }
  if (event.code === 'Tab' && !panelOpen) { event.preventDefault(); setPanel(true); return; }
  if ((event.target as HTMLElement)?.matches('input, select, button') || event.repeat) return;
  if (event.code === 'Digit1') setMode('walk');
  if (event.code === 'Digit2') setMode('overview');
  if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  if (event.code === 'KeyM') $('map-panel').hidden = !$('map-panel').hidden;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const map = $<HTMLCanvasElement>('minimap'), ctx = map.getContext('2d')!;
function drawMap() {
  const w = map.width, h = map.height, scale = 4.65;
  const floor = mode === 'overview' ? 1 : player.floor;
  $('map-floor').textContent = player.stair !== null && mode === 'walk' ? '階段 · 1F ↔ 2F' : `${floor + 1}F · ${floor ? '商店街' : '改札'}`;
  ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(w / 2, h / 2);
  ctx.fillStyle = '#e1e5d7'; ctx.strokeStyle = '#a9b5a0'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(-50 * scale, -34 * scale, 100 * scale, 68 * scale, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f6f7ed'; ctx.fillRect(-34 * scale, -18 * scale, 68 * scale, 36 * scale);
  ctx.strokeStyle = '#c7ceba'; ctx.strokeRect(-34 * scale, -18 * scale, 68 * scale, 36 * scale);
  ctx.strokeStyle = '#c8c5a3'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath();
  if (floor === 1) {
    for (let i = 0; i <= 100; i++) { const p = simulation.route.sample(i / 100 * simulation.route.length).position; if (i === 0) ctx.moveTo(p.x * scale, p.z * scale); else ctx.lineTo(p.x * scale, p.z * scale); }
  } else for (const stair of STAIRS) { ctx.moveTo(stair.x * scale, -32 * scale); ctx.lineTo(stair.x * scale, stair.bottom * scale); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#a0ad91'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(floor ? '2F · SHOPS' : '1F · GATES', 0, 2);
  ctx.fillStyle = '#b3bba8'; ctx.font = '11px sans-serif'; ctx.fillText(floor ? 'カフェ・書店・買い物' : '北口・南口・東西改札', 0, 22);
  for (const stair of STAIRS) {
    ctx.fillStyle = '#c3b185'; ctx.fillRect((stair.x - stair.halfWidth) * scale, stair.bottom * scale, stair.halfWidth * 2 * scale, (stair.top - stair.bottom) * scale);
    ctx.fillStyle = '#54614d'; ctx.fillText('↑', stair.x * scale, 4);

  }
  for (const destination of floor === 0 ? EXITS : SHOPS) {
    ctx.fillStyle = floor === 0 ? '#517c77' : '#b2773e';
    ctx.fillRect(destination.x * scale - 8, destination.z * scale - 3, 16, 6);
    ctx.font = '10px sans-serif';
    ctx.fillText(destination.name, destination.x * scale, (destination.z + (destination.z < 0 ? 2.8 : -1.8)) * scale);
  }
  for (const a of simulation.agents) {
    if (!a.active || (a.stair === null && a.floor !== floor)) continue;
    ctx.fillStyle = colorByPurpose ? { transit: '#517c77', shopping: '#c77b43', stroll: '#8a72ac' }[a.purpose] : '#657e63';
    ctx.beginPath(); ctx.arc(a.position.x * scale, a.position.z * scale, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  const px = mode === 'walk' ? player.position.x : camera.position.x;
  const pz = mode === 'walk' ? player.position.z : camera.position.z;
  const x = Math.max(-49, Math.min(49, px)) * scale, z = Math.max(-33, Math.min(33, pz)) * scale;
  const direction = new THREE.Vector3(); camera.getWorldDirection(direction);
  ctx.save(); ctx.translate(x, z); ctx.rotate(-Math.atan2(direction.x, direction.z));
  ctx.fillStyle = '#c9874530'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 27, Math.PI / 2 - 0.48, Math.PI / 2 + 0.48); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#c57c42'; ctx.beginPath(); ctx.arc(x, z, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fffbee'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
}
let previous = performance.now(), metricsAt = previous, frames = 0, frameSum = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 0.1); previous = now;
  if (document.hidden) return;
  player.update(dt); simulation.update(dt, mode === 'walk' ? player.neighbor : undefined);
  crowd.update(simulation.agents, dt, colorByPurpose);
  if (mode !== 'walk') orbit.update();
  renderer.render(scene, camera);
  frames++; frameSum += dt;
  if (now - metricsAt > 250) {
    $('floor-status').textContent = mode === 'overview' ? '2F 商店街 · 俯瞰' : player.stair !== null ? '階段 · 1F ↔ 2F' : `${player.floor + 1}F ${player.floor ? '商店街' : '改札コンコース'}`;
    $('flow-status').textContent = `構内 ${simulation.agents.length}人 · 滞在 ${simulation.agents.filter(a => a.dwellRemaining > 0).length}人 · 退出 ${simulation.agents.reduce((sum, a) => sum + a.trips, 0)}人`;
    $('average-speed').innerHTML = `${simulation.averageSpeed.toFixed(2)} <small>m/s</small>`;
    const seconds = Math.floor(simulation.time); $('elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('fps').textContent = `${Math.round(frames / Math.max(frameSum, 0.001))} FPS`;
    frames = 0; frameSum = 0; metricsAt = now; drawMap();
  }
}
// A small read-only diagnostics surface is available in development for integration tests.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__concourse', { value: {
    get stats() { return { count: simulation.agents.length, time: simulation.time, averageSpeed: simulation.averageSpeed, mode, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, player: { ...player.position, elevation: player.elevation, floor: player.floor, stair: player.stair }, agents: simulation.agents.map(a => ({ id: a.id, x: a.position.x, z: a.position.z, elevation: a.elevation, floor: a.floor, stair: a.stair, active: a.active, trips: a.trips, direction: a.direction, purpose: a.purpose, dwellRemaining: a.dwellRemaining, origin: simulation.journeys.get(a.id)!.options.origin, destination: simulation.journeys.get(a.id)!.options.destination })) }; },
  } });
}
// Start on the concourse at eye level. Pointer lock requires a subsequent user click.
setMode('walk', false);
crowd.update(simulation.agents, 0, false); drawMap(); renderer.render(scene, camera);
$('loading').classList.add('done');
$('loading').setAttribute('aria-hidden', 'true');
requestAnimationFrame(frame);
