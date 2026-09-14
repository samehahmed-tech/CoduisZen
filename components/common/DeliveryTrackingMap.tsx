import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, MapPin, Navigation, Package, Search, Truck, LocateFixed, RefreshCw } from 'lucide-react';
import { defaultMapCenter, loadGoogleMaps, nominatimUrl, resetGoogleMapsLoader, shouldUseGoogleMaps, shouldUseOsmMaps } from './googleMaps';
import { fetchOsrmRoute } from './mapRouting';
import { addOsmTileLayer, createLeafletIcon, loadLeaflet, resetLeafletLoader } from './leafletMaps';

export type DeliveryMapDriver = {
    id: string;
    name: string;
    status?: string;
    lat?: number;
    lng?: number;
    speedKmh?: number;
    accuracyM?: number;
    lastSeenLabel?: string;
};

export type DeliveryMapOrder = {
    id: string;
    label: string;
    address?: string;
    lat?: number;
    lng?: number;
    driverId?: string;
    status?: string;
};

type DeliveryTrackingMapProps = {
    lang?: 'ar' | 'en';
    title?: string;
    subtitle?: string;
    drivers?: DeliveryMapDriver[];
    orders?: DeliveryMapOrder[];
    center?: { lat: number; lng: number };
    heightClass?: string;
    showSearch?: boolean;
    selectedOrderId?: string;
    /** Optional road route overlay (driver -> destination), drawn via free OSRM in OSM mode. */
    route?: { from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
};

const isValidPoint = (lat?: number, lng?: number) =>
    typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);

const getDriverColor = (status?: string) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized.includes('AVAILABLE')) return '#10b981';
    if (normalized.includes('RETURNING')) return '#f59e0b';
    if (normalized.includes('DELIVERY') || normalized.includes('BUSY')) return '#4f46e5';
    return '#64748b';
};

const createMarkerIcon = (google: any, color: string, label: string) => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 3,
    labelOrigin: new google.maps.Point(0, -1),
});

