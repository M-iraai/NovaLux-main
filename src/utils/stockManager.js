/**
 * Professional Stock Manager
 * 
 * Handles inventory deduction/increment for product variants when orders are
 * placed or cancelled. Connects to Supabase to update product variant quantities.
 * 
 * Usage:
 *   import { subtractStock, addStock } from '@/utils/stockManager'
 *   await subtractStock(products, catalog, showToast)
 *   await addStock(products, catalog, showToast)
 */

import { supabase } from '../lib/supabase'

/**
 * Subtract ordered quantities from catalog stock.
 * For each order item that references a catalog product (via product_id + 
 * matching colour/size variant), decrement that variant's quantity in the 
 * products.variants array.
 * 
 * @param {Array} products - Order products with product_id, color, size
 * @param {Array} catalog - Product catalog from Supabase products table
 * @param {Function} showToast - Toast notification function
 * @returns {Promise<void>}
 */
export async function subtractStock(products, catalog, showToast) {
  if (!products || products.length === 0) return

  // Count how many of each (product_id, color, size) were ordered
  const byProduct = new Map() // productId -> [{ color, size, count }]

  for (const p of products) {
    if (!p?.product_id || !p.color || !p.size) continue
    if (!byProduct.has(p.product_id)) byProduct.set(p.product_id, [])
    const arr = byProduct.get(p.product_id)
    const existing = arr.find(
      e => e.color === p.color && e.size === p.size
    )
    if (existing) existing.count += 1
    else arr.push({ color: p.color, size: p.size, count: 1 })
  }

  if (byProduct.size === 0) return

  // Update each product's variants in Supabase
  for (const [pid, entries] of byProduct) {
    const product = (catalog || []).find(
      c => String(c.id) === String(pid)
    )
    if (!product) continue

    const variants = Array.isArray(product.variants) ? product.variants : []
    if (!variants.length) continue

    const updated = variants.map(v => {
      const entry = entries.find(
        e => e.color === v.color && e.size === v.size
      )
      if (entry) {
        return {
          ...v,
          quantity: Math.max(0, (Number(v.quantity) || 0) - entry.count),
        }
      }
      return v
    })

    const { error } = await supabase
      .from('products')
      .update({ variants: updated })
      .eq('id', pid)

    if (error) {
      // Non-fatal: the order is already saved, but the user must know the
      // catalog quantity was not reduced.
      showToast?.(`تعذر تحديث المخزون للمنتج "${product.name}": ${error.message}`)
    }
  }
}

/**
 * Add back the exact quantities an order took from the catalog.
 * For each order item that references a catalog product (product_id + 
 * matching colour/size variant), increment that variant's quantity.
 * 
 * @param {Array} products - Order products with product_id, color, size
 * @param {Array} catalog - Product catalog from Supabase products table
 * @param {Function} showToast - Toast notification function
 * @returns {Promise<void>}
 */
export async function addStock(products, catalog, showToast) {
  if (!products || products.length === 0) return

  // Count how many of each (product_id, color, size) were in the order
  const byProduct = new Map() // productId -> [{ color, size, count }]

  for (const p of products) {
    // Support both camelCase (from orderProducts) and snake_case (from raw rows)
    const pid = p?.product_id || p?.productId
    if (!pid || !p.color || !p.size) continue
    if (!byProduct.has(pid)) byProduct.set(pid, [])
    const arr = byProduct.get(pid)
    const existing = arr.find(
      e => e.color === p.color && e.size === p.size
    )
    if (existing) existing.count += 1
    else arr.push({ color: p.color, size: p.size, count: 1 })
  }

  if (byProduct.size === 0) return

  // Update each product's variants in Supabase
  for (const [pid, entries] of byProduct) {
    const product = (catalog || []).find(
      c => String(c.id) === String(pid)
    )
    if (!product) continue

    const variants = Array.isArray(product.variants) ? product.variants : []
    if (!variants.length) continue

    const updated = variants.map(v => {
      const entry = entries.find(
        e => e.color === v.color && e.size === v.size
      )
      if (entry) {
        return { ...v, quantity: (Number(v.quantity) || 0) + entry.count }
      }
      return v
    })

    const { error } = await supabase
      .from('products')
      .update({ variants: updated })
      .eq('id', pid)

    if (error) {
      showToast?.(`تعذر إرجاع الكمية للمنتج "${product.name}": ${error.message}`)
    }
  }
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
  getStockLevels,
  checkStockAvailability,
}