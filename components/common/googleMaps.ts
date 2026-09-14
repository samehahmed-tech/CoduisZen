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
export const osmTileUrl = String(import.meta.env.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png').trim();
export const maptilerKeyEnv = String((import.meta.env as any).VITE_MAPTILER_KEY || '').trim();
export const nominatimUrl = String(import.meta.env.VITE_NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
export const osrmUrl = String(import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');

type RuntimeMapsConfig = { provider?: 'osm' | 'google'; googleKey?: string; maptilerKey?: string };
let runtimeMapsConfig: RuntimeMapsConfig | null = null;

/** Runtime override from app settings (beats build-time env, no rebuild needed). */
export const setRuntimeMapsConfig = (cfg: RuntimeMapsConfig | null) => {
    runtimeMapsConfig = cfg;
};

const activeProvider = () => (runtimeMapsConfig?.provider || mapsProvider).toLowerCase();
const activeGoogleKey = () => (runtimeMapsConfig?.googleKey || googleMapsKey).trim();

/** Prefer functions over the legacy consts below (they ignore runtime settings). */
export const shouldUseGoogleMaps = () => activeProvider() === 'google' && !!activeGoogleKey();
export const shouldUseOsmMaps = () => !shouldUseGoogleMaps();

/* ── MapTiler (Leaflet → MapTiler → OpenStreetMap data) ── */
const activeMaptilerKey = () => (runtimeMapsConfig?.maptilerKey || maptilerKeyEnv).trim();
export const hasMapTilerKey = () => activeMaptilerKey().length > 0;
/** Raw MapTiler key for geocoding (empty when unconfigured). */
export const maptilerKey = () => activeMaptilerKey();
/** Modern streets raster tile URL (OSM data, MapTiler CDN). */
export const maptilerTileUrl = () =>
    `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${encodeURIComponent(activeMaptilerKey())}`;
export const mapAttribution = () =>
    hasMapTilerKey()
        ? '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>';

/** @deprecated use shouldUseGoogleMaps() (runtime-aware) */
export const canUseGoogleMaps = mapsProvider === 'google' && !!googleMapsKey;
/** @deprecated use shouldUseOsmMaps() (runtime-aware) */
export const useOsmMaps = mapsProvider === 'osm' || !canUseGoogleMaps;

/** Clear the cached loader so a retry starts fresh (used by the map retry button). */
export const resetGoogleMapsLoader = () => {
    window.__coduisGoogleMapsPromise = undefined;
};

export const loadGoogleMaps = () => {
    if (!shouldUseGoogleMaps() || typeof window === 'undefined') {
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
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(activeGoogleKey())}&libraries=places&loading=async&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('GOOGLE_MAPS_LOAD_FAILED'));
        document.head.appendChild(script);
    });

    return window.__coduisGoogleMapsPromise;
};
