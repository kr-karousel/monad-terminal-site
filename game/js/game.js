// Main game loop for Monad Climb.

(function () {
  const { WORLD_HALF_WIDTH, SECTOR_HEIGHT, TOTAL_SECTORS, GROUND_Y,
          buildTerrain, buildFlags } = window.MonadLevel;
  const { stepPlayer } = window.MonadPhysics;
  const { createPlayer, drawPlayer, drawHammer } = window.MonadPlayer;
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
  const hudSector  = document.getElementById('hud-sector');
  const hudTotal   = document.getElementById('hud-total');
  const hudBest    = document.getElementById('hud-best');
  const hudHeight  = document.getElementById('hud-height');
  const toast      = document.getElementById('flag-toast');
  const toastNum   = document.getElementById('toast-num');
  const toastSub   = document.getElementById('toast-sub');

  // ── State ──────────────────────────────────────────────────────────────
  const terrain = buildTerrain();
  const flags   = buildFlags(terrain);

  const state = {
    running: false,
    player: null,
    mouse: { sx: 0, sy: 0 },             // screen coords
    cam:   { x: 0, y: 0 },
    camTargetY: 0,
    currentSector: 0,                     // sector the player is currently inside
    bestSector: 0,
    reachedThisRun: new Set(),            // flags touched this run
    summitShown: false,
    lastCheckpoint: { x: 0, y: GROUND_Y - 80 },
    lastFallY: -Infinity,                 // for fall detection
    prevHeightM: 0,
    record: null,
  };

  hudTotal.textContent = TOTAL_SECTORS;

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
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouse.sx = e.clientX - rect.left;
    state.mouse.sy = e.clientY - rect.top;
  });
  // Touch: treat first touch as the mouse.
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    state.mouse.sx = e.touches[0].clientX - rect.left;
    state.mouse.sy = e.touches[0].clientY - rect.top;
    e.preventDefault();
  }, { passive: false });

  function screenToWorld(sx, sy) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    return {
      x: sx - viewW / 2 + state.cam.x,
      y: sy - viewH / 2 + state.cam.y,
    };
  }

  // ── Start / reset ──────────────────────────────────────────────────────
  function startRun(respawn = 'ground') {
    const rec = Storage.loadRecord();
    state.record    = rec;
    state.bestSector = rec.bestSector;

    let spawn = { x: 0, y: GROUND_Y - 80 };
    if (respawn === 'checkpoint' && rec.bestSector > 0) {
      const f = flags.find(f => f.sector === rec.bestSector);
      if (f) spawn = { x: f.x, y: f.y - 20 };
    }
    state.lastCheckpoint = spawn;
    state.player = createPlayer(spawn.x, spawn.y);
    state.reachedThisRun = new Set();
    if (respawn === 'checkpoint') {
      // Already-earned flags shouldn't fire the toast on respawn.
      for (let s = 1; s <= rec.bestSector; s++) state.reachedThisRun.add(s);
    }
    state.currentSector = 0;
    state.summitShown = false;
    state.lastFallY = spawn.y;
    state.prevHeightM = heightMeters(state.player.y);

    // Centre camera on spawn.
    state.cam.x = 0;
    state.cam.y = spawn.y - window.innerHeight * 0.1;
    state.camTargetY = state.cam.y;

    summitScr.classList.add('hidden');
    startScr.classList.add('hidden');

    hudBest.textContent = rec.bestSector;
    updateHud();

    Storage.incrementRuns();
  }

  btnStart.addEventListener('click', () => {
    Storage.setUsername(nameInput.value || 'anon');
    startRun('ground');
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnStart.click();
  });
  btnReset.addEventListener('click', () => {
    Storage.incrementFalls();
    startRun('checkpoint');
  });
  btnRestart.addEventListener('click', () => startRun('ground'));

  // Pre-fill name from storage.
  (function initName() {
    const r = Storage.loadRecord();
    if (r.username) nameInput.value = r.username;
    hudBest.textContent = r.bestSector;
  })();

  // ── Helpers ────────────────────────────────────────────────────────────
  function heightMeters(y) {
    // 0 at the ground, grows upward. 40 world-px ≈ 1 m (arbitrary).
    return Math.max(0, Math.round((GROUND_Y - y) / 40));
  }

  function updateHud() {
    hudSector.textContent = state.currentSector;
    hudBest.textContent   = state.bestSector;
    hudHeight.textContent = heightMeters(state.player ? state.player.y : 0);
  }

  function showFlagToast(sector, isNewBest) {
    toastNum.textContent = sector;
    toastSub.textContent = isNewBest ? 'new personal best!' : 'checkpoint saved';
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(showFlagToast._t);
    showFlagToast._t = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2000);
  }

  function checkFlags() {
    if (!state.player) return;
    for (const f of flags) {
      if (state.reachedThisRun.has(f.sector)) continue;
      const dx = state.player.x - f.x;
      const dy = state.player.y - f.y;
      if (dx * dx + dy * dy <= f.radius * f.radius) {
        state.reachedThisRun.add(f.sector);
        const prevBest = state.bestSector;
        Storage.markSectorReached(f.sector);
        const isNewBest = f.sector > prevBest;
        if (isNewBest) state.bestSector = f.sector;
        state.lastCheckpoint = { x: f.x, y: f.y - 20 };
        showFlagToast(f.sector, isNewBest);

        if (f.sector === TOTAL_SECTORS) {
          setTimeout(() => { summitScr.classList.remove('hidden'); }, 1400);
        }
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function drawBackground(viewW, viewH) {
    // Stars parallax. Deterministic per world-y band.
    const layers = [
      { z: 0.2, count: 70, color: 'rgba(255,255,255,0.35)', size: 1 },
      { z: 0.4, count: 50, color: 'rgba(160,140,255,0.55)', size: 1.4 },
      { z: 0.7, count: 30, color: 'rgba(255,255,255,0.75)', size: 1.8 },
    ];
    for (const L of layers) {
      const parY = state.cam.y * L.z;
      for (let i = 0; i < L.count; i++) {
        const seed = i * 9301 + 49297;
        const sx = ((seed % 1000) / 1000) * viewW;
        const sy = (((seed * 7) % 1500) / 1500) * viewH;
        const wobble = ((seed + Math.floor(parY)) % 800) / 800 * viewH;
        const drawY = (sy + wobble) % viewH;
        ctx.fillStyle = L.color;
        ctx.fillRect(sx, drawY, L.size, L.size);
      }
    }
  }

  function drawTerrain(viewW, viewH) {
    // Sector bands (subtle horizontal lines + labels on the left).
    for (let s = 1; s <= TOTAL_SECTORS; s++) {
      const y = -SECTOR_HEIGHT * s;
      const sy = y - state.cam.y + viewH / 2;
      if (sy < -40 || sy > viewH + 40) continue;
      ctx.strokeStyle = 'rgba(130,80,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(viewW, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(130,80,255,0.55)';
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText(`SECTOR ${s}`, 14, sy - 6);
    }

    // Rocks.
    for (const r of terrain) {
      const sx = r.x - state.cam.x + viewW / 2;
      const sy = r.y - state.cam.y + viewH / 2;
      if (sx + r.w < -20 || sx > viewW + 20 || sy + r.h < -20 || sy > viewH + 20) continue;
      // Base fill
      const grad = ctx.createLinearGradient(sx, sy, sx, sy + r.h);
      grad.addColorStop(0, '#3a2a5a');
      grad.addColorStop(1, '#1a1228');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, r.w, r.h);
      // Top highlight
      ctx.fillStyle = 'rgba(180,140,255,0.22)';
      ctx.fillRect(sx, sy, r.w, 2);
      // Outline
      ctx.strokeStyle = 'rgba(10,8,18,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, r.w - 1, r.h - 1);
    }
  }

  function drawFlags(viewW, viewH) {
    const t = performance.now() / 1000;
    for (const f of flags) {
      const sx = f.x - state.cam.x + viewW / 2;
      const sy = f.y - state.cam.y + viewH / 2;
      if (sx < -40 || sx > viewW + 40 || sy < -60 || sy > viewH + 40) continue;

      const reached = state.reachedThisRun.has(f.sector) ||
                      (state.record && state.record.bestSector >= f.sector);

      // Pole.
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 40);
      ctx.lineTo(sx, sy - 40);
      ctx.stroke();

      // Flag cloth.
      const wave = Math.sin(t * 3 + f.sector) * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 40);
      ctx.lineTo(sx + 26, sy - 34 + wave);
      ctx.lineTo(sx + 22, sy - 26);
      ctx.lineTo(sx, sy - 22);
      ctx.closePath();
      ctx.fillStyle = reached ? '#50ff82' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Number on flag.
      ctx.fillStyle = '#0a0a14';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillText(String(f.sector), sx + 6, sy - 27);

      // Glow if not reached yet.
      if (!reached) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(sx + 10, sy - 30, 0, sx + 10, sy - 30, 40);
        g.addColorStop(0, 'rgba(239,68,68,0.35)');
        g.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx + 10, sy - 30, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawCursor(viewW, viewH) {
    const cx = state.mouse.sx;
    const cy = state.mouse.sy;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    void viewW; void viewH;
  }

  function render() {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    ctx.clearRect(0, 0, viewW, viewH);
    drawBackground(viewW, viewH);

    // World transform is applied manually per-element (cheaper than save/restore
    // for the whole scene in this size).
    drawTerrain(viewW, viewH);
    drawFlags(viewW, viewH);

    if (state.player) {
      // Translate player coords to screen and invoke its draw routines in a
      // translated frame.
      const p = state.player;
      const tmpX = p.x, tmpY = p.y, tmpHx = p.hammerX, tmpHy = p.hammerY;
      p.x       = tmpX       - state.cam.x + viewW / 2;
      p.y       = tmpY       - state.cam.y + viewH / 2;
      p.hammerX = tmpHx      - state.cam.x + viewW / 2;
      p.hammerY = tmpHy      - state.cam.y + viewH / 2;
      drawHammer(ctx, p);
      drawPlayer(ctx, p);
      p.x = tmpX; p.y = tmpY; p.hammerX = tmpHx; p.hammerY = tmpHy;
    }

    drawCursor(viewW, viewH);
  }

  // ── Loop ───────────────────────────────────────────────────────────────
  let lastT = performance.now();
  function frame(now) {
    const dtRaw = Math.min(0.033, (now - lastT) / 1000); // cap at 30 FPS step
    lastT = now;

    // Physics substeps for stability with fast motion.
    const steps = 3;
    const dt = dtRaw / steps;
    for (let i = 0; i < steps; i++) {
      const world = screenToWorld(state.mouse.sx, state.mouse.sy);
      stepPlayer(state.player, world, terrain, dt);
    }

    // Flag pickups.
    checkFlags();
    // HUD sector counter = highest flag reached this run.
    let maxFlag = 0;
    for (const n of state.reachedThisRun) if (n > maxFlag) maxFlag = n;
    state.currentSector = maxFlag;

    // Camera smoothing.
    state.camTargetY = state.player.y - window.innerHeight * 0.12;
    state.cam.y += (state.camTargetY - state.cam.y) * 0.12;

    // Fall detection: if we drop 1.5 sectors below the highest point seen so far.
    if (state.player.y < state.lastFallY - 50) state.lastFallY = state.player.y;
    // (Intentionally do not auto-respawn — falling is part of the game.)

    updateHud();
    render();
    requestAnimationFrame(frame);
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  // Pre-build a dummy player so the background renders nicely under the
  // start overlay; actual run starts on click.
  state.player = createPlayer(0, GROUND_Y - 80);
  state.cam.y = state.player.y - window.innerHeight * 0.1;
  state.running = true;
  requestAnimationFrame(frame);
})();
