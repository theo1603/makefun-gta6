// Pistol combat: a hitscan shot from the camera's crosshair, tracers and
// muzzle flash, damage to people and cars, and the Gulls shooting back.

import * as THREE from 'three';
import { clamp, dist2 } from './config.js';

const PED_DAMAGE = 34;
const ENEMY_DAMAGE = 50;
const CAR_DAMAGE = 12;

export class Combat {
  constructor(scene) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
    this.cooldown = 0;
    this.center = new THREE.Vector2(0, 0);
  }

  get ready() { return this.cooldown <= 0; }

  // The player fires the pistol. Returns true when a shot went off.
  playerShoot(G) {
    if (this.cooldown > 0 || G.player.inCar) return false;
    this.cooldown = 0.22;
    const player = G.player;
    const camera = G.camera;
    this.raycaster.setFromCamera(this.center, camera);
    const targets = [];
    for (const p of G.peds.peds) if (p.alive) targets.push(p.mesh);
    for (const v of G.vehicles.vehicles) targets.push(v.mesh);
    targets.push(G.city.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    const muzzle = player.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
    let end;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      const what = this._identify(hit.object);
      if (what.ped) this._hitPed(what.ped, G, hit.point);
      else if (what.vehicle) this._hitVehicle(what.vehicle, G, hit.point);
      else G.fx.sparks(hit.point);
    } else {
      end = this.raycaster.ray.at(90, new THREE.Vector3());
    }
    G.fx.tracer(muzzle, end);
    G.fx.muzzleFlash(muzzle);
    G.audio.shoot();
    G.peds.scare(player.pos.x, player.pos.z, 35, G.time);
    G.police.addWanted(1, 'firing a weapon in public');
    G.cam.kick(0.012);
    return true;
  }

  _identify(object) {
    let o = object;
    while (o) {
      if (o.userData.ped) return { ped: o.userData.ped };
      if (o.userData.vehicle) return { vehicle: o.userData.vehicle };
      o = o.parent;
    }
    return {};
  }

  _hitPed(ped, G, point) {
    G.fx.bloodPuff(point);
    if (ped.state === 'enemy') {
      ped.health -= ENEMY_DAMAGE;
      if (ped.health <= 0) {
        ped.kill(G);
        G.state.kills += 1;
        G.hud.toast('Gull down');
        G.missions.onEnemyKilled(G);
      }
    } else {
      ped.health -= PED_DAMAGE;
      if (ped.health <= 0) {
        ped.kill(G);
        G.police.addWanted(1, 'a civilian is down');
      } else {
        ped.state = 'flee';
        ped.fleeFrom = { x: G.player.pos.x, z: G.player.pos.z };
        ped.fleeUntil = G.time + 5;
      }
    }
  }

  _hitVehicle(vehicle, G, point) {
    G.fx.sparks(point);
    vehicle.damage(CAR_DAMAGE, G);
  }

  // Gulls shoot at the player when he is close enough to see.
  update(dt, G) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const player = G.player;
    if (player.inCar) return;
    for (const e of G.peds.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      if (d2 > 3600) continue; // beyond 60 m they hold fire
      e.mesh.lookAt(player.pos.x, 1.4, player.pos.z);
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.1 + Math.random() * 0.9;
        const from = e.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
        const dist = Math.sqrt(d2);
        const hitChance = clamp(0.42 - dist * 0.004, 0.1, 0.42);
        const hit = Math.random() < hitChance;
        const to = hit
          ? player.pos.clone().add(new THREE.Vector3(0, 1.1, 0))
          : player.pos.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 4, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 4));
        G.fx.tracer(from, to);
        G.fx.muzzleFlash(from, 0xffaa55, 0.9);
        G.audio.enemyShoot();
        if (hit) player.damage(8 + Math.random() * 6, G);
      }
    }
  }
}
