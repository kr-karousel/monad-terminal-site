function startApp(){
  const w=document.getElementById('chart-wrapper');
  if(!w){setTimeout(startApp,50);return;}
  const width=w.getBoundingClientRect().width||w.offsetWidth;
  if(width<10){setTimeout(startApp,80);return;}
  checkWelcome();
  loadNickDB();
  loadShoutsFromStorage();
  loadCustomTiersFromStorage();
  initChart();
  startPriceRefresh();
  setTimeout(setupTracking,300);
}

if(document.readyState==='complete')setTimeout(startApp,100);
else{window.addEventListener('load',()=>setTimeout(startApp,100));document.addEventListener('DOMContentLoaded',()=>setTimeout(startApp,200));}

// ═══════════════════════════════════════
//  ONLINE COUNT — 가짜 시뮬 OFF (라이브 모드)
//  실제 WebSocket/서버 연동 시 여기서 업데이트
// ═══════════════════════════════════════
(function(){const e=document.getElementById('onlineCount');if(e)e.textContent='—';})();

// ═══════════════════════════════════════
//  CHAT

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

// ═══════════════════════════════════════
//  DEV PANEL (dev wallet only)
// ═══════════════════════════════════════
var devTestWallets = []; // 테스트 권한 지갑 목록
var devCustomTiers = {}; // address.toLowerCase() -> custom label

function loadCustomTiersFromStorage(){
  try { devCustomTiers = JSON.parse(localStorage.getItem('chog_custom_tiers')||'{}'); } catch(e){ devCustomTiers={}; }
}
function saveCustomTiersToStorage(){
  localStorage.setItem('chog_custom_tiers', JSON.stringify(devCustomTiers));
}
function devAddCustomTier(){
  const addr = (document.getElementById('devTierAddrInput').value||'').trim().toLowerCase();
  const label = (document.getElementById('devTierLabelInput').value||'').trim();
  if(!addr.startsWith('0x')||addr.length!==42){ alert('Invalid address'); return; }
  if(!label){ alert('Label required'); return; }
  devCustomTiers[addr] = label;
  saveCustomTiersToStorage();
  document.getElementById('devTierAddrInput').value = '';
  document.getElementById('devTierLabelInput').value = '';
  renderDevCustomTiers();
}
function devRemoveCustomTier(addr){
  delete devCustomTiers[addr];
  saveCustomTiersToStorage();
  renderDevCustomTiers();
}
function renderDevCustomTiers(){
  const el = document.getElementById('devCustomTierList');
  if(!el) return;
  const entries = Object.entries(devCustomTiers);
  if(!entries.length){
    el.innerHTML = '<span style="color:var(--muted)">None registered</span>';
    return;
  }
  el.innerHTML = entries.map(([a,l]) =>
    `<div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.04);border-radius:5px;padding:2px 6px;margin-bottom:2px">
      <span style="font-family:monospace;font-size:9px">${a.slice(0,8)}...${a.slice(-4)}</span>
      <span style="font-size:9px;color:var(--accent);flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">🏷️ ${escHtml(l)}</span>
      <button onclick="devRemoveCustomTier('${a}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 2px;line-height:1">✕</button>
    </div>`
  ).join('');
}

function isDevOrTest(){
  return wallet && (
    wallet.addr.toLowerCase() === DEV_WALLET.toLowerCase() ||
    devTestWallets.includes(wallet.addr.toLowerCase())
  );
}

function toggleDevPanel(){
  const p = document.getElementById('devPanel');
  if(p) p.classList.toggle('open');
  if(p && p.classList.contains('open')){
    renderDevTestWallets();
    renderDevCustomTiers();
    const isMainDev = wallet && wallet.addr.toLowerCase() === DEV_WALLET.toLowerCase();
    const feeSection = document.getElementById('devFeeSection');
    if(feeSection) feeSection.style.display = isMainDev ? '' : 'none';
    if(isMainDev){
      const ni = document.getElementById('devNickCostInput');
      const si = document.getElementById('devShoutCostInput');
      if(ni) ni.value = NICK_COST;
      if(si) si.value = SHOUT_COST;
    }
  }
}

function checkDevAccess(){
  const btn = document.getElementById('devToggleBtn');
  if(!btn) return;
  if(isDevOrTest()){
    btn.style.display = '';
  } else {
    btn.style.display = 'none';
    const p = document.getElementById('devPanel');
    if(p) p.classList.remove('open');
  }
}

