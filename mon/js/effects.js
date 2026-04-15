// ═══════════════════════════════════════
//  MONAD TERMINAL - SHOUT + EFFECTS
//  알람 기준: USD $10,000 이상
// ═══════════════════════════════════════
var emotionTimer = null;

// ── TRADE FLOATING ALERT ─────────────────────────────
// USD_ALERT_THRESHOLD = $10,000 (config.js)

function getEmojiCount(monAmount) {
  if (monAmount >= MON_ALERT_MEGA  * 2) return 5;
  if (monAmount >= MON_ALERT_MEGA)      return 4;
  if (monAmount >= MON_ALERT_WHALE * 2) return 3;
  if (monAmount >= MON_ALERT_WHALE)     return 2;
  return 1;
}

// MON 수량 기준: BIG 100K+ / WHALE 1M+ / MEGA 5M+
function showTradeFloat(isBuy, usdValue, monAmount) {
  if (monAmount < MON_ALERT_BIG) return; // 100K MON 미만 무시

  const container = document.getElementById('tradeFloatContainer');
  if (!container) return;

  const wrap = document.createElement('div');
  wrap.className = 'trade-float';

  const isWhale = monAmount >= MON_ALERT_WHALE;
  const count   = getEmojiCount(monAmount);

  const usdDisplay = '$' + formatK(usdValue);
  const monDisplay = formatK(monAmount) + ' MON';
  const clownSrc   = isBuy ? 'img/clown_buy.jpg' : 'img/clown_sell.jpg';
  const clownCls   = isWhale ? 'trade-float-clown whale' : 'trade-float-clown';
  const clownHtml  = (typeof devShowTradePhoto === 'undefined' || devShowTradePhoto)
    ? `<img class="${clownCls}" src="${clownSrc}" alt="">`
    : '';

  if (monAmount >= MON_ALERT_MEGA) {
    // 5M+ MON : MEGA
    const emoji = isBuy ? '🐳' : '☠️';
    const label = isBuy ? '🚨 MEGA BUY!' : '💀 MEGA DUMP!';
    wrap.innerHTML = `
      ${clownHtml}
      <div class="trade-float-emoji whale">${emoji.repeat(count)}</div>
      <div class="trade-float-bubble ${isBuy ? 'whale' : 'sell'}">${label} ${monDisplay}</div>
      <div class="trade-float-amount">${monDisplay} / ${usdDisplay}</div>`;
  } else if (monAmount >= MON_ALERT_WHALE) {
    // 1M–5M MON : WHALE
    const emoji = isBuy ? '🐳' : '☠️';
    const label = isBuy ? '🐳 WHALE BUY!' : '☠️ WHALE SELL!';
    wrap.innerHTML = `
      ${clownHtml}
      <div class="trade-float-emoji whale">${emoji.repeat(count)}</div>
      <div class="trade-float-bubble ${isBuy ? 'whale' : 'sell'}">${label} ${monDisplay}</div>
      <div class="trade-float-amount">${monDisplay} / ${usdDisplay}</div>`;
  } else {
    // 100K–1M MON : BIG
    const emoji = isBuy ? '🚀' : '💀';
    const label = isBuy ? '🟢 BIG BUY!' : '🔴 BIG SELL!';
    wrap.innerHTML = `
      ${clownHtml}
      <div class="trade-float-emoji">${emoji.repeat(count)}</div>
      <div class="trade-float-bubble ${isBuy ? 'buy' : 'sell'}">${label} ${monDisplay}</div>
      <div class="trade-float-amount">${monDisplay} / ${usdDisplay}</div>`;
  }

  container.appendChild(wrap);
  triggerBgEffect(isBuy, usdValue);

  const duration = monAmount >= MON_ALERT_WHALE ? 4000 : 3000;
  setTimeout(() => {
    wrap.classList.add('fadeout');
    setTimeout(() => wrap.remove(), 500);
  }, duration);

  while (container.children.length > 5) container.removeChild(container.firstChild);
}

function monEmotion(type) {
  try {
    const n = document.getElementById('monImgNormal');
    const h = document.getElementById('monImgHappy');
    const s = document.getElementById('monImgSad');
    const c = document.getElementById('monChar');
    if (!n || !h || !s || !c) return;
    if (emotionTimer) { clearTimeout(emotionTimer); emotionTimer = null; }
    if (type === 'buy') { n.style.opacity = '0'; h.style.opacity = '1'; s.style.opacity = '0'; }
    else               { n.style.opacity = '0'; h.style.opacity = '0'; s.style.opacity = '1'; }
    c.classList.remove('emotion'); void c.offsetWidth; c.classList.add('emotion');
    emotionTimer = setTimeout(() => {
      try { n.style.opacity = '1'; h.style.opacity = '0'; s.style.opacity = '0'; c.classList.remove('emotion'); } catch(e) {}
      emotionTimer = null;
    }, 1200);
  } catch(e) {}
}
// alias
function chogEmotion(type) { monEmotion(type); }

