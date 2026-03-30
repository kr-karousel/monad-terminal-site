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
        // Sanity: EMO should be between $0.0000001 and $0.1
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
    console.log('RPC price: EMO/WMON='+priceInWMON.toFixed(8)+' USD='+priceUsd.toFixed(8)+' MCap=$'+(priceUsd*1e9/1000).toFixed(0)+'K');

    if(priceUsd < 1e-10 || priceUsd > 1) { console.warn('RPC price out of range:', priceUsd); return null; }
    return priceUsd;
  } catch(e) {
    console.error('RPC err:', e.message);
    return null;
  }
}


async function getMonPrice() {
  // DEXScreener에서 EMO/WMON priceUsd ÷ priceNative = MON/USD
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

    const amount0 = toSignedInt(amount0Hex); // EMO if token0
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
    // EMO/WMON 풀에서:
    //   EMO amount < 0 → EMO 풀에서 나감 → 사용자가 EMO 받음 → BUY
    //   EMO amount > 0 → EMO 풀로 들어옴 → 사용자가 EMO 넣음 → SELL
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
  try { nickDB = JSON.parse(localStorage.getItem('emo_nicks')||'{}'); } catch(e){ nickDB={}; }
  // 개발자 지갑 닉네임 고정
  nickDB['0x38a7d00c3494acff01c0d216a6115a2af1a72162'] = 'EMO Terminal DEV 🟣';
}
function saveNickDB(){
  try { localStorage.setItem('emo_nicks', JSON.stringify(nickDB)); } catch(e){}
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
      <span class="nick-cost-badge" id="nickCostDisplay">🖤 2,000 EMO</span>
    </div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-bottom:12px">
      Balance: <b style="color:var(--accent)">${wallet.bal.toLocaleString()} EMO</b>
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
    alert('Insufficient balance!\nNeed: '+NICK_COST.toLocaleString()+' EMO\nHave: '+wallet.bal.toLocaleString()+' EMO');
    return;
  }

  // EMO 10,000 전송 (dev wallet)
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
      <span style="font-size:10px;font-family:'Share Tech Mono',monospace;color:var(--muted)">${wallet.bal.toLocaleString()} EMO</span>
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

  // EMO 잔액 추정 (실제 조회는 비동기)
  content.innerHTML = `
    <div class="profile-avatar">${rank.badge.split(' ')[0]}</div>
    ${nick ? `<div style="font-family:'Bangers',cursive;font-size:20px;letter-spacing:1px;color:var(--accent);text-align:center;margin-bottom:2px">${nick}</div>` : ''}
    <div class="profile-addr" style="font-size:11px;opacity:0.7">${addrFull || short}</div>
    <div class="profile-rank-big ${rankCls}">${rank.label}</div>

    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-val" id="profileChogBal">${bal>0?bal.toLocaleString():'—'}</div>
        <div class="profile-stat-lbl">EMO</div>
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
      <label>Amount to Send (EMO)</label>
      <input class="send-amount-input" id="sendChogAmount" type="number" placeholder="0" min="1">
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-align:center">
      Balance: <b style="color:var(--accent)">${wallet.bal.toLocaleString()} EMO</b>
    </div>
    <button class="btn-send-chog" onclick="sendChogTo('${addrFull}')">
      💜 EMO Send
    </button>
    ` : isMe ? `
    <div style="text-align:center;padding:12px;background:rgba(192,132,252,0.08);border-radius:10px;font-size:12px;color:var(--accent)">
      👑 This is your wallet
    </div>
    ` : `
    <div style="text-align:center;padding:12px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Connect your wallet to send EMO</div>
      <button onclick="closeProfileModal();openWalletModal()"
        style="width:100%;padding:12px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-family:'Bangers',cursive;font-size:18px;letter-spacing:1px;cursor:pointer">
        🔗 Connect Wallet
      </button>
    </div>
    `}
  `;

  modal.classList.add('open');

  // 실제 EMO 잔액 + 랭킹 비동기 조회
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
  if(amt > wallet.bal){ alert('Insufficient balance!\nHave: '+wallet.bal.toLocaleString()+' EMO\nSend: '+amt.toLocaleString()+' EMO'); return; }

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
    alert('✅ Transfer complete!\n'+amt.toLocaleString()+' EMO → '+toAddr.slice(0,8)+'...\nTx: '+(txHash?.slice(0,20)||'')+'...');
    renderMsg({addr:wallet.addr.slice(0,6)+'...'+wallet.addr.slice(-4), bal:wallet.bal, msg:`💜 ${toAddr.slice(0,6)}...to ${amt.toLocaleString()} EMO sent!`, time:nowTime()});
  }catch(e){
    alert('Transfer failed: '+(e.message||e));
  }
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

      // 시스템 웰컴 메시지 (EMO Terminal 봇처럼)
      setTimeout(() => {
        const welcomes = nick ? [
          `👋 Welcome back, <b>${nick}</b>! Great to see you 🟣`,
          `🎉 <b>${nick}</b> has entered the EMO Terminal!`,
          `🟣 Hey <b>${nick}</b>! EMO to the moon 🚀`,
        ] : [
          `👋 Welcome to EMO Terminal! Set a nickname to stand out 🟣`,
          `🎉 New trader joined! Connect and set your nickname ✏️`,
          `🟣 Welcome! You're now live on EMO Terminal 🚀`,
        ];
        const w = welcomes[Math.floor(Math.random()*welcomes.length)];
        const isDev2 = addr.toLowerCase() === DEV_WALLET.toLowerCase();
        const devMsg = isDev2 ? `🛠️ <b>EMO Terminal DEV</b> has entered the building! 👑` : null;

        const chatList2 = document.getElementById('chatList');
        if(!chatList2) return;
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.style.cssText = 'background:rgba(192,132,252,0.1);border:1px solid rgba(192,132,252,0.3);';
        div.innerHTML = `
          <div class="msg-meta">
            <span style="font-size:12px">🤖</span>
            <span style="font-weight:700;color:var(--accent);font-size:11px">EMO Terminal</span>
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

