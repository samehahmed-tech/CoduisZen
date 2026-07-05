import { db } from '../db';
import { branches, deliveryZones } from '../../src/db/schema';
import { eq, and } from 'drizzle-orm';

export const suggestBranchesForZone = async (zoneName: string) => {
    if (!zoneName) return [];

    // Find all active zones with this name and their associated branches
    const zones = await db.select({
        branchId: deliveryZones.branchId,
        branchName: branches.name,
        deliveryFee: deliveryZones.deliveryFee,
        minOrderAmount: deliveryZones.minOrderAmount,
        estimatedTime: deliveryZones.estimatedTime,
    })
    .from(deliveryZones)
    .innerJoin(branches, eq(deliveryZones.branchId, branches.id))
    .where(
        and(
            eq(deliveryZones.name, zoneName),
            eq(deliveryZones.isActive, true),
            eq(branches.isActive, true)
        )
    );

    return zones;
};

export const getAllAvailableZones = async () => {
    const zones = await db.selectDistinct({
        name: deliveryZones.name,
        nameAr: deliveryZones.nameAr
    })
    .from(deliveryZones)
    .where(eq(deliveryZones.isActive, true));

    return zones;
};
