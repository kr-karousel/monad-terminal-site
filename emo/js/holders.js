function openHolderModal(){
  document.getElementById('holderModal').classList.add('open');
  switchHolderTab('holders');
}
function closeHolderModal(){
  document.getElementById('holderModal').classList.remove('open');
}

function switchHolderTab(tab){
  holderCurrentTab = tab;
  document.getElementById('tabHolders').classList.toggle('active', tab==='holders');
  document.getElementById('tabTiers').classList.toggle('active', tab==='tiers');
  if(tab === 'holders') renderHolderList();
  else renderTierTable();
}

async function renderHolderList(){
  const content = document.getElementById('holderTabContent');
  content.innerHTML = '<div class="holder-loading">⏳ Loading top holders...</div>';

  // 지갑 미연결 시에도 rpcCallAny로 조회 가능
  if(false && !window.ethereum){
    content.innerHTML = `<div class="holder-loading" style="text-align:center">
      <div style="font-size:32px;margin-bottom:12px">🔗</div>
      <div style="color:var(--accent);font-weight:700;margin-bottom:6px">Connect Wallet to View Holders</div>
      <div style="color:var(--muted);font-size:11px">Wallet connection is required to fetch on-chain holder data.<br>Click "Connect Wallet" in the top right.</div>
    </div>`;
    return;
  }

  let holders = await fetchTopHolders();
  if(!holders || !holders.length){
    content.innerHTML = `<div class="holder-loading" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">😵</div>
      <div style="color:var(--red);font-weight:700;margin-bottom:6px">Failed to load holders</div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:14px">Could not reach MonadVision API.<br>Check your connection and retry.</div>
      <button onclick="holderCache=null;renderHolderList()" style="background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:10px;padding:8px 20px;color:#fff;font-weight:700;cursor:pointer;font-size:12px">🔄 Retry</button>
    </div>`;
    return;
  }

  // 내 순위 찾기
  let myRankIdx = -1;
  if(wallet){
    myRankIdx = holders.findIndex(h => h.address.toLowerCase() === wallet.addr.toLowerCase());
  }

  // 내 지갑이 목록에 없으면 추가 (순위 밖)
  let myOutOfList = false;
  if(wallet && myRankIdx === -1 && wallet.bal > 0){
    myOutOfList = true;
  }

  // 홀더 수 표시 (티커바에도 반영)
  const holderCount = holders.length;
  const th1 = document.getElementById('tickerHolders');
  const th2 = document.getElementById('tickerHolders2');
  const sh = document.getElementById('statHolders');
  const countStr = holderCount+'+ found';
  if(th1) th1.textContent = countStr;
  if(th2) th2.textContent = countStr;
  if(sh) sh.textContent = holderCount+'+';

  let html = `<div style="overflow-y:auto;max-height:60vh">
    <table class="holder-table">
      <thead><tr>
        <th>#</th>
        <th>Holder</th>
        <th style="text-align:right">Token Amount</th>
        <th style="text-align:right">Distribution</th>
      </tr></thead>
      <tbody>`;

  holders.forEach((h, i) => {
    const rank = i+1;
    const nick = getNick(h.address);
    const tierInfo = getRank(h.balance);
    const short = h.address.slice(0,6)+'...';
    const isDev = h.address.toLowerCase() === DEV_WALLET.toLowerCase();
    const isMe = wallet && wallet.addr.toLowerCase() === h.address.toLowerCase();

    // 표시 이름
    let displayName = nick || short;
    if(isDev && !nick) displayName = short + ' <span style="color:var(--muted);font-size:9px">(dev)</span>';
    else if(nick) displayName = nick;

    const rowStyle = isMe ? 'background:rgba(192,132,252,0.12);border-left:3px solid var(--accent);' : '';
    const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
    const rankColor = rank <= 3 ? 'top3' : '';

    // 금액 포맷
    const amtM = h.balance >= 1e6 ? (h.balance/1e6).toFixed(0)+'M'
               : h.balance >= 1e3 ? (h.balance/1e3).toFixed(0)+'K'
               : h.balance.toFixed(0);
    const usd = h.balance * (livePrice||0.000731);
    const usdStr = usd >= 1000 ? '($'+(usd/1000).toFixed(2)+'K)' : '($'+usd.toFixed(0)+')';

    html += `<tr class="holder-row" style="${rowStyle}" onclick="closeHolderModal();openProfileModal('${h.address}',${Math.floor(h.balance)},'${tierInfo.cls}','${tierInfo.badge}')">
      <td class="holder-rank-num ${rankColor}">${medal||rank}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="rank-badge ${tierInfo.cls}" style="font-size:8px;padding:1px 5px">${tierInfo.badge}</span>
          <span class="holder-nick">${displayName}</span>
          ${isMe ? '<span style="color:var(--accent);font-size:9px;font-weight:700;background:rgba(192,132,252,0.2);padding:1px 5px;border-radius:8px">YOU</span>' : ''}
        </div>
      </td>
      <td class="holder-amount">${amtM} <span style="color:var(--muted);font-size:9px">${usdStr}</span></td>
      <td class="holder-pct">${h.pct ? h.pct.toFixed(2)+'%' : '—'}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';

  // 내가 목록 밖에 있을 때 별도 표시
  if(myOutOfList){
    const myTier = getRank(wallet.bal);
    const myAmtM = wallet.bal >= 1e6 ? (wallet.bal/1e6).toFixed(0)+'M'
                 : wallet.bal >= 1e3 ? (wallet.bal/1e3).toFixed(0)+'K'
                 : wallet.bal.toFixed(0);
    html += `<div style="margin-top:8px;padding:10px 14px;background:rgba(192,132,252,0.08);border:1px solid var(--accent);border-radius:10px;font-size:12px;display:flex;align-items:center;gap:8px">
      <span style="color:var(--accent);font-weight:700">📍 Your Rank:</span>
      <span class="rank-badge ${myTier.cls}" style="font-size:8px">${myTier.badge}</span>
      <span style="color:var(--text)">${wallet.addr.slice(0,6)}...</span>
      <span style="margin-left:auto;font-family:'Share Tech Mono',monospace">${myAmtM} EMO</span>
    </div>`;
  } else if(wallet && myRankIdx >= 0){
    html += `<div style="margin-top:8px;padding:10px 14px;background:rgba(192,132,252,0.08);border:1px solid var(--accent);border-radius:10px;font-size:12px;text-align:center;color:var(--accent);font-weight:700">
      📍 Your Rank: #${myRankIdx+1} of ${holderCount}+ holders
    </div>`;
  }

  html += `<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:6px">
    Click any holder to view profile · Top ${holderCount} holders via MonadVision
  </div>`;
  content.innerHTML = html;
}

async function fetchTopHolders(){
  if(holderCache && Date.now() - holderCacheTime < 60000) return holderCache;

  const BV_URL    = `https://api.blockvision.org/v2/monad/token/holders?contractAddress=${CHOG_CONTRACT}&limit=50`;
  const EXP_URL   = `https://explorer.monad.xyz/api/v2/tokens/${CHOG_CONTRACT}/holders`;
  const EXP_URL1  = `https://explorer.monad.xyz/api?module=token&action=tokenholderlist&contractaddress=${CHOG_CONTRACT}`;
  const NAD_URL1  = `https://api.nad.fun/v1/tokens/${CHOG_CONTRACT}/holders?limit=50`;
  const NAD_URL2  = `https://api.nad.fun/coins/${CHOG_CONTRACT}/holders?limit=50`;
  const enc       = encodeURIComponent(BV_URL);
  const encExp    = encodeURIComponent(EXP_URL);
  const encNad    = encodeURIComponent(NAD_URL1);

  const fromWei = (v) => { try{ return Number(BigInt(v)*1000n/BigInt('1000000000000000000'))/1000; }catch(_){ return 0; } };
  const parseData = (d) => {
    if(d?.items?.length){
      return d.items.map(h => ({
        address: (h.address?.hash || h.address || '').toLowerCase(),
        balance: h.value ? fromWei(h.value) : h.balance ? parseFloat(h.balance) : 0,
        pct: parseFloat(h.percentage || h.pct || 0)
      })).filter(h => h.address && h.balance > 0);
    }
    const list = d?.result?.data || d?.result?.list || d?.result || d?.data || d?.holders || d?.list || [];
    if(!list.length) throw new Error('empty list');
    return list.map(h => ({
      address: (h.holder || h.wallet_address || h.accountAddress || h.address?.hash || h.address || '').toLowerCase(),
      balance: h.amount ? fromWei(h.amount) : h.value ? fromWei(h.value) : h.balance ? parseFloat(h.balance) : 0,
      pct: parseFloat(h.percentage || h.share || h.pct || 0)
    })).filter(h => h.address && h.balance > 0);
  };

  const attempts = [
    [`/api/holders?contract=${CHOG_CONTRACT}&limit=50`, false],
    [NAD_URL1,  false],
    [NAD_URL2,  false],
    [EXP_URL,   false],
    [EXP_URL1,  false],
    [BV_URL,    false],
    [`https://api.allorigins.win/raw?url=${encNad}`, false],
    [`https://api.allorigins.win/raw?url=${encExp}`, false],
    [`https://api.allorigins.win/get?url=${enc}`, true],
    [`https://corsproxy.io/?${enc}`, false],
  ];

  for(const [url, isWrapped] of attempts){
    try {
      const label = url.startsWith('/api') ? 'vercel-proxy'
        : url.includes('explorer.monad') ? 'monad-explorer'
        : url.includes('allorigins') ? 'allorigins'
        : url.includes('corsproxy') ? 'corsproxy'
        : 'direct';
      console.log(`📡 Fetching holders (${label})...`);
      const res = await fetch(url, {headers:{'accept':'application/json'}});
      if(!res.ok) throw new Error('HTTP '+res.status);
      let d = await res.json();
      if(isWrapped) d = JSON.parse(d.contents || '{}');
      console.log('raw response:', JSON.stringify(d).slice(0,200));
      const valid = parseData(d);
      if(valid.length > 0){
        console.log('✅ Holders loaded:', valid.length, 'via', label);
        holderCache = valid; holderCacheTime = Date.now();
        return valid;
      }
    } catch(e){ console.warn(`Holder fetch error (${url.slice(0,60)}):`, e.message); }
  }

  // ── 최후 수단: Monad RPC Transfer 이벤트 직접 조회 ────────────────────────
  console.log('📡 Fetching holders (rpc-direct)...');
  try {
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    const EXCLUDE = new Set([
      '0x0000000000000000000000000000000000000000',
      '0x000000000000000000000000000000000000dead',
      (typeof NADFUN_POOL   !== 'undefined' ? NADFUN_POOL   : '').toLowerCase(),
      (typeof KURU_PAIR     !== 'undefined' ? KURU_PAIR     : '').toLowerCase(),
      (typeof NADFUN_ROUTER !== 'undefined' ? NADFUN_ROUTER : '').toLowerCase(),
      (typeof BONDING_ROUTER!== 'undefined' ? BONDING_ROUTER: '').toLowerCase(),
    ].filter(Boolean));

    const blockHex = await rpcCallAny('eth_blockNumber', []);
    const current = parseInt(blockHex, 16);
    if(!current) return null;

    const seen = new Set();
    const BIG = Math.max(0, current - 500000);
    let bigLogs = await rpcCallAny('eth_getLogs', [{
      address: CHOG_CONTRACT, topics: [TRANSFER_TOPIC],
      fromBlock: '0x' + BIG.toString(16), toBlock: 'latest',
    }]);

    if(bigLogs && bigLogs.length){
      for(const log of bigLogs){
        if(log.topics?.[2]){
          const to = '0x' + log.topics[2].slice(26).toLowerCase();
          if(!EXCLUDE.has(to)) seen.add(to);
        }
      }
    } else {
      const CHUNK = 2000;
      for(let end = current, n = 0; end > 0 && n < 100; end -= CHUNK, n++){
        const start = Math.max(0, end - CHUNK + 1);
        const logs = await rpcCallAny('eth_getLogs', [{
          address: CHOG_CONTRACT, topics: [TRANSFER_TOPIC],
          fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16),
        }]);
        if(logs?.length){
          for(const log of logs){
            if(log.topics?.[2]){
              const to = '0x' + log.topics[2].slice(26).toLowerCase();
              if(!EXCLUDE.has(to)) seen.add(to);
            }
          }
        }
        if(seen.size >= 300) break;
      }
    }

    if(!seen.size) return null;

    const addrs = [...seen];
    const holders = [];
    const PARALLEL = 20;
    for(let i = 0; i < addrs.length; i += PARALLEL){
      const chunk = addrs.slice(i, i + PARALLEL);
      const results = await Promise.all(chunk.map(addr =>
        rpcCallAny('eth_call', [{
          to: CHOG_CONTRACT,
          data: '0x70a08231' + addr.slice(2).padStart(64, '0')
        }, 'latest'])
      ));
      results.forEach((hex, j) => {
        if(hex && hex.length > 2){
          const bal = fromWei(hex);
          if(bal > 0) holders.push({address: chunk[j], balance: bal, pct: 0});
        }
      });
    }

    if(!holders.length) return null;
    holders.sort((a,b) => b.balance - a.balance);
    const top = holders.slice(0, 50);
    top.forEach(h => { h.pct = (h.balance / 1_000_000_000) * 100; });
    console.log('✅ Holders loaded (rpc):', top.length, 'from', seen.size, 'unique addrs');
    holderCache = top; holderCacheTime = Date.now();
    return top;
  } catch(e){ console.warn('RPC direct error:', e.message); }

  return null;
}

function renderTierTable(){
  const content = document.getElementById('holderTabContent');
  const TIERS = [
    {min:100000000, label:'EMO GOD',              badge:'👑 GOD',     cls:'r1', color:'#ffd700'},
    {min:10000000,  label:'Dragon Overlord',        badge:'🐉 DRAGON',  cls:'r2', color:'#e5e7eb'},
    {min:1000000,   label:'EMO Emperor',           badge:'👸 EMPEROR', cls:'r3', color:'#c084fc'},
    {min:100000,    label:'Royal Whale',             badge:'🐳 WHALE',   cls:'r4', color:'#f472b6'},
    {min:50000,     label:'Noble Flexer',            badge:'🥂 NOBLE',   cls:'r5', color:'#60a5fa'},
    {min:10000,     label:'Market Hustler',          badge:'💹 HUSTLER', cls:'r6', color:'#34d399'},
    {min:1000,      label:"McDonald's Shift Legend", badge:'🍔 SHIFT',   cls:'r7', color:'#fbbf24'},
    {min:100,       label:'Side Hustle Kid',         badge:'💸 HUSTLE',  cls:'r8', color:'#a78bfa'},
    {min:1,         label:'Street Beggar',           badge:'🙏 BEGGAR',  cls:'r9', color:'#94a3b8'},
    {min:0,         label:'ZeroEMO Ghost',          badge:'👻 GHOST',   cls:'r10',color:'#6b7280'},
  ];

  const myBal = wallet ? wallet.bal : 0;
  const myTier = getRank(myBal);

  let html = `<div style="overflow-y:auto;max-height:60vh">`;
  TIERS.forEach(t => {
    const isMyTier = myTier.cls === t.cls;
    const minStr = t.min >= 1e6 ? (t.min/1e6)+'M' : t.min >= 1e3 ? (t.min/1e3)+'K' : t.min > 0 ? t.min : '0';
    html += `<div class="tier-row" style="${isMyTier?'border-color:'+t.color+';background:rgba(192,132,252,0.1)':''}">
      <div style="font-size:24px;width:36px;text-align:center">${t.badge.split(' ')[0]}</div>
      <div style="flex:1">
        <div style="font-weight:700;color:${t.color};font-size:13px">${t.label}
          ${isMyTier ? '<span style="font-size:10px;color:var(--accent);margin-left:6px">← YOU</span>' : ''}
        </div>
        <div style="font-size:10px;color:var(--muted);font-family:'Share Tech Mono',monospace">${minStr}+ EMO</div>
      </div>
      <span class="rank-badge ${t.cls}">${t.badge}</span>
    </div>`;
  });

  html += `</div>
  <div style="margin-top:12px;padding:10px 12px;background:rgba(192,132,252,0.06);border:1px solid var(--border);border-radius:10px;font-size:11px;color:var(--muted);line-height:1.7">
    ${wallet
      ? `💜 Your balance: <b style="color:var(--accent)">${myBal.toLocaleString()} EMO</b> → <b class="${myTier.cls}">${myTier.label}</b>`
      : '🔗 Connect wallet to see your tier'}
  </div>`;
  content.innerHTML = html;
}

function openWalletModal(){document.getElementById('walletModal').classList.add('open');}
function closeWalletModal(){document.getElementById('walletModal').classList.remove('open');}
function openRankModal(){document.getElementById('rankModal').classList.add('open');}
function closeRankModal(){document.getElementById('rankModal').classList.remove('open');}

function disconnectWallet(){
  wallet = null;
  chogBalance = 0;
  const area = document.getElementById('walletArea');
  if(area) area.innerHTML = '<button class="btn-connect" onclick="openWalletModal()">Connect Wallet</button>';
  const inp = document.getElementById('chatInput');
  if(inp){ inp.disabled = true; inp.placeholder = 'Connect wallet to chat...'; }
  const btn = document.getElementById('sendBtn');
  if(btn) btn.disabled = true;
}

async function _finalizeWalletConnection(addr, provider, name){
  try{
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
    getHolderRank(addr).then(holderRank => {
      const nick     = getNick(addr);
      const name     = nick || short;
      const rankStr  = holderRank ? ` · Rank #${holderRank}` : '';
      renderMsg({ addr: name, addrFull: addr, bal: wallet.bal, msg: `${rank.badge} ${rank.label}${rankStr}`, time: nowTime() });
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
        div.innerHTML = `<div class="msg-meta"><span style="font-size:12px">🤖</span><span style="font-weight:700;color:var(--accent);font-size:11px">EMO Terminal</span><span style="font-size:10px;color:var(--muted);margin-left:auto">${nowTime()}</span></div><div style="font-size:12px">${devMsg || w}</div>`;
        chatList2.appendChild(div);
        if(chatList2.children.length>20) chatList2.removeChild(chatList2.firstChild);
        chatList2.scrollTop = chatList2.scrollHeight;
      }, 600);
    });
    if(typeof provider.on === 'function')
      provider.on('accountsChanged',accs=>{if(!accs.length){wallet=null;location.reload();}else connectWallet(name);});
  }catch(err){console.error('connectWallet error:',err);alert('Connection failed: '+(err.message||err));}
}

async function connectWallet(name){
  closeWalletModal();
  // WalletConnect: use any available injected provider
  const provider = name === 'WalletConnect' ? window.ethereum : window.ethereum;
  if(!provider){alert('No Web3 wallet detected!\nPlease install MetaMask.');return;}
  try{
    const accounts=await provider.request({method:'eth_requestAccounts'});
    if(!accounts||!accounts.length)throw new Error('No accounts');
    await _finalizeWalletConnection(accounts[0], provider, name);
  }catch(err){console.error('connectWallet error:',err);alert('Connection failed: '+(err.message||err));}
}

function sendChat(){
  if(!wallet)return;
  const inp=document.getElementById('chatInput');
  const msg=inp.value.trim();if(!msg)return;
  renderMsg({addr:wallet.addr,bal:wallet.bal,msg,time:nowTime()});
  inp.value='';
}
document.addEventListener('DOMContentLoaded',()=>{
  const ci=document.getElementById('chatInput');
  if(ci)ci.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
});

