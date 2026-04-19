// Physics engine — Getting Over It faithful pivot model.
//
// MECHANIC:
//   • Character body is a circle (the cauldron).
//   • One arm (shoulder → hand) is controlled by the mouse.
//   • Arm direction = atan2(mouse − shoulder), length = ARM_LEN.
//   • Each frame: compute target hand position.
//   • If hand lands inside terrain → push it to the nearest surface → PIVOT.
//   • New shoulder = pivot − arm_direction × ARM_LEN.
//   • Body shifts so shoulder reaches new position (pure lever constraint).
//   • When hand is free, normal gravity + Euler integration.

const GRAVITY      = 1100;   // px / s²
const ARM_LEN      = 130;    // shoulder → hand
const SHOULDER_OY  = -22;    // shoulder above body centre (negative = up)
const BODY_RADIUS  = 26;
const AIR_DRAG     = 0.993;
const RESTITUTION  = 0.08;
const FRICTION_TAN = 0.18;
const MAX_SPEED    = 2600;
const VEL_CARRY    = 0.72;   // velocity fraction carried into free flight

function clampSpeed(b) {
  const s = Math.hypot(b.vx, b.vy);
  if (s > MAX_SPEED) { b.vx = b.vx / s * MAX_SPEED; b.vy = b.vy / s * MAX_SPEED; }
}

// Push circle (b.x, b.y, radius=BODY_RADIUS) out of an AABB.
function resolveCircleRect(b, rect) {
  const R = BODY_RADIUS;
  const cx = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
  const dx = b.x - cx, dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= R * R) return false;

  let nx, ny, pen;
  if (d2 < 1e-6) {
    const l = b.x - rect.x, r = rect.x + rect.w - b.x;
    const t = b.y - rect.y, bt = rect.y + rect.h - b.y;
    const m = Math.min(l, r, t, bt);
    if (m === t)       { nx =  0; ny = -1; pen = t  + R; }
    else if (m === bt) { nx =  0; ny =  1; pen = bt + R; }
    else if (m === l)  { nx = -1; ny =  0; pen = l  + R; }
    else               { nx =  1; ny =  0; pen = r  + R; }
  } else {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d; pen = R - d;
  }

  b.x += nx * pen; b.y += ny * pen;

  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= vn * nx * (1 + RESTITUTION);
    b.vy -= vn * ny * (1 + RESTITUTION);
  }
  const tx = -ny, ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  b.vx -= vt * tx * FRICTION_TAN;
  b.vy -= vt * ty * FRICTION_TAN;
  return true;
}

// Push a POINT out of an AABB. Returns correction vector or null.
function pushPointOut(px, py, rect) {
  if (px <= rect.x || px >= rect.x + rect.w ||
      py <= rect.y || py >= rect.y + rect.h) return null;
  const l = px - rect.x, r = rect.x + rect.w - px;
  const t = py - rect.y, bt = rect.y + rect.h - py;
  const m = Math.min(l, r, t, bt);
  if (m === t)  return { x: 0,  y: -t  };
  if (m === bt) return { x: 0,  y:  bt };
  if (m === l)  return { x: -l, y:  0  };
                return { x:  r, y:  0  };
}

// Ray-vs-AABB segment intersection.
// Walks the segment (sx,sy)→(tx,ty) and finds the FIRST hit on rect.
// Returns { t, nx, ny, hx, hy } where t∈[0,1] is the parametric distance
// along the segment, (nx,ny) is the outward normal of the hit face, and
// (hx,hy) is the entry point (just outside the surface).
function segmentVsRect(sx, sy, tx, ty, rect) {
  const dx = tx - sx, dy = ty - sy;
  const eps = 1e-6;
  const x1 = rect.x, y1 = rect.y;
  const x2 = rect.x + rect.w, y2 = rect.y + rect.h;

  // Slab test.
  let tmin = 0, tmax = 1;
  let nx = 0, ny = 0;

  // X slab
  if (Math.abs(dx) < eps) {
    if (sx < x1 || sx > x2) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (x1 - sx) * inv;
    let t2 = (x2 - sx) * inv;
    let nEnter = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; nEnter = 1; }
    if (t1 > tmin) { tmin = t1; nx = nEnter; ny = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Y slab
  if (Math.abs(dy) < eps) {
    if (sy < y1 || sy > y2) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (y1 - sy) * inv;
    let t2 = (y2 - sy) * inv;
    let nEnter = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; nEnter = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = nEnter; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (tmin < 0 || tmin > 1) return null;

  return {
    t: tmin,
    nx, ny,
    hx: sx + dx * tmin,
    hy: sy + dy * tmin,
  };
}

// One physics substep. Returns render info.
function stepPlayer(body, mouseWorld, terrain, dt) {
  // Shoulder position.
  const shX = body.x;
  const shY = body.y + SHOULDER_OY;

  // Arm angle toward mouse.
  const armAngle = Math.atan2(mouseWorld.y - shY, mouseWorld.x - shX);
  const cosA = Math.cos(armAngle), sinA = Math.sin(armAngle);

  // Target hand position (at full arm length).
  const fullTipX = shX + cosA * ARM_LEN;
  const fullTipY = shY + sinA * ARM_LEN;

  // Cast the arm segment from shoulder outward. Find the FIRST surface
  // the arm crosses — that's the contact point (correct face).
  let bestT = Infinity;
  let bestHit = null;
  for (const r of terrain) {
    const hit = segmentVsRect(shX, shY, fullTipX, fullTipY, r);
    if (hit && hit.t < bestT) { bestT = hit.t; bestHit = hit; }
  }

  let tipX, tipY;
  let anchored = false;

  if (bestHit) {
    // Arm hits a surface. Place tip at the contact point (just outside it).
    tipX = bestHit.hx + bestHit.nx * 0.5;
    tipY = bestHit.hy + bestHit.ny * 0.5;

    // ── PIVOT MECHANIC ───────────────────────────────────────────────────
    // Hand is anchored. New shoulder = pivot − arm_dir × ARM_LEN.
    const newShX = tipX - cosA * ARM_LEN;
    const newShY = tipY - sinA * ARM_LEN;
    const dX = newShX - shX;
    const dY = newShY - shY;
    body.x += dX;
    body.y += dY;
    // Carry velocity for when hand lifts off.
    body.vx = dX / dt * VEL_CARRY;
    body.vy = dY / dt * VEL_CARRY;
    clampSpeed(body);
    anchored = true;
  } else {
    // No contact — hand at full extension, free fall.
    tipX = fullTipX;
    tipY = fullTipY;
    body.vy += GRAVITY * dt;
    body.vx *= AIR_DRAG;
    body.vy *= AIR_DRAG;
    clampSpeed(body);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
  }

  // Resolve body circle vs all terrain (both modes).
  for (const r of terrain) resolveCircleRect(body, r);

  return { armAngle, hammerX: tipX, hammerY: tipY, anchored };
}

window.MonadPhysics = {
  GRAVITY, ARM_LEN, SHOULDER_OY, BODY_RADIUS,
  stepPlayer, resolveCircleRect, pushPointOut, segmentVsRect,
};
