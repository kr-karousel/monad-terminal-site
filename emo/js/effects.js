// ═══════════════════════════════════════
//  SHOUT + EMOTION
// ═══════════════════════════════════════
var emotionTimer=null;

// ── TRADE FLOATING ALERT ─────────────────────────
// MON_BIG/MON_WHALE은 CONFIG 섹션으로 이동

function usdToMon(usd){ return usd / (cachedMonPrice || 2.8); }

function showTradeFloat(isBuy, usdValue, chogAmount, monAmount){
  // monAmount가 있으면 직접 사용, 없으면 USD에서 변환
  const monValue = (monAmount && monAmount > 0) ? monAmount : usdToMon(usdValue);
  const isWhale   = monValue >= MON_WHALE;
  const isBig     = monValue >= MON_BIG;
  if(!isBig && !isWhale) return;

  const container = document.getElementById('tradeFloatContainer');
  if(!container) return;

  const wrap = document.createElement('div');
  wrap.className = 'trade-float';

  const monDisplay = monValue >= 1000
    ? (monValue/1000).toFixed(1)+'K MON'
    : Math.floor(monValue).toLocaleString()+' MON';

  if(isWhale){
    const whaleCount = Math.max(1, Math.min(5, Math.floor(monValue / MON_WHALE)));
    const whales = isBuy
      ? '🐳'.repeat(whaleCount)
      : '☠️'.repeat(whaleCount);
    const bubbleCls = isBuy ? 'whale' : 'sell';
    const label = isBuy ? '🚨 WHALE BUY!' : '☠️ WHALE SELL!';

    wrap.innerHTML = `
      <div class="trade-float-emoji whale">${whales}</div>
      <div class="trade-float-bubble ${bubbleCls}">${label} ${monDisplay}</div>
      <div class="trade-float-amount">${Math.floor(chogAmount).toLocaleString()} EMO</div>`;
  } else {
    // 10K~100K MON: 매수=🚀 매도=💀
    // 10K~100K: 1K당 로켓/해골 (Max 5개)
    const smallCount = Math.min(5, Math.max(1, Math.floor(monValue/1000)));
    const bigEmoji = isBuy ? '🚀'.repeat(smallCount) : '💀'.repeat(smallCount);
    const label    = isBuy ? '🟢 BIG BUY!' : '🔴 BIG SELL!';
    wrap.innerHTML = `
      <div class="trade-float-emoji">${bigEmoji}</div>
      <div class="trade-float-bubble ${isBuy?'buy':'sell'}">${label} ${monDisplay}</div>
      <div class="trade-float-amount">${Math.floor(chogAmount).toLocaleString()} EMO</div>`;
  }

  container.appendChild(wrap);

  // ── 배경 이펙트 ──
  triggerBgEffect(isBuy, monValue);

  const duration = isWhale ? 4000 : 2500;
  setTimeout(()=>{
    wrap.classList.add('fadeout');
    setTimeout(()=> wrap.remove(), 500);
  }, duration);

  while(container.children.length > 3) container.removeChild(container.firstChild);
}

function chogEmotion(type){
  try{
    const n=document.getElementById('chogImgNormal');
    const h=document.getElementById('chogImgHappy');
    const s=document.getElementById('chogImgSad');
    const c=document.getElementById('chogChar');
    if(!n||!h||!s||!c)return;
    if(emotionTimer){clearTimeout(emotionTimer);emotionTimer=null;}
    if(type==='buy'){n.style.opacity='0';h.style.opacity='1';s.style.opacity='0';}
    else{n.style.opacity='0';h.style.opacity='0';s.style.opacity='1';}
    c.classList.remove('emotion');void c.offsetWidth;c.classList.add('emotion');
    emotionTimer=setTimeout(()=>{
      try{n.style.opacity='1';h.style.opacity='0';s.style.opacity='0';c.classList.remove('emotion');}catch(e){}
      emotionTimer=null;
    },1200);
  }catch(e){}
}

