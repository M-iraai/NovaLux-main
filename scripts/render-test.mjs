// Headless render test: types into the product manager and the order form and
// fails if React unmounts (blank page) or logs a render error.
//
//   node scripts/render-test.mjs
//
import { JSDOM } from 'jsdom'
import esbuild from 'esbuild'
import vm from 'node:vm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ─────────────────────────── 1. bundle ─────────────────────────── */

const sqlRawPlugin = {
  name: 'sql-raw',
  setup(build) {
    build.onResolve({ filter: /\.sql\?raw$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'sqlraw',
    }))
    build.onLoad({ filter: /.*/, namespace: 'sqlraw' }, async (args) => ({
      contents: `export default ${JSON.stringify(await fs.readFile(args.path, 'utf8'))}`,
      loader: 'js',
    }))
  },
}

const supabaseStubPlugin = {
  name: 'supabase-stub',
  setup(build) {
    build.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'stub', namespace: 'supabase-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'supabase-stub' }, () => ({
      loader: 'js',
      contents: `
let rows = [];
export function __seed(r) { rows = (r || []).map(x => ({ ...x })) }
export const supabase = {
  from() {
    return {
      select: async () => ({ data: rows.map(r => ({ ...r })), error: null }),
      insert: async (vals) => {
        const list = (Array.isArray(vals) ? vals : [vals]).map((v, i) => ({ id: 'seed' + (rows.length + i + 1), ...v }))
        list.forEach(v => rows.push(v))
        return { data: list, error: null }
      },
      update: (vals) => ({ eq: async () => { rows = rows.map(r => ({ ...r, ...vals })); return { data: null, error: null } } }),
      delete: () => ({ eq: async (col, id) => { rows = rows.filter(r => r.id !== id); return { error: null } } }),
    }
  },
}
`,
    }))
  },
}

const bundle = await esbuild.build({
  entryPoints: [path.join(root, 'scripts/render-test-entry.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: '__TEST__',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"', global: 'globalThis' },
  plugins: [sqlRawPlugin, supabaseStubPlugin],
  logLevel: 'error',
})

/* ─────────────────────────── 2. jsdom ─────────────────────────── */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const w = dom.window

const GLOBALS = [
  'window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement',
  'HTMLTextAreaElement', 'HTMLButtonElement', 'Element', 'Node', 'Event', 'MouseEvent',
  'InputEvent', 'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'location', 'MutationObserver', 'SVGElement',
]
for (const key of GLOBALS) {
  if (!(key in w)) continue
  try {
    Object.defineProperty(globalThis, key, { value: w[key], configurable: true, writable: true })
  } catch { /* some globals are not configurable in this Node build */ }
}
globalThis.window = w
globalThis.document = w.document

/* ───────────────── 3. capture React render errors ───────────────── */

const fatals = []
const warnings = []
const record = (kind, text) => (kind === 'fatal' ? fatals : warnings).push(text)

const origError = console.error
console.error = (...args) => {
  const text = args.map(a => (a && a.stack) || (typeof a === 'object' ? safeJson(a) : String(a))).join(' ')
  if (/The above error occurred|Uncaught|is not a function|Cannot read propert|Cannot read propert|undefined is not|TypeError|ReferenceError/.test(text)) {
    record('fatal', text)
  } else {
    record('warning', text)
  }
}
function safeJson(a) { try { return JSON.stringify(a) } catch { return String(a) } }

w.addEventListener('error', (e) => record('fatal', `window.onerror: ${e.error?.stack || e.message}`))
process.on('unhandledRejection', (err) => record('fatal', `unhandledRejection: ${err?.stack || err}`))

/* ─────────────────────────── 4. run ─────────────────────────── */

vm.runInThisContext(bundle.outputFiles[0].text, { filename: 'bundle.js' })
const TEST = globalThis.__TEST__

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const tick = () => sleep(30)
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await sleep(25)
  }
  return fn()
}

let stepNo = 0
let failed = 0
const step = (name, fn) => {
  stepNo++
  const before = fatals.length
  try {
    fn()
    const newFatals = fatals.slice(before)
    if (newFatals.length) {
      failed++
      console.log(`  ✗ [${stepNo}] ${name}\n      ${newFatals[0].split('\n').slice(0, 3).join('\n      ')}`)
    } else {
      console.log(`  ✓ [${stepNo}] ${name}`)
    }
  } catch (err) {
    failed++
    console.log(`  ✗ [${stepNo}] ${name}\n      ${err.message}`)
  }
}
const must = (cond, msg = 'assertion failed') => { if (!cond) throw new Error(msg) }
const byText = (scope, sel, text) =>
  [...scope.querySelectorAll(sel)].find(el => (el.textContent || '').trim().includes(text))

