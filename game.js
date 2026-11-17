/* 阳光城 SUNNY CITY — 低多边形开放世界（纯本地，无需联网） */
(function () {
'use strict';

// ---------- 常量与工具 ----------
const N = 8, CELL = 72, ROAD = 16, HALF = 8, SIZE = N * CELL, INSET = 3;
const SAVE_KEY = 'sunnycity_save_v1';
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => '$' + Math.floor(n).toLocaleString('en-US');

// ---------- 地点 ----------
const LOC = {
  start: { x: 72, z: 132 },
  garage: { x: 252, z: 72, block: [3, 0] },
  police: { x: 432, z: 180, block: [6, 2] },
  hospital: { x: 324, z: 288, block: [4, 4] },
  hideout: { x: 36, z: 504, block: [0, 7] },
};
const PARKS = ['2,5', '6,6', '1,2'];
const MISSIONS = [
  { name: '急件快递', giver: { x: 72, z: 108 }, reward: 600,
    desc: '取到神秘包裹，75 秒内送到东区客户手里。' },
  { name: '运钞车劫案', giver: { x: 252, z: 288 }, reward: 1500,
    desc: '抢走北区的运钞车，顶着警察追捕开回西南安全屋。' },
  { name: '环城狂飙', giver: { x: 432, z: 396 }, reward: 3000,
    desc: '开车按顺序冲过 8 个检查点，110 秒内完成。' },
];
const M1_PICK = { x: 180, z: 216 }, M1_DROP = { x: 468, z: 360 };
const M2_VAN = { x: 396, z: 72 };
const M3_CP = [[144, 72], [432, 72], [504, 216], [504, 432], [360, 504], [144, 504], [72, 360], [72, 180]].map(p => ({ x: p[0], z: p[1] }));
const UPGRADES = [
  { id: 'engine', name: '引擎强化', desc: '极速和加速提升' },
  { id: 'armor', name: '装甲车身', desc: '车辆耐撞 +50%/级' },
  { id: 'health', name: '健身房会员', desc: '生命上限 +30/级' },
  { id: 'stealth', name: '黑客电台', desc: '通缉消退更快' },
];
const UPG_COST = [400, 1000, 2000];

// ---------- 渲染器 ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0xa6dcff, 160, 460);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1500);
scene.add(new THREE.HemisphereLight(0xe4f6ff, 0xc2a77a, 0.78));
const sun = new THREE.DirectionalLight(0xfff0cf, 0.95);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 420 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ---------- 几何与材质 ----------
const matCache = {};
function mat(color, opts) {
  const k = color + '|' + (opts ? JSON.stringify(opts) : '');
  if (!matCache[k]) matCache[k] = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  return matCache[k];
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 10); wheelGeo.rotateZ(Math.PI / 2);
const headGeo = new THREE.IcosahedronGeometry(0.28, 0);
function box(w, h, d, material, x, y, z, parent, shadow) {
  const m = new THREE.Mesh(boxGeo, typeof material === 'number' ? mat(material) : material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
  (parent || scene).add(m); return m;
}

// 窗户贴图
const winCanvas = document.createElement('canvas'); winCanvas.width = 64; winCanvas.height = 64;
(function () {
  const g = winCanvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#8fb8d6'; g.fillRect(9, 12, 19, 30); g.fillRect(36, 12, 19, 30);
  g.fillStyle = '#c6dff0'; g.fillRect(9, 12, 19, 8); g.fillRect(36, 12, 19, 8);
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 52, 64, 12);
})();
const winTexBase = new THREE.CanvasTexture(winCanvas);
const winTexCache = {};
function buildingMat(color, rx, ry) {
  const k = color + '_' + rx + '_' + ry;
  if (!matCache[k]) {
    let t = winTexCache[rx + '_' + ry];
    if (!t) { t = winTexBase.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); winTexCache[rx + '_' + ry] = t; }
    matCache[k] = new THREE.MeshLambertMaterial({ color, map: t });
  }
  return matCache[k];
}

function textSprite(text, bg, fg, w) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = fg; g.font = 'bold 32px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false }));
  s.scale.set(w || 14, (w || 14) / 4, 1); return s;
}

// ---------- 城市 ----------
const PALETTE = [0xf4a261, 0xe9c46a, 0x2a9d8f, 0xe76f51, 0xf6bd60, 0x84a59d, 0xf28482, 0x90be6d, 0x8ecae6, 0xffffff, 0xcdb4db, 0xffafcc];
const blockKind = {};
function buildCity() {
  // 沙地 / 海 / 柏油
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat(0xe9d6a0));
  sand.rotation.x = -Math.PI / 2; sand.position.y = -0.05; sand.receiveShadow = true; scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 3000), mat(0x2fa4dc));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-660, 0.02, 300); scene.add(sea);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(6, 3000), mat(0xe9f8ff));
  foam.rotation.x = -Math.PI / 2; foam.position.set(-58, 0.03, 300); scene.add(foam);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(SIZE + ROAD + 4, SIZE + ROAD + 4), mat(0x51545b));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(SIZE / 2, 0, SIZE / 2); asphalt.receiveShadow = true; scene.add(asphalt);

  // 车道线（实例化）
  const dashGeo = new THREE.PlaneGeometry(0.35, 3); dashGeo.rotateX(-Math.PI / 2);
  const dashes = [];
  for (let k = 0; k <= N; k++) for (let b = 0; b < N; b++) for (let s = HALF + 4; s < CELL - HALF - 2; s += 7) {
    dashes.push([k * CELL, b * CELL + s, 0]); dashes.push([b * CELL + s, k * CELL, 1]);
  }
  const dm = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xf5e6a8 }), dashes.length);
  const o = new THREE.Object3D();
  dashes.forEach((d, i) => { o.position.set(d[0], 0.04, d[1]); o.rotation.set(0, d[2] ? Math.PI / 2 : 0, 0); o.updateMatrix(); dm.setMatrixAt(i, o.matrix); });
  scene.add(dm);

  // 斑马线
  const zGeo = new THREE.PlaneGeometry(1.1, 5); zGeo.rotateX(-Math.PI / 2);
  const zs = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let s = -6; s <= 6; s += 2) {
    zs.push([i * CELL + s, j * CELL - HALF - 3, 0], [i * CELL + s, j * CELL + HALF + 3, 0], [i * CELL - HALF - 3, j * CELL + s, 1], [i * CELL + HALF + 3, j * CELL + s, 1]);
  }
  const zm = new THREE.InstancedMesh(zGeo, new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), zs.length);
  zs.forEach((d, i) => { o.position.set(d[0], 0.035, d[1]); o.rotation.set(0, d[2] ? Math.PI / 2 : 0, 0); o.updateMatrix(); zm.setMatrixAt(i, o.matrix); });
  scene.add(zm);

  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
    const cx = bx * CELL + CELL / 2, cz = bz * CELL + CELL / 2, inner = CELL - ROAD;
    box(inner, 0.3, inner, 0xd3d0c6, cx, 0.15, cz, null, false).receiveShadow = true;
    const key = bx + ',' + bz;
    if (PARKS.includes(key)) {
      blockKind[key] = 'park';
      box(inner - 2 * INSET, 0.4, inner - 2 * INSET, 0x8cc56b, cx, 0.2, cz, null, false).receiveShadow = true;
      for (let t = 0; t < 14; t++) tree(cx + rand(-20, 20), cz + rand(-20, 20), rand(0.9, 1.5));
      box(10, 0.5, 6, 0x6fb7e0, cx + 5, 0.45, cz - 6, null, false); // 小水池
      continue;
    }
    let special = null;
    for (const k in LOC) if (LOC[k].block && LOC[k].block[0] === bx && LOC[k].block[1] === bz) special = k;
    if (special) { blockKind[key] = special; buildSpecial(special, cx, cz); continue; }
    blockKind[key] = 'city';
    const cf = 1 - dist(cx, cz, SIZE / 2, SIZE / 2) / (SIZE * 0.72);
    const mode = Math.random();
    const lots = mode < 0.25 ? [[0, 0, 44, 44]] : mode < 0.55 ? [[-12, 0, 21, 44], [12, 0, 21, 44]] : [[-12, -12, 21, 21], [12, -12, 21, 21], [-12, 12, 21, 21], [12, 12, 21, 21]];
    lots.forEach(l => {
      const h = Math.round(rand(6, 12 + 46 * cf * cf + (lots.length === 1 ? 10 : 0)));
      const w = l[2] - rand(0, 4), d = l[3] - rand(0, 4);
      const col = pick(PALETTE);
      const b = box(w, h, d, buildingMat(col, Math.max(1, Math.round(w / 5)), Math.max(1, Math.round(h / 4))), cx + l[0], 0.3 + h / 2, cz + l[1]);
      const roof = new THREE.Color(col).multiplyScalar(0.72).getHex();
      box(w + 0.6, 0.8, d + 0.6, roof, cx + l[0], 0.3 + h + 0.4, cz + l[1]);
      if (Math.random() < 0.35) box(rand(2, 4), rand(1.5, 3), rand(2, 4), 0x9aa0a6, cx + l[0] + rand(-4, 4), 0.3 + h + 1.5, cz + l[1] + rand(-4, 4));
      b.userData.h = h;
    });
    // 人行道上的树
    for (let t = 0; t < 4; t++) {
      const side = randi(0, 3), a = rand(-24, 24), e = inner / 2 - 1.2;
      const p = [[a, -e], [e, a], [a, e], [-e, a]][side];
      palm(cx + p[0], cz + p[1], rand(0.8, 1.1));
    }
  }
  // 海滩棕榈
  for (let z = -40; z < SIZE + 60; z += 22) palm(rand(-50, -20), z + rand(-6, 6), rand(1, 1.4));
  // 城市外围矮墙
  box(SIZE + ROAD + 4, 1, 1, 0xbfb59a, SIZE / 2, 0.5, -HALF - 2);
  box(SIZE + ROAD + 4, 1, 1, 0xbfb59a, SIZE / 2, 0.5, SIZE + HALF + 2);
  box(1, 1, SIZE + ROAD + 4, 0xbfb59a, SIZE + HALF + 2, 0.5, SIZE / 2);
  box(1, 1, SIZE + ROAD + 4, 0xbfb59a, -HALF - 2, 0.5, SIZE / 2);
}

