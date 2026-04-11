// ═══════════════════════════════════════
//  ♟️ CHESS ENGINE + UI
//  CHOG Terminal - Chess Mini-Game
//  지갑 연결 유저끼리 매칭 | 이긴사람 +3pt 진사람 +1pt
// ═══════════════════════════════════════

// ── Global state ─────────────────────────────────────
var chessGame = null;       // Active game object
var chessPending = null;    // Pending move for promotion

// ── Turn Timer state ──────────────────────────────────
var _chessTurnTimer    = null;   // setInterval handle
var _chessTimeLeft     = 90;     // seconds remaining
var _chessTimeouts     = 0;      // consecutive timeouts by current turn player
const CHESS_TURN_SECS  = 90;     // seconds per turn
const CHESS_MAX_TIMEOUTS = 1;    // timeouts before auto-forfeit (1 = immediate)

// ── Mini-pip state ────────────────────────────────────
var _chessPipActive = false;

// ── Piece unicode ─────────────────────────────────────
const CHESS_SYMBOLS = {
  'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙',
  'k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'
};

// ── Helpers ───────────────────────────────────────────
function chessIsWhite(p){ return !!p && p === p.toUpperCase() && /[KQRBNP]/.test(p); }
function chessIsBlack(p){ return !!p && p === p.toLowerCase() && /[kqrbnp]/.test(p); }
function chessPieceColor(p){ if(!p) return null; return chessIsWhite(p)?'white':'black'; }
function chessIsEnemy(p,color){ if(!p) return false; return color==='white'?chessIsBlack(p):chessIsWhite(p); }
function chessIsFriend(p,color){ if(!p) return false; return color==='white'?chessIsWhite(p):chessIsBlack(p); }
function chessInBounds(r,c){ return r>=0&&r<8&&c>=0&&c<8; }
function chessOpponent(color){ return color==='white'?'black':'white'; }

// ── Initial board ─────────────────────────────────────
function chessInitBoard(){
  return [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R'],
  ];
}

// ── Deep copy board ───────────────────────────────────
function chessCloneBoard(board){ return board.map(r=>[...r]); }

// ── Raw moves (no check filter) ───────────────────────
function chessRawMoves(board, row, col, castling, enPassant){
  const piece = board[row][col];
  if(!piece) return [];
  const color = chessPieceColor(piece);
  const type  = piece.toUpperCase();
  const moves = [];

  const addSlide = (dr, dc) => {
    let r=row+dr, c=col+dc;
    while(chessInBounds(r,c) && !board[r][c]){ moves.push([r,c]); r+=dr; c+=dc; }
    if(chessInBounds(r,c) && chessIsEnemy(board[r][c],color)) moves.push([r,c]);
  };

  switch(type){
    case 'P':{
      const dir  = color==='white'?-1:1;
      const sr   = color==='white'?6:1;
      const pr   = color==='white'?0:7;
      // Forward
      if(chessInBounds(row+dir,col) && !board[row+dir][col]){
        moves.push(row+dir===pr?[row+dir,col,'promote']:[row+dir,col]);
        if(row===sr && !board[row+dir*2][col]) moves.push([row+dir*2,col]);
      }
      // Captures
      for(const dc of[-1,1]){
        if(!chessInBounds(row+dir,col+dc)) continue;
        if(chessIsEnemy(board[row+dir][col+dc],color))
          moves.push(row+dir===pr?[row+dir,col+dc,'promote']:[row+dir,col+dc]);
        if(enPassant && row+dir===enPassant[0] && col+dc===enPassant[1])
          moves.push([row+dir,col+dc,'ep']);
      }
      break;
    }
    case 'N':
      for(const [dr,dc] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
        if(chessInBounds(row+dr,col+dc)&&!chessIsFriend(board[row+dr][col+dc],color))
          moves.push([row+dr,col+dc]);
      }
      break;
    case 'B': for(const [dr,dc] of[[-1,-1],[-1,1],[1,-1],[1,1]]) addSlide(dr,dc); break;
    case 'R': for(const [dr,dc] of[[-1,0],[1,0],[0,-1],[0,1]]) addSlide(dr,dc); break;
    case 'Q': for(const [dr,dc] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) addSlide(dr,dc); break;
    case 'K':
      for(const [dr,dc] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
        if(chessInBounds(row+dr,col+dc)&&!chessIsFriend(board[row+dr][col+dc],color))
          moves.push([row+dr,col+dc]);
      }
      // Castling
      if(castling){
        if(color==='white'&&row===7&&col===4){
          if(castling.wK&&!board[7][5]&&!board[7][6]&&board[7][7]==='R') moves.push([7,6,'castle']);
          if(castling.wQ&&!board[7][3]&&!board[7][2]&&!board[7][1]&&board[7][0]==='R') moves.push([7,2,'castle']);
        } else if(color==='black'&&row===0&&col===4){
          if(castling.bK&&!board[0][5]&&!board[0][6]&&board[0][7]==='r') moves.push([0,6,'castle']);
          if(castling.bQ&&!board[0][3]&&!board[0][2]&&!board[0][1]&&board[0][0]==='r') moves.push([0,2,'castle']);
        }
      }
      break;
  }
  return moves;
}

