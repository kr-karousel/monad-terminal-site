// Main game loop for CHOG Climb.

(function () {
  const { WORLD_HALF_WIDTH, SECTOR_HEIGHT, TOTAL_SECTORS, GROUND_Y,
          buildTerrain, buildFlags } = window.MonadLevel;
  const { stepPlayer } = window.MonadPhysics;
  const { createPlayer, drawPlayer } = window.MonadPlayer;
  const Storage = window.MonadStorage;

  // ── DOM ────────────────────────────────────────────────────────────────
  const canvas     = document.getElementById('game-canvas');
  const ctx        = canvas.getContext('2d');
  const startScr   = document.getElementById('start-screen');
  const summitScr  = document.getElementById('summit-screen');
  const nameInput  = document.getElementById('username-input');
  const btnStart   = document.getElementById('btn-start');
  const btnReset   = document.getElementById('btn-reset');
  const btnRestart = document.getElementById('btn-restart');
  const hudEl      = document.getElementById('hud');
  const hudSector  = document.getElementById('hud-sector');
  const hudTotal   = document.getElementById('hud-total');
  const hudBest    = document.getElementById('hud-best');
  const hudHeight  = document.getElementById('hud-height');
  const toast      = document.getElementById('flag-toast');
  const toastNum   = document.getElementById('toast-num');
  const toastSub   = document.getElementById('toast-sub');

  // ── Level data ────────────────────────────────────────────────────────
  const terrain = buildTerrain();
  const flags   = buildFlags(terrain);
  hudTotal.textContent = TOTAL_SECTORS;

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    player: null,
    mouse: { sx: 0, sy: 0 },
    cam:   { x: 0, y: 0 },
    currentSector: 0,
    bestSector: 0,
    reachedThisRun: new Set(),
    record: null,
  };

  // ── Canvas sizing ──────────────────────────────────────────────────────
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.floor(window.innerWidth  * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Input ──────────────────────────────────────────────────────────────
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    state.mouse.sx = e.clientX - r.left;
    state.mouse.sy = e.clientY - r.top;
  });
  canvas.addEventListener('touchmove', e => {
    if (!e.touches.length) return;
    const r = canvas.getBoundingClientRect();
    state.mouse.sx = e.touches[0].clientX - r.left;
    state.mouse.sy = e.touches[0].clientY - r.top;
    e.preventDefault();
  }, { passive: false });

  function screenToWorld(sx, sy) {
    return {
      x: sx - window.innerWidth  / 2 + state.cam.x,
      y: sy - window.innerHeight / 2 + state.cam.y,
    };
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx - state.cam.x + window.innerWidth  / 2,
      y: wy - state.cam.y + window.innerHeight / 2,
    };
  }

  // ── Start / respawn ────────────────────────────────────────────────────
  function startRun(respawn = 'ground') {
    const rec = Storage.loadRecord();
    state.record     = rec;
    state.bestSector = rec.bestSector;

    let spawnX = 0;
    let spawnY = GROUND_Y - 80;

    if (respawn === 'checkpoint' && rec.bestSector > 0) {
      const f = flags.find(f => f.sector === rec.bestSector);
      if (f) { spawnX = f.x; spawnY = f.y - 30; }
    }

    state.player = createPlayer(spawnX, spawnY);
    state.reachedThisRun = new Set();
    if (respawn === 'checkpoint') {
      for (let s = 1; s <= rec.bestSector; s++) state.reachedThisRun.add(s);
    }
    state.currentSector = 0;

    state.cam.x = 0;
    state.cam.y = spawnY - window.innerHeight * 0.12;

    summitScr.classList.add('hidden');
    startScr.classList.add('hidden');
    hudEl.classList.remove('hidden');

    hudBest.textContent = rec.bestSector;
    updateHud();
    Storage.incrementRuns();

    // Reset frame timer so the first physics dt isn't a huge catch-up.
    lastT = performance.now();
  }

  btnStart.addEventListener('click', () => {
    Storage.setUsername(nameInput.value || 'anon');
    startRun('ground');
  });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnStart.click(); });
  btnReset.addEventListener('click', () => { Storage.incrementFalls(); startRun('checkpoint'); });
  btnRestart.addEventListener('click', () => startRun('ground'));

  // Pre-fill name.
  (function () {
    const r = Storage.loadRecord();
    if (r.username) nameInput.value = r.username;
    hudBest.textContent = r.bestSector;
  })();

  // ── Helpers ────────────────────────────────────────────────────────────
  function heightMeters(y) {
    return Math.max(0, Math.round((GROUND_Y - y) / 40));
  }

  function updateHud() {
    hudSector.textContent = state.currentSector;
    hudBest.textContent   = state.bestSector;
    hudHeight.textContent = heightMeters(state.player ? state.player.y : 0);
  }

  function showToast(sector, newBest) {
    toastNum.textContent = sector;
    toastSub.textContent = newBest ? 'new personal best! 🎉' : 'checkpoint saved';
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2200);
  }

  function checkFlags() {
    if (!state.player) return;
    for (const f of flags) {
      if (state.reachedThisRun.has(f.sector)) continue;
      const dx = state.player.x - f.x;
      const dy = state.player.y - f.y;
      if (dx*dx + dy*dy <= f.radius * f.radius) {
        state.reachedThisRun.add(f.sector);
        const prev = state.bestSector;
        Storage.markSectorReached(f.sector);
        const isNew = f.sector > prev;
        if (isNew) state.bestSector = f.sector;
        showToast(f.sector, isNew);
        if (f.sector === TOTAL_SECTORS) {
          setTimeout(() => summitScr.classList.remove('hidden'), 1500);
        }
      }
    }
    let max = 0;
    for (const n of state.reachedThisRun) if (n > max) max = n;
    state.currentSector = max;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  function drawBackground(vW, vH) {
    // Deep space gradient
    const bg = ctx.createLinearGradient(0, 0, 0, vH);
    bg.addColorStop(0, '#04020c');
    bg.addColorStop(1, '#0c0820');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vW, vH);

    // Parallax stars (3 layers)
    const layers = [
      { z: 0.15, n: 80, color: 'rgba(255,255,255,0.30)', s: 1 },
      { z: 0.35, n: 50, color: 'rgba(180,160,255,0.50)', s: 1.5 },
      { z: 0.60, n: 28, color: 'rgba(255,255,255,0.80)', s: 2 },
    ];
    for (const L of layers) {
      const offY = state.cam.y * L.z;
      for (let i = 0; i < L.n; i++) {
        const seed = i * 9301 + 49297;
        const sx = ((seed % 1000) / 1000) * vW;
        const sy = (((seed * 7) % 1500) / 1500) * vH;
        const wobble = ((seed + Math.floor(offY)) % 900) / 900 * vH;
        ctx.fillStyle = L.color;
        ctx.fillRect(sx, (sy + wobble) % vH, L.s, L.s);
      }
    }
  }

  function drawTerrain(vW, vH) {
    // Sector marker lines
    for (let s = 1; s <= TOTAL_SECTORS; s++) {
      const wy = -SECTOR_HEIGHT * s;
      const sy = wy - state.cam.y + vH / 2;
      if (sy < -40 || sy > vH + 40) continue;
      ctx.strokeStyle = 'rgba(130,80,255,0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 9]);
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(vW, sy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(130,80,255,0.40)';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(`SECTOR ${s}`, 14, sy - 5);
    }

    // Platforms / rocks
    for (const r of terrain) {
      const sx = r.x - state.cam.x + vW / 2;
      const sy = r.y - state.cam.y + vH / 2;
      if (sx + r.w < -20 || sx > vW + 20 || sy + r.h < -20 || sy > vH + 20) continue;

      // Rock gradient
      const rg = ctx.createLinearGradient(sx, sy, sx, sy + r.h);
      rg.addColorStop(0, '#3d2b5a');
      rg.addColorStop(0.4, '#281840');
      rg.addColorStop(1, '#120a20');
      ctx.fillStyle = rg;
      ctx.fillRect(sx, sy, r.w, r.h);
      // Top highlight
      ctx.fillStyle = 'rgba(200,160,255,0.18)';
      ctx.fillRect(sx + 2, sy, r.w - 4, 2);
      // Outline
      ctx.strokeStyle = 'rgba(8,5,16,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, r.w - 1, r.h - 1);
      // Crack detail
      if (r.w > 80) {
        ctx.strokeStyle = 'rgba(100,70,140,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + r.w * 0.3, sy + 2);
        ctx.lineTo(sx + r.w * 0.28, sy + r.h * 0.6);
        ctx.stroke();
      }
    }
  }

  function drawFlags(vW, vH) {
    const t = performance.now() / 1000;
    for (const f of flags) {
      const { x: sx, y: sy } = worldToScreen(f.x, f.y);
      if (sx < -60 || sx > vW + 60 || sy < -80 || sy > vH + 40) continue;

      const reached = state.reachedThisRun.has(f.sector) ||
                      (state.record && state.record.bestSector >= f.sector);

      // Pole
      ctx.strokeStyle = '#d0c0e0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 36);
      ctx.lineTo(sx, sy - 36);
      ctx.stroke();

      // Waving flag cloth
      const w = Math.sin(t * 3.5 + f.sector * 1.2) * 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 36);
      ctx.bezierCurveTo(sx + 10, sy - 38 + w, sx + 22, sy - 30, sx + 24, sy - 24 + w * 0.5);
      ctx.lineTo(sx + 22, sy - 18);
      ctx.bezierCurveTo(sx + 18, sy - 22 + w * 0.3, sx + 8, sy - 26, sx, sy - 24);
      ctx.closePath();
      ctx.fillStyle = reached ? '#50ee82' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sector number
      ctx.fillStyle = '#0a0a14';
      ctx.font = 'bold 10px "Courier New"';
      ctx.fillText(String(f.sector), sx + 5, sy - 25);

      // Glow for unreached flags
      if (!reached) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(sx, sy - 24, 0, sx, sy - 24, 44);
        gg.addColorStop(0, 'rgba(239,68,68,0.30)');
        gg.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(sx, sy - 24, 44, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawCursor() {
    const cx = state.mouse.sx, cy = state.mouse.sy;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
    ctx.stroke();
  }

  function render() {
    const vW = window.innerWidth, vH = window.innerHeight;
    ctx.clearRect(0, 0, vW, vH);
    drawBackground(vW, vH);
    drawTerrain(vW, vH);
    drawFlags(vW, vH);

    if (state.player) {
      const p = state.player;
      // Translate to screen coords for rendering, then restore.
      const { x: sx, y: sy } = worldToScreen(p.x, p.y);
      const { x: hx, y: hy } = worldToScreen(p.hammerX, p.hammerY);
      const ox = p.x, oy = p.y, ohx = p.hammerX, ohy = p.hammerY;
      p.x = sx; p.y = sy; p.hammerX = hx; p.hammerY = hy;
      drawPlayer(ctx, p);
      p.x = ox; p.y = oy; p.hammerX = ohx; p.hammerY = ohy;
    }
    drawCursor();
  }

  // ── Physics step ───────────────────────────────────────────────────────
  function step(dt) {
    if (!state.player) return;
    const world = screenToWorld(state.mouse.sx, state.mouse.sy);
    const result = stepPlayer(state.player, world, terrain, dt);
    state.player.armAngle = result.armAngle;
    state.player.hammerX  = result.hammerX;
    state.player.hammerY  = result.hammerY;
    state.player.anchored = result.anchored;
  }

  // ── Game loop ──────────────────────────────────────────────────────────
  let lastT = performance.now();

  function frame(now) {
    try {
      const dtRaw = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      if (state.player) {
        // Substeps for stability.
        const SUB = 4;
        const dt  = dtRaw / SUB;
        for (let i = 0; i < SUB; i++) step(dt);

        checkFlags();

        // Camera: follow player, keep them at 60% from top.
        const targetCamY = state.player.y - window.innerHeight * 0.40;
        state.cam.y += (targetCamY - state.cam.y) * 0.10;
      }

      updateHud();
      render();
    } catch (err) {
      console.error('[climb] frame error:', err);
    }
    requestAnimationFrame(frame);
  }

  // Boot: run the background animation even during story/start screens.
  // Player physics only run once state.player is set (on START click).
  state.cam.y = GROUND_Y - window.innerHeight * 0.4;
  requestAnimationFrame(frame);
})();
