// ═══════════════════════════════════════
//  REVENUE DASHBOARD
// ═══════════════════════════════════════

const CONTRIB_KEY = 'chog_contrib_v1';

function getContribDB() {
  try { return JSON.parse(localStorage.getItem(CONTRIB_KEY) || '{}'); }
  catch(e) { return {}; }
}
function saveContribDB(db) {
  localStorage.setItem(CONTRIB_KEY, JSON.stringify(db));
}
function getOrCreateContrib(addr) {
  const db = getContribDB();
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

// ── Fetch CHOG balance of DEV_WALLET ──
async function fetchDevChogBalance() {
  try {
    const padAddr = DEV_WALLET.slice(2).padStart(64, '0');
    const result  = await rpcCallAny('eth_call', [{ to: CHOG_CONTRACT, data: '0x70a08231' + padAddr }, 'latest']);
    if (!result || result === '0x' || result.length < 10) return 0;
    return Number(BigInt(result)) / 1e18;
  } catch(e) { return 0; }
}

// ── Modal open/close ──
function openRevenueModal() {
  document.getElementById('revenueModal').classList.add('open');
  renderRevenueModal();
}
function closeRevenueModal() {
  document.getElementById('revenueModal').classList.remove('open');
}

// ── Render ──
let _revDevBal = null;

async function renderRevenueModal() {
  _revDevBal = null;
  const balEl  = document.getElementById('rev-dev-bal');
  const poolEl = document.getElementById('rev-pool');
  if (balEl)  balEl.textContent  = '조회 중…';
  if (poolEl) poolEl.textContent = '조회 중…';

  renderContribTable(null);

  const devBal  = await fetchDevChogBalance();
  _revDevBal    = devBal;
  const poolAmt = devBal * 0.5;

  if (balEl)  balEl.textContent  = devBal.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' CHOG';
  if (poolEl) poolEl.textContent = poolAmt.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' CHOG';

  renderContribTable(devBal);
}

function renderContribTable(devBal) {
  const tbody  = document.getElementById('rev-contrib-table');
  if (!tbody) return;

  const db      = getContribDB();
  const myAddr  = wallet?.addr?.toLowerCase();
  const entries = Object.entries(db)
    .map(([addr, entry]) => ({ addr, ...calcUserPoints(entry), nickCount: entry.nickCount || 0, shoutCount: entry.shoutCount || 0 }))
    .sort((a, b) => b.total - a.total);

  if (entries.length === 0) {
    const msg = wallet
      ? '아직 기여 활동이 없습니다.<br>채팅, 닉네임 변경, 샤우트로 포인트를 쌓아보세요!'
      : '지갑을 연결하면 기여도를 추적할 수 있습니다.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px;font-size:12px">${msg}</td></tr>`;
    return;
  }

  const totalPts = entries.reduce((s, e) => s + e.total, 0);

  let rows = '';
  entries.forEach((e, idx) => {
    const isMe  = e.addr === myAddr;
    const pct   = totalPts > 0 ? (e.total / totalPts * 100) : 0;
    const est   = (devBal != null && totalPts > 0) ? (devBal * 0.5 * e.total / totalPts) : null;
    const nick  = (typeof getNick === 'function' ? getNick(e.addr) : null) || (e.addr.slice(0,6) + '…' + e.addr.slice(-4));
    const rowCls = isMe ? 'rev-my-row' : (idx % 2 === 1 ? 'rev-row-alt' : '');
    rows += `<tr class="${rowCls}">
      <td class="rev-td" style="color:${isMe ? 'var(--accent)' : 'var(--text)'}">${isMe ? '⭐ ' : ''}${escHtml(nick)}</td>
      <td class="rev-td rev-tc">${e.chatPts} <span class="rev-pt">pt</span></td>
      <td class="rev-td rev-tc">${e.nickCount}건 <span class="rev-pt">(${e.nickPts}pt)</span></td>
      <td class="rev-td rev-tc">${e.shoutCount}건 <span class="rev-pt">(${e.shoutPts}pt)</span></td>
      <td class="rev-td rev-tc rev-bold rev-gold">${e.total}</td>
      <td class="rev-td rev-tc rev-pct">${pct.toFixed(1)}%</td>
      <td class="rev-td rev-tr rev-est">${est != null ? '~' + Math.floor(est).toLocaleString() + ' CHOG' : '—'}</td>
    </tr>`;
  });
  tbody.innerHTML = rows;
}
