// Vercel serverless — Resend email for price alerts (CommonJS)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, direction, target, current } = req.body || {};
  if (!to || !direction || !target || !current) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const subject = `🔔 CHOG Price Alert — ${direction} ${target}`;
  const html = `
    <div style="font-family:monospace;background:#0e0e16;color:#e2e8f0;padding:24px;border-radius:12px;max-width:400px">
      <div style="font-size:22px;font-weight:700;color:#c084fc;margin-bottom:12px">🔔 CHOG Price Alert</div>
      <div style="font-size:15px;margin-bottom:8px">
        Price is <b style="color:${direction.includes('Above') ? '#4ade80' : '#f87171'}">${direction}</b> your target
      </div>
      <div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:12px 0">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">TARGET</div>
        <div style="font-size:20px;font-weight:700">${target}</div>
      </div>
      <div style="background:#1a1a2e;border-radius:8px;padding:12px;margin:12px 0">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">CURRENT PRICE</div>
        <div style="font-size:20px;font-weight:700;color:#c084fc">${current}</div>
      </div>
      <div style="font-size:11px;color:#475569;margin-top:16px">
        Sent by <a href="https://monad-terminal.xyz/chog" style="color:#c084fc">CHOG Terminal</a>
      </div>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CHOG Terminal <alerts@monad-terminal.xyz>',
        to: [to],
        subject,
        html,
      }),
    });

    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.message || 'Resend error' });
    return res.status(200).json({ ok: true, id: d.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
