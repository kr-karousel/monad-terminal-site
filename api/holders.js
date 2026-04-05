// Vercel serverless — holder ranking proxy
// 1) Tries BlockVision API (server-side, no CORS)
// 2) Falls back to on-chain Transfer event parsing via Monad RPC

const MONAD_RPC       = 'https://rpc.monad.xyz';
const TRANSFER_TOPIC  = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDR       = '0x0000000000000000000000000000000000000000';
const TOTAL_SUPPLY    = 1_000_000_000;
const TIMEOUT_MS      = 9000;

function sig(ms) { return AbortSignal.timeout(ms); }

async function rpcPost(body) {
  const r = await fetch(MONAD_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: sig(8000),
  });
  if (!r.ok) throw new Error('RPC HTTP ' + r.status);
  return r.json();
}

async function getCurrentBlock() {
  const d = await rpcPost({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
  return parseInt(d.result, 16);
}

async function fetchLogs(contract, fromBlock, toBlock) {
  const d = await rpcPost({
    jsonrpc: '2.0', id: 2, method: 'eth_getLogs',
    params: [{ fromBlock: '0x' + fromBlock.toString(16), toBlock: '0x' + toBlock.toString(16), address: contract, topics: [TRANSFER_TOPIC] }],
  });
  if (d.error) throw new Error(d.error.message || 'getLogs error');
  return d.result || [];
}

async function batchBalances(contract, addresses) {
  const CHUNK = 50;
  const result = [];
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK);
    const reqs = chunk.map((addr, j) => ({
      jsonrpc: '2.0', id: i + j,
      method: 'eth_call',
      params: [{ to: contract, data: '0x70a08231' + addr.slice(2).padStart(64, '0') }, 'latest'],
    }));
    try {
      const res = await rpcPost(reqs);
      const arr = Array.isArray(res) ? res : [res];
      for (let j = 0; j < chunk.length; j++) {
        const hex = arr[j]?.result;
        if (hex && hex !== '0x' && hex !== '0x' + '0'.repeat(64)) {
          const balance = Number(BigInt(hex) * 1000n / BigInt('1000000000000000000')) / 1000;
          if (balance > 0) result.push({ address: chunk[j], balance, pct: 0 });
        }
      }
    } catch (_) { /* skip chunk on error */ }
  }
  return result;
}

async function getHoldersFromRPC(contract) {
  const current = await getCurrentBlock();

  // Try fetching logs in increasingly smaller ranges until one succeeds
  const ranges = [
    [0,                              current],
    [Math.max(0, current - 1000000), current],
    [Math.max(0, current - 200000),  current],
    [Math.max(0, current - 50000),   current],
  ];

  let logs = [];
  for (const [from, to] of ranges) {
    try {
      logs = await fetchLogs(contract, from, to);
      if (logs.length > 0) break;
    } catch (_) { /* try narrower range */ }
  }
  if (!logs.length) return null;

  // Collect unique recipient addresses (exclude burns to 0x0)
  const seen = new Set();
  for (const log of logs) {
    if (!log.topics || log.topics.length < 3) continue;
    const to = '0x' + log.topics[2].slice(26).toLowerCase();
    if (to !== ZERO_ADDR) seen.add(to);
  }
  if (!seen.size) return null;

  const holders = await batchBalances(contract, [...seen]);
  if (!holders.length) return null;

  holders.sort((a, b) => b.balance - a.balance);
  const top = holders.slice(0, 50);
  top.forEach(h => { h.pct = (h.balance / TOTAL_SUPPLY) * 100; });
  return top;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { contract, limit = '50' } = req.query;
  if (!contract) return res.status(400).json({ error: 'Missing contract parameter' });

  // ── 1. Try BlockVision ────────────────────────────────────────────────────
  try {
    const bvUrl = `https://api.blockvision.org/v2/monad/token/holders?contractAddress=${contract}&limit=${limit}`;
    const r = await fetch(bvUrl, {
      headers: { accept: 'application/json', 'User-Agent': 'monad-terminal/1.0' },
      signal: sig(6000),
    });
    if (r.ok) {
      const data = await r.json();
      const list = data?.result?.data || data?.result?.list || data?.data || data?.items || data?.holders || [];
      if (list.length) {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
        return res.status(200).json({ source: 'blockvision', result: { data: list } });
      }
    }
  } catch (_) { /* fall through to RPC */ }

  // ── 2. Build from on-chain Transfer events ────────────────────────────────
  try {
    const holders = await getHoldersFromRPC(contract);
    if (holders && holders.length) {
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
      // Return in the same shape parseData() expects
      return res.status(200).json({
        source: 'rpc',
        result: {
          data: holders.map(h => ({
            holder: h.address,
            amount: String(BigInt(Math.round(h.balance * 1e6)) * BigInt('1000000000000')),
            percentage: h.pct.toFixed(4),
          }))
        }
      });
    }
  } catch (err) {
    console.error('RPC fallback error:', err.message);
  }

  return res.status(502).json({ error: 'All data sources failed' });
}
