import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Minus, Pencil, Trash2, Search, X, Package, Ruler, Copy, Check, ImageIcon } from 'lucide-react'
import BottomSheet from './BottomSheet'
import ConfirmDialog from './ConfirmDialog'
import { groupVariants } from '../utils/variants'
import { compressImage } from '../utils/compressImage'
// The exact SQL of the migration — one source of truth for the in-app banner.
import SETUP_SQL from '../../supabase/migrations/009_products.sql?raw'

// Form row: color (hex or null), size and quantity kept as strings while typing.
const emptyForm = () => ({ id: null, name: '', price: '', variants: [] })
const emptyRow = (color) => ({ color: color || null, size: '', quantity: '' })

// Brand purple — the colour picker starts here, no hard-coded pink.
const DEFAULT_COLOR = '#6734ff'

// Table missing (PGRST205) or an expected column doesn't exist yet (42703 /
// "column products.price does not exist") — run migration 009.
const needsSetup = (error) =>
  !!error && (
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    /Could not find the (table|column)|does not exist/i.test(error.message || '')
  )

const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s)

// Stock level → colour coding, shared by the cards and the size pills.
const stockTone = (qty) => {
  if (qty <= 0) return { chip: 'bg-red-50 border-red-200 text-red-600', dot: 'bg-red-500', label: 'نفد', qty: 'bg-red-50 text-red-600' }
  if (qty <= 5) return { chip: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500', label: 'منخفض', qty: 'bg-amber-50 text-amber-700' }
  return { chip: 'bg-green-50 border-green-200 text-green-700', dot: 'bg-green-500', label: 'متوفر', qty: 'bg-green-50 text-green-700' }
}

// image_url stores the R2 key (e.g. products/123-abc.webp) or a full URL.
const getProductImageUrl = (stored) => {
  if (!stored) return null
  if (String(stored).startsWith('http')) return stored
  return `/api/image?key=${encodeURIComponent(stored)}`
}

// Compress + upload through the serverless R2 proxy; returns the stored key.
async function uploadProductImage(file) {
  const compressed = await compressImage(file)
  const res = await fetch(`/api/upload?filename=${encodeURIComponent(compressed.name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': compressed.type || 'application/octet-stream',
      'X-Filename': compressed.name,
    },
    body: compressed,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'تعذر رفع الصورة')
  return data.key
}

// Best-effort delete of a product photo from R2 (never blocks the save).
async function deleteProductImage(stored) {
  if (!stored) return
  let key = stored
  if (String(stored).startsWith('http')) {
    try {
      const url = new URL(stored)
      const idx = url.pathname.indexOf('/products/')
      key = idx !== -1 ? url.pathname.slice(idx + 1) : url.pathname.slice(1)
    } catch { /* keep the raw value */ }
  }
  try {
    await fetch('/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
  } catch { /* best effort */ }
}

export default function ProductsSection({ showToast }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [draftColor, setDraftColor] = useState(DEFAULT_COLOR)
  const [saving, setSaving] = useState(false)

  // Product photo: a saved R2 key plus a freshly picked file awaiting upload.
  const [imageKey, setImageKey] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', confirmText: 'حذف', onConfirm: null })
  const [deleting, setDeleting] = useState(false)
  const [triedSubmit, setTriedSubmit] = useState(false)

  const sortByArabicName = (rows) =>
    [...(rows || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'))

  const fetchProducts = async () => {
    // Ask for the exact columns the app needs — if one is missing (partial
    // schema) show the fix banner, but still render whatever rows exist.
    const { data, error } = await supabase.from('products').select('id,name,price,variants,image_url,created_at')
    if (error && needsSetup(error)) {
      setSetupNeeded(true)
      const fallback = await supabase.from('products').select('*')
      setProducts(fallback.error ? [] : sortByArabicName(fallback.data))
      setLoading(false)
      return
    }
    if (error) {
      setProducts([])
      showToast(`تعذر تحميل المنتجات: ${error.message}`)
    } else {
      setSetupNeeded(false)
      setProducts(sortByArabicName(data))
    }
    setLoading(false)
  }

  useEffect(() => { fetchProducts() }, [])

  const releasePreview = (preview) => {
    if (preview && String(preview).startsWith('blob:')) URL.revokeObjectURL(preview)
  }

  const resetImage = () => {
    releasePreview(imagePreview)
    setImageKey(null)
    setImageFile(null)
    setImagePreview(null)
  }

  const openAdd = () => {
    resetImage()
    setForm(emptyForm())
    setDraftColor(DEFAULT_COLOR)
    setTriedSubmit(false)
    setSheetOpen(true)
  }

  const openEdit = (p) => {
    releasePreview(imagePreview)
    setForm({
      id: p.id,
      name: p.name || '',
      price: p.price != null && Number(p.price) > 0 ? String(p.price) : '',
      variants: (Array.isArray(p.variants) ? p.variants : []).map(v => ({
        color: v?.color || null,
        size: v?.size || '',
        quantity: v?.quantity != null ? String(v.quantity) : '',
      })),
    })
    setDraftColor(Array.isArray(p.variants) ? (p.variants.find(v => v?.color)?.color || DEFAULT_COLOR) : DEFAULT_COLOR)
    setImageKey(p.image_url || null)
    setImageFile(null)
    setImagePreview(p.image_url ? getProductImageUrl(p.image_url) : null)
    setTriedSubmit(false)
    setSheetOpen(true)
  }

  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('اختر ملف صورة صالحاً'); return }
    releasePreview(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    releasePreview(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setImageKey(null)
  }

  // ─── Colour picker → appends a ready-to-fill row for that colour ───
  const addColor = () => {
    const color = String(draftColor || '').trim().toLowerCase()
    if (!isHex(color)) { showToast('قيمة لون غير صحيحة'); return }
    if (form.variants.some(v => v.color === color)) { showToast('هذا اللون مضاف مسبقاً'); return }
    setForm(prev => ({ ...prev, variants: [...prev.variants, emptyRow(color)] }))
  }

  const removeColor = (color) => {
    setForm(prev => ({ ...prev, variants: (prev.variants || []).filter(v => v.color !== color) }))
  }

  const addVariant = (color) => {
    setForm(prev => ({ ...prev, variants: [...prev.variants, emptyRow(color)] }))
  }

  const updateVariant = (index, patch) => {
    setForm(prev => ({
      ...prev,
      variants: (prev.variants || []).map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }))
  }

  const removeVariant = (index) => {
    setForm(prev => ({ ...prev, variants: (prev.variants || []).filter((_, i) => i !== index) }))
  }

  const stepQuantity = (index, delta) => {
    setForm(prev => ({
      ...prev,
      variants: (prev.variants || []).map((v, i) => {
        if (i !== index) return v
        const current = v.quantity === '' ? 0 : Number(v.quantity) || 0
        return { ...v, quantity: String(Math.max(0, current + delta)) }
      }),
    }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setTriedSubmit(true)
    if (!form.name.trim()) { showToast('اسم المنتج مطلوب'); return }

    const variants = form.variants
      .map(v => ({
        color: v.color || null,
        size: String(v.size || '').trim() || null,
        quantity: v.quantity === '' ? 0 : Number(v.quantity) || 0,
      }))
      .filter(v => v.color)

    const values = {
      name: form.name.trim(),
      price: Number(form.price) || 0,
      variants,
    }

    setSaving(true)
    try {
      // Upload a newly picked photo before saving the row.
      let finalImageKey = imageKey
      let newlyUploaded = null
      if (imageFile) {
        try {
          newlyUploaded = await uploadProductImage(imageFile)
          finalImageKey = newlyUploaded
        } catch (err) {
          showToast(err.message || 'تعذر رفع صورة المنتج — سيتم الحفظ بدونها')
        }
      }
      values.image_url = finalImageKey

      const run = () => form.id
        ? supabase.from('products').update(values).eq('id', form.id)
        : supabase.from('products').insert(values)

      let { error } = await run()

      // Older schema without image_url: save the rest and prompt the SQL update.
      if (error && /image_url/i.test(error.message || '')) {
        delete values.image_url
        ;({ error } = await run())
        if (!error) setSetupNeeded(true)
      }

      if (error) {
        if (newlyUploaded) await deleteProductImage(newlyUploaded)
        if (needsSetup(error)) {
          setSetupNeeded(true)
          showToast('بنية جدول المنتجات غير مكتملة — نفّذ SQL الظاهر أعلى القائمة')
        } else {
          showToast(`تعذر الحفظ: ${error.message}`)
        }
        return
      }

      // The row now points at the new photo — drop the replaced one from R2.
      if (form.id && imageKey && imageKey !== finalImageKey) {
        await deleteProductImage(imageKey)
      }

      showToast(form.id ? 'تم تعديل المنتج' : 'تمت إضافة المنتج')
      setSheetOpen(false)
      await fetchProducts()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (p) => {
    setConfirmDialog({
      open: true,
      title: 'حذف المنتج',
      message: `هل تريد حذف "${p.name}"؟ الطلبات المحفوظة سابقاً تبقى كما هي.`,
      confirmText: 'حذف',
      onConfirm: async () => {
        setDeleting(true)
        try {
          const { error } = await supabase.from('products').delete().eq('id', p.id)
          if (error) showToast(`تعذر الحذف: ${error.message}`)
          else {
            await deleteProductImage(p.image_url)
            showToast('تم حذف المنتج')
            await fetchProducts()
          }
        } finally {
          setDeleting(false)
          setConfirmDialog(prev => ({ ...prev, open: false }))
        }
      },
    })
  }

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('تعذر النسخ — انسخ الكود يدوياً من supabase/migrations/009_products.sql')
    }
  }

  const filtered = products.filter(p => String(p.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
  const formGroups = groupVariants(form.variants)

  const totalUnits = products.reduce(
    (sum, p) => sum + groupVariants(p.variants).reduce((s, g) => s + g.rows.reduce((x, r) => x + r.quantity, 0), 0),
    0
  )

  // Live totals for the editor header.
  const draftUnits = formGroups.reduce((sum, g) => sum + g.rows.reduce((x, r) => x + r.quantity, 0), 0)
  const draftColorCount = formGroups.length

  return (
    <div dir="rtl">
      {/* ─── Header: catalog overview ─── */}
      <div
        className="relative overflow-hidden rounded-2xl p-4 mb-4 text-white"
        style={{
          background: 'linear-gradient(135deg, #6734ff 0%, #8b5cf6 55%, #a78bfa 100%)',
          boxShadow: '0 8px 28px rgba(103, 52, 255, 0.28)',
        }}
      >
        <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -right-6 w-28 h-28 rounded-full bg-white/10" />

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center shrink-0">
            <Package size={21} strokeWidth={1.9} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-extrabold m-0">مدير المخزون</h2>
            <p className="text-[11px] text-white/75 m-0 mt-0.5">ألوان ومقاسات وكميات تحت سيطرتك</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <div className="rounded-xl bg-white/15 px-2.5 py-1.5 text-center min-w-[52px]">
              <div className="text-base font-extrabold leading-none">{products.length}</div>
              <div className="text-[9px] text-white/75 mt-0.5">منتج</div>
            </div>
            <div className="rounded-xl bg-white/15 px-2.5 py-1.5 text-center min-w-[52px]">
              <div className="text-base font-extrabold leading-none">{totalUnits}</div>
              <div className="text-[9px] text-white/75 mt-0.5">وحدة</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Catalog schema out of date → run the migration SQL ─── */}
      {setupNeeded && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-xs font-bold text-amber-700 leading-relaxed">
              بنية جدول المنتجات لا تطابق التطبيق — نفّذ هذا SQL مرة واحدة في Supabase → SQL Editor:
            </div>
            <button
              onClick={copySql}
              className="shrink-0 h-7 px-2.5 rounded-lg bg-white border border-amber-300 text-amber-700 text-[11px] font-bold flex items-center gap-1 hover:bg-amber-100 transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'تم النسخ' : 'نسخ'}
            </button>
          </div>
          <pre className="m-0 text-[10px] leading-relaxed text-amber-800 bg-white border border-amber-200 rounded-lg p-2 overflow-x-auto" dir="ltr">
{SETUP_SQL}
          </pre>
        </div>
      )}

      {/* ─── Search ─── */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="ابحث عن منتج..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-12 border border-border rounded-2xl pr-11 pl-10 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-all text-sm bg-white shadow-product placeholder:text-subtle/70"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            title="مسح البحث"
            aria-label="مسح البحث"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-100 text-muted grid place-items-center border-0 hover:bg-gray-200"
          >
            <X size={13} />
          </button>
        ) : (
          <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle/60 pointer-events-none" />
        )}
      </div>

      {/* ─── Primary action ─── */}
      <button
        onClick={openAdd}
        className="w-full h-12 rounded-2xl bg-purple text-white font-bold text-sm flex items-center justify-center gap-2 mb-4 hover:bg-purple-2 transition-all shadow-lg shadow-purple/25"
      >
        <Plus size={18} />
        <span>إضافة منتج</span>
      </button>

      {/* ─── Results count ─── */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-subtle mb-2 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple/50" />
            {filtered.length} منتج
          </span>
          {searchQuery && <span>نتائج البحث</span>}
        </div>
      )}

      {/* ─── Product cards ─── */}
      <div className="space-y-2.5">
        {filtered.map(p => {
          const groups = groupVariants(p.variants)
          const swatches = groups.map(g => g.color)
          const totalQty = groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.quantity, 0), 0)
          const sizeCount = new Set(groups.flatMap(g => g.rows.map(r => r.size).filter(Boolean))).size
          const tone = stockTone(totalQty)
          const paletteStyle = swatches.length
            ? {
                background:
                  swatches.length === 1
                    ? swatches[0]
                    : `conic-gradient(from 210deg, ${[...swatches, swatches[0]].join(', ')})`,
              }
            : null
          return (
            <div key={p.id} className="bg-white border border-border rounded-2xl p-4 shadow-product hover:shadow-stat hover:border-purple/25 transition-all">
              <div className="flex gap-3 items-start">
                {/* Photo when present, otherwise a colour-palette avatar */}
                {p.image_url ? (
                  <img
                    src={getProductImageUrl(p.image_url)}
                    alt={p.name}
                    loading="lazy"
                    className="w-12 h-12 shrink-0 rounded-2xl border border-border6 object-cover bg-soft"
                  />
                ) : (
                  <div
                    className="w-12 h-12 shrink-0 rounded-2xl border border-border6 grid place-items-center overflow-hidden"
                    style={paletteStyle || { background: '#f3edff' }}
                  >
                    {!paletteStyle && <Package size={19} className="text-purple" />}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-[15px] text-ink m-0 truncate leading-tight">{p.name}</h4>
                      <div className="text-[11px] text-subtle mt-0.5">
                        {groups.length} لون · {sizeCount} مقاس
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => openEdit(p)}
                        className="w-8 h-8 rounded-lg bg-lav text-purple grid place-items-center border-0 hover:bg-purple/15 transition-colors"
                        title="تعديل"
                        aria-label={`تعديل ${p.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="w-8 h-8 rounded-lg bg-red-50 text-danger grid place-items-center border-0 hover:bg-red-100 transition-colors"
                        title="حذف"
                        aria-label={`حذف ${p.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {Number(p.price) > 0 && (
                      <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 text-[11px] font-bold text-green-700">
                        {Number(p.price).toLocaleString('en-US')} دج
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11px] font-bold ${tone.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                      <span dir="ltr">{totalQty}</span>
                      <span className="opacity-80">{tone.label}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Colour groups → sizes with quantities */}
              {groups.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border2 space-y-2">
                  {groups.map(g => {
                    const colorQty = g.rows.reduce((s, r) => s + r.quantity, 0)
                    const colorTone = stockTone(colorQty)
                    return (
                      <div
                        key={g.color}
                        className="rounded-xl bg-soft border border-border2 p-2.5"
                        style={{ borderRight: `3px solid ${g.color}` }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="w-6 h-6 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                            style={{ background: g.color, border: '1px solid rgba(17,24,39,0.12)' }}
                          />
                          <span className={`mr-auto shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${colorTone.chip}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colorTone.dot}`} />
                            <span dir="ltr">{colorQty}</span>
                          </span>
                        </div>

                        {g.rows.length === 0 ? (
                          <span className="text-[10px] text-subtle">لا مقاسات لهذا اللون</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {g.rows.map(r => {
                              const rowTone = stockTone(r.quantity)
                              return (
                                <div
                                  key={r.index}
                                  className="flex items-stretch overflow-hidden rounded-lg border border-border bg-white shadow-sm"
                                  title={`${r.size || 'بدون مقاس'} — ${r.quantity} قطعة`}
                                >
                                  <span className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-meta2">
                                    <Ruler size={9} className="text-subtle/70" />
                                    {r.size || '—'}
                                  </span>
                                  <span
                                    className={`flex items-center justify-center min-w-[26px] px-1.5 text-[11px] font-extrabold border-r border-border ${rowTone.qty}`}
                                    dir="ltr"
                                  >
                                    {r.quantity}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {groups.length === 0 && (
                <div className="mt-3 pt-3 border-t border-border2 text-[11px] text-subtle">
                  بدون ألوان أو مقاسات — اضغط تعديل لإضافتها.
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ─── Loading ─── */}
      {loading && (
        <div className="space-y-2.5" aria-busy="true" aria-label="جاري تحميل المنتجات">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-border rounded-2xl p-4 shadow-product flex gap-3">
              <div className="skeleton w-12 h-12 shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!loading && !setupNeeded && filtered.length === 0 && (
        <div className="text-center py-14">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-4 grid place-items-center bg-lav">
            <Package size={32} className="text-purple" />
          </div>
          <p className="font-extrabold text-ink text-lg m-0">
            {searchQuery ? 'لا نتائج' : 'لا منتجات بعد'}
          </p>
          <p className="text-sm mt-1 text-subtle">
            {searchQuery ? 'جرّب كلمة أخرى' : 'أضف أول منتج بألوانه ومقاساته وكمياته'}
          </p>
          {!searchQuery && (
            <button
              onClick={openAdd}
              className="mt-5 h-11 px-5 rounded-xl bg-lav text-purple font-bold text-sm inline-flex items-center gap-1.5 border-0 hover:bg-purple/10 transition-colors"
            >
              <Plus size={16} />
              إضافة منتج
            </button>
          )}
        </div>
      )}

      {/* ─── Bottom sheet: add / edit product ─── */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={form.id ? 'تعديل المنتج' : 'منتج جديد'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {/* Live summary */}
          <div className="flex items-center gap-2 rounded-xl bg-lav border border-border3 px-3 py-2">
            <span className="text-[11px] font-bold text-purple">
              {draftColorCount} لون
            </span>
            <span className="w-1 h-1 rounded-full bg-purple/30" />
            <span className="text-[11px] font-bold text-purple" dir="ltr">{draftUnits} قطعة</span>
            <span className="flex-1" />
            <span className="text-[10px] text-purple/70">الإجمالي</span>
          </div>

          {/* Product photo */}
          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">صورة المنتج</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 shrink-0 rounded-2xl border border-border bg-soft overflow-hidden grid place-items-center">
                {imagePreview ? (
                  <img src={imagePreview} alt="معاينة صورة المنتج" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={22} className="text-subtle/50" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <label className="h-10 rounded-xl bg-lav text-purple border-0 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-purple/10 transition-colors">
                  <ImageIcon size={14} />
                  {imagePreview ? 'تغيير الصورة' : 'رفع صورة'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                    className="hidden"
                    aria-label="رفع صورة المنتج"
                  />
                </label>
                {imagePreview ? (
                  <button
                    type="button"
                    onClick={removeImage}
                    className="w-full h-9 rounded-xl bg-red-50 text-danger border-0 font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={12} />
                    إزالة الصورة
                  </button>
                ) : (
                  <p className="text-[10px] text-subtle m-0 leading-relaxed">
                    اختياري — تُضغط الصورة وتُحفظ بأفضل حجم.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">
              اسم المنتج <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: قميص قطني"
              required
              className={`w-full h-11 border rounded-xl px-3.5 outline-none transition-colors text-sm bg-white placeholder:text-subtle/60 ${
                triedSubmit && !form.name.trim() ? 'border-danger focus:border-danger' : 'border-border focus:border-purple focus:ring-2 focus:ring-purple/10'
              }`}
            />
            {triedSubmit && !form.name.trim() && (
              <p className="text-[11px] text-danger m-0 mt-1">اسم المنتج مطلوب</p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">السعر الافتراضي (دج)</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="0"
              dir="ltr"
              className="no-spinner w-full h-11 border border-border rounded-xl px-3.5 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-colors text-sm bg-white"
            />
            <p className="text-[10px] text-subtle m-0 mt-1">اختياري — يُعبّأ تلقائياً عند إضافة الطلب.</p>
          </div>

          {/* Colour picker */}
          <div className="rounded-2xl border border-border bg-soft p-3">
            <label className="block text-sm font-bold text-ink mb-2">إضافة لون</label>
            <div className="flex items-stretch gap-2">
              <div className="relative shrink-0">
                <input
                  type="color"
                  value={isHex(draftColor) ? draftColor : DEFAULT_COLOR}
                  onChange={(e) => setDraftColor(e.target.value)}
                  className="w-12 h-11 border border-border rounded-xl p-1 bg-white cursor-pointer"
                  title="منتقي الألوان"
                  aria-label="اختر لوناً"
                />
              </div>
              <button
                type="button"
                onClick={addColor}
                className="flex-1 h-11 px-3.5 rounded-xl bg-purple text-white border-0 font-bold text-xs flex items-center justify-center gap-1 hover:bg-purple-2 transition-colors shrink-0"
              >
                <Plus size={14} />
                إضافة
              </button>
            </div>
            <p className="text-[10px] text-subtle m-0 mt-1.5">اختر لوناً ثم أضف مقاساته وكمياته.</p>
          </div>

          {/* Colours → sizes → quantities */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-ink">الألوان والمقاسات</span>
              {formGroups.length > 0 && (
                <span className="text-[10px] text-subtle">{formGroups.length} لون</span>
              )}
            </div>

            {formGroups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border7 bg-white p-5 text-center">
                <p className="text-[11px] text-subtle m-0">لا ألوان بعد — أضف لوناً من الأعلى ثم مقاساته.</p>
              </div>
            )}

            {formGroups.map(g => {
              const colorQty = g.rows.reduce((s, r) => s + r.quantity, 0)
              return (
                <div
                  key={g.color}
                  className="rounded-2xl border border-border bg-white overflow-hidden"
                  style={{ borderRight: `4px solid ${g.color}` }}
                >
                  {/* Colour header */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-soft border-b border-border2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-6 h-6 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                        style={{ background: g.color, border: '1px solid rgba(17,24,39,0.12)' }}
                      />
                      <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${stockTone(colorQty).chip}`} dir="ltr">
                        {colorQty}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => addVariant(g.color)}
                        className="h-8 px-2 rounded-lg bg-lav text-purple border-0 hover:bg-purple/10 transition-colors flex items-center gap-1 text-[11px] font-bold"
                      >
                        <Plus size={12} />
                        مقاس
                      </button>
                      <button
                        type="button"
                        onClick={() => removeColor(g.color)}
                        className="w-8 h-8 rounded-lg bg-red-50 text-danger border-0 grid place-items-center hover:bg-red-100 transition-colors"
                        title="حذف اللون مع مقاساته"
                        aria-label="حذف اللون مع مقاساته"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Size rows */}
                  <div className="p-2.5 space-y-1.5">
                    {g.rows.length === 0 && (
                      <p className="text-[11px] text-subtle text-center m-0 py-2">لا مقاسات — اضغط «مقاس» لإضافة واحد.</p>
                    )}
                    {g.rows.map(r => (
                      <div key={r.index} className="flex items-center gap-1.5 rounded-xl bg-soft/70 border border-border2 p-1.5">
                        <input
                          type="text"
                          value={r.size || ''}
                          onChange={(e) => updateVariant(r.index, { size: e.target.value })}
                          placeholder="المقاس (M، 42...)"
                          className="flex-1 min-w-0 h-11 border border-border rounded-lg px-3 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-colors text-sm bg-white"
                        />

                        {/* Quantity stepper */}
                        <div className="flex items-center h-11 rounded-xl border border-border7 bg-white overflow-hidden shrink-0 shadow-sm">
                          <button
                            type="button"
                            onClick={() => stepQuantity(r.index, -1)}
                            className="w-8 h-full grid place-items-center border-0 bg-white text-subtle hover:bg-gray-50 transition-colors"
                            aria-label="إنقاص الكمية"
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={form.variants[r.index]?.quantity ?? ''}
                            onChange={(e) => updateVariant(r.index, { quantity: e.target.value })}
                            placeholder="0"
                            dir="ltr"
                            className="no-spinner w-11 h-full text-center border-0 outline-none text-[15px] font-extrabold text-purple bg-lav/40"
                            aria-label="الكمية"
                          />
                          <button
                            type="button"
                            onClick={() => stepQuantity(r.index, 1)}
                            className="w-8 h-full grid place-items-center border-0 bg-white text-purple hover:bg-lav transition-colors"
                            aria-label="زيادة الكمية"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeVariant(r.index)}
                          className="w-9 h-11 rounded-lg bg-red-50 text-danger border-0 grid place-items-center hover:bg-red-100 transition-colors shrink-0"
                          title="حذف المقاس"
                          aria-label="حذف المقاس"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sticky actions */}
          <div className="sticky bottom-0 bg-white pt-3 pb-1 z-10 -mx-1 px-1">
            <button
              type="submit"
              disabled={saving}
              className="w-full h-[52px] border-0 rounded-xl bg-purple text-white font-bold hover:bg-purple-2 transition-colors disabled:opacity-60 text-base shadow-lg shadow-purple/25 flex items-center justify-center gap-2"
            >
              {saving && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {saving ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full h-[48px] border-0 bg-gray-100 rounded-xl mt-2 hover:bg-gray-200 transition-colors text-base"
            >
              إلغاء
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        loading={deleting}
      />
    </div>
  )
}
