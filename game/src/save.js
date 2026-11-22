// Save / load through localStorage. Only progress and the player's position
// are stored; the world itself is rebuilt deterministically from the seed.

const SAVE_KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// Snapshot the parts of the game worth keeping between sessions.
export function snapshotGame(G) {
  return {
    version: 1,
    savedAt: Date.now(),
    cash: G.state.cash,
    health: G.state.health,
    missionsDone: G.missions.doneCount,
    packages: [...G.state.packages],
    taxiJobs: G.state.taxiJobs,
    kills: G.state.kills,
    pos: { x: G.player.pos.x, z: G.player.pos.z, heading: G.player.heading },
  };
}

export function applySave(G, data) {
  if (typeof data.cash === 'number') G.state.cash = data.cash;
  if (typeof data.health === 'number') G.state.health = data.health;
  if (typeof data.missionsDone === 'number') G.missions.doneCount = data.missionsDone;
  if (Array.isArray(data.packages)) G.state.packages = new Set(data.packages);
  if (typeof data.taxiJobs === 'number') G.state.taxiJobs = data.taxiJobs;
  if (typeof data.kills === 'number') G.state.kills = data.kills;
  if (data.pos) {
    G.player.pos.set(data.pos.x || 0, 0, data.pos.z || 0);
    G.player.heading = data.pos.heading || 0;
  }
}
