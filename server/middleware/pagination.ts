/**
 * Pagination Middleware & Utilities
 * Provides standardized pagination for all list endpoints.
 *
 * Usage in controller:
 *   import { parsePagination, paginatedResponse } from '../middleware/pagination';
 *   const { page, limit, offset } = parsePagination(req);
 *   const [items, total] = await Promise.all([
 *     db.select().from(table).limit(limit).offset(offset),
 *     db.select({ count: sql`count(*)` }).from(table),
 *   ]);
 *   res.json(paginatedResponse(items, total, page, limit));
 */

import { Request } from 'express';

export interface PaginationParams {
    page: number;
    limit: number;
    offset: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const MIN_LIMIT = 1;

/**
 * Parse pagination parameters from request query.
 * Supports: ?page=1&limit=50 or ?offset=0&limit=50
 */
export function parsePagination(req: Request, defaultLimit = DEFAULT_LIMIT): PaginationParams {
    const rawPage = Number(req.query.page);
    const rawLimit = Number(req.query.limit || req.query.per_page || req.query.pageSize);
    const rawOffset = Number(req.query.offset);

    const limit = Number.isFinite(rawLimit) && rawLimit >= MIN_LIMIT
        ? Math.min(rawLimit, MAX_LIMIT)
        : defaultLimit;

    let page: number;
    let offset: number;

    if (Number.isFinite(rawOffset) && rawOffset >= 0) {
        offset = Math.floor(rawOffset);
        page = Math.floor(offset / limit) + 1;
    } else {
        page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
        offset = (page - 1) * limit;
    }

    return { page, limit, offset };
}

/**
 * Build a standardized paginated response object.
 */
export function paginatedResponse<T>(
    data: T[],
    total: number | { count?: number | string }[],
    page: number,
    limit: number
): PaginatedResponse<T> {
    const totalCount = typeof total === 'number'
        ? total
        : Number((total as any)?.[0]?.count || 0);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
        data,
        pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    };
}

/**
 * Quick helper: apply LIMIT and OFFSET to a Drizzle query builder.
 * Note: Drizzle uses .limit() and .offset() methods on select queries.
 */
export function paginationSQL(params: PaginationParams) {
    return { limit: params.limit, offset: params.offset };
}

// ============================================================================
// Cursor-based Pagination (Item 13)
// ============================================================================

export interface CursorPaginationParams {
    limit: number;
    cursor?: string; // Opaque base64-encoded cursor
    direction: 'next' | 'prev';
}

export interface CursorMeta {
    createdAt: string;
    id: string;
}

export interface CursorPaginatedResponse<T> {
    data: T[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        prevCursor: string | null;
        hasMore: boolean;
    };
}

/**
 * Parse cursor pagination params from request query.
 * Supports: ?limit=50&cursor=<opaque>&direction=next
 */
export function parseCursorPagination(req: Request, defaultLimit = DEFAULT_LIMIT): CursorPaginationParams {
    const rawLimit = Number(req.query.limit || req.query.per_page || req.query.pageSize);
    const limit = Number.isFinite(rawLimit) && rawLimit >= MIN_LIMIT
        ? Math.min(rawLimit, MAX_LIMIT)
        : defaultLimit;

    const cursor = req.query.cursor as string | undefined;
    const direction = (req.query.direction as string) === 'prev' ? 'prev' : 'next';

    return { limit, cursor: cursor || undefined, direction };
}

/**
 * Encode a cursor from createdAt + id.
 */
export function encodeCursor(createdAt: Date | string, id: string): string {
    const ts = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
    return Buffer.from(`${ts}|${id}`).toString('base64url');
}

/**
 * Decode a cursor into { createdAt, id }.
 */
export function decodeCursor(cursor: string): CursorMeta | null {
    try {
        const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
        const [createdAt, id] = decoded.split('|');
        if (!createdAt || !id) return null;
        return { createdAt, id };
    } catch {
        return null;
    }
}

/**
 * Build a cursor-paginated response.
 */
export function cursorPaginatedResponse<T extends { id: string; createdAt: Date | string | null }>(
    data: T[],
    limit: number,
): CursorPaginatedResponse<T> {
    const hasMore = data.length > limit;
    const trimmed = hasMore ? data.slice(0, limit) : data;

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];

    return {
        data: trimmed,
        pagination: {
            limit,
            nextCursor: last && hasMore ? encodeCursor(last.createdAt || new Date(), last.id) : null,
            prevCursor: first ? encodeCursor(first.createdAt || new Date(), first.id) : null,
            hasMore,
        },
    };
}
