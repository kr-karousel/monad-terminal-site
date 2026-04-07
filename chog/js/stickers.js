// ═══════════════════════════════════════
//  DISCORD / TELEGRAM STICKER PICKER
//  Chog 스티커 — Telegram Bot API로 동적 로드
// ═══════════════════════════════════════

const STICKER_SET_NAME = 'ChogStikers';

// 로드된 스티커 목록 (file_id, emoji, ext, file_path)
var _loadedStickers = [];

// ── Telegram 스티커 팩 로드 ──────────────────────────────
async function loadTelegramStickers(){
  try {
    const res  = await fetch(`/api/telegram-stickers?set=${STICKER_SET_NAME}`);
    const data = await res.json();
    if(!data.ok || !data.stickers) return;
    _loadedStickers = data.stickers;
    _buildStickerGrid();
  } catch(e){
    console.warn('[Stickers] 로드 실패:', e.message);
  }
}

// ── 스티커 이미지 URL ─────────────────────────────────────
// WebP(static) → <img> 바로 표시
// TGS(animated lottie) → 지원 X, emoji fallback
// WEBM(video) → <video> 태그로 처리
function getStickerImgUrl(s){
  if(!s.file_path) return null;
  return `/api/telegram-file?path=${encodeURIComponent(s.file_path)}`;
}

// ── 스티커 그리드 생성 ───────────────────────────────────
function _buildStickerGrid(){
  const picker = document.getElementById('stickerPicker');
  if(!picker) return;
  const grid = picker.querySelector('.sticker-grid');
  if(!grid) return;
  grid.innerHTML = '';

  if(!_loadedStickers.length){
    grid.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:10px;grid-column:span 4">스티커를 불러오지 못했어요 😢</div>';
    return;
  }

  _loadedStickers.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sticker-item';
    item.title = s.emoji || '🟣';

    if(s.is_video && s.file_path){
      // WebM 비디오 스티커
      const vid = document.createElement('video');
      vid.src = getStickerImgUrl(s);
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.style.cssText = 'width:100%;height:100%;object-fit:contain';
      item.appendChild(vid);
    } else if(s.is_animated || s.ext === 'tgs'){
      // TGS (Lottie) 스티커 → emoji fallback
      item.textContent = s.emoji || '🟣';
      item.style.cssText += ';font-size:24px;display:flex;align-items:center;justify-content:center';
    } else {
      // WebP 정적/애니메이션 스티커
      const img = document.createElement('img');
      img.loading = 'lazy';
      const url = getStickerImgUrl(s);
      if(url) img.src = url;
      img.alt = s.emoji || '🟣';
      img.onerror = function(){
        this.parentElement.textContent = s.emoji || '🟣';
        this.parentElement.style.cssText += ';font-size:24px;display:flex;align-items:center;justify-content:center';
      };
      item.appendChild(img);
    }

    item.onclick = () => sendSticker(s);
    grid.appendChild(item);
  });
}

// ── 피커 초기화 ──────────────────────────────────────────
function initStickerPicker(){
  loadTelegramStickers();
}

// ── 피커 토글 ────────────────────────────────────────────
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
  if(!picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)){
    picker.classList.remove('open');
  } else if(picker.classList.contains('open')){
    setTimeout(() => {
      document.addEventListener('click', _closeStickerOnOutside, { once: true });
    }, 0);
  }
}

// ── 스티커 전송 ──────────────────────────────────────────
// 메시지 포맷: [sticker:FILE_UNIQUE_ID:EMOJI:EXT:FILE_PATH]
function sendSticker(s){
  if(!wallet) return;
  const picker = document.getElementById('stickerPicker');
  if(picker) picker.classList.remove('open');

  const filePath = s.file_path || '';
  const msg = `[sticker:${s.file_unique_id}:${s.emoji||'🟣'}:${s.ext||'webp'}:${filePath}]`;

  if(typeof isSyncEnabled === 'function' && isSyncEnabled()){
    const nick = typeof getNick === 'function' ? getNick(wallet.addr) : null;
    syncMessageToServer(wallet.addr, nick, msg, wallet.bal);
  } else {
    renderMsg({ addr: wallet.addr, addrFull: wallet.addr, bal: wallet.bal, msg, time: nowTime() });
  }
  if(typeof trackChatPoint === 'function') trackChatPoint();
}

document.addEventListener('DOMContentLoaded', initStickerPicker);
