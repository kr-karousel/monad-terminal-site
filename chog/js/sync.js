// ═══════════════════════════════════════
//  SUPABASE 실시간 동기화
//  닉네임 / 외치기(Shout)를 전 브라우저에 실시간 동기화
// ═══════════════════════════════════════
//
// [최초 설정 방법 — 사이트 소유자 전용]
// 1. https://supabase.com 에서 무료 프로젝트 생성
// 2. SQL Editor에서 아래 스키마 실행:
//
//   CREATE TABLE nicknames (
//     address TEXT PRIMARY KEY,
//     nickname TEXT NOT NULL,
//     updated_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE nicknames ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public read"  ON nicknames FOR SELECT USING (true);
//   CREATE POLICY "public write" ON nicknames FOR ALL    USING (true) WITH CHECK (true);
//
//   CREATE TABLE shouts (
//     id         BIGSERIAL PRIMARY KEY,
//     address    TEXT NOT NULL,
//     nickname   TEXT,
//     message    TEXT NOT NULL,
//     created_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE shouts ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public read"   ON shouts FOR SELECT USING (true);
//   CREATE POLICY "public insert" ON shouts FOR INSERT WITH CHECK (true);
//
//   -- Realtime 활성화 (Supabase 대시보드 → Database → Replication → shouts, nicknames 체크)
//
// 3. Project Settings → API → URL 과 anon public key 복사
// 4. config.js 상단의 SUPABASE_URL / SUPABASE_ANON_KEY 에 입력
// ═══════════════════════════════════════

var _sbClient = null;

function initSync(){
  if(typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) return;
  if(typeof window.supabase === 'undefined'){
    console.warn('[Sync] Supabase SDK not loaded');
    return;
  }
  try{
    _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Sync] Supabase 연결됨');
    _syncNicknamesFromServer();
    _syncShoutsFromServer();
    _subscribeToNicknames();
    _subscribeToShouts();
  }catch(e){
    console.warn('[Sync] 초기화 실패:', e.message);
    _sbClient = null;
  }
}

function isSyncEnabled(){ return !!_sbClient; }

// ── 닉네임 ─────────────────────────────────────────────

async function _syncNicknamesFromServer(){
  if(!_sbClient) return;
  try{
    const { data } = await _sbClient.from('nicknames').select('address, nickname');
    if(!data) return;
    data.forEach(row => {
      if(row.address && row.nickname)
        nickDB[row.address.toLowerCase()] = row.nickname;
    });
    if(wallet && typeof updateWalletDisplay === 'function') updateWalletDisplay();
  }catch(e){ console.warn('[Sync] 닉네임 로드 실패:', e.message); }
}

function _subscribeToNicknames(){
  if(!_sbClient) return;
  _sbClient.channel('sync-nicknames')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'nicknames' },
      payload => {
        const row = payload.new;
        if(!row || !row.address || !row.nickname) return;
        nickDB[row.address.toLowerCase()] = row.nickname;
        // 내 지갑이면 UI 업데이트
        if(wallet && wallet.addr.toLowerCase() === row.address.toLowerCase())
          if(typeof updateWalletDisplay === 'function') updateWalletDisplay();
      }
    )
    .subscribe();
}

async function syncNickToServer(address, nickname){
  if(!_sbClient) return;
  try{
    await _sbClient.from('nicknames').upsert(
      { address: address.toLowerCase(), nickname, updated_at: new Date().toISOString() },
      { onConflict: 'address' }
    );
  }catch(e){ console.warn('[Sync] 닉네임 저장 실패:', e.message); }
}

// ── 외치기(Shout) ───────────────────────────────────────

async function _syncShoutsFromServer(){
  if(!_sbClient) return;
  try{
    const { data } = await _sbClient
      .from('shouts')
      .select('id, address, nickname, message, created_at')
      .order('created_at', { ascending: false })
      .limit(SHOUT_MAX_SLOTS);
    if(!data || !data.length) return;

    // 오래된 순으로 정렬 (맨 아래가 최신)
    const sorted = data.slice().reverse();
    pinnedShouts = [];
    const c = document.getElementById('shoutPinned');
    if(c) c.innerHTML = '';
    sorted.forEach(row => {
      const entry = { addr: row.nickname || row.address, msg: row.message, id: row.id };
      pinnedShouts.push(entry);
      if(c) _renderPinnedShout(c, entry);
    });
  }catch(e){ console.warn('[Sync] 외치기 로드 실패:', e.message); }
}

function _subscribeToShouts(){
  if(!_sbClient) return;
  _sbClient.channel('sync-shouts')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'shouts' },
      payload => {
        const row = payload.new;
        if(!row) return;
        const entry = { addr: row.nickname || row.address, msg: row.message, id: row.id };
        const isMyShout = wallet && wallet.addr.toLowerCase() === row.address.toLowerCase();

        // 모든 브라우저: 핀 추가
        _addPinnedShoutLocal(entry);

        // 다른 사람 외치기만: 팝업 + 채팅 메시지
        if(!isMyShout){
          showShoutPopup(entry.addr, entry.msg);
          renderMsg({
            addr: row.address,
            addrFull: row.address,
            bal: 0,
            msg: '📢 [SHOUT] ' + entry.msg,
            time: nowTime()
          });
        }
      }
    )
    .subscribe();
}

async function syncShoutToServer(address, nickname, message){
  if(!_sbClient) return;
  try{
    await _sbClient.from('shouts').insert({ address: address.toLowerCase(), nickname, message });
  }catch(e){ console.warn('[Sync] 외치기 저장 실패:', e.message); }
}

// 핀에만 추가 (서버·localStorage 저장 없음 — 구독 이벤트용)
function _addPinnedShoutLocal(entry){
  const c = document.getElementById('shoutPinned');
  if(!c) return;
  // 중복 방지
  if(pinnedShouts.find(s => s.id === entry.id)) return;
  if(pinnedShouts.length >= SHOUT_MAX_SLOTS){
    const oldest = pinnedShouts.shift();
    const oldEl = c.querySelector('[data-id="' + oldest.id + '"]');
    if(oldEl){ oldEl.classList.add('pin-fadeout'); setTimeout(() => oldEl.remove(), 500); }
  }
  pinnedShouts.push(entry);
  _renderPinnedShout(c, entry);
}
