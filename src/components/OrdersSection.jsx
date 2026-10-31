import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  ChevronDown, Trash2, Plus, Search, SearchX,
  ShoppingCart, X, Pencil, Phone, MapPin, Ruler, ImageIcon, Download,
  Check, Package, ShoppingBag, Home, Building2, Clock
} from 'lucide-react'
import BottomSheet from './BottomSheet'
import LazyImage from './LazyImage'
import ConfirmDialog from './ConfirmDialog'
import { useDebounce } from '../hooks/useDebounce'
import { compressImage } from '../utils/compressImage'
import stockManager from '../utils/stockManager'
import { productColors, productSizes } from '../utils/variants'

// image_url in DB is the R2 key (e.g. products/123-abc.png)
function getImageUrl(storedValue) {
  if (!storedValue) return null
  // Already a full URL (old images or direct R2 URLs)
  if (storedValue.startsWith('http')) return storedValue
  // R2 key → use API proxy (works on both localhost and Vercel)
  return `/api/image?key=${encodeURIComponent(storedValue)}`
}

const DAY_BOUNDARY_HOUR = 15 // day splits at 3 PM

// Returns the calendar date of the 3PM→3PM business day's END.
// e.g. an order at 10 AM Sep 1 belongs to the business day ending Sep 1,
// and an order at 4 PM Sep 1 belongs to the business day ending Sep 2.
function getBusinessDayDate(date) {
  const shifted = new Date(date.getTime() - DAY_BOUNDARY_HOUR * 60 * 60 * 1000)
  const end = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate() + 1)
  return end
}

function getBusinessDayKey(date) {
  return getBusinessDayDate(date).toDateString()
}

function groupOrdersByDay(orders) {
  const groups = {}
  orders.forEach(order => {
    const d = new Date(order.created_at)
    const key = getBusinessDayKey(d)
    if (!groups[key]) groups[key] = { date: getBusinessDayDate(d), orders: [] }
    groups[key].orders.push(order)
  })
  return Object.values(groups).sort((a, b) => b.date - a.date)
}

function getDayLabel(date) {
  const todayKey = getBusinessDayKey(new Date())
  const targetKey = getBusinessDayKey(date)
  if (todayKey === targetKey) return 'اليوم'
  const todayDate = getBusinessDayDate(new Date())
  const targetDate = getBusinessDayDate(date)
  const diffDays = Math.round((todayDate - targetDate) / (1000 * 60 * 60 * 24))
  if (diffDays === 1) return 'أمس'
  if (diffDays > 1 && diffDays < 7) return `منذ ${diffDays} أيام`
  return targetDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateFull(date) {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}


async function downloadImage(url, filename, orderSize, orderColor) {
  try {
    // Build label from order size only
    const label = orderSize || ''

    // Fetch image as blob (avoids CORS issues)
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)

    // Load into an Image element
    const img = new Image()
    img.src = blobUrl
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Image failed to load'))
    })

    // Draw on canvas — fixed 1200x1200 so text is always the same size
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1200
    const ctx = canvas.getContext('2d')

    // Draw image centered & cover-fitted
    const imgW = img.naturalWidth || 600
    const imgH = img.naturalHeight || 600
    const canvasAspect = 1200 / 1200
    const imgAspect = imgW / imgH
    let drawW, drawH, drawX, drawY
    if (imgAspect > canvasAspect) {
      drawH = 1200
      drawW = imgAspect * 1200
      drawX = (1200 - drawW) / 2
      drawY = 0
    } else {
      drawW = 1200
      drawH = 1200 / imgAspect
      drawX = 0
      drawY = (1200 - drawH) / 2
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    URL.revokeObjectURL(blobUrl)

    // Draw order size/color badge
    if (label) {
      const fontSize = 68
      const pad = fontSize * 0.7
      ctx.font = `${fontSize}px Arial, sans-serif`
      const tw = ctx.measureText(label).width
      const bw = tw + pad * 2
      const bh = fontSize + pad * 2
      const bx = (canvas.width - bw) / 2
      const by = (canvas.height - bh) / 2
      const cr = bh / 2

      // Pill background
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.beginPath()
      ctx.moveTo(bx + cr, by)
      ctx.lineTo(bx + bw - cr, by)
      ctx.arcTo(bx + bw, by, bx + bw, by + cr, cr)
      ctx.arcTo(bx + bw, by + bh, bx + bw - cr, by + bh, cr)
      ctx.lineTo(bx + cr, by + bh)
      ctx.arcTo(bx, by + bh, bx, by + bh - cr, cr)
      ctx.arcTo(bx, by, bx + cr, by, cr)
      ctx.closePath()
      ctx.fill()

      // Text
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + pad, by + bh / 2)
    }

    // Export as data URL and trigger download
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename || 'image.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (err) {
    console.error('Download with text failed, downloading original:', err)
    // Fallback: download original without text
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename || 'image.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e2) {
      console.error('Fallback download also failed:', e2)
    }
  }
}

