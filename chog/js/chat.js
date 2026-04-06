// ═══════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════
// ── DEMO/FAKE 채팅 OFF — 정식 라이브 모드 ──
var chatList = document.getElementById('chatList');

function renderMsg(item){
  if(!chatList) chatList = document.getElementById('chatList');
  if(!chatList)return;
  const addrFull = item.addrFull || item.addr || '';
  const rank=getRank(item.bal||0, addrFull);
  const div=document.createElement('div');
  // 닉네임 있으면 닉네임으로 표시 (실시간 nickDB → DB 스냅샷 순서로 fallback)
  const nick = getNick(addrFull) || item.nickname || null;
  const shortAddr = addrFull ? addrFull.slice(0,6)+'...'+addrFull.slice(-4) : item.addr;
  const displayAddr = nick
    ? `<span style="color:var(--accent);font-weight:700">${nick}</span>`
    : shortAddr;

  const addrHtml = `<span class="msg-addr" data-addr="${addrFull}" style="cursor:pointer;text-decoration:underline dotted" onclick="openProfileModal('${addrFull}',${item.bal||0},'${rank.cls}','${rank.badge}','${item.txHash||''}')">${displayAddr}</span>`;

  // bal=0이고 custom tier 없을 때 → 실제 잔고 비동기 조회 후 뱃지 업데이트
  if(!item.bal && addrFull && addrFull.startsWith('0x') && !devCustomTiers[addrFull.toLowerCase()] && typeof fetchChogBalance === 'function'){
    const msgId = 'msg-' + Date.now() + Math.random().toString(36).slice(2);
    div.dataset.msgId = msgId;
    fetchChogBalance(addrFull).then(realBal => {
      if(!realBal) return;
      const balInt = Math.floor(realBal);
      const realRank = getRank(balInt, addrFull);
      const badge = div.querySelector('.rank-badge');
      if(badge){ badge.textContent = realRank.badge; badge.className = 'rank-badge ' + realRank.cls; }
    }).catch(()=>{});
  }

  if(item.type==='trade'){
    const mon = item.mon || 0;
    const isBuy = item.side==='buy';

    // MON 규모별 이모지
    let sizeEmoji = '';
    if(mon >= 10000){
      // 10,000 MON 이상: 고래(매수) / ☠️(매도), 100K당 1개 추가
      const count = Math.max(1, Math.min(5, Math.floor(mon/100000)));
      sizeEmoji = isBuy ? '🐳'.repeat(count) : '☠️'.repeat(count);
    } else if(mon >= 1000){
      // 1,000 MON당 🚀(매수) / 💀(매도), Max 5개
      const count = Math.min(5, Math.floor(mon/1000));
      sizeEmoji = isBuy ? '🚀'.repeat(count) : '💀'.repeat(count);
    }

    div.className='chat-msg '+(isBuy?'trade-alert':'trade-sell');
    if(mon >= 10000) div.style.cssText += ';border-width:2px;';
    chogEmotion(item.side);
    const baseEmoji = isBuy ? '🟢' : '🔴';
    const usd = ((item.amount||0)*(item.price||0)).toFixed(0);
    const monStr = mon >= 1000 ? (mon>=1000?Math.floor(mon).toLocaleString()+' MON':'') : '';

    div.innerHTML=`
      <div class="msg-meta">
        <span style="font-size:13px">${baseEmoji}</span>
        ${addrHtml}
        <span class="rank-badge ${rank.cls}">${rank.badge}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto">${item.time}</span>
      </div>
      <div style="font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span>${isBuy?'BUY':'SELL'} ${(item.amount||0).toLocaleString()} CHOG · $${usd}</span>
        ${monStr ? `<span style="font-size:10px;color:var(--muted)">${monStr}</span>` : ''}
        ${sizeEmoji ? `<span style="font-size:${mon>=100000?'18':'14'}px;letter-spacing:2px">${sizeEmoji}</span>` : ''}
      </div>`;
  }else{
    div.className='chat-msg';
    div.innerHTML=`<div class="msg-meta">${addrHtml}<span class="rank-badge ${rank.cls}">${rank.badge}</span><span style="font-size:10px;color:var(--muted);margin-left:auto">${item.time}</span></div><div>${escHtml(item.msg)}</div>`;
  }
  chatList.appendChild(div);
  if(chatList.children.length>20)chatList.removeChild(chatList.firstChild);
  chatList.scrollTop=chatList.scrollHeight;
}

// DEMO 메시지 OFF (라이브 모드)

// FAKE 자동 메시지 OFF (라이브 모드)

