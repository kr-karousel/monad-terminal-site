// ═══════════════════════════════════════
//  CHOG STICKER PICKER — Telegram 연동
// ═══════════════════════════════════════

const STICKER_SET_NAME = 'ChogStikers';
const STICKERS_PER_PAGE = 6; // 3열 × 2행

var _loadedStickers = [];
var _currentPage    = 0;
var _stickerState   = 'idle'; // idle | loading | loaded | error

// ── 스티커 팩 로드 ────────────────────────────────────────
async function loadTelegramStickers(){
  if(_stickerState === 'loading') return;
  _stickerState = 'loading';

  const grid = document.querySelector('#stickerPicker .sticker-grid');
  if(!grid) { _stickerState = 'idle'; return; }
  grid.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;grid-column:span 3;text-align:center">Loading...</div>';

  try {
    const res  = await fetch('/api/telegram-stickers?set=' + STICKER_SET_NAME);
    const data = await res.json();

    if(!data.ok || !data.stickers || !data.stickers.length){
      _stickerState = 'error';
      grid.innerHTML = '<div style="color:#f87171;font-size:11px;padding:12px;grid-column:span 3;text-align:center">Failed to load stickers<br><span style="opacity:.7">' + (data.error||'No stickers found') + '</span><br><button onclick="loadTelegramStickers()" style="margin-top:8px;padding:4px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--muted);font-size:10px;cursor:pointer">Retry</button></div>';
      return;
    }

    _loadedStickers = data.stickers;
    _currentPage    = 0;
    _stickerState   = 'loaded';
    _renderPage();
  } catch(e){
    _stickerState = 'error';
    const grid2 = document.querySelector('#stickerPicker .sticker-grid');
    if(grid2) grid2.innerHTML = '<div style="color:#f87171;font-size:11px;padding:12px;grid-column:span 3;text-align:center">Error: ' + e.message + '<br><button onclick="loadTelegramStickers()" style="margin-top:8px;padding:4px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--muted);font-size:10px;cursor:pointer">Retry</button></div>';
  }
}

// ── 현재 페이지 렌더 ──────────────────────────────────────
function _renderPage(){
  const grid = document.querySelector('#stickerPicker .sticker-grid');
  if(!grid) return;
  grid.innerHTML = '';

  const totalPages = Math.ceil(_loadedStickers.length / STICKERS_PER_PAGE);
  const start = _currentPage * STICKERS_PER_PAGE;
  const pageStickers = _loadedStickers.slice(start, start + STICKERS_PER_PAGE);

  pageStickers.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sticker-item';
    item.title = s.emoji || '🟣';
    item.onclick = () => sendSticker(s);

    if(s.is_animated || s.ext === 'tgs'){
      item.textContent = s.emoji || '🟣';
      item.style.cssText += ';font-size:28px;display:flex;align-items:center;justify-content:center';
    } else if(s.is_video){
      const vid = document.createElement('video');
      vid.src = '/api/telegram-file?id=' + encodeURIComponent(s.file_id);
      vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.style.cssText = 'width:100%;height:100%;object-fit:contain';
      item.appendChild(vid);
    } else {
      const img = document.createElement('img');
      img.src = '/api/telegram-file?id=' + encodeURIComponent(s.file_id);
      img.alt = s.emoji || '🟣';
      img.loading = 'lazy';
      img.onerror = function(){
        item.textContent = s.emoji || '🟣';
        item.style.cssText += ';font-size:28px;display:flex;align-items:center;justify-content:center';
      };
      item.appendChild(img);
    }

    grid.appendChild(item);
  });

  // 페이지 네비 업데이트
  const info = document.getElementById('stickerPageInfo');
  const prev = document.getElementById('stickerPrevBtn');
  const next = document.getElementById('stickerNextBtn');
  if(info) info.textContent = (_currentPage + 1) + ' / ' + totalPages;
  if(prev) prev.disabled = _currentPage === 0;
  if(next) next.disabled = _currentPage >= totalPages - 1;
}

function stickerPagePrev(){
  if(_currentPage > 0){ _currentPage--; _renderPage(); }
}
function stickerPageNext(){
  const totalPages = Math.ceil(_loadedStickers.length / STICKERS_PER_PAGE);
  if(_currentPage < totalPages - 1){ _currentPage++; _renderPage(); }
}

// ── 피커 토글 ─────────────────────────────────────────────
function toggleStickerPicker(){
  const picker = document.getElementById('stickerPicker');
  if(!picker) return;
  if(picker.classList.contains('open')){
    picker.classList.remove('open');
  } else {
    picker.classList.add('open');
    // lazy load: fetch on first open (or retry after error)
    if(_stickerState === 'idle' || _stickerState === 'error'){
      loadTelegramStickers();
    }
    setTimeout(() => {
      document.addEventListener('click', _closeStickerOnOutside, { once: true });
    }, 0);
  }
}

function _closeStickerOnOutside(e){
  const picker = document.getElementById('stickerPicker');
  const btn    = document.getElementById('stickerBtn');
  if(!picker) return;
  if(!picker.contains(e.target) && !btn.contains(e.target)){
    picker.classList.remove('open');
  } else if(picker.classList.contains('open')){
    setTimeout(() => {
      document.addEventListener('click', _closeStickerOnOutside, { once: true });
    }, 0);
  }
}

// ── 스티커 전송 ───────────────────────────────────────────
function sendSticker(s){
  if(!wallet) return;
  const picker = document.getElementById('stickerPicker');
  if(picker) picker.classList.remove('open');

  const msg = '[sticker:' + s.file_unique_id + ':' + (s.emoji||'🟣') + ':' + (s.ext||'webp') + ':' + s.file_id + ']';

  if(typeof isSyncEnabled === 'function' && isSyncEnabled()){
    const nick = typeof getNick === 'function' ? getNick(wallet.addr) : null;
    syncMessageToServer(wallet.addr, nick, msg, wallet.bal);
  } else {
    renderMsg({ addr: wallet.addr, addrFull: wallet.addr, bal: wallet.bal, msg, time: nowTime() });
  }
  if(typeof trackChatPoint === 'function') trackChatPoint();
}
