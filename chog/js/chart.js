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

