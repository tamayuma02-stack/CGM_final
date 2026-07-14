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
// 魔法ビーム（cannon-esの剛体として飛ばし、着弾で爆発させる）
// ------------------------------------------------------------
interface SpellBeam {
  group: THREE.Group;
  body: CANNON.Body;
  exploded: boolean;
  life: number;
}

const spellBeams: SpellBeam[] = [];
const beamCoreGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 10);
const beamGlowGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.4, 10);
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

function castSpell() {
  playCastChargeEffect();

  // 詠唱モーション分（魔法陣の展開）を待ってから発射する
  window.setTimeout(() => {
    const dir = getAimDirection();
    const muzzle = CASTER_POS.clone()
      .add(new THREE.Vector3(0, 1.2, 0))
      .add(dir.clone().multiplyScalar(STAFF_LENGTH));

    const group = createBeamMesh();
    group.position.copy(muzzle);
    group.quaternion.setFromUnitVectors(BEAM_UP_AXIS, dir);
    scene.add(group);

    const body = new CANNON.Body({ mass: 4, material: blockMaterial });
    body.addShape(new CANNON.Sphere(0.4));
    body.position.set(muzzle.x, muzzle.y, muzzle.z);
    body.velocity.set(
      dir.x * params.launchPower,
      dir.y * params.launchPower,
      dir.z * params.launchPower
    );
    world.addBody(body);

    const beam: SpellBeam = { group, body, exploded: false, life: 6 };
    spellBeams.push(beam);

    body.addEventListener('collide', () => {
      if (beam.exploded) return;
      beam.exploded = true;
      detonateAt(
        new THREE.Vector3(body.position.x, body.position.y, body.position.z),
        params.radius,
        params.blastPower
      );
    });
  }, 220);
}

function updateSpellBeams(dt: number) {
  for (let i = spellBeams.length - 1; i >= 0; i--) {
    const beam = spellBeams[i];
    beam.life -= dt;
    beam.group.position.copy(beam.body.position as unknown as THREE.Vector3);

    const velocity = beam.body.velocity;
    if (velocity.length() > 0.01) {
      const dir = new THREE.Vector3(velocity.x, velocity.y, velocity.z).normalize();
      beam.group.quaternion.setFromUnitVectors(BEAM_UP_AXIS, dir);
    }

    if (beam.exploded || beam.life <= 0) {
      scene.remove(beam.group);
      world.removeBody(beam.body);
      spellBeams.splice(i, 1);
    }
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

  spawnExplosionParticles(center, power);
  spawnImpactMagicCircle(center, radius, power);

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

  castCircleMesh.rotation.z += dt * 1.2;
  updateSpellBeams(dt);
  updateExplosionParticles(dt);
  updateMagicCircles(dt);
  updateImpactFlashes(dt);
  TWEEN.update();
  controls.update();
  renderer.render(scene, camera);
}

animate();
