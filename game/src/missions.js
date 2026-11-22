// Story missions for fixer Mama Lou against the rival Gulls crew, repeatable
// taxi fares, and the ten hidden packages. One mission at a time; each step
// is a target with a beacon, a minimap blip and a HUD objective line.

import * as THREE from 'three';
import { MAMA_LOU, HIDEOUT, DOCKS, PRICES, dist2 } from './config.js';
import { writeSave, snapshotGame } from './save.js';

export const MISSION_DEFS = [
  {
    title: 'First Drop',
    brief: 'Mama Lou needs two parcels moved across town, no questions asked. Drop the first at the downtown bank, the second at the beach kiosk, then report back.',
    steps: [
      { type: 'goto', label: 'Drop the parcel at the downtown bank', x: 88, z: -88, radius: 7 },
      { type: 'goto', label: 'Drop the second parcel at the beach kiosk', x: 132, z: 200, radius: 7 },
      { type: 'goto', label: 'Report back to Mama Lou', x: MAMA_LOU.x, z: MAMA_LOU.z, radius: 8 },
    ],
  },
  {
    title: 'Hot Wheels',
    brief: 'The Gulls parked a cherry-red sports car in the lot on 2nd. Take it — and when the heat shows up, lose them at the Hideout garage.',
    steps: [
      { type: 'steal', label: 'Steal the red sports car from the lot', x: 22, z: -22, radius: 9, spawnCar: 'sports', carColor: 0xd8232a },
      { type: 'goto', label: 'Lose the cops — reach the Hideout', x: HIDEOUT.x, z: HIDEOUT.z, radius: 9 },
    ],
  },
  {
    title: 'Timed Drop',
    brief: 'Three drops, two and a half minutes. Mama Lou is paying double for speed — miss the clock and the deal is dead.',
    timer: 150,
    steps: [
      { type: 'goto', label: 'Drop 1 of 3 — north docks gate', x: 176, z: -176, radius: 8 },
      { type: 'goto', label: 'Drop 2 of 3 — west plaza', x: -176, z: -176, radius: 8 },
      { type: 'goto', label: 'Drop 3 of 3 — beach boulevard', x: 0, z: 176, radius: 8 },
    ],
  },
  {
    title: 'Dock Shootout',
    brief: 'The Gulls took the docks and they are not leaving on their own. Clear all six of them out, then come home. Bring the pistol.',
    steps: [
      { type: 'goto', label: 'Get to the Solmar Docks', x: DOCKS.x, z: DOCKS.z, radius: 12 },
      { type: 'eliminate', label: 'Clear the docks — Gulls left: 6', x: DOCKS.x, z: DOCKS.z, count: 6 },
      { type: 'goto', label: 'Report back to Mama Lou', x: MAMA_LOU.x, z: MAMA_LOU.z, radius: 8 },
    ],
  },
  {
    title: 'The Big Steal',
    brief: 'One last job. The Gulls keep a gold sports car in their lot by the docks, guarded around the clock. Take it, outrun the whole city, and park it at the Hideout. Do this and Solmar Bay is yours.',
    steps: [
      { type: 'goto', label: 'Reach the Gull lot by the docks', x: 204, z: -24, radius: 12 },
      { type: 'steal', label: 'Steal the gold sports car', x: 204, z: -24, radius: 9, goldCar: true },
      { type: 'goto', label: 'Deliver the gold car to the Hideout', x: HIDEOUT.x, z: HIDEOUT.z, radius: 9 },
    ],
  },
];

