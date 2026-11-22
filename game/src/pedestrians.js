// Pedestrians: sidewalk walkers with a simple limb-swing gait, fleeing when
// shots ring out, plus taxi fares, Mama Lou and the rival Gulls crew.

import * as THREE from 'three';
import { WORLD, clamp, dist2 } from './config.js';

const SHIRTS = [0xe04040, 0x40a0e0, 0xf2d020, 0x40c080, 0xe08040, 0x9040c0, 0xf2f2f2, 0x303030];
const SKINS = [0xf2c8a0, 0xc89060, 0x8a5a30, 0xf2d8b0];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a2a, 0x6a8a9a];

// A chunky low-poly humanoid: legs, torso, head, arms. Returns the group and
// the swinging limbs so walkers can animate.
export function buildHumanoid(shirt, pants, skin, opts = {}) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.24);
  legGeo.translate(0, -0.375, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.14, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.14, 0.78, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skinMat);
  head.position.y = 1.72;
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  armGeo.translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.4, 1.45, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.4, 1.45, 0);
  group.add(legL, legR, torso, head, armL, armR);
  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: opts.cap }));
    cap.position.y = 1.94;
    group.add(cap);
  }
  return { group, legL, legR, armL, armR, head };
}

export class Ped {
  constructor(scene, x, z, heading, opts = {}) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = opts.speed ?? 1.6;
    this.state = opts.state || 'walk'; // walk | flee | dead | fare | enemy | idle
    this.health = opts.health ?? 100;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.fleeUntil = 0;
    this.fleeFrom = null;
    this.deadTimer = 0;
    this.route = opts.route || null; // sidewalk line {axis, fixed, from, to}
    this.dir = opts.dir || 1;
    this.shootTimer = 1 + Math.random();
    this.isEnemy = this.state === 'enemy';
    const parts = buildHumanoid(
      opts.shirt ?? 0xe04040, opts.pants ?? 0x2a3a5a, opts.skin ?? 0xf2c8a0, opts,
    );
    this.parts = parts;
    this.mesh = parts.group;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
    this.mesh.traverse((m) => { if (m.isMesh) m.userData.ped = this; });
    scene.add(this.mesh);
    if (this.state === 'fare') this.parts.armR.rotation.x = Math.PI; // hailing arm
  }

  get alive() { return this.state !== 'dead'; }

  kill(G) {
    if (!this.alive) return;
    this.state = 'dead';
    this.deadTimer = 6;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.25;
    G.fx.bloodPuff(this.pos.clone().add(new THREE.Vector3(0, 1, 0)));
  }

  update(dt, G, time) {
    if (!this.alive) {
      this.deadTimer -= dt;
      return;
    }
    let moving = false;
    if (this.state === 'flee' && time < this.fleeUntil && this.fleeFrom) {
      const dx = this.pos.x - this.fleeFrom.x;
      const dz = this.pos.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx / d, dz / d);
      this.heading = want;
      const sp = 5.5;
      this.pos.x += (dx / d) * sp * dt;
      this.pos.z += (dz / d) * sp * dt;
      moving = true;
    } else if (this.state === 'walk' && this.route) {
      const sp = this.speed;
      if (this.route.axis === 'z') {
        this.pos.z += this.dir * sp * dt;
        if (this.pos.z > this.route.to - 2) this.dir = -1;
        if (this.pos.z < this.route.from + 2) this.dir = 1;
        this.heading = this.dir > 0 ? 0 : Math.PI;
      } else {
        this.pos.x += this.dir * sp * dt;
        if (this.pos.x > this.route.to - 2) this.dir = -1;
        if (this.pos.x < this.route.from + 2) this.dir = 1;
        this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      moving = true;
      if (time >= this.fleeUntil && this.state === 'walk') {
        // keep walking
      }
    } else if (this.state === 'flee' && time >= this.fleeUntil) {
      this.state = 'walk';
    }
    // Stay inside the world and out of buildings.
    this.pos.x = clamp(this.pos.x, WORLD.minX, WORLD.maxX);
    this.pos.z = clamp(this.pos.z, WORLD.minZ, WORLD.maxZ);
    const r = G.city.resolveCircle(this.pos.x, this.pos.z, 0.5);
    this.pos.x = r.x;
    this.pos.z = r.z;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Walk cycle.
    if (moving) {
      this.walkPhase += dt * (this.state === 'flee' ? 11 : 7);
      const s = Math.sin(this.walkPhase) * (this.state === 'flee' ? 0.9 : 0.55);
      this.parts.legL.rotation.x = s;
      this.parts.legR.rotation.x = -s;
      this.parts.armL.rotation.x = -s * 0.8;
      if (this.state !== 'fare') this.parts.armR.rotation.x = s * 0.8;
      this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
    } else {
      this.parts.legL.rotation.x *= 0.8;
      this.parts.legR.rotation.x *= 0.8;
    }
  }
}

