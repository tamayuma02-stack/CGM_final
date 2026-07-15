import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import TWEEN from '@tweenjs/tween.js';
import GUI from 'lil-gui';

// ------------------------------------------------------------
// 基本セットアップ（シーン・カメラ・レンダラー・ライト）
// ------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x223344);
scene.fog = new THREE.Fog(0x223344, 30, 90);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(6, 6, -30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.8, -22);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.49; // 地面より下にはいかない

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(20, 30, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add(dirLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------
// 物理ワールド（cannon-es）
// ------------------------------------------------------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

const groundMaterial = new CANNON.Material('ground');
const blockMaterial = new CANNON.Material('block');
world.addContactMaterial(
  new CANNON.ContactMaterial(groundMaterial, blockMaterial, {
    friction: 0.5,
    restitution: 0.05,
  })
);
world.addContactMaterial(
  new CANNON.ContactMaterial(blockMaterial, blockMaterial, {
    friction: 0.4,
    restitution: 0.05,
  })
);

// 地面
const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x556655 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// ------------------------------------------------------------
// 建造物（遺跡風の柱＋床スラブ構造）の生成
// ------------------------------------------------------------
interface Block {
  mesh: THREE.Object3D;
  body: CANNON.Body;
}

const blocks: Block[] = [];
// 木（自然物）用の物理ボディ。建造物のリセットでは消さない別配列にしておく
const natureBodies: Block[] = [];

const pillarGeo = new THREE.BoxGeometry(1, 2, 1);
const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a5, roughness: 0.9 });
const slabMat = new THREE.MeshStandardMaterial({ color: 0xa89f86, roughness: 0.9 });

function addBlock(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  size: THREE.Vector3,
  position: THREE.Vector3,
  mass: number
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
  const body = new CANNON.Body({ mass, material: blockMaterial });
  body.addShape(shape);
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);

  blocks.push({ mesh, body });
}

const FLOORS = 6;
const FLOOR_HEIGHT = 2.6;
const HALF = 4; // 柱の配置半径（正方形の半分）

function buildTowerAt(centerX: number, centerZ: number, floors: number, half: number) {
  const slabSize = half * 2 + 1;
  const towerSlabGeo = new THREE.BoxGeometry(slabSize, 0.6, slabSize);

  for (let floor = 0; floor < floors; floor++) {
    const baseY = floor * FLOOR_HEIGHT;

    // 4隅の柱
    const corners = [
      [half, half],
      [half, -half],
      [-half, half],
      [-half, -half],
    ];
    for (const [x, z] of corners) {
      addBlock(
        pillarGeo,
        stoneMat,
        new THREE.Vector3(1, 2, 1),
        new THREE.Vector3(centerX + x, baseY + 1, centerZ + z),
        floor === 0 ? 0 : 6 // 最下段は固定（土台）
      );
    }

    // 床スラブ（最上階の上にも1枚載せて屋根にする）
    addBlock(
      towerSlabGeo,
      slabMat,
      new THREE.Vector3(slabSize, 0.6, slabSize),
      new THREE.Vector3(centerX, baseY + 2 + 0.3, centerZ),
      10
    );
  }
}

function buildStructure() {
  // 既存ブロックの破棄
  for (const b of blocks) {
    scene.remove(b.mesh);
    world.removeBody(b.body);
  }
  blocks.length = 0;

  // メインの塔
  buildTowerAt(0, 0, FLOORS, HALF);
  // 周囲の小さな建物（すべて同じ仕組みで物理破壊できる）
  buildTowerAt(15, 5, 4, 2.5);
  buildTowerAt(-16, -6, 3, 2);
  buildTowerAt(-13, 10, 3, 2.2);
}

buildStructure();

// ------------------------------------------------------------
// 自然物（木・岩）：木は爆風で吹き飛ぶ物理ボディ付き、岩は装飾のみ
// ------------------------------------------------------------
const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a24, roughness: 0.9 });
const foliageGeo = new THREE.ConeGeometry(1, 2.2, 8);
const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.85 });
const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x777a72, roughness: 0.95 });

