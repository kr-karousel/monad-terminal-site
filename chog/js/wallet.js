// ═══════════════════════════════════════
//  WALLET
// ═══════════════════════════════════════
let wallet=null,chogBalance=0;
// ── NICKNAME SYSTEM ─────────────────────────────────
// NICK 상수는 CONFIG 섹션으로 이동

// ── WELCOME MODAL ────────────────────────────────────
function toggleAgree(){
  const cb  = document.getElementById('agreeCheck');
  const btn = document.getElementById('enterBtn');
  if(!cb || !btn) return;
  btn.classList.toggle('ready', cb.checked);
}

function enterApp(){
  const cb = document.getElementById('agreeCheck');
  if(!cb || !cb.checked) return;
  try { localStorage.setItem('chog_agreed', '1'); } catch(e){}
  const overlay = document.getElementById('welcomeOverlay');
  if(overlay){
    overlay.style.transition = 'opacity .4s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }
}

function checkWelcome(){
  try {
    if(localStorage.getItem('chog_agreed') === '1'){
      const overlay = document.getElementById('welcomeOverlay');
      if(overlay) overlay.remove();
    }
  } catch(e){}
}

function loadNickDB(){
  try { nickDB = JSON.parse(localStorage.getItem('chog_nicks')||'{}'); } catch(e){ nickDB={}; }
  // 개발자 지갑 닉네임 고정
  nickDB['0x38a7d00c3494acff01c0d216a6115a2af1a72162'] = 'CHOG Terminal DEV 🟣';
}
function saveNickDB(){
  try { localStorage.setItem('chog_nicks', JSON.stringify(nickDB)); } catch(e){}
}
function getNick(addr){
  if(!addr) return null;
  return nickDB[addr.toLowerCase()] || null;
}
function displayName(addr, short){
  const nick = getNick(addr);
  return nick ? nick : (short || (addr.slice(0,6)+'...'+addr.slice(-4)));
}

function validateNick(nick){
  if(!nick || nick.length < NICK_MIN_LEN) return 'Min '+NICK_MIN_LEN+' chars';
  if(nick.length > NICK_MAX_LEN) return 'Max '+NICK_MAX_LEN+' chars';
  if(!/^[a-zA-Z0-9_\-가-힣]+$/.test(nick)) return 'Letters, numbers, _ - only';
  const lower = nick.toLowerCase();
  for(const banned of NICK_BANNED){
    if(lower.includes(banned)) return '"'+banned+'" not allowed';
  }
  return null; // OK
}

function openNickModal(){
  if(!wallet){ alert('Connect your wallet first!'); return; }
  const modal = document.getElementById('nickModal');
  const body  = document.getElementById('nickModalBody');
  const curNick = getNick(wallet.addr);

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:14px">
      <div class="rank-badge ${getRank(wallet.bal).cls}" style="font-size:13px;padding:4px 12px;display:inline-block">
        ${getRank(wallet.bal).badge}
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted);margin-top:6px">
        ${wallet.addr.slice(0,8)}...${wallet.addr.slice(-6)}
      </div>
      ${curNick ? `<div style="font-size:12px;margin-top:4px;color:var(--accent)">Current nickname: <b>${curNick}</b></div>` : ''}
    </div>

    <div class="nick-input-wrap">
      <label>${curNick ? 'Change Nickname' : 'Set Nickname'}</label>
      <input class="nick-input" id="nickInput" maxlength="${NICK_MAX_LEN}"
        placeholder="Enter nickname..."
        oninput="onNickInput(this.value)"
        value="${curNick||''}">
    </div>

    <div id="nickError" style="font-size:11px;color:var(--red);min-height:16px;margin-bottom:8px;text-align:center"></div>

    <div class="nick-rules">
      ✅ Letters, numbers, _ -<br>
      ✅ ${NICK_MIN_LEN}~${NICK_MAX_LEN}자<br>
      ❌ No impersonation of staff/official accounts<br>
      ❌ admin, staff, dev, official 등 not allowed
    </div>

    <div class="nick-cost">
      <span style="color:var(--muted)">Cost</span>
      <span class="nick-cost-badge" id="nickCostDisplay">💜 ${NICK_COST.toLocaleString()} CHOG</span>
    </div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:12px">
      Balance: <b style="color:var(--accent)">${wallet.bal.toLocaleString()} CHOG</b>
      ${wallet.bal < NICK_COST ? ' <span style="color:var(--red)">(insufficient)</span>' : ''}
    </div>

    <button class="btn-set-nick" onclick="confirmSetNick()" id="btnSetNick">
      ✏️ Set Nickname
    </button>
  `;

  modal.classList.add('open');
  setTimeout(()=>{ const el=document.getElementById('nickInput'); if(el)el.focus(); }, 100);
}

function closeNickModal(){ document.getElementById('nickModal').classList.remove('open'); }

function onNickInput(val){
  const err = validateNick(val);
  const errEl = document.getElementById('nickError');
  const btn   = document.getElementById('btnSetNick');
  if(errEl) errEl.textContent = err || '';
  if(btn) btn.disabled = !!err;
}

async function confirmSetNick(){
  const nick = (document.getElementById('nickInput')?.value||'').trim();
  const err  = validateNick(nick);
  if(err){ alert('Nickname error: '+err); return; }
  if(!wallet){ alert('Wallet not connected!'); return; }
  if(wallet.bal < NICK_COST){
    alert('Insufficient balance!\nNeed: '+NICK_COST.toLocaleString()+' CHOG\nHave: '+wallet.bal.toLocaleString()+' CHOG');
    return;
  }

  // CHOG 10,000 전송 (dev wallet)
  try {
    const provider = window.ethereum;
    if(provider){
      const padTo  = DEV_WALLET.slice(2).padStart(64,'0');
      const amtWei = BigInt(NICK_COST) * BigInt('1000000000000000000');
      const padAmt = amtWei.toString(16).padStart(64,'0');
      const txHash = await provider.request({
        method:'eth_sendTransaction',
        params:[{from:wallet.addr, to:CHOG_CONTRACT, data:'0xa9059cbb'+padTo+padAmt}]
      });
      console.log('Nickname tx:', txHash);
    }
  } catch(e){
    if(e.code === 4001){ alert('Transaction cancelled.'); return; }
    console.warn('Nickname tx failed:', e.message);
    // tx 실패해도 로컬 등록은 진행 (테스트용)
  }

  // 닉네임 등록
  wallet.bal -= NICK_COST;
  nickDB[wallet.addr.toLowerCase()] = nick;
  saveNickDB();
  // 서버에 동기화 (Supabase 활성화 시 다른 브라우저에도 즉시 반영)
  if(typeof syncNickToServer === 'function') syncNickToServer(wallet.addr, nick);

  // 지갑 표시 업데이트
  updateWalletDisplay();
  closeNickModal();

  renderMsg({
    addr: nick,
    addrFull: wallet.addr,
    bal: wallet.bal,
    msg: '✏️ Joined as "'+nick+'"!',
    time: nowTime()
  });
  alert('✅ Nickname "'+nick+'" registered!');
}

function updateWalletDisplay(){
  if(!wallet) return;
  const rank  = getRank(wallet.bal, wallet.addr);
  const nick  = getNick(wallet.addr);
  const label = nick || (wallet.addr.slice(0,6)+'...'+wallet.addr.slice(-4));
  document.getElementById('walletArea').innerHTML =
    `<div class="wallet-info" style="cursor:pointer" onclick="openNickModal()">
      <span class="wallet-addr">${label}</span>
      <span class="rank-badge ${rank.cls}">${rank.badge}</span>
      <span style="font-size:10px;font-family:'Share Tech Mono',monospace;color:var(--muted)">${wallet.bal.toLocaleString()} CHOG</span>
      <span class="nick-badge" title="Change nickname">✏️</span>
    </div>`;
}

// loadNickDB는 startApp에서 호출

// ── USER PROFILE MODAL ────────────────────────────
function openProfileModal(addrFull, bal, rankCls, rankBadge, txHash){
  const modal = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  if(!modal||!content) return;

  const short = addrFull.length > 10
    ? addrFull.slice(0,8)+'...'+addrFull.slice(-6)
    : addrFull;
  const rank = getRank(bal);
  const nick = getNick(addrFull);
  const explorerUrl = txHash ? `https://monadvision.com/tx/${txHash}` : `https://monadvision.com/address/${addrFull}`;
  const isMe = wallet && wallet.addr.toLowerCase() === addrFull.toLowerCase();

  // CHOG 잔액 추정 (실제 조회는 비동기)
  content.innerHTML = `
    <div class="profile-avatar">${rank.badge.split(' ')[0]}</div>
    ${nick ? `<div style="font-family:'Bangers',cursive;font-size:20px;letter-spacing:1px;color:var(--accent);text-align:center;margin-bottom:2px">${nick}</div>` : ''}
    <div class="profile-addr" style="font-size:11px;opacity:0.7">${addrFull || short}</div>
    <div class="profile-rank-big ${rankCls}">${rank.label}</div>

    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileChogBal">${bal>0?bal.toLocaleString():'—'}</div>
        <div class="profile-stat-lbl">CHOG</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileUsd">$${bal>0?(bal*(livePrice||0.000731)).toFixed(2):'—'}</div>
        <div class="profile-stat-lbl">USD Est.</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileRank" style="color:var(--gold)">⏳</div>
        <div class="profile-stat-lbl">Holder Rank</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" id="profilePct" style="font-size:12px">⏳</div>
        <div class="profile-stat-lbl">% of Supply</div>
      </div>
    </div>

    <div class="profile-action-row">
      <button class="btn-profile-action" onclick="window.open('${explorerUrl}','_blank')">🔍 Explorer</button>
      <button class="btn-profile-action" onclick="copyAddr('${addrFull}')">📋 Copy Address</button>
    </div>

    ${!isMe && wallet ? `
    <div class="send-amount-wrap">
      <label>Amount to Send (CHOG)</label>
      <input class="send-amount-input" id="sendChogAmount" type="number" placeholder="0" min="1">
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-align:center">
      Balance: <b style="color:var(--accent)">${wallet.bal.toLocaleString()} CHOG</b>
    </div>
    <button class="btn-send-chog" onclick="sendChogTo('${addrFull}')">
      💜 CHOG Send
    </button>
    ` : isMe ? `
    <div style="text-align:center;padding:12px;background:rgba(192,132,252,0.08);border-radius:10px;font-size:12px;color:var(--accent)">
      👑 This is your wallet
    </div>
    ` : `
    <div style="text-align:center;padding:12px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Connect your wallet to send CHOG</div>
      <button onclick="closeProfileModal();openWalletModal()"
        style="width:100%;padding:12px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-family:'Bangers',cursive;font-size:18px;letter-spacing:1px;cursor:pointer">
        🔗 Connect Wallet
      </button>
    </div>
    `}
  `;

  modal.classList.add('open');

  // 실제 CHOG 잔액 + 랭킹 비동기 조회
  if(addrFull && addrFull.startsWith('0x') && addrFull.length===42){
    fetchChogBalance(addrFull).then(realBal => {
      if(realBal === null) return;
      const balInt = Math.floor(realBal);
      const el = document.getElementById('profileChogBal');
      if(el) el.textContent = balInt.toLocaleString();
      const usdEl = document.getElementById('profileUsd');
      if(usdEl) usdEl.textContent = '$' + (balInt*(livePrice||0.000731)).toFixed(2);
      // 퍼센트 계산
      const pctEl = document.getElementById('profilePct');
      if(pctEl) pctEl.textContent = ((balInt/1e9)*100).toFixed(3)+'%';
    });
    // 홀더 랭킹 조회
    getHolderRank(addrFull).then(rank => {
      const el = document.getElementById('profileRank');
      if(el) el.textContent = rank ? '#'+rank : '—';
    });
  }
}

