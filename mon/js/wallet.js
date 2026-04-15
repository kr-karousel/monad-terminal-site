// ═══════════════════════════════════════
//  MONAD TERMINAL - WALLET
//  MON은 네이티브 토큰 (eth_getBalance 사용)
// ═══════════════════════════════════════
let wallet = null, monBalance = 0;

// ── WELCOME MODAL ────────────────────────────────────
function toggleAgree() {
  const cb  = document.getElementById('agreeCheck');
  const btn = document.getElementById('enterBtn');
  if (!cb || !btn) return;
  btn.classList.toggle('ready', cb.checked);
}

function enterApp() {
  const cb = document.getElementById('agreeCheck');
  if (!cb || !cb.checked) return;
  try { localStorage.setItem('mon_agreed', '1'); } catch(e) {}
  const overlay = document.getElementById('welcomeOverlay');
  if (overlay) {
    overlay.style.transition = 'opacity .4s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }
}

function checkWelcome() {
  try {
    if (localStorage.getItem('mon_agreed') === '1') {
      const overlay = document.getElementById('welcomeOverlay');
      if (overlay) overlay.remove();
    }
  } catch(e) {}
}

// ── NICKNAME DB ──────────────────────────────────────
function loadNickDB() {
  try { nickDB = JSON.parse(localStorage.getItem('mon_nicks') || '{}'); } catch(e) { nickDB = {}; }
  nickDB['0x38a7d00c3494acff01c0d216a6115a2af1a72162'] = 'Monad Terminal DEV 🟣';
}
function saveNickDB() {
  try { localStorage.setItem('mon_nicks', JSON.stringify(nickDB)); } catch(e) {}
}
function getNick(addr) {
  if (!addr) return null;
  return nickDB[addr.toLowerCase()] || null;
}
function displayName(addr, short) {
  const nick = getNick(addr);
  return nick ? nick : (short || (addr.slice(0, 6) + '...' + addr.slice(-4)));
}

function validateNick(nick) {
  if (!nick || nick.length < NICK_MIN_LEN) return 'Min ' + NICK_MIN_LEN + ' chars';
  if (nick.length > NICK_MAX_LEN) return 'Max ' + NICK_MAX_LEN + ' chars';
  if (!/^[a-zA-Z0-9_\-가-힣]+$/.test(nick)) return 'Letters, numbers, _ - only';
  const lower = nick.toLowerCase();
  for (const banned of NICK_BANNED) {
    if (lower.includes(banned)) return '"' + banned + '" not allowed';
  }
  return null;
}

// ── MON 네이티브 잔고 조회 ────────────────────────────
async function fetchMonBalance(addr) {
  try {
    const hex = await rpcCallAny('eth_getBalance', [addr, 'latest']);
    if (!hex || hex === '0x') return 0;
    return Number(BigInt(hex)) / 1e18;
  } catch(e) { return 0; }
}

async function openNickModal() {
  if (!wallet) { alert('Connect your wallet first!'); return; }
  const modal = document.getElementById('nickModal');
  const body  = document.getElementById('nickModalBody');
  const curNick = getNick(wallet.addr);

  modal.classList.add('open');
  body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">⏳ Refreshing balance...</div>`;

  const freshBal = await fetchMonBalance(wallet.addr);
  wallet.bal = freshBal;
  monBalance = freshBal;
  updateWalletDisplay();

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:14px">
      <div class="rank-badge ${getRank(wallet.bal).cls}" style="font-size:13px;padding:4px 12px;display:inline-block">
        ${getRank(wallet.bal).badge}
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted);margin-top:6px">
        ${wallet.addr.slice(0, 8)}...${wallet.addr.slice(-6)}
      </div>
      ${curNick ? `<div style="font-size:12px;margin-top:4px;color:var(--accent)">Current nickname: <b>${curNick}</b></div>` : ''}
    </div>

    <div class="nick-input-wrap">
      <label>${curNick ? 'Change Nickname' : 'Set Nickname'}</label>
      <input class="nick-input" id="nickInput" maxlength="${NICK_MAX_LEN}"
        placeholder="Enter nickname..."
        oninput="onNickInput(this.value)"
        value="${curNick || ''}">
    </div>

    <div id="nickError" style="font-size:11px;color:var(--red);min-height:16px;margin-bottom:8px;text-align:center"></div>

    <div class="nick-rules">
      ✅ Letters, numbers, _ -<br>
      ✅ ${NICK_MIN_LEN}~${NICK_MAX_LEN} chars<br>
      ❌ No impersonation of staff/official accounts
    </div>

    <div class="nick-cost">
      <span style="color:var(--muted)">Cost</span>
      <span class="nick-cost-badge" id="nickCostDisplay">🟣 ${NICK_COST} MON</span>
    </div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:12px">
      Balance: <b style="color:var(--accent)">${wallet.bal.toFixed(2)} MON</b>
      ${wallet.bal < NICK_COST ? ' <span style="color:var(--red)">(insufficient)</span>' : ''}
    </div>

    <button class="btn-set-nick" onclick="confirmSetNick()" id="btnSetNick">
      ✏️ Set Nickname
    </button>
  `;

  setTimeout(() => { const el = document.getElementById('nickInput'); if (el) el.focus(); }, 100);
}

function closeNickModal() { document.getElementById('nickModal').classList.remove('open'); }

function onNickInput(val) {
  const err   = validateNick(val);
  const errEl = document.getElementById('nickError');
  const btn   = document.getElementById('btnSetNick');
  if (errEl) errEl.textContent = err || '';
  if (btn) btn.disabled = !!err;
}

async function confirmSetNick() {
  const nick = (document.getElementById('nickInput')?.value || '').trim();
  const err  = validateNick(nick);
  if (err) { alert('Nickname error: ' + err); return; }
  if (!wallet) { alert('Wallet not connected!'); return; }
  if (wallet.bal < NICK_COST) {
    alert('Insufficient balance!\nNeed: ' + NICK_COST + ' MON\nHave: ' + wallet.bal.toFixed(2) + ' MON');
    return;
  }

  // MON 네이티브 전송 (DEV_WALLET에 NICK_COST MON)
  try {
    const provider = window.ethereum;
    if (provider) {
      // 체인 확인
      await ensureMonadChain(provider);

      const valueWei = BigInt(Math.floor(NICK_COST * 1e18));
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: wallet.addr, to: DEV_WALLET, value: '0x' + valueWei.toString(16), gas: '0x5208' }]
      });
      console.log('Nickname MON tx:', txHash);
    }
  } catch(e) {
    if (e.code === 4001) { alert('Transaction cancelled.'); return; }
    console.warn('Nickname tx failed:', e.message);
  }

  wallet.bal -= NICK_COST;
  nickDB[wallet.addr.toLowerCase()] = nick;
  saveNickDB();
  if (typeof syncNickToServer === 'function') syncNickToServer(wallet.addr, nick);
  if (typeof trackNickPoint === 'function') trackNickPoint();

  updateWalletDisplay();
  closeNickModal();

  renderMsg({
    addr: nick,
    addrFull: wallet.addr,
    bal: wallet.bal,
    msg: '✏️ Joined as "' + nick + '"!',
    time: nowTime()
  });
  alert('✅ Nickname "' + nick + '" registered!');
}

// ── 체인 전환 헬퍼 ─────────────────────────────────
async function ensureMonadChain(provider) {
  try {
    const currentChain = await provider.request({ method: 'eth_chainId' });
    if (currentChain.toLowerCase() === MONAD_CHAIN_ID.toLowerCase()) return;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_ID }] });
    } catch(sw) {
      if (sw.code === 4902 || sw.code === -32603) {
        await provider.request({
          method: 'wallet_addEthereumChain', params: [{
            chainId: MONAD_CHAIN_ID, chainName: 'Monad',
            nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
            rpcUrls: ['https://rpc.monad.xyz'],
            blockExplorerUrls: ['https://explorer.monad.xyz']
          }]
        });
      }
    }
  } catch(e) {}
}

// ── 지갑 표시 업데이트 ─────────────────────────────
function updateWalletDisplay() {
  if (!wallet) return;
  const rank  = getRank(wallet.bal, wallet.addr);
  const nick  = getNick(wallet.addr);
  const label = nick || (wallet.addr.slice(0, 6) + '...' + wallet.addr.slice(-4));
  document.getElementById('walletArea').innerHTML =
    `<div class="wallet-info">
      <span style="cursor:pointer;display:flex;align-items:center;gap:6px" onclick="openNickModal()">
        <span class="wallet-addr">${label}</span>
        <span class="rank-badge ${rank.cls}">${rank.badge}</span>
        <span style="font-size:10px;font-family:'Share Tech Mono',monospace;color:var(--muted)">${wallet.bal.toFixed(2)} MON</span>
        <span class="nick-badge" title="Change nickname">✏️</span>
      </span>
      <span style="width:1px;height:14px;background:rgba(255,255,255,0.15);margin:0 2px;flex-shrink:0"></span>
      <button onclick="openPnlModal()" title="My trades & position" style="background:none;border:none;color:var(--muted);font-size:12px;padding:0 3px;cursor:pointer;line-height:1;flex-shrink:0" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--muted)'">📊</button>
      <span style="width:1px;height:14px;background:rgba(255,255,255,0.15);margin:0 2px;flex-shrink:0"></span>
      <button onclick="disconnectWallet()" title="Disconnect wallet" style="background:none;border:none;color:var(--muted);font-size:15px;font-weight:700;padding:0 2px;cursor:pointer;line-height:1;flex-shrink:0" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='var(--muted)'">×</button>
    </div>`;
}

// ── USER PROFILE MODAL ────────────────────────────
function openProfileModal(addrFull, bal, rankCls, rankBadge, txHash) {
  const modal   = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  if (!modal || !content) return;

  const short = addrFull.length > 10
    ? addrFull.slice(0, 8) + '...' + addrFull.slice(-6)
    : addrFull;
  const rank = getRank(bal, addrFull);
  const nick = getNick(addrFull);
  const explorerUrl = txHash
    ? `https://monadvision.com/tx/${txHash}`
    : `https://monadvision.com/address/${addrFull}`;
  const isMe = wallet && wallet.addr.toLowerCase() === addrFull.toLowerCase();

  content.innerHTML = `
    <div class="profile-avatar">${rank.badge.split(' ')[0]}</div>
    ${nick ? `<div style="font-family:'Bangers',cursive;font-size:20px;letter-spacing:1px;color:var(--accent);text-align:center;margin-bottom:2px">${nick}</div>` : ''}
    <div class="profile-addr" style="font-size:11px;opacity:0.7">${addrFull || short}</div>
    <div class="profile-rank-big ${rankCls}">${rank.label}</div>

    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileMonBal">${bal > 0 ? bal.toFixed(2) : '—'}</div>
        <div class="profile-stat-lbl">MON</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileUsd">$${bal > 0 ? (bal * (cachedMonPrice || 0.035)).toFixed(2) : '—'}</div>
        <div class="profile-stat-lbl">USD Est.</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileRank" style="color:var(--gold)">⏳</div>
        <div class="profile-stat-lbl">Holder Rank</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-val" id="profilePct" style="font-size:12px">—</div>
        <div class="profile-stat-lbl">% Supply</div>
      </div>
    </div>

    <div class="profile-action-row">
      <button class="btn-profile-action" onclick="window.open('${explorerUrl}','_blank')">🔍 Explorer</button>
      <button class="btn-profile-action" onclick="copyAddr('${addrFull}')">📋 Copy</button>
      <button class="btn-profile-action" id="btnProfileTrades" onclick="toggleProfileTrades('${addrFull}')">📊 Trades</button>
    </div>
    <div id="profileTradesPanel" style="display:none;margin-top:8px"></div>

    <!-- Chess Stats -->
    <div style="margin:8px 0;padding:8px 12px;background:rgba(139,92,246,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:10px">
      <div style="font-size:10px;color:var(--muted);font-weight:700;margin-bottom:6px;letter-spacing:0.5px">♟️ CHESS RECORD</div>
      <div style="display:flex;gap:12px;justify-content:center">
        <div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--green)" id="profileChessW">—</div><div style="font-size:9px;color:var(--muted)">WINS</div></div>
        <div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#fca5a5" id="profileChessL">—</div><div style="font-size:9px;color:var(--muted)">LOSSES</div></div>
        <div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--gold)" id="profileChessRate">—</div><div style="font-size:9px;color:var(--muted)">WIN%</div></div>
        <div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--accent)" id="profileChessPts">—</div><div style="font-size:9px;color:var(--muted)">PTS</div></div>
      </div>
    </div>

    ${!isMe && wallet ? `
    <div class="send-amount-wrap">
      <label>Amount to Send (MON)</label>
      <input class="send-amount-input" id="sendMonAmount" type="number" placeholder="0" min="0.01" step="0.01">
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-align:center">
      Balance: <b style="color:var(--accent)">${wallet.bal.toFixed(2)} MON</b>
    </div>
    <button class="btn-send-mon" onclick="sendMonTo('${addrFull}')">
      🟣 MON Send
    </button>
    <button class="btn-chess-challenge" onclick="closeProfileModal();chessSendInvite('${addrFull}')">
      ♟️ Challenge to Chess
    </button>
    ` : isMe ? `
    <div style="text-align:center;padding:12px;background:rgba(124,58,237,0.08);border-radius:10px;font-size:12px;color:var(--accent)">
      👑 This is your wallet
    </div>
    ` : `
    <div style="text-align:center;padding:12px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Connect your wallet to send MON</div>
      <button onclick="closeProfileModal();openWalletModal()"
        style="width:100%;padding:12px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-family:'Bangers',cursive;font-size:18px;letter-spacing:1px;cursor:pointer">
        🔗 Connect Wallet
      </button>
    </div>
    `}
  `;

  modal.classList.add('open');

  // 실제 MON 잔고 비동기 조회
  if (addrFull && addrFull.startsWith('0x') && addrFull.length === 42) {
    fetchMonBalance(addrFull).then(realBal => {
      if (realBal === null) return;
      const el = document.getElementById('profileMonBal');
      if (el) el.textContent = realBal.toFixed(2);
      const usdEl = document.getElementById('profileUsd');
      if (usdEl) usdEl.textContent = '$' + (realBal * (cachedMonPrice || 0.035)).toFixed(2);
      const realRank = getRank(realBal, addrFull);
      const rankEl = document.querySelector('.profile-rank-big');
      if (rankEl) { rankEl.textContent = realRank.label; rankEl.className = 'profile-rank-big ' + realRank.cls; }
      const avatarEl = document.querySelector('.profile-avatar');
      if (avatarEl) avatarEl.textContent = realRank.badge.split(' ')[0];
    });
    // 체스 전적
    if (typeof chessLoadStats === 'function') {
      chessLoadStats(addrFull).then(stats => {
        const wEl  = document.getElementById('profileChessW');
        const lEl  = document.getElementById('profileChessL');
        const rEl  = document.getElementById('profileChessRate');
        const ptEl = document.getElementById('profileChessPts');
        if (!wEl) return;
        const w = stats ? stats.wins   : 0;
        const l = stats ? stats.losses : 0;
        const total = w + l;
        wEl.textContent  = w;
        lEl.textContent  = l;
        rEl.textContent  = total > 0 ? Math.round(w / total * 100) + '%' : '—';
        ptEl.textContent = stats ? stats.pts || 0 : 0;
      });
    }
  }
}