function createTree(x: number, z: number, scale: number) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  group.add(trunk);

  const foliage = new THREE.Mesh(foliageGeo, foliageMat);
  foliage.position.y = 2.1;
  foliage.castShadow = true;
  group.add(foliage);

  const foliageTop = new THREE.Mesh(foliageGeo, foliageMat);
  foliageTop.position.y = 2.9;
  foliageTop.scale.setScalar(0.7);
  foliageTop.castShadow = true;
  group.add(foliageTop);

  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  scene.add(group);

  // 魔法の爆風が当たると根元から吹き飛ぶよう、円柱形の剛体を持たせる
  // （offsetで地面接地点=グループ原点からの位置ずれを吸収し、mesh.positionへそのままコピーできるようにする）
  const treeRadius = 0.55 * scale;
  const treeHeight = 3.2 * scale;
  const body = new CANNON.Body({ mass: 5 * scale, material: blockMaterial });
  body.addShape(
    new CANNON.Cylinder(treeRadius, treeRadius, treeHeight, 8),
    new CANNON.Vec3(0, treeHeight / 2, 0)
  );
  body.position.set(x, 0, z);
  body.linearDamping = 0.2;
  body.angularDamping = 0.4;
  world.addBody(body);
  natureBodies.push({ mesh: group, body });
}

