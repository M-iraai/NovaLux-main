-- Add ECOTRACK shipping fields to existing orders
-- Run this migration before deploying the merged add-order form.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_2 TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS code_wilaya INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wilaya_name TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commune TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS code_postal TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS montant NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS produit TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking TEXT DEFAULT '';

-- delivery_type ('home' | 'desk') already maps to ECOTRACK stop_desk (0 | 1)
