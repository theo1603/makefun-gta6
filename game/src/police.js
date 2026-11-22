// The wanted system: stars rise with crimes, patrol cars hunt the player,
// and a slow on-foot player caught by a cop is busted.

import { WORLD, WANTED_CONF, clamp, dist2 } from './config.js';

export class Police {
  constructor(G) {
    this.G = G;
    this.cops = []; // patrol Vehicles chasing the player
    this.lastCrimeAt = -999;
    this.unseenTimer = 0;
    this.bustTimer = 0;
    this.bustedAt = -99;
  }

  get wanted() { return this.G.state.wanted; }
  set wanted(n) { this.G.state.wanted = clamp(n, 0, WANTED_CONF.maxStars); }

  addWanted(n, reason) {
    if (n <= 0 || this.wanted >= WANTED_CONF.maxStars) return;
    this.wanted = this.wanted + n;
    this.lastCrimeAt = this.G.time;
    this.unseenTimer = 0;
    if (reason) this.G.hud.toast(`Wanted level ${this.wanted} — ${reason}`);
    this.G.hud.flashStars();
  }

  clearWanted() {
    this.wanted = 0;
    this.bustTimer = 0;
    for (const cop of this.cops) cop.driver = null;
    this.cops = [];
  }

  nearestCopDistance(pos) {
    let best = Infinity;
    for (const cop of this.cops) {
      const d = Math.hypot(cop.pos.x - pos.x, cop.pos.z - pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  _spawnCop() {
    const G = this.G;
    const p = G.player.pos;
    // Find a road point 60–110 m from the player.
    for (let tries = 0; tries < 20; tries++) {
      const road = G.rng.pick(WORLD.roads);
      const along = G.rng.range(-176, 176);
      const vertical = G.rng.chance(0.5);
      const x = vertical ? road : along;
      const z = vertical ? along : road;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 55 && d < 120) {
        const heading = Math.atan2(p.x - x, p.z - z);
        const cop = G.vehicles.spawn('police', x, z, heading);
        cop.driver = 'cop';
        this.cops.push(cop);
        return;
      }
    }
  }

  update(dt, G) {
    const player = G.player;
    // Keep the pursuit sized to the wanted level.
    while (this.cops.length < this.wanted) this._spawnCop();
    while (this.cops.length > this.wanted) {
      const cop = this.cops.pop();
      cop.driver = null;
    }
    // Drop wrecked cops from the pursuit.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      if (this.cops[i].wrecked) this.cops.splice(i, 1);
    }
    // Wanted decay: unseen for a while and the heat fades one star at a time.
    if (this.wanted > 0) {
      const nearest = this.nearestCopDistance(player.pos);
      if (nearest > 70 && G.time - this.lastCrimeAt > 8) {
        this.unseenTimer += dt;
        if (this.unseenTimer > WANTED_CONF.decaySeconds) {
          this.unseenTimer = 0;
          this.wanted = this.wanted - 1;
          if (this.wanted === 0) {
            G.hud.toast('You lost the cops');
            this.clearWanted();
          } else {
            G.hud.toast(`Heat dropping — ${this.wanted} star${this.wanted > 1 ? 's' : ''}`);
          }
        }
      } else {
        this.unseenTimer = 0;
      }
    }
    // Busted: on foot, a cop right on top of you, and you are barely moving.
    if (this.wanted > 0 && !player.inCar) {
      const nearest = this.nearestCopDistance(player.pos);
      if (nearest < WANTED_CONF.bustDistance && !player.moving) {
        this.bustTimer += dt;
        G.hud.setBustProgress(this.bustTimer / WANTED_CONF.bustSeconds);
        if (this.bustTimer >= WANTED_CONF.bustSeconds) {
          this.bustTimer = 0;
          G.setMode('busted');
        }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
        G.hud.setBustProgress(0);
      }
    } else {
      this.bustTimer = 0;
      G.hud.setBustProgress(0);
    }
    // Siren volume follows the nearest pursuit car.
    const nearest = this.nearestCopDistance(player.pos);
    const level = this.cops.length === 0 ? 0 : clamp(1 - nearest / 120, 0.15, 1);
    G.audio.setSiren(this.wanted > 0 ? level : 0);
  }
}
