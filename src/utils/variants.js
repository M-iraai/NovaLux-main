// products.variants = [{ color: '#f8e45c', size: 'M', quantity: 3 }, ...]
// Both `color` and `size` are optional — a missing one means "not used":
//   { color, quantity }        → colour without sizes (rows written before `size`)
//   { color, size, quantity }  → a stocked colour/size pair
// Colours and sizes shown anywhere in the app are DERIVED from this list, so
// variants stays the single source of truth.

// Unique colours, in first-appearance order.
export function productColors(variants) {
  const out = []
  for (const v of variants || []) {
    const c = v?.color
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

// Unique sizes — only the ones stocked for `color` when a colour is given,
// otherwise every size the product has.
export function productSizes(variants, color) {
  const out = []
  for (const v of variants || []) {
    if (color && v?.color !== color) continue
    const s = v?.size
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

// Rows grouped by colour, colours in first-appearance order. Each row
// keeps its index in the original array so callers can update one row
// without losing track of it.
export function groupVariants(variants) {
  const groups = []
  const byColor = new Map()

  ;(variants || []).forEach((v, index) => {
    const color = v?.color || null
    if (!color) return // Skip variants without a colour — feature removed
    let group = byColor.get(color)
    if (!group) {
      group = { color, rows: [] }
      byColor.set(color, group)
      groups.push(group)
    }
    group.rows.push({
      size: v?.size || null,
      quantity: Number(v?.quantity) || 0,
      index,
    })
  })

  return groups
}