const DOCK_GULLS = [
  [200, -30], [220, 10], [232, -10], [196, 20], [210, 35], [228, 30],
];
const LOT_GULLS = [[196, -30], [210, -16], [198, -14], [214, -32]];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.doneCount = 0;
    this.active = null; // {def, index, step, timer, targetCar, enemiesLeft}
    this.briefingCooldownUntil = 0;
    this.fare = null; // {ped, dest, timer, state}
    this.fareCooldownUntil = 0;
    // The mission beacon: a glowing pillar marking the current target.
    this.beacon = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.75 }));
    ring.position.y = 0.2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 20;
    this.beacon.add(ring, beam);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.beaconColor = 0xffd94a;
  }

  get allDone() { return this.doneCount >= MISSION_DEFS.length; }
  get nextDef() { return this.allDone ? null : MISSION_DEFS[this.doneCount]; }

  setBeacon(x, z, color = 0xffd94a, visible = true) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = visible;
    this.beacon.children.forEach((c) => c.material.color.set(color));
  }

  // The player pressed E near something interactive.
  tryInteract(G) {
    if (!this.active && !this.allDone && G.time > this.briefingCooldownUntil) {
      const d2 = dist2(G.player.pos.x, G.player.pos.z, MAMA_LOU.x, MAMA_LOU.z);
      if (d2 < 100) {
        G.ui.showBriefing(this.nextDef, () => this.start(G), () => {
          this.briefingCooldownUntil = G.time + 6;
        });
        return;
      }
    }
  }

  start(G) {
    const def = this.nextDef;
    if (!def) return;
    this.active = { def, index: this.doneCount, step: 0, timer: def.timer || 0, targetCar: null, enemiesLeft: 0 };
    G.audio.missionJingle();
    G.hud.toast(`Mission: ${def.title}`);
    this._enterStep(G);
  }

  _enterStep(G) {
    const m = this.active;
    const step = m.def.steps[m.step];
    if (!step) {
      this.complete(G);
      return;
    }
    if (step.type === 'steal' && step.spawnCar) {
      m.targetCar = G.vehicles.spawn(step.spawnCar, step.x, step.z, 0, step.carColor);
      m.targetCar.driver = null;
    }
    if (step.type === 'steal' && step.goldCar) {
      m.targetCar = G.vehicles.vehicles.find((v) => v.isGoldCar) || null;
    }
    if (step.type === 'eliminate') {
      m.enemiesLeft = step.count;
      for (const [x, z] of DOCK_GULLS.slice(0, step.count)) G.peds.spawnEnemy(x, z);
    }
    if (m.index === 4 && m.step === 0) {
      for (const [x, z] of LOT_GULLS) G.peds.spawnEnemy(x, z);
    }
    this._refreshObjective(G);
  }

  _refreshObjective(G) {
    const m = this.active;
    if (!m) {
      G.hud.setObjective(this.allDone
        ? 'King of Solmar Bay — free roam, taxi fares and packages await'
        : 'Go see Mama Lou (yellow M) for work');
      this.setBeacon(MAMA_LOU.x, MAMA_LOU.z, 0xffd94a, !this.allDone);
      return;
    }
    const step = m.def.steps[m.step];
    let label = step.label;
    if (step.type === 'eliminate') label = `Clear the docks — Gulls left: ${m.enemiesLeft}`;
    G.hud.setObjective(`${m.def.title}: ${label}`);
    G.hud.setTimer(m.def.timer ? m.timer : 0);
    this.setBeacon(step.x, step.z, 0xffd94a, true);
  }

  onEnemyKilled(G) {
    const m = this.active;
    if (!m) return;
    const step = m.def.steps[m.step];
    if (step && step.type === 'eliminate') {
      m.enemiesLeft = Math.max(0, m.enemiesLeft - 1);
      this._refreshObjective(G);
      if (m.enemiesLeft === 0) this._advance(G);
    }
  }

  _advance(G) {
    const m = this.active;
    m.step += 1;
    G.audio.pickup();
    this._enterStep(G);
  }

  complete(G) {
    const m = this.active;
    const reward = PRICES.missionRewards[m.index] || 0;
    G.state.cash += reward;
    this.doneCount += 1;
    this.active = null;
    G.audio.cashRegister();
    G.hud.toast(`Mission complete — +$${reward}`);
    if (this.allDone) {
      G.ui.showFinale();
      G.hud.toast('KING OF SOLMAR BAY');
    }
    writeSave(snapshotGame(G));
    this._refreshObjective(G);
  }

  fail(G, reason) {
    if (!this.active) return;
    this.active = null;
    G.audio.missionFail();
    G.hud.toast(`Mission failed — ${reason}`);
    // Clear mission-spawned enemies so the docks go quiet again.
    for (const e of [...G.peds.enemies]) G.peds.removePed(e);
    this._refreshObjective(G);
  }

  update(dt, G) {
    const player = G.player;
    // Mission marker beacon when idle.
    if (!this.active) {
      if (!this.allDone) this.setBeacon(MAMA_LOU.x, MAMA_LOU.z, 0xffd94a, true);
      else this.setBeacon(0, 0, 0xffd94a, false);
    }
    const m = this.active;
    if (m) {
      const step = m.def.steps[m.step];
      if (m.def.timer) {
        m.timer -= dt;
        G.hud.setTimer(Math.max(0, m.timer));
        if (m.timer <= 0) {
          this.fail(G, 'the clock ran out');
          return;
        }
      }
      if (step.type === 'goto') {
        const inCar = step.label.includes('Hideout') ? true : false;
        const reach = dist2(player.pos.x, player.pos.z, step.x, step.z) < step.radius * step.radius;
        if (reach && (!inCar || player.inCar || true)) {
          if (m.index === 1 && m.step === 1) G.police.clearWanted();
          if (m.index === 4 && m.step === 2) G.police.clearWanted();
          this._advance(G);
        }
      } else if (step.type === 'steal') {
        if (player.inCar && player.vehicle === m.targetCar) {
          if (m.index === 1) G.police.addWanted(2, 'the Gulls called it in');
          if (m.index === 4) G.police.addWanted(3, 'every unit in the city is coming');
          this._advance(G);
        } else if (m.targetCar && m.targetCar.wrecked) {
          this.fail(G, 'the target car is wrecked');
        }
      }
    }
    this._updateTaxi(dt, G);
    this._updatePackages(G);
  }

  // Taxi fares: only while driving a taxi and not on a mission step.
  _updateTaxi(dt, G) {
    const player = G.player;
    const inTaxi = player.inCar && player.vehicle && player.vehicle.type === 'taxi';
    if (!this.fare && inTaxi && !this.active && G.time > this.fareCooldownUntil) {
      // A fare appears on a nearby sidewalk.
      const line = G.rng.pick(G.city.sidewalkLines);
      const along = G.rng.range(line.from + 10, line.to - 10);
      const x = line.axis === 'z' ? line.fixed : along;
      const z = line.axis === 'z' ? along : line.fixed;
      if (dist2(x, z, player.pos.x, player.pos.z) > 10000) return; // too far away
      const ped = G.peds.spawnFare(x, z);
      this.fare = { ped, dest: null, timer: 0, state: 'waiting' };
      G.hud.toast('Taxi fare waiting (green blip)');
    }
    if (!this.fare) return;
    const fare = this.fare;
    if (!inTaxi) {
      if (fare.state === 'riding') {
        G.hud.toast('Fare cancelled — you left the cab');
        this._endFare(G, false);
      }
      return;
    }
    if (fare.state === 'waiting') {
      if (dist2(player.pos.x, player.pos.z, fare.ped.pos.x, fare.ped.pos.z) < 49) {
        G.peds.removePed(fare.ped);
        const dest = this._randomDestination(G);
        fare.dest = dest;
        fare.timer = Math.hypot(dest.x - player.pos.x, dest.z - player.pos.z) / 11 + 25;
        fare.state = 'riding';
        G.hud.toast('Fare aboard — get them there fast for a tip');
        G.audio.pickup();
      }
    } else if (fare.state === 'riding') {
      fare.timer -= dt;
      G.hud.setTimer(Math.max(0, fare.timer));
      if (dist2(player.pos.x, player.pos.z, fare.dest.x, fare.dest.z) < 64) {
        const tip = Math.round((fare.timer / 60) * PRICES.taxiTipMax);
        const pay = PRICES.taxiBase + Math.max(0, tip);
        G.state.cash += pay;
        G.state.taxiJobs += 1;
        G.audio.cashRegister();
        G.hud.toast(`Fare complete — +$${pay}`);
        writeSave(snapshotGame(G));
        this._endFare(G, true);
      } else if (fare.timer <= 0) {
        G.hud.toast('Too slow — the fare walked');
        this._endFare(G, false);
      }
    }
  }

  _randomDestination(G) {
    const road = G.rng.pick([-132, -44, 44, 132]);
    const along = G.rng.range(-150, 150);
    return G.rng.chance(0.5) ? { x: road, z: along } : { x: along, z: road };
  }

  _endFare(G, done) {
    if (this.fare && this.fare.ped && this.fare.state === 'waiting') {
      G.peds.removePed(this.fare.ped);
    }
    this.fare = null;
    this.fareCooldownUntil = G.time + (done ? 4 : 8);
    if (!this.active) G.hud.setTimer(0);
  }

  _updatePackages(G) {
    const player = G.player;
    for (const m of G.city.packageMarkers) {
      if (G.state.packages.has(m.index)) continue;
      if (dist2(player.pos.x, player.pos.z, m.x, m.z) < 6.25) {
        G.state.packages.add(m.index);
        G.state.cash += PRICES.packageReward;
        G.audio.pickup();
        G.fx.pickupBurst(m.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
        m.group.visible = false;
        G.hud.toast(`Hidden package ${G.state.packages.size}/10 — +$${PRICES.packageReward}`);
        writeSave(snapshotGame(G));
      }
    }
  }

  // Blips for the minimap: mission target, fare, enemies, cops.
  blips(G) {
    const out = [];
    if (this.active) {
      const step = this.active.def.steps[this.active.step];
      if (step) out.push({ x: step.x, z: step.z, color: '#ffd94a', shape: 'diamond' });
    } else if (!this.allDone) {
      out.push({ x: MAMA_LOU.x, z: MAMA_LOU.z, color: '#ffd94a', shape: 'M' });
    }
    if (this.fare) {
      if (this.fare.state === 'waiting') {
        out.push({ x: this.fare.ped.pos.x, z: this.fare.ped.pos.z, color: '#40e080', shape: 'circle' });
      } else if (this.fare.dest) {
        out.push({ x: this.fare.dest.x, z: this.fare.dest.z, color: '#40e080', shape: 'diamond' });
      }
    }
    for (const e of G.peds.enemies) {
      if (e.alive) out.push({ x: e.pos.x, z: e.pos.z, color: '#ff4040', shape: 'dot' });
    }
    for (const cop of G.police.cops) {
      out.push({ x: cop.pos.x, z: cop.pos.z, color: '#4090ff', shape: 'dot' });
    }
    for (const m of G.city.packageMarkers) {
      if (!G.state.packages.has(m.index)) {
        out.push({ x: m.x, z: m.z, color: '#ff5fd0', shape: 'dot' });
      }
    }
    return out;
  }
}
