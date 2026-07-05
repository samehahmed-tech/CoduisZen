import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, MapPin, Navigation, Package, Search, Truck } from 'lucide-react';
import { canUseGoogleMaps, defaultMapCenter, loadGoogleMaps, nominatimUrl, useOsmMaps } from './googleMaps';
import { addOsmTileLayer, createLeafletIcon, loadLeaflet } from './leafletMaps';

export type DeliveryMapDriver = {
    id: string;
    name: string;
    status?: string;
    lat?: number;
    lng?: number;
    speedKmh?: number;
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
}) => {
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

    const validDrivers = useMemo(() => drivers.filter(driver => isValidPoint(driver.lat, driver.lng)), [drivers]);
    const validOrders = useMemo(() => orders.filter(order => isValidPoint(order.lat, order.lng)), [orders]);

    useEffect(() => {
        if (!canUseGoogleMaps) return;
        let disposed = false;

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
    }, []);

    useEffect(() => {
        if (!useOsmMaps) return;
        let disposed = false;
        loadLeaflet()
            .then((L) => {
                if (disposed || !mapNodeRef.current || leafletMapRef.current) return;
                const map = L.map(mapNodeRef.current, { zoomControl: true }).setView([center.lat, center.lng], 13);
                addOsmTileLayer(L, map);
                leafletMapRef.current = map;
                setOsmReady(true);
                setTimeout(() => map.invalidateSize(), 50);
            })
            .catch(() => setError('OSM_LOAD_FAILED'));
        return () => {
            disposed = true;
            leafletMarkersRef.current.forEach(marker => marker.remove());
            leafletMarkersRef.current = [];
        };
    }, []);

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

        const pointCount = 1 + validDrivers.length + validOrders.length;
        if (pointCount > 1) mapRef.current.fitBounds(bounds, 72);
        else mapRef.current.setCenter(center);
    }, [ready, center.lat, center.lng, validDrivers, validOrders, selectedOrderId, isAr]);

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
        });

        validOrders.forEach((order) => {
            const marker = L.marker([order.lat!, order.lng!], { icon: createLeafletIcon(selectedOrderId === order.id ? '#dc2626' : '#2563eb', 'O') })
                .addTo(leafletMapRef.current)
                .bindPopup(`<b>${order.label}</b><br/>${order.address || ''}<br/>${order.status || ''}`);
            leafletMarkersRef.current.push(marker);
            points.push([order.lat!, order.lng!]);
        });

        if (points.length > 1) leafletMapRef.current.fitBounds(points, { padding: [40, 40] });
        else leafletMapRef.current.setView([center.lat, center.lng], 13);
    }, [osmReady, center.lat, center.lng, validDrivers, validOrders, selectedOrderId, isAr]);

    const searchOsm = () => {
        const q = osmSearch.trim();
        if (!q || !leafletMapRef.current) return;
        fetch(`${nominatimUrl}/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
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
                {showSearch && canUseGoogleMaps && (
                    <div className="relative w-full md:w-72">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            ref={searchInputRef}
                            className="h-10 w-full rounded-xl border border-border bg-elevated pr-9 pl-3 text-xs font-bold text-main outline-none focus:border-primary"
                            placeholder={isAr ? 'ابحث على الخريطة...' : 'Search map...'}
                        />
                    </div>
                )}
                {showSearch && useOsmMaps && (
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

            {canUseGoogleMaps && !error ? (
                <>
                    <div ref={mapNodeRef} className="absolute inset-0 z-0" />
                    {!ready && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل الخريطة...' : 'Loading map...'}
                        </div>
                    )}
                </>
            ) : useOsmMaps && !error ? (
                <>
                    <div ref={mapNodeRef} className="absolute inset-0 z-0" />
                    {!osmReady && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 text-xs font-black text-muted backdrop-blur-sm">
                            {isAr ? 'جاري تحميل خريطة OpenStreetMap...' : 'Loading OpenStreetMap...'}
                        </div>
                    )}
                </>
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
