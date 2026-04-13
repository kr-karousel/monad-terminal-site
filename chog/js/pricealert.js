// ═══════════════════════════════════════
//  PRICE ALERTS
// ═══════════════════════════════════════

// ── EmailJS config ─────────────────────
// Sign up at https://www.emailjs.com (free: 200 emails/month)
// 1. Create an Email Service (Gmail, Outlook, etc.)
// 2. Create an Email Template with variables:
//      {{to_email}}  {{direction}}  {{target}}  {{current}}
// 3. Fill in the three values below:
const EMAILJS_PUBLIC_KEY   = '';   // Account → API Keys → Public Key
const EMAILJS_SERVICE_ID   = '';   // Email Services → Service ID
const EMAILJS_TEMPLATE_ID  = '';   // Email Templates → Template ID
// ───────────────────────────────────────

var priceAlerts = [];
var alertNotifGranted = false;
var alertEmail = '';

function loadPriceAlerts(){
  try{ priceAlerts = JSON.parse(localStorage.getItem('chog_price_alerts')||'[]'); }
  catch(e){ priceAlerts = []; }
  alertEmail = localStorage.getItem('chog_alert_email') || '';
  _initEmailJS();
  updateAlertBellState();
}

function _initEmailJS(){
  if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY){
    try{ emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); } catch(e){}
  }
}

function savePriceAlerts(){
  localStorage.setItem('chog_price_alerts', JSON.stringify(priceAlerts));
}

function saveAlertEmail(){
  const inp = document.getElementById('alertEmailInput');
  const val = inp ? inp.value.trim() : '';
  alertEmail = val;
  localStorage.setItem('chog_alert_email', val);
  const btn = document.getElementById('alertEmailSaveBtn');
  if(btn){ btn.textContent = '✓ Saved'; setTimeout(()=>{ btn.textContent = 'Save'; }, 2000); }
}

function openPriceAlertModal(){
  const m = document.getElementById('priceAlertModal');
  if(!m) return;
  // pre-fill current price
  const inp = document.getElementById('alertPriceInput');
  if(inp && livePrice && !inp.value) inp.value = livePrice.toFixed(7);
  // pre-fill saved email
  const emailInp = document.getElementById('alertEmailInput');
  if(emailInp && alertEmail) emailInp.value = alertEmail;
  renderPriceAlertList();
  m.classList.add('open');
  // 브라우저 알림 권한 요청
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

function addPriceAlert(){
  const typeEl  = document.getElementById('alertTypeSelect');
  const priceEl = document.getElementById('alertPriceInput');
  const type    = typeEl  ? typeEl.value  : 'above';
  const price   = parseFloat(priceEl ? priceEl.value : '') || 0;
  if(!price || price <= 0){ alert('Please enter a valid price.'); return; }

  const dup = priceAlerts.find(a => !a.triggered && a.type === type && a.price === price);
  if(dup){ alert('This alert already exists.'); return; }

  priceAlerts.push({ id: Date.now(), type, price, triggered: false });
  savePriceAlerts();
  if(priceEl) priceEl.value = '';
  renderPriceAlertList();
  updateAlertBellState();
}

function removePriceAlert(id){
  priceAlerts = priceAlerts.filter(a => a.id !== id);
  savePriceAlerts();
  renderPriceAlertList();
  updateAlertBellState();
}

function clearTriggeredAlerts(){
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
        ${a.triggered ? '<span style="color:var(--muted);font-size:9px"> ✓ triggered</span>' : ''}
      </span>
      <button onclick="removePriceAlert(${a.id})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 2px;line-height:1;opacity:0.7" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">✕</button>
    </div>`).join('')
  + (hasDone ? `<button onclick="clearTriggeredAlerts()" style="width:100%;margin-top:4px;background:none;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);font-size:10px;padding:4px;cursor:pointer">Clear triggered alerts</button>` : '');
}

function checkPriceAlerts(currentPrice){
  if(!priceAlerts.length) return;
  let changed = false;
  priceAlerts.forEach(a => {
    if(a.triggered) return;
    const hit = (a.type === 'above' && currentPrice >= a.price)
              || (a.type === 'below' && currentPrice <= a.price);
    if(!hit) return;
    a.triggered = true;
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

  // Browser notification (works while tab is open)
  if(alertNotifGranted && 'Notification' in window){
    try{ new Notification('🔔 CHOG Price Alert', { body: msg, icon: '/chog/img/chog_logo.png' }); }
    catch(e){}
  }

  // Email via EmailJS
  if(alertEmail && typeof emailjs !== 'undefined' && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID){
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:  alertEmail,
      direction: alert.type === 'above' ? 'Above 📈' : 'Below 📉',
      target:    '$' + alert.price.toFixed(7),
      current:   '$' + currentPrice.toFixed(7),
    }).catch(e => console.warn('EmailJS send failed:', e));
  }

  // On-screen toast
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
    // 뱃지
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
