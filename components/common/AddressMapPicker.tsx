import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { defaultMapCenter, hasMapTilerKey, loadGoogleMaps, maptilerKey, nominatimUrl, shouldUseGoogleMaps, shouldUseOsmMaps } from './googleMaps';
import { addOsmTileLayer, createLeafletIcon, loadLeaflet } from './leafletMaps';

export type AddressPin = {
    address: string;
    lat?: number;
    lng?: number;
    label?: string;
};

type AddressMapPickerProps = {
    value: AddressPin;
    onChange: (value: AddressPin) => void;
    lang?: 'ar' | 'en';
    compact?: boolean;
    title?: string;
    /** Extra classes for the map box (e.g. taller in modals). */
    mapHeightClass?: string;
};

const branchFallback = defaultMapCenter;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashText = (text: string) => {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash);
};

const pinToPosition = (pin: AddressPin) => {
    const lat = pin.lat ?? branchFallback.lat;
    const lng = pin.lng ?? branchFallback.lng;
    return {
        x: clamp(50 + (lng - branchFallback.lng) * 900, 12, 88),
        y: clamp(50 - (lat - branchFallback.lat) * 900, 12, 88),
    };
};

const estimateFromAddress = (address: string): AddressPin => {
    const hash = hashText(address || 'delivery');
    const latOffset = ((hash % 1800) - 900) / 100000;
    const lngOffset = (((hash / 1800) % 1800) - 900) / 100000;
    return {
        address,
        lat: Number((branchFallback.lat + latOffset).toFixed(6)),
        lng: Number((branchFallback.lng + lngOffset).toFixed(6)),
        label: address,
    };
};

const validPin = (pin: AddressPin) =>
    pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng) ? pin : null;

type PlaceSearchOutcome = { results: AddressPin[]; notice: 'NO_RESULTS' | 'SEARCH_FAILED' | null };

/* ── Pasted-location parsing (call-center accuracy) ────────────────
 * Agents get locations as: "30.0444, 31.2357", a Google Maps share URL,
 * or a Plus Code ("7JVW2F5C+5G"). Sending those to a text geocoder either
 * fails or — worse — yields a fabricated pin. Parse them exactly instead.
 */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const normalizePastedDigits = (text: string) =>
    text
        .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
        .replace(/٫/g, '.')
        .replace(/[٬,،]/g, ',')
        .replace(/[°º]/g, '')
        .replace(/\s*([NSEWnsewجنوبشمالشرقغرب])\s*/g, ' ')
        .trim();

const round6 = (value: number) => Number(value.toFixed(6));

const inRanges = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? { lat: round6(lat), lng: round6(lng) }
        : null;

/** "30.0444, 31.2357" (or space/semicolon separated, Arabic digits ok). */
const parsePlainCoordinates = (text: string) => {
    const clean = normalizePastedDigits(text).replace(/[^\d.,+\-\s]/g, '').trim();
    const match = clean.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    return inRanges(Number(match[1]), Number(match[2]));
};

/** Google Maps share/search URLs, geo: links, @-pins, !3d/!4d place ids. */
const parseMapsUrl = (text: string) => {
    const raw = text.trim();
    if (!/^(https?:\/\/|geo:)/i.test(raw)) return null;
    const normalized = normalizePastedDigits(raw);
    const patterns = [
        /[?&](?:q|query|ll|destination|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
        /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/,
        /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
        /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
        /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    ];
    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) {
            const coords = inRanges(Number(match[1]), Number(match[2]));
            if (coords) return coords;
        }
    }
    return null;
};

const PLUS_CODE_ALPHABET = '23456789CFGHJMPQRVWX';

/** Decode a FULL Plus Code ("7JVW2F5C+5G") to its cell center. Short codes
 * (need a locality) return null so the text geocoder handles them instead. */
