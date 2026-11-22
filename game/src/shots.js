// Staged screenshots: ?shot=<name>&seed=1 sets up a deterministic scene,
// lets it settle for a few seconds, then raises window.__shotReady so the
// screenshot script knows the frame is ready.
//
//   cover   — 3-star police chase in a sports car, mission objective on HUD
//   drive   — downtown cruise with traffic
//   mission — the dock shootout, mid-fight
//   onfoot  — a busy sidewalk on foot

import { MISSION_DEFS } from './missions.js';
import { Ped } from './pedestrians.js';

const SETTLE_SECONDS = 1.2; // of game time, so slow software renderers still settle

export class ShotDirector {
  constructor() {
    this.name = '';
    this.settleUntil = 0;
    this.ready = false;
    this.autoDrive = false; // staged cars hold the throttle on their own
  }

  get active() { return this.name !== ''; }

  stage(G, name) {
    this.name = name;
    this.settleUntil = G.time + SETTLE_SECONDS;
    const P = G.player;
    const V = G.vehicles;
    if (name === 'cover') {
      // Sports car tearing down the beach boulevard, three patrol cars in pursuit.
      const car = V.spawn('sports', 0, -20, 0, 0xd8232a);
      car.speed = 24;
      P.enterCar(car, G);
      G.state.wanted = 3;
      G.police.lastCrimeAt = G.time;
      const copSpots = [[-3, -42], [3, -54], [-2, -68]];
      for (const [x, z] of copSpots) {
        const cop = V.spawn('police', x, z, 0);
        cop.driver = 'cop';
        cop.speed = 26;
        G.police.cops.push(cop);
      }
      // A couple of traffic cars ahead for depth.
      const t1 = V.spawn('sedan', -3, 40, 0);
      t1.driver = 'traffic'; t1.cruise = 10; t1.axis = 'z'; t1.dir = 1;
      t1.target = V._nextIntersection(t1);
      const t2 = V.spawn('van', 44, -60, Math.PI / 2);
      t2.driver = 'traffic'; t2.cruise = 9; t2.axis = 'x'; t2.dir = 1;
      t2.target = V._nextIntersection(t2);
      // Mission 2 in progress: the objective line shows on the HUD.
      G.missions.active = {
        def: MISSION_DEFS[1], index: 1, step: 1, timer: 0,
        targetCar: car, enemiesLeft: 0,
      };
      G.missions._refreshObjective(G);
      G.cam.setShot(Math.PI - 0.35, 0.3, 13.5);
      this.autoDrive = true;
    } else if (name === 'drive') {
      const car = V.spawn('sedan', -44, 0, Math.PI / 2, 0x304080);
      car.speed = 16;
      P.enterCar(car, G);
      const t1 = V.spawn('taxi', -20, 3, Math.PI / 2);
      t1.driver = 'traffic'; t1.cruise = 11; t1.axis = 'x'; t1.dir = 1;
      t1.target = V._nextIntersection(t1);
      const t2 = V.spawn('pickup', -70, -3, -Math.PI / 2);
      t2.driver = 'traffic'; t2.cruise = 10; t2.axis = 'x'; t2.dir = -1;
      t2.target = V._nextIntersection(t2);
      const t3 = V.spawn('van', 0, -60, 0);
      t3.driver = 'traffic'; t3.cruise = 9; t3.axis = 'z'; t3.dir = 1;
      t3.target = V._nextIntersection(t3);
      G.missions._refreshObjective(G);
      G.cam.setShot(Math.PI / 2, 0.3, 11.5);
      this.autoDrive = true;
    } else if (name === 'mission') {
      // Mid-fight at the docks: two Gulls already down, four still shooting.
      G.missions.active = {
        def: MISSION_DEFS[3], index: 3, step: 1, timer: 0,
        targetCar: null, enemiesLeft: 4,
      };
      const spots = [[200, -30], [220, 10], [232, -10], [196, 20], [210, 35], [228, 30]];
      const enemies = spots.map(([x, z]) => G.peds.spawnEnemy(x, z));
      enemies[0].kill(G);
      enemies[2].kill(G);
      enemies[0].deadTimer = 60;
      enemies[2].deadTimer = 60;
      for (const e of enemies) e.shootTimer = 0.2 + Math.random() * 0.5;
      P.pos.set(206, 0, 14);
      P.heading = Math.PI * 0.85;
      P.mesh.position.copy(P.pos);
      P.mesh.rotation.y = P.heading;
      G.missions._refreshObjective(G);
      G.cam.setShot(Math.PI * 0.85, 0.26, 7.5);
    } else if (name === 'onfoot') {
      // On foot at Mama Lou's plaza: pedestrians, the cafe and a taxi passing.
      P.pos.set(-30, 0, 74);
      P.heading = Math.PI * 0.95;
      P.mesh.position.copy(P.pos);
      P.mesh.rotation.y = P.heading;
      const lineE = G.city.sidewalkLines.find((l) => l.axis === 'z' && l.fixed === -36.5);
      const lineW = G.city.sidewalkLines.find((l) => l.axis === 'z' && l.fixed === -51.5);
      const spots = [
        [lineE, -36.5, 62], [lineE, -36.5, 72], [lineE, -36.5, 82],
        [lineW, -51.5, 66], [lineW, -51.5, 76], [lineW, -51.5, 86],
      ];
      spots.forEach(([line, x, z], i) => {
        const extra = new Ped(G.scene, x, z, 0, {
          shirt: [0xe04040, 0x40a0e0, 0xf2d020, 0x40c080, 0x9040c0, 0xf2f2f2][i],
          pants: 0x2a3a5a, skin: 0xf2c8a0, speed: 1.6, route: line, dir: i % 2 ? 1 : -1,
        });
        G.peds.peds.push(extra);
      });
      const taxi = V.spawn('taxi', -47, 40, 0);
      taxi.driver = 'traffic'; taxi.cruise = 11; taxi.axis = 'z'; taxi.dir = 1;
      taxi.target = V._nextIntersection(taxi);
      G.missions._refreshObjective(G);
      G.cam.setShot(-Math.PI / 2, 0.3, 9);
    }
    G.hud.clearToasts();
    G.hud.setObjective(G.missions.active
      ? G.hud.objectiveText
      : 'Go see Mama Lou (yellow M) for work');
  }

  tick(G) {
    if (!this.active || this.ready) return;
    if (G.time >= this.settleUntil) {
      this.ready = true;
      window.__shotReady = true;
      document.title = `Solmar Bay — shot ${this.name} ready`;
    }
  }
}
