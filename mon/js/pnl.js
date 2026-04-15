// ═══════════════════════════════════════
//  PnL TRACKER - MON (WMON/USDC Pool)
//  WMON/USDC swap 이벤트에서 주소 기반 거래 추출
// ═══════════════════════════════════════
const PNL_BLOCKS = 7200; // ~2 hours on Monad (~1s/block)
const PNL_CHUNK  = 400;
const PNL_RPC_LIST = [
  'https://rpc.monad.xyz',
  'https://monad-mainnet.rpc.thirdweb.com',
  'https://monad.drpc.org',
];

async function _rpcFetchChunk(filter, fromHex, toHex){
  const params = [{ ...filter, fromBlock: fromHex, toBlock: toHex }];
  for(const rpc of PNL_RPC_LIST){
    try{
      const res = await fetch(rpc, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({jsonrpc:'2.0', id:1, method:'eth_getLogs', params})
      });
      if(!res.ok) continue;
      const d = await res.json();
      if(d.error) continue;
      if(Array.isArray(d.result)) return d.result;
    } catch(e){}
  }
  return [];
}

async function _rpcGetLogsChunked(filter, fromBlock, toBlock){
  const all = [];
  for(let s = fromBlock; s <= toBlock; s += PNL_CHUNK){
    const e = Math.min(s + PNL_CHUNK - 1, toBlock);
    const logs = await _rpcFetchChunk(filter, '0x'+s.toString(16), '0x'+e.toString(16));
    all.push(...logs);
  }
  return all;
}

async function _rpcBlockNumber(){
  for(const rpc of PNL_RPC_LIST){
    try{
      const res = await fetch(rpc, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({jsonrpc:'2.0', id:1, method:'eth_blockNumber', params:[]})
      });
      if(!res.ok) continue;
      const d = await res.json();
      if(d.result) return d.result;
    } catch(e){}
  }
  return null;
}

// ── Fetch WMON/USDC swap events for a specific wallet ──
async function fetchWalletTrades(addr, maxBlocks){
  maxBlocks = maxBlocks || PNL_BLOCKS;
  const addrL = addr.toLowerCase();

  try {
    const blockHex = await _rpcBlockNumber();
    if(!blockHex) return [];
    const curBlock  = parseInt(blockHex, 16);
    const fromBlock = Math.max(0, curBlock - maxBlocks);
    const now = Math.floor(Date.now() / 1000);

    // WMON/USDC pool swap events (Uniswap V3 / PancakeSwap V3)
    const allLogs = await _rpcGetLogsChunked({
      address: MON_USDC_POOL,
      topics:  [[SWAP_TOPIC_V3, SWAP_TOPIC_PCSK3]],
    }, fromBlock, curBlock);

    const trades = [];

    function toSigned(hex){
      const v = BigInt('0x'+hex);
      const M = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000');
      return v >= M ? v - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000') : v;
    }

    for(const log of allLogs){
      try{
        // topic[2] = recipient address in V3 swaps
        const recipient = log.topics && log.topics[2]
          ? '0x' + log.topics[2].slice(26).toLowerCase()
          : '';
        const sender = log.topics && log.topics[1]
          ? '0x' + log.topics[1].slice(26).toLowerCase()
          : '';
        if(recipient !== addrL && sender !== addrL) continue;

        const d = log.data;
        if(!d || d.length < 2 + 64*5) continue;
        const a0 = toSigned(d.slice(2, 66));
        const a1 = toSigned(d.slice(66, 130));
        const sqH = d.slice(130, 194);
        const pUsd = sqrtToMonPrice(sqH);
        if(!pUsd) continue;

        // WMON(token0): amount0 < 0 → BUY MON
        const isBuy = a0 < 0n;
        const mon   = Number(a0 < 0n ? -a0 : a0) / 1e18;
        const usdc  = Number(a1 < 0n ? -a1 : a1) / 1e6;
        const usd   = usdc > 0 ? usdc : mon * pUsd;
        const block = parseInt(log.blockNumber, 16);

        trades.push({
          type: isBuy ? 'buy' : 'sell',
          mon, usd, pUsd, block,
          txHash: log.transactionHash,
          time: now - (curBlock - block)
        });
      }catch(e){}
    }

    console.log('✅ MON PnL trades:', trades.length, 'for', addrL.slice(0,8));
    return trades.sort((a, b) => b.block - a.block);
  } catch(e) {
    console.warn('fetchWalletTrades:', e.message);
    return [];
  }
}

// ── PnL calculation ───────────────────
function calcPnl(trades, currentPrice){
  let totalMonBought = 0;
  let totalMonSold   = 0;
  let totalUsdBought = 0;
  let totalUsdSold   = 0;

  trades.forEach(t => {
    if(t.type === 'buy')  { totalMonBought += t.mon; totalUsdBought += t.usd; }
    if(t.type === 'sell') { totalMonSold   += t.mon; totalUsdSold   += t.usd; }
  });

  const netMon    = totalMonBought - totalMonSold;
  const valueNow  = netMon * currentPrice;
  const realized  = totalUsdSold - totalUsdBought * (totalMonSold / (totalMonBought || 1));
  return { totalMonBought, totalMonSold, netMon, valueNow, totalUsdBought, totalUsdSold, currentPrice };
}

