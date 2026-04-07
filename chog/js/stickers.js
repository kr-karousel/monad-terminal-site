// ═══════════════════════════════════════
//  CHOG STICKER PICKER — Telegram 연동
// ═══════════════════════════════════════

const STICKER_SET_NAME = 'ChogStikers';
var _loadedStickers = [];

// ── 스티커 팩 로드 ────────────────────────────────────────
async function loadTelegramStickers(){
  const grid = document.querySelector('#stickerPicker .sticker-grid');
  if(!grid) return;
  grid.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;grid-column:span 4;text-align:center">Loading...</div>';

  try {
    const res  = await fetch('/api/telegram-stickers?set=' + STICKER_SET_NAME);
    const data = await res.json();

    if(!data.ok || !data.stickers || !data.stickers.length){
      const errMsg = data.error || 'No stickers found';
      grid.innerHTML = '<div style="color:#f87171;font-size:11px;padding:12px;grid-column:span 4;text-align:center">Failed to load stickers<br><span style="opacity:.7">' + errMsg + '</span></div>';
      return;
    }

    _loadedStickers = data.stickers;
    _buildStickerGrid(grid);
  } catch(e){
    console.warn('[Stickers] load failed:', e.message);
    grid.innerHTML = '<div style="color:#f87171;font-size:11px;padding:12px;grid-column:span 4;text-align:center">Error: ' + e.message + '</div>';
  }
}

// ── 스티커 그리드 생성 ────────────────────────────────────
function _buildStickerGrid(grid){
  grid.innerHTML = '';
  _loadedStickers.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sticker-item';
    item.title = s.emoji || '🟣';
    item.onclick = () => sendSticker(s);

    if(s.is_animated || s.ext === 'tgs'){
      // TGS(Lottie) → emoji fallback
      item.textContent = s.emoji || '🟣';
      item.style.cssText += ';font-size:24px;display:flex;align-items:center;justify-content:center';
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
        item.style.cssText += ';font-size:24px;display:flex;align-items:center;justify-content:center';
      };
      item.appendChild(img);
    }

    grid.appendChild(item);
  });
}

// ── 피커 토글 ─────────────────────────────────────────────
function toggleStickerPicker(){
  const picker = document.getElementById('stickerPicker');
  if(!picker) return;
  if(picker.classList.contains('open')){
    picker.classList.remove('open');
  } else {
    picker.classList.add('open');
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
// 포맷: [sticker:FILE_UNIQUE_ID:EMOJI:EXT:FILE_ID]
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

// ── 초기화 ────────────────────────────────────────────────
function initStickerPicker(){
  loadTelegramStickers();
}

document.addEventListener('DOMContentLoaded', initStickerPicker);
