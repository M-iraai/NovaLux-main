import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log('=== PRODUCTS TABLE ===')
const { data: products, error: pErr } = await supabase.from('products').select('*')
if (pErr) {
  console.error('Error fetching products:', pErr.message)
} else {
  console.log('Found', products?.length || 0, 'products')
  for (const p of products || []) {
    console.log(`\nProduct: ${p.name} (id: ${p.id})`)
    console.log('  price:', p.price)
    console.log('  variants:', JSON.stringify(p.variants, null, 2))
  }
}

console.log('\n=== ORDERS TABLE (last 5) ===')
const { data: orders, error: oErr } = await supabase
  .from('orders')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5)
if (oErr) {
  console.error('Error fetching orders:', oErr.message)
} else {
  console.log('Found', orders?.length || 0, 'orders')
  for (const o of orders || []) {
    console.log(`\nOrder: ${o.customer_name} tracking: ${o.tracking}`)
    console.log('  products field:', JSON.stringify(o.products, null, 2))
    console.log('  color (old field):', JSON.stringify(o.color))
    console.log('  size (old field):', JSON.stringify(o.size))
    console.log('  created_at:', o.created_at)
  }
}

console.log('\nDone.')
