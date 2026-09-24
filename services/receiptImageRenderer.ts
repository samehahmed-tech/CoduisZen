/* ═══════════════════════════════════════════════════════════════════════════
   Receipt Image Renderer — renders HTML receipt to base64 PNG for thermal
   printers. Enables full Arabic + styled printing via raster mode.
   ═══════════════════════════════════════════════════════════════════════════ */

import html2canvas from 'html2canvas';

// Cairo is fetched via @import inside every receipt. Loading it per-receipt
// cost ~0.5-2.5s on slow links — the biggest slice of "print takes a while".
// Preload once (POS boot / PrinterManager mount) and reuse for all renders.
let cachedFontFacePromise: Promise<unknown> | null = null;

export const preloadReceiptFonts = (): Promise<unknown> => {
    if (cachedFontFacePromise) return cachedFontFacePromise;
    cachedFontFacePromise = (async () => {
        try {
            if (typeof document === 'undefined' || !('fonts' in document)) return null;
            const fonts = (document as any).fonts as {
                load?: (font: string, text?: string) => Promise<unknown[]>;
            };
            if (!fonts?.load) return null;
            const sample = 'شكرا لزيارتكم 0123456789 Paid إيصال الطلب تيك اواي';
            return await Promise.race([
                Promise.all([
                    fonts.load('800 16px Cairo', sample),
                    fonts.load('900 16px Cairo', sample),
                ]),
                new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
        } catch {
            return null;
        }
    })();
    return cachedFontFacePromise;
};

// Data-URL cache for remote logos: fetching + CORS-converting the same logo
// on every order added a network round-trip to the print path.
const logoDataUrlCache = new Map<string, string>();

const fetchImageAsDataUrl = async (src: string): Promise<string> => {
    const cached = logoDataUrlCache.get(src);
    if (cached) return cached;
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) return '';
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    if (dataUrl) {
        logoDataUrlCache.set(src, dataUrl);
        if (logoDataUrlCache.size > 20) logoDataUrlCache.delete(logoDataUrlCache.keys().next().value);
    }
    return dataUrl;
};

// Eagerly warm the font cache on module load in the browser so the first
// real order does not pay the download cost.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
        const warm = () => { preloadReceiptFonts().catch(() => undefined); };
        if (document.readyState === 'complete') warm();
        else window.addEventListener('load', warm, { once: true });
    } catch { /* ignore */ }
}

/**
 * Render an HTML receipt string into a base64-encoded PNG image.
 * The image is sized to match the thermal printer paper width.
 *
 * @param html     Full HTML string (with <head>, <body>, etc.)
 * @param widthPx  Target width in pixels (58mm ≈ 384px, 80mm ≈ 576px)
 * @returns        base64-encoded PNG string (no data: prefix)
 */
