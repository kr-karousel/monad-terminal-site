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

// ── Set Nickname
// ── 누락 전역변수 선언
var priceRefreshStarted = false;

var NICK_COST = 2000;
var NICK_MAX_LEN = 20;
var NICK_MIN_LEN = 2;
var NICK_BANNED  = [
  'benja','toad','admin','mod','moderator','staff','dev','owner',
  'official','support','scam','chog','chog_official','nadfun',
  'capricorn','monad','monad_team','0x'
];
var nickDB = {};

// ── 거래 알림 임계값 (MON 기준)
var MON_BIG   = 10000;
var MON_WHALE = 100000; // toggle: true=mcap chart, false=price chart
var SHOUT_COST = 2000;

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

// ═══════════════════════════════════════
//  CANVAS CHART
// ═══════════════════════════════════════
let candles=[], chartOffsetX=0, currentTF=1;
let chartZoom = 1.0;        // 1.0 = 기본, 0.5 = 2배 확대, 2.0 = 축소
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3.0;
let trades=[];       // 실시간 거래 [{time, price, mcap, usd, isBuy}]
const MAX_TRADES=200;
let livePrice=0.000731, priceChange24h=-0.69;
let isDragging=false, dragStartX=0, dragStartOffset=0;
const PAD_R=75, PAD_T=10, PAD_B=28;

function initChart(){
  const w = document.getElementById('chart-wrapper');
  if(!w){ setTimeout(initChart, 100); return; }

  // DEXScreener iframe 임베드
  const tvContainer = document.getElementById('tv-chart-container');
  const fallback    = document.getElementById('chart-fallback');

  if(tvContainer){
    tvContainer.innerHTML = `<iframe
      src="https://dexscreener.com/monad/0x116e7d070f1888b81e1e0324f56d6746b2d7d8f1?embed=1&theme=dark&trades=0&info=0"
      style="width:100%;height:360px;border:none;display:block"
      allow="clipboard-write"
      title="CHOG/MON Chart">
    </iframe>`;
    tvContainer.style.display = 'block';
    if(fallback) fallback.style.display = 'none';
    console.log('✅ DEXScreener 차트 로드');

    // CHOG 캐릭터 - 마우스 따라다니기 (부드럽게)
    const chog = document.getElementById('chogChar');
    if(chog){
      document.body.appendChild(chog);
      Object.assign(chog.style, {
        position      : 'fixed',
        left          : '-200px',
        top           : '-200px',
        zIndex        : '9998',
        width         : '72px',
        pointerEvents : 'none',
        transition    : 'none',
        willChange    : 'transform',
      });

      let targetX = window.innerWidth/2;
      let targetY = window.innerHeight/2;
      let curX    = targetX;
      let curY    = targetY;
      let floatT  = 0;
      let rafId;

      document.addEventListener('mousemove', e=>{
        targetX = e.clientX - 36;
        targetY = e.clientY - 80;
      });

      document.addEventListener('touchmove', e=>{
        targetX = e.touches[0].clientX - 36;
        targetY = e.touches[0].clientY - 80;
      }, {passive:true});

      function animateChog(){
        // 부드러운 lerp (12% 씩 따라가기)
        curX += (targetX - curX) * 0.12;
        curY += (targetY - curY) * 0.12;

        // 둥둥 효과는 transform만 (left/top은 lerp로만)
        floatT += 0.04;
        const floatY = Math.sin(floatT) * 5;
        const floatR = Math.sin(floatT * 0.6) * 4;

        chog.style.left      = curX + 'px';
        chog.style.top       = curY + 'px';
        chog.style.transform = `translateY(${floatY}px) rotate(${floatR}deg)`;

        rafId = requestAnimationFrame(animateChog);
      }
      animateChog();
    }
  }

  // 실시간 가격 폴링은 계속 유지
  startPriceRefresh();
}


function candleW(){
  const c=document.getElementById('chart');
  if(!c)return 8;
  const visCount = Math.max(5, Math.round(80 * chartZoom));
  return Math.max(2, Math.floor((c.width-PAD_R)/visCount));
}

let isSimulTrades = true; // 항상 캔들차트 사용

