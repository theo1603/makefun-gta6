// Menus and screens: start, pause, mission briefing, busted, wasted and the
// finale banner. Buttons call back into main.js through G.

import { PRICES } from './config.js';
import { hasSave } from './save.js';

export class UI {
  constructor(G) {
    this.G = G;
    const $ = (id) => document.getElementById(id);
    this.screens = {
      start: $('screen-start'),
      pause: $('screen-pause'),
      briefing: $('screen-briefing'),
      busted: $('screen-busted'),
      wasted: $('screen-wasted'),
    };
    this.finaleEl = $('finale-banner');
    this.briefTitle = $('brief-title');
    this.briefText = $('brief-text');
    this.briefReward = $('brief-reward');
    this.statsEl = $('pause-stats');
    this.bustedFine = $('busted-fine');
    this.wastedFine = $('wasted-fine');
    this.continueBtn = $('btn-continue');
    this._briefingAccept = null;
    this._briefingLater = null;
    this._finaleTimer = 0;

    $('btn-play').addEventListener('click', () => G.startGame(false));
    this.continueBtn.addEventListener('click', () => G.startGame(true));
    $('btn-resume').addEventListener('click', () => G.setMode('play'));
    $('btn-save').addEventListener('click', () => G.saveNow(true));
    $('btn-restart').addEventListener('click', () => G.restartGame());
    $('btn-quit-menu').addEventListener('click', () => G.setMode('menu'));
    $('btn-brief-start').addEventListener('click', () => {
      this.hideAll();
      if (this._briefingAccept) this._briefingAccept();
      G.setMode('play');
    });
    $('btn-brief-later').addEventListener('click', () => {
      this.hideAll();
      if (this._briefingLater) this._briefingLater();
      G.setMode('play');
    });
    $('btn-busted').addEventListener('click', () => G.respawnAfterBusted());
    $('btn-wasted').addEventListener('click', () => G.respawnAfterWasted());
    $('btn-mute').addEventListener('click', () => G.toggleMute());
    this.continueBtn.style.display = hasSave() ? 'inline-block' : 'none';
  }

  show(name) {
    this.hideAll();
    const el = this.screens[name];
    if (el) el.classList.add('show');
  }

  hideAll() {
    for (const el of Object.values(this.screens)) el.classList.remove('show');
  }

  showBriefing(def, onStart, onLater) {
    this.briefTitle.textContent = def.title;
    this.briefText.textContent = def.brief;
    const idx = this.G.missions.doneCount;
    this.briefReward.textContent = `Reward: $${PRICES.missionRewards[idx] || 0}`;
    this._briefingAccept = onStart;
    this._briefingLater = onLater;
    this.show('briefing');
    this.G.setMode('briefing');
  }

  showBusted(fine) {
    this.bustedFine.textContent = `The cops took $${fine} in fines.`;
    this.show('busted');
  }

  showWasted(fine) {
    this.wastedFine.textContent = `The hospital took $${fine}.`;
    this.show('wasted');
  }

  showFinale() {
    this.finaleEl.classList.add('show');
    this._finaleTimer = 7;
  }

  updatePauseStats() {
    const s = this.G.state;
    const m = this.G.missions;
    this.statsEl.innerHTML =
      `Cash $${s.cash.toLocaleString('en-US')} &nbsp;·&nbsp; ` +
      `Missions ${m.doneCount}/5 &nbsp;·&nbsp; ` +
      `Packages ${s.packages.size}/10 &nbsp;·&nbsp; ` +
      `Taxi fares ${s.taxiJobs} &nbsp;·&nbsp; ` +
      `Gulls down ${s.kills}`;
  }

  update(dt) {
    if (this._finaleTimer > 0) {
      this._finaleTimer -= dt;
      if (this._finaleTimer <= 0) this.finaleEl.classList.remove('show');
    }
  }
}
