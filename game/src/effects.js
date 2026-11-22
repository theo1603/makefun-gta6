// Particles, tracers, muzzle flashes and screen shake — the juice that makes
// gunfire, crashes and pickups feel alive. One pooled THREE.Points cloud.

import * as THREE from 'three';

const MAX_PARTICLES = 600;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({
      size: 0.35, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tracers = [];
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 18, 2);
    scene.add(this.flashLight);
    this.flashUntil = 0;
    this.shake = 0;
  }

  spawn(pos, opts = {}) {
    const count = opts.count || 10;
    const color = new THREE.Color(opts.color ?? 0xffcc33);
    const spread = opts.spread ?? 3;
    const up = opts.up ?? 3;
    const life = opts.life ?? 0.7;
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      this.parts.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (Math.random() - 0.5) * spread * 2,
        vy: Math.random() * up,
        vz: (Math.random() - 0.5) * spread * 2,
        life, maxLife: life,
        r: color.r, g: color.g, b: color.b,
        gravity: opts.gravity ?? 9,
      });
    }
  }

  sparks(pos) { this.spawn(pos, { count: 12, color: 0xffdd44, spread: 4, up: 4, life: 0.4 }); }
  smoke(pos) { this.spawn(pos, { count: 6, color: 0x888888, spread: 1, up: 2.5, life: 1.2, gravity: -2 }); }
  pickupBurst(pos) { this.spawn(pos, { count: 22, color: 0xff5fd0, spread: 3, up: 5, life: 0.9, gravity: 4 }); }
  explosion(pos) {
    this.spawn(pos, { count: 60, color: 0xff7722, spread: 7, up: 8, life: 0.9 });
    this.spawn(pos, { count: 30, color: 0x333333, spread: 4, up: 6, life: 1.6, gravity: -2 });
    this.muzzleFlash(pos, 0xff8844, 2.2);
    this.addShake(0.7);
  }
  bloodPuff(pos) { this.spawn(pos, { count: 8, color: 0xaa2222, spread: 2, up: 2, life: 0.5 }); }

  muzzleFlash(pos, color = 0xffcc66, intensity = 1.4) {
    this.flashLight.position.copy(pos);
    this.flashLight.color.set(color);
    this.flashLight.intensity = intensity * 60;
    this.flashUntil = performance.now() / 1000 + 0.06;
  }

  // A tracer line from the muzzle to the hit point, fading over 80 ms.
  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, until: performance.now() / 1000 + 0.09 });
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }
  // Decaying shake offset the camera adds each frame.
  shakeOffset(dt) {
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.shake <= 0.001) return { x: 0, y: 0 };
    const s = this.shake * this.shake * 0.35;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }

  update(dt) {
    const now = performance.now() / 1000;
    if (now > this.flashUntil) this.flashLight.intensity = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (now > this.tracers[i].until) {
        this.scene.remove(this.tracers[i].line);
        this.tracers[i].line.geometry.dispose();
        this.tracers[i].line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (p) {
        const fade = p.life / p.maxLife;
        this.positions[i * 3] = p.x;
        this.positions[i * 3 + 1] = p.y;
        this.positions[i * 3 + 2] = p.z;
        this.colors[i * 3] = p.r * fade;
        this.colors[i * 3 + 1] = p.g * fade;
        this.colors[i * 3 + 2] = p.b * fade;
      } else {
        this.positions[i * 3 + 1] = -100;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