function drawChart(){
  const canvas = document.getElementById('chart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD_L = 8, PR = PAD_R, PT = 16, PB = 28;
  const cW = W - PR - PAD_L;
  const cH = H - PB - PT;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0d0a1a';
  ctx.fillRect(0,0,W,H);

  // trades → candles 변환 후 항상 캔들차트
  if(trades.length >= 2) buildCandlesFromTrades();
  if(candles.length) drawCandleChart(ctx, W, H, cW, cH, PAD_L, PT, PB);
  return; // 아래 점차트 코드 사용 안 함

  // (아래는 미사용)
  if(false){

  // Y축 범위: 시총 기준
  const mcaps  = trades.map(t=>t.mcap).filter(m=>m>0);
  const minM   = Math.min(...mcaps);
  const maxM   = Math.max(...mcaps);
  const range  = maxM - minM || minM*0.02;
  const pad    = range*0.08;
  const lo     = minM - pad;
  const hi     = maxM + pad;
  const toY    = m => PT + cH*(1-(m-lo)/(hi-lo));

  // X축: 시간
  const t0 = trades[0].time;
  const t1 = trades[trades.length-1].time;
  const tRange = Math.max(t1-t0, 60);
  const toX = t => PAD_L + cW*((t-t0)/tRange);

  // 그리드
  ctx.strokeStyle='rgba(192,132,252,0.06)';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=PT+(cH/4)*i;
    ctx.beginPath();ctx.moveTo(PAD_L,y);ctx.lineTo(PAD_L+cW,y);ctx.stroke();
  }

  // 시총 라인
  ctx.beginPath();
  ctx.strokeStyle='rgba(192,132,252,0.5)';
  ctx.lineWidth=1.5;
  trades.forEach((t,i)=>{
    const x=toX(t.time), y=toY(t.mcap);
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();

  // 거래 점
  trades.forEach(t=>{
    const x=toX(t.time), y=toY(t.mcap);
    const r = Math.max(2, Math.min(7, Math.sqrt(t.usd||1)*0.45));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = t.isBuy ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,113,0.7)';
    ctx.fill();
    // 큰 거래 테두리 강조
    if(t.usd >= 100){
      ctx.strokeStyle = t.isBuy ? '#4ade80' : '#f87171';
      ctx.lineWidth=1.5;
      ctx.stroke();
    }
  });

  // 현재가 라인 (최근 거래)
  const last = trades[trades.length-1];
  const py = toY(last.mcap);
  ctx.setLineDash([4,3]);
  ctx.strokeStyle='rgba(74,222,128,0.4)';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(PAD_L,py);ctx.lineTo(PAD_L+cW,py);ctx.stroke();
  ctx.setLineDash([]);

  // 가격 축 (우측)
  ctx.fillStyle='#0d0a1a';
  ctx.fillRect(W-PR,0,PR,H);
  ctx.strokeStyle='rgba(192,132,252,0.15)';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(W-PR,0);ctx.lineTo(W-PR,H);ctx.stroke();
  ctx.fillStyle='#7c6fa0';
  ctx.font='9px monospace';
  ctx.textAlign='left';
  for(let i=0;i<=4;i++){
    const m = hi-(hi-lo)*(i/4);
    const y = PT+(cH/4)*i;
    ctx.fillText('$'+fmtMcap(m), W-PR+4, y+3);
  }

  // 현재 시총 배지
  ctx.fillStyle='#4ade80';
  ctx.fillRect(W-PR, py-9, PR, 18);
  ctx.fillStyle='#000';
  ctx.font='bold 8px monospace';
  ctx.fillText('$'+fmtMcap(last.mcap), W-PR+3, py+3);

  // 시간 축
  ctx.fillStyle='#0d0a1a';
  ctx.fillRect(0,H-PB,W-PR,PB);
  ctx.fillStyle='#7c6fa0';
  ctx.font='9px monospace';
  ctx.textAlign='center';
  const step=Math.max(1,Math.floor(trades.length/5));
  trades.forEach((t,i)=>{
    if(i%step!==0)return;
    const d=new Date(t.time*1000);
    ctx.fillText(d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'),toX(t.time),H-8);
  });

  // CHOG 캐릭터 위치 업데이트
  updateChogPos(last.mcap, toY);
  } // end if(false)
}

function buildCandlesFromTrades(){
  // trades 배열 → 1분봉 candles 변환
  if(!trades.length) return;
  const iSec = 60;
  const buckets = {};
  trades.forEach(t=>{
    const bT = t.time - (t.time % iSec);
    const p = t.price;
    if(!buckets[bT]) buckets[bT]={time:bT,open:p,high:p,low:p,close:p};
    else { const b=buckets[bT]; b.high=Math.max(b.high,p); b.low=Math.min(b.low,p); b.close=p; }
  });
  candles = Object.values(buckets).sort((a,b)=>a.time-b.time);
}

function drawCandleChart(ctx,W,H,cW,cH,PAD_L,PT,PB){
  if(!candles.length) return;

  // zoom: 1.0=기본(80개), <1=확대(적게), >1=축소(많이)
  const visCount = Math.max(5, Math.round(80 * chartZoom));
  const total    = candles.length;

  // chartOffsetX=0 → 최신 끝, >0 → 과거로 스크롤
  const scrolled = Math.max(0, Math.min(total - visCount, chartOffsetX));
  const endIdx   = Math.max(visCount, total - Math.floor(scrolled));
  const startIdx = Math.max(0, endIdx - visCount);
  const vis      = candles.slice(startIdx, endIdx);
  if(!vis.length) return;

  const prices = vis.flatMap(c=>[c.high,c.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || minP * 0.02;
  const lo = minP - range*0.06, hi = maxP + range*0.06;
  const toY = p => PT + cH*(1-(p-lo)/(hi-lo));
  const cw = Math.max(2, Math.floor(cW / vis.length));

  // 그리드
  ctx.strokeStyle='rgba(192,132,252,0.06)';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=PT+(cH/4)*i;
    ctx.beginPath();ctx.moveTo(PAD_L,y);ctx.lineTo(PAD_L+cW,y);ctx.stroke();
  }

  // 캔들
  vis.forEach((c,i)=>{
    const cx = PAD_L+i*cw+cw/2;
    const x  = PAD_L+i*cw+cw*0.1;
    const bw = Math.max(1,cw*0.8);
    const up = c.close >= c.open;
    const col = up ? '#4ade80' : '#f87171';
    // 심지
    ctx.strokeStyle=col; ctx.lineWidth=Math.max(1,cw*0.15);
    ctx.beginPath();ctx.moveTo(cx,toY(c.high));ctx.lineTo(cx,toY(c.low));ctx.stroke();
    // 몸통
    ctx.fillStyle=col;
    const bTop=toY(Math.max(c.open,c.close));
    const bH=Math.max(1,Math.abs(toY(c.open)-toY(c.close)));
    ctx.fillRect(x,bTop,bw,bH);
  });

  // 가격 축
  ctx.fillStyle='#0d0a1a'; ctx.fillRect(W-PAD_R,0,PAD_R,H);
  ctx.strokeStyle='rgba(192,132,252,0.15)'; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(W-PAD_R,0);ctx.lineTo(W-PAD_R,H);ctx.stroke();
  ctx.fillStyle='#7c6fa0'; ctx.font='9px monospace'; ctx.textAlign='left';
  for(let i=0;i<=4;i++){
    const p=hi-(hi-lo)*(i/4);
    const y=PT+(cH/4)*i;
    const lbl = showMcap ? '$'+fmtMcap(p*TOTAL_SUPPLY) : p.toFixed(7);
    ctx.fillText(lbl, W-PAD_R+4, y+3);
  }

  // 현재가 라인 - vis의 마지막 캔들 (화면에 보이는 가장 최신)
  const last = vis[vis.length-1].close;
  const pY = toY(last);
  if(pY>PT && pY<H-PB){
    ctx.setLineDash([4,3]);
    ctx.strokeStyle='rgba(74,222,128,0.5)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(PAD_L,pY);ctx.lineTo(W-PAD_R,pY);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#4ade80';
    ctx.fillRect(W-PAD_R,pY-9,PAD_R,18);
    ctx.fillStyle='#000'; ctx.font='bold 8px monospace';
    const badgeLbl = showMcap ? '$'+fmtMcap(last*TOTAL_SUPPLY) : last.toFixed(7);
    ctx.fillText(badgeLbl, W-PAD_R+3, pY+3);
  }

  // 시간 축
  ctx.fillStyle='#0d0a1a'; ctx.fillRect(0,H-PB,W-PAD_R,PB);
  ctx.fillStyle='#7c6fa0'; ctx.font='9px monospace'; ctx.textAlign='center';
  const step=Math.max(1,Math.floor(vis.length/5));
  vis.forEach((c,i)=>{
    if(i%step!==0) return;
    const d=new Date(c.time*1000);
    const lbl=d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    ctx.fillText(lbl, PAD_L+i*cw+cw/2, H-8);
  });

  // CHOG 캐릭터
  updateChogPos(last, toY);
}


function updateChogPosDirect(pY){
  try{
    const char    = document.getElementById('chogChar');
    const wrapper = document.getElementById('chart-wrapper');
    if(!char || !wrapper) return;
    const charH   = char.offsetHeight || 70;
    const wH      = wrapper.clientHeight || 360;
    const clamped = Math.max(0, Math.min(wH - charH, pY - charH));
    char.style.top   = clamped + 'px';
    char.style.right = (PAD_R + 4) + 'px';
  } catch(e){}
}

function updateChogPosDirect(pY){
  try{
    const char    = document.getElementById('chogChar');
    const wrapper = document.getElementById('chart-wrapper');
    if(!char || !wrapper) return;
    const charH   = char.offsetHeight || 70;
    const wH      = wrapper.clientHeight || 360;
    const top     = Math.max(0, Math.min(wH - charH, pY - charH));
    char.style.top   = top + 'px';
    char.style.right = (PAD_R + 4) + 'px';
  } catch(e){}
}

function updateChogPos(price, toYFn){
  try{
    const char=document.getElementById('chogChar');
    const wrapper=document.getElementById('chart-wrapper');
    if(!char||!wrapper)return;
    // toYFn은 현재 drawCandleChart의 lo/hi 기준 Y변환 함수
    const y = typeof toYFn==='function' ? toYFn(price) : 180;
    const charH = char.offsetHeight || 70;
    const wH    = wrapper.clientHeight || 360;
    // 캐릭터 중심을 현재가 라인에 맞춤
    const clamped = Math.max(0, Math.min(wH - charH, y - charH/2));
    char.style.top   = clamped + 'px';
    char.style.right = (PAD_R + 4) + 'px';
  }catch(e){}
}

function genCandles(intervalMin){
  const data=[];
  const iSec=intervalMin*60;
  const back=intervalMin<=5?120:intervalMin<=60?100:60;
  let t=Math.floor(Date.now()/1000)-iSec*back;
  t=t-(t%iSec);
  let p=0.000731;
  const vol=Math.min(0.06,0.015*Math.log2(intervalMin+1));
  for(let i=0;i<back;i++){
    const o=p,c=p*(1+(Math.random()-.5)*vol);
    const h=Math.max(o,c)*(1+Math.random()*vol*.5);
    const l=Math.min(o,c)*(1-Math.random()*vol*.5);
    data.push({time:t,open:parseFloat(o.toFixed(9)),high:parseFloat(h.toFixed(9)),low:parseFloat(l.toFixed(9)),close:parseFloat(c.toFixed(9))});
    p=c;t+=iSec;
  }
  return data;
}

function setTF(minutes,label){
  // 1m 고정 — 다른 타임프레임은 nad.fun에서 확인
  currentTF=1; chartOffsetX=0;
  loadChartData(1);
}

// ═══════════════════════════════════════
//  MONAD RPC
// ═══════════════════════════════════════
async function rpcCall(method,params){
  return rpcCallAny(method,params);
}

const MONAD_RPC_LIST = [
  'https://rpc.monad.xyz',
  'https://monad-mainnet.rpc.thirdweb.com',
  'https://monad.drpc.org',
];

async function rpcCallAny(method, params) {
  // 1) MetaMask/지갑 provider 사용 (CORS 우회! file://에서도 작동)
  if(window.ethereum) {
    try {
      const result = await window.ethereum.request({method, params});
      if(result !== undefined && result !== null) return result;
    } catch(e) {
      // eth_getLogs 등 일부는 지갑이 지원 안 할 수 있음
      if(e.code !== 4200) console.warn('wallet RPC err:', e.message);
    }
  }

  // 2) 직접 fetch (서버에서 열 때 작동)
  for(const rpc of MONAD_RPC_LIST) {
    try {
      const res = await fetch(rpc, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
      });
      if(!res.ok) continue;
      const d = await res.json();
      if(d.error) continue;
      if(d.result !== undefined) return d.result;
    } catch(e) {}
  }
  return null;
}

// TF map for GMGN/DexScreener style APIs
const TF_MAP = {1:'1m',5:'5m',15:'15m',30:'30m',60:'1h',240:'4h',1440:'1d',10080:'1w'};

// Capricorn/Uniswap V3 Swap event topic
const SWAP_TOPIC_V3 = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'; // Uniswap V3 Swap (봇 확인)
const TRADE_TOPIC_KURU = '0x003990f49e583a0157287d5a3f0e86ad511fa73215731b86e56184e0db318e06'; // Kuru Trade (봇 확인)

async function fetchCandles(intervalMin){
  try {
    const blockHex = await rpcCallAny('eth_blockNumber', []);
    if(!blockHex) return null;
    const curBlock = parseInt(blockHex, 16);

    // Monad ~1s/block. Fetch recent 500 blocks = ~8 min of data
    // For longer TFs we fetch multiple chunks
    const barsBack = intervalMin<=5?120 : intervalMin<=60?100 : 60;
    const secsBack = intervalMin * 60 * barsBack;
    const blocksBack = Math.min(secsBack, 2000); // max 2000 blocks
    const CHUNK = 400; // safe per Monad docs

    const allLogs = [];
    const fromBlock = curBlock - blocksBack;

    for(let s = fromBlock; s < curBlock; s += CHUNK) {
      const e = Math.min(s + CHUNK - 1, curBlock);
      const logs = await rpcCallAny('eth_getLogs', [{
        address: NADFUN_POOL,
        topics: [[SWAP_TOPIC_V3, TRADE_TOPIC_KURU]],
        fromBlock: '0x' + s.toString(16),
        toBlock:   '0x' + e.toString(16),
      }]);
      if(logs && logs.length) allLogs.push(...logs);
      if(allLogs.length >= 300) break;
    }

    if(allLogs.length < 3) {
      console.warn('RPC: only', allLogs.length, 'swap logs');
      return null;
    }

    console.log('✅ RPC swap logs:', allLogs.length);
    return buildOHLCV(allLogs, intervalMin, curBlock);
  } catch(e) {
    console.warn('fetchCandles RPC:', e.message);
    return null;
  }
}

function buildOHLCV(logs, intervalMin, curBlock) {
  const iSec = intervalMin * 60;
  const now  = Math.floor(Date.now() / 1000);
  const Q96  = BigInt('0x1000000000000000000000000');
  const isChogToken0 = CHOG_CONTRACT.toLowerCase() < WMON_CONTRACT.toLowerCase();
  const monPrice = cachedMonPrice || 2.8;
  const buckets  = {};

  logs.forEach(log => {
    const blk = parseInt(log.blockNumber, 16);
    const ts  = now - (curBlock - blk);
    const bTs = ts - (ts % iSec);

    let priceUsd = 0;
    if(log.data && log.data.length >= 2 + 64*5) {
      try {
        // V3 Swap data layout: amount0(32), amount1(32), sqrtPriceX96(32), liquidity(32), tick(32)
        const sqrtHex = log.data.slice(2 + 64*2, 2 + 64*3);
        const sqrtVal = BigInt('0x' + sqrtHex);
        if(sqrtVal === 0n) return;
        const ratio = Number(sqrtVal) / Number(Q96);
        let priceInWMON = ratio * ratio;
        if(!isChogToken0) priceInWMON = 1 / priceInWMON;
        priceUsd = priceInWMON * monPrice;
        // Sanity: CHOG should be between $0.0000001 and $0.1
        if(priceUsd < 1e-8 || priceUsd > 0.5) return;
      } catch(e) { return; }
    }

    if(!priceUsd) return;

    if(!buckets[bTs]) {
      buckets[bTs] = {time:bTs, open:priceUsd, high:priceUsd, low:priceUsd, close:priceUsd};
    } else {
      const b = buckets[bTs];
      b.high  = Math.max(b.high, priceUsd);
      b.low   = Math.min(b.low,  priceUsd);
      b.close = priceUsd;
    }
  });

  const result = Object.values(buckets).sort((a,b) => a.time - b.time);
  console.log('OHLCV buckets:', result.length, result.length>0 ? 'avg=$'+(result.reduce((s,c)=>s+c.close,0)/result.length).toFixed(8) : '');
  return result.length >= 3 ? result : null;
}

function parseCandles(raw){
  const seen=new Set();
  return raw.map(c=>{
    // Handle various API response formats
    const t = c.timestamp ? Math.floor(c.timestamp/1000) :
              c.time      ? Math.floor(c.time > 1e10 ? c.time/1000 : c.time) :
              c.t         ? Math.floor(c.t > 1e10 ? c.t/1000 : c.t) :
              Math.floor(c[0]);
    return {
      time:  t,
      open:  parseFloat(c.open  || c.o || c[1]),
      high:  parseFloat(c.high  || c.h || c[2]),
      low:   parseFloat(c.low   || c.l || c[3]),
      close: parseFloat(c.close || c.c || c[4]),
    };
  }).filter(c=>{
    if(!c.time||isNaN(c.open)||c.open<=0||seen.has(c.time))return false;
    seen.add(c.time); return true;
  }).sort((a,b)=>a.time-b.time);
}

function buildCandles(logs,intervalMin,curBlock){
  if(!logs.length)return null;
  const iSec=intervalMin*60;
  const now=Math.floor(Date.now()/1000);
  const firstBlk=parseInt(logs[0].blockNumber,16);
  const lastBlk=parseInt(logs[logs.length-1].blockNumber,16);
  const estTs=blk=>now-(curBlock-blk);
  const DENOM=1e18;
  const buckets={};

  logs.forEach(log=>{
    const blk=parseInt(log.blockNumber,16);
    const ts=estTs(blk);
    const bTs=ts-(ts%iSec);
    let price=0;
    if(log.data&&log.data.length>=66){
      const raw=parseInt(log.data.slice(2,66),16);
      price=raw/DENOM;
      if(price<1e-9||price>100)price=raw/1e24;
      if(price<1e-9||price>100)price=0;
    }
    if(!price)return;
    if(!buckets[bTs])buckets[bTs]={time:bTs,open:price,high:price,low:price,close:price};
    else{const b=buckets[bTs];b.high=Math.max(b.high,price);b.low=Math.min(b.low,price);b.close=price;}
  });

  const result=Object.values(buckets).sort((a,b)=>a.time-b.time);
  if(result.length<3)return null;
  console.log('✅ RPC candles:',result.length);
  return result;
}

// Capricorn V3 slot0() ABI selector
const SLOT0_SEL = '0xf0b639d9'; // Algebra globalState() → Capricorn V3 (Algebra Protocol 기반)

async function getChogPriceFromRPC() {
  try {
    const result = await rpcCallAny('eth_call', [{
      to: NADFUN_POOL, data: SLOT0_SEL
    }, 'latest']);
    console.log('RPC result:', result ? result.slice(0,18)+'...(len='+result.length+')' : 'NULL');
    if(!result || result === '0x' || result.length < 66) return null;

    const sqrtHex = result.slice(2, 66);
    const sqrtVal = BigInt('0x' + sqrtHex);
    const Q96 = BigInt('0x1000000000000000000000000');
    if(sqrtVal === 0n) return null;

    const isChogToken0 = CHOG_CONTRACT.toLowerCase() < WMON_CONTRACT.toLowerCase();
    const ratio = Number(sqrtVal) / Number(Q96);
    let priceInWMON = ratio * ratio;
    if(!isChogToken0) priceInWMON = 1 / priceInWMON;

    const priceUsd = priceInWMON * (cachedMonPrice || 0.026);
    console.log('RPC price: CHOG/WMON='+priceInWMON.toFixed(8)+' USD='+priceUsd.toFixed(8)+' MCap=$'+(priceUsd*1e9/1000).toFixed(0)+'K');

    if(priceUsd < 1e-10 || priceUsd > 1) { console.warn('RPC price out of range:', priceUsd); return null; }
    return priceUsd;
  } catch(e) {
    console.error('RPC err:', e.message);
    return null;
  }
}


async function getMonPrice() {
  // DEXScreener에서 CHOG/WMON priceUsd ÷ priceNative = MON/USD
  const sources = [
    `https://api.dexscreener.com/latest/dex/pairs/monad/${NADFUN_POOL}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent('https://api.dexscreener.com/latest/dex/pairs/monad/'+NADFUN_POOL)}`,
    `https://api.geckoterminal.com/api/v2/networks/monad/pools/${NADFUN_POOL}`,
  ];

  for(const url of sources){
    try {
      const res = await fetch(url, {headers:{'Accept':'application/json'}});
      if(!res.ok) continue;
      const d = await res.json();

      // DEXScreener 형식
      const p = (d.pairs||[])[0] || d.pair;
      if(p?.priceUsd && p?.priceNative){
        const px = parseFloat(p.priceUsd) / parseFloat(p.priceNative);
        if(px > 0.001 && px < 10){ cachedMonPrice=px; console.log('✅ MON:$'+px.toFixed(4)); return px; }
      }

      // GeckoTerminal 형식
      const a = d?.data?.attributes;
      if(a?.quote_token_price_usd){
        const px = parseFloat(a.quote_token_price_usd);
        if(px > 0.001 && px < 10){ cachedMonPrice=px; console.log('✅ MON(GT):$'+px.toFixed(4)); return px; }
      }
    } catch(e){}
  }
  return cachedMonPrice; // 기존값 유지
}

async function fetchTokenInfo(){
  const POOL = NADFUN_POOL.toLowerCase();

  // 0) DEXScreener에서 통계 포함 전체 데이터 직접 조회
  try {
    const dsUrl = `https://api.dexscreener.com/latest/dex/pairs/monad/${NADFUN_POOL}`;
    const res = await fetch(dsUrl);
    if(res.ok){
      const d = await res.json();
      const p = (d.pairs||[])[0] || d.pair;
      if(p && parseFloat(p.priceUsd||0) > 0){
        const priceUsd = parseFloat(p.priceUsd);
        const mcap = parseFloat(p.marketCap||0) || parseFloat(p.fdv||0) || priceUsd*TOTAL_SUPPLY;
        if(p.priceNative) cachedMonPrice = priceUsd/parseFloat(p.priceNative);
        const pch = p.priceChange || {};
        const vol = p.volume || {};
        const txns = p.txns || {};
        // 매수/매도 볼륨 계산
        const h24buys  = txns.h24?.buys  || 0;
        const h24sells = txns.h24?.sells || 0;
        const h24vol   = vol.h24 || 0;
        const buyRatio = h24buys/(h24buys+h24sells||1);
        console.log('✅ DEXScreener 통계:', priceUsd.toFixed(8), 'MCap:$'+formatK(mcap));
        return {
          priceUsd, priceChange: pch, marketCap: mcap,
          volume: vol, txns,
          buyVol:  h24vol * buyRatio,
          sellVol: h24vol * (1-buyRatio),
          makers:  (txns.h24?.buys||0)+(txns.h24?.sells||0),
          buyers:  txns.h24?.buys  || 0,
          sellers: txns.h24?.sells || 0,
        };
      }
    }
  } catch(e){ console.warn('DEXScreener fetch err:', e.message); }

  // 1) Monad RPC slot0
  try {
    const priceUsd = await getChogPriceFromRPC();
    if(priceUsd && priceUsd > 0){
      const mcap = priceUsd * TOTAL_SUPPLY;
      console.log('✅ RPC slot0:', priceUsd.toFixed(8), '| MCap:$'+formatK(mcap));
      // 24h 변화는 별도로 가져오되 실패해도 무관
      let pch=0, vol=0;
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/monad/${POOL}`);
        if(r.ok){ const d=await r.json(); const p=(d.pairs||[])[0]; if(p){ pch=parseFloat((p.priceChange?.h24)||0); vol=parseFloat((p.volume?.h24)||0); }}
      } catch(e){}
      return {priceUsd, priceChange:{h24:pch}, marketCap:mcap, volume:{h24:vol}};
    }
  } catch(e){ console.warn('RPC slot0 err:', e.message); }

  // 2) GeckoTerminal (CORS 완전 오픈)
  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/monad/pools/${POOL}`;
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(res.ok){
      const d = await res.json();
      const a = d?.data?.attributes;
      if(a){
        const priceUsd = parseFloat(a.base_token_price_usd||0);
        const mcap     = parseFloat(a.market_cap_usd||0) || parseFloat(a.fdv_usd||0) || priceUsd*TOTAL_SUPPLY;
        const vol      = parseFloat(a.volume_usd?.h24||0);
        if(priceUsd > 0){
          // MON 가격 역산
          const monPx = parseFloat(a.quote_token_price_usd||0);
          if(monPx > 0.001) cachedMonPrice = monPx;
          console.log('✅ GeckoTerminal:', priceUsd.toFixed(8), '| MCap:$'+formatK(mcap));
          return {priceUsd, priceChange:{h24:parseFloat(a.price_change_percentage?.h24||0)}, marketCap:mcap, volume:{h24:vol}};
        }
      }
    }
  } catch(e){}

  // 2) DEXScreener (direct)
  try {
    const url = `https://api.dexscreener.com/latest/dex/pairs/monad/${POOL}`;
    const res = await fetch(url);
    if(res.ok){
      const d = await res.json();
      const p = (d.pairs||[])[0] || d.pair;
      if(p){
        const priceUsd = parseFloat(p.priceUsd||0);
        if(priceUsd > 0){
          const mcap = parseFloat(p.marketCap||0) || parseFloat(p.fdv||0) || priceUsd*TOTAL_SUPPLY;
          if(p.priceNative) cachedMonPrice = priceUsd/parseFloat(p.priceNative);
          console.log('✅ DEXScreener:', priceUsd.toFixed(8), '| MCap:$'+formatK(mcap));
          return {priceUsd, priceChange:{h24:parseFloat((p.priceChange?.h24)||0)}, marketCap:mcap, volume:{h24:parseFloat((p.volume?.h24)||0)}};
        }
      }
    }
  } catch(e){}

  // 3) DEXScreener allorigins proxy
  try {
    const dsUrl = `https://api.dexscreener.com/latest/dex/pairs/monad/${POOL}`;
    const url   = `https://api.allorigins.win/raw?url=${encodeURIComponent(dsUrl)}`;
    const res   = await fetch(url);
    if(res.ok){
      const d = await res.json();
      const p = (d.pairs||[])[0] || d.pair;
      if(p){
        const priceUsd = parseFloat(p.priceUsd||0);
        if(priceUsd > 0){
          const mcap = parseFloat(p.marketCap||0) || parseFloat(p.fdv||0) || priceUsd*TOTAL_SUPPLY;
          if(p.priceNative) cachedMonPrice = priceUsd/parseFloat(p.priceNative);
          console.log('✅ DEXScreener(proxy):', priceUsd.toFixed(8), '| MCap:$'+formatK(mcap));
          return {priceUsd, priceChange:{h24:parseFloat((p.priceChange?.h24)||0)}, marketCap:mcap, volume:{h24:parseFloat((p.volume?.h24)||0)}};
        }
      }
    }
  } catch(e){}

  // 4) RPC slot0 fallback
  try {
    const priceUsd = await getChogPriceFromRPC();
    if(priceUsd){
      console.log('✅ RPC slot0:', priceUsd.toFixed(8));
      return {priceUsd, priceChange:{h24:0}, marketCap:priceUsd*TOTAL_SUPPLY, volume:{h24:0}};
    }
  } catch(e){}

  // 모든 소스 실패 시 마지막 알려진 가격 반환
  if(livePrice > 0){
    const mcap = livePrice * TOTAL_SUPPLY;
    return {priceUsd:livePrice, priceChange:{h24:priceChange24h}, marketCap:mcap, volume:{h24:0}};
  }
  return null;
}

function updatePriceDisplay(p){
  const str='$'+p.toFixed(7);
  const t=document.getElementById('tickerPrice');if(t)t.textContent=str;
  const t2=document.getElementById('tickerPrice2');if(t2)t2.textContent=str;
  const pct=priceChange24h;
  const el=document.getElementById('priceChange');
  if(el){el.textContent=(pct>=0?'▲':'▼')+' '+Math.abs(pct).toFixed(2)+'% (24h)';el.className='price-change '+(pct>=0?'up':'down');}
  const tc=document.getElementById('tickerChg');
  const chgStr=(pct>=0?'▲':'▼')+' '+Math.abs(pct).toFixed(1)+'%';
  const chgCls=pct>=0?'up':'dn';
  if(tc){tc.textContent=chgStr;tc.className=chgCls;}
  const tc2=document.getElementById('tickerChg2');
  if(tc2){tc2.textContent=chgStr;tc2.className=chgCls;}
}

function updateMcap(mcap){
  const s='$'+formatK(mcap);
  const a=document.getElementById('liveMcap');if(a)a.textContent=s;
  const b=document.getElementById('statMcap');if(b)b.textContent=s;
  const c=document.getElementById('tickerMcap');if(c)c.textContent='$'+formatK(mcap);
  const c2=document.getElementById('tickerMcap2');if(c2)c2.textContent='$'+formatK(mcap);
  // ATH 게이지
  const ATH_MCAP = 12880000;
  const pct = Math.min(100, (mcap/ATH_MCAP)*100);
  const gauge = document.getElementById('athGauge');
  const pctEl = document.getElementById('athPct');
  if(gauge) gauge.style.width = Math.max(1,pct).toFixed(1)+'%';
  if(pctEl) pctEl.textContent = pct.toFixed(1)+'% of ATH';
}

async function loadChartData(intervalMin){
  // 초기 거래 내역 로드 (차트 즉시 표시용)
  await loadInitialTrades();
  chartOffsetX = 0;
  drawChart();
}

async function loadInitialTrades(){
  try {
    const blockHex = await rpcCallAny('eth_blockNumber', []);
    if(!blockHex) { useFallbackTrades(); return; }
    const cur = parseInt(blockHex, 16);

    // 최근 600블록 (~10분) 스왑 이벤트 가져오기
    const from = cur - 600;
    const logs = await rpcCallAny('eth_getLogs', [{
      address: NADFUN_POOL,
      topics: [[SWAP_TOPIC_V3, TRADE_TOPIC_KURU]],
      fromBlock: '0x' + from.toString(16),
      toBlock: '0x' + cur.toString(16),
    }]);

    if(!logs || logs.length < 2) {
      console.warn('No initial trades, using simulation');
      useFallbackTrades();
      return;
    }

    const Q96 = BigInt('0x1000000000000000000000000');
    const isChogToken0 = CHOG_CONTRACT.toLowerCase() < WMON_CONTRACT.toLowerCase();
    const monPx = cachedMonPrice || 2.8;
    const now = Math.floor(Date.now()/1000);

    logs.forEach(log => {
      try {
        const data = log.data;
        if(!data || data.length < 2 + 64*5) return;
        const blk = parseInt(log.blockNumber, 16);
        const ts  = now - (cur - blk);

        function toSigned(hex){
          const v = BigInt('0x'+hex);
          const MAX = BigInt('0x8'+'0'.repeat(63));
          return v >= MAX ? v - BigInt('0x1'+'0'.repeat(64)) : v;
        }
        const amount0 = toSigned(data.slice(2,66));
        const amount1 = toSigned(data.slice(66,130));
        const sqrtHex = data.slice(130,194);
        const sqrtVal = BigInt('0x'+sqrtHex);
        if(sqrtVal === 0n) return;

        const ratio = Number(sqrtVal) / Number(Q96);
        let priceInWMON = ratio * ratio;
        if(!isChogToken0) priceInWMON = 1 / priceInWMON;
        const priceUsd = priceInWMON * monPx;
        if(priceUsd < 1e-9 || priceUsd > 1) return;

        let isBuy, monAmount;
        if(isChogToken0){
          isBuy = amount0 < 0n;
          monAmount = Number(amount1 < 0n ? -amount1 : amount1) / 1e18;
        } else {
          isBuy = amount1 < 0n;
          monAmount = Number(amount0 < 0n ? -amount0 : amount0) / 1e18;
        }

        const mcap = priceUsd * TOTAL_SUPPLY;
        trades.push({ time:ts, price:priceUsd, mcap, usd:monAmount*monPx, isBuy });
      } catch(e){}
    });

    // 시간순 정렬 + Max 200개
    trades.sort((a,b) => a.time - b.time);
    if(trades.length > MAX_TRADES) trades.splice(0, trades.length - MAX_TRADES);

    if(trades.length > 0){
      livePrice = trades[trades.length-1].price;
      isSimulTrades = false; // 실제 데이터!
      console.log('✅ Loaded real trades:', trades.length, 'trades');
      updatePriceDisplay(livePrice);
      updateMcap(livePrice * TOTAL_SUPPLY);
  updateAthGauge(livePrice * TOTAL_SUPPLY);
    } else {
      useFallbackTrades();
    }
  } catch(e) {
    console.warn('Initial load failed:', e.message);
    useFallbackTrades();
  }
}

function useFallbackTrades(){
  // 최근 60분치 시뮬 (1분당 2~4 trades, 총 ~120~180건)
  const basePrice = livePrice || 0.000650;
  const now = Math.floor(Date.now()/1000);
  trades = [];

  let p = basePrice * 0.96;
  // 60분 전부터 현재까지, 25~40초 간격으로 생성
  let t = now - 3600;
  while(t < now){
    const move = (Math.random() - 0.47) * 0.004;
    p = p * (1 + move);
    // 현재가로 서서히 수렴
    const progress = 1 - (now - t) / 3600;
    p = p * (1 - progress*0.002) + basePrice * (progress*0.002);
    p = Math.max(basePrice*0.85, Math.min(basePrice*1.15, p));
    const isBuy = Math.random() > 0.45;
    trades.push({
      time:  Math.floor(t),
      price: p,
      mcap:  p * TOTAL_SUPPLY,
      usd:   Math.random() * 200 + 10,
      isBuy
    });
    t += 25 + Math.random() * 35; // 25~60초 간격
  }
  // 마지막은 현재가로
  if(trades.length > 0){
    trades[trades.length-1].price = basePrice;
    trades[trades.length-1].mcap  = basePrice * TOTAL_SUPPLY;
  }
  trades.sort((a,b)=>a.time-b.time);
  console.log('Simulated trades generated:', trades.length, 'trades');
}

async function refreshPriceStats(){
  // MON 가격 먼저 업데이트 시도
  await getMonPrice();
  
  const info = await fetchTokenInfo();
  if(!info || !info.priceUsd || isNaN(info.priceUsd)) return;
  const prevPrice = livePrice;
  livePrice      = info.priceUsd;
  priceChange24h = (info.priceChange && info.priceChange.h24) || 0;
  updatePriceDisplay(livePrice);
  updateMcap(livePrice * TOTAL_SUPPLY);
  // 기간별 통계 패널 업데이트
  updateStatPanel(info);
  // 통계 그리드 직접 업데이트
  if(info.txns || info.volume){
    const period = currentStatPeriod || 'h24';
    const t = (info.txns && info.txns[period]) || {};
    const buys  = t.buys  || 0;
    const sells = t.sells || 0;
    const vol   = (info.volume && (info.volume[period] || info.volume.h24)) || 0;
    const total = buys + sells || 1;
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    const setW = (id,w) => { const el=document.getElementById(id); if(el) el.style.width=w+'%'; };
    set('sg-txns',   buys+sells || '—');
    set('sg-buys',   buys  || '—');
    set('sg-sells',  sells || '—');
    set('sg-vol',    '$'+formatK(vol));
    set('sg-buyvol', info.buyVol  ? '$'+formatK(info.buyVol)  : '—');
    set('sg-sellvol',info.sellVol ? '$'+formatK(info.sellVol) : '—');
    set('sg-makers', info.makers  || '—');
    set('sg-buyers', info.buyers  || '—');
    set('sg-sellers',info.sellers || '—');
    setW('sg-buys-bar',  Math.round(buys/total*100));
    setW('sg-sells-bar', Math.round(sells/total*100));
  }

  // 시뮬 데이터일 때 가격 바뀌면 재생성
  if(isSimulTrades && livePrice > 0 && prevPrice > 0 && Math.abs(livePrice - prevPrice)/prevPrice > 0.01){
    useFallbackTrades();
    buildCandlesFromTrades();
    drawChart();
  }
}


function startPriceRefresh(){
  if(priceRefreshStarted) return;
  priceRefreshStarted = true;
  // 즉시 실행
  refreshPriceStats();
  // 15초마다 반복
  setInterval(refreshPriceStats, 15000);
}


function zoomChart(dir){
  // dir: +1=확대(캔들 크게/적게), -1=축소(캔들 작게/많이)
  const factor = dir > 0 ? 0.75 : 1.3;
  chartZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, chartZoom * factor));
  updateZoomBtn();
  drawChart();
}
function zoomReset(){
  chartZoom = 1.0;
  chartOffsetX = 0;
  updateZoomBtn();
  drawChart();
}
function updateZoomBtn(){
  const el = document.getElementById('zoomLabel');
  if(!el) return;
  if(chartZoom < 0.95) el.textContent = Math.round(1/chartZoom)+'x';
  else if(chartZoom > 1.05) el.textContent = '1/'+ Math.round(chartZoom)+'x';
  else el.textContent = '1x';
}

function setupTracking(){
  setInterval(()=>{if(candles.length)drawChart();}, 500);
  // 실시간 거래 구독 시작
  startLiveTrades();
}

// ── 실시간 거래 피드 ──────────────────────────────
let wsConn = null;
let wsRetryTimer = null;

function startLiveTrades() {
  // 로컬 HTML파일에서는 WSS 불가 → 바로 폴링 시작
  startPolling();
}

// WSS 안되면 폴링으로 대체
let lastPollBlock = 0;
function startPolling() {
  setInterval(async () => {
    try {
      const blockHex = await rpcCallAny('eth_blockNumber', []);
      if(!blockHex) return;
      const cur = parseInt(blockHex, 16);
      if(!lastPollBlock) { lastPollBlock = cur - 5; return; }
      if(cur <= lastPollBlock) return;

      const from = lastPollBlock + 1;
      const to   = Math.min(cur, from + 20); // Max 20블록씩
      lastPollBlock = to;

      const logs = await rpcCallAny('eth_getLogs', [{
        address: NADFUN_POOL,
        topics: [[SWAP_TOPIC_V3, TRADE_TOPIC_KURU]],
        fromBlock: '0x' + from.toString(16),
        toBlock:   '0x' + to.toString(16),
      }]);
      if(logs && logs.length) logs.forEach(handleSwapLog);
    } catch(e){}
  }, 2000); // 2초마다 폴링
}

function handleSwapLog(log) {
  try {
    const Q96 = BigInt('0x1000000000000000000000000');
    const isChogToken0 = CHOG_CONTRACT.toLowerCase() < WMON_CONTRACT.toLowerCase();
    const data = log.data;
    if(!data || data.length < 2 + 64*5) return;

    // amount0, amount1 (int256 — signed)
    const amount0Hex = data.slice(2, 66);
    const amount1Hex = data.slice(66, 130);
    const sqrtHex    = data.slice(130, 194);

    // int256 파싱 (signed)
    function toSignedInt(hex) {
      const val = BigInt('0x' + hex);
      const MAX = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000');
      return val >= MAX ? val - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000') : val;
    }

    const amount0 = toSignedInt(amount0Hex); // CHOG if token0
    const amount1 = toSignedInt(amount1Hex); // WMON if token1
    const sqrtVal = BigInt('0x' + sqrtHex);
    if(sqrtVal === 0n) return;

    // 가격 계산
    const ratio = Number(sqrtVal) / Number(Q96);
    let priceInWMON = ratio * ratio;
    if(!isChogToken0) priceInWMON = 1 / priceInWMON;
    const priceUsd = priceInWMON * (cachedMonPrice || 2.8);
    if(priceUsd < 1e-9 || priceUsd > 1) return;

    // 매수/매도 판별
    // Uniswap V3: amount < 0 = 풀에서 나감 = 사용자가 받음
    // CHOG/WMON 풀에서:
    //   CHOG amount < 0 → CHOG 풀에서 나감 → 사용자가 CHOG 받음 → BUY
    //   CHOG amount > 0 → CHOG 풀로 들어옴 → 사용자가 CHOG 넣음 → SELL
    let isBuy, chogAmount, monAmount, usdValue;
    if(isChogToken0) {
      isBuy      = amount0 < 0n;
      chogAmount = Number(amount0 < 0n ? -amount0 : amount0) / 1e18;
      monAmount  = Number(amount1 < 0n ? -amount1 : amount1) / 1e18; // WMON
    } else {
      isBuy      = amount1 < 0n;
      chogAmount = Number(amount1 < 0n ? -amount1 : amount1) / 1e18;
      monAmount  = Number(amount0 < 0n ? -amount0 : amount0) / 1e18; // WMON
    }

    // MON 기준 USD (더 정확)
    usdValue = monAmount * (cachedMonPrice || 2.8);
    if(usdValue < 0.5) usdValue = chogAmount * priceUsd; // fallback

    // Min $0.5 이상 거래만 표시
    if(usdValue < 0.5) return;

    // 거래 기록에 추가
    livePrice = priceUsd;
    const mcapNow = priceUsd * TOTAL_SUPPLY;
    isSimulTrades = false; // 실제 스왑 수신!
    trades.push({
      time:  Math.floor(Date.now()/1000),
      price: priceUsd,
      mcap:  mcapNow,
      usd:   usdValue,
      isBuy: isBuy
    });
    if(trades.length > MAX_TRADES) trades.shift();
    drawChart();
    updatePriceDisplay(priceUsd);
    updateMcap(mcapNow);

    // 플로팅 알림 (MON 기준으로 직접 전달)
    showTradeFloat(isBuy, usdValue, chogAmount, monAmount);

    // 채팅창 거래 알림 (1000 MON 이상)
    if(monAmount >= 1000) {
      const txHash = log.transactionHash || '';
      const _isBuy = isBuy, _chogAmount = chogAmount, _priceUsd = priceUsd, _monAmount = monAmount;
      // tx.from = 실제 매수/매도자 (topics[1/2]는 라우터 주소라 틀림)
      rpcCallAny('eth_getTransactionByHash', [txHash]).then(txData => {
        const addrFull = (txData && txData.from) ? txData.from
          : (log.topics && log.topics[2] ? '0x'+log.topics[2].slice(26) : '');
        const addrShort = addrFull ? addrFull.slice(0,6)+'...'+addrFull.slice(-4) : '0xUnknown';
        renderMsg({
          type: 'trade',
          side: _isBuy ? 'buy' : 'sell',
          addr: addrShort,
          addrFull: addrFull,
          txHash: txHash,
          bal: 0,
          amount: Math.floor(_chogAmount),
          price: _priceUsd,
          mon: _monAmount,
          time: nowTime()
        });
      }).catch(() => {
        const addrFull = log.topics && log.topics[2] ? '0x'+log.topics[2].slice(26) : '';
        const addrShort = addrFull ? addrFull.slice(0,6)+'...'+addrFull.slice(-4) : '0xUnknown';
        renderMsg({
          type: 'trade',
          side: _isBuy ? 'buy' : 'sell',
          addr: addrShort,
          addrFull: addrFull,
          txHash: txHash,
          bal: 0,
          amount: Math.floor(_chogAmount),
          price: _priceUsd,
          mon: _monAmount,
          time: nowTime()
        });
      });
      chogEmotion(isBuy ? 'buy' : 'sell');
    }

    console.log(isBuy?'🟢 BUY':'🔴 SELL', chogAmount.toFixed(0),'CHOG | $'+usdValue.toFixed(2),'| $'+priceUsd.toFixed(8));
  } catch(e) { console.warn('handleSwapLog:', e.message); }
}

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
      <span class="nick-cost-badge" id="nickCostDisplay">💜 2,000 CHOG</span>
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
  if(typeof trackNickPoint==='function') trackNickPoint();

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

function openKuru(side){
  openSwapModal(side||'buy');
}

function openSwapModal(side){
  const modal = document.getElementById('swapModal');
  if(!modal) return;
  switchSwapSide(side||'buy');
  modal.classList.add('open');
  swapUpdateBalances();
}

function closeSwapModal(){
  const modal = document.getElementById('swapModal');
  if(modal) modal.classList.remove('open');
  clearTimeout(swapQuoteTimer);
}

function switchSwapSide(side){
  currentSwapSide = side;
  const isBuy = side === 'buy';

  // Tab buttons
  document.getElementById('swapBuyBtn')?.classList.toggle('active', isBuy);
  document.getElementById('swapSellBtn')?.classList.toggle('active', !isBuy);

  // Title
  const titleEl = document.getElementById('swapModalTitle');
  if(titleEl){
    titleEl.textContent = isBuy ? '▲ BUY CHOG' : '▼ SELL CHOG';
    titleEl.style.color = isBuy ? 'var(--green)' : 'var(--red)';
  }

  // From/To labels & icons
  document.getElementById('swapFromLabel').textContent = isBuy ? 'You Pay (MON)' : 'You Pay (CHOG)';
  document.getElementById('swapToLabel').textContent   = isBuy ? 'You Receive (CHOG)' : 'You Receive (MON)';
  document.getElementById('swapFromName').textContent  = isBuy ? 'MON' : 'CHOG';
  document.getElementById('swapToName').textContent    = isBuy ? 'CHOG' : 'MON';

  // Icons - SVG 인라인 방식
  const isBuyMode = side === 'buy';
  // FROM: BUY=MON, SELL=CHOG
  document.getElementById('svgMonFrom').style.display  = isBuyMode ? 'block' : 'none';
  document.getElementById('svgChogFrom').style.display = isBuyMode ? 'none'  : 'block';
  // TO: BUY=CHOG, SELL=MON
  document.getElementById('svgChogTo').style.display   = isBuyMode ? 'block' : 'none';
  document.getElementById('svgMonTo').style.display    = isBuyMode ? 'none'  : 'block';

  // Execute button
  const execBtn = document.getElementById('btnSwapExec');
  if(execBtn){
    execBtn.textContent = isBuy ? '▲ BUY CHOG' : '▼ SELL CHOG';
    execBtn.className = 'btn-swap-exec ' + (isBuy ? 'buy' : 'sell');
  }

  // Reset
  const amtIn = document.getElementById('swapAmtIn');
  if(amtIn) amtIn.value = '';
  const amtOut = document.getElementById('swapAmtOut');
  if(amtOut) amtOut.value = '';
  document.getElementById('swapPriceVal').textContent = '—';
  document.getElementById('swapStatusMsg').textContent = '';
  document.getElementById('swapStatusMsg').className = 'swap-status';

  swapUpdateBalances();
}

function setSlippage(val){
  swapSlippage = val;
  document.querySelectorAll('.slip-btn').forEach(b => b.classList.remove('active'));
  const id = val===10?'slip10': val===20?'slip20':'slip30';
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  swapCalcOut();
}

function swapUpdateBalances(){
  const fromEl = document.getElementById('swapFromBal');
  const toEl   = document.getElementById('swapToBal');
  if(!wallet){ 
    if(fromEl) fromEl.textContent = 'Balance: —';
    if(toEl)   toEl.textContent   = 'Balance: —';
    return;
  }
  const isBuy = currentSwapSide === 'buy';
  if(fromEl) fromEl.textContent = isBuy
    ? `Balance: ${(wallet.monBal||0).toFixed(4)} MON`
    : `Balance: ${(wallet.bal||0).toLocaleString()} CHOG`;
  if(toEl) toEl.textContent = isBuy
    ? `Balance: ${(wallet.bal||0).toLocaleString()} CHOG`
    : `Balance: ${(wallet.monBal||0).toFixed(4)} MON`;
}

async function swapGetMonBalance(){
  if(!wallet) return;
  try{
    const hex = await window.ethereum.request({method:'eth_getBalance',params:[wallet.addr,'latest']});
    wallet.monBal = parseInt(hex,16)/1e18;
  }catch(e){}
}

function swapCalcOut(){
  clearTimeout(swapQuoteTimer);
  const amtIn = parseFloat(document.getElementById('swapAmtIn')?.value)||0;
  if(amtIn <= 0){
    document.getElementById('swapAmtOut').value = '';
    document.getElementById('swapPriceVal').textContent = '—';
    return;
  }
  // 300ms 디바운스 후 LENS 조회
  swapQuoteTimer = setTimeout(()=> swapCalcOutLens(amtIn), 300);
}

async function swapCalcOutLens(amtIn){
  const isBuy = currentSwapSide === 'buy';
  const amtInWei = BigInt(Math.floor(amtIn * 1e18));

  try{
    // LENS: getAmountOut(address token, uint256 amountIn, bool isBuy)
    // selector: keccak256("getAmountOut(address,uint256,bool)") → 0x4aa4a4fc
    const tokenPadded  = CHOG_CONTRACT.slice(2).padStart(64,'0');
    const amtInPadded  = amtInWei.toString(16).padStart(64,'0');
    const isBuyPadded  = (isBuy ? 1 : 0).toString().padStart(64,'0');
    const callData = '0x4aa4a4fc' + tokenPadded + amtInPadded + isBuyPadded;

    const result = await rpcCallAny('eth_call',[{to: NADFUN_LENS, data: callData},'latest']);

    if(result && result !== '0x' && result.length >= 66){
      const outWei = BigInt('0x' + result.slice(2,66));
      const outAmt = Number(outWei) / 1e18;
      const outAfterSlip = outAmt * (1 - swapSlippage/100);

      document.getElementById('swapAmtOut').value = isBuy
        ? Math.floor(outAfterSlip).toLocaleString()
        : outAfterSlip.toFixed(6);

      // 환율 표시
      if(isBuy){
        const rate = outAmt / amtIn;
        document.getElementById('swapPriceVal').textContent = `1 MON ≈ ${rate.toLocaleString(undefined,{maximumFractionDigits:0})} CHOG`;
      } else {
        const rate = outAmt / amtIn;
        document.getElementById('swapPriceVal').textContent = `1 CHOG ≈ ${rate.toFixed(6)} MON`;
      }
      return;
    }
  } catch(e){
    console.warn('LENS getAmountOut failed:', e.message);
  }

  // LENS 실패 시 가격 기반 폴백
  const price  = livePrice || 0.000731;
  const monUsd = cachedMonPrice || 2.8;
  let out;
  if(isBuy){
    out = (amtIn * monUsd) / price;
    document.getElementById('swapPriceVal').textContent =
      `1 MON ≈ ${(monUsd/price).toLocaleString(undefined,{maximumFractionDigits:0})} CHOG (est.)`;
  } else {
    out = (amtIn * price) / monUsd;
    document.getElementById('swapPriceVal').textContent =
      `1 CHOG ≈ ${(price/monUsd).toFixed(6)} MON (est.)`;
  }
  const outAfterSlip = out * (1 - swapSlippage/100);
  document.getElementById('swapAmtOut').value = isBuy
    ? Math.floor(outAfterSlip).toLocaleString()
    : outAfterSlip.toFixed(6);
}

function swapSetMax(){
  if(!wallet) return;
  const isBuy = currentSwapSide === 'buy';
  const inp = document.getElementById('swapAmtIn');
  if(isBuy){
    const monBal = wallet.monBal || 0;
    inp.value = Math.max(0, monBal - 0.01).toFixed(4); // gas 여유
  } else {
    inp.value = wallet.bal || 0;
  }
  swapCalcOut();
}

// ──────────────────────────────────────────────────────
// 실제 스왑 실행 (nad.fun 라우터 직접 호출)
// nad.fun은 Uniswap V2 호환 swapExactETHForTokens / swapExactTokensForETH
// ──────────────────────────────────────────────────────
async function execNativeSwap(){
  const amtIn = parseFloat(document.getElementById('swapAmtIn')?.value)||0;
  if(amtIn <= 0){ swapSetStatus('Please enter an amount.','err'); return; }

  const provider = window.ethereum;
  if(!provider || !wallet){ swapSetStatus('Please connect your wallet.','err'); return; }

  // ── 체인 확인 및 전환 ──────────────────────────────
  try{
    const currentChain = await provider.request({method:'eth_chainId'});
    if(currentChain.toLowerCase() !== MONAD_CHAIN_ID.toLowerCase()){
      swapSetStatus('🔄 Switching to Monad network...','');
      try{
        await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:MONAD_CHAIN_ID}]});
      } catch(sw){
        if(sw.code===4902||sw.code===-32603){
          await provider.request({method:'wallet_addEthereumChain',params:[{
            chainId:MONAD_CHAIN_ID,
            chainName:'Monad',
            nativeCurrency:{name:'MON',symbol:'MON',decimals:18},
            rpcUrls:['https://rpc.monad.xyz'],
            blockExplorerUrls:['https://explorer.monad.xyz']
          }]});
        } else if(sw.code===4001){
          swapSetStatus('❌ Network switch cancelled.','err'); return;
        } else {
          swapSetStatus('❌ Failed to switch to Monad.','err'); return;
        }
      }
      const confirmedChain = await provider.request({method:'eth_chainId'});
      if(confirmedChain.toLowerCase() !== MONAD_CHAIN_ID.toLowerCase()){
        swapSetStatus('❌ Please switch to Monad network in your wallet.','err'); return;
      }
    }
  } catch(chainErr){ console.warn('chain check:', chainErr.message); }

  const execBtn = document.getElementById('btnSwapExec');
  if(execBtn){ execBtn.disabled = true; execBtn.textContent = 'Processing...'; }

  try{
    const isBuy = currentSwapSide === 'buy';
    const deadline = BigInt(Math.floor(Date.now()/1000) + 1200);

    // ── ABI 인코딩 헬퍼 ──────────────────────────────
    // struct는 tuple로 인코딩: 함수 selector(4) + tuple 오프셋(32) + 필드들
    function encodeUint256(val){
      return BigInt(val).toString(16).padStart(64,'0');
    }
    function encodeAddress(addr){
      return addr.slice(2).toLowerCase().padStart(64,'0');
    }

    if(isBuy){
      // ── BUY: MON(native) → CHOG ──────────────────
      // function buy((uint256 amountOutMin, address token, address to, uint256 deadline)) payable
      // selector = keccak256("buy((uint256,address,address,uint256))") 앞 4바이트
      // 실제 Capricorn Router buy selector: 0x6df9e92b
      swapSetStatus('Sending BUY transaction...','');

      const amtOutMin = parseFloat(document.getElementById('swapAmtOut')?.value?.replace(/,/g,'')||'0')||0;
      // slippage 적용 (0.5% 추가 여유)
      const amtOutMinWei = BigInt(Math.floor(amtOutMin * 0.90 * 1e18));
      const monWei = BigInt(Math.floor(amtIn * 1e18));

      // struct tuple ABI 인코딩:
      // - tuple 자체가 인라인(not dynamic) → 오프셋 없이 바로 필드 나열
      // buy((uint256,address,address,uint256))
      // 0x00: amountOutMin (uint256)
      // 0x20: token (address → uint256로 패딩)
      // 0x40: to (address)
      // 0x60: deadline (uint256)
      const data = '0x6df9e92b'
        + encodeUint256(amtOutMinWei)          // amountOutMin
        + encodeAddress(CHOG_CONTRACT)          // token
        + encodeAddress(wallet.addr)            // to
        + encodeUint256(deadline);              // deadline

      console.log('BUY data:', data);
      console.log('value:', '0x'+monWei.toString(16));

      const txHash = await provider.request({method:'eth_sendTransaction', params:[{
        from:  wallet.addr,
        to:    NADFUN_ROUTER,
        value: '0x'+monWei.toString(16),
        data,
        gas:   '0x' + (350000).toString(16)
      }]});

      swapSetStatus(`✅ BUY sent! TX: ${txHash.slice(0,14)}...`, 'ok');
      console.log('BUY TX:', txHash);

    } else {
      // ── SELL: CHOG → MON(native) ─────────────────
      // function sell((uint256 amountIn, uint256 amountOutMin, address token, address to, uint256 deadline))
      // selector: 0x5de3085d
      const amtInWei  = BigInt(Math.floor(amtIn * 1e18));
      const amtOutMin = parseFloat(document.getElementById('swapAmtOut')?.value?.replace(/,/g,'')||'0')||0;
      const amtOutMinWei = BigInt(Math.floor(amtOutMin * 0.90 * 1e18));

      // Step 1: CHOG approve → Router
      swapSetStatus('Step 1/2: Approving CHOG...','');
      const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const approveData = '0x095ea7b3'
        + encodeAddress(NADFUN_ROUTER)
        + encodeUint256(maxUint256);

      const approveTx = await provider.request({method:'eth_sendTransaction', params:[{
        from: wallet.addr,
        to:   CHOG_CONTRACT,
        data: approveData,
        gas:  '0x' + (80000).toString(16)
      }]});
      console.log('Approve TX:', approveTx);

      // approve 컨펌 대기 (2초)
      swapSetStatus('Step 2/2: Sending SELL...','');
      await new Promise(r => setTimeout(r, 2000));

      // sell((uint256,uint256,address,address,uint256))
      // 0x00: amountIn
      // 0x20: amountOutMin
      // 0x40: token
      // 0x60: to
      // 0x80: deadline
      const data = '0x5de3085d'
        + encodeUint256(amtInWei)              // amountIn
        + encodeUint256(amtOutMinWei)          // amountOutMin
        + encodeAddress(CHOG_CONTRACT)          // token
        + encodeAddress(wallet.addr)            // to
        + encodeUint256(deadline);              // deadline

      console.log('SELL data:', data);

      const txHash = await provider.request({method:'eth_sendTransaction', params:[{
        from: wallet.addr,
        to:   NADFUN_ROUTER,
        data,
        gas:  '0x' + (350000).toString(16)
      }]});

      swapSetStatus(`✅ SELL sent! TX: ${txHash.slice(0,14)}...`, 'ok');
      console.log('SELL TX:', txHash);
    }

    // 잔고 갱신
    setTimeout(async ()=>{
      await swapGetMonBalance();
      swapUpdateBalances();
      // CHOG 잔고도 갱신
      const padded = wallet.addr.slice(2).padStart(64,'0');
      const balHex = await rpcCallAny('eth_call',[{to:CHOG_CONTRACT, data:'0x70a08231'+padded},'latest']);
      if(balHex && balHex !== '0x'){
        wallet.bal = Math.floor(Number(BigInt('0x'+(balHex.replace('0x','')||'0'))/BigInt('1000000000000000'))/1000);
        updateWalletDisplay();
      }
    }, 3000);

  } catch(e){
    console.error('swap error:', e);
    if(e.code===4001){
      swapSetStatus('❌ Transaction cancelled.','err');
    } else if(e.message?.includes('execution reverted')){
      swapSetStatus('❌ Reverted — check slippage or try Nad.fun directly.','err');
    } else {
      swapSetStatus(`❌ Error: ${e.message?.slice(0,60)||'Unknown error'}`, 'err');
    }
  } finally {
    if(execBtn){
      execBtn.disabled = false;
      execBtn.textContent = currentSwapSide==='buy' ? '▲ BUY CHOG' : '▼ SELL CHOG';
    }
  }
}

