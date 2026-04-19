// Level layout for Monad Climb.
//
// World coordinates: x is horizontal (center = 0), y is vertical and grows
// DOWNWARD (canvas convention). "Up" in the game = smaller y.
//
// Player spawns near y = 0. Summit is at the top (very negative y).
//
// A sector is a vertical band of height SECTOR_HEIGHT. Its flag sits near the
// top edge of that band. Reaching the flag = clearing that sector.

const WORLD_HALF_WIDTH = 420;   // play area: x ∈ [-420, +420]
const SECTOR_HEIGHT    = 460;   // vertical size of one sector
const TOTAL_SECTORS    = 8;
const GROUND_Y         = 80;    // top of the ground
const GROUND_THICKNESS = 300;

// Helper builders
function rect(x, y, w, h, opts = {}) {
  return { x, y, w, h, kind: 'rect', ...opts };
}

// Build terrain: list of axis-aligned rectangles. Includes side walls that
// extend the full world height so the player can wedge against them.
function buildTerrain() {
  const t = [];
  const topY = -SECTOR_HEIGHT * TOTAL_SECTORS - 200;

  // Ground
  t.push(rect(-WORLD_HALF_WIDTH, GROUND_Y, WORLD_HALF_WIDTH * 2, GROUND_THICKNESS));
  // Side walls
  t.push(rect(-WORLD_HALF_WIDTH - 400, topY, 400, -topY + GROUND_Y + GROUND_THICKNESS));
  t.push(rect(WORLD_HALF_WIDTH,        topY, 400, -topY + GROUND_Y + GROUND_THICKNESS));

  // Per-sector platform layouts. Each entry is [dx, dyFromSectorTop, w, h].
  // dyFromSectorTop: 0 = flag line (top of sector), positive = below the flag.
  // Higher-numbered sectors are harder: more overhangs, smaller ledges.
  const layouts = [
    // Sector 1: gentle staircase
    [
      [-260, 360,  180, 24],
      [ 120, 310,  160, 24],
      [-160, 230,  140, 22],
      [ 160, 160,  140, 22],
      [ -80,  80,  180, 22],
    ],
    // Sector 2: zig-zag with a big rock
    [
      [ 220, 380,  140, 26],
      [-280, 330,  120, 24],
      [ -40, 260,  100, 60],   // pillar
      [ 240, 200,  120, 22],
      [-220, 140,  140, 22],
      [  60,  70,  120, 22],
    ],
    // Sector 3: overhangs
    [
      [-320, 380,  160, 20],
      [ 100, 340,  220, 22],
      [-180, 260,   90, 90],   // block
      [ 280, 240,   80, 20],
      [ -60, 160,  200, 20],
      [-300,  80,  180, 20],
    ],
    // Sector 4: diagonal ledges
    [
      [ 260, 400,  130, 22],
      [  60, 340,  120, 20],
      [-160, 290,  110, 20],
      [-320, 220,  140, 20],
      [-120, 150,  100, 20],
      [ 120,  90,  120, 20],
    ],
    // Sector 5: tall column + gaps
    [
      [-250, 380,  150, 22],
      [ 140, 340,  140, 22],
      [  20, 240,   70, 120],  // column
      [ 260, 200,  120, 20],
      [-260, 160,  140, 20],
      [ -60,  70,  160, 20],
    ],
    // Sector 6: thin ledges
    [
      [ 220, 400,  110, 16],
      [  40, 350,   90, 16],
      [-160, 300,   90, 16],
      [-300, 240,  100, 16],
      [-120, 190,   80, 16],
      [ 140, 140,  100, 16],
      [ 280,  80,  100, 16],
    ],
    // Sector 7: split path
    [
      [-320, 400,  200, 18],
      [ 150, 360,  200, 18],
      [-240, 280,  120, 18],
      [ 100, 270,  110, 18],
      [-100, 180,  100, 60],   // floating block
      [ 240, 160,  110, 18],
      [-240,  90,  140, 18],
      [  80,  80,  140, 18],
    ],
    // Sector 8 (summit): spire
    [
      [ 220, 400,  140, 20],
      [-240, 350,  140, 20],
      [  40, 280,  120, 20],
      [-180, 210,  110, 20],
      [ 180, 150,  110, 20],
      [ -40,  90,  120, 24],
    ],
  ];

  for (let s = 0; s < TOTAL_SECTORS; s++) {
    const sectorTop = -SECTOR_HEIGHT * (s + 1);
    const group = layouts[s] || [];
    for (const [dx, dy, w, h] of group) {
      t.push(rect(dx - w / 2, sectorTop + dy, w, h, { sector: s + 1 }));
    }
  }

  return t;
}

// Place each sector's flag on top of that sector's highest (smallest-y)
// non-wall platform, so the flag always sits on a reachable ledge.
function buildFlags(terrain) {
  const flags = [];
  for (let s = 1; s <= TOTAL_SECTORS; s++) {
    let best = null;
    for (const r of terrain) {
      if (r.sector !== s) continue;
      if (!best || r.y < best.y) best = r;
    }
    if (!best) continue;
    flags.push({
      sector: s,
      x: best.x + best.w / 2,
      y: best.y - 30,     // 30 px above the platform surface (pole bottom sits on it)
      radius: 40,
    });
  }
  return flags;
}

window.MonadLevel = {
  WORLD_HALF_WIDTH,
  SECTOR_HEIGHT,
  TOTAL_SECTORS,
  GROUND_Y,
  GROUND_THICKNESS,
  buildTerrain,
  buildFlags,
};
