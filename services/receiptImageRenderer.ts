/* ═══════════════════════════════════════════════════════════════════════════
   Receipt Image Renderer — renders HTML receipt to base64 PNG for thermal
   printers. Enables full Arabic + styled printing via raster mode.
   ═══════════════════════════════════════════════════════════════════════════ */

import html2canvas from 'html2canvas';

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
    const renderScale = 3;
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
            padding: ${widthPx <= 384 ? 5 : 6}px ${widthPx <= 384 ? 5 : 6}px 8px !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
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
        .receipt-print-root > * {
            width: 100% !important;
        }
        .receipt-print-root table {
            border-collapse: collapse !important;
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
                const response = await fetch(src, { mode: 'cors' });
                if (!response.ok) return;
                const blob = await response.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ''));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });
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
        // snapshotting too early prints tofu boxes for Arabic. Explicitly pull
        // the faces we print with — with a timeout so offline devices degrade
        // to Tahoma/Arial (full Arabic coverage) instead of hanging.
        try {
            const fonts = frameDocument.fonts as unknown as {
                load?: (font: string, text?: string) => Promise<unknown[]>;
            };
            if (fonts?.load) {
                const sample = 'شكرا لزيارتكم 0123456789 Paid';
                await Promise.race([
                    Promise.all([
                        fonts.load('800 23px Cairo', sample),
                        fonts.load('900 23px Cairo', sample),
                    ]),
                    new Promise((resolve) => setTimeout(resolve, 2500)),
                ]);
            }
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
