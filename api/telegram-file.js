// Vercel serverless — Telegram 스티커 이미지 프록시
// file_id를 받아 getFile → 이미지 다운로드 후 반환
// 사용: /api/telegram-file?id=FILE_ID

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).send('TELEGRAM_BOT_TOKEN not set');

  const { id } = req.query;
  if (!id || !/^[\w\-]+$/.test(id)) return res.status(400).send('Invalid file_id');

  try {
    // 1. file_id → file_path 조회
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${id}`);
    const info = await infoRes.json();
    if (!info.ok || !info.result.file_path) return res.status(404).send('File not found');

    // 2. 실제 파일 다운로드
    const fileUrl = `https://api.telegram.org/file/bot${token}/${info.result.file_path}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return res.status(fileRes.status).send('Download failed');

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buf = await fileRes.arrayBuffer();
    return res.send(Buffer.from(buf));
  } catch (err) {
    return res.status(500).send(err.message);
  }
};
