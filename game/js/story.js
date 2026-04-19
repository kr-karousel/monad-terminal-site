// Story intro: 4 comic panels, each drawn on a small canvas.
// Advances on click/tap of the NEXT button; SKIP jumps straight to start.

(function () {
  const PANELS = 4;
  let current = 0;

  const screen   = document.getElementById('story-screen');
  const nextBtn  = document.getElementById('story-next');
  const skipBtn  = document.getElementById('story-skip-btn');
  const dots     = Array.from(document.querySelectorAll('.story-nav .dot'));

  // ── Scene renderers ──────────────────────────────────────────────────────

  function drawScene1(canvas) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    // Sky + cliff background
    const sky = c.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#1a3a6a'); sky.addColorStop(1,'#4a8aaa');
    c.fillStyle = sky; c.fillRect(0,0,W,H);
    // Distant mountains
    c.fillStyle = '#2a4a7a';
    c.beginPath(); c.moveTo(0,H*0.7); c.lineTo(60,H*0.45); c.lineTo(130,H*0.7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(80,H*0.7); c.lineTo(180,H*0.38); c.lineTo(260,H*0.7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(200,H*0.7); c.lineTo(280,H*0.5); c.lineTo(W,H*0.7); c.closePath(); c.fill();

    // Cliff edge (left/centre)
    const cliff = c.createLinearGradient(0,H*0.55,0,H);
    cliff.addColorStop(0,'#8a6a40'); cliff.addColorStop(1,'#5a4020');
    c.fillStyle = cliff;
    c.beginPath();
    c.moveTo(0,H*0.62); c.lineTo(W*0.58,H*0.62); c.lineTo(W*0.58,H); c.lineTo(0,H); c.closePath(); c.fill();
    // Grass top
    c.fillStyle = '#4a8a3a';
    c.fillRect(0, H*0.58, W*0.58, H*0.06);

    // Apple in tree (top right)
    // Tree branch
    c.strokeStyle = '#6a4020'; c.lineWidth=8; c.lineCap='round';
    c.beginPath(); c.moveTo(W*0.7, 0); c.lineTo(W*0.72, H*0.28); c.stroke();
    c.beginPath(); c.moveTo(W*0.72, H*0.28); c.lineTo(W*0.78, H*0.22); c.stroke();
    // Leaves
    c.fillStyle = '#3a7a2a';
    for(const [lx,ly,lr] of [[W*0.78,H*0.16,18],[W*0.84,H*0.10,16],[W*0.70,H*0.10,14]]) {
      c.beginPath(); c.arc(lx,ly,lr,0,Math.PI*2); c.fill();
    }
    // Apple
    c.fillStyle = '#cc2030';
    c.beginPath(); c.arc(W*0.80, H*0.24, 11, 0, Math.PI*2); c.fill();
    c.fillStyle = '#ee4040';
    c.beginPath(); c.arc(W*0.78, H*0.21, 5, 0, Math.PI*2); c.fill();
    // Apple stem
    c.strokeStyle='#6a4020'; c.lineWidth=2;
    c.beginPath(); c.moveTo(W*0.80,H*0.13); c.lineTo(W*0.80,H*0.18); c.stroke();

    // CHOG character on cliff edge
    _drawChogScene1(c, W*0.38, H*0.52);

    // Dashed reach lines
    c.strokeStyle='rgba(255,255,200,0.4)'; c.lineWidth=1.5; c.setLineDash([4,4]);
    c.beginPath(); c.moveTo(W*0.44, H*0.46); c.lineTo(W*0.76, H*0.24); c.stroke();
    c.setLineDash([]);
  }

  function drawScene2(canvas) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    // Same background
    const sky = c.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#1a3a6a'); sky.addColorStop(1,'#4a8aaa');
    c.fillStyle = sky; c.fillRect(0,0,W,H);
    // Cliff top — tipping moment
    c.fillStyle = '#5a4020';
    c.beginPath(); c.moveTo(0,H*0.70); c.lineTo(W*0.52,H*0.70); c.lineTo(W*0.52,H); c.lineTo(0,H); c.closePath(); c.fill();
    c.fillStyle = '#4a8a3a'; c.fillRect(0, H*0.66, W*0.52, 8);

    // Apple drifting away
    c.fillStyle = '#cc2030';
    c.beginPath(); c.arc(W*0.82, H*0.30, 9, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(255,255,0,0.5)'; c.font='18px serif';

    // CHOG slipping — tilted, arm out
    _drawChogSlipping(c, W*0.42, H*0.62);

    // Motion lines
    c.strokeStyle='rgba(255,255,200,0.35)'; c.lineWidth=1; c.setLineDash([3,5]);
    for(let i=0;i<5;i++) {
      const lx = W*(0.3+i*0.04), ly = H*(0.5+i*0.04);
      c.beginPath(); c.moveTo(lx,ly); c.lineTo(lx-12,ly+8); c.stroke();
    }
    c.setLineDash([]);
  }

  function drawScene3(canvas) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    // Dark ravine bg
    const bg = c.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#3a6050'); bg.addColorStop(0.5,'#2a5040'); bg.addColorStop(1,'#1a1a20');
    c.fillStyle = bg; c.fillRect(0,0,W,H);

    // Cliffs on sides
    c.fillStyle = '#5a4828';
    c.beginPath(); c.moveTo(0,0); c.lineTo(W*0.28,0); c.lineTo(W*0.22,H); c.lineTo(0,H); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(W,0); c.lineTo(W*0.72,0); c.lineTo(W*0.78,H); c.lineTo(W,H); c.closePath(); c.fill();
    // Rock texture
    c.strokeStyle='rgba(100,80,40,0.3)'; c.lineWidth=1;
    for(const [rx,ry,rw,rh] of [[20,40,60,8],[10,90,50,6],[180,30,70,7],[220,100,55,5]]) {
      c.beginPath(); c.rect(rx,ry,rw,rh); c.stroke();
    }

    // Trees/foliage on sides
    for(const [tx,ty] of [[W*0.12,H*0.2],[W*0.85,H*0.35],[W*0.18,H*0.5]]) {
      c.fillStyle = '#2a5028'; c.beginPath(); c.arc(tx,ty,18,0,Math.PI*2); c.fill();
      c.fillStyle = '#3a6035'; c.beginPath(); c.arc(tx-4,ty-4,10,0,Math.PI*2); c.fill();
    }

    // Speed lines (falling)
    c.strokeStyle='rgba(255,255,255,0.15)'; c.lineWidth=1.5;
    for(let i=0;i<8;i++) {
      const sx = W*(0.25+i*0.07);
      c.beginPath(); c.moveTo(sx,0); c.lineTo(sx+8,H); c.stroke();
    }

    // CHOG falling (arms spread, screaming)
    _drawChogFalling(c, W*0.5, H*0.42);

    // Apple floating up
    c.fillStyle = '#cc2030';
    c.beginPath(); c.arc(W*0.74, H*0.15, 8, 0, Math.PI*2); c.fill();
    // Dots showing apple going away
    c.fillStyle='rgba(200,50,50,0.5)';
    for(const [dx,dy,dr] of [[W*0.78,H*0.08,5],[W*0.82,H*0.03,3]]) {
      c.beginPath(); c.arc(dx,dy,dr,0,Math.PI*2); c.fill();
    }
  }

  function drawScene4(canvas) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    // Ravine ground
    const bg = c.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#3a5040'); bg.addColorStop(1,'#1a2818');
    c.fillStyle = bg; c.fillRect(0,0,W,H);

    // Ground rocks
    c.fillStyle = '#4a3820';
    for(const [rx,ry,rw,rh,ra] of [[30,H*0.72,80,20,0.1],[160,H*0.75,60,18,-0.08],[240,H*0.70,90,25,0.05]]) {
      c.save(); c.translate(rx+rw/2,ry+rh/2); c.rotate(ra); c.beginPath(); c.ellipse(0,0,rw/2,rh/2,0,0,Math.PI*2); c.fill(); c.restore();
    }
    // Moss patches
    c.fillStyle = '#2a5a20';
    for(const [mx,my,mr] of [[W*0.1,H*0.8,12],[W*0.7,H*0.78,10],[W*0.5,H*0.82,8]]) {
      c.beginPath(); c.arc(mx,my,mr,0,Math.PI*2); c.fill();
    }

    // Large cauldron/pot on ground
    _drawPot(c, W*0.5, H*0.72, 44, 38);

    // CHOG head sticking out of pot, crying
    _drawChogInPot(c, W*0.5, H*0.60);

    // Stars from impact
    c.fillStyle = '#ffee44';
    for(const [sx,sy,ss] of [[W*0.62,H*0.42,8],[W*0.38,H*0.44,6],[W*0.70,H*0.50,5],[W*0.30,H*0.48,7]]) {
      _drawStar(c,sx,sy,ss);
    }
  }

  // ── Character sub-drawing helpers ────────────────────────────────────────

  function _drawChogHead(c, cx, cy, scale=1, mouthOpen=false, eyeStyle='normal') {
    const R = 18 * scale;
    // Hair spikes
    c.fillStyle = '#3510a0';
    const spikes = [[-14,-20,-8,-36,0,-20],[-6,-22,4,-38,12,-22],[4,-20,14,-34,20,-18]];
    for(const [x1,y1,tx,ty,x2,y2] of spikes) {
      c.beginPath(); c.moveTo(cx+x1*scale,cy+y1*scale); c.lineTo(cx+tx*scale,cy+ty*scale); c.lineTo(cx+x2*scale,cy+y2*scale); c.closePath(); c.fill();
    }
    // Head
    const hg = c.createRadialGradient(cx-4*scale,cy-4*scale,1,cx,cy,R);
    hg.addColorStop(0,'#fff8ee'); hg.addColorStop(1,'#f0dfc0');
    c.fillStyle=hg; c.beginPath(); c.arc(cx,cy,R,0,Math.PI*2); c.fill();
    // Eyes
    if (eyeStyle==='normal') {
      c.fillStyle='#1a0a2e';
      c.beginPath(); c.arc(cx-7*scale,cy-2*scale,4*scale,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx+7*scale,cy-2*scale,4*scale,0,Math.PI*2); c.fill();
      c.fillStyle='#fff'; c.beginPath(); c.arc(cx-6*scale,cy-3*scale,1.4*scale,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx+8*scale,cy-3*scale,1.4*scale,0,Math.PI*2); c.fill();
    } else if (eyeStyle==='crying') {
      // X eyes
      c.strokeStyle='#1a0a2e'; c.lineWidth=2.5*scale; c.lineCap='round';
      for(const [ex,ey] of [[-7,- 2],[7,-2]]) {
        c.beginPath(); c.moveTo(cx+(ex-3)*scale,cy+(ey-3)*scale); c.lineTo(cx+(ex+3)*scale,cy+(ey+3)*scale); c.stroke();
        c.beginPath(); c.moveTo(cx+(ex+3)*scale,cy+(ey-3)*scale); c.lineTo(cx+(ex-3)*scale,cy+(ey+3)*scale); c.stroke();
      }
      // Tears
      c.fillStyle='rgba(120,200,255,0.8)';
      c.beginPath(); c.ellipse(cx-9*scale,cy+6*scale,2*scale,4*scale,0,0,Math.PI*2); c.fill();
      c.beginPath(); c.ellipse(cx+9*scale,cy+6*scale,2*scale,4*scale,0,0,Math.PI*2); c.fill();
    } else if (eyeStyle==='shocked') {
      c.fillStyle='#fff'; c.beginPath(); c.arc(cx-7*scale,cy-2*scale,5.5*scale,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx+7*scale,cy-2*scale,5.5*scale,0,Math.PI*2); c.fill();
      c.fillStyle='#1a0a2e'; c.beginPath(); c.arc(cx-7*scale,cy-2*scale,3.5*scale,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(cx+7*scale,cy-2*scale,3.5*scale,0,Math.PI*2); c.fill();
    }
    // Cheeks
    c.fillStyle='rgba(255,110,140,0.5)';
    c.beginPath(); c.ellipse(cx-12*scale,cy+4*scale,5*scale,3.5*scale,0,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(cx+12*scale,cy+4*scale,5*scale,3.5*scale,0,0,Math.PI*2); c.fill();
    // Mouth
    if (mouthOpen) {
      c.fillStyle='#cc3030'; c.beginPath(); c.arc(cx,cy+7*scale,5*scale,-0.1,Math.PI+0.1); c.fill();
      c.fillStyle='#ff4040'; c.beginPath(); c.arc(cx,cy+7*scale,3*scale,0,Math.PI); c.fill();
    } else {
      c.strokeStyle='rgba(120,50,50,0.6)'; c.lineWidth=1.8*scale; c.lineCap='round';
      c.beginPath(); c.arc(cx,cy+8*scale,5*scale,0.1*Math.PI,0.9*Math.PI); c.stroke();
    }
  }

  function _drawPot(c, cx, cy, rx, ry) {
    const pg = c.createRadialGradient(cx-rx*0.3,cy-ry*0.3,2,cx,cy,rx);
    pg.addColorStop(0,'#382050'); pg.addColorStop(0.6,'#1a1420'); pg.addColorStop(1,'#0a0810');
    c.fillStyle=pg; c.beginPath(); c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); c.fill();
    c.strokeStyle='#2e2040'; c.lineWidth=4; c.stroke();
    // Rim opening
    c.strokeStyle='#4a3060'; c.lineWidth=3;
    c.beginPath(); c.ellipse(cx,cy-ry*0.3,rx-4,ry*0.25,0,0,Math.PI*2); c.stroke();
    // Shine
    c.fillStyle='rgba(255,255,255,0.08)';
    c.beginPath(); c.ellipse(cx-rx*0.35,cy-ry*0.35,rx*0.2,ry*0.25,0,0,Math.PI*2); c.fill();
  }

  function _drawChogScene1(c, cx, cy) {
    // Full body reaching
    // Purple body
    c.fillStyle='#4a22a8'; c.beginPath(); c.ellipse(cx,cy,12,18,0,0,Math.PI*2); c.fill();
    // Reaching arm
    c.strokeStyle='#4a22a8'; c.lineWidth=8; c.lineCap='round';
    c.beginPath(); c.moveTo(cx+8,cy-8); c.lineTo(cx+28,cy-28); c.stroke();
    // Glove
    c.fillStyle='#d94fa0'; c.beginPath(); c.arc(cx+30,cy-30,8,0,Math.PI*2); c.fill();
    // Other arm
    c.strokeStyle='#4a22a8'; c.lineWidth=7;
    c.beginPath(); c.moveTo(cx-8,cy-5); c.lineTo(cx-20,cy+5); c.stroke();
    c.fillStyle='#d94fa0'; c.beginPath(); c.arc(cx-21,cy+6,7,0,Math.PI*2); c.fill();
    // Legs
    c.strokeStyle='#2a1a60'; c.lineWidth=8;
    c.beginPath(); c.moveTo(cx-5,cy+14); c.lineTo(cx-8,cy+28); c.stroke();
    c.beginPath(); c.moveTo(cx+5,cy+14); c.lineTo(cx+9,cy+28); c.stroke();
    // Shoes
    c.fillStyle='#1a1a2a'; c.beginPath(); c.ellipse(cx-9,cy+30,8,5,0.2,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(cx+10,cy+30,8,5,-0.2,0,Math.PI*2); c.fill();
    _drawChogHead(c,cx,cy-24,0.85,false,'normal');
  }

  function _drawChogSlipping(c, cx, cy) {
    // Body tilted
    c.save(); c.translate(cx,cy); c.rotate(0.4);
    c.fillStyle='#4a22a8'; c.beginPath(); c.ellipse(0,0,12,18,0,0,Math.PI*2); c.fill();
    // Arms flailing
    c.strokeStyle='#4a22a8'; c.lineWidth=8; c.lineCap='round';
    c.beginPath(); c.moveTo(8,-8); c.lineTo(28,-28); c.stroke();
    c.fillStyle='#d94fa0'; c.beginPath(); c.arc(30,-30,8,0,Math.PI*2); c.fill();
    c.beginPath(); c.moveTo(-8,0); c.lineTo(-22,-18); c.stroke();
    c.fillStyle='#d94fa0'; c.beginPath(); c.arc(-24,-20,8,0,Math.PI*2); c.fill();
    c.restore();
    _drawChogHead(c,cx-4,cy-32,0.85,true,'shocked');
  }

  function _drawChogFalling(c, cx, cy) {
    // Body rotated — falling
    c.save(); c.translate(cx,cy); c.rotate(-0.6);
    c.fillStyle='#4a22a8'; c.beginPath(); c.ellipse(0,0,13,19,0,0,Math.PI*2); c.fill();
    // Both arms up (panic)
    for(const [ax,ay,bx2,by2] of [[-10,-8,-26,-28],[10,-8,26,-28]]) {
      c.strokeStyle='#4a22a8'; c.lineWidth=8; c.lineCap='round';
      c.beginPath(); c.moveTo(ax,ay); c.lineTo(bx2,by2); c.stroke();
      c.fillStyle='#d94fa0'; c.beginPath(); c.arc(bx2,by2,8,0,Math.PI*2); c.fill();
    }
    // Legs flailing
    c.strokeStyle='#2a1a60'; c.lineWidth=8;
    for(const [lx,ly,l2x,l2y] of [[-5,12,-14,28],[5,12,14,28]]) {
      c.beginPath(); c.moveTo(lx,ly); c.lineTo(l2x,l2y); c.stroke();
    }
    c.restore();
    _drawChogHead(c,cx,cy-34,0.9,true,'shocked');
  }

  function _drawChogInPot(c, cx, cy) {
    _drawChogHead(c,cx,cy,1.0,true,'crying');
    // Hands grabbing pot rim
    c.fillStyle='#d94fa0';
    c.beginPath(); c.arc(cx-28,cy+22,9,0,Math.PI*2); c.fill();
    c.beginPath(); c.arc(cx+28,cy+22,9,0,Math.PI*2); c.fill();
    c.strokeStyle='#4a22a8'; c.lineWidth=7; c.lineCap='round';
    c.beginPath(); c.moveTo(cx-18,cy+14); c.lineTo(cx-28,cy+22); c.stroke();
    c.beginPath(); c.moveTo(cx+18,cy+14); c.lineTo(cx+28,cy+22); c.stroke();
  }

  function _drawStar(c, cx, cy, size) {
    c.fillStyle = '#ffee44';
    c.save(); c.translate(cx,cy);
    c.beginPath();
    for(let i=0;i<5;i++){
      const a1=i*Math.PI*2/5-Math.PI/2, a2=a1+Math.PI/5;
      if(i===0) c.moveTo(Math.cos(a1)*size, Math.sin(a1)*size);
      else c.lineTo(Math.cos(a1)*size, Math.sin(a1)*size);
      c.lineTo(Math.cos(a2)*size*0.45, Math.sin(a2)*size*0.45);
    }
    c.closePath(); c.fill();
    c.restore();
  }

  // ── Panel controller ─────────────────────────────────────────────────────

  const renderers = [drawScene1, drawScene2, drawScene3, drawScene4];

  function drawAllPanels() {
    renderers.forEach((fn, i) => {
      const cv = document.getElementById(`pcanvas-${i+1}`);
      if (cv) fn(cv);
    });
  }

  function goTo(idx) {
    const panels = document.querySelectorAll('.panel');
    panels.forEach((p, i) => p.classList.toggle('active', i === idx));
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    current = idx;
    nextBtn.textContent = idx === PANELS - 1 ? 'START CLIMB →' : 'NEXT →';
  }

  function advance() {
    if (current < PANELS - 1) {
      goTo(current + 1);
    } else {
      showStartScreen();
    }
  }

  function showStartScreen() {
    screen.classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
  }

  nextBtn.addEventListener('click', advance);
  skipBtn.addEventListener('click', showStartScreen);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') advance();
  });
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

  // Draw panels once DOM is ready.
  drawAllPanels();
})();
