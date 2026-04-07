// Vercel serverless — Telegram 스티커 팩 목록 반환
// file_path 개별 조회 없이 기본 정보만 빠르게 반환
// 이미지는 /api/telegram-file?id=FILE_ID 로 lazy 로드

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' });
  }

  const setName = req.query.set || 'ChogStikers';

  try {
    const r = await fetch(
      `https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(setName)}`
    );
    const data = await r.json();

    if (!data.ok) {
      return res.status(404).json({ ok: false, error: data.description });
    }

    const stickers = data.result.stickers.slice(0, 30).map(s => ({
      file_id:        s.file_id,
      file_unique_id: s.file_unique_id,
      emoji:          s.emoji || '🟣',
      is_animated:    !!s.is_animated,
      is_video:       !!s.is_video,
      ext: s.is_video ? 'webm' : s.is_animated ? 'tgs' : 'webp',
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ ok: true, stickers });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
