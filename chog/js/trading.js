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

