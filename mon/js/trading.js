// ═══════════════════════════════════════
//  MONAD TERMINAL - TRADING
//  MON은 네이티브 토큰이므로 외부 거래소 링크 제공
// ═══════════════════════════════════════

function openKuru(side) {
  openSwapModal(side || 'buy');
}

function openSwapModal(side) {
  const modal = document.getElementById('swapModal');
  if (!modal) return;
  switchSwapSide(side || 'buy');
  modal.classList.add('open');
}

function closeSwapModal() {
  const modal = document.getElementById('swapModal');
  if (modal) modal.classList.remove('open');
}

function switchSwapSide(side) {
  currentSwapSide = side;
  const isBuy = side === 'buy';

  document.getElementById('swapBuyBtn')?.classList.toggle('active', isBuy);
  document.getElementById('swapSellBtn')?.classList.toggle('active', !isBuy);

  const titleEl = document.getElementById('swapModalTitle');
  if (titleEl) {
    titleEl.textContent = isBuy ? '▲ BUY MON' : '▼ SELL MON';
    titleEl.style.color = isBuy ? 'var(--green)' : 'var(--red)';
  }

  renderBuyRoutes(isBuy);
}

// ── 구매/판매 경로 렌더링 ────────────────────────────
function renderBuyRoutes(isBuy) {
  const container = document.getElementById('swapRoutesContainer');
  if (!container) return;

  const priceStr = cachedMonPrice ? '$' + cachedMonPrice.toFixed(4) : '—';

  container.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-align:center">
        Current MON Price: <b style="color:var(--accent)">${priceStr}</b>
      </div>
      ${isBuy
        ? '<div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:10px">💡 Best way to buy MON on-chain or CEX</div>'
        : '<div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:10px">💡 Swap MON on DEX or sell on CEX</div>'
      }
    </div>

    <div class="buy-routes-section">
      <div class="buy-routes-label">🔵 DEX (On-Chain)</div>
      ${BUY_ROUTES.filter(r => r.type === 'dex').map(r => `
        <a href="${r.url}" target="_blank" rel="noopener" class="buy-route-btn dex">
          <span>${r.label}</span>
          <span style="font-size:10px;color:var(--muted)">↗</span>
        </a>
      `).join('')}
    </div>

    <div class="buy-routes-section" style="margin-top:10px">
      <div class="buy-routes-label">🟡 CEX (Centralized Exchange)</div>
      ${BUY_ROUTES.filter(r => r.type === 'cex').map(r => `
        <a href="${r.url}" target="_blank" rel="noopener" class="buy-route-btn cex">
          <span>${r.label}</span>
          <span style="font-size:10px;color:var(--muted)">↗</span>
        </a>
      `).join('')}
    </div>

    <div style="margin-top:12px;padding:8px 12px;background:rgba(139,92,246,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:8px;font-size:10px;color:var(--muted);text-align:center">
      MON is Monad's native token.<br>
      For on-chain swaps, use Kuru or Monorail on Monad network.
    </div>
  `;
}

var currentSwapSide = 'buy';

// ── HOLDER MODAL ─────────────────────────────────────
var holderCurrentTab = 'holders';
var holderCache = null;
var holderCacheTime = 0;

function openHolderModal() {
  const modal = document.getElementById('holderModal');
  if (!modal) return;
  modal.classList.add('open');
  if (!holderCache || Date.now() - holderCacheTime > 60000) {
    fetchTopHolders();
  } else {
    renderHolderList(holderCache);
  }
}

function closeHolderModal() {
  const modal = document.getElementById('holderModal');
  if (modal) modal.classList.remove('open');
}

function switchHolderTab(tab) {
  holderCurrentTab = tab;
  document.querySelectorAll('.holder-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('htab-' + tab);
  if (el) el.classList.add('active');
  if (tab === 'holders') {
    if (holderCache) renderHolderList(holderCache);
    else fetchTopHolders();
  } else {
    renderRecentTrades();
  }
}

async function fetchTopHolders() {
  const listEl = document.getElementById('holderList');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">Loading...</div>';
  try {
    // BlockVision holder list for WMON (or MON native top holders)
    const BV_URL = `https://api.blockvision.org/v2/monad/account/tokens/holders?contractAddress=${WMON_CONTRACT}&limit=50`;
    const PROXY  = `https://api.allorigins.win/raw?url=${encodeURIComponent(BV_URL)}`;
    let items = [];
    for (const url of [BV_URL, PROXY]) {
      try {
        const res = await fetch(url, { headers: { 'accept': 'application/json' } });
        if (!res.ok) continue;
        const d = await res.json();
        items = d?.result?.data || d?.data || [];
        if (items.length) break;
      } catch(e) {}
    }
    holderCache = items;
    holderCacheTime = Date.now();
    renderHolderList(items);
  } catch(e) {
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);font-size:12px">Failed to load holders</div>';
  }
}

function renderHolderList(items) {
  const listEl = document.getElementById('holderList');
  if (!listEl) return;
  if (!items || !items.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">No holder data available</div>';
    return;
  }
  listEl.innerHTML = items.slice(0, 50).map((h, i) => {
    const addr = h.holder || h.accountAddress || h.address || '';
    const bal  = parseFloat(h.balance || h.quantity || 0) / 1e18;
    const short = addr ? addr.slice(0, 8) + '...' + addr.slice(-6) : '—';
    const nick  = getNick(addr) || short;
    const rank  = getRank(Math.floor(bal), addr);
    const pct   = (bal / 10e9 * 100).toFixed(3);
    return `<div class="holder-row${i < 3 ? ' top3' : ''}" onclick="openProfileModal('${addr}',${Math.floor(bal)},'${rank.cls}','${rank.badge}','')">
      <span class="holder-rank">#${i + 1}</span>
      <span class="holder-addr">${nick}</span>
      <span class="rank-badge ${rank.cls}" style="font-size:9px">${rank.badge}</span>
      <span class="holder-bal">${formatK(bal)} MON</span>
      <span class="holder-pct">${pct}%</span>
    </div>`;
  }).join('');
}

function renderRecentTrades() {
  const listEl = document.getElementById('holderList');
  if (!listEl) return;
  const recent = (window.trades || []).slice(-20).reverse();
  if (!recent.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">No recent trades</div>';
    return;
  }
  listEl.innerHTML = recent.map(t => {
    const isBuy = t.isBuy;
    const usdStr = '$' + formatK(t.usd || 0);
    const monStr = formatK(t.mon || 0) + ' MON';
    const timeAgo = Math.floor((Date.now() / 1000 - t.time));
    const tStr = timeAgo < 60 ? timeAgo + 's ago' : Math.floor(timeAgo / 60) + 'm ago';
    return `<div class="holder-row" style="border-left:2px solid ${isBuy ? 'var(--green)' : 'var(--red)'}">
      <span style="font-size:11px;font-weight:700;color:${isBuy ? 'var(--green)' : 'var(--red)'}">${isBuy ? '▲ BUY' : '▼ SELL'}</span>
      <span style="font-size:11px;flex:1;text-align:center">${monStr}</span>
      <span style="font-size:11px;color:var(--accent)">${usdStr}</span>
      <span style="font-size:10px;color:var(--muted)">${tStr}</span>
    </div>`;
  }).join('');
}
