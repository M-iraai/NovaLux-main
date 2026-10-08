-- One row per order: every product (photo + colour + size) in a single JSON list.
-- products = [{ "image": "products/1712-abc.webp", "color": "Red", "size": "L" }, ...]
-- image_url / color / size keep holding the FIRST product, so old readers and
-- rows saved before this migration still work.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS products JSONB;
