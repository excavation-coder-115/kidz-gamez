import * as THREE from 'three';
import type {
  ArcadePlugin,
  ArcadeScene,
  GameManifestV1,
  KernelContext,
} from '../../contracts/arcade';

interface RiderState {
  mesh: any;
  velocity: any;
  lap: number;
  wrappedLastFrame: boolean;
}

interface TerrainContact {
  y: number;
  groundY: number;
  pitch: number;
}

const BIKE = {
  frontWheelX: 0.78,
  rearWheelX: -0.78,
  wheelCenterY: 0.28,
  wheelRadius: 0.4,
  groundSnap: 0.34,
  maxForwardSpeed: 31,
  maxReverseSpeed: -8,
  maxLateralSpeed: 9,
};

const MANIFEST: GameManifestV1 = {
  id: 'mx-mini',
  name: 'MX Mini Prototype',
  route: '/games/mx-mini',
  description:
    'Ride rolling motocross terrain, hit jumps, throw tricks, and race simple AI riders.',
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

  const sceneRootEl = root.querySelector<HTMLElement>('#scene-root');
  const hudEl = root.querySelector<HTMLElement>('#hud');
  if (!sceneRootEl || !hudEl) {
    throw new Error('MX Mini layout failed to render.');
  }
  const sceneRoot: HTMLElement = sceneRootEl;
  const hudElement: HTMLElement = hudEl;

  const world = { width: 360, depth: 52, halfDepth: 26 };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7fb7ff);
  scene.fog = new THREE.Fog(0x9ac6ff, 40, 190);

  const camera = new THREE.PerspectiveCamera(63, sceneRoot.clientWidth / sceneRoot.clientHeight, 0.1, 400);
  camera.position.set(-12, 8, 14);

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

  const skyGeo = track(new THREE.SphereGeometry(220, 32, 20));
  const skyMat = track(new THREE.MeshBasicMaterial({ color: 0xb9daff, side: THREE.BackSide }));
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const terrainGeo = track(new THREE.PlaneGeometry(world.width, world.depth, 220, 50));
  const terrainPos = terrainGeo.attributes.position;
  for (let i = 0; i < terrainPos.count; i += 1) {
    const x = terrainPos.getX(i);
    const z = terrainPos.getY(i);
    terrainPos.setZ(i, terrainHeight(x, z));
  }
  terrainGeo.computeVertexNormals();
  const terrainMat = track(new THREE.MeshStandardMaterial({ color: 0x7d5b31, roughness: 0.95, metalness: 0 }));
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  const grassGeo = track(new THREE.PlaneGeometry(world.width + 24, world.depth + 90));
  const grassMat = track(new THREE.MeshStandardMaterial({ color: 0x6ca048, roughness: 1 }));
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.15;
  scene.add(grass);

  const stripeGeo = track(new THREE.BoxGeometry(world.width, 0.02, 0.15));
  const stripeMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd6c19a, emissive: 0x5b4421, emissiveIntensity: 0.15 }),
  );
  const laneLines = new THREE.Group();
  for (let lane = -2; lane <= 2; lane += 1) {
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.25, lane * 8);
    laneLines.add(stripe);
  }
  scene.add(laneLines);

  const bikeAssets = createBikeAssets(track);

  const playerBike = makeBike(bikeAssets, 0xff7f32, track);
  scene.add(playerBike);

  const player: RiderState = {
    mesh: playerBike,
    velocity: new THREE.Vector3(0, 0, 0),
    lap: 1,
    wrappedLastFrame: false,
  };
  player.mesh.position.set(-world.width * 0.47, 2, 0);

  const bots: RiderState[] = [0x3ec5ff, 0xad7cff, 0x87d96c].map((color, i) => {
    const bike = makeBike(bikeAssets, color, track);
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
  let grounded = false;
  const tmpEuler = new THREE.Euler();

  function updatePlayer(dt: number): void {
    const throttle = keys.has('KeyW') ? 1 : 0;
    const brake = keys.has('KeyS') ? 1 : 0;
    const steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const contactBeforeMove = getTerrainContact(player.mesh.position.x, player.mesh.position.z);
    const wasGrounded = grounded;
    grounded = player.mesh.position.y <= contactBeforeMove.y + BIKE.groundSnap;

    if (grounded) {
      player.mesh.position.y = contactBeforeMove.y;
      player.velocity.y = Math.max(0, player.velocity.y);
      airtime = 0;

      const drive = throttle * 38 - brake * (player.velocity.x > 2 ? 32 : 18);
      player.velocity.x += drive * dt;
      player.velocity.x -= player.velocity.x * 3.2 * dt;
      player.velocity.x = THREE.MathUtils.clamp(player.velocity.x, BIKE.maxReverseSpeed, BIKE.maxForwardSpeed);

      const speedAssist = THREE.MathUtils.clamp(Math.abs(player.velocity.x) / 12, 0.35, 1);
      const targetLateralSpeed = steer * BIKE.maxLateralSpeed * speedAssist;
      player.velocity.z += (targetLateralSpeed - player.velocity.z) * 8.5 * dt;

      if (keys.has('Space') && jumpCooldown <= 0) {
        player.velocity.y = 9.2 + Math.max(0, player.velocity.x) * 0.045;
        jumpCooldown = 0.45;
        wasAirborne = true;
      }
    } else {
      airtime += dt;
      player.velocity.y -= 24 * dt;
      player.velocity.x -= player.velocity.x * 0.22 * dt;
      player.velocity.z += steer * 5.8 * dt;
      player.velocity.z = THREE.MathUtils.clamp(player.velocity.z, -BIKE.maxLateralSpeed, BIKE.maxLateralSpeed);

      if (keys.has('KeyQ')) trickSpin += 4.8 * dt;
      if (keys.has('KeyE')) trickSpin -= 4.8 * dt;
    }

    if (keys.has('KeyR')) {
      const resetContact = getTerrainContact(-world.width * 0.47, 0);
      player.mesh.position.set(-world.width * 0.47, resetContact.y + 0.35, 0);
      player.velocity.set(0, 0, 0);
      trickSpin = 0;
      grounded = false;
      wasAirborne = false;
    }

    player.mesh.position.addScaledVector(player.velocity, dt);
    player.mesh.position.z = THREE.MathUtils.clamp(
      player.mesh.position.z,
      -world.halfDepth + 2.5,
      world.halfDepth - 2.5,
    );

    const contactAfterMove = getTerrainContact(player.mesh.position.x, player.mesh.position.z);
    const landed = player.mesh.position.y <= contactAfterMove.y;
    if (landed) {
      player.mesh.position.y = contactAfterMove.y;
      player.velocity.y = Math.max(0, player.velocity.y);
      grounded = true;
    } else {
      grounded = false;
    }

    const bank = THREE.MathUtils.clamp(-player.velocity.z * 0.05, -0.35, 0.35);
    const pitch = grounded
      ? THREE.MathUtils.clamp(contactAfterMove.pitch + player.velocity.x * 0.005, -0.45, 0.45)
      : 0.18;

    tmpEuler.set(0, 0, 0, 'XYZ');
    tmpEuler.x = bank;
    tmpEuler.z = pitch;
    player.mesh.rotation.copy(tmpEuler);
    if (!grounded) player.mesh.rotateZ(trickSpin);
    spinBikeWheels(player.mesh, player.velocity.x * dt);

    const wrapped = player.mesh.position.x > world.width * 0.5;
    if (wrapped && !player.wrappedLastFrame) {
      player.mesh.position.x = -world.width * 0.5;
      player.lap += 1;
    }
    player.wrappedLastFrame = wrapped;

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
      const laneTarget = (i - 1) * 6 + Math.sin(performance.now() * 0.0004 + i) * 1.4;
      bot.velocity.z += (laneTarget - bot.mesh.position.z) * dt * 1.9;
      bot.velocity.x += Math.sin(performance.now() * 0.001 + i * 2.3) * dt;
      bot.velocity.x = THREE.MathUtils.clamp(bot.velocity.x, 14, 21);

      bot.mesh.position.addScaledVector(bot.velocity, dt);
      const contact = getTerrainContact(bot.mesh.position.x, bot.mesh.position.z);
      bot.mesh.position.y = contact.y;

      bot.mesh.rotation.x = THREE.MathUtils.clamp(-bot.velocity.z * 0.03, -0.25, 0.25);
      bot.mesh.rotation.z = THREE.MathUtils.clamp(contact.pitch + bot.velocity.x * 0.004, -0.38, 0.38);
      spinBikeWheels(bot.mesh, bot.velocity.x * dt);

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

  function frame(): void {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.033);
    updatePlayer(dt);
    updateBots(dt);
    updateHud();

    const travelDirection = player.velocity.x >= -0.5 ? 1 : -1;
    const lookAhead = new THREE.Vector3(8 * travelDirection, 1.45, player.velocity.z * 0.08);
    const cameraTarget = player.mesh.position.clone().add(lookAhead);
    const desired = player.mesh.position
      .clone()
      .add(new THREE.Vector3(-13 * travelDirection, 5.8, -player.velocity.z * 0.18));
    camera.position.lerp(desired, 0.1);
    camera.lookAt(cameraTarget);

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

function terrainHeight(x: number, z: number): number {
  const base = Math.sin(x * 0.07) * 1.5 + Math.sin(x * 0.16 + 1.7) * 0.8;
  const laneShape = Math.cos(z * 0.22) * 0.4;
  const kicker = Math.max(0, 1 - Math.abs(((x + 18) % 62) - 31) / 9) * 2.6;
  return base + laneShape + kicker;
}

function getTerrainContact(x: number, z: number): TerrainContact {
  const frontGround = terrainHeight(x + BIKE.frontWheelX, z);
  const rearGround = terrainHeight(x + BIKE.rearWheelX, z);
  const frontBikeY = frontGround + BIKE.wheelRadius - BIKE.wheelCenterY;
  const rearBikeY = rearGround + BIKE.wheelRadius - BIKE.wheelCenterY;

  return {
    y: Math.max(frontBikeY, rearBikeY),
    groundY: Math.max(frontGround, rearGround),
    pitch: Math.atan2(frontGround - rearGround, BIKE.frontWheelX - BIKE.rearWheelX),
  };
}

function spinBikeWheels(bike: any, distance: number): void {
  const wheelSpin = -distance / BIKE.wheelRadius;
  const wheels = bike.userData.wheels as any[] | undefined;
  wheels?.forEach((wheel) => {
    wheel.rotation.z += wheelSpin;
  });
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
  wheelMat: any;
  riderGeo: any;
  riderMat: any;
  forkMat: any;
  plateMat: any;
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
    wheelMat: track(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 })),
    riderGeo: track(new THREE.CapsuleGeometry(0.2, 0.68, 6, 10)),
    riderMat: track(new THREE.MeshStandardMaterial({ color: 0x3949ab, roughness: 0.6 })),
    forkMat: track(new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.34, metalness: 0.35 })),
    plateMat: track(new THREE.MeshStandardMaterial({ color: 0xf2f5f9, roughness: 0.5 })),
  };
}