function devAddTestWallet(){
  const inp = document.getElementById('devWalletInput');
  const addr = (inp ? inp.value : '').trim().toLowerCase();
  if(!addr.startsWith('0x') || addr.length !== 42){ alert('Invalid address (must be 0x + 40 hex chars)'); return; }
  if(!devTestWallets.includes(addr)) devTestWallets.push(addr);
  if(inp) inp.value = '';
  renderDevTestWallets();
}

function devRemoveTestWallet(addr){
  devTestWallets = devTestWallets.filter(a => a !== addr);
  renderDevTestWallets();
}

function renderDevTestWallets(){
  const el = document.getElementById('devTestWalletList');
  if(!el) return;
  if(!devTestWallets.length){
    el.innerHTML = '<span style="color:var(--muted)">None registered</span>';
    return;
  }
  el.innerHTML = devTestWallets.map(a =>
    `<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.04);border-radius:5px;padding:2px 6px;margin-bottom:2px">
      <span style="font-family:monospace;font-size:9px">${a.slice(0,8)}...${a.slice(-4)}</span>
      <button onclick="devRemoveTestWallet('${a}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:0 2px;line-height:1">✕</button>
    </div>`
  ).join('');
}

function devApplyFees(){
  const nc = parseInt(document.getElementById('devNickCostInput').value) || 2000;
  const sc = parseInt(document.getElementById('devShoutCostInput').value) || 2000;
  NICK_COST = nc;
  SHOUT_COST = sc;
  const shoutDisp = document.getElementById('shoutCostDisplay');
  if(shoutDisp) shoutDisp.textContent = '💜 ' + sc.toLocaleString() + ' CHOG';
  const nickDisp = document.getElementById('nickCostDisplay');
  if(nickDisp) nickDisp.textContent = '💜 ' + nc.toLocaleString() + ' CHOG';
  alert('✅ Fees updated!\nNickname: ' + nc.toLocaleString() + ' CHOG\nShout: ' + sc.toLocaleString() + ' CHOG');
}

function devTest(type){
  const mp = cachedMonPrice || 0.026;
  switch(type){
    case 'bigBuy':
      showTradeFloat(true, 10000*mp, 1500000, 10000);
      renderMsg({addr:'0xDEV_TEST',bal:999999,type:'trade',side:'buy',amount:1500000,price:livePrice,mon:10000,time:nowTime()});
      break;
    case 'bigSell':
      showTradeFloat(false, 15000*mp, 2000000, 15000);
      renderMsg({addr:'0xDEV_TEST',bal:999999,type:'trade',side:'sell',amount:2000000,price:livePrice,mon:15000,time:nowTime()});
      break;
    case 'whaleBuy':
      showTradeFloat(true, 150000*mp, 20000000, 150000);
      renderMsg({addr:'0xDEV_TEST',bal:999999,type:'trade',side:'buy',amount:20000000,price:livePrice,mon:150000,time:nowTime()});
      break;
    case 'whaleSell':
      showTradeFloat(false, 200000*mp, 30000000, 200000);
      renderMsg({addr:'0xDEV_TEST',bal:999999,type:'trade',side:'sell',amount:30000000,price:livePrice,mon:200000,time:nowTime()});
      break;
    case 'megaBuy':
      showTradeFloat(true, 500000*mp, 70000000, 500000);
      renderMsg({addr:'0xDEV_TEST',bal:999999,type:'trade',side:'buy',amount:70000000,price:livePrice,mon:500000,time:nowTime()});
      break;
    case 'megaSell':
      showTradeFloat(false, 500000*mp, 70000000, 500000);
      renderMsg({addr:'0xDEV_TEST',bal:999999,type:'trade',side:'sell',amount:70000000,price:livePrice,mon:500000,time:nowTime()});
      break;
    case 'chat':
      renderMsg({addr:'0xDEV_TEST',bal:999999,msg:'🔧 Dev test message at '+nowTime(),time:nowTime()});
      break;
    case 'shout':
      showShoutPopup('0xDEV_TEST','🔧 DEV SHOUT TEST!');
      addPinnedShout('0xDEV_TEST','🔧 DEV SHOUT TEST!');
      renderMsg({addr:'0xDEV_TEST',bal:999999,msg:'📢 [SHOUT] 🔧 DEV SHOUT TEST!',time:nowTime()});
      break;
  }
}



// holderModal도 overlay 클릭으로 닫기
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});
});

// 스왑 모달 열릴 때 MON 잔고 로드
document.getElementById('swapModal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('swapModal')) closeSwapModal();
});
