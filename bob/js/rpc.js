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
        // Sanity: BOB should be between $0.0000001 and $0.1
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
    console.log('RPC price: BOB/WMON='+priceInWMON.toFixed(8)+' USD='+priceUsd.toFixed(8)+' MCap=$'+(priceUsd*1e9/1000).toFixed(0)+'K');

    if(priceUsd < 1e-10 || priceUsd > 1) { console.warn('RPC price out of range:', priceUsd); return null; }
    return priceUsd;
  } catch(e) {
    console.error('RPC err:', e.message);
    return null;
  }
}


async function getMonPrice() {
  // DEXScreener에서 BOB/WMON priceUsd ÷ priceNative = MON/USD
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

