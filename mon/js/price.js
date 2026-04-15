function updatePriceDisplay(p){
  const str='$'+p.toFixed(4); // MON은 $0.0XXX 수준, 4자리면 충분
  const t=document.getElementById('tickerPrice');if(t)t.textContent=str;
  const t2=document.getElementById('tickerPrice2');if(t2)t2.textContent=str;
  const ph=document.getElementById('livePriceDisplay');if(ph)ph.textContent=str;
  const pct=priceChange24h;
  const el=document.getElementById('priceChange');
  if(el){el.textContent=(pct>=0?'▲':'▼')+' '+Math.abs(pct).toFixed(2)+'% (24h)';el.className='price-change '+(pct>=0?'up':'down');}
  const tc=document.getElementById('tickerChg');
  const chgStr=(pct>=0?'▲':'▼')+' '+Math.abs(pct).toFixed(1)+'%';
  const chgCls=pct>=0?'up':'dn';
  if(tc){tc.textContent=chgStr;tc.className=chgCls;}
  const tc2=document.getElementById('tickerChg2');
  if(tc2){tc2.textContent=chgStr;tc2.className=chgCls;}
  if(typeof checkPriceAlerts === 'function') checkPriceAlerts(p);
}

function updateMcap(mcap){
  const s='$'+formatK(mcap);
  const a=document.getElementById('liveMcap');if(a)a.textContent=s;
  const b=document.getElementById('statMcap');if(b)b.textContent=s;
  const c=document.getElementById('tickerMcap');if(c)c.textContent='$'+formatK(mcap);
  const c2=document.getElementById('tickerMcap2');if(c2)c2.textContent='$'+formatK(mcap);
  // ATH 게이지
  const ATH_MCAP = 500000000; // $500M ATH for MON
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

    // 최근 1200블록 (~20분) WMON/USDC 스왑 이벤트 가져오기
    const from = cur - 1200;
    const logs = await rpcCallAny('eth_getLogs', [{
      address: MON_USDC_POOL,
      topics: [[SWAP_TOPIC_V3, SWAP_TOPIC_PCSK3]],
      fromBlock: '0x' + from.toString(16),
      toBlock: '0x' + cur.toString(16),
    }]);

    if(!logs || logs.length < 2) {
      console.warn('No initial trades, using simulation');
      useFallbackTrades();
      return;
    }

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

        // WMON/USDC: priceUSD = (sqrtPrice/Q96)^2 * 10^12
        const priceUsd = sqrtToMonPrice(sqrtHex);
        if(!priceUsd) return;

        // WMON is token0: amount0 < 0 → WMON leaving pool → BUY
        const isBuy   = amount0 < 0n;
        const monAmt  = Number(amount0 < 0n ? -amount0 : amount0) / 1e18;
        const usdcAmt = Number(amount1 < 0n ? -amount1 : amount1) / 1e6;
        const usdValue = usdcAmt > 0 ? usdcAmt : monAmt * priceUsd;

        // MON의 circulating supply = native chain, mcap 기준은 DEXScreener에서
        trades.push({ time:ts, price:priceUsd, mcap: 0, usd: usdValue, mon: monAmt, isBuy });
      } catch(e){}
    });

    // 시간순 정렬 + Max 200개
    trades.sort((a,b) => a.time - b.time);
    if(trades.length > MAX_TRADES) trades.splice(0, trades.length - MAX_TRADES);

    if(trades.length > 0){
      livePrice = trades[trades.length-1].price;
      isSimulTrades = false; // 실제 데이터!
      console.log('✅ Loaded real MON trades:', trades.length, 'trades');
      updatePriceDisplay(livePrice);
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
  const basePrice = livePrice || 0.035; // MON ~$0.035 fallback
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
      mcap:  0,
      usd:   Math.random() * 200 + 10,
      isBuy
    });
    t += 25 + Math.random() * 35; // 25~60초 간격
  }
  // 마지막은 현재가로
  if(trades.length > 0){
    trades[trades.length-1].price = basePrice;
    trades[trades.length-1].mcap  = 0;
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
  if(info.marketCap > 0) updateMcap(info.marketCap);
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

// ── 실시간 거래 피드 (WMON/USDC 풀 모니터링) ───────────
let wsConn = null;
let wsRetryTimer = null;

function startLiveTrades() {
  startPolling();
}

let lastPollBlock = 0;
function startPolling() {
  setInterval(async () => {
    try {
      const blockHex = await rpcCallAny('eth_blockNumber', []);
      if (!blockHex) return;
      const cur = parseInt(blockHex, 16);
      if (!lastPollBlock) { lastPollBlock = cur - 5; return; }
      if (cur <= lastPollBlock) return;

      const from = lastPollBlock + 1;
      const to   = Math.min(cur, from + 20);
      lastPollBlock = to;

      const logs = await rpcCallAny('eth_getLogs', [{
        address: MON_USDC_POOL,
        topics: [[SWAP_TOPIC_V3, SWAP_TOPIC_PCSK3]],
        fromBlock: '0x' + from.toString(16),
        toBlock:   '0x' + to.toString(16),
      }]);
      if (logs && logs.length) logs.forEach(handleSwapLog);
    } catch(e) {}
  }, 2000);
}

// WMON(token0,18dec) / USDC(token1,6dec) 스왑 파싱
function handleSwapLog(log) {
  try {
    const data = log.data;
    if (!data || data.length < 2 + 64 * 5) return;

    function toSignedInt(hex) {
      const val = BigInt('0x' + hex);
      const MAX = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000');
      return val >= MAX ? val - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000') : val;
    }

    const amount0 = toSignedInt(data.slice(2, 66));   // WMON (18dec)
    const amount1 = toSignedInt(data.slice(66, 130));  // USDC (6dec)
    const sqrtHex = data.slice(130, 194);

    const priceUsd = sqrtToMonPrice(sqrtHex);
    if (!priceUsd) return;

    // WMON(token0): amount0 < 0 → WMON 풀에서 나감 → BUY MON
    //               amount0 > 0 → WMON 풀로 들어옴 → SELL MON
    const isBuy    = amount0 < 0n;
    const monAmt   = Number(amount0 < 0n ? -amount0 : amount0) / 1e18;
    const usdcAmt  = Number(amount1 < 0n ? -amount1 : amount1) / 1e6;
    const usdValue = usdcAmt > 0 ? usdcAmt : monAmt * priceUsd;

    // BIG 기준(100K MON) 미만이면 알림 없음, 차트만 업데이트
    if (monAmt < MON_ALERT_BIG) {
      // 차트 데이터는 기록 ($0.01 이상)
      if (usdValue < 0.01) return;
      livePrice = priceUsd;
      cachedMonPrice = priceUsd;
      isSimulTrades = false;
      trades.push({ time: Math.floor(Date.now() / 1000), price: priceUsd, mcap: 0, usd: usdValue, isBuy, mon: monAmt });
      if (trades.length > MAX_TRADES) trades.shift();
      drawChart();
      updatePriceDisplay(priceUsd);
      return;
    }

    livePrice = priceUsd;
    cachedMonPrice = priceUsd;
    isSimulTrades = false;
    trades.push({ time: Math.floor(Date.now() / 1000), price: priceUsd, mcap: 0, usd: usdValue, isBuy, mon: monAmt });
    if (trades.length > MAX_TRADES) trades.shift();
    drawChart();
    updatePriceDisplay(priceUsd);

    // 플로팅 알림 ($10K+)
    showTradeFloat(isBuy, usdValue, monAmt);

    // 채팅창 거래 알림
    const txHash = log.transactionHash || '';
    const _isBuy = isBuy, _monAmt = monAmt, _priceUsd = priceUsd, _usdValue = usdValue;
    rpcCallAny('eth_getTransactionByHash', [txHash]).then(async txData => {
      const addrFull = (txData && txData.from) ? txData.from
        : (log.topics && log.topics[2] ? '0x' + log.topics[2].slice(26) : '');
      const addrShort = addrFull ? addrFull.slice(0, 6) + '...' + addrFull.slice(-4) : '0xUnknown';
      let bal = 0;
      if (addrFull && typeof fetchMonBalance === 'function') {
        bal = (await fetchMonBalance(addrFull)) || 0;
      }
      renderMsg({
        type: 'trade', side: _isBuy ? 'buy' : 'sell',
        addr: addrShort, addrFull, txHash, bal,
        amount: _monAmt, price: _priceUsd, mon: _monAmt, usd: _usdValue,
        time: nowTime()
      });
    }).catch(() => {
      const addrFull = log.topics && log.topics[2] ? '0x' + log.topics[2].slice(26) : '';
      renderMsg({
        type: 'trade', side: _isBuy ? 'buy' : 'sell',
        addr: addrFull ? addrFull.slice(0, 6) + '...' + addrFull.slice(-4) : '0xUnknown',
        addrFull, txHash, bal: 0,
        amount: _monAmt, price: _priceUsd, mon: _monAmt, usd: _usdValue,
        time: nowTime()
      });
    });
    monEmotion(isBuy ? 'buy' : 'sell');

    console.log(isBuy ? '🟢 BUY' : '🔴 SELL', monAmt.toFixed(2), 'MON | $' + usdValue.toFixed(2));
  } catch(e) { console.warn('handleSwapLog:', e.message); }
}

// ── Load last N qualifying trades on startup ──────
async function loadRecentTrades(maxCount) {
  maxCount = maxCount || 5;
  try {
    const blockHex = await _rpcDirect('eth_blockNumber', []);
    if (!blockHex) return;
    const curBlock = parseInt(blockHex, 16);
    const CHUNK    = 400;
    const MAX_SCAN = 43200;

    function toSigned(hex) {
      const v = BigInt('0x' + hex);
      const M = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000');
      return v >= M ? v - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000') : v;
    }

    const qualifying = [];
    for (let end = curBlock; end > curBlock - MAX_SCAN && qualifying.length < maxCount; end -= CHUNK) {
      const start = Math.max(end - CHUNK + 1, curBlock - MAX_SCAN);
      const logs = await _rpcDirect('eth_getLogs', [{
        address: MON_USDC_POOL,
        topics:  [[SWAP_TOPIC_V3, SWAP_TOPIC_PCSK3]],
        fromBlock: '0x' + start.toString(16),
        toBlock:   '0x' + end.toString(16),
      }]);
      if (!logs || !logs.length) continue;

      for (let i = logs.length - 1; i >= 0 && qualifying.length < maxCount; i--) {
        const log = logs[i];
        try {
          const d = log.data;
          if (!d || d.length < 2 + 64 * 5) continue;
          const a0  = toSigned(d.slice(2, 66));
          const a1  = toSigned(d.slice(66, 130));
          const sqH = d.slice(130, 194);
          const pUsd = sqrtToMonPrice(sqH);
          if (!pUsd) continue;
          const isBuy  = a0 < 0n;
          const mon    = Number(a0 < 0n ? -a0 : a0) / 1e18;
          const usdc   = Number(a1 < 0n ? -a1 : a1) / 1e6;
          const usd    = usdc > 0 ? usdc : mon * pUsd;
          if (mon < MON_ALERT_BIG) continue; // 100K MON 미만 스킵
          const sec = curBlock - parseInt(log.blockNumber, 16);
          const t   = sec < 60 ? sec + 's ago' : sec < 3600 ? Math.floor(sec / 60) + 'm ago' : Math.floor(sec / 3600) + 'h ago';
          qualifying.push({ txHash: log.transactionHash, isBuy, mon, usd, pUsd, t });
        } catch(e) {}
      }
    }
    if (!qualifying.length) return;

    for (const tr of qualifying.reverse()) {
      const txData   = await _rpcDirect('eth_getTransactionByHash', [tr.txHash]);
      const addrFull = (txData && txData.from) ? txData.from : '';
      renderMsg({
        type: 'trade', side: tr.isBuy ? 'buy' : 'sell',
        addr: addrFull ? addrFull.slice(0, 6) + '...' + addrFull.slice(-4) : '0xUnknown',
        addrFull, txHash: tr.txHash, bal: 0,
        amount: tr.mon, price: tr.pUsd, mon: tr.mon, usd: tr.usd,
        time: tr.t, silent: true,
      });
    }
    console.log('✅ Loaded', qualifying.length, 'recent trades (100K+ MON)');
  } catch(e) { console.warn('loadRecentTrades:', e.message); }
}

