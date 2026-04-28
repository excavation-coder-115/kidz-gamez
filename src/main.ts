import './style.css';
import * as THREE from 'three';
import { decideBootPath } from './runtime-guardrails';

interface RiderState {
  mesh: any;
  velocity: any;
  lap: number;
  wrappedLastFrame: boolean;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root was not found.');
}

const probeCanvas = document.createElement('canvas');
const webglContext = (probeCanvas.getContext('webgl') ??
  probeCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
const bootDecision = decideBootPath({
  hasWebGLRenderingContext: typeof WebGLRenderingContext !== 'undefined',
  webglContextAvailable: Boolean(webglContext),
  maxTextureSize: webglContext ? Number(webglContext.getParameter(webglContext.MAX_TEXTURE_SIZE)) : 0,
  userAgent: navigator.userAgent,
});

if (bootDecision.type === 'unsupported-device') {
  app.innerHTML = `
    <section class="panel">
      <h1>Device unsupported</h1>
      <p>${bootDecision.message}</p>
      <p>${bootDecision.reasons.join(' ')}</p>
    </section>
  `;
} else {
  app.innerHTML = `
  <section id="scene-root"></section>
  <aside class="panel">
    <h1>MX Mini Prototype</h1>
    <p>
      Inspired by classic motocross games: ride over rolling terrain, hit jumps, throw tricks,
      and race simple AI riders.
    </p>
    <div class="controls">
      <h2>Controls</h2>
      <ul>
        <li><kbd>W</kbd> throttle</li>
        <li><kbd>S</kbd> brake / reverse</li>
        <li><kbd>A</kbd> <kbd>D</kbd> steer</li>
        <li><kbd>Space</kbd> jump / preload</li>
        <li><kbd>Q</kbd> <kbd>E</kbd> trick spin (air only)</li>
        <li><kbd>R</kbd> reset bike</li>
      </ul>
    </div>
    <div id="hud" class="hud"></div>
  </aside>
`;

const sceneRoot = document.querySelector<HTMLElement>('#scene-root');
const hud = document.querySelector<HTMLElement>('#hud');

if (!sceneRoot || !hud) {
  throw new Error('Layout root was not found.');
}

const hudElement = hud;

const world = {
  width: 360,
  depth: 52,
  halfDepth: 26,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fb7ff);
scene.fog = new THREE.Fog(0x9ac6ff, 40, 190);

const camera = new THREE.PerspectiveCamera(63, sceneRoot.clientWidth / sceneRoot.clientHeight, 0.1, 400);
camera.position.set(-12, 8, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneRoot.clientWidth, sceneRoot.clientHeight);
sceneRoot.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x8c6f3d, 1.05);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(26, 34, 8);
scene.add(sun);

const skyBand = new THREE.Mesh(
  new THREE.SphereGeometry(220, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0xb9daff, side: THREE.BackSide }),
);
scene.add(skyBand);

function terrainHeight(x: number, z: number): number {
  const base = Math.sin(x * 0.07) * 1.5 + Math.sin(x * 0.16 + 1.7) * 0.8;
  const laneShape = Math.cos(z * 0.22) * 0.4;
  const kicker = Math.max(0, 1 - Math.abs(((x + 18) % 62) - 31) / 9) * 2.6;
  return base + laneShape + kicker;
}

const terrainGeo = new THREE.PlaneGeometry(world.width, world.depth, 220, 50);
const terrainPos = terrainGeo.attributes.position;
for (let i = 0; i < terrainPos.count; i += 1) {
  const x = terrainPos.getX(i);
  const z = terrainPos.getY(i);
  terrainPos.setZ(i, terrainHeight(x, z));
}
terrainGeo.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({ color: 0x7d5b31, roughness: 0.95, metalness: 0 }),
);
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

const grass = new THREE.Mesh(
  new THREE.PlaneGeometry(world.width + 24, world.depth + 90),
  new THREE.MeshStandardMaterial({ color: 0x6ca048, roughness: 1 }),
);
grass.rotation.x = -Math.PI / 2;
grass.position.y = -0.15;
scene.add(grass);

