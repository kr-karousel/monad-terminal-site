// ═══════════════════════════════════════
//  MONAD TERMINAL - RPC
// ═══════════════════════════════════════
async function rpcCall(method, params) {
  return rpcCallAny(method, params);
}

const MONAD_RPC_LIST = [
  'https://rpc.monad.xyz',
  'https://monad-mainnet.rpc.thirdweb.com',
  'https://monad.drpc.org',
];

async function rpcCallAny(method, params) {
  if (window.ethereum) {
    try {
      const result = await window.ethereum.request({ method, params });
      if (result !== undefined && result !== null) return result;
    } catch(e) {
      // 지갑 RPC 실패는 무시하고 공용 RPC로 fallback (콘솔 노이즈 제거)
    }
  }
  for (const rpc of MONAD_RPC_LIST) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.error) continue;
      if (d.result !== undefined) return d.result;
    } catch(e) {}
  }
  return null;
}

const TF_MAP = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 240: '4h', 1440: '1d', 10080: '1w' };

// Uniswap V3 / PancakeSwap V3 Swap event topics
const SWAP_TOPIC_V3    = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const SWAP_TOPIC_PCSK3 = '0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83';

// WMON(token0,18dec) / USDC(token1,6dec)
// price = (sqrtPrice/Q96)^2 * 10^(18-6)
const USDC_DECIMAL_ADJUST = 1e12;

const _LOGS_RPC_LIST = [
  'https://monad-mainnet.rpc.thirdweb.com',
  'https://monad.drpc.org',
];
async function _rpcDirect(method, params) {
  for (const rpc of _LOGS_RPC_LIST) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.error) continue;
      if (d.result !== undefined) return d.result;
    } catch(e) {}
  }
  return null;
}

// sqrtPriceX96 → MON/USD price
function sqrtToMonPrice(sqrtHex) {
  const Q96 = BigInt('0x1000000000000000000000000');
  const sqrtVal = BigInt('0x' + sqrtHex);
  if (sqrtVal === 0n) return null;
  const ratio = Number(sqrtVal) / Number(Q96);
  const priceUsd = ratio * ratio * USDC_DECIMAL_ADJUST;
  if (priceUsd < 0.0001 || priceUsd > 10000) return null;
  return priceUsd;
}

async function fetchCandles(intervalMin) {
  try {
    const blockHex = await rpcCallAny('eth_blockNumber', []);
    if (!blockHex) return null;
    const curBlock = parseInt(blockHex, 16);
    const barsBack = intervalMin <= 5 ? 120 : intervalMin <= 60 ? 100 : 60;
    const secsBack = intervalMin * 60 * barsBack;
    const blocksBack = Math.min(secsBack, 2000);
    const CHUNK = 400;
    const allLogs = [];
    const fromBlock = curBlock - blocksBack;
    for (let s = fromBlock; s < curBlock; s += CHUNK) {
      const e = Math.min(s + CHUNK - 1, curBlock);
      const logs = await rpcCallAny('eth_getLogs', [{
        address: MON_USDC_POOL,
        topics: [[SWAP_TOPIC_V3, SWAP_TOPIC_PCSK3]],
        fromBlock: '0x' + s.toString(16),
        toBlock:   '0x' + e.toString(16),
      }]);
      if (logs && logs.length) allLogs.push(...logs);
      if (allLogs.length >= 300) break;
    }
    if (allLogs.length < 3) { console.warn('RPC: only', allLogs.length, 'swap logs'); return null; }
    return buildOHLCV(allLogs, intervalMin, curBlock);
  } catch(e) {
    console.warn('fetchCandles RPC:', e.message);
    return null;
  }
}

function buildOHLCV(logs, intervalMin, curBlock) {
  const iSec = intervalMin * 60;
  const now  = Math.floor(Date.now() / 1000);
  const buckets = {};
  logs.forEach(log => {
    const blk = parseInt(log.blockNumber, 16);
    const ts  = now - (curBlock - blk);
    const bTs = ts - (ts % iSec);
    let priceUsd = 0;
    if (log.data && log.data.length >= 2 + 64 * 5) {
      try {
        const sqrtHex = log.data.slice(2 + 64 * 2, 2 + 64 * 3);
        const p = sqrtToMonPrice(sqrtHex);
        if (p) priceUsd = p;
      } catch(e) { return; }
    }
    if (!priceUsd) return;
    if (!buckets[bTs]) {
      buckets[bTs] = { time: bTs, open: priceUsd, high: priceUsd, low: priceUsd, close: priceUsd };
    } else {
      const b = buckets[bTs];
      b.high  = Math.max(b.high, priceUsd);
      b.low   = Math.min(b.low,  priceUsd);
      b.close = priceUsd;
    }
  });
  const result = Object.values(buckets).sort((a, b) => a.time - b.time);
  return result.length >= 3 ? result : null;
}

function parseCandles(raw) {
  const seen = new Set();
  return raw.map(c => {
    const t = c.timestamp ? Math.floor(c.timestamp / 1000) :
              c.time      ? Math.floor(c.time > 1e10 ? c.time / 1000 : c.time) :
              c.t         ? Math.floor(c.t > 1e10 ? c.t / 1000 : c.t) :
              Math.floor(c[0]);
    return {
      time:  t,
      open:  parseFloat(c.open  || c.o || c[1]),
      high:  parseFloat(c.high  || c.h || c[2]),
      low:   parseFloat(c.low   || c.l || c[3]),
      close: parseFloat(c.close || c.c || c[4]),
    };
  }).filter(c => {
    if (!c.time || isNaN(c.open) || c.open <= 0 || seen.has(c.time)) return false;
    seen.add(c.time); return true;
  }).sort((a, b) => a.time - b.time);
}