function buildSpecial(kind, cx, cz) {
  const C = {
    garage: { col: 0x3d5a80, label: '改装店 GARAGE', bg: '#1d3557', fg: '#ffd23f', h: 10 },
    police: { col: 0x264653, label: '警察局 POLICE', bg: '#0b3d91', fg: '#ffffff', h: 16 },
    hospital: { col: 0xf1f1f1, label: '医院 HOSPITAL', bg: '#ffffff', fg: '#d62828', h: 22 },
    hideout: { col: 0x6d597a, label: '安全屋 SAFEHOUSE', bg: '#2b2d42', fg: '#7ee36b', h: 8 },
  }[kind];
  const L = LOC[kind];
  box(42, C.h, 42, buildingMat(C.col, 8, Math.round(C.h / 4)), cx, 0.3 + C.h / 2, cz);
  box(42.6, 0.8, 42.6, new THREE.Color(C.col).multiplyScalar(0.7).getHex(), cx, C.h + 0.7, cz);
  const s = textSprite(C.label, C.bg, C.fg, 18);
  s.position.set(cx + (L.x - cx) * 0.55, C.h + 5, cz + (L.z - cz) * 0.55); scene.add(s);
  if (kind === 'hospital') { box(2, 7, 7, 0xd62828, cx, C.h + 4, cz, null); box(2, 2, 7, 0xd62828, cx, C.h + 4, cz).scale.set(7, 2, 2); }
  if (kind === 'garage') { // 卷帘门
    const nz = Math.sign(L.z - cz), nx = Math.sign(L.x - cx);
    box(nz ? 14 : 0.4, 7, nz ? 0.4 : 14, 0xadb5bd, cx + nx * 21.2, 3.8, cz + nz * 21.2);
  }
}

const trunkMat = mat(0x8d6e4a), leafMat = mat(0x4caf50), palmLeaf = mat(0x3fa34d);
const coneGeo = new THREE.ConeGeometry(2.4, 5, 6), trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.5, 6);
const palmTrunk = new THREE.CylinderGeometry(0.2, 0.35, 7, 6), palmLeafGeo = new THREE.ConeGeometry(0.9, 4.5, 4);
function tree(x, z, s) {
  const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.set(x, 1.5 * s, z); t.scale.setScalar(s); t.castShadow = true; scene.add(t);
  const l = new THREE.Mesh(coneGeo, leafMat); l.position.set(x, 4.8 * s, z); l.scale.setScalar(s); l.castShadow = true; scene.add(l);
}
function palm(x, z, s) {
  const g = new THREE.Group(); g.position.set(x, 0.3, z); g.scale.setScalar(s);
  const t = new THREE.Mesh(palmTrunk, trunkMat); t.position.y = 3.5; t.rotation.z = 0.08; t.castShadow = true; g.add(t);
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(palmLeafGeo, palmLeaf); const a = i / 6 * Math.PI * 2;
    l.position.set(Math.cos(a) * 1.7, 6.8, Math.sin(a) * 1.7); l.rotation.set(Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9);
    l.scale.set(1, 1, 0.25); l.castShadow = true; g.add(l);
  }
  scene.add(g);
}

// ---------- 碰撞 ----------
function solidRect(bx, bz) {
  return [bx * CELL + HALF + INSET, (bx + 1) * CELL - HALF - INSET, bz * CELL + HALF + INSET, (bz + 1) * CELL - HALF - INSET];
}
function collideBlocks(o, r) {
  let hit = null;
  const bx0 = Math.floor(o.x / CELL), bz0 = Math.floor(o.z / CELL);
  for (let bx = bx0 - 1; bx <= bx0 + 1; bx++) for (let bz = bz0 - 1; bz <= bz0 + 1; bz++) {
    if (bx < 0 || bz < 0 || bx >= N || bz >= N) continue;
    const [x0, x1, z0, z1] = solidRect(bx, bz);
    const cx = clamp(o.x, x0, x1), cz = clamp(o.z, z0, z1);
    const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      let nx, nz, pen;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
      else {
        const l = o.x - x0, rr = x1 - o.x, t = o.z - z0, b = z1 - o.z, m = Math.min(l, rr, t, b);
        if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
        else if (m === t) { nx = 0; nz = -1; pen = t + r; } else { nx = 0; nz = 1; pen = b + r; }
      }
      o.x += nx * pen; o.z += nz * pen; hit = { nx, nz };
    }
  }
  const lo = -HALF + 1 + r * 0.5, hi = SIZE + HALF - 1 - r * 0.5;
  if (o.x < lo) { o.x = lo; hit = { nx: 1, nz: 0 }; } if (o.x > hi) { o.x = hi; hit = { nx: -1, nz: 0 }; }
  if (o.z < lo) { o.z = lo; hit = { nx: 0, nz: 1 }; } if (o.z > hi) { o.z = hi; hit = { nx: 0, nz: -1 }; }
  return hit;
}

