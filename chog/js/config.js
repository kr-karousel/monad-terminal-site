// ═══════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════
const CHOG_CONTRACT = '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777';
const KURU_PAIR     = '0x8638804effceaf43ccd67e2cbf2059a648f79ad7';
const NADFUN_POOL   = '0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1'; // Capricorn V3 CHOG/WMON
const WMON_CONTRACT = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'; // Wrapped MON (official)
const DEV_WALLET    = '0x38A7d00c3494ACFF01c0d216A6115A2af1A72162';
const MONAD_RPC     = 'https://rpc.monad.xyz';
const MONAD_CHAIN_ID= '0x8F'; // Monad chainId = 143
// ── Nad.fun / Capricorn DEX ───────────────────────────
const NADFUN_ROUTER    = '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137'; // Capricorn V3 Router (buy/sell)
const NADFUN_LENS      = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea'; // Lens: getAmountOut / isGraduated
const BONDING_ROUTER   = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22'; // Bonding curve router (pre-grad)
const KURU_URL      = 'https://www.kuru.io/token/'+CHOG_CONTRACT;
const TRADE_TOPIC   = '0x9bf11e9ba677c0fd17d95d9812f3b5079882637ad648410ebb7f654269560f4f';
const TOTAL_SUPPLY  = 1_000_000_000; // 1B CHOG total supply
let cachedMonPrice  = 0.026;           // MON/USD (자동 업데이트)
const showMcap = true; // always show Market Cap
const FIXED_TF    = 1;       // 1분봉 고정

// ── Supabase 실시간 동기화 설정 ──────────────────────────
// https://supabase.com 에서 무료 프로젝트 생성 후 입력
// (아래 두 값이 비어 있으면 localStorage 폴백 모드로 동작)
const SUPABASE_URL      = 'https://phjolzvyewacjqausmxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';

// ── Set Nickname
// ── 누락 전역변수 선언
var priceRefreshStarted = false;

var NICK_COST = 2000;
var NICK_MAX_LEN = 20;
var NICK_MIN_LEN = 2;
var NICK_BANNED  = [
  'benja','toad','admin','mod','moderator','staff','dev','owner',
  'official','support','scam','chog_official','nadfun',
  'capricorn','monad','monad_team','0x'
];
var nickDB = {};

// ── 거래 알림 임계값 (MON 기준)
var MON_BIG   = 1000;   // 1,000 MON 이상 플로팅
var MON_WHALE = 100000; // 100,000 MON 이상 웨일
var SHOUT_COST = 2000;
const TOKEN_NAME = 'CHOG';