// Uniswap V3 slot0() selector
const SLOT0_SEL = '0x3850c7bd';

async function getMonPriceFromRPC() {
  try {
    const result = await rpcCallAny('eth_call', [{ to: MON_USDC_POOL, data: SLOT0_SEL }, 'latest']);
    if (!result || result === '0x' || result.length < 66) return null;
    const sqrtHex = result.slice(2, 66);
    const p = sqrtToMonPrice(sqrtHex);
    if (p) { cachedMonPrice = p; console.log('RPC MON: $' + p.toFixed(4)); }
    return p;
  } catch(e) { return null; }
}

async function getMonPrice() {
  const sources = [
    `https://api.dexscreener.com/latest/dex/tokens/${WMON_CONTRACT}`,
    `https://api.dexscreener.com/latest/dex/pairs/monad/${MON_USDC_POOL}`,
    `https://api.geckoterminal.com/api/v2/networks/monad/pools/${MON_USDC_POOL}`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) continue;
      const d = await res.json();
      const pairs = d.pairs || (d.pair ? [d.pair] : []);
      for (const p of pairs) {
        if (p.priceUsd) {
          const px = parseFloat(p.priceUsd);
          if (px > 0.0001 && px < 1000) { cachedMonPrice = px; return px; }
        }
      }
      const a = d?.data?.attributes;
      if (a?.base_token_price_usd) {
        const px = parseFloat(a.base_token_price_usd);
        if (px > 0.0001 && px < 1000) { cachedMonPrice = px; return px; }
      }
    } catch(e) {}
  }
  return await getMonPriceFromRPC() || cachedMonPrice;
}

async function fetchTokenInfo() {
  // 0) DEXScreener token endpoint (best pair by liquidity)
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${WMON_CONTRACT}`;
    const res = await fetch(url);
    if (res.ok) {
      const d = await res.json();
      const pairs = (d.pairs || []).filter(p => parseFloat(p.priceUsd || 0) > 0);
      pairs.sort((a, b) => parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0));
      const p = pairs[0];
      if (p) {
        const priceUsd = parseFloat(p.priceUsd);
        cachedMonPrice = priceUsd;
        const mcap = parseFloat(p.marketCap || 0) || parseFloat(p.fdv || 0);
        const txns = p.txns || {};
        const vol  = p.volume || {};
        const h24b = txns.h24?.buys  || 0;
        const h24s = txns.h24?.sells || 0;
        const h24v = vol.h24 || 0;
        const br   = h24b / (h24b + h24s || 1);
        console.log('✅ MON: $' + priceUsd.toFixed(4), 'MCap:$' + formatK(mcap));
        return {
          priceUsd, priceChange: p.priceChange || {},
          marketCap: mcap, volume: vol, txns,
          buyVol: h24v * br, sellVol: h24v * (1 - br),
          makers: h24b + h24s, buyers: h24b, sellers: h24s,
        };
      }
    }
  } catch(e) { console.warn('DSK token:', e.message); }

  // 1) DEXScreener pair endpoint
  try {
    const url = `https://api.dexscreener.com/latest/dex/pairs/monad/${MON_USDC_POOL}`;
    const res = await fetch(url);
    if (res.ok) {
      const d = await res.json();
      const p = (d.pairs || [])[0] || d.pair;
      if (p && parseFloat(p.priceUsd || 0) > 0) {
        const priceUsd = parseFloat(p.priceUsd);
        cachedMonPrice = priceUsd;
        return {
          priceUsd, marketCap: parseFloat(p.marketCap || 0) || parseFloat(p.fdv || 0),
          priceChange: p.priceChange || {}, volume: p.volume || {}, txns: p.txns || {},
        };
      }
    }
  } catch(e) {}

  // 2) GeckoTerminal
  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/monad/pools/${MON_USDC_POOL}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const d = await res.json();
      const a = d?.data?.attributes;
      if (a?.base_token_price_usd) {
        const priceUsd = parseFloat(a.base_token_price_usd);
        if (priceUsd > 0) {
          cachedMonPrice = priceUsd;
          return {
            priceUsd, marketCap: parseFloat(a.market_cap_usd || 0) || parseFloat(a.fdv_usd || 0),
            priceChange: { h24: parseFloat(a.price_change_percentage?.h24 || 0) },
            volume: { h24: parseFloat(a.volume_usd?.h24 || 0) }, txns: {},
          };
        }
      }
    }
  } catch(e) {}

  // 3) RPC fallback
  const rpcPx = await getMonPriceFromRPC();
  if (rpcPx) return { priceUsd: rpcPx, priceChange: { h24: 0 }, marketCap: 0, volume: { h24: 0 }, txns: {} };
  if (livePrice > 0) return { priceUsd: livePrice, priceChange: { h24: priceChange24h }, marketCap: 0, volume: { h24: 0 }, txns: {} };
  return null;
}
