import { distanceKm, hasPoint, type MapPoint } from '../components/common/mapRouting';

export interface AssignCandidate {
    id: string;
    name: string;
    status?: string;
    lat?: number;
    lng?: number;
    /** Orders currently on the pilot's shoulders. */
    activeOrders?: number;
    /** Minutes since last telemetry fix. */
    lastSeenMinutes?: number;
}

export interface AssignScore extends AssignCandidate {
    score: number;
    distanceKm: number | null;
}

const isAvailable = (status?: string) => String(status || '').toUpperCase() === 'AVAILABLE';

/**
 * Smart pilot ranking for one order: available first, then fewest active
 * orders, then closest with fresh telemetry. Stale-location pilots sink.
 * Pure + unit-tested; UI just renders the order of this list.
 */
export function rankDriversForOrder(
    drivers: AssignCandidate[],
    orderPoint?: MapPoint | null,
    fallbackPoint?: MapPoint | null,
): AssignScore[] {
    const target = hasPoint(orderPoint) ? orderPoint : hasPoint(fallbackPoint) ? fallbackPoint : null;
    return drivers
        .filter((d) => isAvailable(d.status))
        .map((d) => {
            const hasFix = Number.isFinite(d.lat) && Number.isFinite(d.lng);
            const dist = target && hasFix
                ? distanceKm(target, { lat: d.lat, lng: d.lng })
                : null;
            const stale = Number(d.lastSeenMinutes || 0) >= 10;
            const score =
                Number(d.activeOrders || 0) * 15 +
                (dist == null ? 25 : Math.min(dist, 40)) +
                (stale ? 10 : 0);
            return { ...d, score: Math.round(score * 10) / 10, distanceKm: dist == null ? null : Math.round(dist * 10) / 10 };
        })
        .sort((a, b) => a.score - b.score);
}
