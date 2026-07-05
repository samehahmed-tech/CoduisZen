import { osmTileUrl } from './googleMaps';

declare global {
    interface Window {
        L?: any;
        __coduisLeafletPromise?: Promise<any>;
    }
}

export const loadLeaflet = () => {
    if (typeof window === 'undefined') return Promise.reject(new Error('BROWSER_REQUIRED'));
    if (window.L?.map) return Promise.resolve(window.L);
    if (window.__coduisLeafletPromise) return window.__coduisLeafletPromise;

    window.__coduisLeafletPromise = new Promise((resolve, reject) => {
        const cssId = 'coduis-leaflet-css';
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => window.L ? resolve(window.L) : reject(new Error('LEAFLET_NOT_AVAILABLE'));
        script.onerror = () => reject(new Error('LEAFLET_LOAD_FAILED'));
        document.head.appendChild(script);
    });

    return window.__coduisLeafletPromise;
};

export const addOsmTileLayer = (L: any, map: any) => {
    L.tileLayer(osmTileUrl, {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
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