// ── PnL modal ──────────────────────────
async function openPnlModal(){
  const m = document.getElementById('pnlModal');
  if(!m || !wallet) return;
  m.classList.add('open');
  document.getElementById('pnlContent').innerHTML = _pnlLoading();
  const trades = await fetchWalletTrades(wallet.addr, PNL_BLOCKS);
  const pnl    = calcPnl(trades, livePrice || 0);
  document.getElementById('pnlContent').innerHTML = _pnlHTML(pnl, trades);
}

function closePnlModal(){
  const m = document.getElementById('pnlModal');
  if(m) m.classList.remove('open');
}

function _pnlLoading(){
  return `<div style="text-align:center;padding:28px;color:var(--muted);font-size:13px">⏳ Scanning ~2h of on-chain trades...</div>`;
}

function _pnlHTML(pnl, trades){
  const price    = livePrice || 0;
  const monBal   = wallet ? wallet.bal : 0;
  const totalVal = monBal * price;
  const boughtStr = pnl.totalMonBought.toFixed(2);
  const soldStr   = pnl.totalMonSold.toFixed(2);

  const recentHTML = trades.slice(0, 15).map(t => {
    const age   = _relTime(t.time);
    const icon  = t.type === 'buy' ? '🟢' : '🔴';
    const label = t.type === 'buy' ? 'BUY' : 'SELL';
    const color = t.type === 'buy' ? 'var(--green)' : 'var(--red)';
    const link  = `https://monadvision.com/tx/${t.txHash}`;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
        <span style="font-size:13px">${icon}</span>
        <span style="font-size:10px;font-weight:700;color:${color};width:30px">${label}</span>
        <span style="font-size:10px;font-family:'Share Tech Mono',monospace;flex:1">${t.mon.toFixed(2)} MON</span>
        <span style="font-size:9px;color:var(--muted)">$${t.usd.toFixed(2)}</span>
        <span style="font-size:9px;color:var(--muted);min-width:36px;text-align:right">${age}</span>
        <a href="${link}" target="_blank" style="font-size:9px;color:var(--accent);text-decoration:none">↗</a>
      </div>`;
  }).join('') || `<div style="color:var(--muted);font-size:11px;text-align:center;padding:12px 0">No swaps found in the last 2h</div>`;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Balance</div>
        <div style="font-size:15px;font-weight:700;font-family:'Share Tech Mono',monospace;color:var(--accent)">${monBal.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--muted)">MON · $${totalVal.toFixed(2)}</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Current Price</div>
        <div style="font-size:13px;font-weight:700;font-family:'Share Tech Mono',monospace">$${price.toFixed(4)}</div>
        <div style="font-size:10px;color:var(--muted)">live</div>
      </div>
      <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Bought (2h)</div>
        <div style="font-size:13px;font-weight:700;color:var(--green)">${boughtStr}</div>
        <div style="font-size:9px;color:var(--muted)">MON</div>
      </div>
      <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Sold (2h)</div>
        <div style="font-size:13px;font-weight:700;color:var(--red)">${soldStr}</div>
        <div style="font-size:9px;color:var(--muted)">MON</div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:.5px;margin-bottom:6px">RECENT TRADES (2h)</div>
      ${recentHTML}
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,0.2);text-align:center;margin-top:6px">Scanned last ~2h of WMON/USDC pool activity</div>`;
}

async function loadProfileTrades(addr, containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = `<div style="text-align:center;padding:18px;color:var(--muted);font-size:12px">⏳ Loading trades...</div>`;
  const trades = await fetchWalletTrades(addr, PNL_BLOCKS);
  if(!trades.length){
    el.innerHTML = `<div style="text-align:center;padding:18px;color:var(--muted);font-size:12px">No swaps found in the last 2h</div>`;
    return;
  }
  const price = livePrice || 0;
  el.innerHTML = trades.slice(0, 20).map(t => {
    const icon  = t.type === 'buy' ? '🟢' : '🔴';
    const label = t.type === 'buy' ? 'BUY' : 'SELL';
    const color = t.type === 'buy' ? 'var(--green)' : 'var(--red)';
    const age   = _relTime(t.time);
    const link  = `https://monadvision.com/tx/${t.txHash}`;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
        <span>${icon}</span>
        <span style="font-size:10px;font-weight:700;color:${color};width:28px">${label}</span>
        <span style="font-size:10px;font-family:'Share Tech Mono',monospace;flex:1">${t.mon.toFixed(2)} MON</span>
        <span style="font-size:9px;color:var(--muted)">$${t.usd.toFixed(2)}</span>
        <span style="font-size:9px;color:var(--muted)">${age}</span>
        <a href="${link}" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none">↗</a>
      </div>`;
  }).join('');
}

function _relTime(ts){
  const diff = Math.floor(Date.now()/1000) - ts;
  if(diff < 60)  return diff + 's ago';
  if(diff < 3600) return Math.floor(diff/60) + 'm ago';
  return Math.floor(diff/3600) + 'h ago';
}
