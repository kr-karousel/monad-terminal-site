// Vercel serverless — holder ranking proxy (CommonJS)
// Tries multiple sources server-side to avoid CORS restrictions

const MONAD_RPC    = 'https://rpc.monad.xyz';
const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDR    = '0x0000000000000000000000000000000000000000';
const TOTAL_SUPPLY = 1_000_000_000;

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'User-Agent': 'monad-terminal/1.0', ...headers },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function fromWei(v) {
  try { return Number(BigInt(v) * 1000n / BigInt('1000000000000000000')) / 1000; } catch (_) { return 0; }
}

function parseHolders(d) {
  // Blockscout v2: { items: [{ address: { hash }, value }] }
  if (Array.isArray(d?.items) && d.items.length) {
    return d.items.map(h => ({
      address: (h.address?.hash || h.address || '').toLowerCase(),
      balance: h.value ? fromWei(h.value) : parseFloat(h.balance || 0),
      pct: parseFloat(h.percentage || 0),
    })).filter(h => h.address && h.balance > 0);
  }
  // nad.fun / generic list
  const list = d?.data || d?.result?.data || d?.result?.list || d?.result || d?.holders || d?.list || [];
  if (!Array.isArray(list) || !list.length) return null;
  return list.map(h => ({
    address: (h.holder || h.wallet_address || h.address?.hash || h.address || h.accountAddress || '').toLowerCase(),
    balance: h.amount   ? fromWei(h.amount)
           : h.value    ? fromWei(h.value)
           : h.balance  ? parseFloat(h.balance) : 0,
    pct: parseFloat(h.percentage || h.share || h.pct || 0),
  })).filter(h => h.address && h.balance > 0);
}

async function rpcPost(body, rpc = MONAD_RPC) {
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return r.json();
}

async function getHoldersFromRPC(contract) {
  const bd = await rpcPost({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
  const current = parseInt(bd.result, 16);
  if (!current) return null;

  let logs = [];
  for (const from of [Math.max(0, current - 50000), Math.max(0, current - 200000), 0]) {
    try {
      const ld = await rpcPost({ jsonrpc: '2.0', id: 2, method: 'eth_getLogs', params: [{ fromBlock: '0x' + from.toString(16), toBlock: 'latest', address: contract, topics: [TRANSFER_SIG] }] });
      if (!ld.error && ld.result?.length) { logs = ld.result; break; }
    } catch (_) {}
  }
  if (!logs.length) return null;

  const seen = new Set();
  for (const log of logs) {
    if (log.topics?.[2]) {
      const to = '0x' + log.topics[2].slice(26).toLowerCase();
      if (to !== ZERO_ADDR) seen.add(to);
    }
  }

  const addrs = [...seen];
  const holders = [];
  for (let i = 0; i < addrs.length; i += 50) {
    const chunk = addrs.slice(i, i + 50);
    const reqs = chunk.map((a, j) => ({ jsonrpc: '2.0', id: i + j, method: 'eth_call', params: [{ to: contract, data: '0x70a08231' + a.slice(2).padStart(64, '0') }, 'latest'] }));
    try {
      const arr = await rpcPost(reqs);
      (Array.isArray(arr) ? arr : [arr]).forEach((item, j) => {
        const hex = item?.result;
        if (hex && hex !== '0x') {
          const bal = fromWei(hex);
          if (bal > 0) holders.push({ address: chunk[j], balance: bal, pct: 0 });
        }
      });
    } catch (_) {}
  }

  if (!holders.length) return null;
  holders.sort((a, b) => b.balance - a.balance);
  const top = holders.slice(0, 50);
  top.forEach(h => { h.pct = (h.balance / TOTAL_SUPPLY) * 100; });
  return top;
}

// ── Main handler ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { contract, limit = '50' } = req.query;
  if (!contract) return res.status(400).json({ error: 'Missing contract parameter' });

  const sources = [
    // nad.fun API (여러 패턴 시도)
    () => get(`https://api.nad.fun/v1/tokens/${contract}/holders?limit=${limit}`),
    () => get(`https://api.nad.fun/coins/${contract}/holders?limit=${limit}`),
    () => get(`https://api.nad.fun/v1/holder?ca=${contract}&limit=${limit}`),
    // Monad Explorer (Blockscout)
    () => get(`https://explorer.monad.xyz/api/v2/tokens/${contract}/holders`),
    () => get(`https://explorer.monad.xyz/api?module=token&action=tokenholderlist&contractaddress=${contract}`),
    // BlockVision
    () => get(`https://api.blockvision.org/v2/monad/token/holders?contractAddress=${contract}&limit=${limit}`),
  ];

  for (const src of sources) {
    try {
      const d = await src();
      const holders = parseHolders(d);
      if (holders?.length) {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
        return res.status(200).json({
          source: 'proxy',
          result: {
            data: holders.map(h => ({
              holder: h.address,
              amount: String(BigInt(Math.round(h.balance * 1e6)) * BigInt('1000000000000')),
              percentage: h.pct.toFixed(4),
            }))
          }
        });
      }
    } catch (_) {}
  }

  // RPC fallback
  try {
    const holders = await getHoldersFromRPC(contract);
    if (holders?.length) {
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
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
    console.error('RPC error:', err.message);
  }

  return res.status(502).json({ error: 'All sources failed' });
};