const click = (el) => {
  must(el, 'element to click not found')
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
}
const setVal = (el, value) => {
  must(el, 'input not found')
  const proto = el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  const type = el.tagName === 'SELECT' ? 'change' : 'input'
  el.dispatchEvent(new w.Event(type, { bubbles: true }))
}
const notBlank = (scope, label) =>
  must(scope.innerHTML.trim().length > 0, `BLANK PAGE after ${label}`)

const toasts = []
const showToast = (m) => toasts.push(m)

/* ── Scenario A: product manager ── */
console.log('\nScenario A — product manager (المنتجات)')

TEST.__seed([
  { id: 'p1', name: 'sakura', price: 2500, created_at: '2026-09-20T17:57:32Z',
    variants: [
      { color: '#f8e45c', quantity: 3 },
      { color: '#f8e45c', size: 'L', quantity: 4 },
      { color: '#26a269', size: 'M', quantity: 2 },
    ] },
])

const cA = document.createElement('div')
document.body.appendChild(cA)
const rootA = TEST.createRoot(cA)
rootA.render(TEST.createElement(TEST.ProductsSection, { showToast }))
await tick()
const listReady = await waitFor(() => cA.innerHTML.includes('sakura'))
if (!listReady) {
  console.log('  DEBUG fatals-before:', fatals.length, fatals[0] ? fatals[0].split('\n')[0] : '')
  console.log('  DEBUG list html:', cA.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300))
}

step('list renders seeded product', () => must(cA.innerHTML.includes('sakura')))
step('list shows size ×qty and no colour codes', () => must(
  cA.textContent.includes('×4') && !cA.textContent.includes('f8e45c'),
  'expected ×qty chip and no visible hex text',
))

click(byText(cA, 'button', 'إضافة منتج'))
await tick()
step('add sheet opens', () => must(cA.querySelector('input[placeholder="مثال: قميص قطني"]'), 'name input missing'))

setVal(cA.querySelector('input[placeholder="مثال: قميص قطني"]'), 'تيشيرت')
await tick()
step('typing product name', () => notBlank(cA, 'typing the name'))

setVal(cA.querySelector('input[placeholder="يُملأ تلقائياً عند إضافة الطلب"]'), '2500')
await tick()
step('typing the price (type=number)', () => notBlank(cA, 'typing the price'))

// colour picker — there is no hex text field any more, pick visually
step('picking a colour', () => setVal(cA.querySelector('input[type="color"]'), '#112233'))
await tick()
click([...cA.querySelectorAll('button')].find(b => b.textContent.trim() === 'إضافة لون'))
await tick()
step('adding a colour via the picker', () => must(
  cA.querySelectorAll('input[placeholder="المقاس"]').length === 1,
  'colour group missing',
))
step('no colour code visible in the product form', () => must(
  !cA.textContent.includes('112233') && !cA.textContent.includes('#'),
  'hex code shown',
))

step('typing the quantity (type=number) — reported crash', () => {
  setVal(cA.querySelector('input[placeholder="كمية"]'), '5')
})
await tick()
step('quantity typed without blank page', () => notBlank(cA, 'typing the quantity'))
step('quantity value stuck', () => must(cA.querySelector('input[placeholder="كمية"]').value === '5'))

const sizeInputs = [...cA.querySelectorAll('input[placeholder="المقاس"]')]
step('typing a size for the new colour', () => { setVal(sizeInputs[sizeInputs.length - 1], 'L') })
await tick()
step('typing quantity for that colour', () => {
  const qtys = [...cA.querySelectorAll('input[placeholder="كمية"]')]
  setVal(qtys[qtys.length - 1], '2')
})
await tick()
step('form still alive after all typing', () => notBlank(cA, 'typing variants'))

// submit
cA.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
await sleep(80)
step('saving the product', () => must(!fatals.length, 'crash while saving'))
step('saved product appears in the list', () => must(cA.innerHTML.includes('تيشيرت'), 'new product not listed'))
step('sheet closed after save', () => must(!cA.querySelector('input[placeholder="مثال: قميص قطني"]')))

// edit
click(cA.querySelector('button[title="تعديل"]'))
await tick()
step('edit sheet opens', () => {
  must(cA.querySelector('form'), 'form missing')
  const q = cA.querySelector('input[placeholder="كمية"]')
  must(q, 'quantity input missing in edit')
})
const editQty = cA.querySelector('input[placeholder="كمية"]')
step('editing: quantity prefilled as text', () => must(/^[\d.]*$/.test(editQty.value), `got "${editQty.value}"`))
setVal(editQty, '7')
await tick()
step('editing quantity value', () => must(cA.querySelector('input[placeholder="كمية"]').value === '7'))

