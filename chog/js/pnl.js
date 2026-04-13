// ═══════════════════════════════════════
//  PnL TRACKER + WALLET TRADE HISTORY
// ═══════════════════════════════════════
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PNL_BLOCKS     = 7200; // ~2 hours on Monad (~1s/block)

// MetaMask은 null 와일드카드 topic을 빈배열로 반환해서 getLogs는 직접 fetch 사용
// Monad RPC는 eth_getLogs 한 번에 최대 ~400블록 → CHUNK_SIZE로 분할 요청
const PNL_CHUNK = 400;
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
  const chunks = [];
  for(let s = fromBlock; s <= toBlock; s += PNL_CHUNK){
    const e = Math.min(s + PNL_CHUNK - 1, toBlock);
    chunks.push(['0x'+s.toString(16), '0x'+e.toString(16)]);
  }
  const results = await Promise.all(chunks.map(([fb, tb]) => _rpcFetchChunk(filter, fb, tb)));
  return results.flat();
}

// ── Direct RPC eth_blockNumber (skip MetaMask) ────
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

// ── On-chain transfer fetch ────────────────────────
async function fetchWalletTrades(addr, maxBlocks){
  maxBlocks = maxBlocks || PNL_BLOCKS;
  const addrPadded   = '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
  const poolPadded   = '0x' + NADFUN_POOL.slice(2).toLowerCase().padStart(64, '0');
  const routerPadded = '0x' + NADFUN_ROUTER.slice(2).toLowerCase().padStart(64, '0');
  // Use array (OR) instead of null wildcard — better RPC compatibility
  const dexAddrs = [poolPadded, routerPadded];

  try {
    const blockHex = await _rpcBlockNumber();
    if(!blockHex) return [];
    const curBlock  = parseInt(blockHex, 16);
    const fromBlock = Math.max(0, curBlock - maxBlocks);

    const base = { address: CHOG_CONTRACT };
    const [buyLogs, sellLogs] = await Promise.all([
      _rpcGetLogsChunked({ ...base, topics: [TRANSFER_TOPIC, dexAddrs, addrPadded] }, fromBlock, curBlock),
      _rpcGetLogsChunked({ ...base, topics: [TRANSFER_TOPIC, addrPadded, dexAddrs] }, fromBlock, curBlock),
    ]);

    const trades = [];
    const now    = Math.floor(Date.now() / 1000);

    (buyLogs || []).forEach(log => {
      const chog    = Number(BigInt('0x' + log.data.slice(2))) / 1e18;
      const block   = parseInt(log.blockNumber, 16);
      const estTime = now - (curBlock - block);
      if(chog <= 0) return;
      trades.push({ type: 'buy', chog, block, txHash: log.transactionHash, time: estTime });
    });

    (sellLogs || []).forEach(log => {
      const chog    = Number(BigInt('0x' + log.data.slice(2))) / 1e18;
      const block   = parseInt(log.blockNumber, 16);
      const estTime = now - (curBlock - block);
      if(chog <= 0) return;
      trades.push({ type: 'sell', chog, block, txHash: log.transactionHash, time: estTime });
    });

    return trades.sort((a, b) => b.block - a.block);
  } catch(e) {
    console.warn('fetchWalletTrades:', e.message);
    return [];
  }
}

// ── PnL calculation from trades ───────────────────
function calcPnl(trades, currentPrice){
  let totalChogBought = 0;
  let totalChogSold   = 0;

  trades.forEach(t => {
    if(t.type === 'buy')  totalChogBought += t.chog;
    if(t.type === 'sell') totalChogSold   += t.chog;
  });

  // Use current price as rough cost proxy (no MON amounts on-chain without extra calls)
  // For a true PnL we'd need the MON spent per tx — this shows position change
  const netChog    = totalChogBought - totalChogSold;
  const valueNow   = netChog * currentPrice;

  return { totalChogBought, totalChogSold, netChog, valueNow, currentPrice };
}

