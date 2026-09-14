/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;

  // AI Providers
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;

  // Socket.io (optional)
  readonly VITE_SOCKET_URL?: string;

  // Maps (Leaflet → MapTiler → OpenStreetMap data)
  readonly VITE_MAPS_PROVIDER?: string;
  readonly VITE_MAPTILER_KEY?: string;
  readonly VITE_OSM_TILE_URL?: string;
  readonly VITE_NOMINATIM_URL?: string;
  readonly VITE_OSRM_URL?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_DEFAULT_MAP_LAT?: string;
  readonly VITE_DEFAULT_MAP_LNG?: string;
}

declare module 'leaflet/dist/leaflet.css';

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