// ---------- 车辆 ----------
const CAR_COLORS = [0xe63946, 0x1d3557, 0xf4a261, 0x2a9d8f, 0xffffff, 0x6a4c93, 0xffb703, 0x8ac926, 0x222222, 0xff70a6, 0x4cc9f0];
const cars = [];
const glassMat = mat(0x2b3a4a), wheelMat = mat(0x1b1b1b), charMat = mat(0x2a2a2a);
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2 }), tailMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
function makeCarMesh(type, color) {
  const g = new THREE.Group();
  const isVan = type === 'van', isPol = type === 'police';
  const w = isVan ? 2.5 : 2.1, h = isVan ? 1.9 : 0.85, l = isVan ? 5.4 : 4.3;
  const body = box(w, h, l, isPol ? 0xffffff : color, 0, 0.45 + h / 2, 0, g);
  const cabin = isVan ? box(w * 0.92, 0.9, 1.4, glassMat, 0, 0.45 + h - 0.35, l / 2 - 0.85, g) : box(w * 0.84, 0.72, l * 0.48, glassMat, 0, 0.45 + h + 0.36, -0.25, g);
  if (!isVan) box(w * 0.78, 0.1, l * 0.44, isPol ? 0xffffff : color, 0, 0.45 + h + 0.76, -0.25, g);
  if (isPol) { box(w + 0.02, 0.32, l * 0.5, 0x111111, 0, 0.75, 0, g); }
  if (isVan) { box(w + 0.02, 0.4, l * 0.6, 0x2d6a4f, 0, 1.6, -0.6, g); }
  let lights = null;
  if (isPol) {
    const r = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 })); r.scale.set(0.7, 0.25, 0.4); r.position.set(-0.45, 0.45 + h + 0.92, -0.2); g.add(r);
    const b = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2255ff })); b.scale.set(0.7, 0.25, 0.4); b.position.set(0.45, 0.45 + h + 0.92, -0.2); g.add(b);
    lights = [r, b];
  }
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(p => {
    const wh = new THREE.Mesh(wheelGeo, wheelMat); wh.position.set(p[0] * (w / 2 - 0.05), 0.42, p[1] * l * 0.31); wh.castShadow = true; g.add(wh);
  });
  [-1, 1].forEach(s => {
    const hl = new THREE.Mesh(boxGeo, lightMat); hl.scale.set(0.45, 0.22, 0.1); hl.position.set(s * (w / 2 - 0.4), 0.45 + h * 0.6, l / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(boxGeo, tailMat); tl.scale.set(0.45, 0.2, 0.1); tl.position.set(s * (w / 2 - 0.4), 0.45 + h * 0.6, -l / 2 - 0.02); g.add(tl);
  });
  scene.add(g);
  return { g, body, lights };
}
function createCar(type, x, z, h, color) {
  const m = makeCarMesh(type, color || pick(CAR_COLORS));
  const maxHealth = type === 'van' ? 320 : type === 'police' ? 160 : 100;
  const car = { type, mesh: m.g, body: m.body, lights: m.lights, x, z, h, speed: 0, health: maxHealth, maxHealth,
    driver: null, ai: null, radius: type === 'van' ? 2.3 : 1.9, dead: false, deadT: 0, stuck: 0, rev: 0, cruise: rand(9, 13) };
  cars.push(car); syncCar(car); return car;
}
function syncCar(c) { c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h; }
function removeCar(c) { scene.remove(c.mesh); const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); }

// 路网
function nodePos(i, j) { return { x: i * CELL, z: j * CELL }; }
function neighbors(i, j) { return [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(n => n[0] >= 0 && n[1] >= 0 && n[0] <= N && n[1] <= N); }
function laneTarget(ai, offset) {
  const dx = Math.sign(ai.ti - ai.fi), dz = Math.sign(ai.tj - ai.fj);
  return { x: ai.ti * CELL + (-dz) * offset, z: ai.tj * CELL + dx * offset };
}
function randomSegment() {
  const horiz = Math.random() < 0.5, a = randi(0, N), b = randi(0, N - 1), flip = Math.random() < 0.5;
  if (horiz) return flip ? { fi: b, fj: a, ti: b + 1, tj: a } : { fi: b + 1, fj: a, ti: b, tj: a };
  return flip ? { fi: a, fj: b, ti: a, tj: b + 1 } : { fi: a, fj: b + 1, ti: a, tj: b };
}
function spawnTraffic(farFrom) {
  for (let tries = 0; tries < 20; tries++) {
    const ai = randomSegment();
    const t = rand(0.25, 0.75), dx = ai.ti - ai.fi, dz = ai.tj - ai.fj;
    const x = (ai.fi + dx * t) * CELL + (-dz) * 4, z = (ai.fj + dz * t) * CELL + dx * 4;
    if (farFrom && dist(x, z, farFrom.x, farFrom.z) < 90) continue;
    if (cars.some(c => dist(c.x, c.z, x, z) < 8)) continue;
    const c = createCar('car', x, z, Math.atan2(dx, dz));
    c.driver = 'ai'; c.ai = ai; c.speed = c.cruise; return c;
  }
}
function spawnParked() {
  for (let tries = 0; tries < 20; tries++) {
    const ai = randomSegment(), t = rand(0.3, 0.7), dx = ai.ti - ai.fi, dz = ai.tj - ai.fj;
    const x = (ai.fi + dx * t) * CELL + (-dz) * 6.3, z = (ai.fj + dz * t) * CELL + dx * 6.3;
    if (cars.some(c => dist(c.x, c.z, x, z) < 8)) continue;
    return createCar('car', x, z, Math.atan2(dx, dz));
  }
}

// ---------- 行人 ----------
const peds = [];
const skinMats = [mat(0xf1c27d), mat(0xe0ac69), mat(0x8d5524), mat(0xffdbac)];
const shirtCols = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0xffffff, 0x9b5de5, 0xf15bb5, 0xfee440, 0x00bbf9];
function makeHuman(shirt, pants) {
  const g = new THREE.Group();
  const legL = box(0.28, 0.85, 0.3, pants, -0.17, 0.43, 0, g), legR = box(0.28, 0.85, 0.3, pants, 0.17, 0.43, 0, g);
  legL.geometry = boxGeo; [legL, legR].forEach(l => { l.position.y = 0.43; });
  box(0.75, 0.85, 0.42, shirt, 0, 1.28, 0, g);
  const head = new THREE.Mesh(headGeo, pick(skinMats)); head.position.y = 1.95; head.castShadow = true; g.add(head);
  scene.add(g);
  return { g, legL, legR };
}
function pedLoop(bx, bz) { const off = HALF + 1.5; return { x0: bx * CELL + off, x1: (bx + 1) * CELL - off, z0: bz * CELL + off, z1: (bz + 1) * CELL - off }; }
function pedPos(p) {
  const r = pedLoop(p.bx, p.bz), L = r.x1 - r.x0, P = 4 * L;
  let s = ((p.s % P) + P) % P; const seg = Math.floor(s / L), t = s - seg * L;
  const pts = [[r.x0 + t, r.z0, 1, 0], [r.x1, r.z0 + t, 0, 1], [r.x1 - t, r.z1, -1, 0], [r.x0, r.z1 - t, 0, -1]][seg];
  return { x: pts[0], z: pts[1], h: Math.atan2(pts[2] * p.dir, pts[3] * p.dir) };
}
function spawnPed(farFrom) {
  const m = makeHuman(pick(shirtCols), pick([0x264653, 0x3d405b, 0x6c584c, 0x1d3557]));
  const p = { mesh: m.g, legL: m.legL, legR: m.legR, bx: randi(0, N - 1), bz: randi(0, N - 1), s: rand(0, 200), dir: Math.random() < 0.5 ? 1 : -1,
    speed: rand(1.2, 1.8), dead: false, deadT: 0, panic: 0, phase: rand(0, 6), free: false, x: 0, z: 0, h: 0 };
  if (farFrom) for (let i = 0; i < 10; i++) { const q = pedPos(p); if (dist(q.x, q.z, farFrom.x, farFrom.z) > 80) break; p.bx = randi(0, N - 1); p.bz = randi(0, N - 1); }
  Object.assign(p, pedPos(p)); peds.push(p); return p;
}
function resetPed(p) {
  p.dead = false; p.free = false; p.panic = 0; p.mesh.rotation.set(0, 0, 0); p.mesh.position.y = 0;
  for (let i = 0; i < 10; i++) { p.bx = randi(0, N - 1); p.bz = randi(0, N - 1); const q = pedPos(p); if (dist(q.x, q.z, player.x, player.z) > 90) break; }
  Object.assign(p, pedPos(p));
}

// ---------- 玩家 ----------
const pm = makeHuman(0xff8c00, 0x1d3557);
const player = { mesh: pm.g, legL: pm.legL, legR: pm.legR, x: LOC.start.x, z: LOC.start.z, h: 0, hp: 100, inCar: null, phase: 0, hitCd: 0 };
box(0.8, 0.22, 0.5, 0x111111, 0, 2.18, 0, pm.g); // 帽子

