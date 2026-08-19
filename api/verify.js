export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { password } = req.body || {};
  if (!password || password !== process.env.UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  return res.status(200).json({ ok: true });
}
