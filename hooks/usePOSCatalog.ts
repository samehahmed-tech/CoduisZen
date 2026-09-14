import { useCallback, useDeferredValue, useMemo } from 'react';
import type { MenuCategory, MenuItem, OrderItem, OrderType } from '../types';
import { applyPlatformMarkup, type PlatformMarkup } from '../services/platformPricing';

export type POSIndexedMenuItem = MenuItem & {
    displayCategory: string;
    displayName: string;
    resolvedPrice: number;
    isAvailable: boolean;
    searchBlob: string;
};

export type POSPricedMenuItem = POSIndexedMenuItem & {
    displayDescription?: string;
    isActuallyAvailable: boolean;
    /** Pre-markup menu price (audit). */
    basePrice: number;
    /** Per-unit silent markup baked into price (0 when no platform). */
    platformMarkupAmount: number;
    /** Markup source platform id (null when none). */
    platformId: string | null;
};

type UsePOSCatalogParams = {
    activeCategory: string;
    activeOrderType: OrderType;
    activePriceListId?: string | null;
    branchId: string;
    categories: MenuCategory[];
    itemFilter: 'all' | 'available' | 'popular';
    itemSort: 'smart' | 'name' | 'price_asc' | 'price_desc';
    itemUsageMap: Record<string, number>;
    lang: 'en' | 'ar';
    searchQuery: string;
    safeActiveCart: OrderItem[];
    /** Silent platform markup (Talabat-style). Applied AFTER price-list resolution. */
    platformMarkup?: PlatformMarkup | null;
};