// ── PnL modal open/close ──────────────────────────
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
  const price = livePrice || 0;
  const chogBal = wallet ? wallet.bal : 0;
  const totalVal = chogBal * price;

  const boughtStr = Math.floor(pnl.totalChogBought).toLocaleString();
  const soldStr   = Math.floor(pnl.totalChogSold).toLocaleString();
  const netColor  = pnl.netChog >= 0 ? 'var(--green)' : 'var(--red)';
  const netSign   = pnl.netChog >= 0 ? '+' : '';

  const recentHTML = trades.slice(0, 15).map(t => {
    const age   = _relTime(t.time);
    const isSwap = t.type === 'buy' || t.type === 'sell';
    const icon  = t.type === 'buy' ? '🟢' : t.type === 'sell' ? '🔴' : t.type === 'in' ? '📥' : '📤';
    const label = t.type === 'buy' ? 'BUY' : t.type === 'sell' ? 'SELL' : t.type === 'in' ? 'IN' : 'OUT';
    const color = t.type === 'buy' ? 'var(--green)' : t.type === 'sell' ? 'var(--red)' : 'var(--muted)';
    const amt   = Math.floor(t.chog).toLocaleString();
    const usd   = (t.chog * price).toFixed(2);
    const link  = `https://monadvision.com/tx/${t.txHash}`;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
        <span style="font-size:13px">${icon}</span>
        <span style="font-size:10px;font-weight:700;color:${color};width:30px">${label}</span>
        <span style="font-size:10px;font-family:'Share Tech Mono',monospace;flex:1">${amt} CHOG</span>
        <span style="font-size:9px;color:var(--muted)">$${usd}</span>
        <span style="font-size:9px;color:var(--muted);min-width:36px;text-align:right">${age}</span>
        <a href="${link}" target="_blank" style="font-size:9px;color:var(--accent);text-decoration:none">↗</a>
      </div>`;
  }).join('') || `<div style="color:var(--muted);font-size:11px;text-align:center;padding:12px 0">No swaps found in the last 2h</div>`;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Balance</div>
        <div style="font-size:15px;font-weight:700;font-family:'Share Tech Mono',monospace;color:var(--accent)">${chogBal.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--muted)">CHOG · $${totalVal.toFixed(2)}</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Current Price</div>
        <div style="font-size:13px;font-weight:700;font-family:'Share Tech Mono',monospace">$${price.toFixed(7)}</div>
        <div style="font-size:10px;color:var(--muted)">live</div>
      </div>
      <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Bought (2h)</div>
        <div style="font-size:13px;font-weight:700;color:var(--green)">${boughtStr}</div>
        <div style="font-size:9px;color:var(--muted)">CHOG</div>
      </div>
      <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Sold (2h)</div>
        <div style="font-size:13px;font-weight:700;color:var(--red)">${soldStr}</div>
        <div style="font-size:9px;color:var(--muted)">CHOG</div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:.5px;margin-bottom:6px">RECENT TRADES (2h)</div>
      ${recentHTML}
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,0.2);text-align:center;margin-top:6px">Scanned last ~2h of on-chain activity · swaps only</div>`;
}

// ── Profile modal: Trades tab ─────────────────────
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
    const icon  = t.type === 'buy' ? '🟢' : t.type === 'sell' ? '🔴' : t.type === 'in' ? '📥' : '📤';
    const label = t.type === 'buy' ? 'BUY' : t.type === 'sell' ? 'SELL' : t.type === 'in' ? 'IN' : 'OUT';
    const color = t.type === 'buy' ? 'var(--green)' : t.type === 'sell' ? 'var(--red)' : 'var(--muted)';
    const amt   = Math.floor(t.chog).toLocaleString();
    const usd   = (t.chog * price).toFixed(2);
    const age   = _relTime(t.time);
    const link  = `https://monadvision.com/tx/${t.txHash}`;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
        <span>${icon}</span>
        <span style="font-size:10px;font-weight:700;color:${color};width:28px">${label}</span>
        <span style="font-size:10px;font-family:'Share Tech Mono',monospace;flex:1">${amt} CHOG</span>
        <span style="font-size:9px;color:var(--muted)">$${usd}</span>
        <span style="font-size:9px;color:var(--muted)">${age}</span>
        <a href="${link}" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none">↗</a>
      </div>`;
  }).join('');
}

// ── Helpers ───────────────────────────────────────
function _relTime(ts){
  const diff = Math.floor(Date.now()/1000) - ts;
  if(diff < 60)  return diff + 's ago';
  if(diff < 3600) return Math.floor(diff/60) + 'm ago';
  return Math.floor(diff/3600) + 'h ago';
}
