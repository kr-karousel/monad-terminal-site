// Vercel Cron — 1분마다 CHOG 가격 체크 → 조건 충족 알림 이메일 발송
const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';
const RESEND_KEY = 're_23oaEXi8_Mg4KbP4p6FgZiJ73bqSTQWnv';
const POOL = '0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1';

module.exports = async function handler(req, res) {
  try {
    // 1. CHOG 현재 가격 조회
    const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/monad/${POOL}`);
    const dsData = await dsRes.json();
    const currentPrice = parseFloat((dsData.pairs || [])[0]?.priceUsd || 0);
    if (!currentPrice) return res.status(200).json({ ok: false, reason: 'price fetch failed' });

    // 2. 미트리거 알림 조회
    const alertsRes = await fetch(`${SB_URL}/rest/v1/price_alerts?triggered=eq.false&select=*`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const alerts = await alertsRes.json();
    if (!Array.isArray(alerts) || !alerts.length) {
      return res.status(200).json({ ok: true, triggered: 0, price: currentPrice });
    }

    // 3. 조건 충족 알림 처리 (반복 알림은 armed 기반 재트리거)
    const triggered = alerts.filter(a => {
      const hit = (a.type === 'above' && currentPrice >= a.price) ||
                  (a.type === 'below' && currentPrice <= a.price);
      if(a.repeat) return hit && a.armed !== false;
      return hit;
    });

    // 반복 알림 중 가격이 반대쪽으로 돌아간 것 → 재무장
    const toRearm = alerts.filter(a => {
      if(!a.repeat || a.armed !== false) return false;
      const hit = (a.type === 'above' && currentPrice >= a.price) ||
                  (a.type === 'below' && currentPrice <= a.price);
      return !hit;
    });
    for(const a of toRearm){
      await fetch(`${SB_URL}/rest/v1/price_alerts?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
                   'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ armed: true }),
      }).catch(() => {});
    }

    for (const a of triggered) {
      const target  = '$' + parseFloat(a.price).toFixed(7);
      const current = '$' + currentPrice.toFixed(7);

      // 이메일 발송
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Monad Terminal <alerts@monad-terminal.xyz>',
          to:   [a.email],
          subject: `🎯 Target Hit — ${target}`,
          html: `
            <div style="font-family:monospace;background:#0e0e16;color:#e2e8f0;padding:24px;border-radius:12px;max-width:400px">
              <div style="font-size:22px;font-weight:700;color:#c084fc;margin-bottom:12px">🎯 Terminal Price Alert</div>
              <div style="font-size:15px;margin-bottom:8px">Your target price was <b style="color:#c084fc">hit</b></div>
              <div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:12px 0">
                <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">TARGET</div>
                <div style="font-size:20px;font-weight:700">${target}</div>
              </div>
              <div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:12px 0">
                <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">CURRENT PRICE</div>
                <div style="font-size:20px;font-weight:700;color:#c084fc">${current}</div>
              </div>
              <div style="font-size:11px;color:#475569;margin-top:16px">
                Sent by <a href="https://monad-terminal.xyz" style="color:#c084fc">Monad Terminal</a>
              </div>
            </div>`,
        }),
      }).catch(() => {});

      // Supabase 업데이트 (반복이면 last_notified만, 아니면 triggered)
      const patch = a.repeat
        ? { armed: false }
        : { triggered: true };
      await fetch(`${SB_URL}/rest/v1/price_alerts?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }

    return res.status(200).json({ ok: true, triggered: triggered.length, price: currentPrice });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
