-- Product price (delivery fee excluded)
-- The collected total (montant) sent to ECOTRACK is computed as:
--   product price + delivery fee for the selected wilaya / delivery type

ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_price NUMERIC DEFAULT 0;
