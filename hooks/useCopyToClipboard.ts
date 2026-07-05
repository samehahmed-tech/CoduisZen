import { useState, useCallback } from 'react';

interface CopyResult {
    copied: boolean;
    copy: (text: string) => Promise<void>;
}

/**
 * Hook to copy text to clipboard with feedback.
 * Usage: const { copied, copy } = useCopyToClipboard();
 *        <button onClick={() => copy(orderId)}>{copied ? '✓' : 'Copy'}</button>
 */
export function useCopyToClipboard(resetDelay: number = 2000): CopyResult {
    const [copied, setCopied] = useState(false);

    const copy = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), resetDelay);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), resetDelay);
        }
    }, [resetDelay]);

    return { copied, copy };
}

export default useCopyToClipboard;