// ---------- 游戏状态 ----------
const game = {
  state: 'menu', money: 200, stars: 0, evade: 0, bustT: 0, missionIdx: 0, mission: null,
  upg: { engine: 0, armor: 0, health: 0, stealth: 0 }, camH: 0, menuA: 0, overlayT: 0, overlayCb: null,
  wantedCd: 0, saveT: 0, giverArmed: true, policeSpawnT: 0, snapCam: true, playTime: 0,
};
const maxHP = () => 100 + 30 * game.upg.health;

// ---------- 特效 / 拾取物 ----------
const effects = [];
function explosion(x, z) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.9 }));
  m.position.set(x, 1.5, z); scene.add(m); effects.push({ m, t: 0, life: 0.9 });
}
const pickups = [];
const cashGeo = new THREE.BoxGeometry(1.1, 0.6, 0.6), cashMat = new THREE.MeshLambertMaterial({ color: 0x4caf50, emissive: 0x1b5e20 });
function spawnCash(x, z, amount, temp) {
  const m = new THREE.Mesh(cashGeo, cashMat); m.position.set(x, 1, z); m.castShadow = true; scene.add(m);
  pickups.push({ x, z, amount, m, active: true, t: 0, temp });
}
function randomSidewalk() {
  const p = { bx: randi(0, N - 1), bz: randi(0, N - 1), s: rand(0, 212), dir: 1 }; return pedPos(p);
}

// 任务光柱
const beacon = new THREE.Group();
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.33, depthWrite: false, side: THREE.DoubleSide });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 60, 20, 1, true), beamMat); beam.position.y = 30; beacon.add(beam);
const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; beacon.add(ring);
const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f })); gem.position.y = 4.5; beacon.add(gem);
scene.add(beacon);
function setBeacon(pos, color, small) {
  if (!pos) { beacon.visible = false; return; }
  beacon.visible = true; beacon.position.set(pos.x, 0, pos.z);
  beamMat.color.setHex(color); ring.material.color.setHex(color); gem.material.color.setHex(color);
  beam.scale.set(small ? 0.7 : 1, 1, small ? 0.7 : 1); gem.position.y = small ? 4.5 : 4.5;
}

// ---------- UI ----------
function toast(msg, ms) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('toasts').appendChild(d);
  setTimeout(() => d.remove(), ms || 2600);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
let bannerTimer = null;
function banner(title, sub, color) {
  $('bannerTitle').textContent = title; $('bannerSub').textContent = sub || '';
  $('bannerTitle').style.color = color || '#ffd23f';
  $('banner').classList.remove('hidden'); clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('banner').classList.add('hidden'), 3200);
}
function setHint(t) { const h = $('hint'); if (t) { h.textContent = t; h.classList.add('show'); } else h.classList.remove('show'); }
const starEls = $('stars').children;
const mmCtx = $('minimap').getContext('2d');

function updateHUD() {
  $('money').textContent = fmt(game.money);
  for (let i = 0; i < 5; i++) starEls[i].classList.toggle('on', i < game.stars);
  $('stars').classList.toggle('flash', game.stars > 0 && game.evade > 2);
  $('hpbar').style.width = clamp(player.hp / maxHP() * 100, 0, 100) + '%';
  const c = player.inCar;
  $('speedo').classList.toggle('hidden', !c);
  if (c) { $('speedVal').textContent = Math.round(Math.abs(c.speed) * 3.6); $('carhp').style.width = clamp(c.health / c.maxHealth * 100, 0, 100) + '%'; }
  const m = game.mission;
  $('objective').classList.toggle('hidden', !m);
  if (m) {
    $('objTitle').textContent = '主线任务 ' + (m.i + 1) + '/3 · ' + MISSIONS[m.i].name;
    $('objText').textContent = m.text;
    if (m.timer != null) { $('objTimer').textContent = Math.max(0, Math.ceil(m.timer)) + ' 秒'; $('objTimer').classList.toggle('warn', m.timer < 15); }
    else $('objTimer').textContent = '';
  }
  drawMinimap();
}

function drawMinimap() {
  const g = mmCtx, R = 100, S = 0.62;
  const px = player.inCar ? player.inCar.x : player.x, pz = player.inCar ? player.inCar.z : player.z;
  const h = player.inCar ? player.inCar.h : player.h, ch = Math.cos(h), sh = Math.sin(h);
  const P = (x, z) => { const vx = x - px, vz = z - pz; return [R + (-vx * ch + vz * sh) * S, R - (vx * sh + vz * ch) * S]; };
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); };
  g.save(); g.clearRect(0, 0, 200, 200);
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#d8c48c'; g.fillRect(0, 0, 200, 200);
  poly([[-3000, -3000], [-58, -3000], [-58, 3000], [-3000, 3000]], '#3a9fd6');
  const e = HALF + 2; poly([[-e, -e], [SIZE + e, -e], [SIZE + e, SIZE + e], [-e, SIZE + e]], '#4b4f57');
  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
    const x0 = bx * CELL + HALF, x1 = x0 + CELL - ROAD, z0 = bz * CELL + HALF, z1 = z0 + CELL - ROAD;
    if (dist((x0 + x1) / 2, (z0 + z1) / 2, px, pz) > 260) continue;
    const k = blockKind[bx + ',' + bz];
    poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], k === 'park' ? '#7dbb5a' : k === 'city' ? '#b9b2a0' : '#8a9bb5');
  }
  const icon = (x, z, col, label, r, clampEdge) => {
    let [sx, sy] = P(x, z); const dx = sx - R, dy = sy - R, d = Math.hypot(dx, dy);
    if (d > R - 10) { if (!clampEdge) return; sx = R + dx / d * (R - 10); sy = R + dy / d * (R - 10); }
    g.fillStyle = col; g.beginPath(); g.arc(sx, sy, r || 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
    if (label) { g.fillStyle = '#000'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, sx, sy + 0.5); }
  };
  icon(LOC.garage.x, LOC.garage.z, '#4cc9f0', 'G', 7, true);
  icon(LOC.hideout.x, LOC.hideout.z, '#7ee36b', 'H', 6, false);
  icon(LOC.hospital.x, LOC.hospital.z, '#ffffff', '+', 6, false);
  icon(LOC.police.x, LOC.police.z, '#5aa9ff', 'P', 6, false);
  if (!game.mission && game.missionIdx < 3) icon(MISSIONS[game.missionIdx].giver.x, MISSIONS[game.missionIdx].giver.z, '#ffd23f', 'M', 8, true);
  if (game.mission && game.mission.target) icon(game.mission.target.x, game.mission.target.z, '#ffd23f', '★', 8, true);
  const flash = Math.floor(performance.now() / 250) % 2;
  cars.forEach(c => { if (c.type === 'police' && !c.dead) icon(c.x, c.z, flash ? '#ff3333' : '#3366ff', '', 4, false); });
  g.restore();
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(R, R - 9); g.lineTo(R + 7, R + 7); g.lineTo(R, R + 3); g.lineTo(R - 7, R + 7); g.closePath(); g.fill(); g.stroke();
  // 北向标记
  const [nx, ny] = P(px, pz - 1000); const nd = Math.hypot(nx - R, ny - R);
  g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', R + (nx - R) / nd * 88, R + (ny - R) / nd * 88);
}

// ---------- 通缉 ----------
function addStars(n, why) {
  const ns = clamp(game.stars + n, 0, 5);
  if (ns > game.stars) { game.stars = ns; game.evade = 0; if (why) toast('🚨 ' + why + '，通缉 ' + '★'.repeat(ns)); }
}
function spawnPolice() {
  const P = playerPos();
  for (let t = 0; t < 40; t++) {
    const i = randi(0, N), j = randi(0, N), np = nodePos(i, j), d = dist(np.x, np.z, P.x, P.z);
    if (d < 85 || d > 190) continue;
    if (cars.some(c => dist(c.x, c.z, np.x, np.z) < 7)) continue;
    const nb = neighbors(i, j).sort((a, b) => dist(a[0] * CELL, a[1] * CELL, P.x, P.z) - dist(b[0] * CELL, b[1] * CELL, P.x, P.z))[0];
    const c = createCar('police', np.x, np.z, Math.atan2(nb[0] - i, nb[1] - j));
    c.driver = 'police'; c.ai = { fi: i, fj: j, ti: nb[0], tj: nb[1] }; c.speed = 14; return c;
  }
}
function playerPos() { return player.inCar ? { x: player.inCar.x, z: player.inCar.z } : { x: player.x, z: player.z }; }

