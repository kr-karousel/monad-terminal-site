// Physics for Monad Climb.
//
// Core model (Getting-Over-It style):
//  - The player is a disc with position + velocity. Gravity pulls it down.
//  - The hammer is a rigid rod from the player centre to a "tip". The tip
//    follows the mouse, but is clamped to HAMMER_LEN from the player.
//  - If the mouse would push the tip into terrain, we shove the tip back out
//    along the nearest edge. The displacement we had to apply is translated
//    into a push on the player in the OPPOSITE direction — that is the
//    "leverage" that lets the player climb.
//
// All collisions are circle-vs-AABB (body) and point-vs-AABB (hammer tip).

const GRAVITY        = 1500;   // px/s²
const HAMMER_LEN     = 110;    // max distance from player to hammer tip
const HAMMER_MIN     = 30;     // min distance so you cannot retract into yourself
const LEVERAGE_POS   = 1.0;    // fraction of tip-correction transferred to player position
const LEVERAGE_VEL   = 11;     // velocity boost per unit displacement
const AIR_DRAG       = 0.998;
const FRICTION_TAN   = 0.20;   // tangential friction on body vs terrain
const RESTITUTION    = 0.15;   // tiny bounce on hard hits
const MAX_SPEED      = 2200;

function clampSpeed(p) {
  const s = Math.hypot(p.vx, p.vy);
  if (s > MAX_SPEED) {
    p.vx = p.vx / s * MAX_SPEED;
    p.vy = p.vy / s * MAX_SPEED;
  }
}

// Push the circle out of the AABB if overlapping. Adjusts position + velocity.
function resolveCircleRect(p, r) {
  const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  const R = p.radius;

  if (d2 >= R * R) return false;

  let nx, ny, pen;
  if (d2 === 0) {
    // Centre inside the rect: push out along the shallowest axis.
    const left   = p.x - r.x;
    const right  = r.x + r.w - p.x;
    const top    = p.y - r.y;
    const bottom = r.y + r.h - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === top)         { nx =  0; ny = -1; pen = top + R; }
    else if (m === bottom) { nx =  0; ny =  1; pen = bottom + R; }
    else if (m === left)   { nx = -1; ny =  0; pen = left + R; }
    else                   { nx =  1; ny =  0; pen = right + R; }
  } else {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    pen = R - d;
  }

  p.x += nx * pen;
  p.y += ny * pen;

  // Normal component of velocity: remove + tiny bounce.
  const vDotN = p.vx * nx + p.vy * ny;
  if (vDotN < 0) {
    p.vx -= vDotN * nx * (1 + RESTITUTION);
    p.vy -= vDotN * ny * (1 + RESTITUTION);
  }
  // Tangential friction.
  const tx = -ny, ty = nx;
  const vDotT = p.vx * tx + p.vy * ty;
  p.vx -= vDotT * tx * FRICTION_TAN;
  p.vy -= vDotT * ty * FRICTION_TAN;
  return true;
}

// If (px,py) is inside the AABB, return the minimum-translation vector to
// push it out; otherwise null.
function pushPointOutOfRect(px, py, r) {
  if (px <= r.x || px >= r.x + r.w || py <= r.y || py >= r.y + r.h) return null;
  const left   = px - r.x;
  const right  = r.x + r.w - px;
  const top    = py - r.y;
  const bottom = r.y + r.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === top)    return { x: 0, y: -top };
  if (m === bottom) return { x: 0, y: bottom };
  if (m === left)   return { x: -left, y: 0 };
  return { x: right, y: 0 };
}

// Compute the (clamped) hammer tip position given a desired target.
function clampHammer(px, py, tx, ty) {
  let dx = tx - px;
  let dy = ty - py;
  let d  = Math.hypot(dx, dy);
  if (d < 0.0001) { dx = 0; dy = 1; d = 1; }
  if (d > HAMMER_LEN) { const k = HAMMER_LEN / d; dx *= k; dy *= k; }
  else if (d < HAMMER_MIN) { const k = HAMMER_MIN / d; dx *= k; dy *= k; }
  return { x: px + dx, y: py + dy };
}

// Main per-frame update. mouseWorld = {x,y} in world coordinates.
function stepPlayer(player, mouseWorld, terrain, dt) {
  // 1. Gravity + drag.
  player.vy += GRAVITY * dt;
  player.vx *= AIR_DRAG;
  player.vy *= AIR_DRAG;
  clampSpeed(player);

  // 2. Integrate body.
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // 3. Body vs terrain.
  for (const r of terrain) resolveCircleRect(player, r);

  // 4. Desired hammer tip.
  let tip = clampHammer(player.x, player.y, mouseWorld.x, mouseWorld.y);

  // 5. Push tip out of terrain. Iterate a few times for stability across
  // overlapping rects (rare, but safe).
  let totalDx = 0, totalDy = 0;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const r of terrain) {
      const push = pushPointOutOfRect(tip.x, tip.y, r);
      if (push) {
        tip.x += push.x;
        tip.y += push.y;
        totalDx += push.x;
        totalDy += push.y;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // 6. Leverage: apply an opposite push on the player. The magnitude scales
  // with how hard we tried to shove the tip into the rock.
  if (totalDx !== 0 || totalDy !== 0) {
    const px = -totalDx * LEVERAGE_POS;
    const py = -totalDy * LEVERAGE_POS;
    player.x += px;
    player.y += py;
    // Only accelerate in the direction of the push (no stalling bounce).
    player.vx += px * LEVERAGE_VEL * dt * 60;   // scale roughly framerate-independent
    player.vy += py * LEVERAGE_VEL * dt * 60;
    clampSpeed(player);

    // Re-resolve body in case leverage pushed us into another wall.
    for (const r of terrain) resolveCircleRect(player, r);

    player.hammerAnchored = true;
  } else {
    player.hammerAnchored = false;
  }

  // 7. Final clamped tip position for rendering.
  const finalTip = clampHammer(player.x, player.y, tip.x, tip.y);
  player.hammerX = finalTip.x;
  player.hammerY = finalTip.y;
}

window.MonadPhysics = {
  GRAVITY, HAMMER_LEN, HAMMER_MIN,
  stepPlayer,
  resolveCircleRect,
  pushPointOutOfRect,
  clampHammer,
};
