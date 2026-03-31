// ═══════════════════════════════════════
//  REVENUE DASHBOARD
// ═══════════════════════════════════════

const CONTRIB_KEY = 'chog_contrib_v1';
const REV_TOP_N   = 20; // only top 20 are eligible for payout

function getContribDB() {
  try { return JSON.parse(localStorage.getItem(CONTRIB_KEY) || '{}'); }
  catch(e) { return {}; }
}
function saveContribDB(db) {
  localStorage.setItem(CONTRIB_KEY, JSON.stringify(db));
}
function getOrCreateContrib(addr) {
  const db  = getContribDB();
  const key = addr.toLowerCase();
  if (!db[key]) db[key] = { chatHours: [], nickCount: 0, shoutCount: 0 };
  return { db, key };
}

// ── Contribution trackers (called from app.js hooks) ──
function trackChatPoint() {
  if (!wallet) return;
  const { db, key } = getOrCreateContrib(wallet.addr);
  const hourKey = Math.floor(Date.now() / 3600000);
  if (!db[key].chatHours.includes(hourKey)) {
    db[key].chatHours.push(hourKey);
    if (db[key].chatHours.length > 720) db[key].chatHours = db[key].chatHours.slice(-720);
    saveContribDB(db);
  }
}
function trackNickPoint() {
  if (!wallet) return;
  const { db, key } = getOrCreateContrib(wallet.addr);
  db[key].nickCount = (db[key].nickCount || 0) + 1;
  saveContribDB(db);
}
function trackShoutPoint() {
  if (!wallet) return;
  const { db, key } = getOrCreateContrib(wallet.addr);
  db[key].shoutCount = (db[key].shoutCount || 0) + 1;
  saveContribDB(db);
}

// ── Points calculator ──
function calcUserPoints(entry) {
  const chatPts  = (entry.chatHours || []).length;
  const nickPts  = (entry.nickCount  || 0) * 10;
  const shoutPts = (entry.shoutCount || 0) * 10;
  return { chatPts, nickPts, shoutPts, total: chatPts + nickPts + shoutPts };
}

// ── Fetch CHOG balance of DEV_WALLET (direct mainnet RPC — bypasses wallet provider to avoid testnet mismatch) ──
async function fetchDevChogBalance() {
  const MAINNET_RPCS = [
    'https://rpc.monad.xyz',
    'https://monad-mainnet.rpc.thirdweb.com',
    'https://monad.drpc.org',
  ];
  const padAddr = DEV_WALLET.slice(2).padStart(64, '0');
  const data    = '0x70a08231' + padAddr; // balanceOf(DEV_WALLET)
  for (const rpc of MAINNET_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: CHOG_CONTRACT, data }, 'latest'] }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.result && d.result !== '0x' && d.result.length >= 10) {
        return Number(BigInt(d.result)) / 1e18;
      }
    } catch(e) {}
  }
  return 0;
}

// ── Modal open/close ──
function openRevenueModal() {
  document.getElementById('revenueModal').classList.add('open');
  renderRevenueModal();
}
function closeRevenueModal() {
  document.getElementById('revenueModal').classList.remove('open');
}

// ── Helpers ──
function isDevWallet() {
  return wallet && wallet.addr.toLowerCase() === DEV_WALLET.toLowerCase();
}

// ── Render ──
let _revDevBal = null;

async function renderRevenueModal() {
  _revDevBal = null;
  const balEl  = document.getElementById('rev-dev-bal');
  const poolEl = document.getElementById('rev-pool');
  if (balEl)  balEl.textContent  = 'Loading…';
  if (poolEl) poolEl.textContent = 'Loading…';

  renderContribTable(null);
  renderDevControls(null);

  const devBal  = await fetchDevChogBalance();
  _revDevBal    = devBal;
  const poolAmt = devBal * 0.5;

  if (balEl)  balEl.textContent  = devBal.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' CHOG';
  if (poolEl) poolEl.textContent = poolAmt.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' CHOG';

  renderContribTable(devBal);
  renderDevControls(devBal);
}