function makeBike(
  assets: BikeAssets,
  color: number,
  track: <T extends { dispose(): void }>(t: T) => T,
): any {
  const bike = new THREE.Group();

  const bodyMat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.18 }));
  const body = new THREE.Mesh(assets.bodyGeo, bodyMat);
  body.position.y = 0.55;
  bike.add(body);

  const numberPlate = new THREE.Mesh(assets.plateGeo, assets.plateMat);
  numberPlate.position.set(0.36, 0.62, 0.22);
  numberPlate.rotation.z = -0.18;
  bike.add(numberPlate);

  const seat = new THREE.Mesh(assets.seatGeo, assets.seatMat);
  seat.position.set(-0.14, 0.78, 0);
  seat.rotation.z = -0.08;
  bike.add(seat);

  const frontWheel = new THREE.Mesh(assets.wheelGeo, assets.wheelMat);
  frontWheel.position.set(BIKE.frontWheelX, BIKE.wheelCenterY, 0);
  bike.add(frontWheel);

  const rearWheel = new THREE.Mesh(assets.wheelGeo, assets.wheelMat);
  rearWheel.position.set(BIKE.rearWheelX, BIKE.wheelCenterY, 0);
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

  bike.userData.wheels = [frontWheel, rearWheel];
  return bike;
}
