import './style.css';
import * as THREE from 'three';

interface GameCard {
  id: string;
  name: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  route: string;
  color: number;
}

const games: GameCard[] = [
  {
    id: 'rocket-runner',
    name: 'Rocket Runner',
    description: 'Practice timing and reflexes in a speed-focused endless runner.',
    difficulty: 'Easy',
    route: '/games/rocket-runner',
    color: 0x4fc3f7,
  },
  {
    id: 'maze-quest',
    name: 'Maze Quest 3D',
    description: 'Learn pathfinding ideas while navigating layered puzzle mazes.',
    difficulty: 'Medium',
    route: '/games/maze-quest',
    color: 0x81c784,
  },
  {
    id: 'space-math',
    name: 'Space Math Defense',
    description: 'Defend your planet by solving quick arithmetic challenges.',
    difficulty: 'Hard',
    route: '/games/space-math-defense',
    color: 0xffb74d,
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <section id="scene-root"></section>
  <aside class="panel">
    <h1>Kidz Gamez Arcade</h1>
    <p>Walk through the arcade, select a cabinet, and preview each game before jumping in.</p>
    <div class="game-meta" id="game-meta"></div>
  </aside>
`;

const sceneRoot = document.querySelector<HTMLElement>('#scene-root');
const gameMeta = document.querySelector<HTMLElement>('#game-meta');

if (!sceneRoot || !gameMeta) {
  throw new Error('Layout root was not found.');
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070b12, 14, 38);

const camera = new THREE.PerspectiveCamera(58, sceneRoot.clientWidth / sceneRoot.clientHeight, 0.1, 100);
camera.position.set(0, 4.4, 13);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneRoot.clientWidth, sceneRoot.clientHeight);
sceneRoot.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x7d94bf, 0.75);
scene.add(ambient);

const overhead = new THREE.DirectionalLight(0xdce7ff, 1.3);
overhead.position.set(0, 8, 5);
scene.add(overhead);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(70, 40),
  new THREE.MeshStandardMaterial({ color: 0x121b30, roughness: 0.98, metalness: 0.03 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const laneMarker = new THREE.Mesh(
  new THREE.PlaneGeometry(55, 2),
  new THREE.MeshStandardMaterial({ color: 0x1f3b7b, emissive: 0x102448, emissiveIntensity: 0.3 }),
);
laneMarker.rotation.x = -Math.PI / 2;
laneMarker.position.set(0, 0.01, 0);
scene.add(laneMarker);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let hoveredCabinet: THREE.Object3D | null = null;
let selectedGame = games[0];

const cabinets = games.map((game, index) => {
  const group = new THREE.Group();
  group.position.set((index - 1) * 8, 1.55, 0);
  group.userData.game = game;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 3.1, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x1a243c, roughness: 0.5, metalness: 0.2 }),
  );
  group.add(body);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1.4),
    new THREE.MeshStandardMaterial({
      color: game.color,
      emissive: game.color,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    }),
  );
  screen.position.set(0, 0.25, 1.26);
  group.add(screen);

  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.34, 0.4),
    new THREE.MeshStandardMaterial({
      color: game.color,
      emissive: game.color,
      emissiveIntensity: 0.3,
    }),
  );
  marquee.position.set(0, 1.52, 1.1);
  group.add(marquee);

  scene.add(group);
  return group;
});

function renderPanel(game: GameCard): void {
  gameMeta.innerHTML = `
    <h2 style="margin:0;font-size:1.15rem;">${game.name}</h2>
    <p>${game.description}</p>
    <p><strong>Difficulty:</strong> ${game.difficulty}</p>
    <p><strong>Route:</strong> <code>${game.route}</code></p>
    <button id="play-button">Play this game</button>
  `;

  const playButton = document.querySelector<HTMLButtonElement>('#play-button');
  playButton?.addEventListener('click', () => {
    window.alert(`Scaffold only: wire this button to your router and launch ${game.route}.`);
  });
}

renderPanel(selectedGame);

function onPointerMove(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('click', () => {
  if (!hoveredCabinet) {
    return;
  }

  const game = hoveredCabinet.userData.game as GameCard;
  selectedGame = game;
  renderPanel(selectedGame);
});

window.addEventListener('resize', () => {
  camera.aspect = sceneRoot.clientWidth / sceneRoot.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneRoot.clientWidth, sceneRoot.clientHeight);
});

const clock = new THREE.Clock();

function animate(): void {
  const elapsed = clock.getElapsedTime();

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(cabinets, true);
  hoveredCabinet = intersections[0]?.object.parent ?? null;

  for (const cabinet of cabinets) {
    const game = cabinet.userData.game as GameCard;
    const isActive = cabinet === hoveredCabinet || game.id === selectedGame.id;

    cabinet.position.y = 1.55 + (isActive ? Math.sin(elapsed * 2.2) * 0.07 : 0);

    const [body, screen, marquee] = cabinet.children as THREE.Mesh[];

    const screenMaterial = screen.material as THREE.MeshStandardMaterial;
    const marqueeMaterial = marquee.material as THREE.MeshStandardMaterial;

    screenMaterial.emissiveIntensity = isActive ? 0.85 : 0.5;
    marqueeMaterial.emissiveIntensity = isActive ? 0.65 : 0.25;

    if (isActive) {
      camera.position.x += (cabinet.position.x * 0.08 - camera.position.x) * 0.03;
    }

    (body.material as THREE.MeshStandardMaterial).color.setHex(isActive ? 0x223152 : 0x1a243c);
  }

  camera.lookAt(0, 1.6, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