// ── Square attacked? ──────────────────────────────────
function chessIsAttacked(board, row, col, byColor){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c];
    if(!p||chessPieceColor(p)!==byColor) continue;
    const ms=chessRawMoves(board,r,c,null,null);
    if(ms.some(([mr,mc])=>mr===row&&mc===col)) return true;
  }
  return false;
}

// ── King in check? ────────────────────────────────────
function chessInCheck(board, color){
  const king=color==='white'?'K':'k';
  let kr=-1,kc=-1;
  for(let r=0;r<8&&kr<0;r++) for(let c=0;c<8&&kr<0;c++) if(board[r][c]===king){kr=r;kc=c;}
  if(kr<0) return false;
  return chessIsAttacked(board,kr,kc,chessOpponent(color));
}

// ── Apply move to board (returns new board) ───────────
function chessApplyMove(board, fr, fc, tr, tc, special, promoteTo){
  const nb = chessCloneBoard(board);
  const piece = nb[fr][fc];
  nb[fr][fc] = null;
  if(special==='promote'){
    const pp = promoteTo||'Q';
    nb[tr][tc] = chessIsWhite(piece)?pp.toUpperCase():pp.toLowerCase();
  } else {
    nb[tr][tc] = piece;
  }
  if(special==='ep'){
    const dir = chessIsWhite(piece)?1:-1;
    nb[tr+dir][tc] = null;
  } else if(special==='castle'){
    if(tc===6){ nb[tr][5]=nb[tr][7]; nb[tr][7]=null; }
    else       { nb[tr][3]=nb[tr][0]; nb[tr][0]=null; }
  }
  return nb;
}

// ── Update castling rights ────────────────────────────
function chessUpdateCastling(castling, piece, fr, fc){
  const c={...castling};
  if(piece==='K'){ c.wK=false; c.wQ=false; }
  if(piece==='k'){ c.bK=false; c.bQ=false; }
  if(piece==='R'&&fr===7&&fc===7) c.wK=false;
  if(piece==='R'&&fr===7&&fc===0) c.wQ=false;
  if(piece==='r'&&fr===0&&fc===7) c.bK=false;
  if(piece==='r'&&fr===0&&fc===0) c.bQ=false;
  return c;
}

// ── Legal moves (filtered for check) ─────────────────
function chessLegalMoves(board, row, col, castling, enPassant){
  const piece = board[row][col];
  if(!piece) return [];
  const color = chessPieceColor(piece);
  const opp   = chessOpponent(color);
  return chessRawMoves(board,row,col,castling,enPassant).filter(([tr,tc,sp])=>{
    // Castling: extra checks
    if(sp==='castle'){
      if(chessInCheck(board,color)) return false;
      const dir = tc>col?1:-1;
      const mid = chessApplyMove(board,row,col,row,col+dir,null);
      if(chessInCheck(mid,color)) return false;
    }
    const nb = chessApplyMove(board,row,col,tr,tc,sp,'Q');
    return !chessInCheck(nb,color);
  });
}

// ── Has any legal move? ───────────────────────────────
function chessHasAnyLegal(board, color, castling, enPassant){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    if(chessPieceColor(board[r][c])===color &&
       chessLegalMoves(board,r,c,castling,enPassant).length>0) return true;
  }
  return false;
}

// ── Game status ───────────────────────────────────────
// Returns: 'normal' | 'check' | 'checkmate' | 'stalemate'
function chessGameStatus(board, color, castling, enPassant){
  const inChk = chessInCheck(board,color);
  const hasL  = chessHasAnyLegal(board,color,castling,enPassant);
  if(inChk&&!hasL) return 'checkmate';
  if(!inChk&&!hasL) return 'stalemate';
  if(inChk) return 'check';
  return 'normal';
}