async function uploadToR2(file) {
  // Compress and convert to WebP before uploading
  const compressed = await compressImage(file)

  // Upload file through Vercel serverless function (no CORS issues)
  const res = await fetch(`/api/upload?filename=${encodeURIComponent(compressed.name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': compressed.type || 'application/octet-stream',
      'X-Filename': compressed.name,
    },
    body: compressed,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to upload to R2')
  return data.key
}

async function deleteFromR2(storedValue) {
  if (!storedValue) return
  // Extract key — could be a full URL or just the key
  let key = storedValue
  if (storedValue.startsWith('http')) {
    try {
      const url = new URL(storedValue)
      const idx = url.pathname.indexOf('/products/')
      key = idx !== -1 ? url.pathname.slice(idx + 1) : url.pathname.slice(1)
    } catch {}
  }
  try {
    await fetch('/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
  } catch (err) {
    console.error('R2 delete error:', err)
  }
}

const emptyItem = () => ({
  id: Date.now() + Math.random(),
  imageFile: null,
  imagePreview: null,
  imageKey: null,
  productId: null,
  productName: '',
  price: '',
  color: '',
  size: '',
})

const emptyCustomer = {
  customer_name: '',
  phone: '',
  phone_2: '',
  address: '',
  delivery_type: 'home',
  code_wilaya: '',
  wilaya_name: '',
  commune: '',
  code_postal: '',
  montant: '',
  product_price: '',
  produit: '',
  order_type: 1,
}

// Supabase row → form values (used by the edit sheet and by ECOTRACK rollbacks)
const customerFromOrder = (order) => ({
  customer_name: order.customer_name || '',
  phone: order.phone || '',
  phone_2: order.phone_2 || '',
  address: order.address || '',
  delivery_type: order.delivery_type || 'home',
  code_wilaya: order.code_wilaya ? String(order.code_wilaya) : '',
  wilaya_name: order.wilaya_name || '',
  commune: order.commune || '',
  code_postal: order.code_postal || '',
  montant: order.montant != null ? String(order.montant) : '',
  product_price: order.product_price != null ? String(order.product_price) : (order.montant != null ? String(order.montant) : ''),
  produit: order.produit || '',
  order_type: order.order_type || 1,
})

// Every product of an order (photo + colour + size) as one list. Rows saved
// before this existed only have image_url / colour / size, so fall back to them.
function orderProducts(order) {
  if (Array.isArray(order.products) && order.products.length) {
    return order.products.map(p => ({
      image: p?.image || null,
      color: p?.color || '',
      size: p?.size || '',
      productId: p?.product_id || null,
      productName: p?.product_name || '',
      price: p?.price != null ? Number(p.price) : null,
    }))
  }
  return [{
    image: order.image_url || null,
    color: order.color || '',
    size: order.size || '',
    productId: null,
    productName: '',
    price: order.product_price != null ? Number(order.product_price) : null,
  }]
}

// Delete every photo an order holds (R2 failures are swallowed)
async function deleteOrderImages(order) {
  for (const p of orderProducts(order)) {
    if (p.image) await deleteFromR2(p.image)
  }
}

// ECOTRACK update payload — its update endpoint uses different field names
// than create (client/tel/product) and takes `tracking` as the identifier.
// `wilaya`/`code_wilaya` and `product`/`produit` are sent under both names
// because the ECOTRACK docs list one and their example uses the other.
const ecotrackUpdatePayload = (tracking, c, montant) => ({
  tracking,
  client: c.customer_name.trim(),
  tel: c.phone.trim(),
  tel2: c.phone_2.trim(),
  adresse: c.address.trim(),
  code_postal: c.code_postal || '',
  commune: c.commune.trim(),
  code_wilaya: c.code_wilaya || '',
  wilaya: c.code_wilaya || '',
  montant: montant ?? c.montant,
  product: c.produit.trim(),
  produit: c.produit.trim(),
  type: Number(c.order_type) || 1,
  stop_desk: c.delivery_type === 'desk' ? 1 : 0,
})

const formatEcotrackErrors = (data) => {
  if (data?.errors) {
    const msgs = Object.values(data.errors).flat().join(' ')
    if (msgs) return msgs
  }
  if (typeof data?.message === 'string' && data.message) return data.message
  if (typeof data?.error === 'string' && data.error) return data.error
  return 'خطأ في ECOTRACK'
}

// Subtract ordered quantities from catalog stock using stock manager
// @see stockManager.subtractStock
function subtractOrderStock(products, catalog, showToast) {
  stockManager.subtractStock(products, catalog, showToast)
}

// One call to our /api/orders proxy → { ok, data, tracking, error }
async function callEcotrack(path, method, payload) {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.success === false) return { ok: false, data, error: formatEcotrackErrors(data) }
    return { ok: true, data, tracking: data?.tracking || data?.data?.tracking || null }
  } catch {
    return { ok: false, data: null, error: 'تعذر الاتصال بـ ECOTRACK' }
  }
}

export default function OrdersSection({ orders, compact, full, onRefresh, showToast }) {
  const [openDays, setOpenDays] = useState({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [customer, setCustomer] = useState(emptyCustomer)
  const [items, setItems] = useState([emptyItem()])
  const [catalog, setCatalog] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCount, setShowCount] = useState(20)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', confirmText: 'حذف', onConfirm: null })
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [wilayas, setWilayas] = useState([])
  const [communesCache, setCommunesCache] = useState({})
  const [feesData, setFeesData] = useState(null)
  const [triedSubmit, setTriedSubmit] = useState(false)
  const debouncedSearch = useDebounce(searchQuery, 300)

  // "اسم المنتج" mirrors the picked catalog products: "A + B + C".
  // Only what we auto-fill is cleared, so manual text is never wiped.
  const pickedProductNames = [...new Set(items.map(i => i.productName).filter(Boolean))]
  const pickedProductsLabel = pickedProductNames.join(' + ')
  const lastAutoProduit = useRef('')

  useEffect(() => {
    if (!pickedProductsLabel) {
      if (lastAutoProduit.current) {
        setCustomer(prev => prev.produit === lastAutoProduit.current ? { ...prev, produit: '' } : prev)
        lastAutoProduit.current = ''
      }
      return
    }
    lastAutoProduit.current = pickedProductsLabel
    setCustomer(prev => prev.produit === pickedProductsLabel ? prev : { ...prev, produit: pickedProductsLabel })
  }, [pickedProductsLabel])

  useEffect(() => {
    fetch('/api/fees')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setFeesData(data) })
      .catch(() => {})
  }, [])

  // Product catalog (مدير المنتجات tab) — linked-product badge + stock sync
  const fetchCatalog = async () => {
    const { data, error } = await supabase.from('products').select('*')
    if (!error && Array.isArray(data)) {
      setCatalog([...data].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')))
    }
  }

  useEffect(() => { fetchCatalog() }, [])

  // ECOTRACK reference data: wilayas, then communes per selected wilaya (cached)
  useEffect(() => {
    fetch('/api/wilayas')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setWilayas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const wid = customer.code_wilaya
    if (!wid || communesCache[wid]) return
    fetch(`/api/communes?wilaya_id=${wid}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(data => {
        const list = Array.isArray(data) ? data : Object.values(data || {})
        list.sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
        setCommunesCache(prev => ({ ...prev, [wid]: list }))
      })
      .catch(() => setCommunesCache(prev => ({ ...prev, [wid]: [] })))
  }, [customer.code_wilaya, communesCache])

  const orderCommunes = customer.code_wilaya ? communesCache[customer.code_wilaya] || null : null
  const deskMode = customer.delivery_type === 'desk'
  const visibleCommunes = !orderCommunes
    ? []
    : deskMode
      ? orderCommunes.filter(c => c.has_stop_desk)
      : orderCommunes
  const selectedCommuneObj = orderCommunes?.find(c => c.nom === customer.commune) || null
  const stopDeskUnsupported = deskMode && !!selectedCommuneObj && !selectedCommuneObj.has_stop_desk

  // Delivery fee for the selected wilaya (shown under المبلغ)
  const selectedFee = useMemo(() => {
    if (!feesData || !customer.code_wilaya) return null
    const arr = feesData.livraison || []
    return arr.find(f => f.wilaya_id === Number(customer.code_wilaya)) || null
  }, [feesData, customer.code_wilaya])

  // Delivery fee for the selected wilaya + delivery type — added to the product
  // price automatically to form the collected total (montant) ECOTRACK receives.
  const feeFor = (codeWilaya, deliveryType) => {
    if (!feesData || !codeWilaya) return 0
    const f = (feesData.livraison || []).find(x => Number(x.wilaya_id) === Number(codeWilaya))
    if (!f) return 0
    return Number(deliveryType === 'desk' ? f.tarif_stopdesk : f.tarif) || 0
  }
  const deliveryFee = feeFor(customer.code_wilaya, customer.delivery_type)
  // Every product carries its own price (auto-filled from the catalog when
  // picked). Manual items without a price fall back to the default unit price,
  // so the order total is always the sum of the products + delivery.
  const defaultUnitPrice = Number(customer.product_price) || 0
  const unitPriceOf = (item) => {
    const own = Number(item?.price)
    return own > 0 ? own : defaultUnitPrice
  }
  const itemsTotal = items.reduce((sum, it) => sum + unitPriceOf(it), 0)
  const totalMontant = itemsTotal + deliveryFee

  const phoneInvalid = triedSubmit && !/^\d{9,10}$/.test(customer.phone.trim())
  const addressInvalid = triedSubmit && !customer.address.trim()
  const wilayaInvalid = triedSubmit && !customer.code_wilaya
  const communeInvalid = triedSubmit && !customer.commune.trim()

  // One input style for the whole add/edit form, so the sheet reads as a single
  // tidy form instead of two stacked forms with different heights.
  const inputCls = (invalid = false) =>
    `w-full h-10 border rounded-xl px-3.5 outline-none transition-all text-[13px] bg-white placeholder:text-muted focus:ring-2 ${invalid ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-border focus:border-purple focus:ring-purple/10'}`

  const filteredOrders = useMemo(() => {
    let result = orders
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(o =>
        o.customer_name?.toLowerCase().includes(q) ||
        o.phone?.includes(q)
      )
    }
    if (statusFilter === 'confirmed') result = result.filter(o => o.confirmed)
    if (statusFilter === 'unconfirmed') result = result.filter(o => !o.confirmed)
    return result
  }, [orders, debouncedSearch, statusFilter])

  const allDayGroups = useMemo(() => groupOrdersByDay(filteredOrders), [filteredOrders])
  const dayGroups = useMemo(() => allDayGroups.slice(0, showCount), [allDayGroups, showCount])

  const statusCounts = useMemo(() => ({
    all: orders.length,
    confirmed: orders.filter(o => o.confirmed).length,
    unconfirmed: orders.filter(o => !o.confirmed).length,
  }), [orders])
  const filtersActive = !!debouncedSearch.trim() || statusFilter !== 'all'
  const resetFilters = () => { setSearchQuery(''); setStatusFilter('all') }


  const toggleDay = (key) => {
    setOpenDays(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openAddOrder = () => {
    fetchCatalog()
    setEditingOrder(null)
    setCustomer(emptyCustomer)
    setItems([emptyItem()])
    setTriedSubmit(false)
    setSheetOpen(true)
  }

  const openEditOrder = (order) => {
    fetchCatalog()
    setEditingOrder(order)
    const c = customerFromOrder(order)
    // Rows saved before product_price existed: split the total back into
    // product price + delivery fee, so re-saving doesn't add the fee twice.
    if ((!order.product_price || Number(order.product_price) <= 0) && Number(order.montant) > 0) {
      c.product_price = String(Math.max(Number(order.montant) - feeFor(order.code_wilaya, order.delivery_type || 'home'), 0))
    }
    setCustomer(c)
    setItems(orderProducts(order).map(p => ({
      id: Date.now() + Math.random(),
      imageFile: null,
      imagePreview: p.image ? getImageUrl(p.image) : null,
      imageKey: p.image || null,
      productId: p.productId || null,
      productName: p.productName || '',
      price: p.price != null && Number(p.price) > 0 ? String(p.price) : '',
      color: p.color || '',
      size: p.size || '',
    })))
    setTriedSubmit(false)
    setSheetOpen(true)
  }

  const handleWilayaChange = (e) => {
    const code = e.target.value
    const w = wilayas.find(x => String(x.wilaya_id) === String(code))
    setCustomer(prev => ({
      ...prev,
      code_wilaya: code,
      wilaya_name: w?.wilaya_name || '',
      commune: '',
      code_postal: '',
    }))
  }

  const handleCommuneChange = (e) => {
    const nom = e.target.value
    const c = (orderCommunes || []).find(x => x.nom === nom)
    setCustomer(prev => ({ ...prev, commune: nom, code_postal: c?.code_postal || prev.code_postal }))
  }

  const addItem = () => setItems(prev => [...prev, emptyItem()])

  // Blob previews are revoked whenever they are replaced or dropped.
  const revokePreview = (preview) => {
    if (preview && String(preview).startsWith('blob:')) URL.revokeObjectURL(preview)
  }

  const removeItem = (itemId) => setItems(prev => {
    if (prev.length <= 1) return prev
    revokePreview(prev.find(i => i.id === itemId)?.imagePreview)
    return prev.filter(i => i.id !== itemId)
  })

  const updateItem = (itemId, field, value) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i))
  }

  const handleItemImage = (itemId, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      revokePreview(i.imagePreview)
      return { ...i, imageFile: file, imagePreview: URL.createObjectURL(file) }
    }))
  }

  const removeItemImage = (itemId) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      revokePreview(i.imagePreview)
      return { ...i, imageFile: null, imagePreview: null }
    }))
  }

  const productById = (id) => (id ? catalog.find(p => String(p.id) === String(id)) || null : null)

  // Available quantity for one colour/size pair of a catalog product.
  const stockQty = (product, color, size) => {
    const variant = (product?.variants || []).find(v => v?.color === color && v?.size === size)
    return Number(variant?.quantity) || 0
  }

  // Link an order item to a stock product: resets colour/size, borrows the
  // catalog photo and pre-fills the empty ECOTRACK name/price fields.
  const handleItemProduct = (itemId, productId) => {
    const p = productById(productId)
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it
      // Keep a photo the user uploaded themselves. Otherwise show the catalog
      // photo as a preview only — never store its key on the order, so deleting
      // the order can't delete the stock product's photo from R2.
      const hasOwnPhoto = !!it.imageFile
      return {
        ...it,
        productId: p?.id || null,
        productName: p?.name || '',
        price: p && Number(p.price) > 0 ? String(p.price) : '',
        color: '',
        size: '',
        imagePreview: hasOwnPhoto ? it.imagePreview : (p?.image_url ? getImageUrl(p.image_url) : null),
        imageKey: hasOwnPhoto ? it.imageKey : null,
      }
    }))
    if (p) {
      setCustomer(prev => ({
        ...prev,
        product_price: prev.product_price ? prev.product_price : (Number(p.price) > 0 ? String(p.price) : prev.product_price),
      }))
    }
  }

  // Changing colour keeps the size only when that size still exists.
  const handleItemColor = (itemId, color) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it
      const p = productById(it.productId)
      const sizes = productSizes(p?.variants, color)
      return { ...it, color, size: sizes.includes(it.size) ? it.size : '' }
    }))
  }

  const buildEcotrackPayload = () => ({
    type: Number(customer.order_type) || 1,
    stop_desk: customer.delivery_type === 'desk' ? 1 : 0,
    nom_client: customer.customer_name.trim(),
    telephone: customer.phone.trim(),
    telephone_2: customer.phone_2.trim(),
    adresse: customer.address.trim(),
    code_postal: customer.code_postal || '',
    commune: customer.commune.trim(),
    code_wilaya: customer.code_wilaya,
    montant: totalMontant,
    produit: customer.produit.trim(),
  })

  const handleSave = async (e) => {
    e.preventDefault()
    setTriedSubmit(true)
    if (!customer.customer_name.trim() || !customer.phone.trim()) return

    // Never sell more than a linked catalog product actually has (add flow
    // only — editing an order must not re-check stock it already consumed).
    if (!editingOrder) {
      const requested = new Map()
      for (const it of items) {
        if (!it.productId || !it.color || !it.size) continue
        const key = `${it.productId}|${it.color}|${it.size}`
        requested.set(key, (requested.get(key) || 0) + 1)
      }
      for (const [key, count] of requested) {
        const [pid, color, size] = key.split('|')
        const product = productById(pid)
        const available = stockQty(product, color, size)
        if (count > available) {
          showToast(`الكمية المطلوبة من "${product?.name || 'منتج'}" — ${size} أكبر من المخزون (${available})`)
          return
        }
      }
    }

    // Everything that reaches ECOTRACK needs complete shipping data
    const goesToEcotrack = !editingOrder || !!editingOrder.tracking
    if (goesToEcotrack) {
      const missing = []
      if (!/^\d{9,10}$/.test(customer.phone.trim())) missing.push('رقم الهاتف (9-10 أرقام)')
      if (!customer.address.trim()) missing.push('العنوان')
      if (!customer.code_wilaya) missing.push('الولاية')
      if (!customer.commune.trim()) missing.push('البلدية')
      if (itemsTotal <= 0) missing.push('سعر المنتج في قائمة المنتجات')
      if (missing.length) {
        showToast(`أكمل الحقول: ${missing.join('، ')}`)
        return
      }
    }

    // Supabase row values shared by add & edit
    const rowValues = (imageUrl) => ({
      customer_name: customer.customer_name.trim(),
      phone: customer.phone.trim(),
      phone_2: customer.phone_2.trim(),
      address: customer.address.trim(),
      delivery_type: customer.delivery_type,
      code_wilaya: customer.code_wilaya ? Number(customer.code_wilaya) : null,
      wilaya_name: customer.wilaya_name,
      commune: customer.commune.trim(),
      code_postal: customer.code_postal,
      montant: totalMontant,
      product_price: defaultUnitPrice || unitPriceOf(items[0]) || 0,
      produit: customer.produit.trim(),
      order_type: Number(customer.order_type) || 1,
      image_url: imageUrl,
    })

    setSaving(true)
    try {
      if (editingOrder) {
        // ─── EDIT: ECOTRACK first, so a rejected edit changes nothing ───
        const old = editingOrder

        // New photos are uploaded up-front; old photos are only dropped once
        // BOTH systems accepted the edit, so a failure loses nothing.
        const newKeys = []
        const dropKeys = []
        const products = []
        for (const item of items) {
          let imageKey = item.imageKey || null
          if (item.imageFile) {
            try {
              const uploadedKey = await uploadToR2(item.imageFile)
              if (uploadedKey) {
                if (item.imageKey) dropKeys.push(item.imageKey)
                newKeys.push(uploadedKey)
                imageKey = uploadedKey
              }
            } catch {
              showToast('الصورة لم تُرفع — تم الإبقاء على الصورة القديمة')
              imageKey = item.imageKey || null
            }
          } else if (!item.imagePreview) {
            if (item.imageKey) dropKeys.push(item.imageKey)
            imageKey = null
          }
          products.push({
            image: imageKey,
            color: item.color.trim(),
            size: item.size.trim(),
            product_id: item.productId || null,
            product_name: item.productName || '',
            price: unitPriceOf(item) || 0,
          })
        }

        if (old.tracking) {
          const eco = await callEcotrack('/api/orders', 'PATCH', ecotrackUpdatePayload(old.tracking, customer, totalMontant))
          if (!eco.ok) {
            for (const key of newKeys) await deleteFromR2(key)
            throw new Error(`تعديل ECOTRACK: ${eco.error} — لم يتغيّر شيء`)
          }
        }

        const values = {
          ...rowValues(products[0]?.image || null),
          color: products[0]?.color || '',
          size: products[0]?.size || '',
          products,
        }
        let updateResult = await supabase.from('orders').update(values).eq('id', old.id)
        if (updateResult.error && String(updateResult.error.message).includes('product_price')) {
          // migration 007 not applied yet — save without the product price column
          delete values.product_price
          updateResult = await supabase.from('orders').update(values).eq('id', old.id)
        }
        if (updateResult.error && String(updateResult.error.message).includes('products')) {
          // migration 008 not applied yet — keep only the first product's data
          delete values.products
          updateResult = await supabase.from('orders').update(values).eq('id', old.id)
        }
        const { error } = updateResult
        if (error) {
          for (const key of newKeys) await deleteFromR2(key)
          if (old.tracking) {
            // put ECOTRACK back to the values it had before this edit
            const revert = await callEcotrack('/api/orders', 'PATCH', ecotrackUpdatePayload(old.tracking, customerFromOrder(old)))
            if (revert.ok) throw new Error(`تعذر الحفظ في Supabase: ${error.message} — تم التراجع عن تعديل ECOTRACK`)
            throw new Error(`تعذر الحفظ في Supabase: ${error.message} — وتعذر التراجع عن ECOTRACK (${revert.error}) — الطلب مختلف بين النظامين`)
          }
          throw new Error(`تعذر الحفظ في Supabase: ${error.message}`)
        }

        // Both sides carry the new data — only now replaced/removed photos go
        for (const key of dropKeys) await deleteFromR2(key)

        showToast(old.tracking
          ? 'تم تعديل الطلب في Supabase و ECOTRACK'
          : 'تم الحفظ محلياً — تنبيه: الطلب غير موجود في ECOTRACK (بدون رقم تتبع)')
      } else {
        // ─── ADD: Supabase first, then ECOTRACK — every failure rolls back ───
        // ALL products go into ONE row: photo + colour + size per product.
        const uploaded = []
        const products = []
        for (const item of items) {
          let imageKey = null
          if (item.imageFile) {
            try {
              imageKey = await uploadToR2(item.imageFile)
              if (imageKey) uploaded.push(imageKey)
            } catch { showToast('الصورة لم تُرفع — تم الحفظ بدون صورة') }
          }
          products.push({
            image: imageKey,
            color: item.color.trim(),
            size: item.size.trim(),
            product_id: item.productId || null,
            product_name: item.productName || '',
            price: unitPriceOf(item) || 0,
          })
        }

        const rows = [{
          ...rowValues(products[0]?.image || null),
          tracking: null,
          color: products[0]?.color || '',
          size: products[0]?.size || '',
          products,
        }]

        let insertResult = await supabase.from('orders').insert(rows).select()
        if (insertResult.error && String(insertResult.error.message).includes('product_price')) {
          // migration 007 not applied yet — save without the product price column
          rows.forEach(r => { delete r.product_price })
          insertResult = await supabase.from('orders').insert(rows).select()
        }
        if (insertResult.error && String(insertResult.error.message).includes('products')) {
          // migration 008 not applied yet — keep only the first product's data
          rows.forEach(r => { delete r.products })
          insertResult = await supabase.from('orders').insert(rows).select()
        }
        const { data: inserted, error: insertError } = insertResult
        if (insertError) {
          for (const key of uploaded) await deleteFromR2(key)
          throw new Error(`تعذر الحفظ في Supabase: ${insertError.message} — لم يُنشأ أي طلب`)
        }
        const ids = (inserted || []).map(r => r.id)

        // ONE ECOTRACK order per save — montant is the combined total
        const eco = await callEcotrack('/api/orders', 'POST', buildEcotrackPayload())
        if (!eco.ok || !eco.tracking) {
          const { error: rollbackError } = await supabase.from('orders').delete().in('id', ids)
          if (!rollbackError) for (const key of uploaded) await deleteFromR2(key)
          if (rollbackError) {
            const reason = !eco.ok ? eco.error : 'لم يُرجع ECOTRACK رقم التتبع'
            throw new Error(`${reason} — وتعذّر حذف النسخة المحلية (${rollbackError.message})`)
          }
          if (!eco.ok) throw new Error(`لم يُنشأ الطلب في ECOTRACK: ${eco.error} — تم التراجع، لم يُحفظ أي شيء`)
          throw new Error('ECOTRACK أنشأ الطلب لكن بدون رقم تتبع — تم حذف النسخة المحلية، راجع لوحة ECOTRACK')
        }

        // Save the tracking — the only step where the two systems could drift apart
        let trackingError = (await supabase.from('orders').update({ tracking: eco.tracking }).in('id', ids)).error
        if (trackingError) {
          trackingError = (await supabase.from('orders').update({ tracking: eco.tracking }).in('id', ids)).error
        }
        if (trackingError) {
          const undoRemote = await callEcotrack('/api/orders', 'DELETE', { tracking: eco.tracking })
          if (undoRemote.ok) {
            const { error: undoLocal } = await supabase.from('orders').delete().in('id', ids)
            if (!undoLocal) {
              for (const key of uploaded) await deleteFromR2(key)
              throw new Error('تعذر حفظ رقم التتبع — تم التراجع عن الطلب في كلا النظامين')
            }
            throw new Error(`حُذف الطلب من ECOTRACK لكن بقي في Supabase (${undoLocal.message}) — أعد المحاولة`)
          }
          throw new Error(`تعذر حفظ رقم التتبع (${eco.tracking}) والحذف من ECOTRACK (${undoRemote.error}) — الطلب موجود في النظامين`)
        }

        // Subtract ordered quantities from catalog inventory (non-fatal on failure)
        await subtractOrderStock(products, catalog, showToast)
        fetchCatalog()

        showToast(`تمت إضافة الطلب (${products.length} منتج) · ${eco.tracking}`)
      }
      setSheetOpen(false)
      onRefresh()
    } catch (err) {
      console.error(err)
      showToast(`خطأ: ${err.message || 'حاول مرة أخرى'}`)
    }
    setSaving(false)
  }

  // Add back the exact quantities an order took from the catalog using stock manager
