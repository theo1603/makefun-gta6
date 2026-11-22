// Cars: a low-poly mesh builder, arcade driving physics, traffic AI that
// follows the road grid, and the police pursuit steering.

import * as THREE from 'three';
import { WORLD, CAR_TYPES, clamp, angleLerp, angleDiff, dist2 } from './config.js';

function buildCarMesh(type, color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const isSports = type === 'sports';
  const isVan = type === 'van';
  const bodyH = isSports ? 0.55 : isVan ? 1.3 : 0.7;
  const bodyY = isSports ? 0.5 : isVan ? 0.95 : 0.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, bodyH, 4.4), bodyMat);
  body.position.y = bodyY;
  group.add(body);
  if (!isVan) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, isSports ? 1.9 : 2.2),
      type === 'police'
        ? new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
        : glassMat);
    cabin.position.set(0, bodyY + bodyH / 2 + 0.3, isSports ? -0.3 : -0.2);
    group.add(cabin);
  } else {
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.15), glassMat);
    windshield.position.set(0, 1.35, 2.21);
    group.add(windshield);
  }
  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 1.8),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
    bed.position.set(0, 0.95, -1.3);
    group.add(bed);
  }
  if (isSports) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.4), bodyMat);
    spoiler.position.set(0, 1.05, -2.1);
    group.add(spoiler);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    sign.position.set(0, 1.55, -0.2);
    group.add(sign);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x887733 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xdd2222, emissive: 0x550000 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    hl.position.set(sx, 0.62, 2.21);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tl.position.set(sx, 0.62, -2.21);
    group.add(tl);
  }
  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(wx, 0.36, wz);
    group.add(w);
    wheels.push(w);
  }
  let lightBar = null;
  if (type === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xaa0000 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2050ff, emissive: 0x0022aa }));
    blue.position.x = 0.35;
    lightBar.add(red, blue);
    lightBar.position.y = 1.55;
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    group.add(lightBar);
  }
  return { group, wheels, lightBar };
}

export class Vehicle {
  constructor(scene, type, x, z, heading, color) {
    this.type = type;
    this.conf = CAR_TYPES[type];
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.wrecked = false;
    this.driver = null; // 'player' | 'traffic' | 'cop' | null (parked)
    this.smokeTimer = 0;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.target = null; // traffic waypoint {x, z}
    const { group, wheels, lightBar } = buildCarMesh(type, color);
    this.mesh = group;
    this.wheels = wheels;
    this.lightBar = lightBar;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
    this.mesh.traverse((m) => { if (m.isMesh) m.userData.vehicle = this; });
    scene.add(this.mesh);
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Arcade physics step. throttle -1..1, steer -1..1.
  drive(dt, throttle, steer, handbrake) {
    if (this.wrecked) {
      this.speed *= Math.max(0, 1 - 4 * dt);
      return;
    }
    const c = this.conf;
    const top = c.topSpeed;
    if (throttle > 0) this.speed += throttle * c.accel * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += throttle * c.brake * dt;
      else this.speed = Math.max(-9, this.speed + throttle * c.accel * 0.6 * dt);
    }
    // Drag and rolling resistance.
    this.speed -= this.speed * 0.35 * dt + Math.sign(this.speed) * this.speed * this.speed * 0.004 * dt;
    if (handbrake) this.speed -= this.speed * 2.2 * dt;
    this.speed = clamp(this.speed, -9, top);
    const turnAuthority = clamp(Math.abs(this.speed) / 5, 0, 1) * (handbrake ? 1.5 : 1);
    this.heading += steer * turnAuthority * 1.9 * Math.sign(this.speed || 1) * dt * (c.grip / 2.6);
    this.steer = steer;
    const f = this.forward;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
  }

  syncMesh(dt, time) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].rotation.x += spin;
      if (i < 2) this.wheels[i].rotation.y = this.steer * 0.38;
    }
    if (this.lightBar) {
      const phase = Math.floor(time * 6) % 2 === 0;
      this.lightBar.userData.red.material.emissiveIntensity = phase ? 2.2 : 0.2;
      this.lightBar.userData.blue.material.emissiveIntensity = phase ? 0.2 : 2.2;
    }
    // Wrecked cars sit dark and tilted.
    if (this.wrecked) this.mesh.rotation.z = 0.04;
  }

  damage(amount, G) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.wrecked = true;
      this.health = 0;
      this.speed = 0;
      this.mesh.traverse((m) => {
        if (m.isMesh && m.material && m.material.color) m.material.color.multiplyScalar(0.45);
      });
      if (G) {
        G.fx.explosion(this.pos.clone().add(new THREE.Vector3(0, 1, 0)));
        G.audio.explosion();
      }
    }
  }
}

