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
controls.target.set(0, 6, 0);
controls.enableDamping = true;

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
  mesh: THREE.Mesh;
  body: CANNON.Body;
}

const blocks: Block[] = [];

const pillarGeo = new THREE.BoxGeometry(1, 2, 1);
const slabGeo = new THREE.BoxGeometry(9, 0.6, 9);
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

function buildStructure() {
  // 既存ブロックの破棄
  for (const b of blocks) {
    scene.remove(b.mesh);
    world.removeBody(b.body);
  }
  blocks.length = 0;

  for (let floor = 0; floor < FLOORS; floor++) {
    const baseY = floor * FLOOR_HEIGHT;

    // 4隅の柱
    const corners = [
      [HALF, HALF],
      [HALF, -HALF],
      [-HALF, HALF],
      [-HALF, -HALF],
    ];
    for (const [x, z] of corners) {
      addBlock(
        pillarGeo,
        stoneMat,
        new THREE.Vector3(1, 2, 1),
        new THREE.Vector3(x, baseY + 1, z),
        floor === 0 ? 0 : 6 // 最下段は固定（土台）
      );
    }

    // 床スラブ（最上階の上にも1枚載せて屋根にする）
    addBlock(
      slabGeo,
      slabMat,
      new THREE.Vector3(9, 0.6, 9),
      new THREE.Vector3(0, baseY + 2 + 0.3, 0),
      10
    );
  }
}

buildStructure();

// ------------------------------------------------------------
// 爆発演出用パーティクル
// ------------------------------------------------------------
interface ExplosionParticles {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
}

const activeExplosions: ExplosionParticles[] = [];

function spawnExplosionParticles(center: THREE.Vector3) {
  const count = 200;
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
    const speed = 4 + Math.random() * 6;
    velocities[i * 3] = dir.x * speed;
    velocities[i * 3 + 1] = dir.y * speed + 2;
    velocities[i * 3 + 2] = dir.z * speed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x9933ff,
    size: 0.35,
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
// 魔法使い（ローブ＋杖の汎用キャラクター。遠距離から破壊魔法を放つ）
// ※特定作品のキャラクターは模倣せず、汎用的な魔法使い像として実装
// ------------------------------------------------------------
const CASTER_POS = new THREE.Vector3(0, 1.3, -22);
const STAFF_LENGTH = 3;

const casterGroup = new THREE.Group();
casterGroup.position.copy(CASTER_POS);
scene.add(casterGroup);

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

// 着弾予測ライン（狙いの可視化）
const aimArrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1),
  CASTER_POS,
  10,
  0x9933ff
);
scene.add(aimArrow);

// ------------------------------------------------------------
// GUI（照準・威力・爆風の指定）
// ------------------------------------------------------------
const params = {
  angle: 35, // 仰角（度）
  yaw: 0, // 左右の向き（度）
  launchPower: 30, // 発射速度
  radius: 12, // 爆風半径
  blastPower: 60, // 爆風の威力
  fire: () => castSpell(),
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

function updateAim() {
  const yawRad = THREE.MathUtils.degToRad(params.yaw);
  const angleRad = THREE.MathUtils.degToRad(params.angle);
  staffPivot.rotation.y = yawRad;
  staffPivot.rotation.x = -angleRad;

  const dir = getAimDirection();
  aimArrow.setDirection(dir);
  aimArrow.setLength(6 + params.launchPower * 0.3, 0.8, 0.5);
}
updateAim();

const gui = new GUI({ title: '魔法コントロール' });
const aimFolder = gui.addFolder('照準');
aimFolder.add(params, 'angle', 10, 75, 1).name('仰角').onChange(updateAim);
aimFolder.add(params, 'yaw', -35, 35, 1).name('左右').onChange(updateAim);
aimFolder.add(params, 'launchPower', 15, 45, 1).name('威力（速度）').onChange(updateAim);

const blastFolder = gui.addFolder('着弾時の爆風');
blastFolder.add(params, 'radius', 2, 25, 0.5).name('範囲半径');
blastFolder.add(params, 'blastPower', 10, 150, 1).name('威力');

gui.add(params, 'fire').name('魔法を放つ！');
gui.add(params, 'reset').name('建造物をリセット');

// ------------------------------------------------------------
// 魔法弾（cannon-esの剛体として飛ばし、着弾で爆発させる）
// ------------------------------------------------------------
interface SpellOrb {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  exploded: boolean;
  life: number;
}

const spellOrbs: SpellOrb[] = [];
const orbGeo = new THREE.SphereGeometry(0.5, 16, 16);
const orbMat = new THREE.MeshStandardMaterial({
  color: 0x120018,
  emissive: 0x7a1fd6,
  emissiveIntensity: 1.5,
});

function castSpell() {
  const dir = getAimDirection();
  const muzzle = CASTER_POS.clone().add(new THREE.Vector3(0, 1.2, 0)).add(dir.clone().multiplyScalar(STAFF_LENGTH));

  const mesh = new THREE.Mesh(orbGeo, orbMat);
  mesh.position.copy(muzzle);
  mesh.castShadow = true;
  scene.add(mesh);

  const body = new CANNON.Body({ mass: 4, material: blockMaterial });
  body.addShape(new CANNON.Sphere(0.5));
  body.position.set(muzzle.x, muzzle.y, muzzle.z);
  body.velocity.set(
    dir.x * params.launchPower,
    dir.y * params.launchPower,
    dir.z * params.launchPower
  );
  world.addBody(body);

  const orb: SpellOrb = { mesh, body, exploded: false, life: 6 };
  spellOrbs.push(orb);

  body.addEventListener('collide', () => {
    if (orb.exploded) return;
    orb.exploded = true;
    detonateAt(
      new THREE.Vector3(body.position.x, body.position.y, body.position.z),
      params.radius,
      params.blastPower
    );
  });
}

function updateSpellOrbs(dt: number) {
  for (let i = spellOrbs.length - 1; i >= 0; i--) {
    const orb = spellOrbs[i];
    orb.life -= dt;
    orb.mesh.position.copy(orb.body.position as unknown as THREE.Vector3);
    orb.mesh.quaternion.copy(orb.body.quaternion as unknown as THREE.Quaternion);

    if (orb.exploded || orb.life <= 0) {
      scene.remove(orb.mesh);
      world.removeBody(orb.body);
      spellOrbs.splice(i, 1);
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

  spawnExplosionParticles(center);

  // カメラを着弾地点へ寄せる演出（Tween.js）
  const from = { t: 0 };
  const startTarget = controls.target.clone();
  new TWEEN.Tween(from)
    .to({ t: 1 }, 500)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onUpdate(() => {
      controls.target.lerpVectors(startTarget, center, from.t);
    })
    .yoyo(true)
    .repeat(1)
    .start();
}

// ------------------------------------------------------------
// メインループ
// ------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  world.step(1 / 60, dt, 3);

  for (const b of blocks) {
    b.mesh.position.copy(b.body.position as unknown as THREE.Vector3);
    b.mesh.quaternion.copy(b.body.quaternion as unknown as THREE.Quaternion);
  }

  updateSpellOrbs(dt);
  updateExplosionParticles(dt);
  TWEEN.update();
  controls.update();
  renderer.render(scene, camera);
}

animate();