// ── Square notation ───────────────────────────────────
function chessSquareNote(row, col){ return String.fromCharCode(97+col)+(8-row); }

// ── Move notation (simplified algebraic) ─────────────
function chessMoveNote(piece, fr, fc, tr, tc, captured, special, promoteTo){
  const type = piece.toUpperCase();
  const to   = chessSquareNote(tr,tc);
  let note   = '';
  if(special==='castle') return tc===6?'O-O':'O-O-O';
  if(type==='P'){
    if(captured||special==='ep') note = String.fromCharCode(97+fc)+'x'+to;
    else note = to;
    if(special==='promote') note += '='+(promoteTo||'Q');
  } else {
    note = type+(captured?'x':'')+to;
  }
  return note;
}

// ══════════════════════════════════════════════════════
//  UI FUNCTIONS
// ══════════════════════════════════════════════════════

// ── Move sound (Web Audio API — no file needed) ───────
let _chessAudioCtx = null;
function _chessGetAudioCtx(){
  if(!_chessAudioCtx || _chessAudioCtx.state==='closed'){
    _chessAudioCtx = new (window.AudioContext||window.webkitAudioContext)();
  }
  if(_chessAudioCtx.state==='suspended') _chessAudioCtx.resume();
  return _chessAudioCtx;
}
function chessPlayMoveSound(isCapture){
  try {
    const ctx = _chessGetAudioCtx();
    const sr  = ctx.sampleRate;
    const dur = isCapture ? 0.10 : 0.07;          // capture slightly longer
    const buf = ctx.createBuffer(1, Math.ceil(sr*dur), sr);
    const data= buf.getChannelData(0);
    for(let i=0; i<data.length; i++){
      const t     = i/sr;
      const decay = Math.exp(-t * (isCapture ? 38 : 55)); // slower decay for capture
      data[i] = (Math.random()*2-1) * decay;
    }
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    // Bandpass: 900–1400 Hz gives a wood-on-wood "tock" character
    const bp   = ctx.createBiquadFilter();
    bp.type           = 'bandpass';
    bp.frequency.value= isCapture ? 900 : 1200;
    bp.Q.value        = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isCapture ? 0.75 : 0.55, ctx.currentTime);
    src.connect(bp); bp.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch(e){}
}

// ── Piece slide animation ─────────────────────────────
function chessAnimatePieceSlide(fr, fc, tr, tc){
  // Source square element (now empty after board re-render)
  const srcEl = document.querySelector(`#chessBoard [data-row="${fr}"][data-col="${fc}"]`);
  // Piece at target square (just rendered there)
  const trgPiece = document.querySelector(`#chessBoard [data-row="${tr}"][data-col="${tc}"] .chess-piece`);
  if(!srcEl || !trgPiece) return;
  const sr = srcEl.getBoundingClientRect();
  const tr2 = trgPiece.parentElement.getBoundingClientRect();
  const dx = sr.left - tr2.left;
  const dy = sr.top  - tr2.top;
  trgPiece.style.setProperty('--slide-x', dx + 'px');
  trgPiece.style.setProperty('--slide-y', dy + 'px');
  trgPiece.classList.add('chess-piece-slide');
  trgPiece.addEventListener('animationend', ()=>{
    trgPiece.classList.remove('chess-piece-slide');
    trgPiece.style.removeProperty('--slide-x');
    trgPiece.style.removeProperty('--slide-y');
  }, {once:true});
}

function _chessSquareFrame(){
  // Force the chess frame to be a perfect square (height = actual computed width).
  // Must run after layout — use requestAnimationFrame so the browser has laid
  // out the modal before we read offsetWidth.
  const frame = document.querySelector('.chess-frame');
  if(!frame) return;
  const sz = frame.offsetWidth;
  if(sz > 0) frame.style.height = sz + 'px';
}

function openChessModal(){
  document.getElementById('chessModal').classList.add('open');
  // Reset overlays from previous game
  const go = document.getElementById('chessGameOver');
  if(go){ go.style.display='none'; go.innerHTML=''; }
  const pr = document.getElementById('chessPromotion');
  if(pr){ pr.style.display='none'; pr.innerHTML=''; }
  // Set square frame after layout, then render board into correct dimensions
  requestAnimationFrame(() => {
    _chessSquareFrame();
    renderChessBoard();
    renderChessInfo();
  });
}