function closeProfileModal() { document.getElementById('profileModal').classList.remove('open'); }

function copyAddr(addr) {
  navigator.clipboard.writeText(addr).then(() => {
    alert('Address copied!\n' + addr);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = addr; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    alert('Address copied!');
  });
}

// ── MON 네이티브 전송 ──────────────────────────────
async function sendMonTo(toAddr) {
  if (!wallet) { alert('Connect your wallet first!'); return; }
  const amtEl = document.getElementById('sendMonAmount');
  const amt   = parseFloat(amtEl?.value || 0);
  if (!amt || amt <= 0) { alert('Enter amount to send!'); return; }
  if (amt > wallet.bal) {
    alert('Insufficient balance!\nHave: ' + wallet.bal.toFixed(2) + ' MON\nSend: ' + amt + ' MON');
    return;
  }

  try {
    const provider = window.ethereum;
    if (!provider) throw new Error('No wallet found');
    await ensureMonadChain(provider);

    const valueWei = BigInt(Math.floor(amt * 1e18));
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: wallet.addr, to: toAddr, value: '0x' + valueWei.toString(16), gas: '0x5208' }]
    });

    wallet.bal -= amt;
    closeProfileModal();
    alert('✅ Transfer complete!\n' + amt + ' MON → ' + toAddr.slice(0, 8) + '...\nTx: ' + (txHash?.slice(0, 20) || '') + '...');
    renderMsg({ addr: wallet.addr.slice(0, 6) + '...' + wallet.addr.slice(-4), bal: wallet.bal, msg: `🟣 ${toAddr.slice(0, 6)}...에게 ${amt} MON 전송!`, time: nowTime() });
  } catch(e) {
    alert('Transfer failed: ' + (e.message || e));
  }
}

