export default async function handler(req, res) {
  const vars = Object.keys(process.env).filter(k => k.includes('BLOB'));
  return res.status(200).json({ blob_vars: vars });
}
