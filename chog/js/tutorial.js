// ═══════════════════════════════════════
//  TUTORIAL — first-time onboarding
// ═══════════════════════════════════════
(function(){
  const STORAGE_KEY = 'chogTutorialSeen_v1';
  const ACCENT = '#c084fc';

  const STEPS = [
    {
      target: null,
      title: '👋 Welcome to CHOG Terminal',
      text: 'Real-time trading hub for CHOG holders. Quick 30-second tour of the main features.',
      pos: 'center'
    },
    {
      target: '.nav-right',
      title: '🎮 Top Menu',
      text: '<b>Holders</b> rankings · <b>CHOG Chess</b> P2P games · <b>CHOG Climb</b> arcade · <b>Revenue</b> stats · <b>Connect Wallet</b> to participate',
      pos: 'bottom'
    },
    {
      target: '#priceAlertBtn',
      title: '🔔 Price Alerts',
      text: 'Click the bell to set a target price. Get email notifications when CHOG hits your target — even when this tab is closed.',
      pos: 'bottom'
    },
    {
      target: '#chatList',
      title: '💬 Live Chat',
      text: 'Connect your wallet to chat with other CHOG holders in real-time. Send stickers, share vibes, build the community.',
      pos: 'top'
    },
    {
      target: '.shout-section',
      title: '📢 SHOUT',
      text: 'Pay CHOG to broadcast a pinned message visible on the chart for everyone. Up to 3 shouts stay pinned at a time.',
      pos: 'top'
    }
  ];

  let currentStep = 0;

  function injectStyle(){
    if(document.getElementById('tut-style')) return;
    const css = `
      .tut-backdrop{position:fixed;inset:0;background:rgba(8,5,18,0.78);z-index:99998;pointer-events:auto;backdrop-filter:blur(2px)}
      .tut-spotlight{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,5,18,0.85),0 0 0 3px ${ACCENT},0 0 32px rgba(192,132,252,0.5);z-index:99998;pointer-events:none;transition:all .3s ease}
      .tut-tooltip{position:fixed;max-width:340px;background:linear-gradient(180deg,rgba(28,20,52,0.99),rgba(13,10,26,0.99));border:1px solid rgba(192,132,252,0.45);border-radius:14px;padding:18px 20px;color:#ede8f5;font-size:13px;line-height:1.55;z-index:99999;box-shadow:0 16px 40px rgba(0,0,0,0.6);pointer-events:auto;animation:tutFade .25s ease}
      .tut-tooltip-title{font-size:16px;font-weight:700;margin-bottom:8px;color:${ACCENT};letter-spacing:.3px}
      .tut-tooltip-text b{color:${ACCENT};font-weight:700}
      .tut-tooltip-actions{display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px}
      .tut-progress{font-size:11px;color:rgba(255,255,255,0.4);font-family:'Share Tech Mono',monospace}
      .tut-btns{display:flex;gap:8px}
      .tut-btn{padding:7px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;border:none;font-family:inherit;transition:transform .15s,opacity .15s}
      .tut-btn:active{transform:scale(.96)}
      .tut-btn-primary{background:linear-gradient(135deg,#c084fc,#a855f7);color:#fff;box-shadow:0 4px 12px rgba(192,132,252,0.35)}
      .tut-btn-skip{background:transparent;color:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.18)}
      .tut-btn-skip:hover{color:rgba(255,255,255,0.9)}
      @keyframes tutFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:600px){
        .tut-tooltip{left:12px!important;right:12px!important;max-width:none!important;width:auto!important}
      }
    `;
    const s = document.createElement('style');
    s.id = 'tut-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureNodes(){
    let backdrop = document.querySelector('.tut-backdrop');
    let spotlight = document.querySelector('.tut-spotlight');
    let tooltip = document.querySelector('.tut-tooltip');
    if(!backdrop){
      backdrop = document.createElement('div');
      backdrop.className = 'tut-backdrop';
      document.body.appendChild(backdrop);
    }
    if(!spotlight){
      spotlight = document.createElement('div');
      spotlight.className = 'tut-spotlight';
      spotlight.style.display = 'none';
      document.body.appendChild(spotlight);
    }
    if(!tooltip){
      tooltip = document.createElement('div');
      tooltip.className = 'tut-tooltip';
      document.body.appendChild(tooltip);
    }
    return { backdrop, spotlight, tooltip };
  }

  function positionTooltip(tooltip, rect, prefer){
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = Math.min(340, vw - 24);
    const th = tooltip.offsetHeight || 180;
    const margin = 16;

    if(vw <= 600){
      // mobile: pin to bottom
      tooltip.style.left = '12px';
      tooltip.style.right = '12px';
      tooltip.style.bottom = '16px';
      tooltip.style.top = 'auto';
      return;
    }

    if(!rect){
      // center
      tooltip.style.left = ((vw - tw)/2) + 'px';
      tooltip.style.top = ((vh - th)/2) + 'px';
      tooltip.style.right = 'auto';
      tooltip.style.bottom = 'auto';
      return;
    }

    let top, left = rect.left + rect.width/2 - tw/2;
    if(prefer === 'top' && rect.top - th - margin > 0){
      top = rect.top - th - margin;
    } else if(prefer === 'bottom' && rect.bottom + th + margin < vh){
      top = rect.bottom + margin;
    } else {
      // fallback: whichever side has more room
      top = rect.top > vh/2 ? rect.top - th - margin : rect.bottom + margin;
    }
    left = Math.max(12, Math.min(vw - tw - 12, left));
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(12, top) + 'px';
    tooltip.style.right = 'auto';
    tooltip.style.bottom = 'auto';
  }

  function render(){
    injectStyle();
    const { backdrop, spotlight, tooltip } = ensureNodes();
    const step = STEPS[currentStep];
    const isLast = currentStep === STEPS.length - 1;

    tooltip.innerHTML = `
      <div class="tut-tooltip-title">${step.title}</div>
      <div class="tut-tooltip-text">${step.text}</div>
      <div class="tut-tooltip-actions">
        <span class="tut-progress">${currentStep+1} / ${STEPS.length}</span>
        <div class="tut-btns">
          <button class="tut-btn tut-btn-skip" onclick="window.__tutSkip()">Skip</button>
          <button class="tut-btn tut-btn-primary" onclick="window.__tutNext()">${isLast ? 'Got it!' : 'Next →'}</button>
        </div>
      </div>
    `;

    if(!step.target){
      spotlight.style.display = 'none';
      backdrop.style.display = 'block';
      positionTooltip(tooltip, null, 'center');
      return;
    }

    const el = document.querySelector(step.target);
    if(!el){
      // target missing — skip this step
      currentStep++;
      if(currentStep >= STEPS.length){ done(); } else { render(); }
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const pad = 8;
      spotlight.style.display = 'block';
      spotlight.style.left = (rect.left - pad) + 'px';
      spotlight.style.top = (rect.top - pad) + 'px';
      spotlight.style.width = (rect.width + pad*2) + 'px';
      spotlight.style.height = (rect.height + pad*2) + 'px';
      backdrop.style.display = 'none'; // spotlight box-shadow handles dimming
      positionTooltip(tooltip, rect, step.pos);
    }, 400);
  }

  function next(){
    currentStep++;
    if(currentStep >= STEPS.length){ done(); } else { render(); }
  }

  function done(){
    document.querySelector('.tut-backdrop')?.remove();
    document.querySelector('.tut-spotlight')?.remove();
    document.querySelector('.tut-tooltip')?.remove();
    try{ localStorage.setItem(STORAGE_KEY, '1'); }catch(e){}
  }

  function start(){
    currentStep = 0;
    render();
  }

  window.__tutNext = next;
  window.__tutSkip = done;
  window.replayTutorial = start;

  document.addEventListener('DOMContentLoaded', () => {
    let seen = false;
    try{ seen = !!localStorage.getItem(STORAGE_KEY); }catch(e){}
    if(seen) return;
    setTimeout(start, 1500); // wait for chart/UI to settle
  });
})();
