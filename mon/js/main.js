let appStarted=false;
function startApp(){
  if(appStarted)return;
  appStarted=true;
  const w=document.getElementById('chart-wrapper');
  if(!w){appStarted=false;setTimeout(startApp,50);return;}
  const width=w.getBoundingClientRect().width||w.offsetWidth;
  if(width<10){appStarted=false;setTimeout(startApp,80);return;}
  checkWelcome();
  loadNickDB();
  // Supabase 미설정 시에만 로컬 외치기 로드 (설정 시 서버에서 덮어씀)
  if(typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL) loadShoutsFromStorage();
  loadCustomTiersFromStorage();
  if(typeof loadPriceAlerts === 'function') loadPriceAlerts();
  initChart();
  startPriceRefresh();
  setTimeout(() => { if(typeof initCexFeed === 'function') initCexFeed(); }, 1500);
  setTimeout(() => { if(typeof loadRecentTrades === 'function') loadRecentTrades(5); }, 4000);
  // Supabase 실시간 동기화 초기화
  setTimeout(initSync, 200);
  setTimeout(setupTracking,300);
  // 홀더 수 백그라운드 로드 (statHolders 업데이트)
  setTimeout(async () => {
    try {
      const holders = await fetchTopHolders();
      const sh = document.getElementById('statHolders');
      if(sh && holders && holders.length) sh.textContent = holders.length + '+';
    } catch(e) {}
  }, 7000);
}

if(document.readyState==='complete')setTimeout(startApp,100);
else{window.addEventListener('load',()=>setTimeout(startApp,100));document.addEventListener('DOMContentLoaded',()=>setTimeout(startApp,200));}

// ═══════════════════════════════════════
//  ONLINE COUNT — 가짜 시뮬 OFF (라이브 모드)
//  실제 WebSocket/서버 연동 시 여기서 업데이트
// ═══════════════════════════════════════
(function(){const e=document.getElementById('onlineCount');if(e)e.textContent='—';})();

