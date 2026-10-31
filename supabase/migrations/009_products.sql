-- Product catalog: name + price + photo + stock variants.
--
--   variants = [ { "color": "#f8e45c", "size": "M", "quantity": 3 }, ... ]
--
--   • color and size are both optional — a variant may be colour-only,
--     size-only, or both. Rows written before `size` existed
--     ( { color, quantity } ) keep working: a missing size simply means
--     "this colour has no sizes".
--   • the colours and sizes shown in the app are DERIVED from this list, so
--     variants is the single source of truth (no colors/sizes columns).
--
-- Safe to re-run.

-- ─── 1. Fresh database → create the table ───
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  image_url TEXT,
  variants JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Existing table → add the price the app auto-fills into orders ───
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;

-- ─── 2b. Existing table → product photo key (R2), used by the stock manager ───
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ─── 3. RLS — the anon key is public in the JS bundle, so the catalog must
--        be locked to signed-in users (same policy as orders) ───
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'Allow all for authenticated users'
  ) THEN
    CREATE POLICY "Allow all for authenticated users" ON products
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- NOTE: this script never drops a policy it did not create — if a public
-- storefront reads this table with the anon key, review
-- Table Editor → Policies before/after running it.
