export type GoogleMapsPoint = {
    lat: number;
    lng: number;
};

declare global {
    interface Window {
        google?: any;
        __coduisGoogleMapsPromise?: Promise<any>;
    }
}

const envLat = Number(import.meta.env.VITE_DEFAULT_MAP_LAT);
const envLng = Number(import.meta.env.VITE_DEFAULT_MAP_LNG);

export const defaultMapCenter: GoogleMapsPoint = {
    lat: Number.isFinite(envLat) ? envLat : 30.0444,
    lng: Number.isFinite(envLng) ? envLng : 31.2357,
};

export const mapsProvider = String(import.meta.env.VITE_MAPS_PROVIDER || 'osm').toLowerCase();
export const googleMapsKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
export const canUseGoogleMaps = mapsProvider === 'google' && !!googleMapsKey;
export const osmTileUrl = String(import.meta.env.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png').trim();
export const nominatimUrl = String(import.meta.env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
export const useOsmMaps = mapsProvider === 'osm' || !canUseGoogleMaps;

export const loadGoogleMaps = () => {
    if (!canUseGoogleMaps || typeof window === 'undefined') {
        return Promise.reject(new Error('GOOGLE_MAPS_NOT_CONFIGURED'));
    }
    if (window.google?.maps) return Promise.resolve(window.google);
    if (window.__coduisGoogleMapsPromise) return window.__coduisGoogleMapsPromise;

    window.__coduisGoogleMapsPromise = new Promise((resolve, reject) => {
        const callbackName = `__coduisGoogleMapsReady_${Date.now()}`;
        (window as any)[callbackName] = () => {
            delete (window as any)[callbackName];
            resolve(window.google);
        };
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&libraries=places&loading=async&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('GOOGLE_MAPS_LOAD_FAILED'));
        document.head.appendChild(script);
    });

    return window.__coduisGoogleMapsPromise;
};