const laneLines = new THREE.Group();
for (let lane = -2; lane <= 2; lane += 1) {
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(world.width, 0.02, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xd6c19a, emissive: 0x5b4421, emissiveIntensity: 0.15 }),
  );
  stripe.position.set(0, 0.25, lane * 8);
  laneLines.add(stripe);
}
scene.add(laneLines);

function makeBike(color: number): any {
  const bike = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.45, 0.45),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.18 }),
  );
  body.position.y = 0.45;
  bike.add(body);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.2, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1e1e1e }),
  );
  seat.position.set(-0.08, 0.73, 0);
  bike.add(seat);

  const wheelGeo = new THREE.TorusGeometry(0.32, 0.09, 12, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });

  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.rotation.y = Math.PI / 2;
  frontWheel.position.set(0.72, 0.22, 0);
  bike.add(frontWheel);

  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.rotation.y = Math.PI / 2;
  rearWheel.position.set(-0.72, 0.22, 0);
  bike.add(rearWheel);

  const rider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.68, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x3949ab, roughness: 0.6 }),
  );
  rider.position.set(-0.08, 1.15, 0);
  bike.add(rider);

  return bike;
}

const playerBike = makeBike(0xff7f32);
scene.add(playerBike);

const player: RiderState = {
  mesh: playerBike,
  velocity: new THREE.Vector3(0, 0, 0),
  lap: 1,
  wrappedLastFrame: false,
};
player.mesh.position.set(-world.width * 0.47, 2, 0);

const bots: RiderState[] = [0x3ec5ff, 0xad7cff, 0x87d96c].map((color, i) => {
  const bike = makeBike(color);
  bike.position.set(-world.width * 0.49 - i * 2.5, 1.5, (i - 1) * 6);
  scene.add(bike);

  return {
    mesh: bike,
    velocity: new THREE.Vector3(16 + i * 1.2, 0, 0),
    lap: 1,
    wrappedLastFrame: false,
  };
});

const keys = new Set<string>();
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));

let jumpCooldown = 0;
let trickSpin = 0;
let trickPoints = 0;
let totalScore = 0;
let airtime = 0;
let wasAirborne = false;

const tmpEuler = new THREE.Euler();

function updatePlayer(dt: number): void {
  const throttle = keys.has('KeyW') ? 1 : 0;
  const brake = keys.has('KeyS') ? 1 : 0;
  const steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

  const groundedHeight = terrainHeight(player.mesh.position.x, player.mesh.position.z) + 0.82;
  const grounded = player.mesh.position.y <= groundedHeight + 0.05;

  if (grounded) {
    player.mesh.position.y = groundedHeight;
    player.velocity.y = Math.max(0, player.velocity.y);
    airtime = 0;

    const drag = 5.5 * dt;
    player.velocity.x -= player.velocity.x * drag;
    player.velocity.z -= player.velocity.z * drag;

    player.velocity.x += (throttle * 30 - brake * 19) * dt;
    player.velocity.z += steer * 17 * dt;

    if (keys.has('Space') && jumpCooldown <= 0) {
      player.velocity.y = 8.6;
      jumpCooldown = 0.45;
      wasAirborne = true;
    }
  } else {
    airtime += dt;
    player.velocity.y -= 22 * dt;
    player.velocity.z += steer * 6 * dt;

    if (keys.has('KeyQ')) {
      trickSpin += 4.8 * dt;
    }
    if (keys.has('KeyE')) {
      trickSpin -= 4.8 * dt;
    }
  }

  if (keys.has('KeyR')) {
    player.mesh.position.set(-world.width * 0.47, terrainHeight(-world.width * 0.47, 0) + 1.2, 0);
    player.velocity.set(0, 0, 0);
    trickSpin = 0;
  }

  player.mesh.position.addScaledVector(player.velocity, dt);
  player.mesh.position.z = THREE.MathUtils.clamp(player.mesh.position.z, -world.halfDepth + 2.5, world.halfDepth - 2.5);

  const bank = THREE.MathUtils.clamp(-player.velocity.z * 0.05, -0.35, 0.35);
  const pitch = grounded ? THREE.MathUtils.clamp(player.velocity.x * 0.013, -0.16, 0.24) : 0.2;

  tmpEuler.set(0, 0, 0, 'XYZ');
  tmpEuler.z = bank;
  tmpEuler.x = pitch;
  player.mesh.rotation.copy(tmpEuler);
  player.mesh.rotateX(trickSpin);

  const wrapped = player.mesh.position.x > world.width * 0.5;
  if (wrapped && !player.wrappedLastFrame) {
    player.mesh.position.x = -world.width * 0.5;
    player.lap += 1;
  }
  player.wrappedLastFrame = wrapped;

  if (wasAirborne && grounded && Math.abs(trickSpin) > 0.4) {
    const landedPoints = Math.floor(Math.abs(trickSpin) * 120 + airtime * 90);
    trickPoints = landedPoints;
    totalScore += landedPoints;
    trickSpin = 0;
    wasAirborne = false;
  }

  jumpCooldown = Math.max(0, jumpCooldown - dt);
}