function closeChessModal(){
  document.getElementById('chessModal').classList.remove('open');
}

function chessPlayAgain(){
  // Hide game over overlay and reset game state
  const go = document.getElementById('chessGameOver');
  if(go){ go.style.display='none'; go.innerHTML=''; }
  chessGame = null;
  // Close modal then join queue
  document.getElementById('chessModal').classList.remove('open');
  if(typeof chessJoinQueue==='function') chessJoinQueue();
}

// ── Render full board ─────────────────────────────────
function renderChessBoard(){
  const boardEl = document.getElementById('chessBoard');
  if(!boardEl||!chessGame) return;
  const g = chessGame;
  const flip = g.myColor==='black'; // Flip board for black player

  boardEl.innerHTML = '';

  for(let displayRow=0;displayRow<8;displayRow++){
    for(let displayCol=0;displayCol<8;displayCol++){
      const row = flip ? 7-displayRow : displayRow;
      const col = flip ? 7-displayCol : displayCol;
      const piece = g.board[row][col];
      const isLight = (row+col)%2===0;

      const sq = document.createElement('div');
      sq.className = 'chess-sq '+(isLight?'chess-sq-light':'chess-sq-dark');
      sq.dataset.row = row;
      sq.dataset.col = col;

      // Highlights
      if(g.selected && g.selected[0]===row && g.selected[1]===col)
        sq.classList.add('chess-sq-selected');
      else if(g.lastMove && ((g.lastMove[0]===row&&g.lastMove[1]===col)||(g.lastMove[2]===row&&g.lastMove[3]===col)))
        sq.classList.add('chess-sq-lastmove');

      // Check highlight
      if(g.status==='check'||g.status==='checkmate'){
        const king = g.turn==='white'?'K':'k';
        if(piece===king) sq.classList.add('chess-sq-check');
      }

      // Valid move dot
      if(g.validMoves && g.validMoves.some(([mr,mc])=>mr===row&&mc===col)){
        sq.classList.add('chess-sq-valid');
        const dot = document.createElement('div');
        dot.className = piece?'chess-valid-ring':'chess-valid-dot';
        sq.appendChild(dot);
      }

      // Piece
      if(piece){
        const isW = chessIsWhite(piece);
        const color = isW?'w':'b';
        const typeMap = {P:'p',R:'r',N:'n',B:'b',Q:'q',K:'k'};
        const t = typeMap[piece.toUpperCase()]||'p';
        const img = document.createElement('img');
        img.src = `img/cp-${t}-${color}.png`;
        img.className = 'chess-piece';
        img.draggable = false;
        sq.appendChild(img);
      }


      sq.onclick = () => onChessSquareClick(row,col);
      boardEl.appendChild(sq);
    }
  }

  // CHOG CHESS watermark (behind pieces via z-index)
  const wm = document.createElement('div');
  wm.className = 'chess-watermark';
  wm.textContent = 'CHOG CHESS';
  boardEl.appendChild(wm);
}

// ── Player info bar ───────────────────────────────────
function renderChessInfo(){
  const g = chessGame;
  if(!g) return;
  const infoEl = document.getElementById('chessInfo');
  if(!infoEl) return;

  const wNick = (typeof getNick==='function'?getNick(g.whiteAddr):null)||chessShortAddr(g.whiteAddr);
  const bNick = (typeof getNick==='function'?getNick(g.blackAddr):null)||chessShortAddr(g.blackAddr);

  const turnColor = g.turn==='white'?'#f3f4f6':'#9333ea';
  const turnIcon  = g.turn==='white'?'♔':'♚';
  let statusText  = '';
  if(g.status==='check')     statusText = `<span style="color:#ef4444;font-weight:700;animation:chessCheckBlink .5s infinite">⚠️ CHECK!</span>`;
  else if(g.status==='checkmate') statusText = `<span style="color:#ef4444;font-weight:700">☠️ CHECKMATE!</span>`;
  else if(g.status==='stalemate') statusText = `<span style="color:var(--muted)">🤝 STALEMATE</span>`;
  else if(g.status==='resigned')  statusText = `<span style="color:var(--muted)">🏳️ RESIGNED</span>`;
  else statusText = `<span style="${g.turn==='white'?'color:#f3f4f6':'color:#c084fc'}">${turnIcon} ${g.turn.toUpperCase()}'s turn</span>`;

  const isMyTurn = wallet && wallet.addr.toLowerCase() ===
    (g.turn==='white'?g.whiteAddr:g.blackAddr).toLowerCase();
  const timerClass = isMyTurn ? 'chess-timer' : 'chess-timer chess-timer-inactive';

  infoEl.innerHTML = `
    <div class="chess-player ${g.myColor==='black'?'chess-me':''}" title="${g.blackAddr}">
      <span class="chess-player-icon">♚</span>
      <span class="chess-player-name">${bNick}</span>
      ${g.myColor==='black'?'<span class="chess-you-badge">YOU</span>':''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">
      <div class="chess-status-center">${statusText}</div>
      <div id="chessTimer" class="${timerClass}">--</div>
    </div>
    <div class="chess-player ${g.myColor==='white'?'chess-me':''}" title="${g.whiteAddr}">
      ${g.myColor==='white'?'<span class="chess-you-badge">YOU</span>':''}
      <span class="chess-player-name">${wNick}</span>
      <span class="chess-player-icon">♔</span>
    </div>
    <div style="display:flex;gap:2px;padding-left:6px;flex-shrink:0">
      <button class="modal-close" onclick="chessMinimize()" title="Minimize">▾</button>
      <button class="modal-close" onclick="closeChessModal()" title="Close">✕</button>
    </div>`;
}

