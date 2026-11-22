// Solmar Bay — shared constants and tuning for every system.
// All world units are metres; +x is east, +z is south (toward the beach).

export const WORLD = {
  // Nine roads each way, 44 m apart, 12 m wide.
  roads: [-176, -132, -88, -44, 0, 44, 88, 132, 176],
  roadWidth: 12,
  spacing: 44,
  // Playable bounds (invisible walls).
  minX: -196, maxX: 244, minZ: -196, maxZ: 244,
  beachZ: 188, // sand starts here (south edge of the city)
  oceanZ: 250, // waterline, south
  oceanX: 250, // waterline, east (the bay)
  dockX0: 184, dockX1: 246, dockZ0: -46, dockZ1: 46,
};

export const SPAWN = { x: -30, z: 74, heading: Math.PI }; // Mama Lou's plaza
export const MAMA_LOU = { x: -44, z: 88, label: "Mama Lou's Cafe" };
export const HIDEOUT = { x: -110, z: -110, label: 'Hideout Garage' };
export const DOCKS = { x: 214, z: 0, label: 'Solmar Docks' };

// Ten hidden packages, fixed spots so the hunt is fair.
export const PACKAGE_SPOTS = [
  { x: -150, z: 210, hint: 'behind the beach lifeguard hut' },
  { x: 120, z: 226, hint: 'by the southernmost umbrella' },
  { x: 232, z: -38, hint: 'on the far pier' },
  { x: 200, z: 30, hint: 'between the dock containers' },
  { x: -66, z: -66, hint: 'in the park, by the big tree' },
  { x: 22, z: 22, hint: 'downtown alley, behind the bank' },
  { x: 110, z: -110, hint: 'north parking lot, back row' },
  { x: -154, z: -20, hint: 'west plaza fountain' },
  { x: 66, z: 154, hint: 'beach boardwalk kiosk' },
  { x: -22, z: -154, hint: 'north park bandstand' },
];

export const PLAYER_CONF = {
  walkSpeed: 6, sprintSpeed: 10.5, accel: 40, jumpSpeed: 8.5,
  gravity: 22, radius: 0.7, maxHealth: 100, regenDelay: 10, regenRate: 6,
};

export const CAR_TYPES = {
  sedan:  { label: 'Sedan',    topSpeed: 26, accel: 14, brake: 30, grip: 2.6, colors: [0xb03030, 0x304080, 0xdadada, 0x303030] },
  taxi:   { label: 'Taxi',     topSpeed: 24, accel: 13, brake: 30, grip: 2.6, colors: [0xf2c200] },
  police: { label: 'Patrol',   topSpeed: 30, accel: 17, brake: 34, grip: 3.0, colors: [0x1c2733] },
  sports: { label: 'Sports',   topSpeed: 38, accel: 22, brake: 36, grip: 3.4, colors: [0xd8232a, 0x22a0d8, 0xf2f2f2, 0xffc400] },
  van:    { label: 'Van',      topSpeed: 20, accel: 10, brake: 26, grip: 2.2, colors: [0xe8e8e8, 0x7a5a2e, 0x3a6a4a] },
  pickup: { label: 'Pickup',   topSpeed: 24, accel: 13, brake: 28, grip: 2.5, colors: [0x8a2f2f, 0x2f5a8a, 0x4a4a4a] },
};

export const WANTED_CONF = {
  maxStars: 5,
  decaySeconds: 22,      // one star fades after this long unseen
  bustDistance: 5.5,     // cop this close to a slow on-foot player...
  bustSeconds: 2.5,      // ...for this long and you are busted
  bustFine: 100, wastedFine: 150,
};

export const PRICES = {
  packageReward: 50, taxiBase: 25, taxiTipMax: 35,
  missionRewards: [150, 300, 400, 600, 1000],
};

export const SHOT_NAMES = ['cover', 'drive', 'mission', 'onfoot'];

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
// Shortest-arc interpolation between two headings (radians).
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
