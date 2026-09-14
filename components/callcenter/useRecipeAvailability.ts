import { useEffect, useRef, useState } from 'react';
import { inventoryApi } from '../../services/api/inventory';

export interface AvailabilityEntry {
    menuItemId: string;
    hasRecipe: boolean;
    maxServings: number | null;
    short: boolean;
    shortIngredients: Array<{ itemId: string; name?: string; need: number; stock: number; unit?: string }>;
}

/**
 * Warn-only recipe availability for a target branch.
 * Never blocks a sale — returns `short` flags so the UI can show a badge.
 */
export const useRecipeAvailability = (branchId: string | undefined, menuItemIds: string[]) => {
    const [byItem, setByItem] = useState<Record<string, AvailabilityEntry>>({});
    const [isLoading, setIsLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const key = (menuItemIds || []).filter(Boolean).sort().join(',');

    useEffect(() => {
        if (!branchId || !key) {
            setByItem({});
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const res = await inventoryApi.getMenuAvailability(branchId, key.split(','), { signal: controller.signal });
                if (controller.signal.aborted) return;
                const map: Record<string, AvailabilityEntry> = {};
                for (const item of res?.items || []) map[item.menuItemId] = item;
                setByItem(map);
            } catch (err: any) {
                if (err?.name !== 'AbortError') setByItem({});
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }, 400);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [branchId, key]);

    return { byItem, isLoading };
};
