import path from 'path';
import { describe, expect, it } from 'vitest';

import {
    localImageKey,
    localImageUrl,
    normalizeImageId,
    resolveLocalImagePath,
    uploadsDirectory,
} from '../server/utils/imageStorage';

describe('local image storage', () => {
    it('accepts generated image ids and rejects traversal', () => {
        expect(normalizeImageId('img-123_safe')).toBe('img-123_safe');
        expect(normalizeImageId('../settings')).toBeNull();
        expect(normalizeImageId('image/name')).toBeNull();
    });

    it('keeps local image files inside the uploads directory', () => {
        const key = localImageKey('img-123_safe', 'webp');
        const resolved = resolveLocalImagePath(key);

        expect(resolved).toBe(path.join(uploadsDirectory, key));
        expect(resolveLocalImagePath('../img.webp')).toBeNull();
        expect(resolveLocalImagePath('img.svg')).toBeNull();
        expect(localImageUrl(key)).toBe('/uploads/img-123_safe.webp');
    });
});
