import { defaultMapCenter, osrmUrl } from './googleMaps';

export type MapPoint = {
    lat?: number;
    lng?: number;
};

export type EtaEstimate = {
    distanceKm: number;
    etaMinutes: number;
    source: 'route' | 'straight-line';
};

const toRad = (value: number) => (value * Math.PI) / 180;

export const hasPoint = (point?: MapPoint): point is { lat: number; lng: number } =>
    typeof point?.lat === 'number' &&
    typeof point?.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng);

export const distanceKm = (from: MapPoint = defaultMapCenter, to: MapPoint = defaultMapCenter) => {
    if (!hasPoint(from) || !hasPoint(to)) return 0;
    const earthKm = 6371;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const estimateEta = (
    from: MapPoint = defaultMapCenter,
    to: MapPoint,
    averageSpeedKmh = 24,
): EtaEstimate => {
    const km = distanceKm(from, to);
    const roadFactor = 1.35;
    const distance = km * roadFactor;
    const etaMinutes = Math.max(5, Math.round((distance / Math.max(8, averageSpeedKmh)) * 60 + 4));
    return {
        distanceKm: Number(distance.toFixed(2)),
        etaMinutes,
        source: 'straight-line',
    };
};

export type OsrmRoute = {
    points: Array<[number, number]>;
    distanceKm: number;
    etaMinutes: number;
};

/**
 * Free road routing via OSRM (no key). Returns polyline points + real
 * road distance/ETA, or null when unreachable (caller falls back to
 * straight-line estimateEta).
 */
export const fetchOsrmRoute = async (
    from: MapPoint,
    to: MapPoint,
    averageSpeedKmh = 24,
): Promise<OsrmRoute | null> => {
    try {
        if (!hasPoint(from) || !hasPoint(to)) return null;
        const url = `${osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const json = await res.json();
        const route = Array.isArray(json?.routes) ? json.routes[0] : null;
        const coords = route?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const distanceKm = Number(((Number(route.distance) || 0) / 1000).toFixed(2));
        const etaMinutes = Math.max(3, Math.round(distanceKm / Math.max(8, averageSpeedKmh) * 60 + 2));
        return {
            points: coords
                .filter((c: any) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
                .map((c: any) => [c[1], c[0]] as [number, number]),
            distanceKm,
            etaMinutes,
        };
    } catch {
        return null;
    }
};
