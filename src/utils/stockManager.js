/**
 * Professional Stock Manager
 *
 * Handles inventory movement for product variants when orders are placed,
 * edited or cancelled. Connects to Supabase to update product variant
 * quantities.
 *
 * Quantity math is always applied to the variants array **read fresh from the
 * database right before the write**, never to a snapshot the caller loaded
 * minutes ago — otherwise a stock change made in the stock manager between
 * opening the order sheet and saving it would be silently overwritten.
 *
 * Usage:
 *   import { subtractStock, addStock, syncStock } from '@/utils/stockManager'
 *   await subtractStock(products, catalog, showToast)   // order placed
 *   await addStock(products, catalog, showToast)        // order deleted
 *   await syncStock(oldProducts, newProducts, catalog, showToast) // order edited
 */

import { supabase } from '../lib/supabase'

// Order items carry snake_case from DB rows and camelCase from form items.
const productIdOf = (p) => p?.product_id || p?.productId || null

/**
 * Count how many units each (product_id, colour, size) holds.
 * @returns {Map<string, Array<{color: string, size: string, count: number}>>}
 */
function groupByProduct(products) {
  const byProduct = new Map()
  for (const p of products || []) {
    const pid = productIdOf(p)
    if (!pid || !p.color || !p.size) continue
    if (!byProduct.has(pid)) byProduct.set(pid, [])
    const entries = byProduct.get(pid)
    const existing = entries.find(e => e.color === p.color && e.size === p.size)
    if (existing) existing.count += 1
    else entries.push({ color: p.color, size: p.size, count: 1 })
  }
  return byProduct
}

/**
 * Read a product row fresh from the database, falling back to the caller's
 * catalog snapshot only if the read fails.
 */
async function readProduct(pid, catalog) {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,variants')
    .eq('id', pid)
    .maybeSingle()
  if (!error && data) return data
  return (catalog || []).find(c => String(c.id) === String(pid)) || null
}

const stockErrorMessage = (kind, name, message) => kind === 'add'
  ? `تعذر إرجاع الكمية للمنتج "${name}": ${message}`
  : `تعذر تحديث المخزون للمنتج "${name}": ${message}`

/**
 * Apply one signed delta set per product:
 * positive `delta` → units go back to the catalog, negative → units are taken.
 * Each touched product is written exactly once, so a net-zero change is a no-op.
 *
 * @param {Map<string, Array<{color: string, size: string, delta: number}>>} byProduct
 * @param {Array} catalog - Fallback snapshot if a fresh read fails
 * @param {Function} showToast
 * @param {'add'|'subtract'} kind - Picks the toast wording
 */
async function applyDeltas(byProduct, catalog, showToast, kind) {
  for (const [pid, entries] of byProduct) {
    if (!entries.length) continue

    const product = await readProduct(pid, catalog)
    if (!product) continue

    const variants = Array.isArray(product.variants) ? product.variants : []
    if (!variants.length) continue

    let changed = false
    const updated = variants.map(v => {
      const entry = entries.find(
        e => e.color === v.color && e.size === v.size
      )
      if (!entry || entry.delta === 0) return v
      changed = true
      return {
        ...v,
        quantity: Math.max(0, (Number(v.quantity) || 0) + entry.delta),
      }
    })
    if (!changed) continue

    const { error } = await supabase
      .from('products')
      .update({ variants: updated })
      .eq('id', pid)

    if (error) {
      // Non-fatal: the order side is already saved, but the user must know the
      // catalog quantity was not changed.
      showToast?.(stockErrorMessage(kind, product.name, error.message))
    }
  }
}

/**
 * Subtract ordered quantities from catalog stock.
 * For each order item that references a catalog product (via product_id +
 * matching colour/size variant), decrement that variant's quantity.
 *
 * @param {Array} products - Order products with product_id/productId, color, size
 * @param {Array} catalog - Product catalog snapshot (fallback only)
 * @param {Function} showToast - Toast notification function
 * @returns {Promise<void>}
 */