// @see stockManager.addStock
function addBackOrderStock(products, catalog, showToast) {
  stockManager.addStock(products, catalog, showToast)
  }


  const handleDeleteOrder = (order) => {
    setConfirmDialog({
      open: true,
      title: 'حذف الطلب',
      message: `هل تريد حذف طلب \"${order.customer_name}\"? لا يمكن التراجع عن هذا الإجراء.`,
      confirmText: 'حذف',
      onConfirm: async () => {
        setDeleting(true)
        try {
          // Rows from a multi-product save share one ECOTRACK parcel — only
          // the last local row may delete the parcel itself.
          const siblings = orders.filter(o => o.id !== order.id && o.tracking && o.tracking === order.tracking)
          const deleteRemote = !!order.tracking && siblings.length === 0

          // ECOTRACK is asked first, but a failure never blocks the local delete —
          // an order ECOTRACK doesn't have (already shipped) would otherwise be
          // impossible to remove from the list.
          let remoteDeleted = false
          let remoteError = null
          if (deleteRemote) {
            const eco = await callEcotrack('/api/orders', 'DELETE', { tracking: order.tracking })
            if (eco.ok) remoteDeleted = true
            else remoteError = eco.error
          }

          // ─── Stock roll-back happens BEFORE the delete, not after. ─────────
          // • Not confirmed (new / pending) → the products are still available,
          //   so the quantities they locked during the add go back: +1 each
          //   colour/size. They are NOT added to the catalog again (the
          //   catalog is the master list you manage in مدير المنتجات, and
          //   deleting an order never invents new products).
          // • Confirmed → the customer already received the goods; delete the
          //   order but leave stock untouched so your sellable inventory is
          //   not inflated.
          // ────────────────────────────────────────────────────────────────
          const removedProducts = orderProducts(order)
          if (!order.confirmed) {
            const { data } = await supabase.from('products').select('*')
            const catalog = Array.isArray(data) ? data : []
            await addBackOrderStock(removedProducts, catalog, showToast)
          }

          const { error } = await supabase.from('orders').delete().eq('id', order.id)
          if (error) {
            showToast(remoteDeleted
              ? `حُذف الطلب من ECOTRACK لكن تعذر حذفه من Supabase (${error.message}) — أعد المحاولة`
              : `تعذر الحذف من Supabase: ${error.message}${remoteError ? ` — وتعذر الحذف من ECOTRACK (${remoteError})` : ''}`)
            return
          }

          await deleteOrderImages(order)
          showToast(remoteDeleted
            ? 'تم حذف الطلب من Supabase و ECOTRACK'
            : remoteError
              ? `حُذف الطلب محلياً — تعذر حذفه من ECOTRACK (${remoteError})`
              : order.tracking
                ? 'تم حذف المنتج — بقيت منتجات أخرى مرتبطة بنفس الطلب في ECOTRACK'
                : 'تم حذف الطلب (غير موجود في ECOTRACK)')
          onRefresh()
        } finally {
          setDeleting(false)
          setConfirmDialog(prev => ({ ...prev, open: false }))
        }
      },
    })
  }

  const handleDeleteDay = (dayDate, ordersList) => {
    setConfirmDialog({
      open: true,
      title: `حذف طلبات ${getDayLabel(dayDate)}`,
      message: `هل تريد حذف جميع طلبات ${getDayLabel(dayDate)} (${ordersList.length} طلب)؟ لا يمكن التراجع عن هذا الإجراء.`,
      confirmText: `حذف ${ordersList.length} طلب`,
      onConfirm: async () => {
        setDeleting(true)
        try {
          // ECOTRACK first, once per tracking number. Rows whose parcel could
          // not be deleted stay in Supabase, so nothing lives in one system alone.
          const remoteOk = new Map()
          const failures = []
          const toDelete = []

          for (const o of ordersList) {
            if (!o.tracking) { toDelete.push(o); continue }
            if (!remoteOk.has(o.tracking)) {
              const eco = await callEcotrack('/api/orders', 'DELETE', { tracking: o.tracking })
              remoteOk.set(o.tracking, eco.ok)
              if (!eco.ok) failures.push(`${o.tracking}: ${eco.error}`)
            }
            if (remoteOk.get(o.tracking)) toDelete.push(o)
          }

          let deleted = 0
          let supaError = null
          if (toDelete.length) {
            const { error } = await supabase.from('orders').delete().in('id', toDelete.map(o => o.id))
            if (error) supaError = error
            else {
              deleted = toDelete.length
              for (const o of toDelete) await deleteOrderImages(o)
            }
          }

          if (supaError) {
            const remoteDeleted = toDelete.filter(o => o.tracking).length
            showToast(remoteDeleted
              ? `حُذف ${remoteDeleted} طلب من ECOTRACK لكن تعذر حذفه من Supabase (${supaError.message}) — أعد المحاولة`
              : `تعذر الحذف من Supabase: ${supaError.message}`)
          } else if (failures.length) {
            showToast(`حُذف ${deleted} طلب — فشل ${failures.length} في ECOTRACK وبقيت محلياً: ${failures[0]}`)
          } else {
            showToast(`تم حذف ${deleted} طلب من Supabase و ECOTRACK`)
          }
          onRefresh()
        } finally {
          setDeleting(false)
          setConfirmDialog(prev => ({ ...prev, open: false }))
        }
      },
    })
  }

  const handleConfirmOrder = async (order) => {
    // If order is confirmed, show confirmation dialog before unconfirming
    if (order.confirmed) {
      setConfirmDialog({
        open: true,
        title: 'إلغاء تأكيد الطلب',
        message: `هل تريد إلغاء تأكيد طلب \"${order.customer_name}\"?`,
        confirmText: 'إلغاء التأكيد',
        onConfirm: async () => {
          setConfirming(order.id)
          const { error } = await supabase
            .from('orders')
            .update({ confirmed: false })
            .eq('id', order.id)
          setConfirming(null)
          setConfirmDialog(prev => ({ ...prev, open: false }))
          if (!error) {
            showToast('تم إلغاء تأكيد الطلب')
            onRefresh()
          } else {
            showToast('خطأ في تغيير حالة الطلب')
          }
        },
      })
    } else {
      // If not confirmed, confirm immediately
      setConfirming(order.id)
      const { error } = await supabase
        .from('orders')
        .update({ confirmed: true })
        .eq('id', order.id)
      setConfirming(null)
      if (!error) {
        showToast('تم تأكيد الطلب بنجاح')
        onRefresh()
      } else {
        showToast('خطأ في تغيير حالة الطلب')
      }
    }
  }

  return (
    <div>
      {/* Add button */}
      {full && (
        <button
          onClick={openAddOrder}
          className="w-full h-11 rounded-xl bg-purple text-white font-bold text-sm flex items-center justify-center gap-2 mb-4 hover:bg-purple-2 transition-all shadow-lg shadow-purple/20"
        >
          <Plus size={18} />
          <span>إضافة طلب</span>
        </button>
      )}

      {/* Search */}
      {full && (
        <div className="relative mb-3">
          <input
            type="search"
            inputMode="search"
            placeholder="ابحث عن اسم أو رقم هاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 border border-border rounded-xl px-10 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-all text-sm bg-white appearance-none"
          />
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="مسح البحث"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-soft border-0 text-muted grid place-items-center hover:bg-lav hover:text-purple transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Status Filter */}
      {full && (
        <div className="flex gap-2 mb-3" role="tablist">
          {[
            { id: 'all', label: 'الكل', count: statusCounts.all },
            { id: 'unconfirmed', label: 'غير مؤكد', count: statusCounts.unconfirmed },
            { id: 'confirmed', label: 'مؤكد', count: statusCounts.confirmed },
          ].map((f) => {
            const active = statusFilter === f.id
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(f.id)}
                className={`h-9 px-3.5 rounded-full border text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-purple text-white border-purple shadow-sm shadow-purple/20'
                    : 'bg-white text-muted border-border hover:border-purple/40 hover:text-purple'
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center text-[10px] tabular-nums ${
                    active ? 'bg-white/25 text-white' : 'bg-lav text-purple'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Active filters summary */}
      {full && filtersActive && filteredOrders.length > 0 && (
        <div className="flex items-center justify-between mb-3 px-1" dir="rtl">
          <span className="text-[11px] font-semibold text-subtle">
            {filteredOrders.length} نتيجة من أصل {statusCounts.all} طلب
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="text-[11px] font-extrabold text-purple bg-transparent border-0 p-0 hover:underline"
          >
            مسح الفلاتر
          </button>
        </div>
      )}

      {/* Day Groups */}
      {dayGroups.map((group) => {
        const dayKey = group.date.toDateString()
        const isOpen = openDays[dayKey] !== false
        const canDelete = true
        const dayLabel = getDayLabel(group.date)
        const dateStr = formatDateFull(group.date)

        return (
          <div key={dayKey} className="mb-4">
            {/* Day Header */}
            <div className="w-full flex items-center gap-3 py-2 px-1" dir="rtl">
              <button
                onClick={() => toggleDay(dayKey)}
                className="flex-1 flex items-center gap-3 bg-transparent border-0 cursor-pointer p-0 text-right"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-200 ${isOpen ? 'bg-purple text-white rotate-0' : 'bg-lav text-purple'}`}>
                  <ChevronDown size={18} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
                <div className="flex-1 text-right">
                  <div className="font-extrabold text-sm text-ink">{dayLabel}</div>
                  <div className="text-[11px] text-subtle mt-0.5">{dateStr}</div>
                </div>
                <span className="bg-lav text-purple min-w-[28px] h-7 px-2.5 grid place-items-center rounded-full text-xs font-extrabold">
                  {group.orders.length}
                </span>
              </button>
              {full && canDelete && (
                <button
                  onClick={() => handleDeleteDay(group.date, group.orders)}
                  className="w-8 h-8 shrink-0 rounded-xl bg-red-50 border border-red-200 text-danger grid place-items-center hover:bg-red-100 transition-colors"
                  title="حذف يوم"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Order Cards */}
            {isOpen && (
              <div className="mt-2 space-y-2.5 pr-1" dir="rtl">
                {group.orders.map((order) => {
                  const prods = orderProducts(order)
                  // Orders don't own the catalog photo — fall back to the linked
                  // product's photo for display instead of storing/deleting it.
                  const linkedImage = prods[0]?.productId ? productById(prods[0].productId)?.image_url : null
                  const mainImage = prods[0]?.image || linkedImage || null
                  return (
                  <div
                    key={order.id}
                    className={`${order.confirmed ? 'bg-green-50/60 border-green-200' : 'bg-white border-border'} border rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all`}
                  >
                    <div className="flex gap-3">
                      <div className="relative w-[72px] h-[72px] shrink-0">
                        <LazyImage
                          src={mainImage ? getImageUrl(mainImage) : null}
                          className="w-full h-full rounded-xl border border-border6"
                          fallback={
                            <div className="w-full h-full flex items-center justify-center text-muted bg-soft">
                              <ImageIcon size={24} strokeWidth={1.5} />
                            </div>
                          }
                        />
                        {prods.length > 1 && (
                          <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 rounded-full bg-purple text-white text-[10px] font-bold grid place-items-center border-2 border-white" dir="ltr">
                            ×{prods.length}
                          </span>
                        )}
                        {mainImage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              downloadImage(getImageUrl(mainImage), mainImage.split('/').pop(), prods[0]?.size, prods[0]?.color)
                            }}
                            className="absolute bottom-1 left-1 w-5 h-5 rounded-md bg-black/60 text-white grid place-items-center border-0 hover:bg-black/80 transition-colors"
                            title="تحميل الصورة"
                          >
                            <Download size={11} />
                          </button>
                        )}

                      </div>

                      {/* Info */}
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-sm text-ink truncate m-0">{order.customer_name}</h4>
                          <div className="flex gap-1.5 items-center shrink-0" dir="ltr">
                            <button
                              onClick={() => handleConfirmOrder(order)}
                              disabled={confirming === order.id}
                              aria-pressed={!!order.confirmed}
                              className={`h-8 rounded-full border-2 px-2.5 flex items-center justify-center gap-1 text-[11px] font-extrabold transition-all duration-200 disabled:opacity-60 active:scale-95 ${
                                order.confirmed
                                  ? 'bg-green-500 border-green-500 text-white hover:bg-green-600 hover:border-green-600'
                                  : 'bg-white border-border7 text-muted hover:border-green-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={order.confirmed ? 'إلغاء تأكيد الطلب' : 'تأكيد الطلب'}
                            >
                              {confirming === order.id ? (
                                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Check size={13} strokeWidth={3} />
                              )}
                              <span>{order.confirmed ? 'مؤكد' : 'تأكيد'}</span>
                            </button>
                            {full && (
                              <button
                                onClick={() => openEditOrder(order)}
                                aria-label="تعديل الطلب"
                                title="تعديل الطلب"
                                className="w-8 h-8 rounded-lg bg-lav text-purple grid place-items-center border-0 hover:bg-purple/15 active:scale-95 transition-all"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteOrder(order)}
                              aria-label="حذف الطلب"
                              title="حذف الطلب"
                              className="w-8 h-8 rounded-lg bg-red-50 text-danger grid place-items-center border-0 hover:bg-red-100 active:scale-95 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-meta2 text-xs">
                          <Phone size={11} className="shrink-0 text-subtle" />
                          <a
                            href={`tel:${order.phone}`}
                            dir="ltr"
                            className="text-ink font-semibold no-underline hover:text-purple transition-colors"
                          >
                            {order.phone}
                          </a>
                        </div>

                      {order.address && (
                        <div className="flex items-start gap-1.5 mt-0.5 text-meta2 text-xs">
                          <MapPin size={11} className="mt-0.5 shrink-0" />
                          <span className="break-words">{order.address}</span>
                        </div>
                      )}
                          {/* Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {Number(order.montant) > 0 && (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 text-[10px] font-extrabold text-emerald-700 tabular-nums">
                                {Number(order.montant).toLocaleString('en-US')} دج
                              </span>
                            )}
                            {order.tracking && (
                              <span className="inline-flex items-center gap-1 border rounded-full px-2 py-1 text-[10px] font-semibold bg-lav border-purple/30 text-purple" dir="ltr">
                                <Package size={10} />
                                {order.tracking}
                              </span>
                            )}
                            {prods.length <= 1 && [...new Set(prods.map(p => p.productName).filter(Boolean))].map(name => (
                              <span key={name} className="inline-flex items-center gap-1 bg-lav border border-purple/30 rounded-full px-2 py-1 text-[10px] font-semibold text-purple truncate max-w-[160px]">
                                <ShoppingBag size={10} className="shrink-0" />
                                <span className="truncate">{name}</span>
                              </span>
                            ))}
                            {order.delivery_type && (
                              <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-1 text-[10px] font-semibold ${
                                order.delivery_type === 'home'
                                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                                  : 'bg-amber-50 border-amber-200 text-amber-600'
                              }`}>
                                {order.delivery_type === 'home' ? <Home size={10} /> : <Building2 size={10} />}
                                {order.delivery_type === 'home' ? 'المنزل' : 'المكتب'}
                              </span>
                            )}
                            {order.wilaya_name && (
                              <span className="inline-flex items-center gap-1 bg-soft border border-border rounded-full px-2 py-1 text-[10px] font-semibold text-meta2">
                                <MapPin size={10} className="shrink-0" />
                                {order.wilaya_name}{order.commune ? ` / ${order.commune}` : ''}
                              </span>
                            )}
                            {prods.length <= 1 && [...new Set(prods.map(p => p.color).filter(Boolean))].map(color => (
                              <span key={color} aria-label="اللون" className="inline-flex items-center bg-white border border-border rounded-full p-1">
                                <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: color }} />
                              </span>
                            ))}
                            {prods.length <= 1 && [...new Set(prods.map(p => p.size).filter(Boolean))].map(size => (
                              <span key={size} className="inline-flex items-center gap-1 bg-soft border border-border rounded-full px-2 py-1 text-[10px] font-semibold text-meta2">
                                <Ruler size={9} />
                                {size}
                              </span>
                            ))}
                            <span className="inline-flex items-center gap-1 text-[10px] text-subtle font-medium">
                              <Clock size={9} className="text-muted" />
                              {formatTime(new Date(order.created_at))}
                            </span>
                          </div>
                      </div>
                    </div>

                    {/* Multi-product orders only: one nested row per product inside this one row */}
                    {prods.length > 1 && (
                      <div className="mt-2.5 pt-2.5 border-t border-dashed border-border space-y-1.5">
                        {prods.map((p, pi) => (
                          <div key={pi} className="flex items-center gap-2 rounded-xl bg-soft/60 border border-border px-2.5 py-2">
                            <div className="relative w-7 h-7 shrink-0 rounded-md border border-border bg-white overflow-hidden">
                              <LazyImage
                                src={p.image ? getImageUrl(p.image) : (p.productId ? getImageUrl(productById(p.productId)?.image_url) : null)}
                                className="w-full h-full object-cover"
                                fallback={
                                  <div className="w-full h-full grid place-items-center text-muted bg-white">
                                    <ImageIcon size={12} strokeWidth={1.5} />
                                  </div>
                                }
                              />
                              {p.image && (
                                <button
                                  type="button"
                                  onClick={() => downloadImage(getImageUrl(p.image), p.image.split('/').pop(), p.size, p.color)}
                                  className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded bg-black/60 text-white grid place-items-center border-0 hover:bg-black/80 transition-colors"
                                  title="تحميل الصورة"
                                >
                                  <Download size={9} />
                                </button>
                              )}
                            </div>
                            <span className="flex-1 min-w-0 text-[11px] font-bold text-ink truncate">
                              {p.productName}
                            </span>
                            {p.color && (
                              <span aria-label="اللون" className="shrink-0 rounded-full bg-white border border-border p-1 grid place-items-center">
                                <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.color }} />
                              </span>
                            )}
                            {p.size && (
                              <span className="inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold text-meta2">
                                <Ruler size={9} />
                                {p.size}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {showCount < allDayGroups.length && dayGroups.length > 0 && (
        <button
          onClick={() => setShowCount(prev => prev + 20)}
          className="w-full py-3 rounded-2xl border border-border bg-white text-purple font-extrabold text-sm hover:bg-lav transition-colors shadow-sm mt-2"
        >
          تحميل المزيد ({allDayGroups.length - showCount} أيام أخرى)
        </button>
      )}

      {dayGroups.length === 0 && (
        filtersActive ? (
          <div className="text-center py-14">
            <div className="w-20 h-20 rounded-full bg-soft border border-border mx-auto mb-4 grid place-items-center">
              <SearchX size={30} className="text-muted" strokeWidth={1.6} />
            </div>
            <p className="font-bold text-ink text-base">لا توجد نتائج مطابقة</p>
            <p className="text-sm mt-1 text-subtle">جرّب اسماً أو رقماً آخر، أو أعد ضبط البحث والفلاتر.</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 h-9 px-4 rounded-xl border border-border bg-white text-purple text-xs font-extrabold hover:bg-lav transition-colors"
            >
              مسح البحث والفلاتر
            </button>
          </div>
        ) : (
          <div className="text-center py-16 text-muted">
            <div className="w-20 h-20 rounded-full bg-lav mx-auto mb-4 grid place-items-center">
              <ShoppingCart size={32} className="text-purple" />
            </div>
            <p className="font-bold text-ink text-base">لا توجد طلبات بعد</p>
            <p className="text-sm mt-1 text-subtle">أضف أول طلب للبدء</p>
          </div>
        )
      )}

      {/* ─── Bottom Sheet: Add / Edit Order ─── */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingOrder ? 'تعديل الطلب' : 'طلب جديد'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-3.5">
          {/* Customer Info */}
          <div className="rounded-2xl border border-border bg-white p-4 shadow-stat">
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-border">
              <div className="w-8 h-8 rounded-xl bg-purple text-white grid place-items-center text-[11px] font-extrabold shadow-sm">1</div>
              <span className="text-[13px] font-extrabold text-ink">بيانات الزبون</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2">
                <input type="text" value={customer.customer_name} onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })} placeholder="اسم الزبون" required className={inputCls(false)} />
              </div>
              <div>
                <input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="رقم الهاتف" required dir="ltr" className={inputCls(phoneInvalid)} />
                {phoneInvalid && <p className="text-xs text-danger m-0 mt-1">9-10 أرقام مطلوبة</p>}
              </div>
              <div>
                <input type="tel" value={customer.phone_2} onChange={(e) => setCustomer({ ...customer, phone_2: e.target.value })} placeholder="هاتف ثاني" dir="ltr" className={inputCls(false)} />
              </div>
              <div className="col-span-2">
                <input type="text" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="العنوان" className={inputCls(addressInvalid)} />
                {addressInvalid && <p className="text-xs text-danger m-0 mt-1">العنوان مطلوب</p>}
              </div>
            </div>

            {/* Delivery Type — inline toggle */}
            <div className="mt-3 flex flex-col gap-1.5">
              <label className="block text-xs font-bold text-ink">نوع التوصيل</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCustomer({ ...customer, delivery_type: 'home' })}
                  className={`h-10 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    customer.delivery_type === 'home'
                      ? 'border-purple bg-lav text-purple shadow-sm'
                      : 'border-border bg-white text-muted hover:border-purple/30'
                  }`}
                >
                  <span>🏠</span>
                  <span>منزلي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomer({ ...customer, delivery_type: 'desk' })}
                  className={`h-10 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    customer.delivery_type === 'desk'
                      ? 'border-purple bg-lav text-purple shadow-sm'
                      : 'border-border bg-white text-muted hover:border-purple/30'
                  }`}
                >
                  <span>🏢</span>
                  <span>بيرو</span>
                </button>
              </div>
              {customer.delivery_type === 'desk' && (
                <p className="text-xs text-subtle">ستظهر فقط البلديات التي بها مكتب</p>
              )}
            </div>
          </div>

          {/* Shipment data (ECOTRACK) */}
          <div className="rounded-2xl border border-border bg-white p-4 shadow-stat">
            <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-border">
              <div className="w-8 h-8 rounded-xl bg-purple text-white grid place-items-center text-[11px] font-extrabold shadow-sm">2</div>
              <span className="text-[13px] font-extrabold text-ink">بيانات الشحن</span>
            </div>
            <div className="space-y-2.5">
              {/* Order type */}
              <div>
                <label className="block text-xs font-extrabold text-ink mb-1.5">نوع الطلب</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { v: 1, l: 'توصيل', i: '🚚' },
                    { v: 2, l: 'استبدال', i: '🔁' },
                    { v: 3, l: 'استلام', i: '📥' },
                    { v: 4, l: 'تحصيل', i: '💵' },
                  ].map(t => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => setCustomer({ ...customer, order_type: t.v })}
                      className={`h-10 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-1 transition-all ${
                        customer.order_type === t.v
                          ? 'border-purple bg-lav text-purple shadow-sm'
                          : 'border-border bg-white text-muted hover:border-purple/30'
                      }`}
                    >
                      <span>{t.i}</span>
                      <span>{t.l}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Wilaya */}
              <div>
                <label className="block text-xs font-extrabold text-ink mb-1.5">الولاية</label>
                <select value={customer.code_wilaya} onChange={handleWilayaChange} className={inputCls(wilayaInvalid)}>
                  <option value="">— اختر الولاية —</option>
                  {[...wilayas].sort((a, b) => a.wilaya_id - b.wilaya_id).map((w) => (
                    <option key={w.wilaya_id} value={w.wilaya_id}>
                      {String(w.wilaya_id).padStart(2, '0')} — {w.wilaya_name}
                    </option>
                  ))}
                </select>                {wilayaInvalid && <p className="text-xs text-danger m-0 mt-1">الولاية مطلوبة</p>}
              </div>

              {/* Commune */}
              <div>
                <label className="block text-xs font-extrabold text-ink mb-1.5">البلدية</label>
                {orderCommunes && orderCommunes.length > 0 ? (
                  <select value={customer.commune} onChange={handleCommuneChange} className={inputCls(communeInvalid)}>
                    <option value="">— اختر البلدية —</option>
                    {customer.commune && !visibleCommunes.some((c) => c.nom === customer.commune) && (
                      <option value={customer.commune}>{customer.commune} ⚠️</option>
                    )}
                    {visibleCommunes.map((c) => (
                      <option key={c.nom} value={c.nom}>
                        {c.nom}{c.has_stop_desk ? ' 🏢' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={customer.commune} onChange={(e) => setCustomer({ ...customer, commune: e.target.value })} placeholder={!customer.code_wilaya ? 'اختر الولاية أولاً' : orderCommunes === null ? 'جاري التحميل...' : 'اسم البلدية'} className={inputCls(communeInvalid)} />
                )}
                {communeInvalid && <p className="text-xs text-danger m-0 mt-1">البلدية مطلوبة</p>}
                {deskMode && orderCommunes && visibleCommunes.length === 0 && (                  <p className="text-[11px] text-amber-600 m-0 mt-1">لا توجد بلديات بمكتب هنا — اختر «المنزل».</p>
                )}
                {stopDeskUnsupported && (
                  <p className="text-[11px] text-amber-600 m-0 mt-1">هذه البلدية بدون مكتب — اختر بلدية أخرى أو المنزل.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-extrabold text-ink mb-1.5">اسم المنتج</label>
                <input type="text" value={customer.produit} onChange={(e) => setCustomer({ ...customer, produit: e.target.value })} placeholder="يُملأ تلقائياً" className={inputCls(false)} />
              </div>

              {selectedFee && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-lav/40 border border-purple/20 px-3 py-2">
                    <span className="text-[10px] font-medium text-purple block">توصيل للمنزل</span>
                    <span className="text-xs font-bold text-purple" dir="ltr">{selectedFee.tarif} دج</span>
                  </div>
                  <div className="rounded-xl bg-white border border-border px-3 py-2">
                    <span className="text-[10px] font-medium text-subtle block">توصيل للمكتب</span>
                    <span className="text-xs font-bold text-muted" dir="ltr">{selectedFee.tarif_stopdesk} دج</span>
                  </div>
                </div>
              )}
            </div>

            {/* Price Summary */}
            <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl bg-lav/60 border border-purple/15 px-4 py-3.5">
              <div>
                <p className="text-xs font-medium text-ink">المبلغ المحصّل</p>
                <p className="text-[10px] text-subtle mt-0.5">
                  مجموع المنتجات {itemsTotal} دج ({items.length} منتج) + {deliveryFee} توصيل = {totalMontant} دج
                </p>
              </div>
              <span className="text-xl font-extrabold text-purple tabular-nums" dir="ltr">
                {totalMontant} <span className="text-xs font-semibold text-purple/70">دج</span>
              </span>
            </div>
          </div>

          {/* Products Section */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple text-white grid place-items-center text-[11px] font-extrabold shadow-sm">3</div>
                <span className="text-[13px] font-extrabold text-ink">المنتجات</span>
                <span className="bg-lav text-purple rounded-full min-w-[20px] h-5 px-1.5 grid place-items-center text-[10px] font-bold">{items.length}</span>
              </div>
              <button type="button" onClick={addItem} className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-purple text-white text-xs font-extrabold border-0 hover:bg-purple-2 transition-all shadow-sm hover:shadow-md">
                <Plus size={13} />
                إضافة
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-lav mb-2 grid place-items-center">
                  <ShoppingCart size={22} className="text-purple" />
                </div>
              <p className="text-sm font-bold text-ink">لا توجد منتجات</p>
              <p className="text-xs text-subtle mt-0.5">أضف منتجاً لبدء الطلب</p>
              </div>
            ) : (
            <div className="space-y-3 mb-2 max-h-[320px] overflow-y-auto pr-0.5">
              {items.map((item, index) => {
                const picked = productById(item.productId)
                return (
                <div key={item.id} className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
                  <div className="flex">
                    {/* Image area */}
                    <div className="w-[76px] shrink-0 border-r border-border bg-soft">
                      {item.imagePreview ? (
                        <div className="relative w-full h-full">
                          <img src={item.imagePreview} alt="" className="w-full h-full object-cover rounded-tl-lg" />
                          <button type="button" onClick={() => removeItemImage(item.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center border-0 hover:bg-black/80 transition-colors">
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-full border-0 border-dashed border-r-0 border-border rounded-tl-lg cursor-pointer hover:bg-white/70 transition-colors">
                          <ImageIcon size={18} className="text-muted mb-0.5" />
                          <span className="text-[9px] text-muted">صورة</span>
                          <input type="file" accept="image/*" onChange={(e) => handleItemImage(item.id, e)} className="hidden" />
                        </label>
                      )}
                    </div>

                    {/* Details */}
                    <div className="p-3">
                      {/* Product name badge + remove button */}
                      {(picked || items.length > 1) && (
                        <div className="flex items-center justify-between mb-2">
                          {picked && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-lav text-purple">
                              {picked.name}
                            </span>
                          )}
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItem(item.id)} className="w-6 h-6 rounded-full bg-danger/10 text-danger grid place-items-center hover:bg-danger/20 transition-colors" title="حذف المنتج" aria-label="حذف المنتج">
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Pick from stock (add flow only) */}
                      {!editingOrder && (
                        <div className="mt-2">
                          <select
                            value={item.productId || ''}
                            onChange={(e) => handleItemProduct(item.id, e.target.value)}
                            className="h-9 w-full border border-border rounded-lg px-2 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-all text-xs bg-white text-ink"
                            aria-label="اختر منتجاً من المخزون"
                          >
                            <option value="">— اختيار منتج من المخزون —</option>
                            {catalog.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          {catalog.length === 0 && (
                            <p className="text-[10px] text-amber-600 m-0 mt-1">لا توجد منتجات في المخزون — أضفها من تبويب «المخزون».</p>
                          )}
                        </div>
                      )}

                      {picked ? (
                        <>
                          {/* Colour swatches — no codes, just colours */}
                          <div className="mt-2">
                            <span className="block text-[10px] font-bold text-subtle mb-1">اللون</span>
                            {productColors(picked.variants).length === 0 ? (
                              <span className="text-[10px] text-subtle">لا ألوان لهذا المنتج</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {productColors(picked.variants).map(color => {
                                  const active = item.color === color
                                  return (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => handleItemColor(item.id, color)}
                                      aria-label="اختيار اللون"
                                      aria-pressed={active}
                                      className={`w-8 h-8 rounded-full transition-all ${
                                        active
                                          ? 'ring-2 ring-purple ring-offset-2'
                                          : 'ring-1 ring-border7 hover:ring-purple/40'
                                      }`}
                                      style={{ background: color }}
                                    />
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Sizes with the quantity available in stock */}
                          <div className="mt-2">
                            <span className="block text-[10px] font-bold text-subtle mb-1">المقاس</span>
                            {!item.color ? (
                              <span className="text-[10px] text-subtle">اختر اللون أولاً</span>
                            ) : productSizes(picked.variants, item.color).length === 0 ? (
                              <span className="text-[10px] text-subtle">لا مقاسات لهذا اللون</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {productSizes(picked.variants, item.color).map(size => {
                                  const qty = stockQty(picked, item.color, size)
                                  const active = item.size === size
                                  return (
                                    <button
                                      key={size}
                                      type="button"
                                      onClick={() => updateItem(item.id, 'size', size)}
                                      disabled={qty <= 0}
                                      className={`h-8 px-2.5 rounded-lg border text-[11px] font-bold transition-all ${
                                        active
                                          ? 'border-purple bg-lav text-purple'
                                          : qty <= 0
                                            ? 'border-border bg-soft text-subtle/50 line-through'
                                            : 'border-border bg-white text-meta2 hover:border-purple/40'
                                      }`}
                                    >
                                      {size}
                                      <span className="mr-1 text-[9px] opacity-70" dir="ltr">({qty})</span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {item.color && item.size && (
                            <p className={`text-[10px] font-bold mt-1.5 m-0 ${stockQty(picked, item.color, item.size) > 0 ? 'text-green-600' : 'text-danger'}`}>
                              {stockQty(picked, item.color, item.size) > 0
                                ? `سيُخصم من المخزون — المتوفر ${stockQty(picked, item.color, item.size)}`
                                : 'هذا المقاس غير متوفر في المخزون'}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="flex gap-2 mt-2">
                          {/* Free-text fallback for products not in the catalog */}
                          <div className="flex-1">
                            <input type="text" value={item.color} onChange={(e) => updateItem(item.id, 'color', e.target.value)} placeholder="اللون" className="h-9 w-full border border-border rounded-lg px-3 outline-none focus:border-purple transition-all text-xs bg-white placeholder:text-muted" />
                          </div>
                          <div className="flex-1">
                            <input type="text" value={item.size} onChange={(e) => updateItem(item.id, 'size', e.target.value)} placeholder="المقاس" className="h-9 w-full border border-border rounded-lg px-3 outline-none focus:border-purple transition-all text-xs bg-white placeholder:text-muted" />
                          </div>
                        </div>
                      )}

                      {/* Per-product price — summed into the order total */}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="shrink-0 text-[10px] font-bold text-subtle">السعر (دج)</span>
                        <input
                          type="number"
                          min="0"
                          value={item.price ?? ''}
                          onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                          placeholder={String(defaultUnitPrice || 0)}
                          dir="ltr"
                          className="no-spinner h-9 flex-1 min-w-0 border border-border rounded-lg px-3 outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-all text-xs bg-white"
                          aria-label="سعر المنتج"
                        />
                        <span className="shrink-0 text-[10px] font-bold text-purple" dir="ltr">
                          = {unitPriceOf(item)} دج
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>


          {/* Sticky submit row */}
          <div className="sticky bottom-0 bg-white border-t border-border pt-3.5 pb-4 z-10 shadow-bottom">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] text-subtle">{items.length} منتج · يُرسل كطلب واحد</span>
              <span className="text-[12px] font-extrabold text-purple" dir="ltr">{totalMontant} دج</span>
            </div>
            <button type="submit" disabled={saving} className="w-full h-[48px] border-0 rounded-2xl bg-purple text-white font-extrabold hover:bg-purple-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-[15px] shadow-lg shadow-purple/25 flex items-center justify-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {saving ? 'جاري الإرسال...' : editingOrder ? 'حفظ التعديلات' : 'حفظ وإرسال'}
            </button>
            <button type="button" onClick={() => setSheetOpen(false)} className="w-full h-[42px] border border-border bg-white rounded-2xl mt-2 hover:bg-soft transition-colors text-sm text-muted font-semibold">
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
        loading={deleting || confirming}
      />
    </div>
  )
}