function updateWanted(dt) {
  game.wantedCd = Math.max(0, game.wantedCd - dt);
  const P = playerPos();
  const police = cars.filter(c => c.type === 'police' && !c.dead && c.driver === 'police');
  if (game.stars > 0) {
    const want = [0, 1, 2, 3, 5, 6][game.stars];
    game.policeSpawnT -= dt;
    if (police.length < want && game.policeSpawnT <= 0) { spawnPolice(); game.policeSpawnT = 2.5; }
    let near = Infinity; police.forEach(c => { near = Math.min(near, dist(c.x, c.z, P.x, P.z)); });
    if (near < 55) game.evade = 0; else game.evade += dt;
    const need = 7 + game.stars * 1.5 - game.upg.stealth * 1.8;
    if (game.evade > need) { game.stars--; game.evade = 0; toast(game.stars ? '通缉等级下降' : '✅ 甩掉警察了'); }
    // 逮捕判定
    const slow = player.inCar ? Math.abs(player.inCar.speed) < 2.5 : true;
    if (near < 7 && slow) game.bustT += dt; else game.bustT = Math.max(0, game.bustT - dt * 0.5);
    if (game.bustT > (player.inCar ? 2.6 : 1.6)) busted();
  } else {
    game.bustT = 0;
    police.forEach(c => { if (dist(c.x, c.z, P.x, P.z) > 150) removeCar(c); });
  }
}

// ---------- AI 驾驶 ----------
function steerTo(c, tx, tz, dt, rate) {
  const want = Math.atan2(tx - c.x, tz - c.z), diff = wrapA(want - c.h);
  c.h += clamp(diff, -rate * dt, rate * dt);
  return diff;
}
function updateTraffic(c, dt) {
  const tgt = laneTarget(c.ai, 4);
  if (dist(c.x, c.z, tgt.x, tgt.z) < 6) {
    const opts = neighbors(c.ai.ti, c.ai.tj).filter(n => !(n[0] === c.ai.fi && n[1] === c.ai.fj));
    const n = pick(opts.length ? opts : neighbors(c.ai.ti, c.ai.tj));
    c.ai = { fi: c.ai.ti, fj: c.ai.tj, ti: n[0], tj: n[1] };
  }
  const t2 = laneTarget(c.ai, 4);
  const diff = steerTo(c, t2.x, t2.z, dt, 2.2);
  // 前方障碍
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  let blocked = false;
  const check = (x, z) => { const vx = x - c.x, vz = z - c.z, ahead = vx * fx + vz * fz, lat = Math.abs(vx * fz - vz * fx); if (ahead > 0 && ahead < 9 && lat < 2.6) blocked = true; };
  for (const o of cars) if (o !== c && !blocked) check(o.x, o.z);
  if (!player.inCar) check(player.x, player.z);
  const target = blocked ? 0 : (Math.abs(diff) > 0.5 ? 6 : c.cruise);
  c.speed += clamp(target - c.speed, -18 * dt, 6 * dt);
  if (!blocked && c.speed < 1) { c.stuck += dt; if (c.stuck > 4) { c.rev = 1.2; c.stuck = 0; } } else c.stuck = 0;
  if (c.rev > 0) { c.rev -= dt; c.speed = -5; c.h += dt * 1.2; }
}
function updatePoliceAI(c, dt) {
  const P = playerPos();
  if (c.lights) { const f = Math.floor(performance.now() / 180) % 2; c.lights[0].visible = !!f; c.lights[1].visible = !f; }
  if (game.stars === 0) { // 收队巡逻
    updateTraffic(c, dt); return;
  }
  const d = dist(c.x, c.z, P.x, P.z);
  let tx, tz, maxS = Math.min(22 + game.stars * 2.2, 33);
  if (d < 45) {
    tx = P.x; tz = P.z;
    if (player.inCar) { tx += Math.sin(player.inCar.h) * player.inCar.speed * 0.35; tz += Math.cos(player.inCar.h) * player.inCar.speed * 0.35; }
    else if (d < 8) maxS = 0;
    c.ai.direct = true;
  } else {
    if (c.ai.direct) { c.ai = { fi: -9, fj: -9, ti: Math.round(c.x / CELL), tj: Math.round(c.z / CELL) }; }
    const np = nodePos(c.ai.ti, c.ai.tj);
    if (dist(c.x, c.z, np.x, np.z) < 7) {
      const opts = neighbors(c.ai.ti, c.ai.tj).sort((a, b) => dist(a[0] * CELL, a[1] * CELL, P.x, P.z) - dist(b[0] * CELL, b[1] * CELL, P.x, P.z));
      const n = opts[0][0] === c.ai.fi && opts[0][1] === c.ai.fj && opts[1] ? opts[1] : opts[0];
      c.ai = { fi: c.ai.ti, fj: c.ai.tj, ti: n[0], tj: n[1] };
    }
    const q = nodePos(c.ai.ti, c.ai.tj); tx = q.x; tz = q.z;
  }
  const diff = steerTo(c, tx, tz, dt, 2.6);
  const target = Math.abs(diff) > 1.1 ? Math.min(maxS, 10) : maxS;
  if (c.rev > 0) { c.rev -= dt; c.speed = -9; c.h -= dt * 1.5; }
  else {
    c.speed += clamp(target - c.speed, -25 * dt, 12 * dt);
    if (Math.abs(c.speed) < 2 && maxS > 0) { c.stuck += dt; if (c.stuck > 1.3) { c.rev = 0.9; c.stuck = 0; } } else c.stuck = 0;
  }
}

// ---------- 车辆物理 ----------
const K = {};
const key = (...codes) => codes.some(k => K[k]);
function updatePlayerCar(c, dt) {
  const thr = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
  const steer = (key('KeyA', 'ArrowLeft') ? 1 : 0) - (key('KeyD', 'ArrowRight') ? 1 : 0);
  const hb = key('Space');
  const vanPen = c.type === 'van' ? 0.82 : 1;
  const maxS = (28 + 5 * game.upg.engine) * vanPen, acc = (14 + 3.5 * game.upg.engine) * vanPen;
  if (thr > 0) c.speed += (c.speed < 0 ? acc * 2.5 : acc * (1 - c.speed / maxS * 0.5)) * dt;
  else if (thr < 0) c.speed -= (c.speed > 0 ? acc * 2.5 : acc * 0.7) * dt;
  else { c.speed -= c.speed * 0.65 * dt; if (Math.abs(c.speed) < 0.3) c.speed = 0; }
  if (hb) c.speed -= c.speed * 2.0 * dt;
  c.speed = clamp(c.speed, -maxS * 0.4, maxS);
  const sf = clamp(c.speed / 6, -1, 1);
  c.h += steer * (hb ? 2.7 : 1.9) * sf * dt * (1 - Math.min(Math.abs(c.speed) / (maxS * 2.4), 0.35));
}
function damageCar(c, amt) {
  if (c.dead) return;
  if (c === player.inCar) amt /= (1 + 0.5 * game.upg.armor);
  c.health -= amt;
  if (c.health <= 0) destroyCar(c);
}
function destroyCar(c) {
  c.dead = true; c.health = 0; c.deadT = 0; c.speed *= 0.3;
  c.body.material = charMat; explosion(c.x, c.z);
  if (c.lights) c.lights.forEach(l => (l.visible = false));
  if (player.inCar === c) { exitCar(true); hurtPlayer(35, '车辆爆炸'); }
  else if (dist(c.x, c.z, player.x, player.z) < 6 && !player.inCar) hurtPlayer(25);
  if (c.type === 'police' && game.stars > 0) addStars(1, '炸毁警车');
}
function moveCars(dt) {
  for (const c of cars) {
    if (c.dead) { c.speed *= 1 - 2 * dt; c.deadT += dt; }
    c.x += Math.sin(c.h) * c.speed * dt; c.z += Math.cos(c.h) * c.speed * dt;
    const hit = collideBlocks(c, c.radius);
    if (hit) {
      const along = Math.sin(c.h) * hit.nx + Math.cos(c.h) * hit.nz, imp = -c.speed * along;
      if (imp > 0) {
        c.speed *= 1 - 0.75 * Math.abs(along);
        if (c === player.inCar && imp > 7) { damageCar(c, (imp - 6) * 1.6); shake = Math.min(1, imp / 25); }
        else if (c.driver === 'police' && imp > 12) damageCar(c, (imp - 12) * 0.6);
      }
    }
  }
  // 车与车
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j], rr = a.radius + b.radius - 0.6;
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 > rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
    const wa = a.driver === null && !a.dead ? 0.7 : 0.5;
    a.x -= nx * pen * wa; a.z -= nz * pen * wa; b.x += nx * pen * (1 - wa); b.z += nz * pen * (1 - wa);
    const va = a.speed * (Math.sin(a.h) * nx + Math.cos(a.h) * nz), vb = b.speed * (Math.sin(b.h) * nx + Math.cos(b.h) * nz);
    const rel = va - vb;
    if (rel > 0) {
      const pc = player.inCar;
      if ((a === pc || b === pc) && rel > 5) {
        const other = a === pc ? b : a;
        damageCar(pc, rel * (other.type === 'police' ? 1.0 : 0.7));
        damageCar(other, rel * 1.4);
        shake = Math.min(1, rel / 20);
        if (other.type === 'police' && other.driver === 'police' && rel > 9 && game.wantedCd <= 0 && Math.abs(pc.speed) > 8) { addStars(1, '撞击警车'); game.wantedCd = 4; }
      }
      a.speed *= 0.6; b.speed *= 0.6;
    }
  }
  for (const c of cars) syncCar(c);
}

