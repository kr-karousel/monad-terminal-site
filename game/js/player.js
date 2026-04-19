// Player creation + rendering (procedural Monad mascot).
//
// We draw the character on a tiny offscreen canvas once, then blit it — this
// avoids re-rasterising spikes every frame and lets us rotate cheaply.

const PLAYER_RADIUS = 26;

function createPlayer(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,
    radius: PLAYER_RADIUS,
    hammerX: x,
    hammerY: y - 100,
    hammerAnchored: false,
    sprite: null,
  };
}

// Draw a simple stylised Monad-mascot head (purple, round, spikes on top,
// two big eyes, little smile). Returns an offscreen canvas.
function buildSprite() {
  const size = PLAYER_RADIUS * 2 + 24;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const c = off.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r  = PLAYER_RADIUS;

  // Spikes (drawn behind head).
  c.fillStyle = '#3a1a6e';
  const spikes = 9;
  for (let i = 0; i < spikes; i++) {
    const t = i / (spikes - 1); // 0..1 across the top arc
    const angle = -Math.PI + t * Math.PI; // -π .. 0  (top half)
    const bx = cx + Math.cos(angle) * r * 0.95;
    const by = cy + Math.sin(angle) * r * 0.95;
    const tipLen = 14 + Math.sin(t * Math.PI) * 10;
    const tipAngle = angle;
    const tipX = cx + Math.cos(tipAngle) * (r + tipLen);
    const tipY = cy + Math.sin(tipAngle) * (r + tipLen);
    const wPerp = 6;
    const pAngle = tipAngle + Math.PI / 2;
    const b1x = bx + Math.cos(pAngle) * wPerp * 0.5;
    const b1y = by + Math.sin(pAngle) * wPerp * 0.5;
    const b2x = bx - Math.cos(pAngle) * wPerp * 0.5;
    const b2y = by - Math.sin(pAngle) * wPerp * 0.5;
    c.beginPath();
    c.moveTo(b1x, b1y);
    c.lineTo(tipX, tipY);
    c.lineTo(b2x, b2y);
    c.closePath();
    c.fill();
  }

  // Head (purple gradient).
  const grad = c.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, r);
  grad.addColorStop(0, '#a07bff');
  grad.addColorStop(1, '#6030d8');
  c.fillStyle = grad;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();

  // Face patch (lighter).
  c.fillStyle = '#efe2ff';
  c.beginPath();
  c.ellipse(cx, cy + 4, r * 0.72, r * 0.56, 0, 0, Math.PI * 2);
  c.fill();

  // Eyes.
  c.fillStyle = '#1a0a2e';
  c.beginPath(); c.arc(cx - 7, cy,     3.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx + 7, cy,     3.2, 0, Math.PI * 2); c.fill();
  // Eye glints.
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(cx - 6, cy - 1, 1.1, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx + 8, cy - 1, 1.1, 0, Math.PI * 2); c.fill();

  // Smile.
  c.strokeStyle = '#40204a';
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(cx, cy + 6, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();

  // Cheek blush.
  c.fillStyle = 'rgba(255, 120, 160, 0.28)';
  c.beginPath(); c.arc(cx - 11, cy + 4, 3.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx + 11, cy + 4, 3.2, 0, Math.PI * 2); c.fill();

  return off;
}

function drawPlayer(ctx, player) {
  if (!player.sprite) player.sprite = buildSprite();
  const sprite = player.sprite;

  // Body angle: lean slightly based on horizontal velocity.
  const lean = Math.max(-0.35, Math.min(0.35, player.vx * 0.0015));

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(lean);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  ctx.restore();
}

function drawHammer(ctx, player) {
  // Rod from body edge (toward tip) to tip.
  const dx = player.hammerX - player.x;
  const dy = player.hammerY - player.y;
  const d  = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const startX = player.x + nx * (player.radius - 4);
  const startY = player.y + ny * (player.radius - 4);

  // Shaft.
  ctx.lineCap = 'round';
  ctx.strokeStyle = player.hammerAnchored ? '#d4b36a' : '#a88546';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(player.hammerX, player.hammerY);
  ctx.stroke();

  // Hammer head (perpendicular block at tip).
  const px = -ny;
  const py =  nx;
  const hw = 18;   // half-width of the head along shaft
  const hh = 14;   // half-thickness perpendicular
  const tx = player.hammerX;
  const ty = player.hammerY;

  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(Math.atan2(ny, nx));
  ctx.fillStyle = player.hammerAnchored ? '#f4d27a' : '#2a2a34';
  ctx.strokeStyle = '#0c0c12';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-6, -hh, hw + 6, hh * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Anchor glow.
  if (player.hammerAnchored) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 28);
    g.addColorStop(0, 'rgba(244,210,122,0.6)');
    g.addColorStop(1, 'rgba(244,210,122,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Suppress unused vars for px/py — kept for future tip-cap shading.
  void px; void py;
}

window.MonadPlayer = { createPlayer, drawPlayer, drawHammer, PLAYER_RADIUS };