export class VehicleManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.vehicles = [];
  }

  spawn(type, x, z, heading, color) {
    const c = color ?? this.rng.pick(CAR_TYPES[type].colors);
    const v = new Vehicle(this.scene, type, x, z, heading, c);
    this.vehicles.push(v);
    return v;
  }

  spawnParked() {
    const spots = [...this.city.parkingSpots, ...this.city.streetSpots];
    const types = ['sedan', 'sedan', 'van', 'pickup', 'sports', 'taxi'];
    for (const s of spots) {
      const v = this.spawn(this.rng.pick(types), s.x, s.z, s.heading);
      v.driver = null;
    }
    // The gold sports car for the finale waits at the Gull lot by the docks.
    const gold = this.spawn('sports', 204, -24, Math.PI / 2, 0xffc400);
    gold.driver = null;
    gold.isGoldCar = true;
    // A taxi idles by Mama Lou's so fares are easy to start.
    const taxi = this.spawn('taxi', -36, 96, Math.PI, 0xf2c200);
    taxi.driver = null;
  }

  spawnTraffic(count) {
    for (let i = 0; i < count; i++) {
      const road = this.rng.pick(WORLD.roads);
      const along = this.rng.range(-176, 176);
      const vertical = this.rng.chance(0.5);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const type = this.rng.pick(['sedan', 'sedan', 'van', 'pickup', 'taxi']);
      let x;
      let z;
      let heading;
      if (vertical) {
        x = road + (dir > 0 ? -3 : 3);
        z = along;
        heading = dir > 0 ? 0 : Math.PI;
      } else {
        x = along;
        z = road + (dir > 0 ? 3 : -3);
        heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      const v = this.spawn(type, x, z, heading);
      v.driver = 'traffic';
      v.cruise = this.rng.range(8, 12);
      v.axis = vertical ? 'z' : 'x';
      v.dir = dir;
      v.target = this._nextIntersection(v);
    }
  }

  // The next road crossing along this car's route, with its lane offset.
  _nextIntersection(v) {
    const roads = WORLD.roads;
    const pos = v.axis === 'z' ? v.pos.z : v.pos.x;
    const ahead = roads.filter((r) => (v.dir > 0 ? r > pos + 2 : r < pos - 2));
    if (ahead.length === 0) {
      // End of the road: turn around.
      v.dir *= -1;
      return this._nextIntersection(v);
    }
    const cross = v.dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
    const myRoad = v.axis === 'z' ? v.pos.x : v.pos.z;
    if (v.axis === 'z') return { x: myRoad, z: cross };
    return { x: cross, z: myRoad };
  }

  _turnAtIntersection(v) {
    // Straight, left or right — never a U-turn.
    const choice = this.rng.next();
    const vertical = v.axis === 'z';
    if (choice < 0.5) return; // straight on
    const turnLeft = choice < 0.75;
    if (vertical) {
      v.axis = 'x';
      v.dir = turnLeft ? -v.dir : v.dir;
      // Lane offset for the new road: right-hand side.
      v.pos.z += v.dir > 0 ? 3 - (v.pos.z - Math.round(v.pos.z / 44) * 44) * 0 : 0;
    } else {
      v.axis = 'z';
      v.dir = turnLeft ? v.dir : -v.dir;
    }
    v.target = this._nextIntersection(v);
  }

  nearest(x, z, maxDist, filter) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const v of this.vehicles) {
      if (filter && !filter(v)) continue;
      const d = dist2(x, z, v.pos.x, v.pos.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  update(dt, G, time) {
    const player = G.player;
    for (const v of this.vehicles) {
      if (v.wrecked) {
        v.drive(dt, 0, 0, false);
        v.syncMesh(dt, time);
        continue;
      }
      if (v.driver === 'player') {
        const axes = G.input.axes();
        const throttle = G.shots && G.shots.autoDrive ? 1 : axes.y;
        v.drive(dt, throttle, -axes.x, G.input.handbrake);
      } else if (v.driver === 'traffic') {
        this._updateTraffic(v, dt, G);
      } else if (v.driver === 'cop') {
        this._updateCop(v, dt, G);
      }
      // Buildings stop cars.
      const r = this.city.resolveCircle(v.pos.x, v.pos.z, 1.7);
      if (r.hit) {
        if (Math.abs(v.speed) > 4) {
          G.fx.sparks(v.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
          if (v.driver === 'player' || dist2(v.pos.x, v.pos.z, player.pos.x, player.pos.z) < 900) {
            G.audio.crash();
            if (v.driver === 'player') G.fx.addShake(0.3);
          }
          v.damage(Math.abs(v.speed) * 0.9, G);
          v.speed *= -0.25;
        } else {
          v.speed *= 0.4;
        }
        v.pos.x = r.x;
        v.pos.z = r.z;
      }
      // World bounds.
      v.pos.x = clamp(v.pos.x, WORLD.minX, WORLD.maxX);
      v.pos.z = clamp(v.pos.z, WORLD.minZ, WORLD.maxZ);
      // Smoke when damaged.
      if (v.health < 40) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = 0.25;
          G.fx.smoke(v.pos.clone().add(new THREE.Vector3(0, 1.4, 1.6)));
        }
      }
      v.syncMesh(dt, time);
    }
    // Car-to-car separation.
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const a = this.vehicles[i];
        const b = this.vehicles[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 12.5 && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const push = (3.6 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 5) {
            a.damage(rel * 0.5, G);
            b.damage(rel * 0.5, G);
            if (a.driver === 'player' || b.driver === 'player') {
              G.audio.crash();
              G.fx.addShake(0.35);
            }
          }
          a.speed *= 0.85;
          b.speed *= 0.85;
        }
      }
    }
  }

  _updateTraffic(v, dt, G) {
    const t = v.target;
    if (!t) {
      v.target = this._nextIntersection(v);
      return;
    }
    const dx = t.x - v.pos.x;
    const dz = t.z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      this._turnAtIntersection(v);
      v.target = this._nextIntersection(v);
      return;
    }
    const wantHeading = Math.atan2(dx, dz);
    const diff = angleDiff(v.heading, wantHeading);
    const steer = clamp(diff * 2.2, -1, 1);
    // Slow down for a car ahead.
    let throttle = 1;
    for (const o of this.vehicles) {
      if (o === v) continue;
      const odx = o.pos.x - v.pos.x;
      const odz = o.pos.z - v.pos.z;
      const od = Math.hypot(odx, odz);
      if (od < 9) {
        const f = v.forward;
        if ((odx * f.x + odz * f.z) / od > 0.7) { throttle = -0.6; break; }
      }
    }
    if (v.speed > v.cruise) throttle = Math.min(throttle, 0);
    v.drive(dt, throttle, steer, false);
  }

  _updateCop(v, dt, G) {
    const p = G.player;
    const target = p.inCar ? p.vehicle.pos : p.pos;
    const pvx = p.inCar ? p.vehicle.forward.x * p.vehicle.speed : 0;
    const pvz = p.inCar ? p.vehicle.forward.z * p.vehicle.speed : 0;
    const aimX = target.x + pvx * 0.45;
    const aimZ = target.z + pvz * 0.45;
    const dx = aimX - v.pos.x;
    const dz = aimZ - v.pos.z;
    const dist = Math.hypot(dx, dz);
    // Unstick: reverse briefly when wedged against a building.
    if (Math.abs(v.speed) < 1 && dist > 6) {
      v.stuckTimer += dt;
      if (v.stuckTimer > 1.4) {
        v.reverseTimer = 0.9;
        v.stuckTimer = 0;
      }
    } else {
      v.stuckTimer = 0;
    }
    if (v.reverseTimer > 0) {
      v.reverseTimer -= dt;
      v.drive(dt, -1, 0.7, false);
      return;
    }
    const wantHeading = Math.atan2(dx, dz);
    const diff = angleDiff(v.heading, wantHeading);
    const steer = clamp(diff * 2.4, -1, 1);
    const throttle = dist > 4 ? 1 : 0.4;
    v.drive(dt, throttle, steer, false);
  }
}