function createRock(x: number, z: number, scale: number) {
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.set(x, 0.3 * scale, z);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.scale.setScalar(scale);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

// 建物・大砲の位置には自然物を置かないための除外エリア
const natureExclusionZones = [
  { x: 0, z: 0, radius: 9 },
  { x: 15, z: 5, radius: 6 },
  { x: -16, z: -6, radius: 5 },
  { x: -13, z: 10, radius: 5 },
  { x: 0, z: -22, radius: 6 },
];

function isInsideExclusionZone(x: number, z: number): boolean {
  return natureExclusionZones.some((zone) => {
    const dx = x - zone.x;
    const dz = z - zone.z;
    return Math.sqrt(dx * dx + dz * dz) < zone.radius;
  });
}

function scatterNature() {
  const treeCount = 45;
  let placed = 0;
  let attempts = 0;
  while (placed < treeCount && attempts < treeCount * 10) {
    attempts++;
    const x = (Math.random() * 2 - 1) * 45;
    const z = (Math.random() * 2 - 1) * 45;
    if (isInsideExclusionZone(x, z)) continue;
    createTree(x, z, 0.8 + Math.random() * 0.6);
    placed++;
  }

  const rockCount = 20;
  placed = 0;
  attempts = 0;
  while (placed < rockCount && attempts < rockCount * 10) {
    attempts++;
    const x = (Math.random() * 2 - 1) * 45;
    const z = (Math.random() * 2 - 1) * 45;
    if (isInsideExclusionZone(x, z)) continue;
    createRock(x, z, 0.6 + Math.random() * 0.8);
    placed++;
  }
}

scatterNature();

// ------------------------------------------------------------
// 爆発演出用パーティクル
// ------------------------------------------------------------
interface ExplosionParticles {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
}

const activeExplosions: ExplosionParticles[] = [];

function spawnExplosionParticles(center: THREE.Vector3, power: number) {
  // 威力が大きいほど、粒子数・速度・粒の大きさを増やして派手にする
  const powerRatio = THREE.MathUtils.clamp(power / 150, 0, 1);
  const count = Math.round(THREE.MathUtils.lerp(80, 420, powerRatio));
  const speedMin = THREE.MathUtils.lerp(3, 8, powerRatio);
  const speedRange = THREE.MathUtils.lerp(4, 14, powerRatio);
  const particleSize = THREE.MathUtils.lerp(0.25, 0.55, powerRatio);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x;
    positions[i * 3 + 1] = center.y;
    positions[i * 3 + 2] = center.z;

    const dir = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();
    const speed = speedMin + Math.random() * speedRange;
    velocities[i * 3] = dir.x * speed;
    velocities[i * 3 + 1] = dir.y * speed + 2;
    velocities[i * 3 + 2] = dir.z * speed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x9933ff,
    size: particleSize,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  activeExplosions.push({ points, velocities, life: 1.2 });
}

function updateExplosionParticles(dt: number) {
  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const ex = activeExplosions[i];
    ex.life -= dt;

    const posAttr = ex.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let p = 0; p < posAttr.count; p++) {
      posAttr.setX(p, posAttr.getX(p) + ex.velocities[p * 3] * dt);
      posAttr.setY(p, posAttr.getY(p) + (ex.velocities[p * 3 + 1] - 9.8 * dt) * dt);
      posAttr.setZ(p, posAttr.getZ(p) + ex.velocities[p * 3 + 2] * dt);
      ex.velocities[p * 3 + 1] -= 9.8 * dt;
    }
    posAttr.needsUpdate = true;

    const mat = ex.points.material as THREE.PointsMaterial;
    mat.opacity = Math.max(ex.life / 1.2, 0);

    if (ex.life <= 0) {
      scene.remove(ex.points);
      ex.points.geometry.dispose();
      mat.dispose();
      activeExplosions.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------
// 魔法陣テクスチャ（Canvasで幾何学模様を描いて生成）
// ------------------------------------------------------------
function createMagicCircleTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.strokeStyle = 'rgba(200,140,255,0.9)';
  ctx.fillStyle = 'rgba(220,170,255,0.9)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.34, 0, Math.PI * 2);
  ctx.stroke();

  const spikes = 12;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * size * 0.34;
    const y1 = cy + Math.sin(a) * size * 0.34;
    const x2 = cx + Math.cos(a) * size * 0.48;
    const y2 = cy + Math.sin(a) * size * 0.48;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x2, y2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const points = 6;
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * size * 0.3;
    const y = cy + Math.sin(a) * size * 0.3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const magicCircleTexture = createMagicCircleTexture();
const magicCircleGeo = new THREE.PlaneGeometry(2, 2);

// ------------------------------------------------------------
// 魔法使い（ローブ＋杖の汎用キャラクター。遠距離から破壊魔法を放つ）
// ※特定作品のキャラクターは模倣せず、汎用的な魔法使い像として実装
// ------------------------------------------------------------
const CASTER_POS = new THREE.Vector3(0, 1.3, -22);
const STAFF_LENGTH = 3;

const casterGroup = new THREE.Group();
casterGroup.position.copy(CASTER_POS);
scene.add(casterGroup);

// ------------------------------------------------------------
// 魔法使いの移動（WASD／矢印キー）
// ------------------------------------------------------------
const keysPressed = new Set<string>();
window.addEventListener('keydown', (e) => keysPressed.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keysPressed.delete(e.key.toLowerCase()));

const MOVE_SPEED = 10;
const MOVE_BOUND = 42;

function updateCasterMovement(dt: number) {
  let moveX = 0;
  let moveZ = 0;
  if (keysPressed.has('w') || keysPressed.has('arrowup')) moveZ += 1;
  if (keysPressed.has('s') || keysPressed.has('arrowdown')) moveZ -= 1;
  if (keysPressed.has('a') || keysPressed.has('arrowleft')) moveX -= 1;
  if (keysPressed.has('d') || keysPressed.has('arrowright')) moveX += 1;

  if (moveX === 0 && moveZ === 0) return;

  const len = Math.hypot(moveX, moveZ);
  moveX /= len;
  moveZ /= len;
  casterGroup.position.x = THREE.MathUtils.clamp(
    casterGroup.position.x + moveX * MOVE_SPEED * dt,
    -MOVE_BOUND,
    MOVE_BOUND
  );
  casterGroup.position.z = THREE.MathUtils.clamp(
    casterGroup.position.z + moveZ * MOVE_SPEED * dt,
    -MOVE_BOUND,
    MOVE_BOUND
  );
}

const robeMesh = new THREE.Mesh(
  new THREE.ConeGeometry(0.9, 2.2, 16),
  new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.8 })
);
robeMesh.position.y = 0.5;
robeMesh.castShadow = true;
casterGroup.add(robeMesh);

const headMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xe8c9a0, roughness: 0.7 })
);
headMesh.position.y = 1.9;
headMesh.castShadow = true;
casterGroup.add(headMesh);

const hatMesh = new THREE.Mesh(
  new THREE.ConeGeometry(0.5, 0.9, 16),
  new THREE.MeshStandardMaterial({ color: 0x1a1630, roughness: 0.8 })
);
hatMesh.position.y = 2.55;
hatMesh.castShadow = true;
casterGroup.add(hatMesh);

const staffPivot = new THREE.Group();
staffPivot.position.y = 1.2;
staffPivot.rotation.order = 'YXZ';
casterGroup.add(staffPivot);

const staffMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.06, 0.06, STAFF_LENGTH, 10),
  new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.6 })
);
staffMesh.rotation.x = Math.PI / 2; // 円柱の軸をZ方向に向ける
staffMesh.position.z = STAFF_LENGTH / 2;
staffMesh.castShadow = true;
staffPivot.add(staffMesh);

const staffOrbMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0x220033,
    emissive: 0x8822ff,
    emissiveIntensity: 1.2,
  })
);
staffOrbMesh.position.z = STAFF_LENGTH;
staffPivot.add(staffOrbMesh);

const castCircleMesh = new THREE.Mesh(
  magicCircleGeo,
  new THREE.MeshBasicMaterial({
    map: magicCircleTexture,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
castCircleMesh.scale.setScalar(0.5);
castCircleMesh.position.z = STAFF_LENGTH + 0.3;
staffPivot.add(castCircleMesh);

const castLight = new THREE.PointLight(0xa855ff, 0, 10);
castLight.position.z = STAFF_LENGTH;
staffPivot.add(castLight);

// ------------------------------------------------------------
// マウスで狙う：カーソルの左右位置で向き(yaw)、上下位置で仰角(angle)を操作する
// ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
// クリックした実際の3D地点（建物の壁面などy>0もありうる）：直線ビームの正確な着弾先に使う
const mouseHitPoint = new THREE.Vector3(0, 0, 0);
// 上のXZ座標を地面（y=0）に投影したもの：落下の柱・魔法の雨の狙い先に使う
const mouseGroundTarget = new THREE.Vector3(0, 0, 0);

function updateAimFromMouse(clientX: number, clientY: number) {
  mouseNDC.x = (clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(clientY / window.innerHeight) * 2 + 1;

  // 画面の縦位置：上ほど仰角が大きく、下ほど小さくなるようにマッピングする
  const verticalRatio = 1 - clientY / window.innerHeight; // 下端0 〜 上端1
  params.angle = THREE.MathUtils.clamp(THREE.MathUtils.lerp(10, 75, verticalRatio), 10, 75);

  raycaster.setFromCamera(mouseNDC, camera);
  // 地面だけでなく建造物（ブロック）も判定対象にすることで、建物の側面・上層階も正しく狙える
  const targets = [groundMesh, ...blocks.map((b) => b.mesh)];
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (hit) {
    mouseHitPoint.copy(hit.point);
    mouseGroundTarget.set(hit.point.x, 0, hit.point.z);

    const dx = hit.point.x - casterGroup.position.x;
    const dz = hit.point.z - casterGroup.position.z;
    if (Math.hypot(dx, dz) >= 0.5) {
      // 真下付近は向きが不定になるので無視
      params.yaw = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
    }
  }

  updateAim();
}

renderer.domElement.addEventListener('pointermove', (e) => {
  updateAimFromMouse(e.clientX, e.clientY);
});

// クリック（ドラッグでカメラ回転した場合は除く）で魔法を発射
let pointerDownX = 0;
let pointerDownY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const movedDist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
  if (movedDist < 5) {
    fireCurrentSpell();
  }
});

// ------------------------------------------------------------
// GUI（照準・威力・爆風の指定）
// ------------------------------------------------------------
const params = {
  spellType: 'beam' as 'beam' | 'pillar' | 'rain',
  angle: 35, // 仰角（度）
  yaw: 0, // 左右の向き（度）
  launchPower: 30, // 発射速度
  radius: 12, // 爆風半径
  blastPower: 60, // 爆風の威力
  fire: () => fireCurrentSpell(),
  reset: () => buildStructure(),
};

function getAimDirection(): THREE.Vector3 {
  const yawRad = THREE.MathUtils.degToRad(params.yaw);
  const angleRad = THREE.MathUtils.degToRad(params.angle);
  return new THREE.Vector3(
    Math.sin(yawRad) * Math.cos(angleRad),
    Math.sin(angleRad),
    Math.cos(yawRad) * Math.cos(angleRad)
  );
}

// 落下の柱・魔法の雨用：マウスが指している地面の座標をそのまま狙い先にする
function getGroundTarget(): THREE.Vector3 {
  return mouseGroundTarget.clone();
}

function updateAim() {
  const yawRad = THREE.MathUtils.degToRad(params.yaw);
  const angleRad = THREE.MathUtils.degToRad(params.angle);
  staffPivot.rotation.y = yawRad;
  staffPivot.rotation.x = -angleRad;
}
updateAim();

const gui = new GUI({ title: '魔法コントロール' });
gui
  .add(params, 'spellType', { 直線ビーム: 'beam', 落下の柱: 'pillar', 魔法の雨: 'rain' })
  .name('魔法の種類');

const aimFolder = gui.addFolder('照準（上下左右はマウスで自動）');
aimFolder.add(params, 'launchPower', 15, 45, 1).name('威力（速度・直線ビーム用）').onChange(updateAim);

const blastFolder = gui.addFolder('着弾時の爆風');
blastFolder.add(params, 'radius', 2, 25, 0.5).name('範囲半径');
blastFolder.add(params, 'blastPower', 10, 150, 1).name('威力');

gui.add(params, 'fire').name('魔法を放つ！（クリックでも発射）');
gui.add(params, 'reset').name('建造物をリセット');

// ------------------------------------------------------------
// 詠唱エフェクト：発射の瞬間、魔法陣が拡大して発光する
// ------------------------------------------------------------
const BEAM_UP_AXIS = new THREE.Vector3(0, 1, 0);

function playCastChargeEffect() {
  const circleMat = castCircleMesh.material as THREE.MeshBasicMaterial;
  const state = { scale: castCircleMesh.scale.x, opacity: circleMat.opacity, light: 0 };

  const grow = new TWEEN.Tween(state)
    .to({ scale: 2.6, opacity: 1, light: 8 }, 180)
    .easing(TWEEN.Easing.Quadratic.Out);
  const shrink = new TWEEN.Tween(state)
    .to({ scale: 0.5, opacity: 0.85, light: 0 }, 320)
    .easing(TWEEN.Easing.Quadratic.In);

  const applyState = () => {
    castCircleMesh.scale.setScalar(state.scale);
    circleMat.opacity = state.opacity;
    castLight.intensity = state.light;
  };
  grow.onUpdate(applyState);
  shrink.onUpdate(applyState);
  grow.chain(shrink);
  grow.start();
}

// ------------------------------------------------------------
// 魔法弾（cannon-esの剛体として飛ばし、着弾で爆発させる）
// 直線ビーム・落下の柱・雨の3種類はすべてこの共通の弾を使う
// ------------------------------------------------------------
interface SpellProjectile {
  group: THREE.Group;
  body: CANNON.Body;
  exploded: boolean;
  life: number;
  blastRadius: number;
  blastPower: number;
}

const spellProjectiles: SpellProjectile[] = [];
const beamCoreGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.4, 10);
const beamGlowGeo = new THREE.CylinderGeometry(0.38, 0.38, 2.4, 10);
const beamCoreMat = new THREE.MeshBasicMaterial({ color: 0xf3e6ff });
const beamGlowMat = new THREE.MeshBasicMaterial({
  color: 0x9b30ff,
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function createBeamMesh(): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(beamCoreGeo, beamCoreMat);
  const glow = new THREE.Mesh(beamGlowGeo, beamGlowMat);
  group.add(glow);
  group.add(core);
  return group;
}

// 落下の柱専用：建物と同じくらい太く、かつ高さのある円柱
const pillarCoreGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 20);
const pillarGlowGeo = new THREE.CylinderGeometry(0.85, 0.85, 12, 20);

function createPillarMesh(): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(pillarCoreGeo, beamCoreMat);
  const glow = new THREE.Mesh(pillarGlowGeo, beamGlowMat);
  group.add(glow);
  group.add(core);
  return group;
}

