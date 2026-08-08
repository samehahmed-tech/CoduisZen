type RoutingPrinter = {
    id?: string | null;
    name?: string | null;
    code?: string | null;
    role?: string | null;
    roles?: string[] | null;
    stationId?: string | null;
};

const nonKitchenRoles = new Set(['CASHIER', 'OTHER']);

export const normalizeKdsStationName = (value?: string | null) => {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || 'KITCHEN';
};

export const isKitchenRoutingPrinter = (printer: RoutingPrinter) => Boolean(
    printer.stationId
    || (printer.roles || []).some(role => !nonKitchenRoles.has(String(role).toUpperCase()))
    || (printer.role && !nonKitchenRoles.has(String(printer.role).toUpperCase())),
);

export const resolvePrinterRoutingStation = (printer: RoutingPrinter) => {
    const role = (printer.roles || []).find(value => !nonKitchenRoles.has(String(value).toUpperCase()))
        || (printer.role && !nonKitchenRoles.has(String(printer.role).toUpperCase()) ? printer.role : null);
    return normalizeKdsStationName(
        printer.stationId
        || role
        || printer.code
        || printer.name
        || printer.id,
    );
};