export async function subtractStock(products, catalog, showToast) {
  const byProduct = groupByProduct(products)
  if (byProduct.size === 0) return

  const deltas = new Map()
  for (const [pid, entries] of byProduct) {
    deltas.set(pid, entries.map(e => ({ color: e.color, size: e.size, delta: -e.count })))
  }
  await applyDeltas(deltas, catalog, showToast, 'subtract')
}

/**
 * Add back the exact quantities an order took from the catalog.
 * For each order item that references a catalog product (via product_id +
 * matching colour/size variant), increment that variant's quantity.
 *
 * @param {Array} products - Order products with product_id/productId, color, size
 * @param {Array} catalog - Product catalog snapshot (fallback only)
 * @param {Function} showToast - Toast notification function
 * @returns {Promise<void>}
 */
export async function addStock(products, catalog, showToast) {
  const byProduct = groupByProduct(products)
  if (byProduct.size === 0) return

  const deltas = new Map()
  for (const [pid, entries] of byProduct) {
    deltas.set(pid, entries.map(e => ({ color: e.color, size: e.size, delta: e.count })))
  }
  await applyDeltas(deltas, catalog, showToast, 'add')
}

/**
 * Move stock from what an order held to what it holds after an edit.
 * Units of variants the order no longer has go back to the catalog, variants
 * it now has are taken out, and unchanged pairs cancel out to a single write.
 *
 * @param {Array} oldProducts - Items the order held before the edit
 * @param {Array} newProducts - Items the order holds after the edit
 * @param {Array} catalog - Product catalog snapshot (fallback only)
 * @param {Function} showToast - Toast notification function
 * @returns {Promise<void>}
 */
export async function syncStock(oldProducts, newProducts, catalog, showToast) {
  const net = new Map() // productId -> [{ color, size, delta }]

  const push = (pid, color, size, delta) => {
    if (!pid || !color || !size || !delta) return
    if (!net.has(pid)) net.set(pid, [])
    const entries = net.get(pid)
    const existing = entries.find(e => e.color === color && e.size === size)
    if (existing) existing.delta += delta
    else entries.push({ color, size, delta })
  }

  for (const [pid, entries] of groupByProduct(oldProducts)) {
    for (const e of entries) push(pid, e.color, e.size, e.count)
  }
  for (const [pid, entries] of groupByProduct(newProducts)) {
    for (const e of entries) push(pid, e.color, e.size, -e.count)
  }

  // Unchanged colour/size pairs: nothing to write at all.
  for (const [pid, entries] of net) {
    const kept = entries.filter(e => e.delta !== 0)
    if (kept.length) net.set(pid, kept)
    else net.delete(pid)
  }
  if (net.size === 0) return

  await applyDeltas(net, catalog, showToast, 'subtract')
}

/**
 * Get current stock levels for a product.
 *
 * @param {String} productId - Product ID
 * @returns {Array} - Variants with current stock levels
 */
export function getStockLevels(productId, catalog) {
  const product = (catalog || []).find(
    c => String(c.id) === String(productId)
  )
  return product ? (Array.isArray(product.variants) ? product.variants : []) : []
}

/**
 * Check if a product variant has sufficient stock.
 *
 * @param {String} productId - Product ID
 * @param {String} color - Variant color
 * @param {String} size - Variant size
 * @param {Number} requestedQty - Quantity needed
 * @param {Array} catalog - Product catalog
 * @returns {Object} - { hasEnough: boolean, currentQty: number, variant?: Object }
 */
export function checkStockAvailability(
  productId,
  color,
  size,
  requestedQty,
  catalog
) {
  const product = (catalog || []).find(
    c => String(c.id) === String(productId)
  )
  if (!product) return { hasEnough: false, currentQty: 0 }

  const variants = Array.isArray(product.variants) ? product.variants : []
  const variant = variants.find(
    v => v.color === color && v.size === size
  )

  if (!variant) return { hasEnough: false, currentQty: 0 }

  const hasEnough = (Number(variant.quantity) || 0) >= requestedQty
  return {
    hasEnough,
    currentQty: variant.quantity || 0,
    variant,
  }
}

export default {
  subtractStock,
  addStock,
  syncStock,
  getStockLevels,
  checkStockAvailability,
}
