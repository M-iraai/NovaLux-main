// ECOTRACK order proxy — same behaviour as the /api/orders middleware in vite.config.js
//   POST   → create order  (ECOTRACK POST  /api/v1/create/order)
//   PATCH  → update order  (ECOTRACK POST  /api/v1/update/order)   body.tracking required
//   DELETE → delete order  (ECOTRACK DELETE /api/v1/delete/order)  body.tracking required

const ECOTRACK_TOKEN = process.env.ECOTRACK_TOKEN
const ECOTRACK_BASE = (process.env.ECOTRACK_BASE_URL || '').replace(/\/+$/, '')

function toQuery(fields) {
  const params = new URLSearchParams()
  Object.entries(fields || {}).forEach(([k, v]) => {
    if (v === '' || v === null || v === undefined) return
    params.set(k, String(v))
  })
  return params.toString()
}

async function ecotrack(path, method, fields) {
  const qs = toQuery(fields)
  const res = await fetch(`${ECOTRACK_BASE}${path}${qs ? `?${qs}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

// EcoTrack answers some failures with HTTP 200 + { success: false } — normalise
// so the client can rely on res.ok.
function statusCode(status, data) {
  const failed = status < 200 || status >= 300 || data?.success === false
  if (!failed) return 200
  return status >= 400 ? status : 502
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
    return res.status(500).json({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' })
  }
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body || {}

    if (req.method === 'POST') {
      const { status, data } = await ecotrack('/api/v1/create/order', 'POST', body)
      return res.status(statusCode(status, data)).json(data || {})
    }

    if (req.method === 'PATCH') {
      if (!body.tracking) return res.status(400).json({ success: false, message: 'tracking مطلوب' })
      const { status, data } = await ecotrack('/api/v1/update/order', 'POST', body)
      return res.status(statusCode(status, data)).json(data || {})
    }

    const tracking = body.tracking || req.query?.tracking
    if (!tracking) return res.status(400).json({ success: false, message: 'tracking مطلوب' })
    const { status, data } = await ecotrack('/api/v1/delete/order', 'DELETE', { tracking })
    return res.status(statusCode(status, data)).json(data || {})
  } catch (err) {
    return res.status(502).json({ error: err.message || 'ECOTRACK request failed' })
  }
}