// ---------- 上下车 ----------
function nearestCar(r) {
  let best = null, bd = r;
  for (const c of cars) { if (c.dead) continue; const d = dist(c.x, c.z, player.x, player.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function enterCar(c) {
  if (c.driver === 'ai' || c.driver === 'police') {
    const wasPolice = c.driver === 'police';
    const p = peds.find(q => q.dead === false && q.free === false && dist(q.x, q.z, player.x, player.z) > 120) || peds[0];
    if (p) { p.free = true; p.panic = 6; p.x = c.x + Math.cos(c.h) * 2.4; p.z = c.z - Math.sin(c.h) * 2.4; p.h = c.h + Math.PI / 2; p.dead = false; p.mesh.rotation.set(0, 0, 0); }
    if (wasPolice) addStars(2, '抢劫警车');
    else if (Math.random() < 0.5 && game.stars === 0) addStars(1, '偷车被人看见');
    toast(wasPolice ? '抢到一辆警车！' : '把司机拽了下来');
  }
  c.driver = 'player'; c.ai = null; player.inCar = c; player.mesh.visible = false;
  const ratio = c.health / c.maxHealth;
  if (c.type === 'car') { c.maxHealth = 100 * (1 + 0.5 * game.upg.armor); c.health = ratio * c.maxHealth; }
}
function exitCar(forced) {
  const c = player.inCar; if (!c) return;
  player.inCar = null; c.driver = null; if (c.type === 'police' && c.lights) c.lights.forEach(l => (l.visible = false));
  player.x = c.x + Math.cos(c.h) * 2.6; player.z = c.z - Math.sin(c.h) * 2.6; player.h = c.h;
  collideBlocks(player, 0.5);
  player.mesh.visible = true;
  if (!forced) c.speed *= 0.3;
}

function hurtPlayer(n, why) {
  player.hp -= n; shake = 0.6;
  if (player.hp <= 0) { player.hp = 0; wasted(); }
  else if (why) toast(why + ' -' + n);
}

// ---------- 被捕 / 死亡 ----------
function overlay(cls, text, cb) {
  game.state = 'overlay'; game.overlayT = 0; game.overlayCb = cb;
  const b = $('bigtext'); b.className = cls; b.textContent = text;
}
function clearPursuit() {
  game.stars = 0; game.evade = 0; game.bustT = 0;
  cars.filter(c => c.type === 'police' && c.driver === 'police').forEach(removeCar);
}
function respawnAt(L, h) {
  if (player.inCar) exitCar(true);
  player.x = L.x; player.z = L.z + 10; player.h = h || 0; player.hp = maxHP(); game.snapCam = true;
}
function busted() {
  if (game.mission) failMission('你被捕了');
  overlay('busted', 'BUSTED', () => {
    const fine = Math.min(game.money, Math.max(100, Math.floor(game.money * 0.1)));
    game.money -= fine; clearPursuit(); respawnAt(LOC.police, Math.PI);
    toast('交了 ' + fine.toLocaleString() + ' 元罚款');
  });
}
function wasted() {
  if (game.mission) failMission('你挂了');
  overlay('wasted', 'WASTED', () => {
    const fee = Math.min(game.money, 200);
    game.money -= fee; clearPursuit(); respawnAt(LOC.hospital, 0);
    toast('医药费 ' + fee + ' 元');
  });
}

// ---------- 任务 ----------
function startMission(i) {
  const M = MISSIONS[i];
  const m = { i, stage: 0, timer: null, text: '', target: null };
  game.mission = m;
  banner(M.name, M.desc);
  if (i === 0) { m.text = '去取包裹'; m.target = M1_PICK; }
  if (i === 1) {
    const old = cars.find(c => dist(c.x, c.z, M2_VAN.x, M2_VAN.z) < 8); if (old && old !== player.inCar) removeCar(old);
    m.van = createCar('van', M2_VAN.x, M2_VAN.z, Math.PI / 2, 0xd4a017); m.text = '偷走运钞车'; m.target = m.van;
  }
  if (i === 2) { m.timer = 110; m.cp = 0; m.target = M3_CP[0]; m.text = '冲过检查点 1/8'; }
}
function failMission(reason) {
  const m = game.mission; if (!m) return;
  if (m.van && !m.van.dead && player.inCar !== m.van) m.van.dead || (m.van.driver = null);
  game.mission = null; game.giverArmed = false;
  setTimeout(() => banner('任务失败', reason, '#ff6b6b'), 50);
}
function passMission() {
  const m = game.mission, M = MISSIONS[m.i];
  game.money += M.reward; game.missionIdx = m.i + 1; game.mission = null; game.giverArmed = false;
  if (m.i === 1) clearPursuit();
  if (game.missionIdx >= 3) banner('阳光城传奇', '三个主线全部完成！奖励 +' + fmt(M.reward) + '，继续自由探索吧');
  else banner('任务完成！', '奖励 +' + fmt(M.reward) + '  ·  去改装店升级吧');
  saveGame(true);
}
function updateMission(dt) {
  const P = playerPos();
  const m = game.mission;
  if (!m) {
    if (game.missionIdx < 3) {
      const g = MISSIONS[game.missionIdx].giver; setBeacon(g, 0xffd23f);
      const d = dist(P.x, P.z, g.x, g.z);
      if (d > 9) game.giverArmed = true;
      if (game.giverArmed && d < 3.5) startMission(game.missionIdx);
    } else setBeacon(null);
    return;
  }
  if (m.timer != null) { m.timer -= dt; if (m.timer <= 0) { failMission('时间到了'); return; } }
  if (m.i === 0) {
    if (m.stage === 0 && dist(P.x, P.z, M1_PICK.x, M1_PICK.z) < 5) { m.stage = 1; m.timer = 75; m.target = M1_DROP; m.text = '把包裹送到东区客户'; toast('📦 拿到包裹了，快！'); }
    else if (m.stage === 1 && dist(P.x, P.z, M1_DROP.x, M1_DROP.z) < 5) return passMission();
    setBeacon(m.target, 0xffd23f);
  } else if (m.i === 1) {
    const v = m.van;
    if (v.dead) return failMission('运钞车被毁了');
    if (player.inCar === v) {
      if (m.stage === 0) { m.stage = 1; addStars(3 - game.stars, '运钞车警报响了'); game.stars = Math.max(game.stars, 3); }
      m.text = '把运钞车开回安全屋（H）'; m.target = LOC.hideout;
      if (dist(v.x, v.z, LOC.hideout.x, LOC.hideout.z) < 7) return passMission();
    } else { m.text = m.stage === 0 ? '偷走运钞车' : '回到运钞车上！'; m.target = v; }
    setBeacon(m.target === v ? { x: v.x, z: v.z } : m.target, m.target === v ? 0x7ee36b : 0xffd23f, m.target === v);
  } else if (m.i === 2) {
    const cp = M3_CP[m.cp];
    if (!player.inCar) m.text = '上车！比赛进行中';
    else m.text = '冲过检查点 ' + (m.cp + 1) + '/8';
    if (player.inCar && dist(P.x, P.z, cp.x, cp.z) < 8) {
      m.cp++; toast('检查点 ' + m.cp + '/8 ✓', 1200);
      if (m.cp >= M3_CP.length) return passMission();
      m.target = M3_CP[m.cp];
    }
    setBeacon(m.target, 0xff4fa3);
  }
}

// ---------- 存档 ----------
function saveGame(silent) {
  const P = playerPos();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: game.money, upg: game.upg, missionIdx: game.missionIdx, x: P.x, z: P.z, playTime: game.playTime, t: Date.now() }));
    if (!silent) toast('💾 游戏已保存'); else toast('💾 自动存档');
  } catch (e) { toast('存档失败：浏览器禁止了本地存储'); }
}
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
function refreshMenu() {
  const s = loadSave();
  $('btnContinue').disabled = !s;
  $('saveInfo').textContent = s ? `存档：${fmt(s.money)} · 主线 ${Math.min(s.missionIdx, 3)}/3 · ${new Date(s.t).toLocaleString('zh-CN')}` : '暂无存档';
}

