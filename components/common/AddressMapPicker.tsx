import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { canUseGoogleMaps, defaultMapCenter, loadGoogleMaps, nominatimUrl, useOsmMaps } from './googleMaps';
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

const AddressMapPicker: React.FC<AddressMapPickerProps> = ({ value, onChange, lang = 'ar', compact = false, title }) => {
    const isAr = lang === 'ar';
    const [query, setQuery] = useState(value.address || '');
    const [isLocating, setIsLocating] = useState(false);
    const [mapsReady, setMapsReady] = useState(false);
    const [mapsError, setMapsError] = useState<string | null>(null);
    const [osmReady, setOsmReady] = useState(false);
    const [osmError, setOsmError] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<AddressPin[]>([]);
    const [isSearching, setIsSearching] = useState(false);
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
        if (!useOsmMaps) return;
        const text = query.trim();
        if (text.length < 3) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setIsSearching(true);
            fetch(`${nominatimUrl}/search?format=json&limit=6&addressdetails=1&accept-language=${isAr ? 'ar,en' : 'en,ar'}&q=${encodeURIComponent(text)}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            })
                .then(res => res.json())
                .then((rows) => {
                    const results = Array.isArray(rows)
                        ? rows.map((row: any) => ({
                            address: row.display_name || row.name || text,
                            lat: Number(Number(row.lat).toFixed(6)),
                            lng: Number(Number(row.lon).toFixed(6)),
                            label: row.name || row.type || text,
                        }))
                        : [];
                    setSearchResults(results);
                })
                .catch((error) => {
                    if (error?.name !== 'AbortError') setSearchResults([]);
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

    const applyAddress = (address: string) => {
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
        if (useOsmMaps && address.trim()) {
            fetch(`${nominatimUrl}/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(address)}`, {
                headers: { Accept: 'application/json' },
            })
                .then(res => res.json())
                .then((rows) => {
                    const first = Array.isArray(rows) ? rows[0] : null;
                    if (!first) {
                        const next = estimateFromAddress(address);
                        onChange(next);
                        setQuery(next.address);
                        return;
                    }
                    const next = {
                        address: first.display_name || address,
                        lat: Number(Number(first.lat).toFixed(6)),
                        lng: Number(Number(first.lon).toFixed(6)),
                        label: first.name || address,
                    };
                    onChange(next);
                    setQuery(next.address);
                    leafletMapRef.current?.setView([next.lat, next.lng], 16);
                    leafletMarkerRef.current?.setLatLng([next.lat, next.lng]);
                })
                .catch(() => {
                    const next = estimateFromAddress(address);
                    onChange(next);
                    setQuery(next.address);
                });
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
        if (!canUseGoogleMaps) return;
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
        if (!useOsmMaps || !mapRef.current) return;
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
                            placeholder={isAr ? 'ابحث: المنطقة، الشارع، علامة مميزة...' : 'Search area, street, landmark...'}
                        />
                        {(searchResults.length > 0 || isSearching) && (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-64 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-2xl">
                                {isSearching && (
                                    <div className="px-3 py-2 text-[11px] font-black text-muted">
                                        {isAr ? 'جاري البحث عن المنطقة...' : 'Searching locations...'}
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

                <div className="relative min-h-[210px] overflow-hidden rounded-2xl border border-border bg-app">
                    {(canUseGoogleMaps || useOsmMaps) && (
                        <div ref={mapRef} className="absolute inset-0 z-0" />
                    )}
                    {canUseGoogleMaps && !mapsReady && !mapsError && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل الخريطة...' : 'Loading map...'}
                        </div>
                    )}
                    {canUseGoogleMaps && mapsError && (
                        <div className="absolute inset-x-3 top-3 z-20 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700">
                            {isAr ? 'تعذر تحميل Google Maps، يتم استخدام الخريطة التشغيلية مؤقتًا.' : 'Google Maps failed, using operational fallback.'}
                        </div>
                    )}
                    {useOsmMaps && !osmReady && !osmError && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل خريطة OpenStreetMap...' : 'Loading OpenStreetMap...'}
                        </div>
                    )}
                    {useOsmMaps && osmError && (
                        <div className="absolute inset-x-3 top-3 z-20 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700">
                            {isAr ? 'تعذر تحميل خريطة OSM، يتم استخدام الخريطة التشغيلية مؤقتًا.' : 'OSM map failed, using operational fallback.'}
                        </div>
                    )}
                    {((!canUseGoogleMaps && !useOsmMaps) || mapsError || osmError) && (
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
