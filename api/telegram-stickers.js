// Vercel serverless — Telegram ChogStikers sticker set proxy
// 환경변수 TELEGRAM_BOT_TOKEN 필요
// Vercel 대시보드 → Settings → Environment Variables 에서 설정

const TG_API = 'https://api.telegram.org';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
  }

  const setName = req.query.set || 'ChogStikers';

  try {
    // 1. 스티커 팩 정보 가져오기
    const setRes = await fetch(
      `${TG_API}/bot${token}/getStickerSet?name=${encodeURIComponent(setName)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const setData = await setRes.json();

    if (!setData.ok) {
      return res.status(404).json({ error: setData.description || 'Sticker set not found' });
    }

    const stickers = setData.result.stickers;

    // 2. 각 스티커의 file_path 가져오기 (최대 30개)
    const list = await Promise.all(
      stickers.slice(0, 30).map(async (s) => {
        try {
          const fileRes = await fetch(
            `${TG_API}/bot${token}/getFile?file_id=${s.file_id}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const fileData = await fileRes.json();
          const filePath = fileData.ok ? fileData.result.file_path : null;
          return {
            file_id:        s.file_id,
            file_unique_id: s.file_unique_id,
            emoji:          s.emoji || '🟣',
            type:           s.type,
            is_animated:    s.is_animated,
            is_video:       s.is_video,
            ext: s.is_video ? 'webm' : s.is_animated ? 'tgs' : 'webp',
            file_path: filePath,
          };
        } catch (_) {
          return { file_id: s.file_id, file_unique_id: s.file_unique_id, emoji: s.emoji || '🟣', ext: 'webp', file_path: null };
        }
      })
    );

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ ok: true, set_name: setName, stickers: list });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