// ═══════════════════════════════════════
//  RANKS
// ═══════════════════════════════════════
const RANKS=[
  {min:100000000,label:'CHOG GOD',badge:'👑 GOD',cls:'r1'},
  {min:10000000,label:'Dragon Overlord',badge:'🐉 DRAGON',cls:'r2'},
  {min:1000000,label:'CHOG Emperor',badge:'👸 EMPEROR',cls:'r3'},
  {min:100000,label:'Royal Whale',badge:'🐳 WHALE',cls:'r4'},
  {min:50000,label:'Noble Flexer',badge:'🥂 NOBLE',cls:'r5'},
  {min:10000,label:'Market Hustler',badge:'💹 HUSTLER',cls:'r6'},
  {min:1000,label:"McDonald's Shift Legend",badge:'🍔 SHIFT',cls:'r7'},
  {min:100,label:'Side Hustle Kid',badge:'💸 HUSTLE',cls:'r8'},
  {min:1,label:'Street Beggar',badge:'🙏 BEGGAR',cls:'r9'},
  {min:0,label:'ZeroCHOG Ghost',badge:'👻 GHOST',cls:'r10'},
];
function getRank(b, addr){
  // DEV 지갑은 항상 최상위 계급으로 표시
  if(addr && addr.toLowerCase() === DEV_WALLET.toLowerCase()){
    return {min:0,label:'CHOG Terminal DEV',badge:'🛠️ DEV',cls:'r1',isDev:true};
  }
  // 커스텀 Tier 라벨 확인
  if(addr){
    const ct = devCustomTiers[addr.toLowerCase()];
    if(ct) return {min:0, label:ct, badge:'🏷️ '+ct, cls:'r1', isCustom:true};
  }
  return RANKS.find(r=>b>=r.min)||RANKS[9];
}
function nowTime(){const n=new Date();return n.getHours()+':'+String(n.getMinutes()).padStart(2,'0');}
function escHtml(s){
  if(typeof s !== 'string') return s||'';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatK(n){if(n>=1e6)return(n/1e6).toFixed(2)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return n.toFixed(0);}

// ── 기간별 통계 ──────────────────────────
var currentStatPeriod = 'h1';
var statCache = {};

function setStatPeriod(period){
  currentStatPeriod = period;
  document.querySelectorAll('.stats-period-tab').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab-'+period);
  if(tab) tab.classList.add('active');
  renderStatGrid(period);
}

function updateAthGauge(mcap){
  const ATH_MCAP = 12880000; // $12.88M
  const pct = Math.min(100, (mcap / ATH_MCAP) * 100);
  const gauge = document.getElementById('athGauge');
  const pctEl = document.getElementById('athPct');
  if(gauge) gauge.style.width = Math.max(2, pct).toFixed(1) + '%';
  if(pctEl) pctEl.textContent = pct.toFixed(1) + '% of ATH';
}

function updateStatPanel(pairData){
  if(!pairData) return;
  // ATH 게이지도 여기서 업데이트
  if(pairData.marketCap) updateAthGauge(pairData.marketCap);
  const pc = pairData.priceChange || {};
  const periods = [{k:'m5',l:'30M'},{k:'h1',l:'1H'},{k:'h6',l:'6H'},{k:'h24',l:'24H'}];
  periods.forEach(({k}) => {
    const pct = parseFloat(pc[k]||0);
    const el  = document.getElementById('pct-'+k);
    const tab = document.getElementById('tab-'+k);
    if(el){
      el.textContent = (pct>=0?'+':'')+pct.toFixed(2)+'%';
      el.style.color = pct>=0 ? 'var(--green)' : 'var(--red)';
    }
    if(tab) tab.className = 'stats-period-tab'+(currentStatPeriod===k?' active':'')+(pct>=0?' up':' dn');
  });
  // ATH (DEXScreener에서 안 줌 — 하드코딩 유지)
  // Volume
  const vol = (pairData.volume||{})[currentStatPeriod] || (pairData.volume||{}).h24 || 0;
  const volEl = document.getElementById('statVol');
  if(volEl) volEl.textContent = '$'+formatK(vol);
  // 티커바 24h Vol 업데이트
  const vol24 = (pairData.volume||{}).h24 || 0;
  if(vol24 > 0){
    const volStr = '$'+formatK(vol24);
    const tv1=document.getElementById('tickerVol');if(tv1)tv1.textContent=volStr;
    const tv2=document.getElementById('tickerVol2');if(tv2)tv2.textContent=volStr;
  }
  // 통계 저장
  statCache = pairData;
  renderStatGrid(currentStatPeriod);
}

function renderStatGrid(period){
  const p = statCache;
  if(!p || !p.txns) return;
  const t  = p.txns?.[period]   || p.txns?.h24   || {};
  const v  = p.volume?.[period] || p.volume?.h24  || 0;
  const bv = p.volumeBase?.[period] || 0; // 없을수도

  const buys  = t.buys  || 0;
  const sells = t.sells || 0;
  const total = buys + sells || 1;
  const buyPct  = Math.round(buys/total*100);
  const sellPct = 100-buyPct;

  const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  const setW = (id,w) => { const el=document.getElementById(id); if(el) el.style.width=w+'%'; };

  set('sg-txns',   (buys+sells)||'—');
  set('sg-buys',   buys||'—');
  set('sg-sells',  sells||'—');
  set('sg-vol',    '$'+formatK(v));
  set('sg-buyvol', p.buyVol  ? '$'+formatK(p.buyVol)  : '—');
  set('sg-sellvol',p.sellVol ? '$'+formatK(p.sellVol) : '—');
  set('sg-makers', p.makers  || '—');
  set('sg-buyers', p.buyers  || '—');
  set('sg-sellers',p.sellers || '—');
  setW('sg-buys-bar',  buyPct);
  setW('sg-sells-bar', sellPct);
}

function fmtMcap(n){
  if(n>=1e9)  return (n/1e9).toFixed(2)+'B';
  if(n>=1e6)  return (n/1e6).toFixed(2)+'M';
  if(n>=1e3)  return (n/1e3).toFixed(1)+'K';
  return n.toFixed(0);
}

// toggleMcap removed — always show Market Cap