export function usePOSCatalog({
    activeCategory,
    activeOrderType,
    activePriceListId,
    branchId,
    categories,
    itemFilter,
    itemSort,
    itemUsageMap,
    lang,
    searchQuery,
    safeActiveCart,
    platformMarkup,
}: UsePOSCatalogParams) {
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const currentCategories = useMemo(
        () => (categories || []).filter((category) => category.isActive !== false),
        [categories],
    );

    const categoryHotkeys = useMemo(
        () => ['all', ...currentCategories.map((category) => category.id)],
        [currentCategories],
    );

    const normalizePriceListName = useCallback(
        (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ''),
        [],
    );

    const priceListKeywords: Record<OrderType, string[]> = useMemo(() => ({
        DINE_IN: ['dinein', 'dine', 'walkin', 'pos'],
        TAKEAWAY: ['takeaway', 'takeout', 'togo'],
        DELIVERY: ['delivery', 'del'],
        PICKUP: ['pickup', 'pick'],
        KIOSK: ['kiosk', 'selforder', 'selfordering'],
    }), []);

    const resolveItemPrice = useCallback((item: MenuItem) => {
        const lists = item.priceLists || [];
        if (activePriceListId) {
            const activeList = lists.find(
                (list) => normalizePriceListName(list.name) === normalizePriceListName(activePriceListId),
            );
            if (activeList) return activeList.price;
        }

        const branchMatch = lists.find((list) => list.branchIds?.includes(branchId));
        if (branchMatch) return branchMatch.price;

        const matchKeywords = priceListKeywords[activeOrderType] || [];
        const orderMatch = lists.find((list) => matchKeywords.includes(normalizePriceListName(list.name)));
        if (orderMatch) return orderMatch.price;

        return item.price;
    }, [activeOrderType, activePriceListId, branchId, normalizePriceListName, priceListKeywords]);

    // Availability is an explicit user-controlled state. Scheduling fields are
    // retained as metadata and must not silently hide an item from the POS.
    const isItemAvailableNow = useCallback((item: MenuItem) => item.isAvailable !== false, []);

    const indexedItems = useMemo<POSIndexedMenuItem[]>(() => {
        return currentCategories.flatMap((category) =>
            (category.items || []).map((item) => ({
                ...item,
                displayCategory: lang === 'ar' ? (category.nameAr || category.name) : category.name,
                displayName: lang === 'ar' ? (item.nameAr || item.name) : item.name,
                resolvedPrice: resolveItemPrice(item),
                isAvailable: isItemAvailableNow(item),
                searchBlob: [
                    item.name,
                    item.nameAr,
                    item.description,
                    item.descriptionAr,
                    category.name,
                    category.nameAr,
                ].filter(Boolean).join(' ').toLowerCase(),
            })),
        );
    }, [currentCategories, isItemAvailableNow, lang, resolveItemPrice]);

    const normalizedSearchQuery = useMemo(
        () => deferredSearchQuery.trim().toLowerCase(),
        [deferredSearchQuery],
    );

    const filteredItems = useMemo(() => indexedItems
        .filter((item) => {
            const matchesCategory = activeCategory === 'all' || item.categoryId === activeCategory;
            const matchesSearch = !normalizedSearchQuery || item.searchBlob.includes(normalizedSearchQuery);
            const matchesFilter = itemFilter === 'all'
                || (itemFilter === 'available' && item.isAvailable)
                || (itemFilter === 'popular' && Boolean(item.isPopular));
            return matchesCategory && matchesSearch && matchesFilter;
        })
        .sort((left, right) => {
            if (itemSort === 'name') {
                return left.displayName.toLowerCase().localeCompare(right.displayName.toLowerCase());
            }
            if (itemSort === 'price_asc') return left.resolvedPrice - right.resolvedPrice;
            if (itemSort === 'price_desc') return right.resolvedPrice - left.resolvedPrice;
            if (left.isAvailable && !right.isAvailable) return -1;
            if (!left.isAvailable && right.isAvailable) return 1;
            if (left.isPopular && !right.isPopular) return -1;
            if (!left.isPopular && right.isPopular) return 1;
            return left.displayName.localeCompare(right.displayName);
        }), [activeCategory, indexedItems, itemFilter, itemSort, normalizedSearchQuery]);

    const pricedItems = useMemo<POSPricedMenuItem[]>(() => filteredItems.map((item) => {
        const base = item.resolvedPrice;
        const marked = platformMarkup
            ? applyPlatformMarkup(base, platformMarkup.pct, platformMarkup.fixed)
            : base;
        return {
            ...item,
            displayDescription: lang === 'ar' ? (item.descriptionAr || item.description) : item.description,
            price: marked,
            basePrice: base,
            platformMarkupAmount: Math.max(0, Math.round(((marked - base) + Number.EPSILON) * 100) / 100),
            platformId: platformMarkup?.platformId ?? null,
            isActuallyAvailable: item.isAvailable,
        };
    }), [filteredItems, lang, platformMarkup]);

    const categoryResultCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const category of currentCategories) counts[category.id] = 0;

        for (const item of indexedItems) {
            const matchesSearch = !normalizedSearchQuery || item.searchBlob.includes(normalizedSearchQuery);
            const matchesFilter = itemFilter === 'all'
                || (itemFilter === 'available' && item.isAvailable)
                || (itemFilter === 'popular' && Boolean(item.isPopular));
            if (!matchesSearch || !matchesFilter) continue;
            counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
        }

        return counts;
    }, [currentCategories, indexedItems, itemFilter, normalizedSearchQuery]);

    const totalMatchedAcrossCategories = useMemo(
        () => Object.values(categoryResultCounts).reduce((sum, count) => sum + count, 0),
        [categoryResultCounts],
    );

    const quickCategoryNav = useMemo(() => {
        const withCounts = currentCategories
            .map((category) => ({ ...category, count: categoryResultCounts[category.id] || 0 }))
            .filter((category) => category.count > 0)
            .sort((left, right) => {
                if (right.count !== left.count) return right.count - left.count;
                return String(lang === 'ar' ? (left.nameAr || left.name) : left.name).localeCompare(
                    String(lang === 'ar' ? (right.nameAr || right.name) : right.name),
                );
            });

        const top = withCounts.slice(0, 8);
        const active = withCounts.find((category) => category.id === activeCategory);
        if (active && !top.some((category) => category.id === active.id)) {
            return [active, ...top.slice(0, 7)];
        }
        return top;
    }, [activeCategory, categoryResultCounts, currentCategories, lang]);

    const quickPickItems = useMemo(() => {
        const available = pricedItems.filter((item) => item.isActuallyAvailable !== false);
        if (available.length === 0) return [];

        const sortedByUsage = [...available].sort((left, right) => {
            const usageDiff = (itemUsageMap[right.id] || 0) - (itemUsageMap[left.id] || 0);
            if (usageDiff !== 0) return usageDiff;
            if (left.isPopular && !right.isPopular) return -1;
            if (!left.isPopular && right.isPopular) return 1;
            return (left.name || '').localeCompare(right.name || '');
        });

        return sortedByUsage.slice(0, 10);
    }, [itemUsageMap, pricedItems]);

    const upsellSuggestions = useMemo(() => {
        if (safeActiveCart.length === 0) return [];

        const inCart = new Set(safeActiveCart.map((item) => item.id));
        const anchorItem = safeActiveCart[safeActiveCart.length - 1];

        const sameCategoryCandidates = pricedItems.filter((item) =>
            item.categoryId === anchorItem.categoryId
            && !inCart.has(item.id)
            && item.isActuallyAvailable !== false);

        const fallbackCandidates = pricedItems.filter((item) =>
            !inCart.has(item.id)
            && Boolean(item.isPopular)
            && item.isActuallyAvailable !== false);

        const pool = sameCategoryCandidates.length > 0 ? sameCategoryCandidates : fallbackCandidates;
        return pool.slice(0, 6);
    }, [pricedItems, safeActiveCart]);

    return {
        categoryHotkeys,
        categoryResultCounts,
        currentCategories,
        indexedItems,
        normalizedSearchQuery,
        pricedItems,
        quickCategoryNav,
        quickPickItems,
        totalMatchedAcrossCategories,
        upsellSuggestions,
    };
}