function closeProfileModal(){
  document.getElementById('profileModal').classList.remove('open');
}

async function getHolderRank(addr){
  const lower = addr.toLowerCase();

  // Use cached holder list first (populated by fetchTopHolders)
  if(holderCache && holderCache.length > 0){
    const idx = holderCache.findIndex(h => h.address.toLowerCase() === lower);
    if(idx !== -1) return idx + 1;
    // If cache has 50 items and addr not found, it's outside top 50
    if(holderCache.length >= 50) return null;
  }

  // Fallback: query BlockVision directly
  const BV_URL = `https://api.blockvision.org/v2/monad/token/holders?contractAddress=${CHOG_CONTRACT}&limit=50`;
  const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(BV_URL)}`;
  for(const url of [BV_URL, PROXY_URL]){
    try {
      const res = await fetch(url, {headers:{'accept':'application/json'}});
      if(!res.ok) continue;
      const d = await res.json();
      const items = d?.result?.data || [];
      if(!items.length) continue;
      const idx = items.findIndex(h =>
        (h.holder || h.accountAddress || '').toLowerCase() === lower
      );
      if(idx !== -1) return idx + 1;
      return null;
    } catch(e){}
  }
  return null;
}

async function fetchChogBalance(addr){
  try{
    const padded = addr.slice(2).padStart(64,'0');
    const hex = await rpcCallAny('eth_call',[{to:CHOG_CONTRACT, data:'0x70a08231'+padded},'latest']);
    if(!hex||hex==='0x') return null;
    const raw = hex.replace('0x','')||'0';
    return BigInt ? Number(BigInt('0x'+(raw||'0'))/BigInt('1000000000000000'))/1000 : parseInt(raw.slice(0,-15)||'0',16)/1000;
  }catch(e){ return null; }
}

function copyAddr(addr){
  navigator.clipboard.writeText(addr).then(()=>{
    alert('Address copied!\n'+addr);
  }).catch(()=>{
    // fallback
    const el=document.createElement('textarea');
    el.value=addr; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    alert('Address copied!');
  });
}

async function sendChogTo(toAddr){
  if(!wallet){ alert('Connect your wallet first!'); return; }
  const amtEl = document.getElementById('sendChogAmount');
  const amt   = parseFloat(amtEl?.value||0);
  if(!amt||amt<=0){ alert('Enter amount to send!'); return; }
  if(amt > wallet.bal){ alert('Insufficient balance!\nHave: '+wallet.bal.toLocaleString()+' CHOG\nSend: '+amt.toLocaleString()+' CHOG'); return; }

  try{
    const provider = window.ethereum;
    if(!provider) throw new Error('No wallet found');

    // ERC-20 transfer(address,uint256)
    const padTo  = toAddr.slice(2).padStart(64,'0');
    const amtWei = BigInt(Math.floor(amt)) * BigInt('1000000000000000000'); // 18 decimals
    const padAmt = amtWei.toString(16).padStart(64,'0');
    const data   = '0xa9059cbb' + padTo + padAmt;

    const txHash = await provider.request({
      method:'eth_sendTransaction',
      params:[{from:wallet.addr, to:CHOG_CONTRACT, data}]
    });

    wallet.bal -= amt;
    closeProfileModal();
    alert('✅ Transfer complete!\n'+amt.toLocaleString()+' CHOG → '+toAddr.slice(0,8)+'...\nTx: '+(txHash?.slice(0,20)||'')+'...');
    renderMsg({addr:wallet.addr.slice(0,6)+'...'+wallet.addr.slice(-4), bal:wallet.bal, msg:`💜 ${toAddr.slice(0,6)}...to ${amt.toLocaleString()} CHOG sent!`, time:nowTime()});
  }catch(e){
    alert('Transfer failed: '+(e.message||e));
  }
}

// ── SWAP MODAL - Native On-chain Swap ─────────────────
// Direct on-chain swap via nad.fun DEX router
// Router: Capricorn / nad.fun 풀 직접 호출 (eth_sendTransaction)

var currentSwapSide = 'buy'; // 'buy' | 'sell'
var swapSlippage = 10;       // %
var swapQuoteTimer = null;

// Capricorn V3 / nad.fun Router 주소 (Monad mainnet)
const NADFUN_URL    = 'https://nad.fun/tokens/' + CHOG_CONTRACT;

