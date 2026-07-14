export interface InventoryExcelCandidate {
    index: number;
    row: Record<string, unknown>;
    name: string;
    nameAr: string;
    sku: string;
    warehouseId: string;
    quantity: number;
    purchasePrice: number;
    costPrice: number;
    threshold: number;
}

export const prepareInventoryExcelRows = (
    rows: Record<string, unknown>[],
    existingSkus: string[],
    warehouseIds: string[],
) => {
    const knownSkus = new Set(existingSkus.map(sku => sku.trim().toUpperCase()).filter(Boolean));
    const knownWarehouses = new Set(warehouseIds);
    const candidates: InventoryExcelCandidate[] = [];
    let skipped = 0;

    rows.forEach((row, index) => {
        const name = String(row.name_en || '').trim();
        const nameAr = String(row.name_ar || '').trim();
        const sku = String(row.code || '').trim();
        if (!name || !nameAr || !sku || knownSkus.has(sku.toUpperCase())) { skipped++; return; }

        const warehouseId = String(row.warehouse_id || '').trim();
        const quantity = Number(row.opening_quantity || 0);
        const purchasePrice = Number(row.purchase_price || 0);
        const costPrice = Number(row.cost_price || 0);
        const threshold = Number(row.alert_threshold || 0);
        if ([quantity, purchasePrice, costPrice, threshold].some(number => !Number.isFinite(number) || number < 0)) {
            throw new Error(`INVALID_NUMERIC_VALUE:${index + 2}`);
        }
        if (quantity > 0 && (!warehouseId || !knownWarehouses.has(warehouseId))) {
            throw new Error(`INVALID_WAREHOUSE:${index + 2}`);
        }

        knownSkus.add(sku.toUpperCase());
        candidates.push({ index, row, name, nameAr, sku, warehouseId, quantity, purchasePrice, costPrice, threshold });
    });

    return { candidates, skipped };
};