function updateBots(dt: number): void {
  bots.forEach((bot, i) => {
    const laneTarget = (i - 1) * 6 + Math.sin(performance.now() * 0.0004 + i) * 1.4;
    bot.velocity.z += (laneTarget - bot.mesh.position.z) * dt * 1.9;
    bot.velocity.x += Math.sin(performance.now() * 0.001 + i * 2.3) * dt;
    bot.velocity.x = THREE.MathUtils.clamp(bot.velocity.x, 14, 21);

    bot.mesh.position.addScaledVector(bot.velocity, dt);
    const ground = terrainHeight(bot.mesh.position.x, bot.mesh.position.z) + 0.8;
    bot.mesh.position.y = ground;

    bot.mesh.rotation.z = THREE.MathUtils.clamp(-bot.velocity.z * 0.03, -0.25, 0.25);
    bot.mesh.rotation.x = THREE.MathUtils.clamp(bot.velocity.x * 0.011, -0.1, 0.22);

    const wrapped = bot.mesh.position.x > world.width * 0.5;
    if (wrapped && !bot.wrappedLastFrame) {
      bot.mesh.position.x = -world.width * 0.5;
      bot.lap += 1;
    }
    bot.wrappedLastFrame = wrapped;
  });
}

function getRacePosition(): number {
  const progress = [player, ...bots]
    .map((rider, index) => ({
      index,
      score: rider.lap * world.width + rider.mesh.position.x,
    }))
    .sort((a, b) => b.score - a.score);

  const rank = progress.findIndex((entry) => entry.index === 0);
  return rank + 1;
}

function updateHud(): void {
  const speed = Math.max(0, player.velocity.length() * 3.6);
  const position = getRacePosition();
  const airborne = player.mesh.position.y > terrainHeight(player.mesh.position.x, player.mesh.position.z) + 0.95;

  hudElement.innerHTML = `
    <div class="hud-grid">
      <p><span>Speed</span><strong>${speed.toFixed(0)} km/h</strong></p>
      <p><span>Lap</span><strong>${player.lap}</strong></p>
      <p><span>Position</span><strong>${position} / ${bots.length + 1}</strong></p>
      <p><span>Status</span><strong>${airborne ? 'Airborne' : 'Grounded'}</strong></p>
      <p><span>Last trick</span><strong>${trickPoints} pts</strong></p>
      <p><span>Total score</span><strong>${totalScore} pts</strong></p>
    </div>
  `;
}

window.addEventListener('resize', () => {
  camera.aspect = sceneRoot.clientWidth / sceneRoot.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneRoot.clientWidth, sceneRoot.clientHeight);
});

const clock = new THREE.Clock();

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.033);

  updatePlayer(dt);
  updateBots(dt);
  updateHud();

  const lookAhead = new THREE.Vector3(4.5, 1.6, 0);
  const cameraTarget = player.mesh.position.clone().add(lookAhead);
  const desired = player.mesh.position.clone().add(new THREE.Vector3(-11, 7.2, 12));

  camera.position.lerp(desired, 0.07);
  camera.lookAt(cameraTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
}
