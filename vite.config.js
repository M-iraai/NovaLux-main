import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import 'dotenv/config'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.R2_BUCKET
const ECOTRACK_TOKEN = process.env.ECOTRACK_TOKEN
const ECOTRACK_BASE = (process.env.ECOTRACK_BASE_URL || '').replace(/\/+$/, '')

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

// ECOTRACK stop desks — GET /api/v1/get/desks returns every active desk in the
// country as { my_desk: {...}, other_desks: [...] }, so the caller filters by wilaya.
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

function r2Plugin() {
  return {
    name: 'r2-api',
    configureServer(server) {
      // POST /api/upload — upload file to R2, return the key
      server.middlewares.use('/api/upload', (req, res, next) => {
        if (req.method !== 'POST') return next()
        readBody(req).then(body => {
          const ct = req.headers['content-type'] || 'application/octet-stream'
          const cd = req.headers['content-disposition'] || ''
          const m = cd.match(/filename=\"?([^\";\\n]+)\"?/)
          const fname = m ? m[1] : 'upload'
          const ext = fname.split('.').pop() || 'bin'
          const key = `products/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`

          return r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: ct }))
            .then(() => {
              console.log(`[R2] Uploaded ${key} (${body.length} bytes)`)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ key }))
            })
        }).catch(err => {
          console.error('[R2] Upload error:', err.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // DELETE /api/delete
      server.middlewares.use('/api/delete', (req, res, next) => {
        if (req.method !== 'DELETE') return next()
        readJSON(req).then(body => {
          if (!body.key) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'key required' }))
          }
          return r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: body.key }))
            .then(() => {
              console.log(`[R2] Deleted ${body.key}`)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            })
        }).catch(err => {
          console.error('[R2] Delete error:', err.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // GET /api/image?key=xxx — serve image from R2
      server.middlewares.use('/api/image', (req, res, next) => {
        if (req.method !== 'GET') return next()
        try {
          const u = new URL(req.url, 'http://localhost')
          const key = u.searchParams.get('key')
          if (!key) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'key required' }))
          }

          r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
            .then(response => {
              const ct = response.ContentType || 'application/octet-stream'
              const chunks = []
              response.Body.on('data', chunk => chunks.push(chunk))
              response.Body.on('end', () => {
                res.setHeader('Content-Type', ct)
                res.setHeader('Cache-Control', 'public, max-age=86400')
                res.end(Buffer.concat(chunks))
              })
              response.Body.on('error', err => {
                console.error('[R2] Stream error:', err.message)
                res.statusCode = 500
                res.end()
              })
            })
            .catch(err => {
              console.error('[R2] Image not found:', key, err.message)
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Image not found' }))
            })
        } catch (err) {
          res.statusCode = 500
          res.end()
        }
      })

      // GET /api/fees — ECOTRACK delivery fees
      server.middlewares.use('/api/fees', (req, res, next) => {
        if (req.method !== 'GET') return next()
        if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' }))
        }
        fetch(`${ECOTRACK_BASE}/api/v1/get/fees`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
        })
        .then(r => r.json())
        .then(data => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        })
        .catch(err => {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // GET /api/wilayas — ECOTRACK wilayas list
      server.middlewares.use('/api/wilayas', (req, res, next) => {
        if (req.method !== 'GET') return next()
        if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' }))
        }
        fetch(`${ECOTRACK_BASE}/api/v1/get/wilayas`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
        })
        .then(r => r.json())
        .then(data => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        })
        .catch(err => {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // GET /api/desks — ECOTRACK stop desks (whole country; the UI filters by wilaya)
      server.middlewares.use('/api/desks', (req, res, next) => {
        if (req.method !== 'GET') return next()
        if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' }))
        }
        fetch(`${ECOTRACK_BASE}/api/v1/get/desks`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
        })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            const desks = normalizeDesks(data)
            res.statusCode = desks.length ? 200 : 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(desks.length ? { available: true, desks } : { available: false, desks: [] }))
          })
          .catch(err => {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ available: false, desks: [], error: err.message }))
          })
      })

      // GET /api/communes — ECOTRACK communes list (optional ?wilaya_id=)
      server.middlewares.use('/api/communes', (req, res, next) => {
        if (req.method !== 'GET') return next()
        if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' }))
        }
        const u = new URL(req.url, 'http://localhost')
        const wid = u.searchParams.get('wilaya_id')
        const url = `${ECOTRACK_BASE}/api/v1/get/communes${wid ? `?wilaya_id=${encodeURIComponent(wid)}` : ''}`
        fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
        })
        .then(r => r.json())
        .then(data => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        })
        .catch(err => {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // /api/orders — ECOTRACK order operations (params go in the query string)
      //   POST   → create order
      //   PATCH  → update order (body.tracking required)
      //   DELETE → delete order (body.tracking required)
      server.middlewares.use('/api/orders', (req, res, next) => {
        if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') return next()
        if (!ECOTRACK_TOKEN || !ECOTRACK_BASE) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'ECOTRACK_TOKEN or ECOTRACK_BASE_URL missing' }))
        }

        const ecotrack = (path, method, fields) => {
          const params = new URLSearchParams()
          Object.entries(fields || {}).forEach(([k, v]) => {
            if (v === '' || v === null || v === undefined) return
            params.set(k, String(v))
          })
          const qs = params.toString()
          return fetch(`${ECOTRACK_BASE}${path}${qs ? `?${qs}` : ''}`, {
            method,
            headers: { Authorization: `Bearer ${ECOTRACK_TOKEN}`, Accept: 'application/json' },
          }).then(r => r.json().catch(() => ({})).then(data => ({ status: r.status, data })))
        }

        // EcoTrack answers some failures with HTTP 200 + { success: false }.
        // Normalise so the client can rely on res.ok.
        const finish = (status, data) => {
          const failed = status < 200 || status >= 300 || data?.success === false
          res.statusCode = failed ? (status >= 400 ? status : 502) : 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data || {}))
        }

        readJSON(req).then(body => {
          if (req.method === 'POST') {
            return ecotrack('/api/v1/create/order', 'POST', body).then(({ status, data }) => finish(status, data))
          }

          if (req.method === 'PATCH') {
            if (!body?.tracking) return finish(400, { success: false, message: 'tracking مطلوب' })
            return ecotrack('/api/v1/update/order', 'POST', body).then(({ status, data }) => finish(status, data))
          }

          // DELETE — tracking from the body, or as a fallback from the query string
          let tracking = body?.tracking || null
          if (!tracking) {
            try {
              tracking = new URL(req.originalUrl || req.url || '/', 'http://localhost').searchParams.get('tracking')
            } catch { tracking = null }
          }
          if (!tracking) return finish(400, { success: false, message: 'tracking مطلوب' })
          return ecotrack('/api/v1/delete/order', 'DELETE', { tracking }).then(({ status, data }) => finish(status, data))
        }).catch(err => {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        })
      })

      // GET /api/health
      server.middlewares.use('/api/health', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'ok', bucket: BUCKET }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), r2Plugin()],
})
