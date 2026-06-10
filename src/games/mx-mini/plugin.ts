import * as THREE from 'three';
import type {
  ArcadePlugin,
  ArcadeScene,
  GameManifestV1,
  KernelContext,
} from '../../contracts/arcade';

interface RiderState {
  group: any;
  wheels: any[];
  wheelSpin: number;
  s: number;
  n: number;
  height: number;
  velocity: any;
  lap: number;
}

const WHEEL_RADIUS = 0.41;

const BIKE = {
  frontWheelX: 0.78,
  rearWheelX: -0.78,
  wheelCenterY: 0.28,
  wheelRadius: 0.4,
  groundSnap: 0.34,
  driveForce: 40,
  brakeForce: 34,
  drag: 1.5,
  maxForwardSpeed: 30,
  maxReverseSpeed: -8,
  maxLateralSpeed: 9,
};

// Stadium oval: two straights joined by semicircular ends. Riders advance along the
// centerline arc-length `s` (one lap === TRACK_LENGTH) and pick a lateral line `n`.
const TRACK = { straight: 150, radius: 34, halfWidth: 11 };
const TRACK_ARC = Math.PI * TRACK.radius;
const TRACK_LENGTH = 2 * TRACK.straight + 2 * TRACK_ARC;
const LANE_LIMIT = TRACK.halfWidth - 1.5;

// Kicker ramps sit mid-straight; cresting one at speed launches the rider.
const RAMP_CENTERS = [TRACK.straight * 0.5, TRACK.straight + TRACK_ARC + TRACK.straight * 0.5];
const RAMP_W = 7;
const RAMP_H = 2.8;
const RAMP_LAUNCH = 0.5;

const GRAVITY = 22;
const TRICK_RATE = 5.5;
const GROUND_CLEARANCE = BIKE.wheelRadius - BIKE.wheelCenterY;

const MANIFEST: GameManifestV1 = {
  id: 'mx-mini',
  name: 'MX Mini Prototype',
  route: '/games/mx-mini',
  description:
    'Ride a rolling motocross oval, hit jumps, throw tricks, and race simple AI riders.',
  tags: ['racing', 'motocross'],
  ageBand: { min: 6, max: 12 },
  cabinetType: 'racing',
  vehicleSupport: 'none',
  launchMode: 'seamless',
};

export function createMxMiniPlugin(): ArcadePlugin {
  return {
    id: MANIFEST.id,
    route: MANIFEST.route,
    manifest: MANIFEST,
    canLaunch: () => ({ allowed: true }),
    createScene: (ctx) => buildScene(ctx),
    onEnter: (ctx) => {
      ctx.telemetry.emit('mx_mini_entered');
    },
    onExit: (ctx) => {
      ctx.telemetry.emit('mx_mini_exited');
    },
  };
}

