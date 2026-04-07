// Vercel serverless — Telegram 스티커 파일 프록시
// 봇 토큰을 프론트엔드에 노출하지 않고 이미지를 제공
// 사용: /api/telegram-file?path=stickers/file_xxx.webp

const TG_FILE_BASE = 'https://api.telegram.org/file';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).send('TELEGRAM_BOT_TOKEN not set');

  const { path } = req.query;
  if (!path || typeof path !== 'string') return res.status(400).send('Missing path');

  // 경로 검증 (path traversal 방지)
  if (path.includes('..') || path.includes('//') || !/^[\w\/\-\.]+$/.test(path)) {
    return res.status(400).send('Invalid path');
  }

  try {
    const url = `${TG_FILE_BASE}/bot${token}/${path}`;
    const fileRes = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!fileRes.ok) return res.status(fileRes.status).send('File fetch failed');

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buf = await fileRes.arrayBuffer();
    return res.send(Buffer.from(buf));
  } catch (err) {
    return res.status(500).send(err.message);
  }
};
