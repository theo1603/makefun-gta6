// The player: on-foot movement with sprint and jump, stealing and driving
// cars, health, and the hand-off to combat when the trigger is pulled.

import * as THREE from 'three';
import { WORLD, PLAYER_CONF, SPAWN, clamp, angleLerp, dist2 } from './config.js';
import { buildHumanoid } from './pedestrians.js';

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
    this.heading = SPAWN.heading;
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.moving = false;
    this.inCar = false;
    this.vehicle = null;
    this.lastHurtAt = -99;
    this.parts = buildHumanoid(0x20b0a0, 0x2a3a5a, 0xf2c8a0, { cap: 0x203040 });
    this.mesh = this.parts.group;
    // A pistol in the right hand.
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    gun.position.set(0.4, 1.15, 0.35);
    this.mesh.add(gun);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }

  get speedKmh() {
    if (this.inCar && this.vehicle) return Math.abs(this.vehicle.speed) * 3.6;
    return this.moving ? (this.sprinting ? 38 : 22) : 0;
  }

  resetToSpawn() {
    this.exitCar(true);
    this.pos.set(SPAWN.x, 0, SPAWN.z);
    this.heading = SPAWN.heading;
    this.vy = 0;
  }

  enterCar(vehicle, G) {
    if (!vehicle || vehicle.wrecked) return false;
    // Stealing a car in sight of the police draws heat.
    if (vehicle.driver !== 'player' && G.police.nearestCopDistance(this.pos) < 55) {
      G.police.addWanted(1, 'stole a car in front of the cops');
    }
    vehicle.driver = 'player';
    this.vehicle = vehicle;
    this.inCar = true;
    this.mesh.visible = false;
    G.audio.setEngine(0, true);
    return true;
  }

  exitCar(force = false) {
    if (!this.inCar || !this.vehicle) return false;
    const v = this.vehicle;
    if (!force && Math.abs(v.speed) > 2) return false;
    v.driver = null;
    v.speed = 0;
    const side = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
    this.pos.set(v.pos.x + side.x * 2.6, 0, v.pos.z + side.z * 2.6);
    this.heading = v.heading;
    this.vehicle = null;
    this.inCar = false;
    this.mesh.visible = true;
    return true;
  }

  damage(amount, G) {
    G.state.health = Math.max(0, G.state.health - amount);
    this.lastHurtAt = G.time;
    G.hud.flashDamage();
    G.fx.addShake(0.25);
    if (G.state.health <= 0) G.setMode('wasted');
  }

  update(dt, G) {
    const input = G.input;
    // Slow health regen after a quiet spell.
    if (G.time - this.lastHurtAt > PLAYER_CONF.regenDelay && G.state.health > 0) {
      G.state.health = Math.min(PLAYER_CONF.maxHealth,
        G.state.health + PLAYER_CONF.regenRate * dt);
    }
    if (this.inCar) {
      this._updateDriving(dt, G);
      return;
    }
    const axes = input.axes();
    this.sprinting = input.sprint;
    const camYaw = G.cam.yaw;
    // Move relative to the camera's view direction.
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw);
    const rz = Math.sin(camYaw);
    let mx = fx * axes.y + rx * axes.x;
    let mz = fz * axes.y + rz * axes.x;
    const mLen = Math.hypot(mx, mz);
    this.moving = mLen > 0.1;
    if (this.moving) {
      mx /= mLen;
      mz /= mLen;
      const speed = this.sprinting ? PLAYER_CONF.sprintSpeed : PLAYER_CONF.walkSpeed;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      const wantHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, wantHeading, Math.min(1, dt * 12));
      this.walkPhase += dt * (this.sprinting ? 12 : 8);
    }
    // Jump and gravity.
    if (input.jump && this.onGround) {
      this.vy = PLAYER_CONF.jumpSpeed;
      this.onGround = false;
      G.audio.jump();
    }
    this.vy -= PLAYER_CONF.gravity * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vy = 0;
      this.onGround = true;
    }
    // Collisions and bounds.
    this.pos.x = clamp(this.pos.x, WORLD.minX, WORLD.maxX);
    this.pos.z = clamp(this.pos.z, WORLD.minZ, WORLD.maxZ);
    const r = G.city.resolveCircle(this.pos.x, this.pos.z, PLAYER_CONF.radius);
    this.pos.x = r.x;
    this.pos.z = r.z;
    // Push out of cars (soft body check).
    for (const v of G.vehicles.vehicles) {
      if (v === this.vehicle) continue;
      const d2 = dist2(this.pos.x, this.pos.z, v.pos.x, v.pos.z);
      if (d2 < 4.4) {
        const d = Math.sqrt(d2) || 0.01;
        const push = (2.1 - d) / d;
        this.pos.x -= (v.pos.x - this.pos.x) * push * 0.5;
        this.pos.z -= (v.pos.z - this.pos.z) * push * 0.5;
      }
    }
    // Enter a car.
    if (input.consumeInteract()) {
      const car = G.vehicles.nearest(this.pos.x, this.pos.z, 4.2, (v) => !v.wrecked);
      if (car) {
        this.enterCar(car, G);
        G.hud.toast(car.type === 'taxi' ? 'Taxi — fares will find you' : `Stole a ${car.conf.label}`);
      } else {
        G.missions.tryInteract(G);
      }
    }
    // Walk-cycle animation.
    const swing = this.moving ? Math.sin(this.walkPhase) * (this.sprinting ? 0.85 : 0.6) : 0;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.4;
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = this.pos.y + (this.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0);
    this.mesh.rotation.y = this.heading;
  }

  _updateDriving(dt, G) {
    const input = G.input;
    if (input.consumeInteract()) {
      if (!this.exitCar()) G.hud.toast('Slow down to get out');
    }
    if (input.consumeHorn()) G.audio.horn();
    const v = this.vehicle;
    if (!v) return;
    this.pos.copy(v.pos);
    this.heading = v.heading;
    G.audio.setEngine(Math.abs(v.speed) / v.conf.topSpeed, true);
    // Running over pedestrians is a crime — and felt.
    for (const p of G.peds.peds) {
      if (!p.alive || p.state === 'enemy' || p.state === 'idle') continue;
      if (dist2(v.pos.x, v.pos.z, p.pos.x, p.pos.z) < 4.5 && Math.abs(v.speed) > 3) {
        p.kill(G);
        G.police.addWanted(1, 'ran over a pedestrian');
        G.fx.addShake(0.3);
        G.audio.crash();
      }
    }
  }
}
