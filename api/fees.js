// GET /api/fees — ECOTRACK delivery fees (home + stop-desk tariffs per wilaya)

const ECOTRACK_TOKEN = process.env.ECOTRACK_TOKEN
const ECOTRACK_BASE = (process.env.ECOTRACK_BASE_URL || '').replace(/\/+$/, '')

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
    return res.status(500).json({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' })
  }

  try {
    const r = await fetch(`${ECOTRACK_BASE}/api/v1/get/fees`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
    })
    const data = await r.json().catch(() => ({}))
    return res.status(r.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }
}