// ---------- 开始游戏 ----------
function resetWorld() {
  clearPursuit();
  if (player.inCar) exitCar(true);
  game.mission = null; game.giverArmed = true;
  peds.forEach(p => { if (p.dead || p.free) resetPed(p); });
  cars.filter(c => c.dead || c.type === 'van').forEach(removeCar);
  while (cars.filter(c => c.driver === 'ai').length < 26) spawnTraffic();
}
function startGame(save) {
  resetWorld();
  game.money = save ? save.money : 200;
  game.upg = save ? Object.assign({ engine: 0, armor: 0, health: 0, stealth: 0 }, save.upg) : { engine: 0, armor: 0, health: 0, stealth: 0 };
  game.missionIdx = save ? save.missionIdx : 0; game.playTime = save ? save.playTime || 0 : 0;
  player.hp = maxHP();
  if (save) { player.x = save.x; player.z = save.z; collideBlocks(player, 0.5); } else { player.x = LOC.start.x; player.z = LOC.start.z; }
  player.h = Math.PI; player.mesh.visible = true; game.snapCam = true;
  game.state = 'play';
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  if (!save) {
    // 起点旁放一辆空车
    const c = createCar('car', LOC.start.x + 6.3, LOC.start.z + 6, Math.PI, 0xe63946);
    banner('欢迎来到阳光城', '走进黄色光柱接任务 · 按 F 偷车');
  } else banner('欢迎回来', `主线进度 ${Math.min(game.missionIdx, 3)}/3`);
}
function toMenu() {
  game.state = 'menu'; $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  ['pause', 'shop', 'help'].forEach(id => $(id).classList.add('hidden')); refreshMenu();
}

// ---------- 改装店 ----------
function openShop() {
  game.state = 'shop'; $('shop').classList.remove('hidden'); renderShop();
}
function renderShop() {
  $('shopMoney').textContent = fmt(game.money);
  $('shopRows').innerHTML = '';
  UPGRADES.forEach(u => {
    const lv = game.upg[u.id], row = document.createElement('div'); row.className = 'shoprow';
    const cost = UPG_COST[lv];
    row.innerHTML = `<div class="nm"><b>${u.name}</b><small>${u.desc}</small></div><div class="lv">${'■'.repeat(lv)}${'□'.repeat(3 - lv)}</div>`;
    const b = document.createElement('button');
    b.textContent = lv >= 3 ? '已满级' : fmt(cost); b.disabled = lv >= 3 || game.money < cost;
    b.onclick = () => {
      if (game.money < cost) return;
      game.money -= cost; game.upg[u.id]++;
      if (u.id === 'health') player.hp = maxHP();
      toast(u.name + ' 升到 ' + game.upg[u.id] + ' 级'); renderShop(); saveGame(true);
    };
    row.appendChild(b); $('shopRows').appendChild(row);
  });
  $('btnSpray').disabled = game.money < 150;
}
$('btnSpray').onclick = () => {
  if (game.money < 150) return;
  game.money -= 150; clearPursuit();
  if (player.inCar) { player.inCar.health = player.inCar.maxHealth; player.inCar.body.material = mat(pick(CAR_COLORS)); }
  toast('🎨 喷漆完成：通缉清除，车辆修好'); renderShop();
};
$('btnShopClose').onclick = () => { $('shop').classList.add('hidden'); game.state = 'play'; };

// ---------- 输入 ----------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function press(code) {
  if (code === 'Escape' || code === 'KeyP') {
    if (game.state === 'play') { game.state = 'pause'; $('pause').classList.remove('hidden'); }
    else if (game.state === 'pause') { game.state = 'play'; $('pause').classList.add('hidden'); }
    else if (game.state === 'shop') $('btnShopClose').onclick();
    return;
  }
  if (game.state !== 'play') return;
  if (code === 'KeyF') {
    if (player.inCar) { if (Math.abs(player.inCar.speed) < 12) exitCar(); else toast('先减速再下车'); }
    else { const c = nearestCar(4.2); if (c) enterCar(c); }
  }
  if (code === 'KeyE' && dist(playerPos().x, playerPos().z, LOC.garage.x, LOC.garage.z) < 11) openShop();
}
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!K[e.code]) press(e.code);
  K[e.code] = true;
});
window.addEventListener('keyup', e => { K[e.code] = false; });
window.addEventListener('blur', () => { for (const k in K) K[k] = false; });
document.querySelectorAll('#touch [data-key]').forEach(b => {
  const k = b.dataset.key;
  b.addEventListener('touchstart', e => { e.preventDefault(); K[k] = true; });
  b.addEventListener('touchend', e => { e.preventDefault(); K[k] = false; });
  b.addEventListener('touchcancel', () => { K[k] = false; });
});
document.querySelectorAll('#touch [data-press]').forEach(b => {
  b.addEventListener('touchstart', e => { e.preventDefault(); press(b.dataset.press); });
});
$('btnNew').onclick = () => { const s = loadSave(); if (s && !confirm('新游戏会覆盖旧存档的进度（保存时），确定吗？')) return; startGame(null); };
$('btnContinue').onclick = () => { const s = loadSave(); if (s) startGame(s); };
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnPauseHelp').onclick = () => $('help').classList.remove('hidden');
document.querySelector('#help .close').onclick = () => $('help').classList.add('hidden');
$('btnResume').onclick = () => press('Escape');
$('btnSave').onclick = () => saveGame(false);
$('btnQuit').onclick = () => { if (confirm('返回主菜单？未保存的进度会丢失。')) toMenu(); };

