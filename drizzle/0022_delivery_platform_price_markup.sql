ALTER TABLE delivery_platforms
    ADD COLUMN IF NOT EXISTS apply_fees_to_menu_price boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS price_markup_percentage real DEFAULT 0,
    ADD COLUMN IF NOT EXISTS price_markup_fixed real DEFAULT 0;
