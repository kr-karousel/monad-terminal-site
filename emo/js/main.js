function startApp(){
  const w=document.getElementById('chart-wrapper');
  if(!w){setTimeout(startApp,50);return;}
  const width=w.getBoundingClientRect().width||w.offsetWidth;
  if(width<10){setTimeout(startApp,80);return;}
  checkWelcome();
  loadNickDB();
  loadShoutsFromStorage();
  loadCustomTiersFromStorage();
  loadBansFromStorage();
  initChart();
  startPriceRefresh();
  setTimeout(setupTracking,300);
}

if(document.readyState==='complete')setTimeout(startApp,100);
else{window.addEventListener('load',()=>setTimeout(startApp,100));document.addEventListener('DOMContentLoaded',()=>setTimeout(startApp,200));}

// ═══════════════════════════════════════
//  ONLINE COUNT — 가짜 시뮬 OFF (라이브 모드)
//  실제 WebSocket/서버 연동 시 여기서 업데이트
// ═══════════════════════════════════════
(function(){const e=document.getElementById('onlineCount');if(e)e.textContent='—';})();

