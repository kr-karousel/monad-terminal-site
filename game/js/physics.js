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

// One physics substep. Returns render info.
function stepPlayer(body, mouseWorld, terrain, dt) {
  // Shoulder position.
  const shX = body.x;
  const shY = body.y + SHOULDER_OY;

  // Arm angle toward mouse.
  const armAngle = Math.atan2(mouseWorld.y - shY, mouseWorld.x - shX);

  // Target hand position.
  let tipX = shX + Math.cos(armAngle) * ARM_LEN;
  let tipY = shY + Math.sin(armAngle) * ARM_LEN;

  // Push hand out of terrain.
  let anyHit = false;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const r of terrain) {
      const push = pushPointOut(tipX, tipY, r);
      if (push) { tipX += push.x; tipY += push.y; moved = true; anyHit = true; }
    }
    if (!moved) break;
  }

  let anchored = false;

  if (anyHit) {
    // ── PIVOT MECHANIC ───────────────────────────────────────────────────
    // Hand is on a surface. New shoulder = surface_point − arm_dir × ARM_LEN.
    const newShX = tipX - Math.cos(armAngle) * ARM_LEN;
    const newShY = tipY - Math.sin(armAngle) * ARM_LEN;
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
    // ── FREE FLIGHT ──────────────────────────────────────────────────────
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
  stepPlayer, resolveCircleRect, pushPointOut,
};