// ── Square click handler ──────────────────────────────
function onChessSquareClick(row, col){
  const g = chessGame;
  if(!g) return;
  if(g.status==='checkmate'||g.status==='stalemate'||g.status==='resigned'||g.status==='draw') return;

  // Not my turn
  const isMyTurn = wallet && wallet.addr.toLowerCase() === (g.turn==='white'?g.whiteAddr:g.blackAddr).toLowerCase();
  if(!isMyTurn) return;

  const piece = g.board[row][col];

  // If something selected
  if(g.selected){
    const [sr,sc] = g.selected;
    const vm = g.validMoves||[];
    const move = vm.find(([mr,mc])=>mr===row&&mc===col);
    if(move){
      const [tr,tc,sp] = move;
      if(sp==='promote'){
        chessPending = {fr:sr,fc:sc,tr,tc,sp};
        showChessPromotion();
        return;
      }
      chessMakeMove(sr,sc,tr,tc,sp,null);
      return;
    }
    // Click on own piece → reselect
    if(piece && chessPieceColor(piece)===g.turn && !(sr===row&&sc===col)){
      chessSelectPiece(row,col);
      return;
    }
    // Deselect
    g.selected = null;
    g.validMoves = [];
    renderChessBoard();
    return;
  }

  // Select a piece
  if(piece && chessPieceColor(piece)===g.turn){
    chessSelectPiece(row,col);
  }
}

function chessSelectPiece(row, col){
  const g = chessGame;
  g.selected = [row,col];
  g.validMoves = chessLegalMoves(g.board,row,col,g.castling,g.enPassant);
  renderChessBoard();
}

// ── Execute a move ────────────────────────────────────
function chessMakeMove(fr, fc, tr, tc, special, promoteTo){
  const g = chessGame;
  const piece    = g.board[fr][fc];
  const captured = g.board[tr][tc] || (special==='ep'?'captured':'');

  // Apply to board
  const newBoard = chessApplyMove(g.board,fr,fc,tr,tc,special,promoteTo);

  // Update state
  g.castling  = chessUpdateCastling(g.castling,piece,fr,fc);
  g.enPassant = (piece.toUpperCase()==='P'&&Math.abs(tr-fr)===2)?[(fr+tr)/2,fc]:null;
  g.board     = newBoard;
  g.selected  = null;
  g.validMoves= [];
  g.lastMove  = [fr,fc,tr,tc];

  // Move notation
  const note = chessMoveNote(piece,fr,fc,tr,tc,captured,special,promoteTo);
  if(!g.moveHistory) g.moveHistory = [];
  g.moveHistory.push(note);

  // Switch turn
  g.turn = chessOpponent(g.turn);

  // Check status
  g.status = chessGameStatus(g.board,g.turn,g.castling,g.enPassant);

  // Re-render
  renderChessBoard();
  chessAnimatePieceSlide(fr, fc, tr, tc);
  chessPlayMoveSound(!!captured);
  renderChessInfo();

  // Animations
  if(g.status==='check') chessAnimCheck();
  if(g.status==='checkmate') setTimeout(()=>chessAnimCheckmate(chessOpponent(g.turn)),300);
  if(g.status==='stalemate') setTimeout(()=>chessShowResult('🤝','Stalemate!','Draw — well played both!','draw'),300);
  if(captured) chessAnimCapture();

  // Reset timeout counter on successful move, restart timer
  _chessTimeouts = 0;
  if(g.status==='normal'||g.status==='check') chessStartTurnTimer();
  else chessClearTurnTimer();

  // Update pip if minimized
  _chessPipUpdateTurn();

  // Sync to Supabase
  if(typeof chessSyncMove==='function') chessSyncMove(g);

  // Award points if game over
  if(g.status==='checkmate'||g.status==='stalemate'){
    const winner = g.status==='checkmate'?chessOpponent(g.turn):null;
    if(typeof chessAwardPoints==='function') chessAwardPoints(winner,g);
  }
}

