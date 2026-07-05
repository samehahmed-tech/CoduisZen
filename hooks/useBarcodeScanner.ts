/**
 * useBarcodeScanner — Shared barcode scanner hook
 * Supports hardware USB/Bluetooth barcode scanners (keyboard emulation mode).
 * 
 * How it works:
 * - Hardware scanners emit rapid keystrokes (character gap < 50ms)
 * - Then send Enter key to terminate the sequence
 * - This hook buffers rapid input and fires onScan when a complete barcode is detected
 * 
 * Usage:
 *   useBarcodeScanner({
 *     onScan: (code) => { lookupProduct(code); },
 *     enabled: true,
 *     minLength: 4,
 *   });
 */

import { useEffect, useRef, useCallback } from 'react';

export interface BarcodeScannerOptions {
    /** Called when a complete barcode is detected */
    onScan: (barcode: string) => void;
    /** Whether the scanner is active (default: true) */
    enabled?: boolean;
    /** Minimum barcode length to accept (default: 4) */
    minLength?: number;
    /** Max time between keystrokes in ms to consider scanner input (default: 80) */
    maxKeystrokeGap?: number;
    /** Timeout after last keystroke to auto-flush buffer (default: 150) */
    flushTimeout?: number;
    /** If true, suppresses keyboard shortcuts while scanning (default: true) */
    suppressDuringCapture?: boolean;
}

export function useBarcodeScanner(options: BarcodeScannerOptions) {
    const {
        onScan,
        enabled = true,
        minLength = 4,
        maxKeystrokeGap = 80,
        flushTimeout = 150,
        suppressDuringCapture = true,
    } = options;

    const bufferRef = useRef('');
    const lastInputAtRef = useRef(0);
    const flushTimerRef = useRef<number | null>(null);
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const clearBuffer = useCallback(() => {
        bufferRef.current = '';
        if (flushTimerRef.current) {
            window.clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
    }, []);

    const processBuffer = useCallback(() => {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= minLength) {
            onScanRef.current(code);
            return true;
        }
        return false;
    }, [minLength]);

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept when typing in inputs/textareas
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
            const isContentEditable = target.isContentEditable;

            // Allow scanner input even in inputs if it's a scan sequence 
            // (detected by rapid keystroke timing)
            const isScannerChar = e.key.length === 1 && /[a-zA-Z0-9\-_./]/.test(e.key);
            const now = Date.now();
            const delta = now - lastInputAtRef.current;

            if (isScannerChar && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // Reset buffer if gap is too large (human typing, not scanner)
                if (bufferRef.current && delta > maxKeystrokeGap) {
                    // If we're in an input field and the gap is large, it's human typing
                    if (isInput || isContentEditable) {
                        bufferRef.current = '';
                        return;
                    }
                    bufferRef.current = '';
                }

                bufferRef.current += e.key;
                lastInputAtRef.current = now;

                // Schedule auto-flush
                if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
                flushTimerRef.current = window.setTimeout(() => {
                    const buffered = bufferRef.current;
                    bufferRef.current = '';
                    if (buffered.length >= minLength * 2) {
                        // Long enough to be a scanner sequence even without Enter
                        onScanRef.current(buffered.trim());
                    }
                }, flushTimeout);

                // Suppress shortcuts during fast capture (scanner mode)
                if (suppressDuringCapture && !isInput && !isContentEditable) {
                    if (delta < maxKeystrokeGap || bufferRef.current.length >= 6) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }

            // Enter terminates scanner sequence
            if (e.key === 'Enter' && bufferRef.current.length >= minLength) {
                e.preventDefault();
                e.stopPropagation();
                if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
                processBuffer();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            clearBuffer();
        };
    }, [enabled, minLength, maxKeystrokeGap, flushTimeout, suppressDuringCapture, processBuffer, clearBuffer]);

    return { clearBuffer };
}

export default useBarcodeScanner;
