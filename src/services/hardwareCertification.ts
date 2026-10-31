import { canPrintDirectlyOffline, normalizePrinterType } from './localPrintPolicy';

export const CASH_DRAWER_PULSE = '\x1B\x70\x00\x19\xFA';

export type ScaleReading = {
    grams: number;
    stable: boolean;
    unit: 'g' | 'kg' | 'lb' | 'oz';
};

const SCALE_READING_PATTERN = /^(?:(ST|US)(?:,[A-Z]+)?[,;\s]+)?([+-]?\s*(?:\d+(?:\.\d*)?|\.\d+))\s*(kg|kgs|g|gram|grams|lb|lbs|oz|ounce|ounces)?$/i;

const SCALE_UNIT_GRAMS: Record<string, { unit: ScaleReading['unit']; multiplier: number }> = {
    g: { unit: 'g', multiplier: 1 },
    gram: { unit: 'g', multiplier: 1 },
    grams: { unit: 'g', multiplier: 1 },
    kg: { unit: 'kg', multiplier: 1000 },
    kgs: { unit: 'kg', multiplier: 1000 },
    lb: { unit: 'lb', multiplier: 453.59237 },
    lbs: { unit: 'lb', multiplier: 453.59237 },
    oz: { unit: 'oz', multiplier: 28.349523125 },
    ounce: { unit: 'oz', multiplier: 28.349523125 },
    ounces: { unit: 'oz', multiplier: 28.349523125 },
};

export const parseScaleReading = (value: unknown): ScaleReading | null => {
    const raw = String(value ?? '').trim();
    const match = raw.match(SCALE_READING_PATTERN);
    if (!match) return null;

    const numericValue = Number(String(match[2]).replace(/\s/g, ''));
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 1000000) return null;

    const rawUnit = String(match[3] || 'g').toLowerCase();
    const conversion = SCALE_UNIT_GRAMS[rawUnit];
    if (!conversion) return null;

    return {
        grams: Math.round(numericValue * conversion.multiplier * 1000) / 1000,
        stable: String(match[1] || '').toUpperCase() === 'ST',
        unit: conversion.unit,
    };
};

export const isValidEan13 = (value: unknown): boolean => {
    const digits = String(value ?? '').trim();
    if (!/^\d{13}$/.test(digits)) return false;

    const sum = digits.slice(0, 12).split('').reduce((total, digit, index) => (
        total + Number(digit) * (index % 2 === 0 ? 1 : 3)
    ), 0);
    return (10 - (sum % 10)) % 10 === Number(digits[12]);
};

export type HardwareCertificationStatus = 'AUTOMATED_SIMULATION' | 'PHYSICAL_REQUIRED';

export type HardwareCertificationEntry = {
    capability: string;
    transport: string;
    status: HardwareCertificationStatus;
    automatedEvidence: string;
    physicalEvidence: string;
};

export const getHardwareCertificationMatrix = (): HardwareCertificationEntry[] => [
    {
        capability: 'receipt_printer',
        transport: 'LOCAL/WINDOWS/USB',
        status: 'AUTOMATED_SIMULATION',
        automatedEvidence: 'Offline policy and bridge contract are validated.',
        physicalEvidence: 'Print a receipt and verify layout, Arabic glyphs, cutter and retry behavior.',
    },
    {
        capability: 'network_printer',
        transport: 'NETWORK/LAN',
        status: 'PHYSICAL_REQUIRED',
        automatedEvidence: 'Policy confirms this path is not direct-offline.',
        physicalEvidence: 'Verify queue delivery, timeout, duplicate prevention and LAN outage recovery.',
    },
    {
        capability: 'cash_drawer',
        transport: 'ESC/POS',
        status: 'AUTOMATED_SIMULATION',
        automatedEvidence: 'Pulse command bytes are deterministic and covered by unit tests.',
        physicalEvidence: 'Connect drawer to the certified printer and verify one pulse opens it.',
    },
    {
        capability: 'barcode_scanner',
        transport: 'HID/EAN-13',
        status: 'AUTOMATED_SIMULATION',
        automatedEvidence: 'EAN-13 check-digit validation is covered by unit tests.',
        physicalEvidence: 'Scan printed and damaged labels with the target scanner model.',
    },
    {
        capability: 'scale',
        transport: 'serial/HID text',
        status: 'PHYSICAL_REQUIRED',
        automatedEvidence: 'Common stable/unstable text frames and unit conversions are validated.',
        physicalEvidence: 'Calibrate against known weights and verify stable-frame acceptance.',
    },
];

export const getPrinterCertificationResult = (value: unknown) => ({
    normalizedType: normalizePrinterType(value),
    directOffline: canPrintDirectlyOffline(value),
});
