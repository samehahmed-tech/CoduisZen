import { useEffect } from 'react';

/**
 * Updates the favicon with a notification badge count.
 * When count is 0, the original favicon is restored.
 *
 * Usage: useFaviconBadge(unreadCount);
 */
export function useFaviconBadge(count: number) {
    useEffect(() => {
        const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
        if (!link) return;

        if (count <= 0) {
            link.href = '/logo.png';
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo.png';
        img.onload = () => {
            ctx.drawImage(img, 0, 0, 64, 64);

            // Red badge
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(52, 12, 12, 0, Math.PI * 2);
            ctx.fill();

            // White border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(52, 12, 12, 0, Math.PI * 2);
            ctx.stroke();

            // Count text
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(count > 9 ? '9+' : String(count), 52, 13);

            link.href = canvas.toDataURL('image/png');
        };
    }, [count]);
}

export default useFaviconBadge;
