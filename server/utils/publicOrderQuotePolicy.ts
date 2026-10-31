export type PublicModifierSelection = { id: string };
export type PublicQuoteLine = { menuItemId: string; quantity: number; sizeId: string; hasModifiers: boolean; modifiers: PublicModifierSelection[] };

export const parsePublicQuoteLines = (value: unknown): { ok: true; lines: PublicQuoteLine[] } | { ok: false; code: string } => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100) return { ok: false, code: 'PUBLIC_API_QUOTE_ITEMS_INVALID' };
    const lines = value.map((line: any) => ({
        menuItemId: String(line?.menuItemId || line?.menu_item_id || '').trim(),
        quantity: Number(line?.quantity),
        sizeId: String(line?.sizeId || line?.size_id || '').trim(),
        modifiers: Array.isArray(line?.modifiers)
            ? line.modifiers.map((modifier: any) => ({ id: String(modifier?.id || modifier?.optionId || '').trim() }))
            : [],
        hasModifiers: Array.isArray(line?.modifiers) && line.modifiers.length > 0,
    }));
    if (lines.some(line => !line.menuItemId || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99)) return { ok: false, code: 'PUBLIC_API_QUOTE_LINE_INVALID' };
    if (lines.some(line => line.modifiers.length > 20 || line.modifiers.some(modifier => !modifier.id))) return { ok: false, code: 'PUBLIC_API_QUOTE_MODIFIERS_INVALID' };
    return { ok: true, lines };
};

export type ResolvedPublicModifiers = { id: string; name?: string; nameAr?: string; price: number; recipeEffect?: string; recipe?: unknown[]; recipeBySize?: Record<string, unknown> };

export const resolvePublicItemSize = (item: any, sizeId = '') => {
    const requestedSizeId = String(sizeId || '').trim();
    if (!requestedSizeId) return { ok: true as const, size: null, price: Number(item?.price || 0) };
    const size = (Array.isArray(item?.sizes) ? item.sizes : []).find((candidate: any) => String(candidate?.id || '').trim() === requestedSizeId);
    if (!size) return { ok: false as const, code: 'PUBLIC_API_ITEM_SIZE_INVALID' };
    return { ok: true as const, size, price: Number(size?.price || 0) };
};

/** Validate public modifier ids against the published item's groups and return authoritative prices. */
export const resolvePublicItemModifiers = (item: any, selections: PublicModifierSelection[] = []) => {
    const groups = Array.isArray(item?.modifierGroups) ? item.modifierGroups : [];
    const selectedIds = selections.map(selection => String(selection?.id || '').trim());
    if (new Set(selectedIds).size !== selectedIds.length) return { ok: false as const, code: 'PUBLIC_API_MODIFIER_DUPLICATE' };
    const optionOwners = new Map<string, { option: any; group: any }>();
    for (const group of groups) {
        for (const option of Array.isArray(group?.options) ? group.options : []) {
            const id = String(option?.id || '').trim();
            if (id) optionOwners.set(id, { option, group });
        }
    }
    const selectedByGroup = new Map<any, number>();
    const resolved: ResolvedPublicModifiers[] = [];
    for (const id of selectedIds) {
        const owner = optionOwners.get(id);
        if (!owner) return { ok: false as const, code: 'PUBLIC_API_MODIFIER_OPTION_INVALID' };
        selectedByGroup.set(owner.group, (selectedByGroup.get(owner.group) || 0) + 1);
        resolved.push({
            id,
            name: owner.option.name,
            nameAr: owner.option.nameAr,
            price: Math.max(0, Number(owner.option.price || 0)),
            recipeEffect: String(owner.option.recipeEffect || 'ADD').toUpperCase() === 'REMOVE' ? 'REMOVE' : 'ADD',
            recipe: Array.isArray(owner.option.recipe) ? owner.option.recipe : [],
            recipeBySize: owner.option.recipeBySize && typeof owner.option.recipeBySize === 'object' ? owner.option.recipeBySize : undefined,
        });
    }
    for (const group of groups) {
        const count = selectedByGroup.get(group) || 0;
        const min = Math.max(0, Number(group?.minSelection || (group?.isRequired ? 1 : 0)));
        const max = Math.max(min, Number(group?.maxSelection ?? Number.MAX_SAFE_INTEGER));
        if (count < min) return { ok: false as const, code: 'PUBLIC_API_MODIFIER_REQUIRED' };
        if (count > max) return { ok: false as const, code: 'PUBLIC_API_MODIFIER_LIMIT' };
    }
    return { ok: true as const, modifiers: resolved, total: resolved.reduce((sum, modifier) => sum + modifier.price, 0) };
};
