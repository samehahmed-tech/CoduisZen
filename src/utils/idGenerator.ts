/**
 * Human-Readable ID Generator
 * 
 * Generates clean, readable IDs with meaningful prefixes instead of
 * random alphanumeric strings like "GQ9RARS8".
 * 
 * Format: PREFIX-YYYYMMDD-NNNN
 * Example: ORD-20260419-0042, SFT-20260419-0001
 * 
 * For internal IDs that don't need to be human-readable (like cart items),
 * a simpler format is used.
 */

/** Date portion: YYYYMMDD */
const datePart = (): string => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
};

/** Sequential-like portion: 4-digit number derived from time + random */
const seqPart = (): string => {
    // Combine time-based component with random to avoid collisions
    const timeBased = Date.now() % 10000; // Last 4 digits of timestamp
    const random = Math.floor(Math.random() * 100); // 0-99
    const combined = (timeBased + random) % 10000;
    return String(combined).padStart(4, '0');
};

/** Short random suffix for extra uniqueness */
const shortRandom = (): string => {
    return Math.floor(Math.random() * 1000).toString().padStart(3, '0');
};

/**
 * Generate a human-readable ID with a prefix.
 * Format: PREFIX-YYYYMMDD-NNNN-RRR
 * 
 * @example
 * generateId('ORD')  => "ORD-20260419-3847-012"
 * generateId('SFT')  => "SFT-20260419-5291-087"
 * generateId('INV')  => "INV-20260419-1024-445"
 */
export const generateId = (prefix: string): string => {
    return `${prefix}-${datePart()}-${seqPart()}-${shortRandom()}`;
};

/**
 * Generate an Order ID
 * Format: ORD-YYYYMMDD-NNNN-RRR
 */
export const generateOrderId = (): string => generateId('ORD');

/**
 * Generate a Shift ID
 * Format: SFT-YYYYMMDD-NNNN-RRR
 */
export const generateShiftId = (): string => generateId('SFT');

/**
 * Generate a Payment ID
 * Format: PAY-YYYYMMDD-NNNN-RRR
 */
export const generatePaymentId = (): string => generateId('PAY');

/**
 * Generate a simple internal ID (for cart items, etc.)
 * These don't need to be human-readable.
 */
export const generateInternalId = (): string => {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
};

/**
 * Format an ID for display to users.
 * Prefers orderNumber (sequential) when available, with the readable ID as fallback.
 * 
 * @example
 * formatDisplayId({ orderNumber: 42 })          => "#42"
 * formatDisplayId({ id: "ORD-20260419-3847" })   => "#ORD-20260419-3847"
 * formatDisplayId({ id: "abc123def", orderNumber: 15 }) => "#15"
 */
export const formatDisplayId = (order: { id?: string; orderNumber?: number | string }): string => {
    if (order.orderNumber && Number(order.orderNumber) > 0) {
        return `#${order.orderNumber}`;
    }
    if (order.id) {
        // If the ID already has a readable prefix, show it as-is
        if (order.id.includes('-') && /^[A-Z]{2,5}-/.test(order.id)) {
            return `#${order.id}`;
        }
        // Old-style random ID — show last 8 chars with hash
        return `#${order.id.slice(-8).toUpperCase()}`;
    }
    return '#---';
};
