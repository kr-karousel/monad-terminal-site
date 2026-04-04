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

var _isHistoryLoad = false;
var _historyRemain = 0; // 히스토리 표시 남은 건수

function startLiveTrades() {
  loadRecentTrades().finally(() => startPolling());
}

// 페이지 로드 시 플로팅 기준 이상 거래 최근 5건만 채팅에 표시
async function loadRecentTrades(){
  try{
    const blockHex = await rpcCallAny('eth_blockNumber', []);
    if(!blockHex) return;
    const cur = parseInt(blockHex, 16);

    // 최대 5000블록 (~1~2시간) 스캔해서 큰 거래 찾기
    const from = Math.max(0, cur - 5000);

    const logs = await rpcCallAny('eth_getLogs', [{
      address: NADFUN_POOL,
      topics:  [[SWAP_TOPIC_V3, TRADE_TOPIC_KURU]],
      fromBlock: '0x' + from.toString(16),
      toBlock:   '0x' + cur.toString(16),
    }]);

    lastPollBlock = cur;
    if(!logs || !logs.length) return;

    // 오래된→최신 순이므로 뒤에서 뒤집어 최신 기준으로 필터
    // handleSwapLog 내부에서 MON_BIG 이상인 것만 채팅 렌더링
    // _historyRemain으로 5건 제한
    _historyRemain = 5;
    _isHistoryLoad = true;
    // 최신순으로 처리해서 5건 채우기
    for(let i = logs.length - 1; i >= 0 && _historyRemain > 0; i--){
      handleSwapLog(logs[i]);
    }
    _isHistoryLoad = false;
    _historyRemain = 0;
  }catch(e){
    _isHistoryLoad = false;
    _historyRemain = 0;
  }
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

    // 플로팅 알림 — 히스토리 로드 시 스킵
    if(!_isHistoryLoad) showTradeFloat(isBuy, usdValue, chogAmount, monAmount);

    // 채팅 — 라이브: MON_BIG 이상 / 히스토리: MON_BIG 이상 + 남은 건수 있을 때만
    const chatThreshold = monAmount >= MON_BIG;
    if(chatThreshold && (!_isHistoryLoad || _historyRemain > 0)) {
      if(_isHistoryLoad) _historyRemain--;
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
      if(!_isHistoryLoad) chogEmotion(isBuy ? 'buy' : 'sell');
    }

    console.log(isBuy?'🟢 BUY':'🔴 SELL', chogAmount.toFixed(0),'CHOG | $'+usdValue.toFixed(2),'| $'+priceUsd.toFixed(8));
  } catch(e) { console.warn('handleSwapLog:', e.message); }
}