// ── SWAP MODAL (Buy/Sell routes) ───────────────────
var currentSwapSide = 'buy';

function toggleProfileTrades(addr) {
  const panel = document.getElementById('profileTradesPanel');
  const btn   = document.getElementById('btnProfileTrades');
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = '';
    if (btn) btn.style.background = 'rgba(124,58,237,0.15)';
    if (typeof loadProfileTrades === 'function') loadProfileTrades(addr, 'profileTradesPanel');
  } else {
    panel.style.display = 'none';
    if (btn) btn.style.background = '';
  }
}

// ── 지갑 연결 (별도 connectWallet 함수는 app.js에서 처리) ──
async function getMonBalanceForWallet() {
  if (!wallet) return;
  const bal = await fetchMonBalance(wallet.addr);
  wallet.bal = bal;
  monBalance = bal;
  updateWalletDisplay();
}

async function disconnectWallet() {
  wallet = null;
  monBalance = 0;
  document.getElementById('walletArea').innerHTML =
    `<button onclick="openWalletModal()" class="btn-connect">🔗 Connect Wallet</button>`;
}

// ── Holder Rank 조회 (holderCache 기반, fetchTopHolders fallback) ──
async function getHolderRank(addr) {
  const lower = addr.toLowerCase();
  if (typeof holderCache !== 'undefined' && holderCache && holderCache.length > 0) {
    const idx = holderCache.findIndex(h => (h.address || '').toLowerCase() === lower);
    if (idx !== -1) return idx + 1;
    if (holderCache.length >= 50) return null;
  }
  try {
    if (typeof fetchTopHolders === 'function') {
      const holders = await fetchTopHolders();
      if (holders && holders.length > 0) {
        const idx = holders.findIndex(h => (h.address || '').toLowerCase() === lower);
        if (idx !== -1) return idx + 1;
      }
    }
  } catch(e) {}
  return null;
}
