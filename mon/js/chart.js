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

let chartInited=false;
function initChart(){
  if(chartInited)return;
  chartInited=true;
  const w = document.getElementById('chart-wrapper');
  if(!w){ chartInited=false; setTimeout(initChart, 100); return; }

  // DEXScreener iframe 임베드
  const tvContainer = document.getElementById('tv-chart-container');
  const fallback    = document.getElementById('chart-fallback');

  if(tvContainer){
    var CHART_SRC = 'https://dexscreener.com/monad/0x659bd0bc4167ba25c62e05656f78043e7ed4a9da?embed=1&theme=dark&trades=0&info=0&chartType=price';
    tvContainer.innerHTML = '<iframe src="'+CHART_SRC+'" style="width:100%;height:360px;border:none;display:block" allow="clipboard-write" loading="eager" title="MON/USDC Chart"></iframe>';
    tvContainer.style.display = 'block';
    tvContainer.style.position = 'relative';
    tvContainer.style.zIndex = '1';

    window.addEventListener('orientationchange', () => {
      tvContainer.style.width = '100%';
    });
    if(fallback) fallback.style.display = 'none';
    console.log('✅ DEXScreener 차트 로드');

    // 마우스 커서 캐릭터 — CHOG 터미널과 동일한 팔로우 애니메이션
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
        transition    : 'opacity 0.25s',
        willChange    : 'transform',
        display       : 'block',
      });

      let targetX = window.innerWidth / 2;
      let targetY = window.innerHeight / 2;
      let curX = targetX, curY = targetY, floatT = 0;

      document.addEventListener('mousemove', e => {
        targetX = e.clientX - 36;
        targetY = e.clientY - 80;
      });
      document.addEventListener('touchmove', e => {
        targetX = e.touches[0].clientX - 36;
        targetY = e.touches[0].clientY - 80;
      }, { passive: true });

      (function animateCursor(){
        const chessOpen = document.getElementById('chessModal')?.classList.contains('open');
        chog.style.opacity = chessOpen ? '0' : '1';
        curX += (targetX - curX) * 0.12;
        curY += (targetY - curY) * 0.12;
        floatT += 0.04;
        chog.style.left      = curX + 'px';
        chog.style.top       = curY + 'px';
        chog.style.transform = `translateY(${Math.sin(floatT) * 5}px) rotate(${Math.sin(floatT * 0.6) * 4}deg)`;
        requestAnimationFrame(animateCursor);
      })();
    }

    // 모바일 스크롤 후 iframe 소멸 방지 - IntersectionObserver로 복구
    if('IntersectionObserver' in window){
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if(entry.isIntersecting){
            const iframe = tvContainer.querySelector('iframe');
            if(!iframe || !iframe.src){
              tvContainer.innerHTML = '<iframe src="'+CHART_SRC+'" style="width:100%;height:360px;border:none;display:block" allow="clipboard-write" loading="eager" title="MON/USDC Chart"></iframe>';
            }
          }
        });
      }, {threshold: 0.1});
      observer.observe(tvContainer);
    }
  }

  // 실시간 가격 폴링은 계속 유지
  startPriceRefresh();

  // 삼성인터넷 스크롤 시 iframe 사라짐 방지
  // 접근: RAF 루프 대신, 스크롤 종료 후 iframe이 깨졌는지 1회 체크 + display 토글로 복구
  (function(){
    var scrollTimer = null;
    var chartSrc = 'https://dexscreener.com/monad/0x659bd0bc4167ba25c62e05656f78043e7ed4a9da?embed=1&theme=dark&trades=0&info=0&chartType=price';

    function recoverIframe(){
      var c = document.getElementById('tv-chart-container');
      if(!c) return;
      var iframe = c.querySelector('iframe');
      if(!iframe || !iframe.src || iframe.src==='about:blank'){
        // iframe이 DOM에서 완전히 사라진 경우 → 재생성
        c.innerHTML = '<iframe src="'+chartSrc+'" style="width:100%;height:360px;border:none;display:block" allow="clipboard-write" loading="eager" title="MON/USDC Chart"></iframe>';
        return;
      }
      // iframe은 있지만 렌더링이 사라진 경우 → display 토글로 강제 repaint
      // (한 번만 실행, RAF 루프 아님)
      iframe.style.display = 'none';
      iframe.offsetHeight; // force reflow
      iframe.style.display = 'block';
    }

    // 스크롤 종료 200ms 후 1회 체크 (디바운스)
    window.addEventListener('scroll', function(){
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(recoverIframe, 200);
    }, {passive:true});

    // 터치 종료 시에도 체크
    window.addEventListener('touchend', function(){
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(recoverIframe, 200);
    }, {passive:true});
  })();
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
  ctx.strokeStyle='rgba(124,58,237,0.06)';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=PT+(cH/4)*i;
    ctx.beginPath();ctx.moveTo(PAD_L,y);ctx.lineTo(PAD_L+cW,y);ctx.stroke();
  }

  // 시총 라인
  ctx.beginPath();
  ctx.strokeStyle='rgba(124,58,237,0.5)';
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
  ctx.strokeStyle='rgba(124,58,237,0.15)';
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

  // MON 캐릭터 위치 업데이트
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
  ctx.strokeStyle='rgba(124,58,237,0.06)';
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
  ctx.strokeStyle='rgba(124,58,237,0.15)'; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(W-PAD_R,0);ctx.lineTo(W-PAD_R,H);ctx.stroke();
  ctx.fillStyle='#7c6fa0'; ctx.font='9px monospace'; ctx.textAlign='left';
  for(let i=0;i<=4;i++){
    const p=hi-(hi-lo)*(i/4);
    const y=PT+(cH/4)*i;
    const lbl = '$' + p.toFixed(4); // MON price (USD)
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
    const badgeLbl = '$' + last.toFixed(4); // MON current price
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

  // MON 캐릭터
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

