// ═══════════════════════════════════════
//  SUPABASE 실시간 동기화
//  닉네임 / 외치기(Shout) / 커스텀 티어 / 테스트 지갑을 전 브라우저에 실시간 동기화
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
    _syncCustomTiersFromServer();
    _syncTestWalletsFromServer();
    _subscribeToNicknames();
    _subscribeToShouts();
    _subscribeToCustomTiers();
    _subscribeToTestWallets();
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
        const isNew = !nickDB[row.address.toLowerCase()];
        nickDB[row.address.toLowerCase()] = row.nickname;
        // 내 지갑이면 UI 업데이트
        if(wallet && wallet.addr.toLowerCase() === row.address.toLowerCase()){
          if(typeof updateWalletDisplay === 'function') updateWalletDisplay();
        } else if(isNew && typeof renderMsg === 'function'){
          // 다른 유저 닉네임 등록 → 채팅에 알림
          renderMsg({
            addr: row.nickname,
            addrFull: row.address,
            bal: 0,
            msg: '✏️ Joined as "' + row.nickname + '"!',
            time: typeof nowTime === 'function' ? nowTime() : ''
          });
        }
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

// ── 커스텀 티어 ─────────────────────────────────────────

async function _syncCustomTiersFromServer(){
  if(!_sbClient) return;
  try{
    const { data } = await _sbClient.from('custom_tiers').select('address, label');
    if(!data) return;
    data.forEach(row => {
      if(row.address && row.label)
        devCustomTiers[row.address.toLowerCase()] = row.label;
    });
    if(typeof saveCustomTiersToStorage === 'function') saveCustomTiersToStorage();
  }catch(e){ console.warn('[Sync] 커스텀 티어 로드 실패:', e.message); }
}

function _subscribeToCustomTiers(){
  if(!_sbClient) return;
  _sbClient.channel('sync-custom-tiers')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'custom_tiers' },
      payload => {
        if(payload.eventType === 'DELETE'){
          const addr = (payload.old?.address || '').toLowerCase();
          if(addr) delete devCustomTiers[addr];
        } else {
          const row = payload.new;
          if(row?.address && row?.label)
            devCustomTiers[row.address.toLowerCase()] = row.label;
        }
        if(typeof saveCustomTiersToStorage === 'function') saveCustomTiersToStorage();
        if(typeof renderDevCustomTiers === 'function') renderDevCustomTiers();
      }
    )
    .subscribe();
}

async function syncCustomTierToServer(address, label){
  if(!_sbClient) return;
  try{
    if(label === null){
      await _sbClient.from('custom_tiers').delete().eq('address', address.toLowerCase());
    } else {
      await _sbClient.from('custom_tiers').upsert(
        { address: address.toLowerCase(), label, updated_at: new Date().toISOString() },
        { onConflict: 'address' }
      );
    }
  }catch(e){ console.warn('[Sync] 커스텀 티어 저장 실패:', e.message); }
}

// ── 테스트 지갑 ─────────────────────────────────────────

async function _syncTestWalletsFromServer(){
  if(!_sbClient) return;
  try{
    const { data } = await _sbClient.from('test_wallets').select('address');
    if(!data) return;
    data.forEach(row => {
      if(row.address && !devTestWallets.includes(row.address.toLowerCase()))
        devTestWallets.push(row.address.toLowerCase());
    });
    if(typeof checkDevAccess === 'function') checkDevAccess();
    if(typeof renderDevTestWallets === 'function') renderDevTestWallets();
  }catch(e){ console.warn('[Sync] 테스트 지갑 로드 실패:', e.message); }
}

function _subscribeToTestWallets(){
  if(!_sbClient) return;
  _sbClient.channel('sync-test-wallets')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'test_wallets' },
      payload => {
        if(payload.eventType === 'DELETE'){
          const addr = (payload.old?.address || '').toLowerCase();
          devTestWallets = devTestWallets.filter(a => a !== addr);
        } else {
          const addr = (payload.new?.address || '').toLowerCase();
          if(addr && !devTestWallets.includes(addr)) devTestWallets.push(addr);
        }
        if(typeof checkDevAccess === 'function') checkDevAccess();
        if(typeof renderDevTestWallets === 'function') renderDevTestWallets();
      }
    )
    .subscribe();
}

async function syncTestWalletToServer(address, add){
  if(!_sbClient) return;
  try{
    if(add){
      await _sbClient.from('test_wallets').upsert(
        { address: address.toLowerCase() },
        { onConflict: 'address' }
      );
    } else {
      await _sbClient.from('test_wallets').delete().eq('address', address.toLowerCase());
    }
  }catch(e){ console.warn('[Sync] 테스트 지갑 저장 실패:', e.message); }
}
