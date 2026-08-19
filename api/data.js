import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const { blobs } = await list({ prefix: 'dashboard-data', limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!blobs.length) return res.status(200).json({ url: null });
    return res.status(200).json({ url: blobs[0].url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
