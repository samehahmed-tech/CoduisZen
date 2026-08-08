import { InventoryItem } from '../types';

export const applyAbsoluteStockQuantity = (
    inventory: InventoryItem[],
    itemId: string,
    warehouseId: string,
    quantity: number,
) => {
    const absoluteQuantity = Number(quantity);
    if (!Number.isFinite(absoluteQuantity) || absoluteQuantity < 0) return inventory;
    if (!inventory.some((item) => item.id === itemId)) return inventory;

    return inventory.map((item) => {
        if (item.id !== itemId) return item;

        const warehouseQuantities = [...item.warehouseQuantities];
        const index = warehouseQuantities.findIndex((stock) => stock.warehouseId === warehouseId);
        if (index >= 0) {
            warehouseQuantities[index] = { ...warehouseQuantities[index], quantity: absoluteQuantity };
        } else {
            warehouseQuantities.push({ warehouseId, quantity: absoluteQuantity });
        }

        return { ...item, warehouseQuantities };
    });
};
