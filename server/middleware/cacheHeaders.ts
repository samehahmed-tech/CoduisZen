import { Request, Response, NextFunction } from 'express';

/**
 * Sets Cache-Control headers for API responses.
 * - GET on public cacheable endpoints: brief stale-while-revalidate window
 * - All other API methods: no-store (never cache mutating requests)
 */
export const apiCacheHeaders = (req: Request, res: Response, next: NextFunction) => {
    // Never cache non-GET requests (POST, PUT, DELETE, PATCH)
    if (req.method !== 'GET') {
        res.setHeader('Cache-Control', 'no-store');
        return next();
    }

    // Short-lived cache for frequently-hit read endpoints
    // stale-while-revalidate lets the browser use a stale response while
    // fetching a fresh one in the background — perceived instant loads.
    const path = req.path.toLowerCase();

    // High-frequency reads: menu, settings, branches — cache 30s, revalidate for 60s
    if (
        path.includes('/menu') ||
        path.includes('/settings') ||
        path.includes('/branches')
    ) {
        res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
        return next();
    }

    // Reports/analytics — cache 60s (data doesn't change every second)
    if (
        path.includes('/reports') ||
        path.includes('/analytics') ||
        path.includes('/dashboard-kpis')
    ) {
        res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
        return next();
    }

    // Default: don't cache dynamic GET endpoints (orders, shifts, etc.)
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
};
