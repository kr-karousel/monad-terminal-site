// CHOG character renderer.
//
// CHOG sits inside a round cauldron (pot). The body + head stick out of the
// top. One arm reaches toward the mouse and acts as the climbing tool.
// The idle arm hangs loosely on the other side.
//
// Anatomy (world-up = negative-y on canvas):
//   body.x, body.y  → cauldron centre
//   body.angle       → cosmetic tilt (visual only, in radians)

(function () {
const { ARM_LEN, SHOULDER_OY, BODY_RADIUS } = window.MonadPhysics;

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  pot:     '#1a1420',
  potRim:  '#2e2040',
  potShine:'rgba(255,255,255,0.10)',
  body:    '#4a22a8',
  bodyDark:'#2f1272',
  face:    '#f5ecd8',
  hair:    '#3510a0',
  hairDark:'#1e0868',
  cheek:   'rgba(255,110,140,0.50)',
  eye:     '#1a0a2e',
  glove:   '#d94fa0',
  gloveDark:'#a03078',
  shoe:    '#1a1a2a',
  shoeRim: '#3a3a4a',
};

// ── Offscreen sprite cache ────────────────────────────────────────────────────

let _headSprite = null;

function buildHeadSprite() {
  const S = 96;   // sprite size
  const off = document.createElement('canvas');
  off.width = off.height = S;
  const c = off.getContext('2d');
  const cx = S / 2, cy = S / 2 + 4;
  const R = 28;

  // ── Hair spikes (behind head) ───────────────────────────────────────────
  const spikes = [
    [-28, -30, -16, -56, -6, -30],    // far left
    [-18, -32, -4,  -60,  8, -32],    // left
    [-6,  -33,  6,  -62, 16, -32],    // centre-left
    [ 4,  -32, 18,  -58, 26, -30],    // centre-right
    [18,  -28, 30,  -52, 36, -26],    // right
  ];
  for (const [x1,y1,tx,ty,x2,y2] of spikes) {
    c.beginPath();
    c.moveTo(cx+x1, cy+y1);
    c.lineTo(cx+tx, cy+ty);
    c.lineTo(cx+x2, cy+y2);
    c.closePath();
    const g = c.createLinearGradient(cx, cy+y1, cx+tx, cy+ty);
    g.addColorStop(0, C.hair);
    g.addColorStop(1, C.hairDark);
    c.fillStyle = g;
    c.fill();
  }

  // ── Head (cream circle) ─────────────────────────────────────────────────
  const hg = c.createRadialGradient(cx-6, cy-6, 2, cx, cy, R);
  hg.addColorStop(0, '#fff8ee');
  hg.addColorStop(1, C.face);
  c.fillStyle = hg;
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI*2); c.fill();

  // Subtle outline
  c.strokeStyle = 'rgba(80,40,20,0.25)';
  c.lineWidth = 1.5;
  c.stroke();

  // ── Eyes ────────────────────────────────────────────────────────────────
  for (const [ex, ey, er] of [[-11, -4, 7], [11, -4, 7]]) {
    // White of eye
    c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(cx+ex, cy+ey, er*0.8, er, 0, 0, Math.PI*2); c.fill();
    // Iris
    c.fillStyle = C.eye;
    c.beginPath(); c.arc(cx+ex, cy+ey+1, 4.5, 0, Math.PI*2); c.fill();
    // Highlight
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(cx+ex+2, cy+ey-1, 1.4, 0, Math.PI*2); c.fill();
    // Lashes (top)
    c.strokeStyle = C.eye;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(cx+ex, cy+ey, er, -Math.PI*0.85, -Math.PI*0.15);
    c.stroke();
  }

  // ── Cheeks ──────────────────────────────────────────────────────────────
  c.fillStyle = C.cheek;
  c.beginPath(); c.ellipse(cx-16, cy+5, 6, 4, 0, 0, Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(cx+16, cy+5, 6, 4, 0, 0, Math.PI*2); c.fill();

  // ── Nose (tiny dot) ─────────────────────────────────────────────────────
  c.fillStyle = 'rgba(180,80,80,0.5)';
  c.beginPath(); c.arc(cx, cy+5, 2.2, 0, Math.PI*2); c.fill();

  // ── Mouth ───────────────────────────────────────────────────────────────
  c.strokeStyle = 'rgba(120,50,50,0.7)';
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(cx, cy+8, 7, 0.1*Math.PI, 0.9*Math.PI);
  c.stroke();
  // Tongue
  c.fillStyle = '#e05060';
  c.beginPath();
  c.arc(cx, cy+14, 3.5, 0, Math.PI);
  c.fill();

  _headSprite = off;
  return off;
}

// ── Main draw function ────────────────────────────────────────────────────────

function drawCharacter(ctx, body, armAngle, anchored) {
  if (!_headSprite) buildHeadSprite();

  const bx = body.x;
  const by = body.y;
  // Cosmetic body tilt — leans into velocity and arm direction.
  const lean = Math.max(-0.30, Math.min(0.30,
    body.vx * 0.0006 + Math.cos(armAngle) * 0.12
  ));

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(lean);

  // ── Pot ─────────────────────────────────────────────────────────────────
  const potRx = BODY_RADIUS + 8;   // horizontal radius
  const potRy = BODY_RADIUS + 4;   // vertical radius
  const potCenterY = 10;           // pot centre offset below body.y

  // Shadow beneath pot
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, potCenterY + potRy + 4, potRx * 0.7, 4, 0, 0, Math.PI*2);
  ctx.fill();

  // Pot body
  const pg = ctx.createRadialGradient(-8, potCenterY-8, 2, 0, potCenterY, potRx);
  pg.addColorStop(0, '#382050');
  pg.addColorStop(0.6, C.pot);
  pg.addColorStop(1, '#0a0810');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.ellipse(0, potCenterY, potRx, potRy, 0, 0, Math.PI*2);
  ctx.fill();

  // Pot rim
  ctx.strokeStyle = C.potRim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, potCenterY, potRx, potRy, 0, 0, Math.PI*2);
  ctx.stroke();

  // Pot opening rim (top oval)
  ctx.strokeStyle = '#4a3060';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -2, potRx - 2, 7, 0, 0, Math.PI*2);
  ctx.stroke();

  // Pot shine
  ctx.fillStyle = C.potShine;
  ctx.beginPath();
  ctx.ellipse(-10, potCenterY - 6, 6, 10, -0.4, 0, Math.PI*2);
  ctx.fill();

  // ── Body / torso (purple, visible above the pot rim) ────────────────────
  const bg2 = ctx.createLinearGradient(-14, -28, 14, -4);
  bg2.addColorStop(0, '#6030cc');
  bg2.addColorStop(1, C.bodyDark);
  ctx.fillStyle = bg2;
  ctx.beginPath();
  ctx.ellipse(0, -14, 14, 18, 0, 0, Math.PI*2);
  ctx.fill();

  // ── Idle arm (opposite side of the active arm) ──────────────────────────
  const idleSide = Math.cos(armAngle) >= 0 ? -1 : 1;  // hang on opposite side
  _drawArm(ctx, idleSide * 12, -14, idleSide * 22, 16, false);

  // ── Head ─────────────────────────────────────────────────────────────────
  const S = _headSprite.width;
  ctx.drawImage(_headSprite, -S/2, -S/2 - 24);

  ctx.restore();

  // ── Active arm (drawn in screen space, properly rotated shoulder origin) ──
  // Shoulder in local frame: (0, SHOULDER_OY). After body lean:
  const shScreenX = bx - SHOULDER_OY * Math.sin(lean);
  const shScreenY = by + SHOULDER_OY * Math.cos(lean);
  const hamX = body.hammerX != null ? body.hammerX : shScreenX + Math.cos(armAngle) * ARM_LEN;
  const hamY = body.hammerY != null ? body.hammerY : shScreenY + Math.sin(armAngle) * ARM_LEN;
  _drawActiveArm(ctx, shScreenX, shScreenY, armAngle, anchored, hamX, hamY);
}

