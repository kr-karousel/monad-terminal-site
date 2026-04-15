// ═══════════════════════════════════════
//  MONAD TERMINAL - CONFIG
// ═══════════════════════════════════════
const TOKEN_NAME    = 'MON';
const WMON_CONTRACT = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'; // Wrapped MON (official)
const USDC_CONTRACT = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'; // Native USDC on Monad
// Main WMON/USDC pool (Uniswap V3 on Monad)
const MON_USDC_POOL = '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da';
const DEV_WALLET    = '0x38A7d00c3494ACFF01c0d216A6115A2af1A72162';
const MONAD_RPC     = 'https://rpc.monad.xyz';
const MONAD_CHAIN_ID= '0x8F'; // Monad chainId = 143

// ── Trade Alert Thresholds (MON 수량 기준) ────────────
const MON_ALERT_BIG   =   10000; // 10K  MON → BIG BUY/SELL   (~$350)
const MON_ALERT_WHALE =  100000; // 100K MON → WHALE BUY/SELL  (~$3,500)
const MON_ALERT_MEGA  = 1000000; // 1M   MON → MEGA BUY/SELL   (~$35,000)

// ── Nickname / Shout 비용 (MON 네이티브 토큰) ─────────
var NICK_COST    = 100;   // 100 MON for nickname
var SHOUT_COST   = 200;   // 200 MON for shout
var NICK_MAX_LEN = 20;
var NICK_MIN_LEN = 2;
var NICK_BANNED  = [
  'admin','mod','moderator','staff','dev','owner',
  'official','support','scam','monad_official',
  'monad_team','monad_dev','mon_official','0x'
];
var nickDB = {};

// ── Supabase 실시간 동기화 설정 ──────────────────────────
const SUPABASE_URL      = 'https://phjolzvyewacjqausmxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';

// ── 누락 전역변수 선언
var priceRefreshStarted = false;
var cachedMonPrice      = 0.035; // MON/USD (자동 업데이트)

const FIXED_TF = 1; // 1분봉 고정

// ── DEX/CEX 구매 경로 ────────────────────────────────
const BUY_ROUTES = [
  { name: 'Kuru',     url: 'https://www.kuru.io/trade/MON-USDC',       type: 'dex', label: '🔵 Kuru (DEX)' },
  { name: 'Monorail', url: 'https://monorail.xyz',                      type: 'dex', label: '🟣 Monorail (Aggregator)' },
  { name: 'Binance',  url: 'https://www.binance.com/en/trade/MON_USDT', type: 'cex', label: '🟡 Binance' },
  { name: 'OKX',      url: 'https://www.okx.com/trade-spot/mon-usdt',  type: 'cex', label: '⚪ OKX' },
  { name: 'Coinbase', url: 'https://www.coinbase.com/price/monad',      type: 'cex', label: '🔵 Coinbase' },
  { name: 'Bitget',   url: 'https://www.bitget.com/spot/MONUSDT',       type: 'cex', label: '🟢 Bitget' },
];

// ══════════════════════════════════════
//  RANKS (MON 보유량 기준)
// ══════════════════════════════════════
const RANKS = [
  { min: 1000000, label: 'Monad Overlord',   badge: '👑 OVERLORD', cls: 'r1' },
  { min: 500000,  label: 'Monad Titan',      badge: '🐉 TITAN',    cls: 'r2' },
  { min: 100000,  label: 'Monad Validator',  badge: '⚡ VALID',     cls: 'r3' },
  { min: 50000,   label: 'Monad Whale',      badge: '🐳 WHALE',    cls: 'r4' },
  { min: 10000,   label: 'Monad Maxi',       badge: '💎 MAXI',     cls: 'r5' },
  { min: 1000,    label: 'Monad Degen',      badge: '🔥 DEGEN',    cls: 'r6' },
  { min: 100,     label: 'Monad Pleb',       badge: '🟣 PLEB',     cls: 'r7' },
  { min: 10,      label: 'MON Holder',       badge: '💸 HOLDER',   cls: 'r8' },
  { min: 1,       label: 'Dust Collector',   badge: '🙏 DUST',     cls: 'r9' },
  { min: 0,       label: 'Zero Gas Ghost',   badge: '👻 GHOST',    cls: 'r10' },
];