const decodePlusCode = (text: string) => {
    const token = text.trim().toUpperCase().split(/\s+/).find((part) => part.includes('+'));
    if (!token) return null;
    const plusIdx = token.indexOf('+');
    if (plusIdx < 4) return null;
    const digits = (token.slice(0, plusIdx) + token.slice(plusIdx + 1)).replace(/0+$/, '');
    if (digits.length < 10 || digits.length > 15) return null;
    if (!/^[23456789CFGHJMPQRVWX]+$/.test(digits)) return null;
    let lat = -90;
    let lng = -180;
    const pairResolutions = [20, 1, 0.05, 0.0025, 0.000125];
    for (let i = 0; i < 5; i += 1) {
        const dLat = PLUS_CODE_ALPHABET.indexOf(digits[2 * i]);
        const dLng = PLUS_CODE_ALPHABET.indexOf(digits[2 * i + 1]);
        if (dLat < 0 || dLng < 0) return null;
        lat += dLat * pairResolutions[i];
        lng += dLng * pairResolutions[i];
    }
    let latPlace = 0.000125;
    let lngPlace = 0.000125;
    for (const char of digits.slice(10)) {
        const digit = PLUS_CODE_ALPHABET.indexOf(char);
        if (digit < 0) return null;
        latPlace /= 5;
        lngPlace /= 4;
        lat += Math.floor(digit / 4) * latPlace;
        lng += (digit % 4) * lngPlace;
    }
    const coords = inRanges(lat + latPlace / 2, lng + lngPlace / 2);
    return coords;
};

/** Exact location from pasted text, if any (coords > maps URL > plus code). */
const parsePastedLocation = (text: string) =>
    parsePlainCoordinates(text) || parseMapsUrl(text) || decodePlusCode(text);

