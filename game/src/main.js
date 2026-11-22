// Solmar Bay — bootstrap and game loop. Builds every system, owns the mode
// state machine (menu / play / paused / briefing / busted / wasted) and
// drives the frame loop.

import * as THREE from 'three';
import { Random, readUrlParams } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { Effects } from './effects.js';
import { VehicleManager } from './vehicles.js';
import { PedManager } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { CameraRig } from './camera.js';
import { UI } from './ui.js';
import { ShotDirector } from './shots.js';
import { loadSave, writeSave, clearSave, snapshotGame, applySave } from './save.js';
import { WANTED_CONF } from './config.js';

function boot() {
  const params = readUrlParams();
  const rng = new Random(params.seed);

  // Renderer and scene.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // Staged screenshots render at half pixel ratio: the DOM HUD stays crisp
  // and software renderers settle far faster.
  renderer.setPixelRatio(params.shot ? 0.5 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0xcfe8f5, 140, 480);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 60, -130);

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
  sun.position.set(90, 140, 50);
  scene.add(sun);

  // The shared game context every system reads.
  const G = {
    scene, camera, renderer, rng, params,
    mode: 'menu',
    time: 0,
    state: { cash: 200, health: 100, wanted: 0, packages: new Set(), taxiJobs: 0, kills: 0 },
  };

  G.input = new Input();
  G.audio = new AudioEngine();
  G.city = new City(scene, rng.fork());
  G.fx = new Effects(scene);
  G.vehicles = new VehicleManager(scene, G.city, rng.fork());
  G.vehicles.spawnParked();
  G.vehicles.spawnTraffic(14);
  G.peds = new PedManager(scene, G.city, rng.fork());
  G.peds.spawnWalkers(36);
  G.player = new Player(scene);
  G.police = new Police(G);
  G.combat = new Combat(scene);
  G.missions = new Missions(scene);
  G.hud = new Hud(G);
  G.cam = new CameraRig(camera);
  G.shots = new ShotDirector();
  G.ui = new UI(G);

  // ---- mode machine -------------------------------------------------------
  G.setMode = function (mode) {
    const prev = G.mode;
    G.mode = mode;
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.display = (mode === 'menu') ? 'none' : 'block';
    if (mode === 'menu') {
      G.ui.show('start');
      G.audio.setEngine(0, false);
      G.audio.setSiren(0);
    } else if (mode === 'paused') {
      G.ui.updatePauseStats();
      G.ui.show('pause');
    } else if (mode === 'play') {
      if (prev === 'paused' || prev === 'briefing' || prev === 'menu') G.ui.hideAll();
    } else if (mode === 'busted') {
      const fine = Math.min(G.state.cash, WANTED_CONF.bustFine);
      G.state.cash -= fine;
      G.police.clearWanted();
      G.missions.fail(G, 'busted by the cops');
      G.audio.setSiren(0);
      G.ui.showBusted(fine);
    } else if (mode === 'wasted') {
      const fine = Math.min(G.state.cash, WANTED_CONF.wastedFine);
      G.state.cash -= fine;
      G.police.clearWanted();
      G.missions.fail(G, 'wasted');
      G.audio.setSiren(0);
      G.ui.showWasted(fine);
    }
  };

  G.startGame = function (fromSave) {
    G.audio.unlock();
    G.audio.startMusic();
    if (fromSave) {
      const data = loadSave();
      if (data) {
        applySave(G, data);
        G.hud.toast('Save loaded — welcome back to Solmar Bay');
      }
    }
    G.missions._refreshObjective(G);
    G.setMode('play');
  };

  G.respawnAfterBusted = function () {
    G.player.resetToSpawn();
    G.state.health = 100;
    G.setMode('play');
    G.hud.toast('Released. Mama Lou is waiting.');
  };

  G.respawnAfterWasted = function () {
    G.player.resetToSpawn();
    G.state.health = 100;
    G.setMode('play');
    G.hud.toast('Patched up. Get back out there.');
  };

  G.saveNow = function (announce) {
    if (writeSave(snapshotGame(G))) {
      if (announce) G.hud.toast('Progress saved');
    } else if (announce) {
      G.hud.toast('Could not save (storage unavailable)');
    }
  };

  G.restartGame = function () {
    clearSave();
    window.location.reload();
  };

  G.toggleMute = function () {
    G.audio.setMuted(!G.audio.muted);
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = G.audio.muted ? '🔇 Sound off' : '🔊 Sound on';
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- staged screenshots -------------------------------------------------
  if (params.shot) {
    G.setMode('play');
    G.ui.hideAll();
    G.shots.stage(G, params.shot);
  } else {
    G.setMode('menu');
  }

  window.__solmar = G;

  // ---- frame loop ---------------------------------------------------------
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    G.time += dt;

    if (G.input.consumeMute()) G.toggleMute();
    if (G.input.consumePause()) {
      if (G.mode === 'play') G.setMode('paused');
      else if (G.mode === 'paused') G.setMode('play');
    }

    if (G.mode === 'play') {
      G.player.update(dt, G);
      if (G.input.consumeShoot() && !G.player.inCar) G.combat.playerShoot(G);
      G.combat.update(dt, G);
      G.vehicles.update(dt, G, G.time);
      G.peds.update(dt, G, G.time);
      G.police.update(dt, G);
      G.missions.update(dt, G);
    } else if (G.mode === 'menu') {
      // A living city behind the start screen.
      G.vehicles.update(dt, G, G.time);
      G.peds.update(dt, G, G.time);
    }
    G.city.update(dt, G.time);
    G.fx.update(dt);
    G.cam.update(dt, G);
    if (G.mode !== 'menu') G.hud.update(dt, G);
    G.ui.update(dt);
    if (G.shots.active) G.shots.tick(G);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  boot();
} catch (err) {
  const el = document.getElementById('load-error');
  if (el) {
    el.style.display = 'block';
    el.textContent = `Solmar Bay could not start: ${err && err.message ? err.message : err}`;
  }
  throw err;
}
