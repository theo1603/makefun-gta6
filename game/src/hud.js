// The HUD: wanted stars, cash, health, speed, the canvas minimap, objective
// line, timer, toasts and the damage vignette. All DOM except the minimap.

import { WORLD } from './config.js';

const MAP_SIZE = 180;
const WORLD_MIN = -200;
const WORLD_SPAN = 450; // -200 .. 250

export class Hud {
  constructor(G) {
    this.G = G;
    const $ = (id) => document.getElementById(id);
    this.starsEl = $('hud-stars');
    this.cashEl = $('hud-cash');
    this.healthFill = $('hud-health-fill');
    this.healthWrap = $('hud-health');
    this.speedEl = $('hud-speed');
    this.objectiveEl = $('hud-objective');
    this.timerEl = $('hud-timer');
    this.toastEl = $('hud-toast');
    this.bustEl = $('hud-bust');
    this.bustFill = $('hud-bust-fill');
    this.vignetteEl = $('hud-vignette');
    this.crosshairEl = $('hud-crosshair');
    this.minimap = $('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.damage = 0;
    this.toastTimer = 0;
    this.objectiveText = '';
  }

  setObjective(text) {
    if (text !== this.objectiveText) {
      this.objectiveText = text;
      this.objectiveEl.textContent = text;
    }
  }

  setTimer(seconds) {
    if (seconds > 0) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      this.timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      this.timerEl.classList.toggle('urgent', seconds < 15);
      this.timerEl.style.display = 'block';
    } else {
      this.timerEl.style.display = 'none';
    }
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = 3.5;
  }

  clearToasts() {
    this.toastEl.classList.remove('show');
    this.toastTimer = 0;
  }

  flashDamage() { this.damage = Math.min(1, this.damage + 0.55); }

  flashStars() {
    this.starsEl.classList.remove('pulse');
    void this.starsEl.offsetWidth; // restart the animation
    this.starsEl.classList.add('pulse');
  }

  setBustProgress(p) {
    if (p > 0) {
      this.bustEl.style.display = 'block';
      this.bustFill.style.width = `${Math.round(p * 100)}%`;
    } else {
      this.bustEl.style.display = 'none';
    }
  }

  _mapX(x) { return ((x - WORLD_MIN) / WORLD_SPAN) * MAP_SIZE; }
  _mapZ(z) { return ((z - WORLD_MIN) / WORLD_SPAN) * MAP_SIZE; }

  drawMinimap(G) {
    const c = this.mapCtx;
    c.fillStyle = '#0e1a24';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Ocean (south + east) and beach.
    c.fillStyle = '#1e8fc0';
    c.fillRect(0, this._mapZ(WORLD.oceanZ), MAP_SIZE, MAP_SIZE - this._mapZ(WORLD.oceanZ));
    c.fillRect(this._mapX(WORLD.oceanX), 0, MAP_SIZE - this._mapX(WORLD.oceanX), MAP_SIZE);
    c.fillStyle = '#e8d5a3';
    c.fillRect(0, this._mapZ(WORLD.beachZ), MAP_SIZE, this._mapZ(WORLD.oceanZ) - this._mapZ(WORLD.beachZ));
    // Ground.
    c.fillStyle = '#2a3d2a';
    c.fillRect(0, 0, this._mapX(WORLD.oceanX), this._mapZ(WORLD.beachZ));
    // Roads.
    c.strokeStyle = '#5a6068';
    c.lineWidth = 4;
    for (const r of WORLD.roads) {
      c.beginPath(); c.moveTo(this._mapX(r), 0); c.lineTo(this._mapX(r), this._mapZ(WORLD.beachZ)); c.stroke();
      c.beginPath(); c.moveTo(0, this._mapZ(r)); c.lineTo(this._mapX(WORLD.oceanX), this._mapZ(r)); c.stroke();
    }
    // Buildings.
    c.fillStyle = '#8a8478';
    for (const b of G.city.buildings) {
      c.fillRect(this._mapX(b.x - b.w / 2), this._mapZ(b.z - b.d / 2),
        (b.w / WORLD_SPAN) * MAP_SIZE, (b.d / WORLD_SPAN) * MAP_SIZE);
    }
    // Docks apron.
    c.fillStyle = '#6a6a62';
    c.fillRect(this._mapX(WORLD.dockX0), this._mapZ(WORLD.dockZ0),
      ((WORLD.dockX1 - WORLD.dockX0) / WORLD_SPAN) * MAP_SIZE,
      ((WORLD.dockZ1 - WORLD.dockZ0) / WORLD_SPAN) * MAP_SIZE);
    // Blips.
    for (const b of G.missions.blips(G)) {
      const x = this._mapX(b.x);
      const y = this._mapZ(b.z);
      c.fillStyle = b.color;
      if (b.shape === 'diamond') {
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillRect(-4, -4, 8, 8);
        c.restore();
      } else if (b.shape === 'M') {
        c.font = 'bold 11px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('M', x, y);
      } else {
        c.beginPath();
        c.arc(x, y, b.shape === 'circle' ? 4 : 3, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Player arrow, rotated to the heading.
    const p = G.player.pos;
    const px = this._mapX(p.x);
    const py = this._mapZ(p.z);
    c.save();
    c.translate(px, py);
    // The arrow is drawn pointing up (north); rotate it onto the heading.
    c.rotate(Math.PI - G.player.heading);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#111111';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  update(dt, G) {
    const s = G.state;
    // Stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    if (this.starsEl.textContent !== stars) this.starsEl.textContent = stars;
    this.starsEl.classList.toggle('wanted', s.wanted > 0);
    // Cash and health.
    const cash = `$${s.cash.toLocaleString('en-US')}`;
    if (this.cashEl.textContent !== cash) this.cashEl.textContent = cash;
    const hp = Math.round(s.health);
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.classList.toggle('low', hp < 30);
    // Speed.
    if (G.player.inCar) {
      this.speedEl.style.display = 'block';
      this.speedEl.textContent = `${Math.round(G.player.speedKmh)} km/h`;
    } else {
      this.speedEl.style.display = 'none';
    }
    // Crosshair only on foot.
    this.crosshairEl.style.display = (!G.player.inCar && G.mode === 'play') ? 'block' : 'none';
    // Toast fade.
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    // Damage vignette decay.
    if (this.damage > 0) {
      this.damage = Math.max(0, this.damage - dt * 0.8);
      this.vignetteEl.style.opacity = String(this.damage * 0.75);
    } else {
      this.vignetteEl.style.opacity = '0';
    }
    this.drawMinimap(G);
  }
}