const searchNominatim = async (text: string, isAr: boolean, signal: AbortSignal): Promise<AddressPin[]> => {
    // countrycodes=eg keeps Egyptian street/area names first; without it,
    // Arabic queries drown in Gulf/Levant homonyms.
    const url = `${nominatimUrl}/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=eg&accept-language=${isAr ? 'ar,en' : 'en,ar'}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`NOMINATIM_${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('NOMINATIM_BAD_RESPONSE');
    return rows
        .map((row: any) => ({
            address: row.display_name || row.name || text,
            lat: Number(Number(row.lat).toFixed(6)),
            lng: Number(Number(row.lon).toFixed(6)),
            label: row.name || row.type || text,
        }))
        .filter((p: AddressPin) => validPin(p));
};

const searchPhoton = async (text: string, isAr: boolean, signal: AbortSignal): Promise<AddressPin[]> => {
    // Photon (Komoot) — CORS-open, no key, strong Arabic coverage.
    // NOTE: no lang param — supported values are only default/de/en/fr and
    // `default` already returns local (Arabic) names for Egyptian places.
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=6`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`PHOTON_${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
        .map((f: any) => {
            const coords = f?.geometry?.coordinates;
            const props = f?.properties || {};
            const parts = [props.name, props.street, props.district, props.city, props.state]
                .filter((p, i, arr) => p && arr.indexOf(p) === i);
            return {
                address: parts.length > 0 ? parts.join(isAr ? '، ' : ', ') : text,
                lat: Number(Number(coords?.[1]).toFixed(6)),
                lng: Number(Number(coords?.[0]).toFixed(6)),
                label: props.name || props.street || text,
            } as AddressPin;
        })
        .filter((p: AddressPin) => validPin(p));
};

const searchMapTiler = async (text: string, signal: AbortSignal): Promise<AddressPin[]> => {
    const key = maptilerKey();
    if (!key) return [];
    // Keep the query short: full Arabic addresses with postal codes +
    // the restrictive `types` filter made MapTiler answer 400 (note:
    // `street` is not even a valid types value). No `types` = search all,
    // first chunk = the searchable part, cascade covers the rest.
    const short = text.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!short) return [];
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(short)}.json?key=${encodeURIComponent(key)}&language=ar&country=EG&limit=6`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`MAPTILER_${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
        .map((f: any) => ({
            address: f?.place_name_ar || f?.place_name || text,
            lat: Number(Number(f?.center?.[1]).toFixed(6)),
            lng: Number(Number(f?.center?.[0]).toFixed(6)),
            label: f?.text_ar || f?.text || text,
        }))
        .filter((p: AddressPin) => validPin(p));
};

/**
 * Cascading place search: MapTiler (when the branch configured a key) →
 * Nominatim (Egypt-biased) → Photon. First non-empty result wins; a notice
 * distinguishes "nothing found" from "service unreachable".
 */
const searchPlaces = async (text: string, isAr: boolean, signal: AbortSignal): Promise<PlaceSearchOutcome> => {
    const attempts: Array<() => Promise<AddressPin[]>> = [];
    if (hasMapTilerKey()) attempts.push(() => searchMapTiler(text, signal));
    attempts.push(() => searchNominatim(text, isAr, signal));
    attempts.push(() => searchPhoton(text, isAr, signal));
    let failed = 0;
    for (const attempt of attempts) {
        try {
            const results = await attempt();
            if (results.length > 0) return { results, notice: null };
        } catch (error: any) {
            if (error?.name === 'AbortError') throw error;
            failed += 1;
        }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    }
    return { results: [], notice: failed === attempts.length ? 'SEARCH_FAILED' : 'NO_RESULTS' };
};

const AddressMapPicker: React.FC<AddressMapPickerProps> = ({ value, onChange, lang = 'ar', compact = false, title, mapHeightClass = '' }) => {
    const isAr = lang === 'ar';
    const [query, setQuery] = useState(value.address || '');
    const [isLocating, setIsLocating] = useState(false);
    const [mapsReady, setMapsReady] = useState(false);
    const [mapsError, setMapsError] = useState<string | null>(null);
    const [osmReady, setOsmReady] = useState(false);
    const [osmError, setOsmError] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<AddressPin[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchNotice, setSearchNotice] = useState<PlaceSearchOutcome['notice']>(null);
    const mapRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const googleMapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);
    const autocompleteRef = useRef<any>(null);
    const leafletMapRef = useRef<any>(null);
    const leafletMarkerRef = useRef<any>(null);
    const position = pinToPosition(value);

    const localSuggestions = useMemo(() => {
        const base = query.trim() || value.address.trim();
        if (!base) return [];
        const prefixes = isAr
            ? ['أقرب مدخل من', 'شارع رئيسي قرب', 'العلامة المميزة عند']
            : ['Main entrance near', 'Main street by', 'Landmark at'];
        return prefixes.map((prefix) => estimateFromAddress(`${prefix} ${base}`));
    }, [isAr, query, value.address]);

    useEffect(() => {
        if (!shouldUseOsmMaps()) return;
        const text = query.trim();
        if (text.length < 3) {
            setSearchResults([]);
            setSearchNotice(null);
            setIsSearching(false);
            return;
        }
        // The query is the already-pinned address (just selected) — don't
        // re-search it into a noisy dropdown over the confirmed pin.
        if (text === (value.address || '').trim() && value.lat && value.lng) {
            setSearchResults([]);
            setSearchNotice(null);
            setIsSearching(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            // Exact pasted location (coords / Maps URL / Plus Code) wins over
            // text search — it resolves to the metre, not the street.
            if (parsePastedLocation(text)) {
                pinPastedLocation(text, controller.signal).catch((error) => {
                    if (error?.name !== 'AbortError') {
                        setSearchResults([]);
                        setSearchNotice('SEARCH_FAILED');
                        setIsSearching(false);
                    }
                });
                return;
            }
            setIsSearching(true);
            setSearchNotice(null);
            searchPlaces(text, isAr, controller.signal)
                .then((outcome) => {
                    setSearchResults(outcome.results);
                    setSearchNotice(outcome.notice);
                })
                .catch((error) => {
                    if (error?.name !== 'AbortError') {
                        setSearchResults([]);
                        setSearchNotice('SEARCH_FAILED');
                    }
                })
                .finally(() => setIsSearching(false));
        }, 350);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [isAr, query]);

    const choosePin = (pin: AddressPin) => {
        onChange(pin);
        setQuery(pin.address);
        setSearchResults([]);
        setSearchNotice(null);
        if (leafletMapRef.current && pin.lat && pin.lng) {
            leafletMapRef.current.setView([pin.lat, pin.lng], 16);
            leafletMarkerRef.current?.setLatLng([pin.lat, pin.lng]);
        }
        if (googleMapRef.current && pin.lat && pin.lng) {
            googleMapRef.current.panTo({ lat: pin.lat, lng: pin.lng });
            googleMapRef.current.setZoom(16);
            markerRef.current?.setPosition({ lat: pin.lat, lng: pin.lng });
        }
    };

    // Reverse-lookup a human address for exact coordinates: Google geocoder
    // when maps are loaded, otherwise Nominatim reverse (Egypt-unbiased —
    // coordinates need no country bias).
    const reverseToPin = async (lat: number, lng: number, signal?: AbortSignal): Promise<AddressPin> => {
        const fallback: AddressPin = { address: `${lat}, ${lng}`, lat, lng, label: isAr ? 'إحداثيات ملصقة' : 'Pasted coordinates' };
        if (geocoderRef.current) {
            try {
                const results: any[] = await new Promise((resolve) => {
                    try {
                        geocoderRef.current.geocode({ location: { lat, lng } }, (rows: any[]) => resolve(rows || []));
                    } catch { resolve([]); }
                });
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                if (results?.[0]) {
                    return {
                        address: results[0].formatted_address || fallback.address,
                        lat,
                        lng,
                        label: results[0].name || fallback.label,
                    };
                }
            } catch (error: any) {
                if (error?.name === 'AbortError') throw error;
            }
            return fallback;
        }
        const res = await fetch(`${nominatimUrl}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${isAr ? 'ar,en' : 'en,ar'}`, {
            headers: { Accept: 'application/json' },
            signal,
        });
        if (!res.ok) throw new Error(`NOMINATIM_REVERSE_${res.status}`);
        const row = await res.json();
        return {
            address: row?.display_name || fallback.address,
            lat,
            lng,
            label: row?.name || fallback.label,
        };
    };

    // Pasted coordinates / Maps URL / Plus Code resolve exactly — no text
    // geocoding, no fabricated pins.
    const pinPastedLocation = async (text: string, signal?: AbortSignal): Promise<boolean> => {
        const coords = parsePastedLocation(text);
        if (!coords) return false;
        setIsSearching(true);
        setSearchNotice(null);
        try {
            const pin = await reverseToPin(coords.lat, coords.lng, signal);
            choosePin(pin);
        } catch (error: any) {
            if (error?.name === 'AbortError') return true;
            choosePin({ address: `${coords.lat}, ${coords.lng}`, lat: coords.lat, lng: coords.lng, label: isAr ? 'إحداثيات ملصقة' : 'Pasted coordinates' });
        } finally {
            setIsSearching(false);
        }
        return true;
    };

    const applyAddress = (address: string) => {
        // Pasted coordinates / Maps URL / Plus Code: pin exactly, even in
        // Google mode (autocomplete can't parse those).
        if (parsePastedLocation(address)) {
            void pinPastedLocation(address);
            return;
        }
        if (geocoderRef.current && address.trim()) {
            geocoderRef.current.geocode({ address }, (results: any[], status: string) => {
                if (status === 'OK' && results?.[0]?.geometry?.location) {
                    const location = results[0].geometry.location;
                    const next = {
                        address: results[0].formatted_address || address,
                        lat: Number(location.lat().toFixed(6)),
                        lng: Number(location.lng().toFixed(6)),
                        label: results[0].name || address,
                    };
                    onChange(next);
                    setQuery(next.address);
                    googleMapRef.current?.panTo({ lat: next.lat, lng: next.lng });
                    googleMapRef.current?.setZoom(16);
                    return;
                }
                const next = estimateFromAddress(address);
                onChange(next);
                setQuery(next.address);
            });
            return;
        }
        if (shouldUseOsmMaps() && address.trim()) {
            setIsSearching(true);
            searchPlaces(address.trim(), isAr, new AbortController().signal)
                .then((outcome) => {
                    const first = outcome.results[0];
                    if (!first) {
                        if (outcome.notice) setSearchNotice(outcome.notice);
                        const next = estimateFromAddress(address);
                        onChange(next);
                        setQuery(next.address);
                        return;
                    }
                    onChange(first);
                    setQuery(first.address);
                    leafletMapRef.current?.setView([first.lat, first.lng], 16);
                    leafletMarkerRef.current?.setLatLng([first.lat, first.lng]);
                })
                .catch(() => {
                    const next = estimateFromAddress(address);
                    onChange(next);
                    setQuery(next.address);
                })
                .finally(() => setIsSearching(false));
            return;
        }
        const next = estimateFromAddress(address);
        onChange(next);
        setQuery(next.address);
    };

    const locateMe = () => {
        if (!navigator.geolocation) return;
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const next = {
                    address: value.address || query || (isAr ? 'موقع العميل الحالي' : 'Customer current location'),
                    lat: Number(pos.coords.latitude.toFixed(6)),
                    lng: Number(pos.coords.longitude.toFixed(6)),
                    label: isAr ? 'GPS' : 'GPS',
                };
                onChange(next);
                setQuery(next.address);
                googleMapRef.current?.panTo({ lat: next.lat, lng: next.lng });
                googleMapRef.current?.setZoom(17);
                leafletMapRef.current?.setView([next.lat, next.lng], 17);
                leafletMarkerRef.current?.setLatLng([next.lat, next.lng]);
                setIsLocating(false);
            },
            () => setIsLocating(false),
            { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 },
        );
    };

    useEffect(() => {
        if (!shouldUseGoogleMaps()) return;
        let disposed = false;

        loadGoogleMaps()
            .then((google) => {
                if (disposed || !mapRef.current) return;
                const center = { lat: value.lat ?? branchFallback.lat, lng: value.lng ?? branchFallback.lng };
                geocoderRef.current = new google.maps.Geocoder();
                googleMapRef.current = new google.maps.Map(mapRef.current, {
                    center,
                    zoom: value.lat && value.lng ? 16 : 13,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                    gestureHandling: 'greedy',
                    styles: [
                        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
                        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                    ],
                });
                markerRef.current = new google.maps.Marker({
                    position: center,
                    map: googleMapRef.current,
                    draggable: true,
                    title: isAr ? 'عنوان العميل' : 'Customer address',
                });
                markerRef.current.addListener('dragend', () => {
                    const pos = markerRef.current.getPosition();
                    if (!pos) return;
                    const lat = Number(pos.lat().toFixed(6));
                    const lng = Number(pos.lng().toFixed(6));
                    geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[]) => {
                        onChange({
                            address: results?.[0]?.formatted_address || value.address || `${lat}, ${lng}`,
                            lat,
                            lng,
                            label: results?.[0]?.name,
                        });
                    });
                });
                googleMapRef.current.addListener('click', (event: any) => {
                    if (!event.latLng) return;
                    const lat = Number(event.latLng.lat().toFixed(6));
                    const lng = Number(event.latLng.lng().toFixed(6));
                    markerRef.current.setPosition({ lat, lng });
                    geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[]) => {
                        onChange({
                            address: results?.[0]?.formatted_address || value.address || `${lat}, ${lng}`,
                            lat,
                            lng,
                            label: results?.[0]?.name,
                        });
                    });
                });

                if (inputRef.current && google.maps.places?.Autocomplete) {
                    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
                        fields: ['formatted_address', 'geometry', 'name'],
                    });
                    autocompleteRef.current.addListener('place_changed', () => {
                        const place = autocompleteRef.current.getPlace();
                        const location = place?.geometry?.location;
                        if (!location) return;
                        const lat = Number(location.lat().toFixed(6));
                        const lng = Number(location.lng().toFixed(6));
                        const next = {
                            address: place.formatted_address || place.name || query,
                            lat,
                            lng,
                            label: place.name,
                        };
                        onChange(next);
                        setQuery(next.address);
                        googleMapRef.current.panTo({ lat, lng });
                        googleMapRef.current.setZoom(16);
                    });
                }

                setMapsReady(true);
            })
            .catch(() => setMapsError('GOOGLE_MAPS_LOAD_FAILED'));

        return () => {
            disposed = true;
        };
    }, []);

    useEffect(() => {
        if (!shouldUseOsmMaps() || !mapRef.current) return;
        let disposed = false;

        loadLeaflet()
            .then((L) => {
                if (disposed || !mapRef.current || leafletMapRef.current) return;
                const center = [value.lat ?? branchFallback.lat, value.lng ?? branchFallback.lng];
                const map = L.map(mapRef.current, { zoomControl: true }).setView(center, value.lat && value.lng ? 16 : 13);
                addOsmTileLayer(L, map);
                const marker = L.marker(center, {
                    draggable: true,
                    icon: createLeafletIcon('#ef4444', 'A'),
                }).addTo(map);
                leafletMapRef.current = map;
                leafletMarkerRef.current = marker;

                const reverse = (lat: number, lng: number) => {
                    fetch(`${nominatimUrl}/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { Accept: 'application/json' } })
                        .then(res => res.json())
                        .then((result) => {
                            const next = {
                                address: result?.display_name || value.address || `${lat}, ${lng}`,
                                lat,
                                lng,
                                label: result?.name,
                            };
                            onChange(next);
                            setQuery(next.address);
                        })
                        .catch(() => onChange({ ...value, lat, lng }));
                };

                marker.on('dragend', () => {
                    const pos = marker.getLatLng();
                    reverse(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
                });
                map.on('click', (event: any) => {
                    const lat = Number(event.latlng.lat.toFixed(6));
                    const lng = Number(event.latlng.lng.toFixed(6));
                    marker.setLatLng([lat, lng]);
                    reverse(lat, lng);
                });
                setOsmReady(true);
                setTimeout(() => map.invalidateSize(), 50);
            })
            .catch(() => setOsmError('LEAFLET_LOAD_FAILED'));

        return () => {
            disposed = true;
        };
    }, []);

    useEffect(() => {
        if (!googleMapRef.current || !markerRef.current || !value.lat || !value.lng) return;
        const next = { lat: value.lat, lng: value.lng };
        markerRef.current.setPosition(next);
        googleMapRef.current.panTo(next);
    }, [value.lat, value.lng]);

    useEffect(() => {
        if (!leafletMapRef.current || !leafletMarkerRef.current || !value.lat || !value.lng) return;
        leafletMarkerRef.current.setLatLng([value.lat, value.lng]);
        leafletMapRef.current.setView([value.lat, value.lng], Math.max(leafletMapRef.current.getZoom(), 15));
    }, [value.lat, value.lng]);

    return (
        <div className={`rounded-2xl border border-border bg-card shadow-sm ${compact ? 'p-3' : 'p-4'}`} dir={isAr ? 'rtl' : 'ltr'}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h4 className="flex items-center gap-2 text-xs font-black text-main">
                        <MapPin size={15} className="text-primary" />
                        {title || (isAr ? 'تحديد عنوان العميل على الخريطة' : 'Pin customer address')}
                    </h4>
                    <p className="mt-1 text-[10px] font-bold text-muted">
                        {isAr ? 'ابحث عن العنوان أو حرك النقطة لتسهيل توجيه الطيار.' : 'Search or move the pin to guide the driver.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={locateMe}
                    className="flex h-9 items-center gap-2 rounded-xl border border-border bg-elevated px-3 text-[10px] font-black text-main transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
                    disabled={isLocating}
                >
                    <LocateFixed size={14} className={isLocating ? 'animate-pulse' : ''} />
                    {isAr ? 'موقعي' : 'Locate'}
                </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-3">
                    <div className="relative">
                        <Search className={`absolute top-1/2 -translate-y-1/2 text-muted ${isAr ? 'right-3' : 'left-3'}`} size={15} />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    applyAddress(query);
                                }
                            }}
                            className={`h-11 w-full rounded-xl border border-border bg-elevated text-sm font-bold text-main outline-none transition-colors focus:border-primary ${isAr ? 'pr-10 pl-3' : 'pl-10 pr-3'}`}
                            placeholder={isAr ? 'ابحث أو الصق إحداثيات / رابط Google Maps / Plus Code…' : 'Search or paste coordinates / Google Maps link / Plus Code…'}
                        />
                        {query.trim().length >= 3 && parsePastedLocation(query.trim()) && !isSearching && (
                            <div className="pointer-events-none absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-black text-emerald-600">
                                {isAr ? 'تم التعرف على موقع دقيق — جاري التثبيت على الخريطة…' : 'Exact location detected — pinning on the map…'}
                            </div>
                        )}
                        {(searchResults.length > 0 || isSearching || searchNotice) && (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-64 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-2xl">
                                {isSearching && (
                                    <div className="px-3 py-2 text-[11px] font-black text-muted">
                                        {isAr ? 'جاري البحث عن المنطقة...' : 'Searching locations...'}
                                    </div>
                                )}
                                {!isSearching && searchNotice === 'NO_RESULTS' && (
                                    <div className="px-3 py-2 text-[11px] font-black leading-5 text-muted">
                                        {isAr ? 'لا نتائج — جرّب اسم المنطقة فقط أو حرّك الدبوس على الخريطة.' : 'No results — try just the area name, or drag the pin.'}
                                    </div>
                                )}
                                {!isSearching && searchNotice === 'SEARCH_FAILED' && (
                                    <div className="px-3 py-2 text-[11px] font-black leading-5 text-amber-600">
                                        {isAr ? 'تعذر الوصول لخدمة البحث — تحقق من الإنترنت أو حدد النقطة يدوياً.' : 'Search unreachable — check connection or pin manually.'}
                                    </div>
                                )}
                                {searchResults.map((result) => (
                                    <button
                                        type="button"
                                        key={`${result.lat}-${result.lng}-${result.address}`}
                                        onClick={() => choosePin(result)}
                                        className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-start text-xs font-bold leading-5 text-main transition-colors hover:bg-elevated"
                                    >
                                        <MapPin size={14} className="mt-0.5 shrink-0 text-primary" />
                                        <span className="min-w-0">
                                            <span className="block truncate font-black">{result.label || result.address}</span>
                                            <span className="block text-[10px] text-muted">{result.address}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <textarea
                        value={value.address}
                        onChange={(event) => onChange({ ...value, address: event.target.value })}
                        className="h-20 w-full resize-none rounded-xl border border-border bg-elevated p-3 text-sm font-bold leading-6 text-main outline-none transition-colors focus:border-primary"
                        placeholder={isAr ? 'العنوان التفصيلي للطيار...' : 'Detailed driver address...'}
                    />

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {(searchResults.length > 0 ? searchResults.slice(0, 3) : localSuggestions).map((suggestion) => (
                            <button
                                type="button"
                                key={suggestion.address}
                                onClick={() => {
                                    if (suggestion.lat && suggestion.lng) {
                                        choosePin(suggestion);
                                    } else if (geocoderRef.current) {
                                        applyAddress(suggestion.address);
                                    } else {
                                        onChange(suggestion);
                                        setQuery(suggestion.address);
                                    }
                                }}
                                className="rounded-xl border border-border bg-elevated p-2 text-start text-[10px] font-black leading-5 text-muted transition-colors hover:border-primary/40 hover:text-primary"
                            >
                                {suggestion.address}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={`relative min-h-[210px] overflow-hidden rounded-2xl border border-border bg-app ${mapHeightClass}`}>
                    {(shouldUseGoogleMaps() || shouldUseOsmMaps()) && (
                        <div ref={mapRef} className="absolute inset-0 z-0" />
                    )}
                    {shouldUseGoogleMaps() && !mapsReady && !mapsError && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل الخريطة...' : 'Loading map...'}
                        </div>
                    )}
                    {shouldUseGoogleMaps() && mapsError && (
                        <div className="absolute inset-x-3 top-3 z-20 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700">
                            {isAr ? 'تعذر تحميل Google Maps، يتم استخدام الخريطة التشغيلية مؤقتًا.' : 'Google Maps failed, using operational fallback.'}
                        </div>
                    )}
                    {shouldUseOsmMaps() && !osmReady && !osmError && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل خريطة OpenStreetMap...' : 'Loading OpenStreetMap...'}
                        </div>
                    )}
                    {shouldUseOsmMaps() && osmError && (
                        <div className="absolute inset-x-3 top-3 z-20 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700">
                            {isAr ? 'تعذر تحميل خريطة OSM، يتم استخدام الخريطة التشغيلية مؤقتًا.' : 'OSM map failed, using operational fallback.'}
                        </div>
                    )}
                    {((!shouldUseGoogleMaps() && !shouldUseOsmMaps()) || mapsError || osmError) && (
                        <>
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-[size:28px_28px]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.12),transparent_32%)]" />
                    <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg">
                            <Navigation size={18} />
                        </div>
                        <span className="mt-1 rounded-full bg-card px-2 py-1 text-[9px] font-black text-main shadow-sm">{isAr ? 'الفرع' : 'Branch'}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onChange({ ...value, ...estimateFromAddress(value.address || query) })}
                        className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                        style={{ left: `${position.x}%`, top: `${position.y}%` }}
                    >
                        <span className="absolute h-12 w-12 rounded-full bg-rose-500/20 animate-ping" />
                        <span className="relative flex h-11 w-11 items-center justify-center rounded-full border-4 border-card bg-rose-500 text-white shadow-xl">
                            <MapPin size={19} />
                        </span>
                    </button>
                        </>
                    )}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 text-[10px] font-black text-main backdrop-blur">
                        <span className="truncate">{value.lat && value.lng ? `${value.lat}, ${value.lng}` : (isAr ? 'لم يتم تثبيت نقطة بعد' : 'No pin yet')}</span>
                        <Crosshair size={14} className="text-primary" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddressMapPicker;