// Draw idle dangling arm from shoulder (local coords).
function _drawArm(ctx, shX, shY, elbowX, elbowY, _anchored) {
  // Upper arm
  ctx.strokeStyle = C.body;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shX, shY);
  ctx.lineTo(elbowX, elbowY);
  ctx.stroke();
  // Sleeve
  ctx.strokeStyle = C.bodyDark;
  ctx.lineWidth = 5;
  ctx.stroke();
  // Glove fist
  ctx.fillStyle = C.glove;
  ctx.beginPath();
  ctx.arc(elbowX, elbowY, 7, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = C.gloveDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Draw active arm in world space (so it can point anywhere).
function _drawActiveArm(ctx, shWx, shWy, armAngle, anchored, handX, handY) {
  const cos = Math.cos(armAngle), sin = Math.sin(armAngle);

  // Elbow is ~60% along the arm, slightly bent perpendicular.
  const elbowDist = ARM_LEN * 0.55;
  const bendAmt   = ARM_LEN * 0.15;    // how much elbow bends "outward"
  const perpX = -sin, perpY = cos;    // perpendicular to arm direction
  const elbX = shWx + cos * elbowDist + perpX * bendAmt;
  const elbY = shWy + sin * elbowDist + perpY * bendAmt;

  // Upper arm (shoulder → elbow)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.body;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(shWx, shWy);
  ctx.quadraticCurveTo(elbX, elbY, handX, handY);
  ctx.stroke();
  ctx.strokeStyle = C.bodyDark;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(shWx, shWy);
  ctx.quadraticCurveTo(elbX, elbY, handX, handY);
  ctx.stroke();

  // Glove
  const gloveR = 9;
  const gg = ctx.createRadialGradient(handX-3, handY-3, 1, handX, handY, gloveR);
  gg.addColorStop(0, '#f06ab0');
  gg.addColorStop(1, C.gloveDark);
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(handX, handY, gloveR, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = C.gloveDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Knuckle lines
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const a = armAngle - Math.PI/2 + (i-1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(handX + Math.cos(a)*4, handY + Math.sin(a)*4);
    ctx.lineTo(handX + Math.cos(a)*7, handY + Math.sin(a)*7);
    ctx.stroke();
  }

  // Anchor glow when touching terrain
  if (anchored) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(handX, handY, 0, handX, handY, 28);
    ag.addColorStop(0, 'rgba(255,180,60,0.7)');
    ag.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(handX, handY, 28, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    angle: 0, omega: 0,
    armAngle: -Math.PI / 2,
    hammerX: x, hammerY: y + SHOULDER_OY - ARM_LEN,
    anchored: false,
  };
}

function drawPlayer(ctx, player) {
  drawCharacter(ctx, player, player.armAngle, player.anchored);
}

window.MonadPlayer = { createPlayer, drawPlayer, PLAYER_RADIUS: BODY_RADIUS };
})();
