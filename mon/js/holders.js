function openHolderModal(){
  document.getElementById('holderModal').classList.add('open');
  renderTierTable();
}
function closeHolderModal(){
  document.getElementById('holderModal').classList.remove('open');
}


function renderTierTable(){
  const content = document.getElementById('holderTabContent');
  const TIERS = [
    {min:100000000, label:'Monad Overlord',  badge:'👑 OVERLORD', cls:'r1', color:'#ffd700'},
    {min:10000000,  label:'Monad Titan',     badge:'🐉 TITAN',    cls:'r2', color:'#e5e7eb'},
    {min:5000000,   label:'Monad Validator', badge:'⚡ VALID',     cls:'r3', color:'#7c3aed'},
    {min:1000000,   label:'Monad Whale',     badge:'🐳 WHALE',    cls:'r4', color:'#38bdf8'},
    {min:10000,     label:'Monad Maxi',      badge:'💎 MAXI',     cls:'r5', color:'#60a5fa'},
    {min:1000,      label:'Monad Degen',     badge:'🔥 DEGEN',    cls:'r6', color:'#34d399'},
    {min:100,       label:'Monad Pleb',      badge:'🟣 PLEB',     cls:'r7', color:'#fbbf24'},
    {min:10,        label:'MON Holder',      badge:'💸 HOLDER',   cls:'r8', color:'#a78bfa'},
    {min:1,         label:'Dust Collector',  badge:'🙏 DUST',     cls:'r9', color:'#94a3b8'},
    {min:0,         label:'Zero Gas Ghost',  badge:'👻 GHOST',    cls:'r10',color:'#6b7280'},
  ];

  const myBal = wallet ? wallet.bal : 0;
  const myTier = getRank(myBal);

  let html = `<div style="overflow-y:auto;max-height:60vh">`;
  TIERS.forEach(t => {
    const isMyTier = myTier.cls === t.cls;
    const minStr = t.min >= 1e6 ? (t.min/1e6)+'M' : t.min >= 1e3 ? (t.min/1e3)+'K' : t.min > 0 ? t.min : '0';
    html += `<div class="tier-row" style="${isMyTier?'border-color:'+t.color+';background:rgba(124,58,237,0.1)':''}">
      <div style="font-size:24px;width:36px;text-align:center">${t.badge.split(' ')[0]}</div>
      <div style="flex:1">
        <div style="font-weight:700;color:${t.color};font-size:13px">${t.label}
          ${isMyTier ? '<span style="font-size:10px;color:var(--accent);margin-left:6px">← YOU</span>' : ''}
        </div>
        <div style="font-size:10px;color:var(--muted);font-family:'Share Tech Mono',monospace">${minStr}+ MON</div>
      </div>
      <span class="rank-badge ${t.cls}">${t.badge}</span>
    </div>`;
  });

  html += `</div>
  <div style="margin-top:12px;padding:10px 12px;background:rgba(124,58,237,0.06);border:1px solid var(--border);border-radius:10px;font-size:11px;color:var(--muted);line-height:1.7">
    ${wallet
      ? `💜 Your balance: <b style="color:var(--accent)">${myBal.toLocaleString()} MON</b> → <b class="${myTier.cls}">${myTier.label}</b>`
      : '🔗 Connect wallet to see your tier'}
  </div>`;
  content.innerHTML = html;
}

function openWalletModal(){document.getElementById('walletModal').classList.add('open');}
function closeWalletModal(){document.getElementById('walletModal').classList.remove('open');}
function openRankModal(){document.getElementById('rankModal').classList.add('open');}
function closeRankModal(){document.getElementById('rankModal').classList.remove('open');}

function _getProvider(name){
  if(name === 'Phantom'){
    // Phantom 전용 EVM provider 우선
    if(window.phantom?.ethereum) return window.phantom.ethereum;
    if(window.ethereum?.isPhantom) return window.ethereum;
    if(window.ethereum?.providers){
      const p = window.ethereum.providers.find(p => p.isPhantom);
      if(p) return p;
    }
    return null;
  }
  if(name === 'Backpack'){
    if(window.ethereum?.isBackpack) return window.ethereum;
    if(window.ethereum?.providers){
      const p = window.ethereum.providers.find(p => p.isBackpack);
      if(p) return p;
    }
    // Backpack may inject under window.backpack.ethereum
    if(window.backpack?.ethereum) return window.backpack.ethereum;
    return null;
  }
  // MetaMask — providers 배열에서 MetaMask 찾기 (여러 지갑 공존 시)
  if(window.ethereum?.providers){
    const p = window.ethereum.providers.find(p => p.isMetaMask && !p.isPhantom && !p.isBackpack);
    if(p) return p;
  }
  return window.ethereum || null;
}

