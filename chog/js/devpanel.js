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

// ═══════════════════════════════════════

var _shoutPopupTimers = [];
function showShoutPopup(addr,msg){
  const p=document.getElementById('shoutPopup');if(!p)return;
  // 이전 타이머 전부 취소 후 새로 시작 (연속 shout 시 조기 종료 방지)
  _shoutPopupTimers.forEach(t=>clearTimeout(t));
  _shoutPopupTimers=[];
  p.classList.remove('active','fadeout');
  void p.offsetWidth; // reflow
  p.innerHTML=`<div class="shout-popup-bubble">📢 ${escHtml(addr)}: ${escHtml(msg)}</div>`;
  p.classList.add('active');
  _shoutPopupTimers.push(setTimeout(()=>p.classList.add('fadeout'),2500));
  _shoutPopupTimers.push(setTimeout(()=>{p.classList.remove('active','fadeout');p.innerHTML='';},3100));
}

// ── SHOUT PIN: 영구 노출, 최대 3개, FIFO, localStorage 영속화 ───
const SHOUT_MAX_SLOTS = 3;
var pinnedShouts = []; // {addr, msg, id}

function saveShoutsToStorage(){
  try{ localStorage.setItem('chog_shouts', JSON.stringify(pinnedShouts)); }catch(e){}
}

function loadShoutsFromStorage(){
  try{
    const saved = localStorage.getItem('chog_shouts');
    if(!saved) return;
    const list = JSON.parse(saved);
    if(!Array.isArray(list)) return;
    pinnedShouts = list.slice(-SHOUT_MAX_SLOTS); // 최대 3개만
    const c = document.getElementById('shoutPinned');
    if(c){
      c.innerHTML = '';
      pinnedShouts.forEach(entry => _renderPinnedShout(c, entry));
    }
  }catch(e){}
}

function addPinnedShout(addr, msg){
  const c = document.getElementById('shoutPinned');
  if(!c) return;
  const nick = getNick(addr) || addr;
  const entry = { addr: nick, msg, id: Date.now() + Math.random() };

  // 3개 꽉 차면 가장 오래된 것 DOM에서 제거
  if(pinnedShouts.length >= SHOUT_MAX_SLOTS){
    const oldest = pinnedShouts.shift();
    const oldEl = c.querySelector(`[data-id="${oldest.id}"]`);
    if(oldEl){ oldEl.classList.add('pin-fadeout'); setTimeout(()=>oldEl.remove(), 500); }
  }

  pinnedShouts.push(entry);
  _renderPinnedShout(c, entry);
  saveShoutsToStorage();
}

function _renderPinnedShout(c, entry){
  const item = document.createElement('div');
  item.className = 'shout-pin-item';
  item.dataset.id = entry.id;
  item.innerHTML = `
    <div class="shout-pin-addr">📢 ${escHtml(entry.addr)}</div>
    <div style="line-height:1.4">${escHtml(entry.msg)}</div>`;
  c.appendChild(item); // 최신이 맨 아래 (오래된 게 위)
}

function clearAllShouts(){
  pinnedShouts = [];
  const c = document.getElementById('shoutPinned');
  if(c) c.innerHTML = '';
  saveShoutsToStorage();
}

async function doShout(){
  if(!wallet){alert('Please connect your wallet first!');return;}
  const isDev = wallet.addr.toLowerCase()===DEV_WALLET.toLowerCase();
  if(!isDev && wallet.bal<SHOUT_COST){
    alert('You need '+SHOUT_COST.toLocaleString()+' CHOG to shout!\nBalance: '+wallet.bal.toLocaleString()+' CHOG');
    return;
  }
  const msg=document.getElementById('shoutInput').value.trim();
  if(!msg){alert('Please enter a shout message!');return;}
  if(!isDev){
    try{
      const provider=window.ethereum;
      if(provider&&wallet.addr.length===42){
        const paddedTo=DEV_WALLET.slice(2).padStart(64,'0');
        const paddedAmt='00000000000000000000000000000000000000000000010f0cf064dd59200000';
        await provider.request({method:'eth_sendTransaction',params:[{from:wallet.addr,to:CHOG_CONTRACT,data:'0xa9059cbb'+paddedTo+paddedAmt}]});
      }
    }catch(e){console.warn('Shout tx:',e.message);}
    wallet.bal-=SHOUT_COST;chogBalance=wallet.bal;
  }
  const shoutNick = getNick(wallet.addr) || (wallet.addr.slice(0,6)+'...'+wallet.addr.slice(-4));
  const shoutBal = wallet.bal; // 차감 후 잔액 그대로 사용 (계급 변경 방지 위해 원래 bal 유지)
  showShoutPopup(shoutNick,msg);
  renderMsg({addr:wallet.addr,addrFull:wallet.addr,bal:shoutBal,msg:'📢 [SHOUT] '+msg,time:nowTime()});
  const sh=document.getElementById('shoutHistory');
  if(sh){const item=document.createElement('div');item.className='shout-item';item.innerHTML=`<div class="shout-item-addr">${shoutNick} · ${nowTime()}</div><div>${msg}</div>`;sh.insertBefore(item,sh.firstChild);}
  if(isSyncEnabled()){
    // Supabase 활성화: 서버에 저장 → subscription이 핀 추가 처리 (전 브라우저 동기화)
    syncShoutToServer(wallet.addr,shoutNick,msg);
  }else{
    // 로컬 모드: localStorage에 저장
    addPinnedShout(wallet.addr,msg);
  }
  document.getElementById('shoutInput').value='';
}

// demoShout 제거됨 (라이브 모드)

function openKuruExternal(){
  window.open(KURU_URL, '_blank');
}

// holderModal도 overlay 클릭으로 닫기
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});
});

// 스왑 모달 열릴 때 MON 잔고 로드
document.getElementById('swapModal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('swapModal')) closeSwapModal();
});