function getRank(b, addr) {
  if (addr && addr.toLowerCase() === DEV_WALLET.toLowerCase()) {
    return { min: 0, label: 'Monad Terminal DEV', badge: '🛠️ DEV', cls: 'r1', isDev: true };
  }
  if (addr) {
    const ct = devCustomTiers[addr.toLowerCase()];
    if (ct) return { min: 0, label: ct, badge: '🏷️ ' + ct, cls: 'r1', isCustom: true };
  }
  return RANKS.find(r => b >= r.min) || RANKS[9];
}

function nowTime() {
  const n = new Date();
  return n.getHours() + ':' + String(n.getMinutes()).padStart(2, '0');
}
function escHtml(s) {
  if (typeof s !== 'string') return s || '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatK(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

// ── 기간별 통계 ──────────────────────────
var currentStatPeriod = 'h1';
var statCache = {};

function setStatPeriod(period) {
  currentStatPeriod = period;
  document.querySelectorAll('.stats-period-tab').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab-' + period);
  if (tab) tab.classList.add('active');
  renderStatGrid(period);
}

function updateAthGauge(mcap) {
  const ATH_MCAP = 500000000; // $500M ATH 기준
  const pct = Math.min(100, (mcap / ATH_MCAP) * 100);
  const gauge = document.getElementById('athGauge');
  const pctEl = document.getElementById('athPct');
  if (gauge) gauge.style.width = Math.max(2, pct).toFixed(1) + '%';
  if (pctEl) pctEl.textContent = pct.toFixed(1) + '% of ATH';
}

function updateStatPanel(pairData) {
  if (!pairData) return;
  if (pairData.marketCap) updateAthGauge(pairData.marketCap);
  const pc = pairData.priceChange || {};
  const periods = [{ k: 'm5', l: '30M' }, { k: 'h1', l: '1H' }, { k: 'h6', l: '6H' }, { k: 'h24', l: '24H' }];
  periods.forEach(({ k }) => {
    const pct = parseFloat(pc[k] || 0);
    const el  = document.getElementById('pct-' + k);
    const tab = document.getElementById('tab-' + k);
    if (el) {
      el.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      el.style.color = pct >= 0 ? 'var(--green)' : 'var(--red)';
    }
    if (tab) tab.className = 'stats-period-tab' + (currentStatPeriod === k ? ' active' : '') + (pct >= 0 ? ' up' : ' dn');
  });
  const vol = (pairData.volume || {})[currentStatPeriod] || (pairData.volume || {}).h24 || 0;
  const volEl = document.getElementById('statVol');
  if (volEl) volEl.textContent = '$' + formatK(vol);
  const vol24 = (pairData.volume || {}).h24 || 0;
  if (vol24 > 0) {
    const volStr = '$' + formatK(vol24);
    const tv1 = document.getElementById('tickerVol'); if (tv1) tv1.textContent = volStr;
    const tv2 = document.getElementById('tickerVol2'); if (tv2) tv2.textContent = volStr;
  }
  statCache = pairData;
  renderStatGrid(currentStatPeriod);
}

function renderStatGrid(period) {
  const p = statCache;
  if (!p || !p.txns) return;
  const t  = p.txns?.[period]   || p.txns?.h24   || {};
  const v  = p.volume?.[period] || p.volume?.h24  || 0;
  const buys  = t.buys  || 0;
  const sells = t.sells || 0;
  const total = buys + sells || 1;
  const buyPct  = Math.round(buys / total * 100);
  const sellPct = 100 - buyPct;
  const set  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setW = (id, w)   => { const el = document.getElementById(id); if (el) el.style.width = w + '%'; };
  set('sg-txns',    (buys + sells) || '—');
  set('sg-buys',    buys  || '—');
  set('sg-sells',   sells || '—');
  set('sg-vol',     '$' + formatK(v));
  set('sg-buyvol',  p.buyVol  ? '$' + formatK(p.buyVol)  : '—');
  set('sg-sellvol', p.sellVol ? '$' + formatK(p.sellVol) : '—');
  set('sg-makers',  p.makers  || '—');
  set('sg-buyers',  p.buyers  || '—');
  set('sg-sellers', p.sellers || '—');
  setW('sg-buys-bar',  buyPct);
  setW('sg-sells-bar', sellPct);
}

function fmtMcap(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}
