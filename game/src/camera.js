// Third-person orbit camera: mouse-drag orbit, wheel zoom, a gentle
// auto-align behind the car at speed, FOV kick, shake and a menu orbit.

import * as THREE from 'three';
import { clamp, lerp, angleLerp } from './config.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // view direction; PI looks north from the spawn
    this.pitch = 0.32;
    this.distance = 9;
    this.target = new THREE.Vector3(0, 1.5, 0);
    this.pos = new THREE.Vector3(0, 8, -12);
    this.kickPitch = 0;
    this.shotOverride = null; // {yaw, pitch, distance} for staged screenshots
    this.menuAngle = 0;
  }

  // A fixed framing for a staged screenshot; the camera still tracks the player.
  setShot(yaw, pitch, distance) {
    this.shotOverride = { yaw, pitch, distance };
  }

  // A small upward jolt, e.g. when firing.
  kick(amount) { this.kickPitch += amount; }

  update(dt, G) {
    const input = G.input;
    if (G.mode === 'menu') {
      this.menuAngle += dt * 0.03;
      const cx = Math.sin(this.menuAngle) * 130;
      const cz = Math.cos(this.menuAngle) * 130;
      this.camera.position.set(cx, 55, cz);
      this.camera.lookAt(0, 4, 0);
      return;
    }
    if (this.shotOverride) {
      this.yaw = this.shotOverride.yaw;
      this.pitch = this.shotOverride.pitch;
      this.distance = this.shotOverride.distance;
    } else {
      const look = input.consumeLook();
      this.yaw -= look.dx * 0.0042;
      this.pitch = clamp(this.pitch + look.dy * 0.003, 0.06, 1.1);
      this.distance = clamp(this.distance + input.consumeWheel() * 0.005, 5.5, 16);
      // At speed in a car, drift the camera behind the car's heading.
      const player = G.player;
      if (player.inCar && player.vehicle && Math.abs(player.vehicle.speed) > 6 && look.dx === 0) {
        this.yaw = angleLerp(this.yaw, player.vehicle.heading, Math.min(1, dt * 1.2));
      }
      if (player.inCar) this.distance = lerp(this.distance, 11.5, Math.min(1, dt * 2));
      else this.distance = lerp(this.distance, 8.5, Math.min(1, dt * 2));
    }
    this.kickPitch = Math.max(0, this.kickPitch - dt * 0.06);
    const pitch = this.pitch + this.kickPitch;
    const player = G.player;
    const target = this.target;
    target.set(player.pos.x, player.pos.y + 1.7, player.pos.z);
    const viewX = Math.sin(this.yaw) * Math.cos(pitch);
    const viewZ = Math.cos(this.yaw) * Math.cos(pitch);
    const viewY = Math.sin(pitch);
    const want = new THREE.Vector3(
      target.x - viewX * this.distance,
      target.y + viewY * this.distance,
      target.z - viewZ * this.distance,
    );
    // Keep the camera out of buildings and above the ground.
    const r = G.city.resolveCircle(want.x, want.z, 1);
    want.x = r.x;
    want.z = r.z;
    want.y = Math.max(1.2, want.y);
    const snap = this.shotOverride ? 1 : Math.min(1, dt * 10);
    this.pos.lerp(want, snap);
    // Screen shake.
    const shake = G.fx.shakeOffset(dt);
    this.camera.position.set(this.pos.x + shake.x, this.pos.y + shake.y, this.pos.z);
    this.camera.lookAt(target.x, target.y, target.z);
    // FOV widens with speed.
    const speed01 = player.inCar && player.vehicle
      ? Math.abs(player.vehicle.speed) / player.vehicle.conf.topSpeed : 0;
    const fov = 62 + speed01 * 12;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov = lerp(this.camera.fov, fov, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }
}