// ---------- 主更新 ----------
let shake = 0;
function updatePeds(dt) {
  const P = playerPos();
  for (const p of peds) {
    if (p.dead) {
      p.deadT += dt; if (p.deadT > 12 && dist(p.x, p.z, P.x, P.z) > 60) resetPed(p);
      continue;
    }
    // 被车撞
    for (const c of cars) {
      if (Math.abs(c.speed) < 5) continue;
      if (dist(c.x, c.z, p.x, p.z) < c.radius + 0.3) {
        p.dead = true; p.deadT = 0; p.mesh.rotation.set(-Math.PI / 2, p.h, 0, 'YXZ'); p.mesh.position.y = 0.35;
        if (c === player.inCar) {
          shake = 0.3;
          if (Math.random() < 0.6) spawnCash(p.x + rand(-1, 1), p.z + rand(-1, 1), randi(10, 45), true);
          if (game.wantedCd <= 0 && (game.stars < 2 || Math.random() < 0.3)) { addStars(1, '撞倒路人'); game.wantedCd = 5; }
        }
        break;
      }
    }
    if (p.dead) continue;
    // 惊慌
    const pc = player.inCar;
    if (pc && Math.abs(pc.speed) > 10 && dist(pc.x, pc.z, p.x, p.z) < 10) p.panic = 3;
    p.panic = Math.max(0, p.panic - dt);
    const sp = p.panic > 0 ? 5 : p.speed;
    if (p.free) {
      p.x += Math.sin(p.h) * sp * dt; p.z += Math.cos(p.h) * sp * dt; collideBlocks(p, 0.4);
      if (p.panic <= 0 && dist(p.x, p.z, P.x, P.z) > 40) resetPed(p);
    } else {
      p.s += sp * p.dir * dt; Object.assign(p, pedPos(p));
    }
    p.phase += sp * dt * 2.2;
    p.mesh.position.set(p.x, 0.3, p.z); p.mesh.rotation.y = p.h;
    const sw = Math.sin(p.phase) * 0.6; p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
  }
}
function updatePickups(dt) {
  const P = playerPos();
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i]; k.t += dt;
    if (!k.active) { if (k.t > 40) { const s = randomSidewalk(); k.x = s.x; k.z = s.z; k.m.position.set(k.x, 1, k.z); k.active = true; k.m.visible = true; } continue; }
    k.m.rotation.y += dt * 2.5; k.m.position.y = 1 + Math.sin(k.t * 3) * 0.2;
    if (dist(P.x, P.z, k.x, k.z) < 2.6) {
      game.money += k.amount; toast('+' + fmt(k.amount), 1200);
      if (k.temp) { scene.remove(k.m); pickups.splice(i, 1); } else { k.active = false; k.m.visible = false; k.t = 0; }
    } else if (k.temp && k.t > 30) { scene.remove(k.m); pickups.splice(i, 1); }
  }
}
function updateFoot(dt) {
  const f = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
  const t = (key('KeyA', 'ArrowLeft') ? 1 : 0) - (key('KeyD', 'ArrowRight') ? 1 : 0);
  player.h += t * 3 * dt;
  const sp = (key('ShiftLeft', 'ShiftRight') ? 10 : 6) * f * (f < 0 ? 0.5 : 1);
  player.x += Math.sin(player.h) * sp * dt; player.z += Math.cos(player.h) * sp * dt;
  collideBlocks(player, 0.5);
  player.phase += Math.abs(sp) * dt * 1.6;
  const sw = sp ? Math.sin(player.phase) * 0.7 : 0; player.legL.rotation.x = sw; player.legR.rotation.x = -sw;
  player.mesh.position.set(player.x, 0.3, player.z); player.mesh.rotation.y = player.h;
  // 被车撞
  player.hitCd = Math.max(0, player.hitCd - dt);
  for (const c of cars) {
    if (Math.abs(c.speed) > 6 && player.hitCd <= 0 && dist(c.x, c.z, player.x, player.z) < c.radius + 0.4) {
      player.hitCd = 1.2; player.x += Math.sin(c.h) * 3; player.z += Math.cos(c.h) * 3; hurtPlayer(Math.round(Math.abs(c.speed)), '被车撞了');
    }
  }
}
function updateCamera(dt) {
  let tx, tz, h, back, up;
  if (player.inCar) { const c = player.inCar; tx = c.x; tz = c.z; h = c.h; back = 11 + Math.abs(c.speed) * 0.13; up = 4.8 + Math.abs(c.speed) * 0.05; }
  else { tx = player.x; tz = player.z; h = player.h; back = 7.5; up = 4.2; }
  if (game.snapCam) { game.camH = h; }
  game.camH += wrapA(h - game.camH) * (1 - Math.exp(-4 * dt));
  const want = new THREE.Vector3(tx - Math.sin(game.camH) * back, up, tz - Math.cos(game.camH) * back);
  if (game.snapCam) { camera.position.copy(want); game.snapCam = false; } else camera.position.lerp(want, 1 - Math.exp(-7 * dt));
  if (shake > 0) { camera.position.x += rand(-1, 1) * shake * 0.5; camera.position.y += rand(-1, 1) * shake * 0.3; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(tx + Math.sin(game.camH) * 4, 1.6, tz + Math.cos(game.camH) * 4);
  sun.position.set(tx + 70, 130, tz + 45); sun.target.position.set(tx, 0, tz);
}
function updateWorld(dt) {
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.dead) { if (c.deadT > 25 && c !== (game.mission && game.mission.van) && dist(c.x, c.z, player.x, player.z) > 60) removeCar(c); continue; }
    if (c.driver === 'ai') updateTraffic(c, dt);
    else if (c.driver === 'police') updatePoliceAI(c, dt);
    else if (c.driver === null) { c.speed -= c.speed * 2 * dt; }
  }
  if (player.inCar && !player.inCar.dead) updatePlayerCar(player.inCar, dt);
  moveCars(dt);
  updatePeds(dt);
  while (cars.filter(c => c.driver === 'ai' && !c.dead).length < 26) if (!spawnTraffic(playerPos())) break;
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt; const k = e.t / e.life;
    e.m.scale.setScalar(1 + k * 6); e.m.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { scene.remove(e.m); effects.splice(i, 1); }
  }
  gem.rotation.y += dt * 2; ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.08);
}
function update(dt) {
  game.playTime += dt;
  if (!player.inCar) updateFoot(dt);
  updateWorld(dt);
  updatePickups(dt);
  updateWanted(dt);
  if (game.state !== 'play') return; // 可能刚被捕
  updateMission(dt);
  updateCamera(dt);
  // 提示
  const P = playerPos();
  let hint = '';
  if (!player.inCar) { const c = nearestCar(4.2); if (c) hint = c.driver === 'ai' ? '按 F 把司机拽下来抢车' : c.driver === 'police' ? '按 F 抢警车（★★）' : '按 F 上车'; }
  if (dist(P.x, P.z, LOC.garage.x, LOC.garage.z) < 11) hint = '按 E 打开改装店';
  setHint(hint);
  game.saveT += dt;
  if (game.saveT > 60 && game.stars === 0 && !game.mission) { game.saveT = 0; saveGame(true); }
}
function updateMenu(dt) {
  game.menuA += dt * 0.07;
  updateWorld(dt);
  camera.position.set(SIZE / 2 + Math.cos(game.menuA) * 250, 120, SIZE / 2 + Math.sin(game.menuA) * 250);
  camera.lookAt(SIZE / 2, 0, SIZE / 2);
  sun.position.set(SIZE / 2 + 70, 130, SIZE / 2 + 45); sun.target.position.set(SIZE / 2, 0, SIZE / 2);
}
function updateOverlay(dt) {
  game.overlayT += dt;
  updateWorld(dt * 0.3); updateCamera(dt * 0.3);
  $('bigtext').classList.remove('hidden');
  if (game.overlayT > 3) { $('bigtext').classList.add('hidden'); game.state = 'play'; const cb = game.overlayCb; game.overlayCb = null; if (cb) cb(); }
}

// ---------- 初始化 ----------
buildCity();
for (let i = 0; i < 26; i++) spawnTraffic();
for (let i = 0; i < 16; i++) spawnParked();
for (let i = 0; i < 46; i++) spawnPed();
for (let i = 0; i < 22; i++) { const s = randomSidewalk(); spawnCash(s.x, s.z, pick([25, 50, 50, 100, 150])); }
refreshMenu();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (game.state === 'play') update(dt);
  else if (game.state === 'menu') updateMenu(dt);
  else if (game.state === 'overlay') updateOverlay(dt);
  renderer.render(scene, camera);
  if (game.state !== 'menu') updateHUD();
}
requestAnimationFrame(frame);

// 调试 / 自动化接口（截图用）
window.SC = {
  game, player, cars, peds, K, startGame, startMission, enterCar, spawnPolice, LOC, MISSIONS,
  step(n, dt) { for (let i = 0; i < n; i++) { if (game.state === 'play') update(dt || 1 / 30); else if (game.state === 'overlay') updateOverlay(dt || 1 / 30); } renderer.render(scene, camera); updateHUD(); },
  createCar,
};
})();
