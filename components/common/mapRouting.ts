import { defaultMapCenter } from './googleMaps';

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