// ── Contribution table (top 20 only) ──
function renderContribTable(devBal) {
  const tbody  = document.getElementById('rev-contrib-table');
  if (!tbody) return;

  const db      = getContribDB();
  const myAddr  = wallet?.addr?.toLowerCase();
  const all     = Object.entries(db)
    .map(([addr, entry]) => ({ addr, ...calcUserPoints(entry), nickCount: entry.nickCount || 0, shoutCount: entry.shoutCount || 0 }))
    .sort((a, b) => b.total - a.total);

  const top = all.slice(0, REV_TOP_N).filter(e => e.total > 0);

  if (top.length === 0) {
    const msg = wallet
      ? 'No contributions yet.<br>Earn points by chatting, changing your nickname, and shouting!'
      : 'Connect your wallet to start tracking contributions.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px;font-size:12px">${msg}</td></tr>`;
    return;
  }

  // Denominator = sum of top 20 only (100% of pool distributed among them)
  const totalPts = top.reduce((s, e) => s + e.total, 0);

  let rows = '';
  top.forEach((e, idx) => {
    const isMe   = e.addr === myAddr;
    const pct    = totalPts > 0 ? (e.total / totalPts * 100) : 0;
    const est    = (devBal != null && totalPts > 0) ? (devBal * 0.5 * e.total / totalPts) : null;
    const nick   = (typeof getNick === 'function' ? getNick(e.addr) : null) || (e.addr.slice(0,6) + '…' + e.addr.slice(-4));
    const rowCls = isMe ? 'rev-my-row' : (idx % 2 === 1 ? 'rev-row-alt' : '');
    rows += `<tr class="${rowCls}">
      <td class="rev-td" style="color:${isMe ? 'var(--accent)' : 'var(--text)'}">
        <span class="rev-pt" style="margin-right:4px">#${idx + 1}</span>${isMe ? '⭐ ' : ''}${escHtml(nick)}
      </td>
      <td class="rev-td rev-tc">${e.chatPts} <span class="rev-pt">pt</span></td>
      <td class="rev-td rev-tc">${e.nickCount} <span class="rev-pt">(${e.nickPts}pt)</span></td>
      <td class="rev-td rev-tc">${e.shoutCount} <span class="rev-pt">(${e.shoutPts}pt)</span></td>
      <td class="rev-td rev-tc rev-bold rev-gold">${e.total}</td>
      <td class="rev-td rev-tc rev-pct">${pct.toFixed(1)}%</td>
      <td class="rev-td rev-tr rev-est">${est != null ? '~' + Math.floor(est).toLocaleString() + ' CHOG' : '—'}</td>
    </tr>`;
  });
  tbody.innerHTML = rows;
}

// ── Dev-only controls ──
function renderDevControls(devBal) {
  const el = document.getElementById('rev-dev-controls');
  if (!el) return;
  if (!isDevWallet()) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:14px">
      <div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:10px">🔧 Dev Controls</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="devResetPoints()" style="padding:7px 14px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:8px;color:#fca5a5;font-size:12px;cursor:pointer;font-family:inherit">
          🔄 Reset All Points
        </button>
        <button onclick="devDistributeRevenue()" style="padding:7px 14px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.35);border-radius:8px;color:#86efac;font-size:12px;cursor:pointer;font-family:inherit">
          💸 Distribute Revenue (Top ${REV_TOP_N})
        </button>
      </div>
    </div>`;
}

// ── Dev: Reset all contribution points ──
function devResetPoints() {
  if (!isDevWallet()) return;
  if (!confirm('Reset ALL contribution points to zero?\nThis cannot be undone.')) return;
  localStorage.removeItem(CONTRIB_KEY);
  renderRevenueModal();
}

// ── Dev: Distribute revenue to top 20 ──
async function devDistributeRevenue() {
  if (!isDevWallet()) return;
  if (!window.ethereum) { alert('No wallet provider found.'); return; }

  const devBal = _revDevBal;
  if (!devBal || devBal <= 0) { alert('Dev wallet balance is 0.'); return; }

  const db  = getContribDB();
  const top = Object.entries(db)
    .map(([addr, entry]) => ({ addr, ...calcUserPoints(entry) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, REV_TOP_N)
    .filter(e => e.total > 0);

  if (top.length === 0) { alert('No contributors found.'); return; }

  const poolAmt  = devBal * 0.5;
  const totalPts = top.reduce((s, e) => s + e.total, 0);

  const preview = top.map((e, i) => {
    const nick = (typeof getNick === 'function' ? getNick(e.addr) : null) || e.addr.slice(0,10) + '…';
    const amt  = Math.floor(poolAmt * e.total / totalPts);
    const pct  = (e.total / totalPts * 100).toFixed(1);
    return `#${i+1} ${nick} → ${amt.toLocaleString()} CHOG (${pct}%)`;
  }).join('\n');

  if (!confirm(`Distribute ${Math.floor(poolAmt).toLocaleString()} CHOG to ${top.length} contributors?\n\n${preview}\n\nThis will send ${top.length} transactions. Confirm each in your wallet.`)) return;

  let success = 0, failed = 0;
  for (const e of top) {
    const amt = Math.floor(poolAmt * e.total / totalPts);
    if (amt <= 0) continue;
    try {
      const amtWei = BigInt(amt) * BigInt('1000000000000000000');
      const padTo  = e.addr.slice(2).padStart(64, '0');
      const padAmt = amtWei.toString(16).padStart(64, '0');
      await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: wallet.addr, to: CHOG_CONTRACT, data: '0xa9059cbb' + padTo + padAmt }],
      });
      success++;
    } catch(err) {
      if (err.code === 4001) { alert(`Transaction cancelled. Sent ${success} so far.`); return; }
      console.warn('Transfer failed for', e.addr, err.message);
      failed++;
    }
  }
  alert(`Distribution complete!\n✅ ${success} sent  ❌ ${failed} failed`);
}