click(byText(cA, 'form button', 'إلغاء'))
await tick()
step('cancel closes the sheet', () => !cA.innerHTML.includes('حفظ التعديلات'))

// legacy rows written before `size` existed ({ color, quantity }) must open too
const sakuraCard = [...cA.querySelectorAll('div')].find(
  el => typeof el.className === 'string' && el.className.includes('rounded-2xl') && el.textContent.includes('sakura'),
)
step('legacy product card found', () => must(sakuraCard, 'sakura card missing'))
click(sakuraCard.querySelector('button[title="تعديل"]'))
await tick()
step('editing legacy product (variants without size)', () => {
  must(cA.querySelector('input[placeholder="مثال: قميص قطني"]').value === 'sakura', 'name not loaded')
  must(cA.querySelectorAll('input[placeholder="كمية"]').length >= 1, 'quantity rows missing')
})
const legacyQty = cA.querySelector('input[placeholder="كمية"]')
setVal(legacyQty, '9')
await tick()
step('typing quantity on legacy rows', () => notBlank(cA, 'typing legacy quantity'))
click(byText(cA, 'form button', 'إلغاء'))
await tick()

// delete
click(cA.querySelector('button[title="حذف"]'))
await tick()
step('delete confirmation opens', () => must(byText(document.body, 'button', 'حذف'), 'dialog missing'))
click([...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'حذف' && b.className.includes('danger')))
await sleep(60)
step('delete confirmed without crash', () => notBlank(cA, 'delete'))

rootA.unmount()
cA.remove()

/* ── Scenario B: order form ── */
console.log('\nScenario B — order form (طلب جديد)')

const cB = document.createElement('div')
document.body.appendChild(cB)
const rootB = TEST.createRoot(cB)
rootB.render(TEST.createElement(TEST.OrdersSection, {
  orders: [], full: true, onRefresh: () => {}, showToast,
}))
await sleep(80)

step('orders section renders', () => must(cB.innerHTML.includes('إضافة طلب')))
click(byText(cB, 'button', 'إضافة طلب'))
await tick()
step('order sheet opens', () => must(cB.querySelector('input[placeholder*="اسم الزبون"]')))

const priceInput = cB.querySelector('input[placeholder="0.00"]')
step('price field exists', () => must(priceInput))
step('typing the product price (type=number) — reported crash', () => setVal(priceInput, '2500'))
await tick()
step('price typed without blank page', () => notBlank(cB, 'typing price'))
step('total recomputed', () => must(cB.innerHTML.includes('2500'), 'total not shown'))

const wilayaInput = cB.querySelector('input[placeholder="رقم الولاية (1-58)"]')
step('typing the wilaya number (type=number)', () => { if (wilayaInput) setVal(wilayaInput, '16') })
await tick()

setVal(cB.querySelector('input[placeholder*="اسم الزبون"]'), 'أحمد')
setVal(cB.querySelector('input[placeholder^="رقم الهاتف"]'), '0550123456')
await tick()

// the product picker was removed from the add-order rows: colour and size are
// plain free-text fields that don't depend on anything else
const picker = [...cB.querySelectorAll('select')].find(s => s.querySelector('option[value="p1"]'))
step('product picker removed from the add-order rows', () => must(!picker, 'product select still rendered'))
const colorInput = cB.querySelector('input[placeholder="اللون"]')
const sizeInput = cB.querySelector('input[placeholder="المقاس"]')
step('colour is a plain text field', () => must(colorInput, 'colour input missing'))
step('size is a plain text field', () => must(sizeInput, 'size input missing'))
step('typing the colour', () => setVal(colorInput, 'أزرق'))
await tick()
step('typing the size', () => setVal(sizeInput, 'M'))
await tick()
step('order form alive after typing colour/size', () => notBlank(cB, 'typing colour/size'))
step('no colour code visible in the order form', () => must(
  !cB.textContent.includes('f8e45c') && !cB.textContent.includes('#'),
  'hex code shown',
))

// submit with incomplete data → validation path (no crash)
cB.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
await sleep(60)
step('incomplete submit shows validation, no crash', () => notBlank(cB, 'validation'))

rootB.unmount()
cB.remove()

/* ─────────────────────────── report ─────────────────────────── */

console.log(`\nsteps: ${stepNo}, failed: ${failed}`)
if (warnings.length) {
  console.log(`\n${warnings.length} react warning(s):`)
  ;[...new Set(warnings.map(x => x.split('\n')[0]))].slice(0, 8).forEach(x => console.log('  - ' + x))
}
if (fatals.length) {
  console.log(`\n${fatals.length} FATAL error(s):`)
  ;[...new Set(fatals.map(x => x.split('\n')[0]))].slice(0, 8).forEach(x => console.log('  ! ' + x))
}
process.exit(failed || fatals.length ? 1 : 0)
