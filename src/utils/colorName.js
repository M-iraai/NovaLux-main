// Each colour is stored as hex and displayed ONLY as a square swatch — no
// text names, no hex codes anywhere in the UI. This module stays here for
// future use; nothing in the UI calls it anymore.

// Nearest name by RGB distance — kept for reference, never used by the UI.
export function colorName(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'لون'
  let best = 'أحمر'
  let bestDist = Infinity
  for (const [name, [r, g, b]] of PALETTE) {
    const d = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}

// Visible colour for swatches: return the stored hex code verbatim — the UI
// renders it as a solid square, so no label is needed.
export function colorLabel(value) {
  return String(value || '')
}
