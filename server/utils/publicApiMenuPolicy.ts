import { resolveBranchPrice, normalizeChannel } from '../services/pricingService';

export const buildPublicMenuItem = (item: any, branchId: string, requestedChannel: unknown) => {
    const channel = normalizeChannel(requestedChannel) || 'DELIVERY';
    const resolved = resolveBranchPrice(item?.branchPricing, branchId, channel);
    return {
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        nameAr: item.nameAr,
        description: item.description,
        descriptionAr: item.descriptionAr,
        price: resolved.price > 0 ? resolved.price : Number(item.price || 0),
        image: item.image,
        sizes: item.sizes || [],
        modifierGroups: item.modifierGroups || [],
        preparationTime: item.preparationTime,
        isPopular: item.isPopular,
        isFeatured: item.isFeatured,
        sortOrder: item.sortOrder,
    };
};
