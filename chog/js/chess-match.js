// ═══════════════════════════════════════
//  ♟️ CHESS MATCHMAKING + SUPABASE SYNC
//  초대 / 매치 / 포인트 통합
//
//  Supabase tables needed:
//  ─────────────────────────────────────
//  chess_invites: id(uuid), from_addr(text), to_addr(text),
//                 status(text:'pending'|'accepted'|'declined'),
//                 created_at(timestamptz)
//
//  chess_matches: id(uuid), white_addr(text), black_addr(text),
//                 game_state(jsonb), status(text:'active'|'finished'),
//                 winner(text), created_at, updated_at
//
//  contributions: +chess_pts(int) column
//  ─────────────────────────────────────
// ═══════════════════════════════════════

var _chessMatchSub = null; // Active match subscription
var _chessInviteSub = null; // Active invite subscription
var _pendingInvites = {}; // inviteId → {from, to}

// ── Supabase ready check ──────────────────────────────
function _chSb(){ return typeof _sbClient!=='undefined'&&!!_sbClient; }

// ══════════════════════════════════════════════════════
//  INVITATION SYSTEM
// ══════════════════════════════════════════════════════

// Send a chess challenge invitation
async function chessSendInvite(toAddr){
  if(!wallet){ alert('Connect your wallet first!'); return; }
  if(wallet.addr.toLowerCase()===toAddr.toLowerCase()){ alert('You can\'t challenge yourself!'); return; }

  const fromAddr = wallet.addr.toLowerCase();
  const to       = toAddr.toLowerCase();

  // Chat notification (sender side)
  if(typeof renderMsg==='function'){
    const nick = (typeof getNick==='function'?getNick(toAddr):null)||chessShortAddr(toAddr);
    renderMsg({ addr: fromAddr, addrFull: fromAddr, bal:0,
      msg:`♟️ Challenge sent to ${nick}! Waiting for response…`,
      time: typeof nowTime==='function'?nowTime():'' });
  }

  if(_chSb()){
    try{
      const {data,error} = await _sbClient.from('chess_invites').insert({
        from_addr: fromAddr, to_addr: to, status:'pending'
      }).select().single();
      if(error) throw error;
      console.log('[Chess] Invite sent:', data.id);
    }catch(e){
      console.warn('[Chess] Invite send failed:', e.message);
      alert('Could not send challenge. Supabase tables may not be set up yet.\nSee chess-match.js for table schema.');
    }
  } else {
    alert('Real-time sync not available. Connect to Supabase to enable multiplayer chess.');
  }
}

// Accept an invitation
async function chessAcceptInvite(inviteId, fromAddr){
  if(!wallet) return;
  if(!_chSb()) return;

  try{
    // Create match FIRST (challenger=white, acceptor=black)
    const whiteAddr = fromAddr.toLowerCase();
    const blackAddr = wallet.addr.toLowerCase();
    const initState = {
      board:      chessInitBoard(),
      turn:       'white',
      castling:   {wK:true,wQ:true,bK:true,bQ:true},
      enPassant:  null,
      status:     'normal',
      lastMove:   null,
      moveHistory:[],
      winner:     null,
    };

    const {data,error} = await _sbClient.from('chess_matches').insert({
      white_addr: whiteAddr,
      black_addr: blackAddr,
      game_state: initState,
      status:     'active',
    }).select().single();

    if(error) throw error;

    // Update invite status AFTER match exists → triggers challenger's subscription
    await _sbClient.from('chess_invites').update({status:'accepted'}).eq('id',inviteId);

    // Hide notification
    _dismissInviteNotif(inviteId);

    // Start local game (black's perspective)
    chessStartGame(data.id, whiteAddr, blackAddr, 'black', null);

    console.log('[Chess] Match started:', data.id);
  }catch(e){
    console.warn('[Chess] Accept failed:', e.message);
  }
}

// Decline an invitation
async function chessDeclineInvite(inviteId){
  _dismissInviteNotif(inviteId);
  if(!_chSb()) return;
  try{
    await _sbClient.from('chess_invites').update({status:'declined'}).eq('id',inviteId);
  }catch(e){ console.warn('[Chess] Decline failed:', e.message); }
}