export const renderReceiptToImage = async (
    html: string,
    widthPx: number = 576 // default 80mm
): Promise<string> => {
    // Scale 2 keeps 203dpi thermal output sharp while producing ~2.25x fewer
    // pixels than scale 3 (faster html2canvas + smaller base64 + faster SQL
    // INSERT + faster bridge spool). Scale 3 was visibly identical on paper.
    const renderScale = 2;
    // Render in an isolated iframe. Receipt CSS contains global body/@page
    // rules; placing those styles in the app document briefly shrinks the POS.
    const frame = document.createElement('iframe');
    frame.title = 'Receipt image render';
    frame.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: ${widthPx}px;
        height: 1px;
        border: 0;
        opacity: 0;
        pointer-events: none;
    `;
    document.body.appendChild(frame);

    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument || frameWindow?.document;
    if (!frameWindow || !frameDocument) {
        frame.remove();
        throw new Error('FAILED_TO_CREATE_RECEIPT_FRAME');
    }

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();

    const thermalOverrideStyle = frameDocument.createElement('style');
    thermalOverrideStyle.textContent = `
        .receipt-print-root {
            width: ${widthPx}px !important;
            max-width: ${widthPx}px !important;
            margin: 0 !important;
            padding: ${widthPx <= 384 ? 7 : 8}px ${widthPx <= 384 ? 5 : 6}px 10px !important;
            box-sizing: border-box !important;
            /* NEVER overflow:hidden here: it clips the logo top + Arabic
               diacritics + pill borders by 1-2px, which is exactly the
               "مقصوص" artifact in the reported receipt. */
            overflow: visible !important;
            background: #fff !important;
            color: #000 !important;
            font-weight: 800;
            letter-spacing: 0 !important;
            text-rendering: geometricPrecision;
            -webkit-font-smoothing: antialiased;
        }
        .receipt-print-root * {
            box-sizing: border-box !important;
            max-width: 100% !important;
            letter-spacing: 0 !important;
            box-shadow: none !important;
            text-shadow: none !important;
        }
        .receipt-print-root table {
            border-collapse: collapse !important;
        }
        .receipt-print-root img {
            max-width: 100% !important;
            height: auto !important;
        }
    `;
    frameDocument.head.appendChild(thermalOverrideStyle);

    const content = frameDocument.body;
    content.classList.add('receipt-print-root');
    content.style.width = `${widthPx}px`;
    frame.style.height = `${Math.max(content.scrollHeight, 1)}px`;

    try {
        const images = Array.from(content.querySelectorAll('img'));
        await Promise.all(images.map(async (img) => {
            const src = img.getAttribute('src') || '';
            if (!src || src.startsWith('data:')) return;
            img.crossOrigin = 'anonymous';
            try {
                const dataUrl = await Promise.race([
                    fetchImageAsDataUrl(src),
                    new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500)),
                ]);
                if (dataUrl) img.src = dataUrl;
            } catch {
                // Keep the original URL; html2canvas may still be able to load it.
            }
        }));

        await Promise.all(images.map((img) => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 1500);
            });
        }));

        if (frameDocument.fonts?.ready) {
            await frameDocument.fonts.ready;
        }

        // fonts.ready resolves immediately when no font load has STARTED yet
        // (e.g. the @imported Cairo is still in flight on slow/offline links),
        // snapshotting too early prints tofu boxes for Arabic. The global
        // preload usually resolved this long ago; per-receipt wait is now a
        // short 900ms grace so offline devices degrade to Tahoma/Arial
        // (full Arabic coverage) instead of adding seconds to every order.
        try {
            await Promise.race([
                (async () => {
                    try { await preloadReceiptFonts(); } catch { /* ignore */ }
                    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
                })(),
                new Promise((resolve) => setTimeout(resolve, 900)),
            ]);
        } catch {
            // Fallback stack in the receipt CSS already covers Arabic.
        }

        // Render at a higher internal resolution, then normalize back to the
        // printer head width. This avoids blurry browser raster output while
        // keeping the final PNG at the exact thermal width.
        const canvas = await html2canvas(content, {
            width: widthPx,
            windowWidth: widthPx,
            backgroundColor: '#ffffff',
            scale: renderScale,
            useCORS: true,
            logging: false,
        });

        const normalizedCanvas = document.createElement('canvas');
        normalizedCanvas.width = widthPx;
        normalizedCanvas.height = Math.ceil(canvas.height / renderScale);
        const ctx = normalizedCanvas.getContext('2d');
        if (!ctx) throw new Error('FAILED_TO_CREATE_RECEIPT_CANVAS');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, normalizedCanvas.width, normalizedCanvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, normalizedCanvas.width, normalizedCanvas.height);

        // Thermal printers reward contrast, but hard thresholding eats Arabic
        // glyph edges. Boost dark pixels while leaving antialiasing for raster print.
        const imageData = ctx.getImageData(0, 0, normalizedCanvas.width, normalizedCanvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];
            if (alpha === 0) {
                data[i] = data[i + 1] = data[i + 2] = 255;
                data[i + 3] = 255;
                continue;
            }
            const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
            const value = luminance > 238
                ? 255
                : Math.max(0, Math.round((luminance - 28) * 0.72));
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);

        // Convert to base64 PNG
        const dataUrl = normalizedCanvas.toDataURL('image/png');
        // Strip the data:image/png;base64, prefix
        return dataUrl.replace(/^data:image\/png;base64,/, '');
    } finally {
        frame.remove();
    }
};

/**
 * Convenience: given HTML receipt + printer paper size, render and return
 * a payload ready to send to the print bridge.
 */
export const createImagePrintPayload = async (
    html: string,
    paperWidth: '58mm' | '80mm' = '80mm'
): Promise<{ content: string; contentType: 'image' }> => {
    const widthPx = paperWidth === '58mm' ? 384 : 576;
    const base64Image = await renderReceiptToImage(html, widthPx);
    return {
        content: base64Image,
        contentType: 'image',
    };
};