// ── Promotion dialog ──────────────────────────────────
function showChessPromotion(){
  const el = document.getElementById('chessPromotion');
  if(!el) return;
  const color = chessGame?chessGame.turn:'white';
  const pieces = color==='white'?['Q','R','B','N']:['q','r','b','n'];
  const colorSuffix = color==='white'?'w':'b';
  const typeMap = {Q:'q',R:'r',B:'b',N:'n'};
  const NAMES = {Q:'Queen',R:'Rook',B:'Bishop',N:'Knight'};
  el.innerHTML = `
    <div class="chess-promo-bg" onclick="closeChessPromotion()"></div>
    <div class="chess-promo-box">
      <div style="font-family:'Bangers',cursive;font-size:18px;color:var(--accent);margin-bottom:10px">Promote Pawn!</div>
      <div style="display:flex;gap:8px">
        ${pieces.map(p=>`
          <button class="chess-promo-btn" onclick="chessFinishPromotion('${p}')">
            <img src="img/cp-${typeMap[p.toUpperCase()]}-${colorSuffix}.png" style="width:48px;height:48px;object-fit:contain">
            <span style="font-size:10px;color:var(--muted)">${NAMES[p.toUpperCase()]}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
  el.style.display='flex';
}

function closeChessPromotion(){
  const el=document.getElementById('chessPromotion');
  if(el) el.style.display='none';
  chessPending=null;
}

function chessFinishPromotion(promoteTo){
  closeChessPromotion();
  if(!chessPending) return;
  const {fr,fc,tr,tc,sp} = chessPending;
  chessPending = null;
  chessMakeMove(fr,fc,tr,tc,sp,promoteTo.toUpperCase());
}

// ── Short address ─────────────────────────────────────
function chessShortAddr(addr){
  if(!addr||addr.length<10) return addr||'???';
  return addr.slice(0,6)+'…'+addr.slice(-4);
}

// ── Start/init game ───────────────────────────────────
function chessStartGame(matchId, whiteAddr, blackAddr, myColor, existingState){
  // whiteAddr/blackAddr are always set regardless of existingState
  // (existingState comes from game_state JSONB which doesn't include these)
  chessGame = {
    ...(existingState || {
      board:      chessInitBoard(),
      turn:       'white',
      castling:   {wK:true,wQ:true,bK:true,bQ:true},
      enPassant:  null,
      status:     'normal',
      lastMove:   null,
      moveHistory:[],
      winner:     null,
    }),
    matchId,
    myColor,
    whiteAddr:  whiteAddr.toLowerCase(),
    blackAddr:  blackAddr.toLowerCase(),
    selected:   null,
    validMoves: [],
  };
  _chessTimeouts = 0;
  openChessModal();
  if(typeof _subscribeToChessMatch==='function') _subscribeToChessMatch(matchId);
  chessStartTurnTimer();
}

// ── Resign ────────────────────────────────────────────
function chessResign(){
  if(!chessGame||!wallet) return;
  if(!confirm('Resign this game? You will lose the match.')) return;
  const winner = chessGame.whiteAddr===wallet.addr.toLowerCase()?'black':'white';
  chessGame.status = 'resigned';
  chessGame.winner = winner;
  chessShowResult('🏳️','You Resigned',`${winner.toUpperCase()} wins!`,'resigned');
  if(typeof chessSyncResign==='function') chessSyncResign(chessGame);
  if(typeof chessAwardPoints==='function') chessAwardPoints(winner,chessGame);
}