// ═══════════════════════════════════════
//  BACKGROUND EFFECTS (trade size animations)
// ═══════════════════════════════════════
function triggerBgEffect(isBuy, monAmount){
  const c = document.getElementById('bgEffectContainer');
  if(!c) return;

  if(monAmount >= 500000){
    // 💥 MEGA BUY: 500K+ MON - 최대 이펙트
    if(isBuy){
      spawnWhale(c, monAmount);
      spawnParticles(c, '💰', 20, 'riseUp', 4000);
      spawnParticles(c, '🤑', 10, 'riseUp', 3800);
      spawnMegaRockets(c, 15);
      spawnGoldFlash();
      spawnGreenFlash();
      // 화면 전체 골드 플래시
      setTimeout(()=>spawnMegaRockets(c, 10), 800);
      setTimeout(()=>spawnParticles(c, '🚀', 8, 'riseUp', 3500), 400);
    } else {
      spawnFearOverlay();
      spawnParticles(c, '☠️', 25, 'fallDown', 3000);
      spawnParticles(c, '💀', 15, 'fallDown', 3500);
      spawnParticles(c, '🩸', 10, 'fallDown', 4000);
    }
  } else if(monAmount >= 100000){
    // 🐳 WHALE BUY: 100K+ MON
    if(isBuy){
      spawnWhale(c, monAmount);
      spawnParticles(c, '💰', 15, 'riseUp', 3500);
      spawnRockets(c, Math.min(8, Math.floor(monAmount/100000)*3));
      spawnGreenFlash();
      setTimeout(()=>spawnParticles(c, '🚀', 5, 'riseUp', 3200), 500);
      setTimeout(()=>spawnRockets(c, 5), 1000);
    } else {
      spawnFearOverlay();
      spawnParticles(c, '☠️', 20, 'fallDown', 3000);
      spawnParticles(c, '💀', 10, 'fallDown', 3500);
    }
  } else if(monAmount >= 10000){
    // 🚀 BIG BUY: 10K+ MON
    if(isBuy){
      spawnParticles(c, '💰', 10, 'riseUp', 2500);
      spawnRockets(c, Math.min(5, Math.floor(monAmount/20000)+2));
    } else {
      spawnParticles(c, '💀', 8, 'fallDown', 2500);
    }
  }
}

function spawnParticles(container, emoji, count, animName, duration){
  for(let i=0;i<count;i++){
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = emoji;
    const x = Math.random()*95;
    const sz = 20 + Math.random()*24;
    const delay = Math.random()*800;
    el.style.cssText = `left:${x}vw;font-size:${sz}px;opacity:.7;animation:${animName} ${duration}ms ${delay}ms ease-out forwards;`;
    if(animName==='fallDown') el.style.top = '-50px';
    else el.style.bottom = '-50px';
    container.appendChild(el);
    setTimeout(()=>el.remove(), duration+delay+200);
  }
}

function spawnRockets(container, count){
  for(let i=0;i<count;i++){
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = '🚀';
    const x = 5 + Math.random()*88;
    const sz = 28 + Math.random()*20;
    const delay = Math.random()*1200;
    const dur = 2000 + Math.random()*1000;
    el.style.cssText = `left:${x}vw;bottom:-60px;font-size:${sz}px;opacity:.9;animation:rocketLaunch ${dur}ms ${delay}ms cubic-bezier(.22,.61,.36,1) forwards;`;
    container.appendChild(el);
    setTimeout(()=>el.remove(), dur+delay+200);
  }
}

function spawnMegaRockets(container, count){
  for(let i=0;i<count;i++){
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = '🚀';
    const x = Math.random()*90;
    const sz = 40 + Math.random()*40;
    const delay = Math.random()*1500;
    const dur = 2500 + Math.random()*1500;
    el.style.cssText = `left:${x}vw;bottom:-80px;font-size:${sz}px;opacity:1;animation:megaRocket ${dur}ms ${delay}ms cubic-bezier(.12,.9,.29,1) forwards;`;
    container.appendChild(el);
    setTimeout(()=>el.remove(), dur+delay+200);
  }
}

function spawnGoldFlash(){
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;background:radial-gradient(ellipse at center,rgba(255,215,0,.25) 0%,rgba(255,165,0,.1) 50%,transparent 80%);animation:goldFlash 1.8s ease-out forwards;';
  document.body.appendChild(overlay);
  setTimeout(()=>overlay.remove(), 2000);
}

function spawnWhale(container, monAmount){
  const count = Math.min(3, Math.floor(monAmount / 100000));
  for(let i=0;i<count;i++){
    const el = document.createElement('div');
    el.className = 'bg-particle';
    el.textContent = '🐳';
    const y = 20 + Math.random()*50;
    const sz = 48 + Math.random()*32;
    const delay = i*600;
    el.style.cssText = `top:${y}vh;font-size:${sz}px;animation:whaleSwim ${3500+Math.random()*1000}ms ${delay}ms ease-in-out forwards;`;
    container.appendChild(el);
    setTimeout(()=>el.remove(), 5000+delay);
  }
}

function spawnFearOverlay(){
  const overlay = document.createElement('div');
  overlay.className = 'bg-fear-overlay';
  document.body.appendChild(overlay);
  setTimeout(()=>overlay.remove(), 2200);
}

function spawnGreenFlash(){
  const overlay = document.createElement('div');
  overlay.className = 'bg-green-overlay';
  document.body.appendChild(overlay);
  setTimeout(()=>overlay.remove(), 2200);
}

