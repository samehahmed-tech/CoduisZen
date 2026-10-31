export type LocalPrinterType = 'LOCAL' | 'WINDOWS' | 'USB' | 'NETWORK' | 'LAN';

export const normalizePrinterType = (value: unknown): LocalPrinterType => {
    const normalized = String(value || 'LOCAL').trim().toUpperCase();
    return (['LOCAL', 'WINDOWS', 'USB', 'NETWORK', 'LAN'] as const).includes(normalized as LocalPrinterType)
        ? normalized as LocalPrinterType
        : 'LOCAL';
};

export const canPrintDirectlyOffline = (value: unknown) =>
    ['LOCAL', 'WINDOWS', 'USB'].includes(normalizePrinterType(value));