function spawnProjectile(
  group: THREE.Group,
  origin: THREE.Vector3,
  velocity: THREE.Vector3,
  colliderRadius: number,
  blastRadius: number,
  blastPower: number
) {
  group.position.copy(origin);
  const dir = velocity.clone().normalize();
  group.quaternion.setFromUnitVectors(BEAM_UP_AXIS, dir);
  scene.add(group);

  const body = new CANNON.Body({ mass: 4, material: blockMaterial });
  body.addShape(new CANNON.Sphere(colliderRadius));
  body.position.set(origin.x, origin.y, origin.z);
  body.velocity.set(velocity.x, velocity.y, velocity.z);
  body.linearDamping = 0; // 弾道計算どおりに飛ばすため減衰なし
  world.addBody(body);

  const projectile: SpellProjectile = { group, body, exploded: false, life: 8, blastRadius, blastPower };
  spellProjectiles.push(projectile);

  body.addEventListener('collide', () => {
    if (projectile.exploded) return;
    projectile.exploded = true;
    detonateAt(
      new THREE.Vector3(body.position.x, body.position.y, body.position.z),
      projectile.blastRadius,
      projectile.blastPower
    );
  });
}

function updateSpellProjectiles(dt: number) {
  for (let i = spellProjectiles.length - 1; i >= 0; i--) {
    const projectile = spellProjectiles[i];
    projectile.life -= dt;
    projectile.group.position.copy(projectile.body.position as unknown as THREE.Vector3);

    const velocity = projectile.body.velocity;
    if (velocity.length() > 0.01) {
      const dir = new THREE.Vector3(velocity.x, velocity.y, velocity.z).normalize();
      projectile.group.quaternion.setFromUnitVectors(BEAM_UP_AXIS, dir);
    }

    if (projectile.exploded || projectile.life <= 0) {
      scene.remove(projectile.group);
      world.removeBody(projectile.body);
      spellProjectiles.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------
// 地面の予兆魔法陣（着弾前に展開が広がるだけの演出用。フェードはしない）
// ------------------------------------------------------------
function spawnGroundTelegraphCircle(target: THREE.Vector3, targetScale: number, durationMs: number) {
  const material = new THREE.MeshBasicMaterial({
    map: magicCircleTexture,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(magicCircleGeo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(target.x, 0.06, target.z);
  mesh.scale.setScalar(0.05);
  scene.add(mesh);

  const state = { scale: 0.05 };
  new TWEEN.Tween(state)
    .to({ scale: targetScale }, durationMs)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onUpdate(() => mesh.scale.setScalar(state.scale))
    .onComplete(() => {
      scene.remove(mesh);
      material.dispose();
    })
    .start();
}

// ------------------------------------------------------------
// 魔法1：直線ビーム（杖から狙った方向へ発射）
// ------------------------------------------------------------
// 範囲半径・威力の両方を反映した「魔法本体の大きさ」割合（0〜1）。全魔法共通で使う
function getSpellSizeRatio(): number {
  const radiusRatio = THREE.MathUtils.clamp((params.radius - 2) / (25 - 2), 0, 1);
  const powerRatio = THREE.MathUtils.clamp((params.blastPower - 10) / (150 - 10), 0, 1);
  return THREE.MathUtils.clamp((radiusRatio + powerRatio) / 2, 0, 1);
}

function castBeamSpell() {
  playCastChargeEffect();

  // クリックした瞬間の狙い先を確定させておく（詠唱中にマウスが動いてもズレないように）
  const target = mouseHitPoint.clone();

  // 詠唱モーション分（魔法陣の展開）を待ってから発射する
  window.setTimeout(() => {
    const dir = getAimDirection();
    const muzzle = casterGroup.position.clone()
      .add(new THREE.Vector3(0, 1.2, 0))
      .add(dir.clone().multiplyScalar(STAFF_LENGTH));

    // 範囲半径・威力が大きいほど魔法弾（ビーム）自体を極端に太くする（長さは控えめに伸ばす）
    const sizeRatio = getSpellSizeRatio();
    const beamRadialScale = THREE.MathUtils.lerp(0.9, 8, sizeRatio);
    const beamLengthScale = THREE.MathUtils.lerp(0.9, 2.2, sizeRatio);

    const group = createBeamMesh();
    group.scale.set(beamRadialScale, beamLengthScale, beamRadialScale);

    // クリック地点へ正確に着弾するよう、放物線の初速を逆算する
    // （威力が大きいほど飛行時間が短くなり、より速く・直線的な弾道になる）
    const GRAVITY = 9.82;
    const displacement = target.clone().sub(muzzle);
    const horizontalDist = Math.hypot(displacement.x, displacement.z);
    const flightTime = THREE.MathUtils.clamp(
      horizontalDist / (params.launchPower * 1.1),
      0.35,
      3.5
    );
    const velocity = new THREE.Vector3(
      displacement.x / flightTime,
      (displacement.y + 0.5 * GRAVITY * flightTime * flightTime) / flightTime,
      displacement.z / flightTime
    );

    spawnProjectile(
      group,
      muzzle,
      velocity,
      0.4 * beamRadialScale,
      params.radius,
      params.blastPower
    );
  }, 220);
}

// ------------------------------------------------------------
// 魔法2：落下の柱（建造物の真下に魔法陣が広がり、上から太い柱が落ちる）
// ------------------------------------------------------------
const FALL_HEIGHT = 40;
const FALL_SPEED = 26;

function castPillarSpell() {
  playCastChargeEffect();

  const target = getGroundTarget();
  const telegraphScale = Math.max(params.radius * 0.18, 1);
  spawnGroundTelegraphCircle(target, telegraphScale, 650);

  window.setTimeout(() => {
    const origin = new THREE.Vector3(target.x, FALL_HEIGHT, target.z);
    const velocity = new THREE.Vector3(0, -FALL_SPEED, 0);

    // 範囲半径・威力が最大のとき、建物（スラブ幅9＝半径4.5）と同じくらい太くなるようにする
    const sizeRatio = getSpellSizeRatio();
    const radiusScale = THREE.MathUtils.lerp(1, 5.3, sizeRatio); // グロー半径0.85 × 5.3 ≒ 4.5
    const heightScale = THREE.MathUtils.lerp(1, 1.8, sizeRatio);

    const group = createPillarMesh();
    group.scale.set(radiusScale, heightScale, radiusScale);

    // 柱は通常のビームより威力も上乗せする
    spawnProjectile(group, origin, velocity, 0.5 * radiusScale, params.radius * 1.3, params.blastPower * 1.4);
  }, 650);
}

// ------------------------------------------------------------
// 魔法3：魔法の雨（建造物周辺に複数の弾が降り注ぐ）
// ------------------------------------------------------------
function castRainSpell() {
  playCastChargeEffect();

  const rainCenter = getGroundTarget();
  // 範囲半径・威力が大きいほど、降り注ぐ範囲を広く・本数を多くする
  const sizeRatio = getSpellSizeRatio();
  const spreadRadius = HALF + 6 + params.radius;
  const dropCount = Math.round(THREE.MathUtils.lerp(12, 24, sizeRatio));
  for (let i = 0; i < dropCount; i++) {
    const startDelay = i * 100;
    window.setTimeout(() => {
      const targetX = rainCenter.x + (Math.random() * 2 - 1) * spreadRadius;
      const targetZ = rainCenter.z + (Math.random() * 2 - 1) * spreadRadius;
      const target = new THREE.Vector3(targetX, 0, targetZ);

      spawnGroundTelegraphCircle(target, Math.max(params.radius * 0.08, 0.5), 260);

      window.setTimeout(() => {
        const origin = new THREE.Vector3(targetX, FALL_HEIGHT * 0.7, targetZ);
        const velocity = new THREE.Vector3(0, -FALL_SPEED * 1.2, 0);
        // 1発ずつは通常のビームより小さく・弱くして、複数回の着弾で建物を崩す
        // （範囲半径・威力が大きいほど雨粒自体も太くなる）
        const rainScale = THREE.MathUtils.lerp(0.6, 1.6, getSpellSizeRatio());
        const rainGroup = createBeamMesh();
        rainGroup.scale.set(rainScale, rainScale, rainScale);
        spawnProjectile(rainGroup, origin, velocity, 0.32 * rainScale, params.radius * 0.5, params.blastPower * 0.4);
      }, 260);
    }, startDelay);
  }
}

function fireCurrentSpell() {
  if (params.spellType === 'pillar') {
    castPillarSpell();
  } else if (params.spellType === 'rain') {
    castRainSpell();
  } else {
    castBeamSpell();
  }
}

// ------------------------------------------------------------
// 着弾魔法陣（地面に展開し、広がりながら消える）
// ------------------------------------------------------------
interface MagicCircleEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  baseScale: number;
  growFactor: number;
}

interface ImpactFlash {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  baseIntensity: number;
}

const activeMagicCircles: MagicCircleEffect[] = [];
const activeImpactFlashes: ImpactFlash[] = [];

function spawnImpactMagicCircle(center: THREE.Vector3, radius: number, power: number) {
  const powerRatio = THREE.MathUtils.clamp(power / 150, 0, 1);

  const material = new THREE.MeshBasicMaterial({
    map: magicCircleTexture,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(magicCircleGeo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, 0.05, center.z);

  // 威力・範囲が大きいほど魔法陣も大きく、拡がる速度も速くする
  const baseScale = Math.max(radius * 0.12, 0.6) * (1 + powerRatio * 0.6);
  mesh.scale.setScalar(baseScale);
  scene.add(mesh);

  const growFactor = THREE.MathUtils.lerp(2, 4.5, powerRatio);
  activeMagicCircles.push({ mesh, life: 1.1, maxLife: 1.1, baseScale, growFactor });

  // 威力が大きいほど眩しく光る着弾フラッシュ
  const baseIntensity = THREE.MathUtils.lerp(3, 20, powerRatio);
  const flash = new THREE.PointLight(0xa855ff, baseIntensity, radius * 1.5 + 5);
  flash.position.set(center.x, center.y, center.z);
  scene.add(flash);
  activeImpactFlashes.push({ light: flash, life: 0.35, maxLife: 0.35, baseIntensity });
}

function updateMagicCircles(dt: number) {
  for (let i = activeMagicCircles.length - 1; i >= 0; i--) {
    const effect = activeMagicCircles[i];
    effect.life -= dt;

    const t = 1 - effect.life / effect.maxLife;
    const scale = effect.baseScale * (1 + t * effect.growFactor);
    effect.mesh.scale.setScalar(scale);
    effect.mesh.rotation.z += dt * 1.5;

    const mat = effect.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(effect.life / effect.maxLife, 0) * 0.9;

    if (effect.life <= 0) {
      scene.remove(effect.mesh);
      mat.dispose();
      activeMagicCircles.splice(i, 1);
    }
  }
}

function updateImpactFlashes(dt: number) {
  for (let i = activeImpactFlashes.length - 1; i >= 0; i--) {
    const flash = activeImpactFlashes[i];
    flash.life -= dt;

    const t = Math.max(flash.life / flash.maxLife, 0);
    flash.light.intensity = flash.baseIntensity * t * t;
    if (flash.life <= 0) {
      scene.remove(flash.light);
      activeImpactFlashes.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------
// 爆発処理：範囲内の剛体に距離減衰つきの力積を加える
// ------------------------------------------------------------
function detonateAt(center: THREE.Vector3, radius: number, power: number) {
  const cannonCenter = new CANNON.Vec3(center.x, center.y, center.z);

  for (const b of blocks) {
    if (b.body.mass === 0) continue; // 固定された土台には作用させない

    const diff = new CANNON.Vec3();
    b.body.position.vsub(cannonCenter, diff);
    const dist = diff.length();
    if (dist > radius) continue;

    const falloff = 1 - dist / radius;
    const impulseMag = power * falloff;
    const dir = diff.unit();
    const impulse = dir.scale(impulseMag);

    b.body.wakeUp();
    b.body.applyImpulse(impulse, b.body.position);
  }

  for (const t of natureBodies) {
    const diff = new CANNON.Vec3();
    t.body.position.vsub(cannonCenter, diff);
    const dist = diff.length();
    if (dist > radius) continue;

    const falloff = 1 - dist / radius;
    const impulseMag = power * falloff;
    const dir = diff.unit();
    const impulse = dir.scale(impulseMag);

    t.body.wakeUp();
    t.body.applyImpulse(impulse, t.body.position);
  }

  spawnExplosionParticles(center, power);
  spawnImpactMagicCircle(center, radius, power);
}

// ------------------------------------------------------------
// メインループ
// ------------------------------------------------------------
const clock = new THREE.Clock();
const CAMERA_LOOK_HEIGHT = 1.5; // 頭の高さあたりを注視点にする

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  world.step(1 / 60, dt, 3);

  for (const b of blocks) {
    b.mesh.position.copy(b.body.position as unknown as THREE.Vector3);
    b.mesh.quaternion.copy(b.body.quaternion as unknown as THREE.Quaternion);
  }
  for (const t of natureBodies) {
    t.mesh.position.copy(t.body.position as unknown as THREE.Vector3);
    t.mesh.quaternion.copy(t.body.quaternion as unknown as THREE.Quaternion);
  }

  updateCasterMovement(dt);

  // 三人称カメラ：注視点を常に魔法使いに固定し、マウスドラッグでの周回・ズームはOrbitControlsに任せる
  controls.target.set(
    casterGroup.position.x,
    casterGroup.position.y + CAMERA_LOOK_HEIGHT,
    casterGroup.position.z
  );

  castCircleMesh.rotation.z += dt * 1.2;
  updateSpellProjectiles(dt);
  updateExplosionParticles(dt);
  updateMagicCircles(dt);
  updateImpactFlashes(dt);
  TWEEN.update();
  controls.update();
  renderer.render(scene, camera);
}

animate();