function buildScene(ctx: KernelContext): ArcadeScene {
  const root = ctx.mount;
  root.innerHTML = `
    <section id="scene-root" class="scene-root"></section>
    <aside class="panel">
      <h1>MX Mini Prototype</h1>
      <p>
        Inspired by classic motocross games: race a rolling dirt oval, hit jumps, throw tricks,
        and chase simple AI riders.
      </p>
      <div class="controls">
        <h2>Controls</h2>
        <ul>
          <li><kbd>W</kbd> throttle</li>
          <li><kbd>S</kbd> brake / reverse</li>
          <li><kbd>A</kbd> <kbd>D</kbd> pick your line</li>
          <li><kbd>Space</kbd> hop</li>
          <li><kbd>Q</kbd> <kbd>E</kbd> trick spin (air only)</li>
          <li><kbd>R</kbd> reset bike</li>
        </ul>
      </div>
      <div id="hud" class="hud"></div>
    </aside>
  `;

  const sceneRootEl = root.querySelector<HTMLElement>('#scene-root');
  const hudEl = root.querySelector<HTMLElement>('#hud');
  if (!sceneRootEl || !hudEl) {
    throw new Error('MX Mini layout failed to render.');
  }
  const sceneRoot: HTMLElement = sceneRootEl;
  const hudElement: HTMLElement = hudEl;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7fb7ff);
  scene.fog = new THREE.Fog(0x9ac6ff, 60, 260);

  const camera = new THREE.PerspectiveCamera(63, sceneRoot.clientWidth / sceneRoot.clientHeight, 0.1, 500);
  camera.position.set(-90, 8, -40);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(sceneRoot.clientWidth, sceneRoot.clientHeight);
  sceneRoot.appendChild(renderer.domElement);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c6f3d, 1.05));

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(26, 34, 8);
  scene.add(sun);

  const skyGeo = track(new THREE.SphereGeometry(300, 32, 20));
  const skyMat = track(new THREE.MeshBasicMaterial({ color: 0xb9daff, side: THREE.BackSide }));
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Grass apron + infield: one plane beneath the raised dirt ribbon.
  const grassGeo = track(new THREE.PlaneGeometry(420, 220));
  const grassMat = track(new THREE.MeshStandardMaterial({ color: 0x6ca048, roughness: 1 }));
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -2;
  scene.add(grass);

  scene.add(buildTrackMesh(track));
  scene.add(buildLaneMarkers(track));

  const bikeAssets = createBikeAssets(track);

  const playerBike = makeBike(bikeAssets, 0xff7f32, track);
  scene.add(playerBike.group);

  const player: RiderState = {
    group: playerBike.group,
    wheels: playerBike.wheels,
    wheelSpin: 0,
    s: 0,
    n: 0,
    height: 0,
    velocity: new THREE.Vector3(0, 0, 0),
    lap: 1,
  };

  const bots: RiderState[] = [0x3ec5ff, 0xad7cff, 0x87d96c].map((color, i) => {
    const bike = makeBike(bikeAssets, color, track);
    scene.add(bike.group);
    return {
      group: bike.group,
      wheels: bike.wheels,
      wheelSpin: 0,
      s: (i + 1) * 5,
      n: (i - 1) * 4,
      height: 0,
      velocity: new THREE.Vector3(16 + i * 1.2, 0, 0),
      lap: 1,
    };
  });

  const keys = new Set<string>();
  const onKeyDown = (event: KeyboardEvent) => keys.add(event.code);
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const onResize = () => {
    camera.aspect = sceneRoot.clientWidth / sceneRoot.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(sceneRoot.clientWidth, sceneRoot.clientHeight);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);

  let jumpCooldown = 0;
  let trickSpin = 0;
  let trickPoints = 0;
  let totalScore = 0;
  let airtime = 0;
  let wasAirborne = false;
  let grounded = true;

  function updatePlayer(dt: number): void {
    const throttle = keys.has('KeyW') ? 1 : 0;
    const brake = keys.has('KeyS') ? 1 : 0;
    const steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const wasGrounded = grounded;
    const sBefore = player.s;

    if (grounded) {
      player.height = 0;
      player.velocity.y = Math.max(0, player.velocity.y);
      airtime = 0;

      const drive = throttle * BIKE.driveForce - brake * (player.velocity.x > 2 ? BIKE.brakeForce : 18);
      player.velocity.x += drive * dt;
      player.velocity.x -= player.velocity.x * BIKE.drag * dt;
      player.velocity.x = THREE.MathUtils.clamp(player.velocity.x, BIKE.maxReverseSpeed, BIKE.maxForwardSpeed);

      const speedAssist = THREE.MathUtils.clamp(Math.abs(player.velocity.x) / 12, 0.35, 1);
      const targetLateralSpeed = steer * BIKE.maxLateralSpeed * speedAssist;
      player.velocity.z += (targetLateralSpeed - player.velocity.z) * 8.5 * dt;

      if (keys.has('Space') && jumpCooldown <= 0) {
        player.velocity.y = 6.5 + Math.max(0, player.velocity.x) * 0.12;
        jumpCooldown = 0.45;
        wasAirborne = true;
      }
    } else {
      airtime += dt;
      player.velocity.y -= GRAVITY * dt;
      player.velocity.x -= player.velocity.x * 0.22 * dt;
      player.velocity.z += steer * 5.8 * dt;
      player.velocity.z = THREE.MathUtils.clamp(player.velocity.z, -BIKE.maxLateralSpeed, BIKE.maxLateralSpeed);

      if (keys.has('KeyQ')) trickSpin += TRICK_RATE * dt;
      if (keys.has('KeyE')) trickSpin -= TRICK_RATE * dt;
    }

    if (keys.has('KeyR')) {
      player.s = 0;
      player.n = 0;
      player.height = 0;
      player.velocity.set(0, 0, 0);
      trickSpin = 0;
      grounded = true;
      wasAirborne = false;
    }

    player.s = wrapDistance(player.s + player.velocity.x * dt);
    if (player.velocity.x >= 0 && player.s < sBefore) player.lap += 1;
    player.n = THREE.MathUtils.clamp(player.n + player.velocity.z * dt, -LANE_LIMIT, LANE_LIMIT);

    // Cresting a ramp on the ground turns forward speed into lift; faster === bigger air.
    // Apply before integrating height so the launch lifts the bike this frame and it
    // registers as airborne (otherwise the trick-scoring reset clears the launch flag).
    if (wasGrounded && player.height <= 0.001 && player.velocity.x > 5) {
      for (const c of RAMP_CENTERS) {
        if (sBefore < c && player.s >= c) {
          player.velocity.y = player.velocity.x * RAMP_LAUNCH;
          wasAirborne = true;
        }
      }
    }

    player.height += player.velocity.y * dt;

    if (player.height <= 0) {
      player.height = 0;
      player.velocity.y = Math.max(0, player.velocity.y);
      grounded = true;
    } else {
      grounded = false;
    }

    const bank = THREE.MathUtils.clamp(player.velocity.z * 0.05, -0.35, 0.35);
    const pitch = grounded
      ? THREE.MathUtils.clamp(terrainPitch(player.s) + player.velocity.x * 0.005, -0.45, 0.45)
      : 0.18;
    placeRider(player, bank, pitch, grounded ? 0 : trickSpin);
    spinBikeWheels(player, player.velocity.x * dt);

    if (wasAirborne && !wasGrounded && grounded && Math.abs(trickSpin) > 0.4) {
      const landedPoints = Math.floor(Math.abs(trickSpin) * 120 + airtime * 90);
      trickPoints = landedPoints;
      totalScore += landedPoints;
      trickSpin = 0;
      wasAirborne = false;
    } else if (grounded) {
      trickSpin = 0;
      wasAirborne = false;
    }

    jumpCooldown = Math.max(0, jumpCooldown - dt);
  }

  function updateBots(dt: number): void {
    bots.forEach((bot, i) => {
      const laneTarget = Math.sin(performance.now() * 0.0004 + i) * 5;
      bot.n = THREE.MathUtils.clamp(bot.n + (laneTarget - bot.n) * dt * 1.9, -LANE_LIMIT, LANE_LIMIT);
      bot.velocity.x += Math.sin(performance.now() * 0.001 + i * 2.3) * dt;
      bot.velocity.x = THREE.MathUtils.clamp(bot.velocity.x, 14, 21);

      const sBefore = bot.s;
      bot.s = wrapDistance(bot.s + bot.velocity.x * dt);
      if (bot.s < sBefore) bot.lap += 1;
      bot.height = 0;

      const bank = THREE.MathUtils.clamp((laneTarget - bot.n) * 0.05, -0.2, 0.2);
      const pitch = THREE.MathUtils.clamp(terrainPitch(bot.s) + bot.velocity.x * 0.004, -0.38, 0.38);
      placeRider(bot, bank, pitch, 0);
      spinBikeWheels(bot, bot.velocity.x * dt);
    });
  }

  function getRacePosition(): number {
    const progress = [player, ...bots]
      .map((rider, index) => ({
        index,
        score: rider.lap * TRACK_LENGTH + rider.s,
      }))
      .sort((a, b) => b.score - a.score);
    return progress.findIndex((entry) => entry.index === 0) + 1;
  }

  function updateHud(): void {
    const speed = Math.max(0, player.velocity.x * 3.6);
    const position = getRacePosition();
    hudElement.innerHTML = `
      <div class="hud-grid">
        <p><span>Speed</span><strong>${speed.toFixed(0)} km/h</strong></p>
        <p><span>Lap</span><strong>${player.lap}</strong></p>
        <p><span>Position</span><strong>${position} / ${bots.length + 1}</strong></p>
        <p><span>Status</span><strong>${grounded ? 'Grounded' : 'Airborne'}</strong></p>
        <p><span>Last trick</span><strong>${trickPoints} pts</strong></p>
        <p><span>Total score</span><strong>${totalScore} pts</strong></p>
      </div>
    `;
  }

  const clock = new THREE.Clock();
  let rafHandle = 0;
  let running = false;

  const camTan = { x: 0, z: 0 };
  const camForward = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function frame(): void {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.033);
    updatePlayer(dt);
    updateBots(dt);
    updateHud();

    trackTangent(player.s, camTan);
    const dir = player.velocity.x >= -0.5 ? 1 : -1;
    camForward.set(camTan.x, 0, camTan.z);
    camDesired.copy(player.group.position).addScaledVector(camForward, -13 * dir);
    camDesired.y += 5.8;
    camera.position.lerp(camDesired, 0.08);
    camLook.copy(player.group.position).addScaledVector(camForward, 8 * dir);
    camLook.y += 1.45;
    camera.lookAt(camLook);

    renderer.render(scene, camera);
    rafHandle = requestAnimationFrame(frame);
  }

  return {
    activate() {
      running = true;
      clock.start();
      rafHandle = requestAnimationFrame(frame);
    },
    dispose() {
      running = false;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}

function wrapDistance(s: number): number {
  return ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
}

// World position of the centerline at arc-length `s` (stadium-oval parametrization).
function trackCenter(s: number, out: { x: number; z: number }): { x: number; z: number } {
  const { straight, radius } = TRACK;
  let d = wrapDistance(s);
  if (d < straight) {
    out.x = -straight / 2 + d;
    out.z = -radius;
    return out;
  }
  d -= straight;
  if (d < TRACK_ARC) {
    const a = -Math.PI / 2 + d / radius;
    out.x = straight / 2 + radius * Math.cos(a);
    out.z = radius * Math.sin(a);
    return out;
  }
  d -= TRACK_ARC;
  if (d < straight) {
    out.x = straight / 2 - d;
    out.z = radius;
    return out;
  }
  d -= straight;
  const a = Math.PI / 2 + d / radius;
  out.x = -straight / 2 + radius * Math.cos(a);
  out.z = radius * Math.sin(a);
  return out;
}

const _tanA = { x: 0, z: 0 };
const _tanB = { x: 0, z: 0 };

// Unit tangent (direction of travel) at `s`, via central difference of the centerline.
function trackTangent(s: number, out: { x: number; z: number }): { x: number; z: number } {
  const e = 0.5;
  trackCenter(s - e, _tanA);
  trackCenter(s + e, _tanB);
  const dx = _tanB.x - _tanA.x;
  const dz = _tanB.z - _tanA.z;
  const len = Math.hypot(dx, dz) || 1;
  out.x = dx / len;
  out.z = dz / len;
  return out;
}

function surfaceHeight(s: number): number {
  const roll = Math.sin(s * 0.06) * 0.7 + Math.sin(s * 0.15 + 1.3) * 0.35;
  return roll + rampHeight(s);
}

function rampHeight(s: number): number {
  let h = 0;
  for (const c of RAMP_CENTERS) {
    let d = s - c;
    if (d > TRACK_LENGTH / 2) d -= TRACK_LENGTH;
    if (d < -TRACK_LENGTH / 2) d += TRACK_LENGTH;
    const t = Math.abs(d) / RAMP_W;
    if (t < 1) h += RAMP_H * (1 - t * t);
  }
  return h;
}

function terrainPitch(s: number): number {
  const front = surfaceHeight(s + BIKE.frontWheelX);
  const rear = surfaceHeight(s + BIKE.rearWheelX);
  return Math.atan2(front - rear, BIKE.frontWheelX - BIKE.rearWheelX);
}

const _center = { x: 0, z: 0 };
const _tangent = { x: 0, z: 0 };
const _euler = new THREE.Euler();
const _qLocal = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

// Map a rider's (s, n, height) onto the world and orient it along the track heading.
function placeRider(rider: RiderState, bank: number, pitch: number, roll: number): void {
  trackCenter(rider.s, _center);
  trackTangent(rider.s, _tangent);
  const nx = -_tangent.z;
  const nz = _tangent.x;
  const surface = surfaceHeight(rider.s) + GROUND_CLEARANCE;
  rider.group.position.set(_center.x + nx * rider.n, surface + rider.height, _center.z + nz * rider.n);

  const heading = Math.atan2(-_tangent.z, _tangent.x);
  _euler.set(bank, 0, pitch + roll, 'XYZ');
  _qLocal.setFromEuler(_euler);
  _qYaw.setFromAxisAngle(_yAxis, heading);
  rider.group.quaternion.copy(_qYaw).multiply(_qLocal);
}

function spinBikeWheels(rider: RiderState, distance: number): void {
  rider.wheelSpin -= distance / WHEEL_RADIUS;
  rider.wheels.forEach((wheel) => {
    wheel.rotation.z = rider.wheelSpin;
  });
}

// Builds the raised dirt ribbon as a grid swept along the centerline.
function buildTrackMesh(track: <T extends { dispose(): void }>(t: T) => T): any {
  const segs = 400;
  const cols = 6;
  const halfW = TRACK.halfWidth;
  const center = { x: 0, z: 0 };
  const tangent = { x: 0, z: 0 };

  const positions = new Float32Array((segs + 1) * (cols + 1) * 3);
  let p = 0;
  for (let i = 0; i <= segs; i += 1) {
    const s = (i / segs) * TRACK_LENGTH;
    trackCenter(s, center);
    trackTangent(s, tangent);
    const nx = -tangent.z;
    const nz = tangent.x;
    const y = surfaceHeight(s);
    for (let j = 0; j <= cols; j += 1) {
      const n = -halfW + (j / cols) * (2 * halfW);
      positions[p++] = center.x + nx * n;
      positions[p++] = y;
      positions[p++] = center.z + nz * n;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < segs; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const a = i * (cols + 1) + j;
      const b = a + (cols + 1);
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = track(
    new THREE.MeshStandardMaterial({ color: 0x7d5b31, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
  );
  return new THREE.Mesh(geo, mat);
}

// Dashed lane markers swept along the centerline, plus a start/finish line.
function buildLaneMarkers(track: <T extends { dispose(): void }>(t: T) => T): any {
  const group = new THREE.Group();
  const center = { x: 0, z: 0 };
  const tangent = { x: 0, z: 0 };

  const stripeGeo = track(new THREE.BoxGeometry(1.4, 0.06, 0.25));
  const stripeMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd6c19a, emissive: 0x5b4421, emissiveIntensity: 0.15 }),
  );
  const laneNs = [-(TRACK.halfWidth - 0.6), 0, TRACK.halfWidth - 0.6];
  const step = 3;
  const dashes = Math.floor(TRACK_LENGTH / step);
  const stripes = track(new THREE.InstancedMesh(stripeGeo, stripeMat, dashes * laneNs.length));
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  let idx = 0;
  for (let k = 0; k < dashes; k += 1) {
    const s = k * step + 1.5;
    trackCenter(s, center);
    trackTangent(s, tangent);
    const nx = -tangent.z;
    const nz = tangent.x;
    quat.setFromAxisAngle(yAxis, Math.atan2(-tangent.z, tangent.x));
    const y = surfaceHeight(s) + 0.07;
    for (const ln of laneNs) {
      pos.set(center.x + nx * ln, y, center.z + nz * ln);
      matrix.compose(pos, quat, scl);
      stripes.setMatrixAt(idx, matrix);
      idx += 1;
    }
  }
  stripes.instanceMatrix.needsUpdate = true;
  group.add(stripes);

  const startGeo = track(new THREE.BoxGeometry(0.5, 0.07, 2 * TRACK.halfWidth));
  const startMat = track(new THREE.MeshStandardMaterial({ color: 0xf2f5f9, roughness: 0.5 }));
  const startLine = new THREE.Mesh(startGeo, startMat);
  trackCenter(0.5, center);
  trackTangent(0.5, tangent);
  startLine.position.set(center.x, surfaceHeight(0.5) + 0.08, center.z);
  startLine.quaternion.setFromAxisAngle(yAxis, Math.atan2(-tangent.z, tangent.x));
  group.add(startLine);

  return group;
}

interface BikeAssets {
  bodyGeo: any;
  plateGeo: any;
  fenderGeo: any;
  forkGeo: any;
  handlebarGeo: any;
  seatGeo: any;
  seatMat: any;
  wheelGeo: any;
  spokeGeo: any;
  wheelMat: any;
  riderGeo: any;
  riderMat: any;
  forkMat: any;
  plateMat: any;
}

interface BikeRig {
  group: any;
  wheels: any[];
}

function createBikeAssets(track: <T extends { dispose(): void }>(t: T) => T): BikeAssets {
  return {
    bodyGeo: track(new THREE.BoxGeometry(1.55, 0.34, 0.38)),
    plateGeo: track(new THREE.BoxGeometry(0.34, 0.32, 0.06)),
    fenderGeo: track(new THREE.BoxGeometry(0.78, 0.08, 0.34)),
    forkGeo: track(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8)),
    handlebarGeo: track(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8)),
    seatGeo: track(new THREE.BoxGeometry(0.82, 0.16, 0.34)),
    seatMat: track(new THREE.MeshStandardMaterial({ color: 0x1e1e1e })),
    wheelGeo: track(new THREE.TorusGeometry(0.31, 0.085, 14, 24)),
    spokeGeo: track(new THREE.BoxGeometry(0.56, 0.05, 0.05)),
    wheelMat: track(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 })),
    riderGeo: track(new THREE.CapsuleGeometry(0.2, 0.68, 6, 10)),
    riderMat: track(new THREE.MeshStandardMaterial({ color: 0x3949ab, roughness: 0.6 })),
    forkMat: track(new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.34, metalness: 0.35 })),
    plateMat: track(new THREE.MeshStandardMaterial({ color: 0xf2f5f9, roughness: 0.5 })),
  };
}