// ═══════════════════════════════════════
//  BACKGROUND EFFECTS (USD 기준)
// ═══════════════════════════════════════
function triggerBgEffect(isBuy, usdValue) {
  const c = document.getElementById('bgEffectContainer');
  if (!c) return;

  if (usdValue >= 500000) {
    if (isBuy) {
      spawnWhale(c, usdValue);
      spawnParticles(c, '💰', 20, 'riseUp', 4000);
      spawnParticles(c, '🤑', 10, 'riseUp', 3800);
      spawnMegaRockets(c, 15);
      spawnGoldFlash();
      spawnGreenFlash();
      setTimeout(() => spawnMegaRockets(c, 10), 800);
      setTimeout(() => spawnParticles(c, '🚀', 8, 'riseUp', 3500), 400);
    } else {
      spawnFearOverlay();
      spawnParticles(c, '☠️', 25, 'fallDown', 3000);
      spawnParticles(c, '💀', 15, 'fallDown', 3500);
      spawnParticles(c, '🩸', 10, 'fallDown', 4000);
    }
  } else if (usdValue >= 100000) {
    if (isBuy) {
      spawnWhale(c, usdValue);
      spawnParticles(c, '💰', 15, 'riseUp', 3500);
      spawnRockets(c, Math.min(8, Math.floor(usdValue / 100000) * 3));
      spawnGreenFlash();
      setTimeout(() => spawnParticles(c, '🚀', 5, 'riseUp', 3200), 500);
      setTimeout(() => spawnRockets(c, 5), 1000);
    } else {
      spawnFearOverlay();
      spawnParticles(c, '☠️', 20, 'fallDown', 3000);
      spawnParticles(c, '💀', 10, 'fallDown', 3500);
    }
  } else if (usdValue >= 50000) {
    if (isBuy) {
      spawnParticles(c, '💰', 10, 'riseUp', 2500);
      spawnRockets(c, Math.min(5, Math.floor(usdValue / 50000) + 2));
    } else {
      spawnParticles(c, '💀', 8, 'fallDown', 2500);
    }
  } else if (usdValue >= 10000) {
    if (isBuy) {
      spawnParticles(c, '💰', 5, 'riseUp', 2000);
      spawnRockets(c, 2);
    } else {
      spawnParticles(c, '💀', 4, 'fallDown', 2000);
    }
  }
}

function spawnParticles(container, emoji, count, animName, duration) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = emoji;
    const x = Math.random() * 95;
    const sz = 20 + Math.random() * 24;
    const delay = Math.random() * 800;
    el.style.cssText = `left:${x}vw;font-size:${sz}px;opacity:.7;animation:${animName} ${duration}ms ${delay}ms ease-out forwards;`;
    if (animName === 'fallDown') el.style.top = '-50px';
    else el.style.bottom = '-50px';
    container.appendChild(el);
    setTimeout(() => el.remove(), duration + delay + 200);
  }
}

function spawnRockets(container, count) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = '🚀';
    const x = 5 + Math.random() * 88;
    const sz = 28 + Math.random() * 20;
    const delay = Math.random() * 1200;
    const dur = 2000 + Math.random() * 1000;
    el.style.cssText = `left:${x}vw;bottom:-60px;font-size:${sz}px;opacity:.9;animation:rocketLaunch ${dur}ms ${delay}ms cubic-bezier(.22,.61,.36,1) forwards;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), dur + delay + 200);
  }
}

function spawnMegaRockets(container, count) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = '🚀';
    const x = Math.random() * 90;
    const sz = 40 + Math.random() * 40;
    const delay = Math.random() * 1500;
    const dur = 2500 + Math.random() * 1500;
    el.style.cssText = `left:${x}vw;bottom:-80px;font-size:${sz}px;opacity:1;animation:megaRocket ${dur}ms ${delay}ms cubic-bezier(.12,.9,.29,1) forwards;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), dur + delay + 200);
  }
}

function spawnGoldFlash() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;background:radial-gradient(ellipse at center,rgba(255,215,0,.25) 0%,rgba(255,165,0,.1) 50%,transparent 80%);animation:goldFlash 1.8s ease-out forwards;';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2000);
}

function spawnWhale(container, usdValue) {
  const count = Math.min(3, Math.floor(usdValue / 100000));
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = '🐳';
    const y = 20 + Math.random() * 50;
    const sz = 48 + Math.random() * 32;
    const delay = i * 600;
    el.style.cssText = `top:${y}vh;font-size:${sz}px;animation:whaleSwim ${3500 + Math.random() * 1000}ms ${delay}ms ease-in-out forwards;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 5000 + delay);
  }
}

function spawnFearOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'bg-fear-overlay';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2200);
}

function spawnGreenFlash() {
  const overlay = document.createElement('div');
  overlay.className = 'bg-green-overlay';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2200);
}
