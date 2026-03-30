// ═══════════════════════════════════════
// ── DEMO/FAKE 채팅 OFF — 정식 라이브 모드 ──
var chatList = document.getElementById('chatList');

function renderMsg(item){
  if(!chatList) chatList = document.getElementById('chatList');
  if(!chatList)return;
  const rank=getRank(item.bal||0, item.addrFull||item.addr||'');
  const div=document.createElement('div');
  const addrFull = item.addrFull || item.addr || '';
  // 닉네임 있으면 닉네임으로 표시
  const nick = getNick(addrFull);
  const displayAddr = nick
    ? `<span style="color:var(--accent);font-weight:700">${nick}</span>`
    : item.addr;

  const addrHtml = `<span class="msg-addr" style="cursor:pointer;text-decoration:underline dotted" onclick="openProfileModal('${addrFull}',${item.bal||0},'${rank.cls}','${rank.badge}','${item.txHash||''}')">${displayAddr}</span>`;

  if(item.type==='trade'){
    const mon = item.mon || 0;
    const isBuy = item.side==='buy';

    // MON 규모별 이모지
    let sizeEmoji = '';
    if(mon >= 10000){
      // 10,000 MON 이상: 고래(매수) / ☠️(매도), 100K당 1개 추가
      const count = Math.max(1, Math.min(5, Math.floor(mon/100000)));
      sizeEmoji = isBuy ? '🐳'.repeat(count) : '☠️'.repeat(count);
    } else if(mon >= 1000){
      // 1,000 MON당 🚀(매수) / 💀(매도), Max 5개
      const count = Math.min(5, Math.floor(mon/1000));
      sizeEmoji = isBuy ? '🚀'.repeat(count) : '💀'.repeat(count);
    }

    div.className='chat-msg '+(isBuy?'trade-alert':'trade-sell');
    if(mon >= 10000) div.style.cssText += ';border-width:2px;';
    chogEmotion(item.side);
    const baseEmoji = isBuy ? '🟢' : '🔴';
    const usd = ((item.amount||0)*(item.price||0)).toFixed(0);
    const monStr = mon >= 1000 ? (mon>=1000?Math.floor(mon).toLocaleString()+' MON':'') : '';

    div.innerHTML=`
      <div class="msg-meta">
        <span style="font-size:13px">${baseEmoji}</span>
        ${addrHtml}
        <span class="rank-badge ${rank.cls}">${rank.badge}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto">${item.time}</span>
      </div>
      <div style="font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span>${isBuy?'BUY':'SELL'} ${(item.amount||0).toLocaleString()} CHOG · $${usd}</span>
        ${monStr ? `<span style="font-size:10px;color:var(--muted)">${monStr}</span>` : ''}
        ${sizeEmoji ? `<span style="font-size:${mon>=100000?'18':'14'}px;letter-spacing:2px">${sizeEmoji}</span>` : ''}
      </div>`;
  }else{
    div.className='chat-msg';
    div.innerHTML=`<div class="msg-meta">${addrHtml}<span class="rank-badge ${rank.cls}">${rank.badge}</span><span style="font-size:10px;color:var(--muted);margin-left:auto">${item.time}</span></div><div>${escHtml(item.msg)}</div>`;
  }
  chatList.appendChild(div);
  if(chatList.children.length>20)chatList.removeChild(chatList.firstChild);
  chatList.scrollTop=chatList.scrollHeight;
}

// DEMO 메시지 OFF (라이브 모드)

// FAKE 자동 메시지 OFF (라이브 모드)


function sendChat(){
  if(!wallet)return;
  const inp=document.getElementById('chatInput');
  const msg=inp.value.trim();if(!msg)return;
  renderMsg({addr:wallet.addr,bal:wallet.bal,msg,time:nowTime()});
  inp.value='';
}
document.addEventListener('DOMContentLoaded',()=>{
  const ci=document.getElementById('chatInput');
  if(ci)ci.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
});

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
      <div class="trade-float-amount">${Math.floor(chogAmount).toLocaleString()} CHOG</div>`;
  } else {
    // 10K~100K MON: 매수=🚀 매도=💀
    // 10K~100K: 1K당 로켓/해골 (Max 5개)
    const smallCount = Math.min(5, Math.max(1, Math.floor(monValue/1000)));
    const bigEmoji = isBuy ? '🚀'.repeat(smallCount) : '💀'.repeat(smallCount);
    const label    = isBuy ? '🟢 BIG BUY!' : '🔴 BIG SELL!';
    wrap.innerHTML = `
      <div class="trade-float-emoji">${bigEmoji}</div>
      <div class="trade-float-bubble ${isBuy?'buy':'sell'}">${label} ${monDisplay}</div>
      <div class="trade-float-amount">${Math.floor(chogAmount).toLocaleString()} CHOG</div>`;
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
  addPinnedShout(wallet.addr,msg);
  renderMsg({addr:wallet.addr,addrFull:wallet.addr,bal:shoutBal,msg:'📢 [SHOUT] '+msg,time:nowTime()});
  const sh=document.getElementById('shoutHistory');
  if(sh){const item=document.createElement('div');item.className='shout-item';item.innerHTML=`<div class="shout-item-addr">${shoutNick} · ${nowTime()}</div><div>${msg}</div>`;sh.insertBefore(item,sh.firstChild);}
  document.getElementById('shoutInput').value='';
}

// demoShout 제거됨 (라이브 모드)

function openKuruExternal(){
  window.open(KURU_URL, '_blank');
}
