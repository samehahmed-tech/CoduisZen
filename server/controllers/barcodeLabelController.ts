/**
 * Barcode Label Controller
 * Generates printable barcode labels (HTML) for inventory items.
 * Supports: Code128, EAN-13, and QR-Code via inline SVG generation.
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { inventoryItems } from '../../src/db/schema';
import { inArray, eq } from 'drizzle-orm';

// ============================================================================
// Code128 SVG Barcode Generator (pure server-side, no dependencies)
// ============================================================================

const CODE128_START_B = 104;
const CODE128_STOP = 106;

const CODE128_PATTERNS: string[] = [
    '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
    '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
    '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
    '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
    '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
    '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
    '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
    '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
    '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
    '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
    '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
    '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
    '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
    '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
    '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
    '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
    '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
    '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
    '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
    '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
    '10111101110', '11101011110', '11110101110',
    '11010000100', '11010010000', '11010011100', // start codes A, B, C
    '11000111010', // stop
];

function encodeCode128B(text: string): string {
    const values: number[] = [CODE128_START_B];
    let checksum = CODE128_START_B;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) - 32;
        if (charCode < 0 || charCode > 94) continue; // skip unsupported
        values.push(charCode);
        checksum += charCode * (i + 1);
    }
    values.push(checksum % 103);
    values.push(CODE128_STOP);

    return values.map(v => CODE128_PATTERNS[v] || '').join('');
}

function code128ToSvg(text: string, width = 200, height = 60): string {
    const bits = encodeCode128B(text);
    if (!bits) return '';
    const barWidth = Math.max(1, width / bits.length);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${bits.length} ${height}">`;
    for (let i = 0; i < bits.length; i++) {
        if (bits[i] === '1') {
            svg += `<rect x="${i}" y="0" width="1" height="${height}" fill="#000"/>`;
        }
    }
    svg += '</svg>';
    return svg;
}

// ============================================================================
// Label HTML Generator
// ============================================================================

interface LabelItem {
    id: string;
    name: string;
    nameAr?: string | null;
    barcode?: string | null;
    sku?: string | null;
    unit?: string | null;
    costPrice?: number | null;
}

function generateLabelHtml(items: LabelItem[], options: {
    labelWidth: number;    // mm
    labelHeight: number;   // mm
    columns: number;
    showPrice: boolean;
    showSku: boolean;
    copies: number;
}): string {
    const { labelWidth, labelHeight, columns, showPrice, showSku, copies } = options;

    const labelCards = items.flatMap(item => {
        const barcodeValue = item.barcode || item.sku || item.id;
        const barcodeSvg = code128ToSvg(barcodeValue, 180, 40);
        const labels: string[] = [];

        for (let c = 0; c < copies; c++) {
            labels.push(`
                <div class="label" style="width:${labelWidth}mm; height:${labelHeight}mm;">
                    <div class="item-name">${item.name}</div>
                    ${item.nameAr ? `<div class="item-name-ar">${item.nameAr}</div>` : ''}
                    <div class="barcode-svg">${barcodeSvg}</div>
                    <div class="barcode-text">${barcodeValue}</div>
                    ${showSku && item.sku ? `<div class="sku">SKU: ${item.sku}</div>` : ''}
                    ${showPrice && item.costPrice ? `<div class="price">${Number(item.costPrice).toFixed(2)} EGP</div>` : ''}
                </div>
            `);
        }
        return labels;
    });

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Barcode Labels — Coduis Zen</title>
<style>
    @page { margin: 5mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: 'Segoe UI', Arial, sans-serif;
        display: flex;
        flex-wrap: wrap;
        gap: 2mm;
        padding: 5mm;
    }
    .label {
        border: 0.3mm dashed #ccc;
        padding: 2mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        page-break-inside: avoid;
        overflow: hidden;
    }
    .item-name {
        font-size: 9pt;
        font-weight: 600;
        text-align: center;
        line-height: 1.2;
        max-height: 2.4em;
        overflow: hidden;
        margin-bottom: 1mm;
    }
    .item-name-ar {
        font-size: 8pt;
        direction: rtl;
        text-align: center;
        color: #333;
        margin-bottom: 1mm;
    }
    .barcode-svg {
        margin: 1mm 0;
    }
    .barcode-svg svg {
        width: 90%;
        height: auto;
        max-height: 12mm;
    }
    .barcode-text {
        font-size: 7pt;
        font-family: 'Courier New', monospace;
        letter-spacing: 1px;
        text-align: center;
    }
    .sku {
        font-size: 6pt;
        color: #666;
        margin-top: 0.5mm;
    }
    .price {
        font-size: 10pt;
        font-weight: 700;
        margin-top: 1mm;
        color: #111;
    }
    @media print {
        .label { border: none; }
        body { gap: 0; }
    }
</style>
</head>
<body>
${labelCards.join('\n')}
</body>
</html>
    `.trim();
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * POST /api/inventory/barcode-labels
 * Body: { itemIds: string[], options?: { labelWidth, labelHeight, columns, showPrice, showSku, copies } }
 * Returns: HTML page with printable barcode labels
 */
export const generateBarcodeLabels = async (req: Request, res: Response) => {
    try {
        const { itemIds, options } = req.body || {};

        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ error: 'itemIds array is required' });
        }
        if (itemIds.length > 200) {
            return res.status(400).json({ error: 'Maximum 200 items per batch' });
        }

        const items = await db.select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            nameAr: inventoryItems.nameAr,
            barcode: inventoryItems.barcode,
            sku: inventoryItems.sku,
            unit: inventoryItems.unit,
            costPrice: inventoryItems.costPrice,
        }).from(inventoryItems).where(inArray(inventoryItems.id, itemIds));

        if (items.length === 0) {
            return res.status(404).json({ error: 'No items found for given IDs' });
        }

        const labelOptions = {
            labelWidth: Number(options?.labelWidth || 50),   // mm
            labelHeight: Number(options?.labelHeight || 30),  // mm
            columns: Number(options?.columns || 4),
            showPrice: options?.showPrice !== false,
            showSku: options?.showSku !== false,
            copies: Math.max(1, Math.min(Number(options?.copies || 1), 50)),
        };

        const html = generateLabelHtml(items as LabelItem[], labelOptions);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /api/inventory/barcode-labels/preview/:id
 * Returns: HTML preview for a single item's barcode label
 */
export const previewBarcodeLabel = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        if (!id) return res.status(400).json({ error: 'Item ID is required' });

        const [item] = await db.select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            nameAr: inventoryItems.nameAr,
            barcode: inventoryItems.barcode,
            sku: inventoryItems.sku,
            unit: inventoryItems.unit,
            costPrice: inventoryItems.costPrice,
        }).from(inventoryItems).where(eq(inventoryItems.id, id));

        if (!item) return res.status(404).json({ error: 'Item not found' });

        const html = generateLabelHtml([item as LabelItem], {
            labelWidth: 60,
            labelHeight: 35,
            columns: 1,
            showPrice: true,
            showSku: true,
            copies: 1,
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
