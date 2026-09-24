/**
 * userAvatars — local (per-terminal) storage for user profile photos.
 *
 * The `users` table has no avatar column, so photos are stored as compressed
 * data-URLs in localStorage keyed by user id. They merge into `User.avatar`
 * at the store layer, so every UI that reads `user.avatar` just works —
 * including offline. When a server-side avatar column lands one day,
 * `resolveAvatar(serverValue, userId)` already prefers the server value.
 */

const STORAGE_KEY = 'coduiszen_user_avatars_v1';
const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.82;
const MAX_STORED_CHARS = 280_000; // ~200KB per photo keeps localStorage safe

type AvatarMap = Record<string, string>;

function readMap(): AvatarMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as AvatarMap) : {};
    } catch {
        return {};
    }
}

function writeMap(map: AvatarMap) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Quota exceeded — drop the largest entry and retry once.
        try {
            const entries = Object.entries(map).sort((a, b) => b[1].length - a[1].length);
            if (entries.length > 1) {
                const trimmed = Object.fromEntries(entries.slice(1));
                localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
            }
        } catch {
            // ignore — avatar is cosmetic, never break the app
        }
    }
}

/** Local photo for a user id, if one was set from settings on this terminal. */
export function getUserAvatar(userId?: string | null): string | undefined {
    if (!userId) return undefined;
    return readMap()[String(userId)] || undefined;
}

/** Persist (or clear with `null`) a user's local photo. */
export function setUserAvatar(userId: string, dataUrl: string | null) {
    if (!userId) return;
    const map = readMap();
    if (dataUrl) map[String(userId)] = dataUrl;
    else delete map[String(userId)];
    writeMap(map);
}

/**
 * Effective avatar: server value wins (when present), otherwise the
 * terminal-local photo set from user settings.
 */
export function resolveAvatar(serverValue: unknown, userId?: string | null): string | undefined {
    const server = String(serverValue || '').trim();
    if (server) return server;
    return getUserAvatar(userId);
}

/** Merge local avatars into a user list (used by the auth store). */
export function withLocalAvatars<T extends { id: string; avatar?: string }>(users: T[]): T[] {
    const map = readMap();
    if (!Object.keys(map).length) return users;
    let changed = false;
    const merged = users.map((u) => {
        const local = u?.id ? map[String(u.id)] : undefined;
        if (local && !u.avatar) {
            changed = true;
            return { ...u, avatar: local };
        }
        return u;
    });
    return changed ? merged : users;
}

/**
 * Convert an uploaded image file to a small compressed data-URL
 * suitable for localStorage. Rejects oversized/invalid files.
 */
export function fileToAvatarDataUrl(file: File): Promise<string> {
    const okType = file.type.startsWith('image/');
    if (!okType) return Promise.reject(new Error('INVALID_IMAGE_TYPE'));
    if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('IMAGE_TOO_LARGE'));

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height, 1));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                let dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
                // Safety: downscale once more if still too big for storage.
                if (dataUrl.length > MAX_STORED_CHARS) {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                }
                resolve(dataUrl);
            } catch (err) {
                URL.revokeObjectURL(url);
                reject(err);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('IMAGE_UNREADABLE'));
        };
        img.src = url;
    });
}