// ── Game over result overlay ──────────────────────────
function chessShowResult(emoji, title, sub, type){
  const el = document.getElementById('chessGameOver');
  if(!el) return;
  const myColor = chessGame?chessGame.myColor:null;
  const winner  = chessGame?chessGame.winner:null;
  const iWon    = myColor===winner;

  el.innerHTML = `
    <div class="chess-gameover-box ${iWon?'chess-gameover-win':'chess-gameover-lose'}">
      <div class="chess-gameover-emoji">${iWon?'👑':'💀'}</div>
      <div class="chess-gameover-title">${iWon?'GG EZ! 🎉':'NGMI 😭'}</div>
      <div class="chess-gameover-sub">${title} — ${sub}</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="chess-btn" style="background:linear-gradient(135deg,rgba(139,92,246,.35),rgba(192,132,252,.25));border-color:rgba(192,132,252,.5);color:var(--accent)"
          onclick="chessPlayAgain()">♟️ Play Again</button>
        <button class="chess-btn" onclick="closeChessModal();chessGame=null;">Close</button>
      </div>
    </div>`;
  el.style.display='flex';
}

// ── Animations ────────────────────────────────────────
function chessAnimCheck(){
  const board = document.getElementById('chessBoard');
  if(!board) return;
  board.classList.add('chess-anim-check');
  setTimeout(()=>board.classList.remove('chess-anim-check'),800);
  chessSpawnFloater('⚠️ CHECK!','#ef4444');
}

function chessAnimCheckmate(winner){
  chessGame.winner = winner;
  chessShowResult('☠️','Checkmate!',`${winner.toUpperCase()} wins!`,'checkmate');
  // Meme confetti
  for(let i=0;i<18;i++) setTimeout(()=>chessSpawnConfetti(),i*80);
}

function chessAnimCapture(){
  chessSpawnFloater('💥','#fb923c');
}

function chessSpawnFloater(text, color){
  const board = document.getElementById('chessBoard');
  if(!board) return;
  const el = document.createElement('div');
  el.className = 'chess-floater';
  el.textContent = text;
  el.style.cssText = `color:${color||'var(--accent)'};left:${20+Math.random()*60}%;top:${10+Math.random()*40}%`;
  board.parentElement.appendChild(el);
  setTimeout(()=>el.remove(),1200);
}

function chessSpawnConfetti(){
  const memes = ['🟣','🎉','👑','🐸','🚀','💜','🫡','🎊','✨'];
  const el = document.createElement('div');
  el.className = 'chess-confetti';
  el.textContent = memes[Math.floor(Math.random()*memes.length)];
  el.style.cssText = `left:${Math.random()*100}%;animation-duration:${0.8+Math.random()*0.8}s;font-size:${18+Math.random()*16}px`;
  const container = document.getElementById('chessModal');
  if(!container) return;
  container.appendChild(el);
  setTimeout(()=>el.remove(),1600);
}

// ── Receive opponent move (from Supabase) ─────────────
function chessApplyOpponentMove(state){
  if(!chessGame) return;
  const prevLastMove = chessGame.lastMove; // capture before overwrite
  // Update game from server state
  chessGame.board       = state.board;
  chessGame.turn        = state.turn;
  chessGame.castling    = state.castling;
  chessGame.enPassant   = state.enPassant;
  chessGame.status      = state.status;
  chessGame.lastMove    = state.lastMove;
  chessGame.moveHistory = state.moveHistory;
  chessGame.winner      = state.winner||null;

  renderChessBoard();
  if(state.lastMove) chessAnimatePieceSlide(...state.lastMove);
  if(state.lastMove) chessPlayMoveSound(false);
  renderChessInfo();

  if(chessGame.status==='check') chessAnimCheck();
  if(chessGame.status==='checkmate') setTimeout(()=>chessAnimCheckmate(chessOpponent(chessGame.turn)),300);
  if(chessGame.status==='stalemate') setTimeout(()=>chessShowResult('🤝','Stalemate!','Draw — well played both!','draw'),300);
  if(chessGame.status==='resigned'){
    const winner = chessGame.winner;
    chessClearTurnTimer();
    chessShowResult('🏳️','Opponent Resigned',`${winner?winner.toUpperCase():''} wins!`,'resigned');
    if(typeof chessAwardPoints==='function') chessAwardPoints(winner,chessGame);
    return;
  }

  // Opponent moved → restart timer for our turn
  _chessTimeouts = 0;
  if(chessGame.status==='normal'||chessGame.status==='check') chessStartTurnTimer();
  else chessClearTurnTimer();

  // Update pip
  _chessPipUpdateTurn();
  if(_chessPipActive) chessRestore(); // Auto-restore pip if opponent moved
}

