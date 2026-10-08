import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, X, Package, Ruler, Copy, Check } from 'lucide-react'
import BottomSheet from './BottomSheet'
import ConfirmDialog from './ConfirmDialog'
import { groupVariants } from '../utils/variants'
import { colorLabel } from '../utils/colorName'
// The exact SQL of the migration — one source of truth for the in-app banner.
import SETUP_SQL from '../../supabase/migrations/009_products.sql?raw'

// Form row: color (hex or null), size and quantity kept as strings while typing.
const emptyForm = () => ({ id: null, name: '', price: '', variants: [] })
const emptyRow = (color) => ({ color: color || null, size: '', quantity: '' })

// Table missing (PGRST205) or an expected column doesn't exist yet (42703 /
// "column products.price does not exist") — run migration 009.
const needsSetup = (error) =>
  !!error && (
    error.code === 'PGRST205' ||
    error.code === '42703' ||
    /Could not find the (table|column)|does not exist/i.test(error.message || '')
  )

const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s)

export default function ProductsSection({ showToast }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [draftColor, setDraftColor] = useState('#e91e63')
  const [saving, setSaving] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', confirmText: 'حذف', onConfirm: null })
  const [deleting, setDeleting] = useState(false)
  const [triedSubmit, setTriedSubmit] = useState(false)

  const sortByArabicName = (rows) =>
    [...(rows || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'))

  const fetchProducts = async () => {
    // Ask for the exact columns the app needs — if one is missing (partial
    // schema) show the fix banner, but still render whatever rows exist.
    const { data, error } = await supabase.from('products').select('id,name,price,variants,created_at')
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

  const openAdd = () => { setForm(emptyForm()); setDraftColor('#e91e63'); setTriedSubmit(false); setSheetOpen(true) }

  const openEdit = (p) => {
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
    setDraftColor(Array.isArray(p.variants) ? (p.variants.find(v => v?.color)?.color || '#e91e63') : '#e91e63')
    setTriedSubmit(false)
    setSheetOpen(true)
  }

  // ─── Colour picker → appends a ready-to-fill row for that colour ───
  const addColor = () => {
    const color = String(draftColor || '').trim().toLowerCase()
    if (!isHex(color)) { showToast('قيمة لون غير صحيحة — مثال: #ff0000'); return }
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
      const { error } = form.id
        ? await supabase.from('products').update(values).eq('id', form.id)
        : await supabase.from('products').insert(values)

      if (error) {
        if (needsSetup(error)) {
          setSetupNeeded(true)
          showToast('بنية جدول المنتجات غير مكتملة — نفّذ SQL الظاهر أعلى القائمة')
        } else {
          showToast(`تعذر الحفظ: ${error.message}`)
        }
        return
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

  return (
    <div>
      {/* Add button */}
      <button
        onClick={openAdd}
        className="w-full h-11 rounded-xl bg-purple text-white font-bold text-sm flex items-center justify-center gap-2 mb-4 hover:bg-purple-2 transition-all shadow-lg shadow-purple/20"
      >
        <Plus size={18} />
        <span>إضافة منتج</span>
      </button>

      {/* Catalog schema out of date → run the migration SQL */}
      {setupNeeded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 mb-4">
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

      {/* Search */}
      {(
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="ابحث عن منتج..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 border border-border rounded-xl px-4 pl-10 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-all text-sm bg-white"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              title="مسح البحث"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 text-muted grid place-items-center border-0 hover:bg-gray-200"
            >
              <X size={13} />
            </button>
          ) : (
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          )}
        </div>
      )}

      {/* Product cards */}
      <div className="space-y-2.5" dir="rtl">
        {filtered.map(p => {
          const groups = groupVariants(p.variants)
          const swatches = groups.map(g => g.color)
          const totalQty = groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.quantity, 0), 0)
          const sizeCount = new Set(groups.flatMap(g => g.rows.map(r => r.size).filter(Boolean))).size
          const paletteStyle = swatches.length
            ? {
                background:
                  swatches.length === 1
                    ? swatches[0]
                    : `conic-gradient(from 210deg, ${[...swatches, swatches[0]].join(', ')})`,
              }
            : null
          return (
          <div key={p.id} className="bg-white border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex gap-3">
              {/* Colour-palette avatar: solid for one colour, pie for several */}
              <div
                className="w-11 h-11 shrink-0 rounded-xl border border-border6 grid place-items-center overflow-hidden"
                style={paletteStyle || undefined}
              >
                {!paletteStyle && <Package size={18} className="text-purple" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <h4 className="font-bold text-base text-ink m-0 truncate">{p.name}</h4>
                    {Number(p.price) > 0 && (
                      <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 text-xs font-semibold text-green-700">
                        {Number(p.price)} دج
                      </span>
                    )}
                    {totalQty > 0 && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1 text-xs font-semibold text-blue-600" dir="ltr">
                        📦 {totalQty}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="w-8 h-8 rounded-lg bg-lav text-purple grid place-items-center border-0 hover:bg-purple/15 transition-colors"
                      title="تعديل"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="w-8 h-8 rounded-lg bg-red-50 text-danger grid place-items-center border-0 hover:bg-red-100 transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {groups.length > 0 && (
                  <div className="text-xs text-subtle mt-0.5">
                    {swatches.length} لون · {sizeCount} مقاس
                  </div>
                )}

                <div className="mt-2 space-y-1.5">
                  {groups.length === 0 && (
                    <span className="text-xs text-subtle">بدون ألوان أو مقاسات</span>
                  )}
                  {groups.map(g => (
                    <div key={g.color} className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 bg-soft border border-border rounded-full px-2.5 py-1 text-xs font-semibold text-meta2">
                        <span className="w-3 h-3 rounded-full border border-border7" style={{ background: g.color }} />
                      </span>
                      {g.rows.length === 0 && <span className="text-[10px] text-subtle">—</span>}
                      {g.rows.map(r => (
                        <span key={r.index} className="inline-flex items-center gap-1 bg-lav border border-purple/30 rounded-full px-2.5 py-1 text-xs font-semibold text-purple">
                          <Ruler size={9} />
                          <span>{r.size || '—'}</span>
                          {r.quantity > 0 && <span dir="ltr" className="text-meta2">×{r.quantity}</span>}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )
        })}
      </div>

      {loading && (
        <div className="space-y-2.5" aria-busy="true" aria-label="جاري تحميل المنتجات">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-border rounded-2xl p-4 shadow-sm flex gap-3">
              <div className="skeleton w-12 h-12 shrink-0" />
              <div className="flex-1 space-y-2 py-2">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !setupNeeded && filtered.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="w-20 h-20 rounded-full bg-lav mx-auto mb-4 grid place-items-center">
            <Package size={32} className="text-purple" />
          </div>
          <p className="font-bold text-ink text-lg">{searchQuery ? 'لا نتائج' : 'products only بعد'}</p>
          <p className="text-base mt-1 text-subtle">{searchQuery ? 'جرّب كلمة أخرى' : 'أضف منتجاتك مع الألوان والمقاسات والكميات'}</p>
        </div>
      )}

      {/* Bottom Sheet: Add / Edit Product */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={form.id ? 'تعديل المنتج' : 'منتج جديد'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-3.5">
          <div>
            <label className="block text-base font-bold text-ink mb-2">اسم المنتج *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: قميص قطني"
              required
              className={`w-full h-11 border rounded-lg px-3 outline-none transition-colors text-sm bg-white ${triedSubmit && !form.name.trim() ? 'border-danger focus:border-danger' : 'border-border focus:border-purple'}`}
            />
            {triedSubmit && !form.name.trim() && (
              <p className="text-[11px] text-danger m-0 mt-1">اسم المنتج مطلوب</p>
            )}
          </div>

          <div>
            <label className="block text-base font-bold text-ink mb-2">السعر الافتراضي (دج)</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="يُملأ تلقائياً عند إضافة الطلب"
              dir="ltr"
              className="no-spinner w-full h-11 border border-border rounded-lg px-3 outline-none focus:border-purple transition-colors text-sm bg-white"
            />
            <p className="text-[11px] text-subtle m-0 mt-1">اختياري — عند اختيار هذا المنتج في الطلب يُعبّئ سعر المنتج تلقائياً.</p>
          </div>

          {/* Colour picker */}
          <div>
            <label className="block text-base font-bold text-ink mb-2">لون جديد</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={isHex(draftColor) ? draftColor : '#e91e63'}
                onChange={(e) => setDraftColor(e.target.value)}
                className="w-14 h-12 border border-border rounded-lg p-1 bg-white cursor-pointer shrink-0"
                title="منتقي الألوان"
              />
              <button
                type="button"
                onClick={addColor}
                className="flex-1 h-12 rounded-lg bg-lav text-purple border-0 hover:bg-purple/10 transition-colors flex items-center justify-center gap-1.5 text-base font-bold"
              >
                <Plus size={16} />
                إضافة لون
              </button>
            </div>
            <p className="text-[11px] text-subtle m-0 mt-1">اختر لوناً ثم أضف مقاساته بكمياته.</p>
          </div>

          {/* Sizes with quantity, grouped per colour */}
          <div>
            <div className="space-y-2">
              {formGroups.map(g => (
                <div key={g.color} className="border border-border rounded-xl p-2.5 bg-white" style={{ borderRight: `4px solid ${g.color}` }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <>
                        <span className="w-5 h-5 rounded-full border border-border7 shrink-0" style={{ background: g.color }} />
                      </>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => addVariant(g.color)}
                        className="h-8 px-2 rounded-lg bg-lav text-purple border-0 hover:bg-purple/10 transition-colors flex items-center gap-1 text-xs font-bold"
                      >
                        <Plus size={12} />
                        مقاس
                      </button>
                      {g.color && (
                        <button
                          type="button"
                          onClick={() => removeColor(g.color)}
                          className="w-8 h-8 rounded-lg bg-red-50 text-danger border-0 grid place-items-center hover:bg-red-100 transition-colors"
                          title="حذف اللون مع مقاساته"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {g.rows.map(r => (
                      <div key={r.index} className="grid grid-cols-[1fr_84px_34px] gap-1.5">
                        <input
                          type="text"
                          value={r.size || ''}
                          onChange={(e) => updateVariant(r.index, { size: e.target.value })}
                          placeholder="المقاس"
                          className="h-11 border border-border rounded-lg px-3 outline-none focus:border-purple transition-colors text-base bg-white"
                        />
                        <input
                          type="number"
                          min="0"
                          value={form.variants[r.index]?.quantity ?? ''}
                          onChange={(e) => updateVariant(r.index, { quantity: e.target.value })}
                          placeholder="كمية"
                          dir="ltr"
                          className="h-11 border border-border rounded-lg px-3 outline-none focus:border-purple transition-colors text-base bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariant(r.index)}
                          className="h-9 rounded-lg bg-red-50 text-danger border-0 grid place-items-center hover:bg-red-100 transition-colors"
                          title="حذف"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {g.rows.length === 0 && (
                      <p className="text-[10px] text-subtle m-0">لا مقاسات في هذا اللون.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 bg-white pt-3 pb-1 z-10">
            <button
              type="submit"
              disabled={saving}
              className="w-full h-[52px] border-0 rounded-xl bg-purple text-white font-bold hover:bg-purple-2 transition-colors disabled:opacity-60 text-base shadow-lg shadow-purple/20 flex items-center justify-center gap-2"
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

      {/* Confirm Dialog */}
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