// The group origin sits at ground-contact level so riders can be placed directly on the terrain.
function makeBike(
  assets: BikeAssets,
  color: number,
  track: <T extends { dispose(): void }>(t: T) => T,
): BikeRig {
  const bike = new THREE.Group();

  const bodyMat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.18 }));
  const body = new THREE.Mesh(assets.bodyGeo, bodyMat);
  body.position.y = 0.62;
  bike.add(body);

  const numberPlate = new THREE.Mesh(assets.plateGeo, assets.plateMat);
  numberPlate.position.set(0.36, 0.62, 0.22);
  numberPlate.rotation.z = -0.18;
  bike.add(numberPlate);

  const seat = new THREE.Mesh(assets.seatGeo, assets.seatMat);
  seat.position.set(-0.14, 0.78, 0);
  seat.rotation.z = -0.08;
  bike.add(seat);

  // Crossed spokes parented to the wheel so spinBikeWheels' rotation reads on screen
  // (a bare torus is rotationally symmetric and looks static when spun).
  const addSpokes = (wheel: any) => {
    for (let i = 0; i < 2; i += 1) {
      const spoke = new THREE.Mesh(assets.spokeGeo, assets.forkMat);
      spoke.rotation.z = (i * Math.PI) / 2;
      wheel.add(spoke);
    }
  };

  const frontWheel = new THREE.Mesh(assets.wheelGeo, assets.wheelMat);
  frontWheel.position.set(BIKE.frontWheelX, BIKE.wheelCenterY, 0);
  addSpokes(frontWheel);
  bike.add(frontWheel);

  const rearWheel = new THREE.Mesh(assets.wheelGeo, assets.wheelMat);
  rearWheel.position.set(BIKE.rearWheelX, BIKE.wheelCenterY, 0);
  addSpokes(rearWheel);
  bike.add(rearWheel);

  const frontFender = new THREE.Mesh(assets.fenderGeo, bodyMat);
  frontFender.position.set(BIKE.frontWheelX, 0.67, 0);
  frontFender.rotation.z = 0.16;
  bike.add(frontFender);

  const rearFender = new THREE.Mesh(assets.fenderGeo, bodyMat);
  rearFender.position.set(BIKE.rearWheelX, 0.66, 0);
  rearFender.rotation.z = -0.14;
  bike.add(rearFender);

  const frontFork = new THREE.Mesh(assets.forkGeo, assets.forkMat);
  frontFork.position.set(0.55, 0.58, 0.18);
  frontFork.rotation.z = -0.28;
  bike.add(frontFork);

  const rearFork = new THREE.Mesh(assets.forkGeo, assets.forkMat);
  rearFork.position.set(-0.45, 0.48, 0.18);
  rearFork.rotation.z = 1.12;
  bike.add(rearFork);

  const handlebar = new THREE.Mesh(assets.handlebarGeo, assets.forkMat);
  handlebar.position.set(0.42, 1.0, 0);
  handlebar.rotation.x = Math.PI / 2;
  bike.add(handlebar);

  const rider = new THREE.Mesh(assets.riderGeo, assets.riderMat);
  rider.position.set(-0.16, 1.16, 0);
  rider.rotation.z = -0.22;
  bike.add(rider);

  return { group: bike, wheels: [frontWheel, rearWheel] };
}