const DeliveryTrackingMap: React.FC<DeliveryTrackingMapProps> = ({
    lang = 'ar',
    title,
    subtitle,
    drivers = [],
    orders = [],
    center = defaultMapCenter,
    heightClass = 'min-h-[360px]',
    showSearch = true,
    selectedOrderId,
    route = null,
}) => {
    const useGoogle = shouldUseGoogleMaps();
    const useOsm = shouldUseOsmMaps();
    const isAr = lang === 'ar';
    const mapNodeRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const autocompleteRef = useRef<any>(null);
    const leafletMapRef = useRef<any>(null);
    const leafletMarkersRef = useRef<any[]>([]);
    const [ready, setReady] = useState(false);
    const [osmReady, setOsmReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [osmSearch, setOsmSearch] = useState('');
    const [routePoints, setRoutePoints] = useState<Array<[number, number]>>([]);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [loadingMap, setLoadingMap] = useState(true);
    const fittedOnceRef = useRef(false);
    const followRef = useRef(true);

    useEffect(() => {
        let active = true;
        if (!route || !isValidPoint(route.from.lat, route.from.lng) || !isValidPoint(route.to.lat, route.to.lng)) {
            setRoutePoints([]);
            return;
        }
        fetchOsrmRoute(route.from, route.to).then((r) => {
            if (active) setRoutePoints(r && r.points.length > 1 ? r.points : []);
        });
        return () => { active = false; };
    }, [route?.from.lat, route?.from.lng, route?.to.lat, route?.to.lng]);

    const validDrivers = useMemo(() => drivers.filter(driver => isValidPoint(driver.lat, driver.lng)), [drivers]);
    const validOrders = useMemo(() => orders.filter(order => isValidPoint(order.lat, order.lng)), [orders]);

    useEffect(() => {
        if (!useGoogle) return;
        let disposed = false;
        // Reuse the existing map instance on retry (same DOM node).
        if (mapRef.current && mapNodeRef.current) {
            setReady(true);
            return;
        }
        setReady(false);

        loadGoogleMaps()
            .then((google) => {
                if (disposed || !mapNodeRef.current) return;
                mapRef.current = new google.maps.Map(mapNodeRef.current, {
                    center,
                    zoom: 13,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                    clickableIcons: false,
                    gestureHandling: 'greedy',
                    styles: [
                        { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
                        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                    ],
                });

                if (showSearch && searchInputRef.current && google.maps.places?.Autocomplete) {
                    autocompleteRef.current = new google.maps.places.Autocomplete(searchInputRef.current, {
                        fields: ['formatted_address', 'geometry', 'name'],
                    });
                    autocompleteRef.current.addListener('place_changed', () => {
                        const place = autocompleteRef.current.getPlace();
                        const location = place?.geometry?.location;
                        if (!location) return;
                        mapRef.current.panTo(location);
                        mapRef.current.setZoom(16);
                    });
                }

                setReady(true);
            })
            .catch(() => setError('GOOGLE_MAPS_LOAD_FAILED'));

        return () => {
            disposed = true;
            markersRef.current.forEach(marker => marker.setMap(null));
            markersRef.current = [];
        };
    }, [loadAttempt]);

    useEffect(() => {
        if (!useOsm) return;
        let disposed = false;
        setLoadingMap(true);
        setError(null);
        setOsmReady(false);
        loadLeaflet()
            .then((L) => {
                if (disposed || !mapNodeRef.current) return;
                if (!leafletMapRef.current) {
                    const map = L.map(mapNodeRef.current, { zoomControl: true }).setView([center.lat, center.lng], 13);
                    addOsmTileLayer(L, map);
                    map.on('dragstart', () => { followRef.current = false; });
                    leafletMapRef.current = map;
                }
                setOsmReady(true);
                setLoadingMap(false);
                setTimeout(() => leafletMapRef.current?.invalidateSize(), 50);
            })
            .catch(() => {
                if (!disposed) {
                    setError('OSM_LOAD_FAILED');
                    setLoadingMap(false);
                }
            });
        return () => {
            disposed = true;
            leafletMarkersRef.current.forEach(marker => marker.remove());
            leafletMarkersRef.current = [];
            try { leafletMapRef.current?.remove(); } catch { /* already gone */ }
            leafletMapRef.current = null;
            fittedOnceRef.current = false;
            followRef.current = true;
        };
    }, [loadAttempt]);

    useEffect(() => {
        if (!ready || !mapRef.current || !window.google?.maps) return;
        const google = window.google;
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        const bounds = new google.maps.LatLngBounds();
        const branchMarker = new google.maps.Marker({
            position: center,
            map: mapRef.current,
            title: isAr ? 'الفرع' : 'Branch',
            label: { text: 'B', color: '#ffffff', fontWeight: '900' },
            icon: createMarkerIcon(google, '#0f172a', 'B'),
        });
        markersRef.current.push(branchMarker);
        bounds.extend(center);

        validDrivers.forEach((driver) => {
            const position = { lat: driver.lat!, lng: driver.lng! };
            const marker = new google.maps.Marker({
                position,
                map: mapRef.current,
                title: driver.name,
                label: { text: 'D', color: '#ffffff', fontWeight: '900' },
                icon: createMarkerIcon(google, getDriverColor(driver.status), 'D'),
            });
            const info = new google.maps.InfoWindow({
                content: `<div style="font-family:Arial;min-width:160px"><b>${driver.name}</b><br/>${driver.status || ''}<br/>${driver.speedKmh ? Math.round(driver.speedKmh) + ' km/h' : driver.lastSeenLabel || ''}</div>`,
            });
            marker.addListener('click', () => info.open({ anchor: marker, map: mapRef.current }));
            markersRef.current.push(marker);
            bounds.extend(position);
            if (Number.isFinite(driver.accuracyM) && driver.accuracyM! > 0) {
                const circle = new google.maps.Circle({
                    center: position,
                    radius: Math.min(driver.accuracyM!, 500),
                    strokeColor: getDriverColor(driver.status),
                    strokeWeight: 1,
                    strokeOpacity: 0.6,
                    fillColor: getDriverColor(driver.status),
                    fillOpacity: 0.12,
                    map: mapRef.current,
                });
                markersRef.current.push(circle);
            }
        });

        validOrders.forEach((order) => {
            const position = { lat: order.lat!, lng: order.lng! };
            const isSelected = selectedOrderId && selectedOrderId === order.id;
            const marker = new google.maps.Marker({
                position,
                map: mapRef.current,
                title: order.label,
                label: { text: 'O', color: '#ffffff', fontWeight: '900' },
                icon: createMarkerIcon(google, isSelected ? '#dc2626' : '#2563eb', 'O'),
                zIndex: isSelected ? 20 : 10,
            });
            const info = new google.maps.InfoWindow({
                content: `<div style="font-family:Arial;min-width:180px"><b>${order.label}</b><br/>${order.address || ''}<br/>${order.status || ''}</div>`,
            });
            marker.addListener('click', () => info.open({ anchor: marker, map: mapRef.current }));
            markersRef.current.push(marker);
            bounds.extend(position);
        });

        if (routePoints.length > 1) {
            const line = new google.maps.Polyline({
                path: routePoints.map(([lat, lng]) => ({ lat, lng })),
                strokeColor: '#4f46e5',
                strokeWeight: 5,
                strokeOpacity: 0.85,
                map: mapRef.current,
            });
            markersRef.current.push(line);
            routePoints.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        }

        const pointCount = 1 + validDrivers.length + validOrders.length;
        if (pointCount > 1) mapRef.current.fitBounds(bounds, 72);
        else mapRef.current.setCenter(center);
    }, [ready, center.lat, center.lng, validDrivers, validOrders, selectedOrderId, isAr, routePoints]);

    useEffect(() => {
        if (!osmReady || !leafletMapRef.current || !window.L) return;
        const L = window.L;
        leafletMarkersRef.current.forEach(marker => marker.remove());
        leafletMarkersRef.current = [];
        const points: Array<[number, number]> = [];

        const branchMarker = L.marker([center.lat, center.lng], { icon: createLeafletIcon('#0f172a', 'B') })
            .addTo(leafletMapRef.current)
            .bindPopup(isAr ? 'الفرع' : 'Branch');
        leafletMarkersRef.current.push(branchMarker);
        points.push([center.lat, center.lng]);

        validDrivers.forEach((driver) => {
            const marker = L.marker([driver.lat!, driver.lng!], { icon: createLeafletIcon(getDriverColor(driver.status), 'D') })
                .addTo(leafletMapRef.current)
                .bindPopup(`<b>${driver.name}</b><br/>${driver.status || ''}<br/>${driver.speedKmh ? Math.round(driver.speedKmh) + ' km/h' : driver.lastSeenLabel || ''}`);
            leafletMarkersRef.current.push(marker);
            points.push([driver.lat!, driver.lng!]);
            if (Number.isFinite(driver.accuracyM) && driver.accuracyM! > 0) {
                const circle = L.circle([driver.lat!, driver.lng!], {
                    radius: Math.min(driver.accuracyM!, 500),
                    color: getDriverColor(driver.status),
                    weight: 1,
                    opacity: 0.6,
                    fillOpacity: 0.12,
                }).addTo(leafletMapRef.current);
                leafletMarkersRef.current.push(circle);
            }
        });

        validOrders.forEach((order) => {
            const marker = L.marker([order.lat!, order.lng!], { icon: createLeafletIcon(selectedOrderId === order.id ? '#dc2626' : '#2563eb', 'O') })
                .addTo(leafletMapRef.current)
                .bindPopup(`<b>${order.label}</b><br/>${order.address || ''}<br/>${order.status || ''}`);
            leafletMarkersRef.current.push(marker);
            points.push([order.lat!, order.lng!]);
        });

        if (routePoints.length > 1) {
            const line = L.polyline(routePoints, { color: '#4f46e5', weight: 5, opacity: 0.85 }).addTo(leafletMapRef.current);
            leafletMarkersRef.current.push(line);
            routePoints.forEach((p) => points.push(p));
        }

        if (points.length > 1 && (!fittedOnceRef.current || followRef.current)) {
            leafletMapRef.current.fitBounds(points, { padding: [40, 40] });
            fittedOnceRef.current = true;
        } else if (points.length <= 1 && !fittedOnceRef.current) {
            leafletMapRef.current.setView([center.lat, center.lng], 13);
            fittedOnceRef.current = true;
        }
    }, [osmReady, center.lat, center.lng, validDrivers, validOrders, selectedOrderId, isAr, routePoints]);

    const recenter = () => {
        followRef.current = true;
        if (!leafletMapRef.current) return;
        const pts: Array<[number, number]> = [[center.lat, center.lng]];
        validDrivers.forEach((d) => { if (isValidPoint(d.lat, d.lng)) pts.push([d.lat!, d.lng!]); });
        validOrders.forEach((o) => { if (isValidPoint(o.lat, o.lng)) pts.push([o.lat!, o.lng!]); });
        routePoints.forEach((p) => pts.push(p));
        if (pts.length > 1) leafletMapRef.current.fitBounds(pts, { padding: [40, 40] });
        else leafletMapRef.current.setView([center.lat, center.lng], 14);
    };

    const retryLoad = () => {
        resetLeafletLoader();
        resetGoogleMapsLoader();
        setError(null);
        setLoadAttempt((n) => n + 1);
    };

    const searchOsm = () => {
        const q = osmSearch.trim();
        if (!q || !leafletMapRef.current) return;
        fetch(`${nominatimUrl}/search?format=jsonv2&limit=1&countrycodes=eg&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
            .then(res => res.json())
            .then((rows) => {
                const first = Array.isArray(rows) ? rows[0] : null;
                if (!first) return;
                leafletMapRef.current.setView([Number(first.lat), Number(first.lon)], 16);
            })
            .catch(() => undefined);
    };

    const fallbackPins = useMemo(() => {
        const all = [
            ...drivers.map((driver, index) => ({
                id: `d-${driver.id}`,
                label: driver.name,
                type: 'driver' as const,
                status: driver.status,
                x: isValidPoint(driver.lat, driver.lng) ? 14 + Math.abs(driver.lng! * 17 + index * 13) % 72 : 16 + (index * 19) % 68,
                y: isValidPoint(driver.lat, driver.lng) ? 18 + Math.abs(driver.lat! * 19 + index * 11) % 62 : 20 + (index * 17) % 58,
            })),
            ...orders.map((order, index) => ({
                id: `o-${order.id}`,
                label: order.label,
                type: 'order' as const,
                status: order.status,
                x: isValidPoint(order.lat, order.lng) ? 14 + Math.abs(order.lng! * 15 + index * 9) % 72 : 18 + (index * 23) % 62,
                y: isValidPoint(order.lat, order.lng) ? 18 + Math.abs(order.lat! * 18 + index * 7) % 62 : 22 + (index * 15) % 56,
            })),
        ];
        return all;
    }, [drivers, orders]);

    return (
        <div className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${heightClass}`}>
            <div className="relative z-10 flex flex-col gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-black text-main">
                        <MapPin size={17} className="text-primary" />
                        {title || (isAr ? 'خريطة التتبع الحي' : 'Live tracking map')}
                    </h2>
                    <p className="mt-1 text-xs font-bold text-muted">
                        {subtitle || (isAr ? 'خريطة فعلية للطيارين وأماكن أوردرات الدليفري.' : 'Real map for drivers and delivery orders.')}
                    </p>
                </div>
                {showSearch && useGoogle && (
                    <div className="relative w-full md:w-72">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            ref={searchInputRef}
                            className="h-10 w-full rounded-xl border border-border bg-elevated pr-9 pl-3 text-xs font-bold text-main outline-none focus:border-primary"
                            placeholder={isAr ? 'ابحث على الخريطة...' : 'Search map...'}
                        />
                    </div>
                )}
                {showSearch && useOsm && (
                    <div className="relative flex w-full gap-2 md:w-80">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            value={osmSearch}
                            onChange={(event) => setOsmSearch(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    searchOsm();
                                }
                            }}
                            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-elevated pr-9 pl-3 text-xs font-bold text-main outline-none focus:border-primary"
                            placeholder={isAr ? 'ابحث على الخريطة...' : 'Search map...'}
                        />
                        <button type="button" onClick={searchOsm} className="h-10 rounded-xl bg-primary px-3 text-[10px] font-black text-white">
                            {isAr ? 'بحث' : 'Search'}
                        </button>
                    </div>
                )}
            </div>

            {useGoogle && !error ? (
                <>
                    <div ref={mapNodeRef} className="absolute inset-0 z-0" />
                    {!ready && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل الخريطة...' : 'Loading map...'}
                        </div>
                    )}
                </>
            ) : useOsm && !error ? (
                <>
                    <div ref={mapNodeRef} className="absolute inset-0 z-0" />
                    {loadingMap && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل خريطة OpenStreetMap...' : 'Loading OpenStreetMap...'}
                        </div>
                    )}
                    {osmReady && (
                        <button
                            type="button"
                            onClick={recenter}
                            className="absolute right-3 top-20 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/95 text-main shadow-lg backdrop-blur transition-transform active:scale-95"
                            title={isAr ? 'توسيط على موقعي' : 'Center on me'}
                        >
                            <LocateFixed size={17} />
                        </button>
                    )}
                </>
            ) : error ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/95 p-6 text-center backdrop-blur-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                        <MapPin size={24} />
                    </div>
                    <p className="max-w-xs text-xs font-black leading-6 text-main">
                        {isAr ? 'تعذر تحميل الخريطة. تحقق من الإنترنت ثم حاول مجدداً.' : 'Map failed to load. Check your connection and retry.'}
                    </p>
                    <button
                        type="button"
                        onClick={retryLoad}
                        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-white shadow-lg transition-transform active:scale-95"
                    >
                        <RefreshCw size={14} />
                        {isAr ? 'إعادة تحميل الخريطة' : 'Reload map'}
                    </button>
                </div>
            ) : (
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:32px_32px]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_35%,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_70%_60%,rgba(16,185,129,0.10),transparent_28%)]" />
                    <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                            <Truck size={24} />
                        </div>
                        <div className="mt-2 rounded-full bg-card px-3 py-1 text-[10px] font-black text-main shadow-sm">
                            {isAr ? 'الفرع' : 'Branch'}
                        </div>
                    </div>
                    {fallbackPins.map((pin) => (
                        <div key={pin.id} className="absolute z-20" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
                            <div className={`relative flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-card shadow-lg ${pin.type === 'driver' ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'}`}>
                                {pin.type === 'driver' ? <Bike size={18} /> : <Package size={18} />}
                            </div>
                            <div className="mt-1 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-card px-2 py-1 text-[10px] font-black text-main shadow-sm">
                                {pin.label}
                            </div>
                        </div>
                    ))}
                    <div className="absolute inset-x-4 bottom-4 z-30 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700">
                        {isAr ? 'اضبط مزود الخرائط أو شغل OSM المحلي لعرض الخريطة.' : 'Configure the map provider or local OSM service to enable maps.'}
                    </div>
                </div>
            )}

            <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-full bg-card/90 px-3 py-1 text-[10px] font-black text-main shadow-sm backdrop-blur">
                <Navigation size={13} className="text-emerald-500" />
                LIVE
            </div>
        </div>
    );
};

export default DeliveryTrackingMap;
