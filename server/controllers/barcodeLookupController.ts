import { Request, Response } from 'express';
import { pool } from '../db';
import { getStringParam } from '../utils/request';

/**
 * Lookup menu item by barcode or SKU
 * GET /api/menu/items/lookup-barcode/:code
 */
export const lookupMenuItemByBarcode = async (req: Request, res: Response) => {
    try {
        const code = getStringParam((req.params as any).code);
        if (!code || code.length < 3) {
            return res.status(400).json({ error: 'BARCODE_REQUIRED', message: 'Barcode must be at least 3 characters' });
        }

        // Search by exact barcode first
        const result = await pool.query(
            `SELECT mi.*, mc.name as "categoryName", mc.name_ar as "categoryNameAr"
             FROM menu_items mi
             LEFT JOIN menu_categories mc ON mi.category_id = mc.id
             WHERE mi.barcode = $1
             LIMIT 1`,
            [code]
        );

        if (result.rows.length > 0) {
            return res.json({ found: true, item: result.rows[0], matchType: 'barcode' });
        }

        // Fallback: search by SKU
        const skuResult = await pool.query(
            `SELECT mi.*, mc.name as "categoryName", mc.name_ar as "categoryNameAr"
             FROM menu_items mi
             LEFT JOIN menu_categories mc ON mi.category_id = mc.id
             WHERE mi.sku = $1
             LIMIT 1`,
            [code]
        );

        if (skuResult.rows.length > 0) {
            return res.json({ found: true, item: skuResult.rows[0], matchType: 'sku' });
        }

        res.json({ found: false, code });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Lookup inventory item by barcode or SKU
 * GET /api/inventory/lookup-barcode/:code
 */
export const lookupInventoryItemByBarcode = async (req: Request, res: Response) => {
    try {
        const code = getStringParam((req.params as any).code);
        if (!code || code.length < 3) {
            return res.status(400).json({ error: 'BARCODE_REQUIRED' });
        }

        // Search by barcode
        const result = await pool.query(
            `SELECT * FROM inventory_items WHERE barcode = $1 LIMIT 1`,
            [code]
        );

        if (result.rows.length > 0) {
            return res.json({ found: true, item: result.rows[0], matchType: 'barcode' });
        }

        // Fallback: search by SKU
        const skuResult = await pool.query(
            `SELECT * FROM inventory_items WHERE sku = $1 LIMIT 1`,
            [code]
        );

        if (skuResult.rows.length > 0) {
            return res.json({ found: true, item: skuResult.rows[0], matchType: 'sku' });
        }

        res.json({ found: false, code });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Unified barcode lookup — searches both menu and inventory items
 * GET /api/barcode/lookup/:code
 */
export const unifiedBarcodeLookup = async (req: Request, res: Response) => {
    try {
        const code = getStringParam((req.params as any).code);
        if (!code || code.length < 3) {
            return res.status(400).json({ error: 'BARCODE_REQUIRED' });
        }

        // Check menu items first (most common for POS)
        const menuResult = await pool.query(
            `SELECT mi.id, mi.name, mi.name_ar as "nameAr", mi.price, mi.barcode, mi.sku, 
                    mi.image, mi.category_id as "categoryId", mi.is_available as "isAvailable",
                    mc.name as "categoryName"
             FROM menu_items mi
             LEFT JOIN menu_categories mc ON mi.category_id = mc.id
             WHERE mi.barcode = $1 OR mi.sku = $1
             LIMIT 1`,
            [code]
        );

        if (menuResult.rows.length > 0) {
            return res.json({
                found: true,
                type: 'menu_item',
                item: menuResult.rows[0],
                matchField: menuResult.rows[0].barcode === code ? 'barcode' : 'sku',
            });
        }

        // Check inventory items
        const invResult = await pool.query(
            `SELECT id, name, name_ar as "nameAr", barcode, sku, unit, category,
                    cost_price as "costPrice", purchase_price as "purchasePrice"
             FROM inventory_items
             WHERE barcode = $1 OR sku = $1
             LIMIT 1`,
            [code]
        );

        if (invResult.rows.length > 0) {
            return res.json({
                found: true,
                type: 'inventory_item',
                item: invResult.rows[0],
                matchField: invResult.rows[0].barcode === code ? 'barcode' : 'sku',
            });
        }

        res.json({ found: false, code });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Check if barcode already exists across all item types (for duplicate validation)
 * GET /api/barcode/check/:code?excludeId=xxx&excludeType=menu|inventory
 */
export const checkBarcodeExists = async (req: Request, res: Response) => {
    try {
        const code = getStringParam((req.params as any).code);
        const excludeId = getStringParam(req.query.excludeId);
        const excludeType = getStringParam(req.query.excludeType);

        if (!code) return res.json({ exists: false });

        const results: Array<{ id: string; name: string; type: string }> = [];

        // Check menu items
        const menuParams: string[] = [code];
        let menuQuery = `SELECT id, name, name_ar FROM menu_items WHERE barcode = $1`;
        if (excludeId && excludeType === 'menu') {
            menuQuery += ` AND id != $2`;
            menuParams.push(excludeId);
        }
        const menuResult = await pool.query(menuQuery, menuParams);
        menuResult.rows.forEach((r: any) => results.push({ id: r.id, name: r.name || r.name_ar, type: 'menu_item' }));

        // Check inventory items
        const invParams: string[] = [code];
        let invQuery = `SELECT id, name FROM inventory_items WHERE barcode = $1`;
        if (excludeId && excludeType === 'inventory') {
            invQuery += ` AND id != $2`;
            invParams.push(excludeId);
        }
        const invResult = await pool.query(invQuery, invParams);
        invResult.rows.forEach((r: any) => results.push({ id: r.id, name: r.name, type: 'inventory_item' }));

        res.json({ exists: results.length > 0, items: results });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Generate a random EAN-13 barcode with valid check digit
 * GET /api/barcode/generate
 */
export const generateBarcode = async (_req: Request, res: Response) => {
    try {
        // Generate 12 random digits (EAN-13 prefix: 200-299 for internal use)
        const prefix = '2' + String(Math.floor(Math.random() * 100)).padStart(2, '0');
        const digits = prefix + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');

        // Calculate EAN-13 check digit
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        const barcode = digits + checkDigit;

        // Verify it doesn't already exist
        const menuCheck = await pool.query(`SELECT id FROM menu_items WHERE barcode = $1`, [barcode]);
        const invCheck = await pool.query(`SELECT id FROM inventory_items WHERE barcode = $1`, [barcode]);

        if (menuCheck.rows.length > 0 || invCheck.rows.length > 0) {
            // Extremely rare collision — just generate another
            return generateBarcode(_req, res);
        }

        res.json({ barcode, format: 'EAN-13' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