function disconnectWallet(){
  wallet = null;
  const area = document.getElementById('walletArea');
  if(area) area.innerHTML = '<button class="btn-connect" onclick="openWalletModal()">Connect Wallet</button>';
  const inp = document.getElementById('chatInput');
  if(inp){ inp.disabled = true; inp.placeholder = 'Connect wallet to chat...'; }
  const btn = document.getElementById('sendBtn');
  if(btn) btn.disabled = true;
  const sb = document.getElementById('stickerBtn');
  if(sb) sb.disabled = true;
}

// ── 공통 지갑 연결 마무리 ─────────────────────────────────
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
    // MON 네이티브 잔고 조회
    let monBal = 0;
    try{
      const monHex = await provider.request({method:'eth_getBalance',params:[addr,'latest']});
      monBal = Number(BigInt(monHex)) / 1e18;
    }catch(e){ monBal = 0; }
    wallet={addr, bal: Math.floor(monBal), name};
    // 지갑 연결 후 chess invite 구독 초기화 (페이지 로드 시엔 지갑 없어서 구독 못함)
    if(typeof initChessSync==='function') initChessSync();
    const rank=getRank(wallet.bal, addr);
    const short=addr.slice(0,6)+'...'+addr.slice(-4);
    updateWalletDisplay();
    document.getElementById('chatInput').disabled=false;
    document.getElementById('chatInput').placeholder='Type a message...';
    document.getElementById('sendBtn').disabled=false;
    const sb2 = document.getElementById('stickerBtn');
    if(sb2) sb2.disabled=false;
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

      // 시스템 웰컴 메시지 (MON Terminal 봇처럼)
      setTimeout(() => {
        const welcomes = nick ? [
          `👋 Welcome back, <b>${nick}</b>! Great to see you 🟣`,
          `🎉 <b>${nick}</b> has entered the MON Terminal!`,
          `🟣 Hey <b>${nick}</b>! MON to the moon 🚀`,
        ] : [
          `👋 Welcome to MON Terminal! Set a nickname to stand out 🟣`,
          `🎉 New trader joined! Connect and set your nickname ✏️`,
          `🟣 Welcome! You're now live on MON Terminal 🚀`,
        ];
        const w = welcomes[Math.floor(Math.random()*welcomes.length)];
        const isDev2 = addr.toLowerCase() === DEV_WALLET.toLowerCase();
        const devMsg = isDev2 ? `🛠️ <b>MON Terminal DEV</b> has entered the building! 👑` : null;

        const chatList2 = document.getElementById('chatList');
        if(!chatList2) return;
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.style.cssText = 'background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);';
        div.innerHTML = `
          <div class="msg-meta">
            <span style="font-size:12px">🤖</span>
            <span style="font-weight:700;color:var(--accent);font-size:11px">MON Terminal</span>
            <span style="font-size:10px;color:var(--muted);margin-left:auto">${nowTime()}</span>
          </div>
          <div style="font-size:12px">${devMsg || w}</div>`;
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
  const provider = name === 'WalletConnect' ? window.ethereum : _getProvider(name);
  if(!provider){
    const links = { MetaMask:'https://metamask.io', Phantom:'https://phantom.app', Backpack:'https://backpack.app' };
    alert(`${name} wallet not found!\nPlease install it from ${links[name]||'the official site'}.`);
    return;
  }
  const area = document.getElementById('walletArea');
  const prevHTML = area ? area.innerHTML : '';
  if(area) area.innerHTML = '<button class="btn-connect" disabled>Connecting…</button>';
  try{
    const accounts = await provider.request({method:'eth_requestAccounts'});
    if(!accounts||!accounts.length) throw new Error('No accounts');
    await _finalizeWalletConnection(accounts[0], provider, name);
  }catch(err){
    console.error('connectWallet error:',err);
    if(area) area.innerHTML = prevHTML;
    if(err && err.code === 4001) return; // user rejected
    alert('Connection failed: '+(err.message||err));
  }
}

function sendChat(){
  if(!wallet) return;
  const inp = document.getElementById('chatInput');
  const msg = inp.value.trim();
  if(!msg) return;
  inp.value = '';

  if(typeof isSyncEnabled === 'function' && isSyncEnabled()){
    // Supabase 저장 → 구독 이벤트가 모든 브라우저에 renderMsg 처리
    const nick = typeof getNick === 'function' ? getNick(wallet.addr) : null;
    syncMessageToServer(wallet.addr, nick, msg, wallet.bal);
  } else {
    // Supabase 미연결 시 로컬 폴백
    renderMsg({addr: wallet.addr, addrFull: wallet.addr, bal: wallet.bal, msg, time: nowTime()});
  }
  // 채팅 포인트 적립 (시간당 1pt)
  if(typeof trackChatPoint === 'function') trackChatPoint();
}
document.addEventListener('DOMContentLoaded',()=>{
  const ci=document.getElementById('chatInput');
  if(ci)ci.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
});

