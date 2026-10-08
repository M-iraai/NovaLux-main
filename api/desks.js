// GET /api/desks — ECOTRACK stop desks
// Returns every active desk in the country as { my_desk, other_desks } —
// normalised here and filtered per wilaya by the caller.

const ECOTRACK_TOKEN = process.env.ECOTRACK_TOKEN
const ECOTRACK_BASE = (process.env.ECOTRACK_BASE_URL || '').replace(/\/+$/, '')

function normalizeDesks(raw) {
  const rows = []
  if (Array.isArray(raw)) {
    rows.push(...raw)
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.other_desks)) rows.push(...raw.other_desks)
    if (Array.isArray(raw.desks)) rows.push(...raw.desks)
    if (Array.isArray(raw.data)) rows.push(...raw.data)
    if (raw.my_desk && typeof raw.my_desk === 'object') {
      const m = raw.my_desk
      const loc = m.location || {}
      rows.push({
        id: m.hub_id,
        name: m.hub_name,
        wilaya: loc.wilaya,
        code_wilaya: loc.code_wilaya,
        commune: loc.commune,
        adresse: loc.adresse,
        phone: loc.phone,
        map: loc.map,
      })
    }
    if (!rows.length) rows.push(...Object.values(raw).filter(v => v && typeof v === 'object' && !Array.isArray(v)))
  }

  const out = []
  for (const d of rows) {
    const desk = {
      id: d.id ?? d.hub_id ?? d.desk_id ?? d.stopdesk_id ?? '',
      name: d.name ?? d.nom ?? d.hub_name ?? '',
      commune: d.commune ?? d.commune_name ?? d.nom_commune ?? '',
      address: d.adresse ?? d.address ?? '',
      wilayaId: d.code_wilaya ?? d.wilaya_id ?? '',
      wilayaName: d.wilaya ?? d.wilaya_name ?? '',
      phone: d.phone ?? '',
      map: d.map ?? '',
    }
    if (!desk.name && !desk.commune) continue
    if (!desk.name) desk.name = desk.commune
    out.push(desk)
  }
  return out
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
    return res.status(500).json({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' })
  }

  try {
    const r = await fetch(`${ECOTRACK_BASE}/api/v1/get/desks`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
    })
    const data = r.ok ? await r.json().catch(() => null) : null
    const desks = normalizeDesks(data)
    if (!desks.length) return res.status(502).json({ available: false, desks: [] })
    return res.status(200).json({ available: true, desks })
  } catch (err) {
    return res.status(502).json({ available: false, desks: [], error: err.message })
  }
}
