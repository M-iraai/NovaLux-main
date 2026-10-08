import { createServer } from 'node:http'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import 'dotenv/config'
console.log('[server] ECOTRACK_TOKEN loaded:', Boolean(process.env.ECOTRACK_TOKEN), '| ECOTRACK_BASE_URL:', Boolean(process.env.ECOTRACK_BASE_URL))

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.R2_BUCKET
const PUBLIC_URL = process.env.R2_PUBLIC_URL

// ECOTRACK stop desks — GET /api/v1/get/desks returns every active desk in the
// country as { my_desk: {...}, other_desks: [...] }, so the caller filters by wilaya.
function normalizeDesks(raw) {
  const out = []
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
        phone2: loc.phone2,
        map: loc.map,
      })
    }
    if (!rows.length) rows.push(...Object.values(raw).filter(v => v && typeof v === 'object' && !Array.isArray(v)))
  }
  for (const d of rows) {
    const desk = {
      id: d.id ?? d.hub_id ?? d.desk_id ?? d.stopdesk_id ?? '',
      name: d.name ?? d.nom ?? d.hub_name ?? '',
      commune: d.commune ?? d.commune_name ?? d.nom_commune ?? '',
      address: d.adresse ?? d.address ?? '',
      phone: d.phone ?? d.phone2 ?? '',
      wilayaId: d.code_wilaya ?? d.wilaya_id ?? '',
      wilayaName: d.wilaya ?? d.wilaya_name ?? '',
      map: d.map ?? '',
    }
    if (!desk.name && !desk.commune) continue
    if (!desk.name) desk.name = desk.commune
    out.push(desk)
  }
  return out
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
}

function sendJSON(res, code, obj) {
  cors(res)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const parts = []
    req.on('data', p => parts.push(p))
    req.on('end', () => ok(Buffer.concat(parts)))
    req.on('error', fail)
  })
}

function readJSON(req) {
  return new Promise((ok) => {
    const parts = []
    req.on('data', p => parts.push(p))
    req.on('end', () => {
      try { ok(JSON.parse(Buffer.concat(parts).toString())) }
      catch { ok({}) }
    })
    req.on('error', () => ok({}))
  })
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      cors(res)
      res.writeHead(204)
      res.end()
      return
    }

    // POST /api/upload — raw body straight to R2
    if (req.method === 'POST' && req.url === '/api/upload') {
      const body = await readBody(req)
      const ct = req.headers['content-type'] || 'application/octet-stream'
      const cd = req.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^";\n]+)"?/)
      const fname = match ? match[1] : 'upload'
      const ext = fname.split('.').pop() || 'bin'
      const key = `products/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`

      await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: ct }))
      console.log(`[R2] Uploaded ${key} (${body.length} bytes)`)
      sendJSON(res, 200, { publicUrl: `${PUBLIC_URL}/${key}`, key })
      return
    }

    // DELETE /api/delete
    if (req.method === 'DELETE' && req.url === '/api/delete') {
      const body = await readJSON(req)
      if (!body.key) { sendJSON(res, 400, { error: 'key required' }); return }
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: body.key }))
      console.log(`[R2] Deleted ${body.key}`)
      sendJSON(res, 200, { success: true })
      return
    }

    // GET /api/image?key=xxx
    if (req.method === 'GET' && req.url.startsWith('/api/image')) {
      const u = new URL(req.url, 'http://localhost')
      const key = u.searchParams.get('key')
      if (!key) { sendJSON(res, 400, { error: 'key required' }); return }

      const resp = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      const ct = resp.ContentType || 'application/octet-stream'
      const chunks = []
      for await (const c of resp.Body) chunks.push(c)

      cors(res)
      res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' })
      res.end(Buffer.concat(chunks))
      return
    }

    // GET /api/health
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJSON(res, 200, { status: 'ok', bucket: BUCKET })
      return
    }

    // GET /api/desks — ECOTRACK stop desks (whole country; the UI filters by wilaya)
    if (req.method === 'GET' && req.url === '/api/desks') {
      if (!ECOTRACK_TOKEN || !ECOTRACK_BASE_URL) {
        sendJSON(res, 500, { error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' })
        return
      }
      fetch(`${ECOTRACK_BASE_URL}/api/v1/get/desks`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          const desks = normalizeDesks(data)
          const code = desks.length ? 200 : 502
          sendJSON(res, code, desks.length ? { available: true, desks } : { available: false, desks: [] })
        })
        .catch(err => sendJSON(res, 502, { available: false, desks: [], error: err.message }))
      return
    }

    sendJSON(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error('[R2] Error:', err.message)
    try {
      if (!res.headersSent) sendJSON(res, 500, { error: err.message })
    } catch {}
  }
})

server.on('error', (err) => {
  console.error('[R2] Server error:', err.message)
})

process.on('uncaughtException', (err) => console.error('[R2] Uncaught:', err.message))
process.on('unhandledRejection', (err) => console.error('[R2] Unhandled:', err?.message || err))

const PORT = 3001
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[R2] Server running on http://localhost:${PORT}`)
})