export class PedManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.enemies = [];
  }

  spawnWalkers(count) {
    const lines = this.city.sidewalkLines;
    for (let i = 0; i < count; i++) {
      const line = this.rng.pick(lines);
      const along = this.rng.range(line.from + 4, line.to - 4);
      const x = line.axis === 'z' ? line.fixed : along;
      const z = line.axis === 'z' ? along : line.fixed;
      const ped = new Ped(this.scene, x, z, 0, {
        shirt: this.rng.pick(SHIRTS),
        pants: this.rng.pick(PANTS),
        skin: this.rng.pick(SKINS),
        speed: this.rng.range(1.2, 2.1),
        route: line,
        dir: this.rng.chance(0.5) ? 1 : -1,
        cap: this.rng.chance(0.3) ? this.rng.pick(SHIRTS) : 0,
      });
      this.peds.push(ped);
    }
    // Mama Lou waits by her cafe door.
    const mama = new Ped(this.scene, this.city.mamaLouPos.x, this.city.mamaLouPos.z, Math.PI, {
      shirt: 0xe04090, pants: 0x303030, skin: 0xc89060, state: 'idle',
    });
    this.peds.push(mama);
    this.mamaLou = mama;
  }

  // A taxi fare hailing a cab at a sidewalk point.
  spawnFare(x, z) {
    const fare = new Ped(this.scene, x, z, 0, {
      shirt: this.rng.pick(SHIRTS), pants: this.rng.pick(PANTS),
      skin: this.rng.pick(SKINS), state: 'fare',
    });
    this.peds.push(fare);
    return fare;
  }

  // A Gull crew member guarding a spot. Red bandana, shoots back.
  spawnEnemy(x, z) {
    const e = new Ped(this.scene, x, z, Math.random() * Math.PI * 2, {
      shirt: 0xc02020, pants: 0x1a1a1a, skin: this.rng.pick(SKINS),
      state: 'enemy', health: 100, cap: 0xc02020,
    });
    // A gun in the hand.
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    gun.position.set(0.4, 1.2, 0.3);
    e.mesh.add(gun);
    this.peds.push(e);
    this.enemies.push(e);
    return e;
  }

  removePed(ped) {
    this.scene.remove(ped.mesh);
    this.peds = this.peds.filter((p) => p !== ped);
    this.enemies = this.enemies.filter((p) => p !== ped);
  }

  // Gunfire sends every nearby walker running.
  scare(x, z, radius, time) {
    for (const p of this.peds) {
      if (!p.alive || p.state === 'enemy' || p.state === 'idle') continue;
      if (dist2(x, z, p.pos.x, p.pos.z) < radius * radius) {
        p.state = 'flee';
        p.fleeFrom = { x, z };
        p.fleeUntil = time + 4;
      }
    }
  }

  update(dt, G, time) {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      p.update(dt, G, time);
      if (!p.alive && p.deadTimer <= 0) this.removePed(p);
    }
  }
}
