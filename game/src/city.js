// Solmar Bay itself: a procedural grid city with a beach, an ocean and a
// working dockyard. Everything is generated from the seeded RNG, so the same
// seed always builds the same city. Textures are drawn on canvases — no
// image files are shipped.

import * as THREE from 'three';
import { WORLD, MAMA_LOU, HIDEOUT, DOCKS, PACKAGE_SPOTS } from './config.js';

const PALETTES = [
  { wall: '#f2d8b8', win: '#7fb8d8' }, // sand
  { wall: '#e8b8a0', win: '#a8d8e8' }, // coral
  { wall: '#b8d8d0', win: '#e8e0a0' }, // seafoam
  { wall: '#d8c8e8', win: '#c8e8f0' }, // lilac
  { wall: '#f0e8d0', win: '#88a8c8' }, // cream
  { wall: '#c8d8e8', win: '#f0d890' }, // powder blue
];

function makeWindowTexture(palette, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = palette.wall;
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const lit = rng.chance(0.3);
      g.fillStyle = lit ? '#ffe9a0' : palette.win;
      g.fillRect(10 + x * 30, 10 + y * 30, 18, 20);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(10 + x * 30, 28 + y * 30, 18, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture(horizontal = false) {
  const c = document.createElement('canvas');
  c.width = horizontal ? 256 : 64;
  c.height = horizontal ? 64 : 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f46';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f2d060';
  if (horizontal) {
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 30, 18, 4);
  } else {
    for (let y = 0; y < 256; y += 32) g.fillRect(30, y, 4, 18);
  }
  g.fillStyle = 'rgba(255,255,255,0.25)';
  if (horizontal) {
    g.fillRect(0, 2, 256, 2);
    g.fillRect(0, 60, 256, 2);
  } else {
    g.fillRect(2, 0, 2, 256);
    g.fillRect(60, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg = '#123a5c', fg = '#ffd94a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.font = 'bold 54px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWaterTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1e8fc0';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 14, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = []; // {minX,maxX,minZ,maxZ} — buildings and big props
    this.buildings = []; // {x,z,w,d,h,color} for the minimap
    this.parkingSpots = []; // {x,z,heading} where stealable cars wait
    this.streetSpots = [];
    this.sidewalkLines = []; // {axis, fixed, from, to} — ped routes
    this.waterTextures = [];
    this.packageMarkers = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build();
  }

  addCollider(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  // Push a circle (x, z, radius) out of every collider it overlaps.
  resolveCircle(x, z, radius) {
    let nx = x;
    let nz = z;
    let hit = false;
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(nx, c.maxX));
      const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
      const dx = nx - cx;
      const dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * radius;
          nz = cz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest overlap.
          const left = nx - c.minX;
          const right = c.maxX - nx;
          const top = nz - c.minZ;
          const bottom = c.maxZ - nz;
          const m = Math.min(left, right, top, bottom);
          if (m === left) nx = c.minX - radius;
          else if (m === right) nx = c.maxX + radius;
          else if (m === top) nz = c.minZ - radius;
          else nz = c.maxZ + radius;
        }
      }
    }
    return { x: nx, z: nz, hit };
  }

  _box(w, h, d, color, x, y, z, opts = {}) {
    const mat = opts.material || new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    this.group.add(mesh);
    return mesh;
  }

  _build() {
    const rng = this.rng;
    const R = WORLD.roads;
    const extent = 200;

    // Ground: warm grass base, then sand, then water.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshLambertMaterial({ color: 0x8fbf6a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(20, -0.05, 20);
    this.group.add(ground);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 70),
      new THREE.MeshLambertMaterial({ color: 0xe8d5a3 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(20, 0, WORLD.beachZ + 30);
    this.group.add(sand);

    const waterTex = makeWaterTexture();
    this.waterTextures.push(waterTex);
    const waterMat = new THREE.MeshLambertMaterial({ map: waterTex });
    const oceanS = new THREE.Mesh(new THREE.PlaneGeometry(700, 320), waterMat);
    oceanS.rotation.x = -Math.PI / 2;
    oceanS.position.set(20, 0.05, WORLD.oceanZ + 160);
    this.group.add(oceanS);
    const oceanE = new THREE.Mesh(new THREE.PlaneGeometry(320, 700), waterMat);
    oceanE.rotation.x = -Math.PI / 2;
    oceanE.position.set(WORLD.oceanX + 160, 0.05, 20);
    this.group.add(oceanE);

    // Roads with dashed centre lines, plus sidewalks.
    const roadTexV = makeRoadTexture(false);
    const roadTexH = makeRoadTexture(true);
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xc9c2b4 });
    for (const c of R) {
      const len = extent * 2 + 24;
      const vTex = roadTexV.clone();
      vTex.needsUpdate = true;
      vTex.repeat.set(1, len / 24);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, len),
        new THREE.MeshLambertMaterial({ map: vTex }));
      v.rotation.x = -Math.PI / 2;
      v.position.set(c, 0.02, 0);
      this.group.add(v);
      const hTex = roadTexH.clone();
      hTex.needsUpdate = true;
      hTex.repeat.set(len / 24, 1);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(len, WORLD.roadWidth),
        new THREE.MeshLambertMaterial({ map: hTex }));
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.02, c);
      this.group.add(h);
      // Sidewalks on both sides of each road.
      for (const side of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(3, len), walkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(c + side * 7.5, 0.04, 0);
        this.group.add(sw);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), walkMat);
        sh.rotation.x = -Math.PI / 2;
        sh.position.set(0, 0.04, c + side * 7.5);
        this.group.add(sh);
      }
      this.sidewalkLines.push(
        { axis: 'z', fixed: c - 7.5, from: -extent, to: extent },
        { axis: 'z', fixed: c + 7.5, from: -extent, to: extent },
        { axis: 'x', fixed: c - 7.5, from: -extent, to: extent },
        { axis: 'x', fixed: c + 7.5, from: -extent, to: extent },
      );
    }

    // Blocks: buildings, parks and parking lots between the roads.
    const winTexs = PALETTES.map((p) => makeWindowTexture(p, rng));
    const blockCentres = [];
    for (let i = 0; i < R.length - 1; i++) {
      for (let j = 0; j < R.length - 1; j++) {
        blockCentres.push({ x: (R[i] + R[i + 1]) / 2, z: (R[j] + R[j + 1]) / 2 });
      }
    }
    const parkBlocks = new Set(['-66,-66', '-22,-154', '66,154']);
    const lotBlocks = new Set(['22,-22', '110,-110']);
    const plazaBlocks = new Set(['-22,66', '-110,-110']); // Mama Lou's, hideout
    for (const b of blockCentres) {
      const key = `${b.x},${b.z}`;
      if (parkBlocks.has(key)) { this._buildPark(b.x, b.z); continue; }
      if (lotBlocks.has(key)) { this._buildParkingLot(b.x, b.z); continue; }
      if (plazaBlocks.has(key)) { this._buildPlaza(b.x, b.z); continue; }
      this._buildBlock(b.x, b.z, winTexs);
    }

    this._buildMamaLous();
    this._buildHideout();
    this._buildDocks();
    this._buildBeachProps();
    this._buildStreetProps();
    this._buildClouds();
    this._buildPackages();
    this._buildParkedSpots();
  }

  _buildBlock(cx, cz, winTexs) {
    const rng = this.rng;
    const dist = Math.hypot(cx, cz);
    const downtown = 1 - Math.min(1, dist / 220);
    const n = rng.chance(0.55) ? 1 : rng.chance(0.7) ? 2 : 4;
    const spots = n === 1 ? [[0, 0, 26, 26]]
      : n === 2 ? [[-7, 0, 13, 26], [7, 0, 13, 26]]
      : [[-8, -8, 13, 13], [8, -8, 13, 13], [-8, 8, 13, 13], [8, 8, 13, 13]];
    for (const [ox, oz, w, d] of spots) {
      const h = Math.round(rng.range(7, 12) + downtown * rng.range(6, 30));
      const tex = rng.pick(winTexs).clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 9)));
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const x = cx + ox;
      const z = cz + oz;
      this._box(w, h, d, 0xffffff, x, h / 2, z, { material: mat });
      this._box(w + 0.6, 0.5, d + 0.6, 0x5a5a5a, x, h + 0.25, z); // roof lip
      if (rng.chance(0.5)) this._box(2, 1.6, 2, 0x888888, x + rng.range(-4, 4), h + 1.2, z + rng.range(-4, 4));
      if (rng.chance(0.25)) {
        // Water tower on the roof.
        const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 8),
          new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
        t.position.set(x + rng.range(-4, 4), h + 2.4, z + rng.range(-4, 4));
        this.group.add(t);
      }
      this.addCollider(x, z, w, d);
      this.buildings.push({ x, z, w, d, h, color: 0x9a938a });
    }
  }

  _buildPlaza(cx, cz) {
    // Paved open square with corner trees and benches.
    this._box(30, 0.2, 30, 0xd8d2c2, cx, 0.08, cz);
    this._box(10, 0.3, 10, 0xb8b2a2, cx, 0.14, cz);
    for (const [ox, oz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
      this._tree(cx + ox, cz + oz);
    }
    for (const [ox, oz] of [[-6, 0], [6, 0]]) {
      this._box(2.4, 0.5, 0.8, 0x8a6a4a, cx + ox, 0.45, cz + 7);
      this.addCollider(cx + ox, cz + 7, 2.4, 0.8);
    }
  }

  _buildPark(cx, cz) {
    const rng = this.rng;
    this._box(30, 0.3, 30, 0x6fae4e, cx, 0.1, cz);
    for (let i = 0; i < 9; i++) this._tree(cx + rng.range(-13, 13), cz + rng.range(-13, 13));
    this._box(6, 0.4, 4, 0x9a8a6a, cx, 0.3, cz); // bandstand base
    this._box(5, 0.3, 3.4, 0xc03030, cx, 2.6, cz); // bandstand roof
    this.addCollider(cx, cz, 6, 4);
  }

  _buildParkingLot(cx, cz) {
    this._box(30, 0.15, 30, 0x4a4d52, cx, 0.06, cz);
    for (let i = 0; i < 8; i++) {
      const x = cx - 10 + (i % 4) * 7;
      const z = cz + (i < 4 ? -7 : 7);
      this.parkingSpots.push({ x, z, heading: Math.PI / 2 });
      this._box(0.2, 0.05, 5, 0xf2f2f2, x - 2.4, 0.16, z);
    }
  }

  _tree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
    trunk.position.set(x, 1.5, z);
    this.group.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x3f8a3a }));
    top.position.set(x, 4.2, z);
    this.group.add(top);
    this.addCollider(x, z, 0.8, 0.8);
  }

  _palm(x, z, lean = 0) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 5.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a5a38 }));
    trunk.position.y = 2.75;
    trunk.rotation.z = lean;
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9a44 });
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 2.8), frondMat);
      const a = (i / 7) * Math.PI * 2;
      f.position.set(Math.sin(a) * 1.2, 5.6, Math.cos(a) * 1.2);
      f.rotation.y = a;
      f.rotation.x = 0.7;
      g.add(f);
    }
    g.position.set(x, 0, z);
    this.group.add(g);
    this.addCollider(x, z, 0.7, 0.7);
  }

  _sign(text, x, y, z, ry, w = 12, h = 3) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ map: makeSignTexture(text), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.group.add(mesh);
  }

  _buildMamaLous() {
    const { x, z } = MAMA_LOU;
    // Cafe building on the plaza block.
    this._box(16, 7, 12, 0xf2e0c0, x - 8, 3.5, z - 6);
    this._box(17, 0.5, 13, 0xc03030, x - 8, 7.2, z - 6); // awning roof
    this._sign("MAMA LOU'S", x - 8, 5.6, z + 0.2, 0, 12, 2.6);
    this.addCollider(x - 8, z - 6, 16, 12);
    this.buildings.push({ x: x - 8, z: z - 6, w: 16, d: 12, h: 7, color: 0xc08a5a });
    // Outdoor tables.
    for (const [tx, tz] of [[-2, 4], [4, 8], [-8, 8]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 10),
        new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      t.position.set(x + tx, 1, z + tz);
      this.group.add(t);
      this.addCollider(x + tx, z + tz, 1.6, 1.6);
    }
    // Mama Lou herself stands by the door (a simple figure; see pedestrians).
    this.mamaLouPos = { x: x + 1, z: z + 1 };
  }

  _buildHideout() {
    const { x, z } = HIDEOUT;
    this._box(14, 6, 10, 0x7a8a9a, x, 3, z);
    this._box(10, 4.4, 0.4, 0x1a1a22, x, 2.2, z + 5.1); // dark garage mouth
    this._sign('HIDEOUT', x, 5.2, z + 5.4, 0, 9, 2);
    this.addCollider(x, z, 14, 10);
    this.buildings.push({ x, z, w: 14, d: 10, h: 6, color: 0x7a8a9a });
  }

  _buildDocks() {
    const rng = this.rng;
    // Concrete apron.
    this._box(WORLD.dockX1 - WORLD.dockX0, 0.4, WORLD.dockZ1 - WORLD.dockZ0,
      0x9a9a92, (WORLD.dockX0 + WORLD.dockX1) / 2, 0.2, 0);
    // Shipping containers in stacks.
    const contColors = [0xc03028, 0x2850a0, 0x28a048, 0xd89020, 0x8850a0];
    for (let i = 0; i < 14; i++) {
      const cx = rng.range(196, 236);
      const cz = rng.range(-40, 40);
      const stacked = rng.chance(0.4);
      this._box(6, 2.6, 2.6, rng.pick(contColors), cx, 1.5, cz, { ry: rng.chance(0.5) ? 0 : Math.PI / 2 });
      if (stacked) this._box(6, 2.6, 2.6, rng.pick(contColors), cx, 4.1, cz, { ry: 0 });
      this.addCollider(cx, cz, 6.5, 3);
    }
    // Two gantry cranes.
    for (const cz of [-28, 24]) {
      const cx = 238;
      this._box(1.2, 18, 1.2, 0xd8b020, cx - 3, 9, cz - 3);
      this._box(1.2, 18, 1.2, 0xd8b020, cx - 3, 9, cz + 3);
      this._box(14, 1.4, 1.4, 0xd8b020, cx + 2, 18, cz);
      this._box(1, 6, 1, 0x333333, cx + 7, 15, cz);
      this.addCollider(cx - 3, cz, 2, 8);
    }
    // A moored boat.
    this._box(10, 2, 3.4, 0xf2f2f2, 256, 0.8, -14, { ry: Math.PI / 2 });
    this._box(4, 2, 2.6, 0x2850a0, 256, 2.6, -14, { ry: Math.PI / 2 });
    this._sign('SOLMAR DOCKS', 214, 8, -44, 0, 16, 3);
    this.docksCenter = { x: DOCKS.x, z: DOCKS.z };
  }

  _buildBeachProps() {
    const rng = this.rng;
    for (let x = -180; x <= 180; x += 24) {
      if (rng.chance(0.7)) this._palm(x + rng.range(-6, 6), 196 + rng.range(0, 8), rng.range(-0.15, 0.15));
    }
    // Umbrellas and towels.
    for (let i = 0; i < 14; i++) {
      const x = rng.range(-180, 180);
      const z = rng.range(200, 238);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5),
        new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(x, 1.2, z);
      this.group.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 8),
        new THREE.MeshLambertMaterial({ color: rng.pick([0xe04040, 0x40a0e0, 0xf2d020, 0x40c080]) }));
      top.position.set(x, 2.6, z);
      this.group.add(top);
      this._box(1.8, 0.06, 0.9, rng.pick([0xe04090, 0x40c0e0, 0xf2f2f2]), x + 2, 0.1, z + 1);
    }
    // Lifeguard hut.
    this._box(3, 2.4, 3, 0xf2f2f2, -150, 2.2, 208);
    this._box(3.4, 0.3, 3.4, 0xe04040, -150, 3.6, 208);
    this.addCollider(-150, 208, 3, 3);
    this._sign('SOLMAR BAY', 0, 7, 192, 0, 18, 3.4);
  }

  _buildStreetProps() {
    const rng = this.rng;
    // Lamp posts along the two main avenues.
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8833 });
    for (const c of [-44, 0, 44]) {
      for (let p = -176; p <= 176; p += 44) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 5), lampMat);
        pole.position.set(c + 7.5, 3, p);
        this.group.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), bulbMat);
        bulb.position.set(c + 7.5, 6.1, p);
        this.group.add(bulb);
      }
    }
    // Palms down the beach boulevard and a few downtown.
    for (let x = -176; x <= 176; x += 22) {
      if (rng.chance(0.6)) this._palm(x, 180, rng.range(-0.1, 0.1));
    }
    for (let i = 0; i < 10; i++) {
      this._palm(rng.pick(WORLD.roads) + 7.5, rng.pick(WORLD.roads) + rng.range(-14, 14));
    }
  }

  _buildClouds() {
    const rng = this.rng;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(4, 9), 7, 6), mat);
        s.position.set(j * 6 - 9, rng.range(-1, 1), rng.range(-2, 2));
        s.scale.y = 0.45;
        g.add(s);
      }
      g.position.set(rng.range(-260, 260), rng.range(60, 90), rng.range(-260, 260));
      this.group.add(g);
      this.clouds = this.clouds || [];
      this.clouds.push(g);
    }
  }

  _buildPackages() {
    for (let i = 0; i < PACKAGE_SPOTS.length; i++) {
      const s = PACKAGE_SPOTS[i];
      const group = new THREE.Group();
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xff5fd0, emissive: 0xaa2277 }));
      cube.position.y = 1.2;
      group.add(cube);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 22, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff5fd0, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 11;
      group.add(beam);
      group.position.set(s.x, 0, s.z);
      this.group.add(group);
      this.packageMarkers.push({ index: i, group, cube, x: s.x, z: s.z });
    }
  }

  _buildParkedSpots() {
    const rng = this.rng;
    // Parallel-parked cars along a few roads.
    for (let i = 0; i < 12; i++) {
      const road = rng.pick(WORLD.roads);
      const along = rng.pick(WORLD.roads) + rng.range(-14, 14);
      const vertical = rng.chance(0.5);
      if (vertical) this.streetSpots.push({ x: road + 4.2, z: along, heading: 0 });
      else this.streetSpots.push({ x: along, z: road + 4.2, heading: Math.PI / 2 });
    }
  }

  update(dt, time) {
    for (const tex of this.waterTextures) {
      tex.offset.x = (time * 0.008) % 1;
      tex.offset.y = (time * 0.005) % 1;
    }
    if (this.clouds) {
      for (const c of this.clouds) {
        c.position.x += dt * 0.7;
        if (c.position.x > 300) c.position.x = -300;
      }
    }
    for (const m of this.packageMarkers) {
      m.cube.rotation.y += dt * 1.5;
      m.cube.position.y = 1.2 + Math.sin(time * 2 + m.index) * 0.25;
    }
  }
}
