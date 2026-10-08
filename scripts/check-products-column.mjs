// Read-only schema probe: checks whether the pending migrations are applied.
// Prints only HTTP status + PostgREST message (never the credentials).
import 'dotenv/config'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.log('RESULT: no supabase url/key found in env')
  process.exit(0)
}

async function probe(path) {
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    const text = await res.text()
    return `${res.status} ${text.slice(0, 200)}`
  } catch (err) {
    return `request failed — ${err.message}`
  }
}

console.log('008 orders.products :', await probe('orders?select=products&limit=1'))
console.log('009 products table  :', await probe('products?select=id&limit=1'))
console.log(
  '009 full columns    :',
  await probe('products?select=name,price,colors,sizes,created_at&limit=1'),
)
// RLS control: orders has an authenticated-only policy, so anon must see []
console.log('RLS control (orders):', await probe('orders?select=id&limit=1'))
console.log('products row shape  :', await probe('products?select=*&limit=1'))