// ── Show invite notification in chat ──────────────────
function _showInviteNotif(invite){
  const fromAddr = invite.from_addr;
  const inviteId = invite.id;
  const nick = (typeof getNick==='function'?getNick(fromAddr):null)||(fromAddr.slice(0,6)+'…'+fromAddr.slice(-4));

  // Create notification element
  const notifId = 'chess-invite-'+inviteId;
  if(document.getElementById(notifId)) return; // Already shown

  const div = document.createElement('div');
  div.id = notifId;
  div.className = 'chess-invite-notif';
  div.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--accent)">♟️ Chess Challenge!</div>
    <div style="font-size:11px;color:var(--text);margin:4px 0">
      <b style="color:var(--accent)">${escHtml(nick)}</b> challenges you to chess!
    </div>
    <div style="display:flex;gap:6px">
      <button class="chess-invite-btn chess-invite-accept" onclick="chessAcceptInvite('${inviteId}','${fromAddr}')">✅ Accept</button>
      <button class="chess-invite-btn chess-invite-decline" onclick="chessDeclineInvite('${inviteId}')">❌ Decline</button>
    </div>`;

  const chatList = document.getElementById('chatList');
  if(chatList){ chatList.appendChild(div); chatList.scrollTop=chatList.scrollHeight; }

  // Auto-expire after 60s
  setTimeout(()=>_dismissInviteNotif(inviteId), 60000);
}

function _dismissInviteNotif(inviteId){
  const el = document.getElementById('chess-invite-'+inviteId);
  if(el){ el.classList.add('chess-invite-fadeout'); setTimeout(()=>el.remove(),400); }
  delete _pendingInvites[inviteId];
}

// ══════════════════════════════════════════════════════
//  SUPABASE SUBSCRIPTIONS
// ══════════════════════════════════════════════════════

function initChessSync(){
  if(!_chSb()) return;
  _subscribeToChessInvites();
  console.log('[Chess] Sync initialized');
}

// Subscribe to incoming invitations for current wallet
function _subscribeToChessInvites(){
  if(!_chSb()||!wallet) return;
  if(_chessInviteSub){ _sbClient.removeChannel(_chessInviteSub); }

  const myAddr = wallet.addr.toLowerCase();
  _chessInviteSub = _sbClient.channel('chess-invites-'+myAddr.slice(0,8))
    .on('postgres_changes',
      { event:'INSERT', schema:'public', table:'chess_invites',
        filter:`to_addr=eq.${myAddr}` },
      payload => {
        const invite = payload.new;
        if(!invite||invite.status!=='pending') return;
        _pendingInvites[invite.id] = invite;
        _showInviteNotif(invite);
      }
    )
    // Also watch for the match being created after we sent an invite
    .on('postgres_changes',
      { event:'UPDATE', schema:'public', table:'chess_invites',
        filter:`from_addr=eq.${myAddr}` },
      async payload => {
        const invite = payload.new;
        if(!invite||invite.status!=='accepted') return;
        // Find the match created for this invite
        try{
          const {data} = await _sbClient.from('chess_matches')
            .select('*').eq('white_addr',myAddr).eq('status','active')
            .order('created_at',{ascending:false}).limit(1).single();
          if(!data) return;
          // Start game as white
          const gs = data.game_state;
          chessStartGame(data.id, data.white_addr, data.black_addr, 'white', gs);
        }catch(e){ console.warn('[Chess] Match lookup failed:', e.message); }
      }
    )
    .subscribe();
}

// Subscribe to active match for real-time move sync
function _subscribeToChessMatch(matchId){
  if(!_chSb()) return;
  if(_chessMatchSub){ _sbClient.removeChannel(_chessMatchSub); }

  _chessMatchSub = _sbClient.channel('chess-match-'+matchId)
    .on('postgres_changes',
      { event:'UPDATE', schema:'public', table:'chess_matches',
        filter:`id=eq.${matchId}` },
      payload => {
        const row = payload.new;
        if(!row) return;
        if(!chessGame||chessGame.matchId!==matchId) return;

        // Only apply if it's opponent's update (not our own echo)
        const myAddr = wallet?wallet.addr.toLowerCase():null;
        const justMoved = row.game_state&&row.game_state.turn;
        // If current turn switched to us, opponent just moved
        const opponentMoved = justMoved===chessGame.myColor && row.game_state.turn!==chessGame.turn;
        if(opponentMoved){
          chessApplyOpponentMove(row.game_state);
        }
        // Handle resign/game over from opponent — only if not already handled above
        // Also exclude 'resigned' to prevent echo when we resign (our own subscription fires back)
        if(!opponentMoved && row.status==='finished'
           && chessGame.status!=='checkmate'
           && chessGame.status!=='stalemate'
           && chessGame.status!=='resigned'){
          chessApplyOpponentMove(row.game_state);
        }
      }
    )
    .subscribe();
}

// ══════════════════════════════════════════════════════
//  MOVE SYNC
// ══════════════════════════════════════════════════════

async function chessSyncMove(g){
  if(!_chSb()||!g.matchId) return;
  try{
    const state = {
      board:       g.board,
      turn:        g.turn,
      castling:    g.castling,
      enPassant:   g.enPassant,
      status:      g.status,
      lastMove:    g.lastMove,
      moveHistory: g.moveHistory,
      winner:      g.winner||null,
    };
    const matchStatus = (g.status==='checkmate'||g.status==='stalemate'||g.status==='resigned')?'finished':'active';
    await _sbClient.from('chess_matches').update({
      game_state:  state,
      status:      matchStatus,
      winner:      g.winner||null,
      updated_at:  new Date().toISOString(),
    }).eq('id',g.matchId);
  }catch(e){ console.warn('[Chess] Move sync failed:', e.message); }
}

async function chessSyncResign(g){
  await chessSyncMove(g);
}

// ══════════════════════════════════════════════════════
//  POINTS INTEGRATION
//  이긴사람 +3pt | 진사람 +1pt
// ══════════════════════════════════════════════════════

async function chessAwardPoints(winner, g){
  if(!wallet||!g) return;
  const myAddr  = wallet.addr.toLowerCase();
  const isWhite = g.whiteAddr===myAddr;
  const myColor = isWhite?'white':'black';
  const iWon    = winner===myColor;
  const isDraw  = !winner;

  // Determine points: win=3, lose=1, draw=1
  const pts = iWon?3:1;

  if(_chSb()){
    try{
      // Try RPC first
      await _sbClient.rpc('add_chess_point',{ p_address: myAddr, p_pts: pts });
      return;
    }catch(e){
      // Fallback: upsert directly into contributions
      try{
        const {data:existing} = await _sbClient.from('contributions').select('chess_pts').eq('address',myAddr).single();
        const currentPts = existing?existing.chess_pts||0:0;
        await _sbClient.from('contributions').upsert({
          address:    myAddr,
          chess_pts:  currentPts+pts,
          updated_at: new Date().toISOString(),
        },{ onConflict:'address' });
      }catch(e2){ console.warn('[Chess] Points award failed:', e2.message); }
    }
  }

  // localStorage fallback
  try{
    const db  = JSON.parse(localStorage.getItem('chog_contrib_v1')||'{}');
    const key = myAddr;
    if(!db[key]) db[key]={chatHours:[],nickCount:0,shoutCount:0,chessPts:0};
    db[key].chessPts = (db[key].chessPts||0)+pts;
    localStorage.setItem('chog_contrib_v1',JSON.stringify(db));
  }catch(e){}

  console.log(`[Chess] Awarded ${pts} pts to ${myAddr} (${iWon?'win':'loss/draw'})`);
}

// ── Track chess win/loss in chat message ──────────────
function chessPostResultToChat(winner, g){
  if(typeof renderMsg!=='function') return;
  const wNick = (typeof getNick==='function'?getNick(g.whiteAddr):null)||chessShortAddr(g.whiteAddr);
  const bNick = (typeof getNick==='function'?getNick(g.blackAddr):null)||chessShortAddr(g.blackAddr);
  let msg;
  if(!winner) msg = `♟️ Chess: ${wNick} vs ${bNick} — Draw!`;
  else {
    const winNick  = winner==='white'?wNick:bNick;
    const loseNick = winner==='white'?bNick:wNick;
    msg = `♟️ Chess: ${winNick} beat ${loseNick}! 👑`;
  }
  renderMsg({ addr:'SYSTEM', addrFull:'', bal:0, msg, time:typeof nowTime==='function'?nowTime():'' });
}

// ══════════════════════════════════════════════════════
//  CHESS STATS (전적 / 승률)
//  chess_matches 테이블에서 집계
// ══════════════════════════════════════════════════════

// 특정 주소의 전적 조회
// Returns: { wins, losses, draws, pts } or null
async function chessLoadStats(addr){
  const lower = addr.toLowerCase();

  // Supabase에서 조회
  if(_chSb()){
    try{
      // 완료된 경기 조회
      const {data, error} = await _sbClient
        .from('chess_matches')
        .select('white_addr, black_addr, winner, status')
        .or(`white_addr.eq.${lower},black_addr.eq.${lower}`)
        .eq('status','finished');

      if(error) throw error;

      let wins=0, losses=0, draws=0;
      (data||[]).forEach(row => {
        if(!row.winner){ draws++; return; }
        const iWon = row.winner==='white'
          ? row.white_addr===lower
          : row.black_addr===lower;
        iWon ? wins++ : losses++;
      });

      // chess_pts 포인트 조회
      let pts = 0;
      try{
        const {data:contrib} = await _sbClient
          .from('contributions')
          .select('chess_pts')
          .eq('address', lower)
          .single();
        if(contrib) pts = contrib.chess_pts || 0;
      }catch(e){}

      return { wins, losses, draws, pts };
    }catch(e){
      console.warn('[Chess] Stats load failed:', e.message);
    }
  }

  // localStorage fallback
  try{
    const db  = JSON.parse(localStorage.getItem('chog_contrib_v1')||'{}');
    const ent = db[lower];
    if(!ent) return { wins:0, losses:0, draws:0, pts:0 };
    return {
      wins:   ent.chessWins   || 0,
      losses: ent.chessLosses || 0,
      draws:  ent.chessDraws  || 0,
      pts:    ent.chessPts    || 0,
    };
  }catch(e){ return null; }
}

// localStorage에 전적 기록 저장 (Supabase 없을 때 fallback)
function _chessRecordLocalStats(myAddr, result){
  try{
    const db  = JSON.parse(localStorage.getItem('chog_contrib_v1')||'{}');
    const key = myAddr.toLowerCase();
    if(!db[key]) db[key]={chatHours:[],nickCount:0,shoutCount:0};
    if(result==='win')       db[key].chessWins   = (db[key].chessWins||0)+1;
    else if(result==='loss') db[key].chessLosses = (db[key].chessLosses||0)+1;
    else                     db[key].chessDraws  = (db[key].chessDraws||0)+1;
    localStorage.setItem('chog_contrib_v1', JSON.stringify(db));
  }catch(e){}
}

// chessAwardPoints override to also save local stats
const _origAwardPoints = typeof chessAwardPoints !== 'undefined' ? chessAwardPoints : null;
async function chessAwardPoints(winner, g){
  if(!wallet||!g) return;
  const myAddr  = wallet.addr.toLowerCase();
  const myColor = g.whiteAddr===myAddr ? 'white' : 'black';
  const iWon    = winner===myColor;
  const isDraw  = !winner;

  // Record local stats
  _chessRecordLocalStats(myAddr, isDraw?'draw':(iWon?'win':'loss'));

  // Notify chat
  if(g.status==='checkmate'||g.status==='stalemate'||g.status==='resigned'){
    chessPostResultToChat(winner, g);
  }

  const pts = iWon ? 3 : 1;

  if(_chSb()){
    try{
      await _sbClient.rpc('add_chess_point',{ p_address: myAddr, p_pts: pts });
      return;
    }catch(e){
      try{
        const {data:ex} = await _sbClient.from('contributions')
          .select('chess_pts').eq('address',myAddr).single();
        const cur = ex ? ex.chess_pts||0 : 0;
        await _sbClient.from('contributions').upsert({
          address: myAddr, chess_pts: cur+pts,
          updated_at: new Date().toISOString()
        },{ onConflict:'address' });
      }catch(e2){ console.warn('[Chess] Points upsert failed:', e2.message); }
    }
  }

  // localStorage fallback
  try{
    const db  = JSON.parse(localStorage.getItem('chog_contrib_v1')||'{}');
    const key = myAddr;
    if(!db[key]) db[key]={chatHours:[],nickCount:0,shoutCount:0,chessPts:0};
    db[key].chessPts = (db[key].chessPts||0)+pts;
    localStorage.setItem('chog_contrib_v1',JSON.stringify(db));
  }catch(e){}

  console.log(`[Chess] +${pts}pts → ${myAddr} (${iWon?'win':'loss/draw'})`);
}

// ══════════════════════════════════════════════════════
//  랜덤 매칭 큐 시스템 (네비게이션 버튼용)
//  Supabase table: chess_queue(id, address UNIQUE, nick, created_at)
//
//  Flow:
//   1. A joins queue → watches chess_matches INSERT (waiter)
//   2. B joins queue → finds A → B creates the match (joiner)
//   3. A's chess_matches subscription fires → A opens game as WHITE
//   4. B opens game as BLACK immediately after creating match
// ══════════════════════════════════════════════════════

var _chessQueueSub  = null;  // watches chess_queue for queue status display
var _chessWaitSub   = null;  // watches chess_matches INSERT (waiter side)
var _inQueue        = false;
var _queueCheckTimer= null;

// ── Nav button click ──────────────────────────────────
function chessNavClick(){
  if(!wallet){ alert('Please connect your wallet first!'); return; }
  if(_inQueue){
    chessLeaveQueue();
  } else if(chessGame && (chessGame.status==='active'||chessGame.status==='normal')){
    openChessModal();
  } else {
    chessJoinQueue();
  }
}

// ── Join queue ────────────────────────────────────────
async function chessJoinQueue(){
  if(!wallet||_inQueue) return;
  _inQueue = true;
  _updateNavChessBtn();

  const myAddr = wallet.addr.toLowerCase();
  const myNick = (typeof getNick==='function'?getNick(wallet.addr):null)||chessShortAddr(wallet.addr);

  if(!_chSb()){
    _showQueueToast('⚠️ Real-time sync unavailable. Please connect Supabase.');
    _inQueue = false; _updateNavChessBtn(); return;
  }

  try{
    // Register in queue
    await _sbClient.from('chess_queue').upsert(
      { address: myAddr, nick: myNick }, { onConflict: 'address' }
    );

    // ── Waiter side: watch for a match being created that includes me ──
    // Only the joiner creates the match; waiter opens game from this event
    _chessWaitSub = _sbClient.channel('chess-wait-'+myAddr.slice(2,10))
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'chess_matches' },
        payload => {
          const match = payload.new;
          if(!match||!_inQueue) return;
          const wa = match.white_addr, ba = match.black_addr;
          if(wa!==myAddr && ba!==myAddr) return; // not for me
          _inQueue = false;
          _clearQueueSubs();
          if(_queueCheckTimer){ clearTimeout(_queueCheckTimer); _queueCheckTimer=null; }
          const myColor = wa===myAddr?'white':'black';
          _updateNavChessBtn();
          _showQueueToast('🎉 Match found! Starting game...');
          setTimeout(()=>chessStartGame(match.id, wa, ba, myColor, match.game_state), 300);
        }
      )
      .subscribe();

    // Check if someone is already waiting → I become the joiner
    const {data} = await _sbClient
      .from('chess_queue')
      .select('address,nick')
      .neq('address', myAddr)
      .order('created_at',{ascending:true})
      .limit(1);

    if(data && data.length>0){
      // Found a waiter → I create the match
      await _chessCreateMatch(myAddr, data[0].address);
    } else {
      // No one waiting → I wait; auto-cancel after 30s
      _queueCheckTimer = setTimeout(()=>{
        if(_inQueue){ chessLeaveQueue(); _showQueueToast('⏱️ No opponent found. Please try again!'); }
      }, 30000);
    }
  }catch(e){
    console.warn('[Chess Queue] join failed:', e.message);
    _showQueueToast('⚠️ Random matchmaking requires Supabase to be configured.');
    _inQueue = false; _updateNavChessBtn();
  }
}

// ── Only the joiner calls this ────────────────────────
// joinerAddr = me (just arrived), waiterAddr = opponent (was waiting → WHITE)
async function _chessCreateMatch(joinerAddr, waiterAddr){
  if(!_chSb()) return;
  // Waiter was first → WHITE; Joiner is new → BLACK
  const whiteAddr = waiterAddr;
  const blackAddr = joinerAddr;

  const initState = {
    board: chessInitBoard(), turn:'white',
    castling:{wK:true,wQ:true,bK:true,bQ:true},
    enPassant:null, status:'normal',
    lastMove:null, moveHistory:[], winner:null,
  };

  // Remove both from queue before creating match
  await _sbClient.from('chess_queue').delete().in('address',[joinerAddr, waiterAddr]);
  _inQueue = false;
  _clearQueueSubs();
  if(_queueCheckTimer){ clearTimeout(_queueCheckTimer); _queueCheckTimer=null; }

  // Create match — waiter's _chessWaitSub will fire and open game for them
  const {data,error} = await _sbClient.from('chess_matches').insert({
    white_addr: whiteAddr,
    black_addr: blackAddr,
    game_state: initState,
    status: 'active',
  }).select().single();

  if(error){ console.warn('[Chess Queue] match create failed:', error.message); return; }

  _updateNavChessBtn();
  _showQueueToast('🎉 Match found! Starting game...');
  // I (joiner) am BLACK
  setTimeout(()=>chessStartGame(data.id, whiteAddr, blackAddr, 'black', initState), 300);
}

// ── Leave queue ───────────────────────────────────────
async function chessLeaveQueue(){
  if(!wallet) return;
  _inQueue = false;
  _clearQueueSubs();
  if(_queueCheckTimer){ clearTimeout(_queueCheckTimer); _queueCheckTimer=null; }
  _updateNavChessBtn();
  if(_chSb()){
    try{ await _sbClient.from('chess_queue').delete().eq('address',wallet.addr.toLowerCase()); }
    catch(e){}
  }
}

function _clearQueueSubs(){
  if(_chessWaitSub){ try{ _sbClient.removeChannel(_chessWaitSub); }catch(e){} _chessWaitSub=null; }
  if(_chessQueueSub){ try{ _sbClient.removeChannel(_chessQueueSub); }catch(e){} _chessQueueSub=null; }
}

// ── Nav button state ──────────────────────────────────
function _updateNavChessBtn(){
  const btn = document.getElementById('chessNavBtn');
  if(!btn) return;
  if(chessGame && (chessGame.status==='active'||chessGame.status==='normal')){
    btn.textContent = '♟️ Game';
    btn.style.borderColor = 'rgba(74,222,128,0.5)';
    btn.style.color = '#86efac';
    btn.style.animation = '';
  } else if(_inQueue){
    btn.innerHTML = '♟️ <span class="chess-queue-spin">⟳</span> Finding opponent…';
    btn.style.borderColor = 'rgba(250,204,21,0.5)';
    btn.style.color = 'var(--gold)';
    btn.style.animation = '';
  } else {
    btn.textContent = '♟️ CHOG Chess';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.animation = '';
  }
}

// ── Queue status for others (pulse button when someone waits) ─
async function _renderQueueStatus(){
  if(!_chSb()||_inQueue) return;
  const btn = document.getElementById('chessNavBtn');
  if(!btn) return;
  try{
    const {data} = await _sbClient.from('chess_queue').select('nick').limit(5);
    if(data && data.length>0){
      const names = data.map(r=>r.nick||'?').join(', ');
      btn.title = `Waiting: ${names} — Click to match!`;
      btn.style.animation = 'chessBtnPulse 1.5s ease-in-out infinite';
      btn.style.borderColor = 'rgba(74,222,128,0.4)';
    } else {
      btn.title = 'Random matchmaking';
      btn.style.animation = '';
      btn.style.borderColor = '';
    }
  }catch(e){}
}

// ── Toast message ─────────────────────────────────────
function _showQueueToast(msg){
  const toast = document.createElement('div');
  toast.className = 'chess-queue-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(()=>{ toast.classList.add('chess-queue-toast-hide'); setTimeout(()=>toast.remove(),500); }, 3000);
}

// Refresh queue status every 30s
setInterval(()=>{ if(!_inQueue) _renderQueueStatus(); }, 30000);
