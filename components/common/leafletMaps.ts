import { hasMapTilerKey, mapAttribution, maptilerTileUrl, osmTileUrl } from './googleMaps';
// Static CSS import — bundled by Vite at build time. (A dynamic
// `import('leaflet/dist/leaflet.css')` does NOT reliably load at runtime,
// which leaves the map unpositioned/broken even when the JS loads fine.)
import 'leaflet/dist/leaflet.css';

declare global {
    interface Window {
        L?: any;
        __coduisLeafletPromise?: Promise<any>;
    }
}

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_SOURCES = [
    `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
    `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
    `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.js`,
];
const LEAFLET_CSS_SOURCES = [
    `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
    `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
    `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.css`,
];

/** Fallback raster tiles if the configured OSM endpoint is unreachable. */
export const FALLBACK_TILE_URLS = [
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png',
];

const loadCssWithFallback = (index = 0): void => {
    if (typeof document === 'undefined' || index >= LEAFLET_CSS_SOURCES.length) return;
    const cssId = 'coduis-leaflet-css';
    if (document.getElementById(cssId)) return;
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_SOURCES[index];
    link.onerror = () => {
        link.remove();
        loadCssWithFallback(index + 1);
    };
    document.head.appendChild(link);
};

const loadBundledLeaflet = async (): Promise<any> => {
    // Bundled Leaflet 1.9.4 — works on LAN/offline, zero CDN dependency.
    // (CSS is imported statically at the top of this file.)
    const mod: any = await import('leaflet');
    const L = mod?.default || mod;
    if (!L?.map) throw new Error('LEAFLET_BUNDLE_INVALID');
    window.L = L;
    return L;
};

const loadScriptWithFallback = (index = 0): Promise<any> => {
    if (index >= LEAFLET_SOURCES.length) {
        return Promise.reject(new Error('LEAFLET_LOAD_FAILED'));
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = LEAFLET_SOURCES[index];
        script.async = true;
        script.onload = () => (window.L?.map ? resolve(window.L) : reject(new Error('LEAFLET_NOT_AVAILABLE')));
        script.onerror = () => {
            script.remove();
            loadScriptWithFallback(index + 1).then(resolve, reject);
        };
        document.head.appendChild(script);
    });
};

export const loadLeaflet = () => {
    if (typeof window === 'undefined') return Promise.reject(new Error('BROWSER_REQUIRED'));
    if (window.L?.map) return Promise.resolve(window.L);
    if (window.__coduisLeafletPromise) return window.__coduisLeafletPromise;

    // Prefer the bundled copy (its CSS ships with the bundle); fall back to
    // CDN mirrors (JS + CSS) only if bundling failed.
    window.__coduisLeafletPromise = loadBundledLeaflet()
        .catch(() => {
            loadCssWithFallback();
            return loadScriptWithFallback();
        })
        .catch((err) => {
            // Allow an explicit retry to start over instead of caching the failure.
            window.__coduisLeafletPromise = undefined;
            throw err;
        });

    return window.__coduisLeafletPromise;
};

/** Force the next loadLeaflet() to try again (used by the map retry button). */
export const resetLeafletLoader = () => {
    window.__coduisLeafletPromise = undefined;
};

export const addOsmTileLayer = (L: any, map: any, onTileError?: () => void) => {
    // App → Leaflet → MapTiler → OpenStreetMap data. MapTiler first when a key
    // is configured (Settings → Integrations → Maps), then OSM mirrors.
    const urls = [
        ...(hasMapTilerKey() ? [maptilerTileUrl()] : []),
        osmTileUrl,
        ...FALLBACK_TILE_URLS.filter((u) => u !== osmTileUrl),
    ];
    let index = 0;
    const layer = L.tileLayer(urls[index], {
        maxZoom: 19,
        attribution: mapAttribution(),
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    });
    layer.on('tileerror', () => {
        // If the primary endpoint keeps failing, roll over to a mirror once tiles start erroring in bulk.
        if (index < urls.length - 1) {
            index += 1;
            layer.setUrl(urls[index]);
        }
        if (onTileError) onTileError();
    });
    layer.addTo(map);
    return layer;
};

export const createLeafletIcon = (color: string, label: string) => {
    const L = window.L;
    return L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 8px 22px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:11px">${label}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
};
