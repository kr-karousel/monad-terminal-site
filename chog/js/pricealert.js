// ═══════════════════════════════════════
//  PRICE ALERTS
// ═══════════════════════════════════════
var priceAlerts = [];
var alertNotifGranted = false;
var alertEmail = '';

// ── Supabase 헬퍼 ─────────────────────
const _SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';

async function _sbSaveAlert(type, price, repeat){
  if(!alertEmail) return null;
  try{
    const res = await fetch(`${_SB_URL}/rest/v1/price_alerts`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
                 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ email: alertEmail, type, price, triggered: false, repeat: !!repeat })
    });
    const data = await res.json();
    return data[0]?.id || null;
  }catch(e){ return null; }
}

async function _sbMarkLastNotified(sbId){
  if(!sbId) return;
  try{
    await fetch(`${_SB_URL}/rest/v1/price_alerts?id=eq.${sbId}`, {
      method: 'PATCH',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_notified: new Date().toISOString() })
    });
  }catch(e){}
}

async function _sbMarkTriggered(sbId){
  if(!sbId) return;
  try{
    await fetch(`${_SB_URL}/rest/v1/price_alerts?id=eq.${sbId}`, {
      method: 'PATCH',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ triggered: true })
    });
  }catch(e){}
}

async function _sbDeleteAlert(sbId){
  if(!sbId) return;
  try{
    await fetch(`${_SB_URL}/rest/v1/price_alerts?id=eq.${sbId}`, {
      method: 'DELETE',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` }
    });
  }catch(e){}
}

// ── 기본 함수 ──────────────────────────
function loadPriceAlerts(){
  try{ priceAlerts = JSON.parse(localStorage.getItem('chog_price_alerts')||'[]'); }
  catch(e){ priceAlerts = []; }
  alertEmail = localStorage.getItem('chog_alert_email') || '';
  updateAlertBellState();
}

function savePriceAlerts(){
  localStorage.setItem('chog_price_alerts', JSON.stringify(priceAlerts));
}

async function saveAlertEmail(){
  const inp = document.getElementById('alertEmailInput');
  const val = inp ? inp.value.trim() : '';
  alertEmail = val;
  localStorage.setItem('chog_alert_email', val);
  const btn = document.getElementById('alertEmailSaveBtn');
  if(btn){ btn.textContent = '✓ Saved'; setTimeout(()=>{ btn.textContent = 'Save'; }, 2000); }

  // 이메일 저장 시 기존 미트리거 알림을 Supabase에 동기화
  if(alertEmail){
    for(const a of priceAlerts.filter(x => !x.triggered && !x.sbId)){
      const sbId = await _sbSaveAlert(a.type, a.price);
      if(sbId) a.sbId = sbId;
    }
    savePriceAlerts();
  }
}

function openPriceAlertModal(){
  const m = document.getElementById('priceAlertModal');
  if(!m) return;
  const inp = document.getElementById('alertPriceInput');
  if(inp && livePrice && !inp.value) inp.value = livePrice.toFixed(7);
  const emailInp = document.getElementById('alertEmailInput');
  if(emailInp && alertEmail) emailInp.value = alertEmail;
  renderPriceAlertList();
  m.classList.add('open');
  if('Notification' in window){
    if(Notification.permission === 'granted'){
      alertNotifGranted = true;
    } else if(Notification.permission === 'default'){
      Notification.requestPermission().then(p => { alertNotifGranted = p === 'granted'; });
    }
  }
}

function closePriceAlertModal(){
  const m = document.getElementById('priceAlertModal');
  if(m) m.classList.remove('open');
}

async function addPriceAlert(){
  const typeEl  = document.getElementById('alertTypeSelect');
  const priceEl = document.getElementById('alertPriceInput');
  const type    = typeEl  ? typeEl.value  : 'above';
  const price   = parseFloat(priceEl ? priceEl.value : '') || 0;
  if(!price || price <= 0){ alert('Please enter a valid price.'); return; }

  const dup = priceAlerts.find(a => !a.triggered && a.type === type && a.price === price);
  if(dup){ alert('This alert already exists.'); return; }

  const repeatEl = document.getElementById('alertRepeatCheck');
  const repeat = repeatEl ? repeatEl.checked : false;
  const newAlert = { id: Date.now(), type, price, triggered: false, repeat };

  // Supabase에 저장 (이메일 설정 시)
  if(alertEmail){
    const sbId = await _sbSaveAlert(type, price, repeat);
    if(sbId) newAlert.sbId = sbId;
  }

  priceAlerts.push(newAlert);
  savePriceAlerts();
  if(priceEl) priceEl.value = '';
  renderPriceAlertList();
  updateAlertBellState();
}

function removePriceAlert(id){
  const a = priceAlerts.find(x => x.id === id);
  if(a && a.sbId) _sbDeleteAlert(a.sbId);
  priceAlerts = priceAlerts.filter(a => a.id !== id);
  savePriceAlerts();
  renderPriceAlertList();
  updateAlertBellState();
}

function clearTriggeredAlerts(){
  priceAlerts.filter(a => a.triggered && a.sbId).forEach(a => _sbDeleteAlert(a.sbId));
  priceAlerts = priceAlerts.filter(a => !a.triggered);
  savePriceAlerts();
  renderPriceAlertList();
  updateAlertBellState();
}

function renderPriceAlertList(){
  const el = document.getElementById('priceAlertList');
  if(!el) return;
  if(!priceAlerts.length){
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding:14px 0">No alerts set</div>';
    return;
  }
  const hasDone = priceAlerts.some(a => a.triggered);
  el.innerHTML = priceAlerts.map(a => `
    <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border-radius:7px;padding:6px 8px;margin-bottom:4px${a.triggered ? ';opacity:0.4' : ''}">
      <span style="font-size:14px">${a.type === 'above' ? '📈' : '📉'}</span>
      <span style="font-size:11px;flex:1;line-height:1.4">
        <span style="color:var(--muted);font-size:9px">${a.type === 'above' ? 'ABOVE' : 'BELOW'}</span><br>
        <b style="font-family:'Share Tech Mono',monospace;color:${a.type==='above'?'var(--green)':'var(--red)'}">$${a.price.toFixed(7)}</b>
        ${a.repeat ? '<span style="color:var(--accent);font-size:9px"> 🔁</span>' : ''}
        ${a.triggered ? '<span style="color:var(--muted);font-size:9px"> ✓ triggered</span>' : ''}
      </span>
      <button onclick="removePriceAlert(${a.id})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 2px;line-height:1;opacity:0.7" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">✕</button>
    </div>`).join('')
  + (hasDone ? `<button onclick="clearTriggeredAlerts()" style="width:100%;margin-top:4px;background:none;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);font-size:10px;padding:4px;cursor:pointer">Clear triggered alerts</button>` : '');
}

function checkPriceAlerts(currentPrice){
  if(!priceAlerts.length) return;
  let changed = false;
  const now = Date.now();
  priceAlerts.forEach(a => {
    if(a.triggered) return;
    const hit = (a.type === 'above' && currentPrice >= a.price)
              || (a.type === 'below' && currentPrice <= a.price);
    if(!hit) return;
    if(a.repeat){
      // 반복 알림: 1시간 쿨다운 체크
      if(a.lastNotified && (now - a.lastNotified) < 60 * 60 * 1000) return;
      a.lastNotified = now;
    } else {
      a.triggered = true;
    }
    changed = true;
    _fireAlert(a, currentPrice);
  });
  if(changed){
    savePriceAlerts();
    renderPriceAlertList();
    updateAlertBellState();
  }
}

function _fireAlert(alert, currentPrice){
  const direction = alert.type === 'above' ? '📈 Above' : '📉 Below';
  const msg = `CHOG ${direction} $${alert.price.toFixed(7)}\nNow: $${currentPrice.toFixed(7)}`;

  // Browser notification
  if(alertNotifGranted && 'Notification' in window){
    try{ new Notification('🔔 CHOG Price Alert', { body: msg, icon: '/chog/img/chog_logo.png' }); }
    catch(e){}
  }

  // Supabase 업데이트 (반복이면 last_notified만, 아니면 triggered)
  if(alert.sbId){
    if(alert.repeat) _sbMarkLastNotified(alert.sbId);
    else _sbMarkTriggered(alert.sbId);
  }

  // Email via Resend (browser-initiated)
  if(alertEmail){
    fetch('/api/send-alert-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to:        alertEmail,
        direction: alert.type === 'above' ? 'Above 📈' : 'Below 📉',
        target:    '$' + alert.price.toFixed(7),
        current:   '$' + currentPrice.toFixed(7),
      }),
    }).catch(e => console.warn('Alert email failed:', e));
  }

  // 화면 내 토스트
  _showAlertToast(alert.type, alert.price, currentPrice);
}

function _showAlertToast(type, targetPrice, currentPrice){
  const toast = document.createElement('div');
  const isAbove = type === 'above';
  toast.style.cssText = [
    'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:10000',
    'background:rgba(14,14,22,0.97);border-radius:12px;padding:12px 20px',
    `border:1px solid ${isAbove ? 'var(--green)' : 'var(--red)'}`,
    'box-shadow:0 8px 32px rgba(0,0,0,0.6);text-align:center',
    'animation:alertToastIn .35s cubic-bezier(.22,.68,0,1.2) forwards;min-width:240px'
  ].join(';');
  toast.innerHTML = `
    <div style="font-size:20px;margin-bottom:4px">${isAbove ? '📈' : '📉'}</div>
    <div style="font-size:12px;font-weight:700;color:${isAbove ? 'var(--green)' : 'var(--red)'};letter-spacing:.5px">
      CHOG ${isAbove ? 'ABOVE' : 'BELOW'} $${targetPrice.toFixed(7)}
    </div>
    <div style="font-size:10px;color:var(--muted);margin-top:3px">
      Now: <b style="font-family:'Share Tech Mono',monospace;color:var(--text)">$${currentPrice.toFixed(7)}</b>
    </div>`;
  document.body.appendChild(toast);
  setTimeout(()=>{
    toast.style.transition = 'opacity .5s, transform .5s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(()=> toast.remove(), 500);
  }, 5000);
}

function updateAlertBellState(){
  const btn = document.getElementById('priceAlertBtn');
  if(!btn) return;
  const active = priceAlerts.filter(a => !a.triggered).length;
  if(active > 0){
    btn.style.color = 'var(--gold)';
    btn.style.borderColor = 'rgba(251,191,36,0.4)';
    btn.title = `${active} active alert${active > 1 ? 's' : ''}`;
    let badge = btn.querySelector('.alert-badge');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'alert-badge';
      badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:var(--gold);color:#000;border-radius:50%;width:14px;height:14px;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }
    badge.textContent = active;
  } else {
    btn.style.color = '';
    btn.style.borderColor = '';
    btn.title = 'Set price alert';
    const badge = btn.querySelector('.alert-badge');
    if(badge) badge.remove();
  }
}
