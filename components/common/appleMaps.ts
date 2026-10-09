import { apiRequest } from '../../services/api/core';

declare global {
    interface Window {
        mapkit?: any;
        __coduisMapkitPromise?: Promise<any>;
    }
}

export type AppleLatLng = { lat: number; lng: number };

const TOKEN_SKEW_MS = 24 * 3600 * 1000;
let cachedToken = '';
let cachedExpMs = 0;

/** Short-lived MapKit JS token from our server (the .p8 key never leaves the backend). */
export const fetchAppleToken = async (): Promise<string> => {
    if (cachedToken && cachedExpMs - Date.now() > TOKEN_SKEW_MS) return cachedToken;
    const res = await apiRequest<{ token: string; expiresAt: string }>('/maps/apple-token');
    if (!res?.token) throw new Error('MAPKIT_TOKEN_EMPTY');
    cachedToken = res.token;
    cachedExpMs = new Date(res.expiresAt).getTime() || 0;
    return cachedToken;
};

/** Clear the cached loader + token so a retry starts fresh. */
export const resetAppleMapsLoader = () => {
    window.__coduisMapkitPromise = undefined;
    cachedToken = '';
    cachedExpMs = 0;
};

/** Load MapKit JS once and init it with our server-signed token. */
export const loadAppleMaps = (): Promise<any> => {
    if (typeof window === 'undefined') return Promise.reject(new Error('APPLE_MAPS_NO_WINDOW'));
    if (window.mapkit) return Promise.resolve(window.mapkit);
    if (window.__coduisMapkitPromise) return window.__coduisMapkitPromise;
    window.__coduisMapkitPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            try {
                window.mapkit.init({
                    authorizationCallback: async (done: (token: string) => void) => {
                        try {
                            done(await fetchAppleToken());
                        } catch {
                            done('');
                        }
                    },
                });
                resolve(window.mapkit);
            } catch (error) {
                reject(error);
            }
        };
        script.onerror = () => reject(new Error('APPLE_MAPS_LOAD_FAILED'));
        document.head.appendChild(script);
    });
    return window.__coduisMapkitPromise;
};

export const appleLanguage = (lang: 'ar' | 'en') => (lang === 'ar' ? 'ar' : 'en');

/** Fit the visible region around a set of points (with a sane minimum span). */
export const fitAppleMap = (map: any, mk: any, points: AppleLatLng[], minSpan = 0.02) => {
    if (!map || !mk || points.length === 0) return;
    if (points.length === 1) {
        map.setRegionAnimated(new mk.CoordinateRegion(
            new mk.Coordinate(points[0].lat, points[0].lng),
            new mk.CoordinateSpan(minSpan, minSpan),
        ));
        return;
    }
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    points.forEach((p) => {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
    });
    const pad = 1.35;
    map.setRegionAnimated(new mk.CoordinateRegion(
        new mk.Coordinate((minLat + maxLat) / 2, (minLng + maxLng) / 2),
        new mk.CoordinateSpan(
            Math.max((maxLat - minLat) * pad, minSpan),
            Math.max((maxLng - minLng) * pad, minSpan),
        ),
    ));
};

/** Forward geocode via Apple (falls back to null — caller tries Nominatim/Photon next). */
export const appleForwardGeocode = (mk: any, text: string, lang: 'ar' | 'en'): Promise<AppleLatLng & { address: string }> =>
    new Promise((resolve, reject) => {
        try {
            new mk.Geocoder({ language: appleLanguage(lang) }).lookup(text, (error: any, data: any) => {
                const hit = data?.results?.[0];
                const coords = hit?.coordinate;
                if (error || !coords) {
                    reject(new Error('APPLE_GEOCODE_EMPTY'));
                    return;
                }
                resolve({ lat: Number(coords.latitude.toFixed(6)), lng: Number(coords.longitude.toFixed(6)), address: hit.formattedAddress || text });
            });
        } catch (error) {
            reject(error);
        }
    });

/** Reverse geocode via Apple (falls back to null — caller tries Nominatim next). */
export const appleReverseGeocode = (mk: any, lat: number, lng: number, lang: 'ar' | 'en'): Promise<string> =>
    new Promise((resolve, reject) => {
        try {
            new mk.Geocoder({ language: appleLanguage(lang) }).reverseLookup(
                new mk.Coordinate(lat, lng),
                (error: any, data: any) => {
                    const hit = data?.results?.[0];
                    if (error || !hit?.formattedAddress) {
                        reject(new Error('APPLE_REVERSE_EMPTY'));
                        return;
                    }
                    resolve(hit.formattedAddress);
                },
            );
        } catch (error) {
            reject(error);
        }
    });

/** Place search via Apple (first hit wins). */
export const appleSearchPlace = (map: any, mk: any, text: string, lang: 'ar' | 'en'): Promise<AppleLatLng & { address: string; name: string }> =>
    new Promise((resolve, reject) => {
        try {
            const search = new mk.Search({ region: map.region, language: appleLanguage(lang) });
            search.search(text, (error: any, data: any) => {
                const hit = data?.places?.[0];
                const coords = hit?.coordinate;
                if (error || !coords) {
                    reject(new Error('APPLE_SEARCH_EMPTY'));
                    return;
                }
                resolve({
                    lat: Number(coords.latitude.toFixed(6)),
                    lng: Number(coords.longitude.toFixed(6)),
                    address: hit.formattedAddress || text,
                    name: hit.name || text,
                });
            });
        } catch (error) {
            reject(error);
        }
    });

/** Driving route via Apple Directions (falls back to null — caller tries OSRM next). */
export const appleDrivingRoute = (
    mk: any,
    from: AppleLatLng,
    to: AppleLatLng,
): Promise<{ points: AppleLatLng[]; etaMinutes: number }> =>
    new Promise((resolve, reject) => {
        try {
            new mk.Directions().route(
                {
                    origin: new mk.Coordinate(from.lat, from.lng),
                    destination: new mk.Coordinate(to.lat, to.lng),
                    transportType: mk.Directions.Transport.Automobile,
                },
                (error: any, data: any) => {
                    const route = data?.routes?.[0];
                    const pts = route?.polyline?.points;
                    if (error || !Array.isArray(pts) || pts.length < 2) {
                        reject(new Error('APPLE_DIRECTIONS_EMPTY'));
                        return;
                    }
                    resolve({
                        points: pts.map((p: any) => ({ lat: p.latitude, lng: p.longitude })),
                        etaMinutes: Number.isFinite(route?.expectedTravelTime) ? Math.round(route.expectedTravelTime / 60) : 0,
                    });
                },
            );
        } catch (error) {
            reject(error);
        }
    });
