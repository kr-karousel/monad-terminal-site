// ═══════════════════════════════════════
//  DISCORD STICKER PICKER
//  Chog 스티커 데이터 + 채팅 스티커 전송
// ═══════════════════════════════════════

// ── 스티커 데이터 ───────────────────────────────────────────
// Discord에서 스티커 ID 얻는 법:
//   1. Discord 채팅창에서 스티커를 우클릭
//   2. "미디어 링크 복사" 클릭
//   3. URL 예시: https://cdn.discordapp.com/stickers/1234567890123456789.gif
//   4. 숫자 부분이 id → id 필드에 입력
//
// 애니메이션 스티커: .gif / 정적: .png 또는 .apng
// ──────────────────────────────────────────────────────────
const CHOG_STICKERS = [
  { id: '1370060989297135716', name: 'chog stare',     ext: 'gif' },
  { id: '1370060989297135717', name: 'chog cry',       ext: 'gif' },
  { id: '1370060989297135718', name: 'boiling chog',   ext: 'gif' },
  { id: '1370060989297135719', name: 'chog hype',      ext: 'gif' },
  { id: '1370060989297135720', name: 'chog rip',       ext: 'gif' },
  { id: '1370060989297135721', name: 'chog love',      ext: 'gif' },
  { id: '1370060989297135722', name: 'chog wave',      ext: 'gif' },
  { id: '1370060989297135723', name: 'chog rage',      ext: 'gif' },
  { id: '1370060989297135724', name: 'chog sleep',     ext: 'gif' },
  { id: '1370060989297135725', name: 'chog think',     ext: 'gif' },
  { id: '1370060989297135726', name: 'chog moon',      ext: 'gif' },
  { id: '1370060989297135727', name: 'chog ded',       ext: 'gif' },
];

function getStickerUrl(sticker){
  return `https://cdn.discordapp.com/stickers/${sticker.id}.${sticker.ext}`;
}

// ── 스티커 피커 초기화 ───────────────────────────────────────
function initStickerPicker(){
  const picker = document.getElementById('stickerPicker');
  if(!picker) return;
  const grid = picker.querySelector('.sticker-grid');
  if(!grid) return;

  CHOG_STICKERS.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sticker-item';
    item.title = s.name;
    item.onclick = () => sendSticker(s);
    const img = document.createElement('img');
    img.src = getStickerUrl(s);
    img.alt = s.name;
    img.loading = 'lazy';
    img.onerror = function(){ this.style.display='none'; item.textContent='🟣'; item.style.fontSize='24px'; item.style.display='flex'; item.style.alignItems='center'; item.style.justifyContent='center'; };
    item.appendChild(img);
    grid.appendChild(item);
  });
}

// ── 피커 토글 ────────────────────────────────────────────────
function toggleStickerPicker(){
  const picker = document.getElementById('stickerPicker');
  if(!picker) return;
  if(picker.classList.contains('open')){
    picker.classList.remove('open');
  } else {
    picker.classList.add('open');
    // 바깥 클릭 시 닫기
    setTimeout(() => {
      document.addEventListener('click', _closeStickerOnOutside, { once: true });
    }, 0);
  }
}

function _closeStickerOnOutside(e){
  const picker = document.getElementById('stickerPicker');
  const btn    = document.getElementById('stickerBtn');
  if(!picker) return;
  if(!picker.contains(e.target) && e.target !== btn){
    picker.classList.remove('open');
  } else {
    // 아직 열려있으면 다시 리스너 등록
    if(picker.classList.contains('open')){
      setTimeout(() => {
        document.addEventListener('click', _closeStickerOnOutside, { once: true });
      }, 0);
    }
  }
}

// ── 스티커 전송 ──────────────────────────────────────────────
function sendSticker(sticker){
  if(!wallet) return;
  // 피커 닫기
  const picker = document.getElementById('stickerPicker');
  if(picker) picker.classList.remove('open');

  // 메시지 포맷: [sticker:ID:NAME]
  const msg = `[sticker:${sticker.id}:${sticker.name}]`;

  if(typeof isSyncEnabled === 'function' && isSyncEnabled()){
    const nick = typeof getNick === 'function' ? getNick(wallet.addr) : null;
    syncMessageToServer(wallet.addr, nick, msg, wallet.bal);
  } else {
    renderMsg({ addr: wallet.addr, addrFull: wallet.addr, bal: wallet.bal, msg, time: nowTime() });
  }
  if(typeof trackChatPoint === 'function') trackChatPoint();
}

// ── DOMContentLoaded 후 초기화 ─────────────────────────────
document.addEventListener('DOMContentLoaded', initStickerPicker);
