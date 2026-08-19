import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { password, data } = req.body || {};
  if (!password || password !== process.env.UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  if (!data) return res.status(400).json({ error: 'No data' });

  try {
    const blob = await put('dashboard-data.json', JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN
    });
    return res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