// ══════════════════════════════════════════════════════
//  ⏱️ TURN TIMER
// ══════════════════════════════════════════════════════

function chessStartTurnTimer(){
  chessClearTurnTimer();
  _chessTimeLeft = CHESS_TURN_SECS;
  _chessUpdateTimerUI();

  _chessTurnTimer = setInterval(()=>{
    _chessTimeLeft--;
    _chessUpdateTimerUI();
    if(_chessTimeLeft <= 0){
      chessClearTurnTimer();
      _chessHandleTimeout();
    }
  }, 1000);
}

function chessClearTurnTimer(){
  if(_chessTurnTimer){ clearInterval(_chessTurnTimer); _chessTurnTimer=null; }
}

function _chessUpdateTimerUI(){
  const t = _chessTimeLeft;
  const mmss = (Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));
  // Main modal timer
  const el = document.getElementById('chessTimer');
  if(el){
    el.textContent = mmss;
    el.className = 'chess-timer';
    if(t <= 15) el.classList.add('chess-timer-danger');
    else if(t <= 30) el.classList.add('chess-timer-warn');
  }
  // Mini pip timer
  const pip = document.getElementById('chessPipTimer');
  if(pip){
    pip.textContent = mmss;
    pip.className = 'chess-pip-timer';
    if(t <= 15) pip.classList.add('danger');
    else if(t <= 30) pip.classList.add('warn');
  }
}

function _chessHandleTimeout(){
  if(!chessGame) return;
  // Only handle timeout if it's YOUR turn
  const myAddr = wallet ? wallet.addr.toLowerCase() : null;
  const turnAddr = chessGame.turn==='white' ? chessGame.whiteAddr : chessGame.blackAddr;
  if(!myAddr || myAddr !== turnAddr) return;

  _chessTimeouts++;
  if(_chessTimeouts >= CHESS_MAX_TIMEOUTS){
    // Auto-forfeit by timeout
    _chessTimeouts = 0;
    const winner = chessOpponent(chessGame.myColor);
    chessGame.status = 'resigned';
    chessGame.winner = winner;
    chessShowResult('⏰','Time\'s Up!',`You ran out of time — ${winner.toUpperCase()} wins!`,'resigned');
    if(typeof chessSyncResign==='function') chessSyncResign(chessGame);
    if(typeof chessAwardPoints==='function') chessAwardPoints(winner, chessGame);
  } else {
    // Warning: restart with same limit
    chessSpawnFloater('⏰ TIME WARNING!','#f59e0b');
    _chessTimeLeft = CHESS_TURN_SECS;
    chessStartTurnTimer();
  }
}

// ══════════════════════════════════════════════════════
//  🪟 MINI PIP (minimize / restore)
// ══════════════════════════════════════════════════════

function chessOverlayClick(e){
  // Click on the overlay (outside the modal card) → minimize if game active
  if(chessGame && (chessGame.status==='normal'||chessGame.status==='check')){
    chessMinimize();
  } else {
    closeChessModal();
  }
}

function chessMinimize(){
  const modal = document.getElementById('chessModal');
  if(modal) modal.classList.remove('open');
  const pip = document.getElementById('chessPip');
  if(pip) pip.classList.add('active');
  _chessPipActive = true;
  _chessPipUpdateTurn();
}

function chessRestore(){
  const pip = document.getElementById('chessPip');
  if(pip) pip.classList.remove('active');
  _chessPipActive = false;
  const modal = document.getElementById('chessModal');
  if(modal) modal.classList.add('open');
  requestAnimationFrame(() => {
    _chessSquareFrame();
    renderChessBoard();
    renderChessInfo();
  });
}

// Keep frame square on orientation change / resize
window.addEventListener('resize', () => {
  if(document.getElementById('chessModal')?.classList.contains('open')){
    _chessSquareFrame();
  }
});

function _chessPipUpdateTurn(){
  if(!chessGame) return;
  const pip = document.getElementById('chessPipTurn');
  if(!pip) return;
  const isMyTurn = wallet && wallet.addr.toLowerCase() ===
    (chessGame.turn==='white'?chessGame.whiteAddr:chessGame.blackAddr).toLowerCase();
  pip.textContent = isMyTurn ? 'YOUR TURN' : 'WAITING...';
  pip.style.color = isMyTurn ? '#4ade80' : 'rgba(192,132,252,0.6)';
}