function swapSetStatus(msg, type){
  const el = document.getElementById('swapStatusMsg');
  if(!el) return;
  el.textContent = msg;
  el.className = 'swap-status' + (type ? ' '+type : '');
}

// ── HOLDER MODAL ─────────────────────────────────────
var holderCurrentTab = 'holders';
var holderCache = null;
var holderCacheTime = 0;

function openHolderModal(){
  document.getElementById('holderModal').classList.add('open');
  switchHolderTab('holders');
}
function closeHolderModal(){
  document.getElementById('holderModal').classList.remove('open');
}

function switchHolderTab(tab){
  holderCurrentTab = tab;
  document.getElementById('tabHolders').classList.toggle('active', tab==='holders');
  document.getElementById('tabTiers').classList.toggle('active', tab==='tiers');
  if(tab === 'holders') renderHolderList();
  else renderTierTable();
}

async function renderHolderList(){
  const content = document.getElementById('holderTabContent');
  content.innerHTML = '<div class="holder-loading">⏳ Loading top holders...</div>';

  // 지갑 미연결 시에도 rpcCallAny로 조회 가능
  if(false && !window.ethereum){
    content.innerHTML = `<div class="holder-loading" style="text-align:center">
      <div style="font-size:32px;margin-bottom:12px">🔗</div>
      <div style="color:var(--accent);font-weight:700;margin-bottom:6px">Connect Wallet to View Holders</div>
      <div style="color:var(--muted);font-size:11px">Wallet connection is required to fetch on-chain holder data.<br>Click "Connect Wallet" in the top right.</div>
    </div>`;
    return;
  }

  let holders = await fetchTopHolders();
  if(!holders || !holders.length){
    content.innerHTML = `<div class="holder-loading" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">😵</div>
      <div style="color:var(--red);font-weight:700;margin-bottom:6px">Failed to load holders</div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:14px">Could not reach MonadVision API.<br>Check your connection and retry.</div>
      <button onclick="holderCache=null;renderHolderList()" style="background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:10px;padding:8px 20px;color:#fff;font-weight:700;cursor:pointer;font-size:12px">🔄 Retry</button>
    </div>`;
    return;
  }

  // 내 순위 찾기
  let myRankIdx = -1;
  if(wallet){
    myRankIdx = holders.findIndex(h => h.address.toLowerCase() === wallet.addr.toLowerCase());
  }

  // 내 지갑이 목록에 없으면 추가 (순위 밖)
  let myOutOfList = false;
  if(wallet && myRankIdx === -1 && wallet.bal > 0){
    myOutOfList = true;
  }

  // 홀더 수 표시 (티커바에도 반영)
  const holderCount = holders.length;
  const th1 = document.getElementById('tickerHolders');
  const th2 = document.getElementById('tickerHolders2');
  const sh = document.getElementById('statHolders');
  const countStr = holderCount+'+ found';
  if(th1) th1.textContent = countStr;
  if(th2) th2.textContent = countStr;
  if(sh) sh.textContent = holderCount+'+';

  let html = `<div style="overflow-y:auto;max-height:60vh">
    <table class="holder-table">
      <thead><tr>
        <th>#</th>
        <th>Holder</th>
        <th style="text-align:right">Token Amount</th>
        <th style="text-align:right">Distribution</th>
      </tr></thead>
      <tbody>`;

  holders.forEach((h, i) => {
    const rank = i+1;
    const nick = getNick(h.address);
    const tierInfo = getRank(h.balance);
    const short = h.address.slice(0,6)+'...';
    const isDev = h.address.toLowerCase() === DEV_WALLET.toLowerCase();
    const isMe = wallet && wallet.addr.toLowerCase() === h.address.toLowerCase();

    // 표시 이름
    let displayName = nick || short;
    if(isDev && !nick) displayName = short + ' <span style="color:var(--muted);font-size:9px">(dev)</span>';
    else if(nick) displayName = nick;

    const rowStyle = isMe ? 'background:rgba(192,132,252,0.12);border-left:3px solid var(--accent);' : '';
    const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
    const rankColor = rank <= 3 ? 'top3' : '';

    // 금액 포맷
    const amtM = h.balance >= 1e6 ? (h.balance/1e6).toFixed(0)+'M'
               : h.balance >= 1e3 ? (h.balance/1e3).toFixed(0)+'K'
               : h.balance.toFixed(0);
    const usd = h.balance * (livePrice||0.000731);
    const usdStr = usd >= 1000 ? '($'+(usd/1000).toFixed(2)+'K)' : '($'+usd.toFixed(0)+')';

    html += `<tr class="holder-row" style="${rowStyle}" onclick="closeHolderModal();openProfileModal('${h.address}',${Math.floor(h.balance)},'${tierInfo.cls}','${tierInfo.badge}')">
      <td class="holder-rank-num ${rankColor}">${medal||rank}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="rank-badge ${tierInfo.cls}" style="font-size:8px;padding:1px 5px">${tierInfo.badge}</span>
          <span class="holder-nick">${displayName}</span>
          ${isMe ? '<span style="color:var(--accent);font-size:9px;font-weight:700;background:rgba(192,132,252,0.2);padding:1px 5px;border-radius:8px">YOU</span>' : ''}
        </div>
      </td>
      <td class="holder-amount">${amtM} <span style="color:var(--muted);font-size:9px">${usdStr}</span></td>
      <td class="holder-pct">${h.pct ? h.pct.toFixed(2)+'%' : '—'}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';

  // 내가 목록 밖에 있을 때 별도 표시
  if(myOutOfList){
    const myTier = getRank(wallet.bal);
    const myAmtM = wallet.bal >= 1e6 ? (wallet.bal/1e6).toFixed(0)+'M'
                 : wallet.bal >= 1e3 ? (wallet.bal/1e3).toFixed(0)+'K'
                 : wallet.bal.toFixed(0);
    html += `<div style="margin-top:8px;padding:10px 14px;background:rgba(192,132,252,0.08);border:1px solid var(--accent);border-radius:10px;font-size:12px;display:flex;align-items:center;gap:8px">
      <span style="color:var(--accent);font-weight:700">📍 Your Rank:</span>
      <span class="rank-badge ${myTier.cls}" style="font-size:8px">${myTier.badge}</span>
      <span style="color:var(--text)">${wallet.addr.slice(0,6)}...</span>
      <span style="margin-left:auto;font-family:'Share Tech Mono',monospace">${myAmtM} CHOG</span>
    </div>`;
  } else if(wallet && myRankIdx >= 0){
    html += `<div style="margin-top:8px;padding:10px 14px;background:rgba(192,132,252,0.08);border:1px solid var(--accent);border-radius:10px;font-size:12px;text-align:center;color:var(--accent);font-weight:700">
      📍 Your Rank: #${myRankIdx+1} of ${holderCount}+ holders
    </div>`;
  }

  html += `<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:6px">
    Click any holder to view profile · Top ${holderCount} holders via MonadVision
  </div>`;
  content.innerHTML = html;
}

async function fetchTopHolders(){
  if(holderCache && Date.now() - holderCacheTime < 60000) return holderCache;

  const BV_URL = `https://api.blockvision.org/v2/monad/token/holders?contractAddress=${CHOG_CONTRACT}&limit=50`;
  const enc = encodeURIComponent(BV_URL);

  // (url, isWrapped) — isWrapped=true: response is {contents:"json string"}
  const attempts = [
    [BV_URL, false],
    [`https://api.allorigins.win/get?url=${enc}`, true],
    [`https://api.allorigins.win/raw?url=${enc}`, false],
    [`https://corsproxy.io/?${enc}`, false],
    [`https://thingproxy.freeboard.io/fetch/${BV_URL}`, false]
  ];

  const parseData = (d) => {
    // 여러 응답 구조 시도
    const list = d?.result?.data || d?.result?.list || d?.data || d?.items || d?.holders || [];
    if(!list.length) throw new Error('empty list');
    return list.map(h => ({
      address: (h.holder || h.accountAddress || h.address || '').toLowerCase(),
      balance: h.amount ? Number(BigInt(h.amount) * 1000n / BigInt('1000000000000000000')) / 1000
               : h.balance ? parseFloat(h.balance) : 0,
      pct: parseFloat(h.percentage || h.pct || 0)
    })).filter(h => h.address && h.balance > 0);
  };

  for(const [url, isWrapped] of attempts){
    try {
      const label = url.includes('allorigins') ? 'allorigins' : url.includes('corsproxy') ? 'corsproxy' : url.includes('thingproxy') ? 'thingproxy' : 'direct';
      console.log(`📡 Fetching holders (${label})...`);
      const res = await fetch(url, {headers:{'accept':'application/json'}});
      if(!res.ok) throw new Error('HTTP '+res.status);
      let d = await res.json();
      if(isWrapped) d = JSON.parse(d.contents || '{}');
      console.log('raw response:', JSON.stringify(d).slice(0,200));
      const valid = parseData(d);
      if(valid.length > 0){
        console.log('✅ Holders loaded:', valid.length);
        holderCache = valid; holderCacheTime = Date.now();
        return valid;
      }
    } catch(e){ console.warn(`Holder fetch error (${url.slice(0,50)}):`, e.message); }
  }

  return null;
}

function renderTierTable(){
  const content = document.getElementById('holderTabContent');
  const TIERS = [
    {min:100000000, label:'CHOG GOD',              badge:'👑 GOD',     cls:'r1', color:'#ffd700'},
    {min:10000000,  label:'Dragon Overlord',        badge:'🐉 DRAGON',  cls:'r2', color:'#e5e7eb'},
    {min:1000000,   label:'CHOG Emperor',           badge:'👸 EMPEROR', cls:'r3', color:'#c084fc'},
    {min:100000,    label:'Royal Whale',             badge:'🐳 WHALE',   cls:'r4', color:'#f472b6'},
    {min:50000,     label:'Noble Flexer',            badge:'🥂 NOBLE',   cls:'r5', color:'#60a5fa'},
    {min:10000,     label:'Market Hustler',          badge:'💹 HUSTLER', cls:'r6', color:'#34d399'},
    {min:1000,      label:"McDonald's Shift Legend", badge:'🍔 SHIFT',   cls:'r7', color:'#fbbf24'},
    {min:100,       label:'Side Hustle Kid',         badge:'💸 HUSTLE',  cls:'r8', color:'#a78bfa'},
    {min:1,         label:'Street Beggar',           badge:'🙏 BEGGAR',  cls:'r9', color:'#94a3b8'},
    {min:0,         label:'ZeroCHOG Ghost',          badge:'👻 GHOST',   cls:'r10',color:'#6b7280'},
  ];

  const myBal = wallet ? wallet.bal : 0;
  const myTier = getRank(myBal);

  let html = `<div style="overflow-y:auto;max-height:60vh">`;
  TIERS.forEach(t => {
    const isMyTier = myTier.cls === t.cls;
    const minStr = t.min >= 1e6 ? (t.min/1e6)+'M' : t.min >= 1e3 ? (t.min/1e3)+'K' : t.min > 0 ? t.min : '0';
    html += `<div class="tier-row" style="${isMyTier?'border-color:'+t.color+';background:rgba(192,132,252,0.1)':''}">
      <div style="font-size:24px;width:36px;text-align:center">${t.badge.split(' ')[0]}</div>
      <div style="flex:1">
        <div style="font-weight:700;color:${t.color};font-size:13px">${t.label}
          ${isMyTier ? '<span style="font-size:10px;color:var(--accent);margin-left:6px">← YOU</span>' : ''}
        </div>
        <div style="font-size:10px;color:var(--muted);font-family:'Share Tech Mono',monospace">${minStr}+ CHOG</div>
      </div>
      <span class="rank-badge ${t.cls}">${t.badge}</span>
    </div>`;
  });

  html += `</div>
  <div style="margin-top:12px;padding:10px 12px;background:rgba(192,132,252,0.06);border:1px solid var(--border);border-radius:10px;font-size:11px;color:var(--muted);line-height:1.7">
    ${wallet
      ? `💜 Your balance: <b style="color:var(--accent)">${myBal.toLocaleString()} CHOG</b> → <b class="${myTier.cls}">${myTier.label}</b>`
      : '🔗 Connect wallet to see your tier'}
  </div>`;
  content.innerHTML = html;
}

function openWalletModal(){document.getElementById('walletModal').classList.add('open');}
function closeWalletModal(){document.getElementById('walletModal').classList.remove('open');}
function openRankModal(){document.getElementById('rankModal').classList.add('open');}
function closeRankModal(){document.getElementById('rankModal').classList.remove('open');}

async function connectWallet(name){
  closeWalletModal();
  const provider=window.ethereum;
  if(!provider){alert('No Web3 wallet detected!\nPlease install MetaMask.');return;}
  try{
    const accounts=await provider.request({method:'eth_requestAccounts'});
    if(!accounts||!accounts.length)throw new Error('No accounts');
    const addr=accounts[0];
    try{
      await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:MONAD_CHAIN_ID}]});
    } catch(sw){
      if(sw.code===4902||sw.code===-32603||sw.code===4200){
        try{
          await provider.request({method:'wallet_addEthereumChain',params:[{
            chainId:MONAD_CHAIN_ID,
            chainName:'Monad Mainnet',
            nativeCurrency:{name:'Monad',symbol:'MON',decimals:18},
            rpcUrls:['https://rpc.monad.xyz','https://monad-mainnet.rpc.thirdweb.com','https://monad.drpc.org'],
            blockExplorerUrls:['https://explorer.monad.xyz']
          }]});
          await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:MONAD_CHAIN_ID}]});
        } catch(addErr){ console.warn('addEthereumChain err:', addErr.message); }
      } else if(sw.code!==4001){ console.warn('switchChain err:', sw.message); }
    }
    const padded=addr.slice(2).padStart(64,'0');
    const balHex=await provider.request({method:'eth_call',params:[{to:CHOG_CONTRACT,data:'0x70a08231'+padded},'latest']});
    const raw=(balHex||'0x0').replace('0x','')||'0';
    const bal=BigInt?Number(BigInt('0x'+(raw||'0'))/BigInt('1000000000000000'))/1000:parseInt(raw.slice(0,-15)||'0',16)/1000;
    wallet={addr,bal:Math.floor(bal),name};chogBalance=wallet.bal;
    // MON 잔고도 로드
    try{
      const monHex = await provider.request({method:'eth_getBalance',params:[addr,'latest']});
      wallet.monBal = parseInt(monHex,16)/1e18;
    }catch(e){ wallet.monBal = 0; }
    const rank=getRank(wallet.bal, addr);
    const short=addr.slice(0,6)+'...'+addr.slice(-4);
    updateWalletDisplay();
    document.getElementById('chatInput').disabled=false;
    document.getElementById('chatInput').placeholder='Type a message...';
    document.getElementById('sendBtn').disabled=false;
    checkDevAccess();
    // 본인 랭킹 비동기 조회 후 채팅에 표시
    getHolderRank(addr).then(holderRank => {
      const nick     = getNick(addr);
      const name     = nick || short;
      const rankStr  = holderRank ? ` · Rank #${holderRank}` : '';
      const isDev    = addr.toLowerCase() === DEV_WALLET.toLowerCase();

      // 본인 입장 메시지
      renderMsg({
        addr: name, addrFull: addr, bal: wallet.bal,
        msg: `${rank.badge} ${rank.label}${rankStr}`,
        time: nowTime()
      });

      // 시스템 웰컴 메시지 (CHOG Terminal 봇처럼)
      setTimeout(() => {
        const welcomes = nick ? [
          `👋 Welcome back, <b>${nick}</b>! Great to see you 🟣`,
          `🎉 <b>${nick}</b> has entered the CHOG Terminal!`,
          `🟣 Hey <b>${nick}</b>! CHOG to the moon 🚀`,
        ] : [
          `👋 Welcome to CHOG Terminal! Set a nickname to stand out 🟣`,
          `🎉 New trader joined! Connect and set your nickname ✏️`,
          `🟣 Welcome! You're now live on CHOG Terminal 🚀`,
        ];
        const w = welcomes[Math.floor(Math.random()*welcomes.length)];
        const isDev2 = addr.toLowerCase() === DEV_WALLET.toLowerCase();
        const devMsg = isDev2 ? `🛠️ <b>CHOG Terminal DEV</b> has entered the building! 👑` : null;

        const chatList2 = document.getElementById('chatList');
        if(!chatList2) return;
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.style.cssText = 'background:rgba(192,132,252,0.1);border:1px solid rgba(192,132,252,0.3);';
        div.innerHTML = `
          <div class="msg-meta">
            <span style="font-size:12px">🤖</span>
            <span style="font-weight:700;color:var(--accent);font-size:11px">CHOG Terminal</span>
            <span style="font-size:10px;color:var(--muted);margin-left:auto">${nowTime()}</span>
          </div>
          <div style="font-size:12px">${devMsg || w}</div>`;
        chatList2.appendChild(div);
        if(chatList2.children.length>20) chatList2.removeChild(chatList2.firstChild);
        chatList2.scrollTop = chatList2.scrollHeight;
      }, 600);
    });
    provider.on('accountsChanged',accs=>{if(!accs.length){wallet=null;location.reload();}else connectWallet(name);});
  }catch(err){console.error('connectWallet error:',err);alert('Connection failed: '+(err.message||err));}
}

function sendChat(){
  if(!wallet)return;
  const inp=document.getElementById('chatInput');
  const msg=inp.value.trim();if(!msg)return;
  renderMsg({addr:wallet.addr,bal:wallet.bal,msg,time:nowTime()});
  inp.value='';
  if(typeof trackChatPoint==='function') trackChatPoint();
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
  if(typeof trackShoutPoint==='function') trackShoutPoint();
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

