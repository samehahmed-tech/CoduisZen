import { useCallback, useDeferredValue, useMemo } from 'react';
import type { MenuCategory, MenuItem, OrderItem, OrderType } from '../types';

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
    nowTick: number;
    searchQuery: string;
    safeActiveCart: OrderItem[];
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
    nowTick,
    searchQuery,
    safeActiveCart,
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

    const isItemAvailableNow = useCallback((item: MenuItem, now: Date) => {
        if (item.isAvailable === false) return false;

        let days: string[] = [];
        if (Array.isArray(item.availableDays)) {
            days = item.availableDays;
        } else if (typeof item.availableDays === 'string') {
            try {
                const parsed = JSON.parse(item.availableDays);
                days = Array.isArray(parsed) ? parsed : [];
            } catch {
                days = [];
            }
        }

        if (days.length > 0) {
            const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
            if (!days.includes(dayKey)) return false;
        }

        const toMinutes = (value?: string) => {
            if (!value) return null;
            const [hours, minutes] = value.split(':').map(Number);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
            return hours * 60 + minutes;
        };

        const from = toMinutes(item.availableFrom);
        const to = toMinutes(item.availableTo);
        if (from === null && to === null) return true;

        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (from !== null && to !== null) {
            if (from <= to) return nowMinutes >= from && nowMinutes <= to;
            return nowMinutes >= from || nowMinutes <= to;
        }
        if (from !== null) return nowMinutes >= from;
        if (to !== null) return nowMinutes <= to;
        return true;
    }, []);

    const indexedItems = useMemo<POSIndexedMenuItem[]>(() => {
        const now = new Date(nowTick);
        return currentCategories.flatMap((category) =>
            (category.items || []).map((item) => ({
                ...item,
                displayCategory: lang === 'ar' ? (category.nameAr || category.name) : category.name,
                displayName: lang === 'ar' ? (item.nameAr || item.name) : item.name,
                resolvedPrice: resolveItemPrice(item),
                isAvailable: isItemAvailableNow(item, now),
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
    }, [currentCategories, isItemAvailableNow, lang, nowTick, resolveItemPrice]);

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

    const pricedItems = useMemo<POSPricedMenuItem[]>(() => filteredItems.map((item) => ({
        ...item,
        displayDescription: lang === 'ar' ? (item.descriptionAr || item.description) : item.description,
        price: item.resolvedPrice,
        isActuallyAvailable: item.isAvailable,
    })), [filteredItems, lang]);

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
