// Image Service - Smart Compression & Upload
// Handles image uploads with automatic resizing based on usage type

import { apiRequest } from './api/core';

// ============================================================================
// IMAGE SIZE PRESETS (width x height)
// ============================================================================

export const IMAGE_PRESETS = {
    // Category tab thumbnails
    category: { width: 256, height: 256, quality: 0.85 },
    // Menu item cards
    item: { width: 400, height: 400, quality: 0.85 },
    // Large item view / detail
    item_large: { width: 800, height: 800, quality: 0.9 },
    // Customer avatar
    customer: { width: 128, height: 128, quality: 0.8 },
    // Logo / brand
    logo: { width: 512, height: 512, quality: 0.9 },
    // Banner / cover
    banner: { width: 1200, height: 400, quality: 0.85 },
    // Thumbnail
    thumbnail: { width: 128, height: 128, quality: 0.75 },
    // Default
    other: { width: 600, height: 600, quality: 0.8 },
} as const;

export type ImagePresetType = keyof typeof IMAGE_PRESETS;

export interface UploadedImage {
    id: string;
    filename: string;
    url: string;
    width: number;
    height: number;
    size: number;
    contentType: string;
    createdAt: Date;
}

// ============================================================================
// SMART IMAGE COMPRESSION
// ============================================================================

/**
 * Compress and resize image while maintaining aspect ratio
 * Uses "cover" strategy - fills the target dimensions, cropping if needed
 */
export const compressImage = async (
    file: File | Blob,
    type: ImagePresetType = 'other',
    options?: { fitMode?: 'cover' | 'contain' | 'fill' }
): Promise<{ data: string; width: number; height: number; size: number }> => {
    const preset = IMAGE_PRESETS[type];
    const fitMode = options?.fitMode || 'cover';

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file instanceof File ? file : file);

        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target?.result as string;

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }

                let { width: targetW, height: targetH } = preset;
                const sourceW = img.width;
                const sourceH = img.height;
                const sourceRatio = sourceW / sourceH;
                const targetRatio = targetW / targetH;

                let drawX = 0, drawY = 0, drawW = targetW, drawH = targetH;
                let srcX = 0, srcY = 0, srcW = sourceW, srcH = sourceH;

                if (fitMode === 'cover') {
                    // Cover: fill canvas, crop excess
                    if (sourceRatio > targetRatio) {
                        // Source is wider - crop sides
                        srcW = sourceH * targetRatio;
                        srcX = (sourceW - srcW) / 2;
                    } else {
                        // Source is taller - crop top/bottom
                        srcH = sourceW / targetRatio;
                        srcY = (sourceH - srcH) / 2;
                    }
                    canvas.width = targetW;
                    canvas.height = targetH;
                } else if (fitMode === 'contain') {
                    // Contain: fit entire image, may have letterboxing
                    if (sourceRatio > targetRatio) {
                        drawH = targetW / sourceRatio;
                        drawY = (targetH - drawH) / 2;
                    } else {
                        drawW = targetH * sourceRatio;
                        drawX = (targetW - drawW) / 2;
                    }
                    canvas.width = targetW;
                    canvas.height = targetH;
                    // Fill background with transparent
                    ctx.fillStyle = 'transparent';
                    ctx.fillRect(0, 0, targetW, targetH);
                } else {
                    // Fill: stretch to fit (not recommended)
                    canvas.width = targetW;
                    canvas.height = targetH;
                }

                // Apply high-quality scaling
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw the image
                if (fitMode === 'cover') {
                    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
                } else if (fitMode === 'contain') {
                    ctx.drawImage(img, 0, 0, sourceW, sourceH, drawX, drawY, drawW, drawH);
                } else {
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                }

                // Convert to WebP for better compression (fallback to JPEG if not supported)
                let dataUrl: string;
                const webpData = canvas.toDataURL('image/webp', preset.quality);

                if (webpData.startsWith('data:image/webp')) {
                    dataUrl = webpData;
                } else {
                    // Fallback to JPEG
                    dataUrl = canvas.toDataURL('image/jpeg', preset.quality);
                }

                // Calculate approximate size in bytes
                const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
                const sizeBytes = Math.round((base64Length * 3) / 4);

                resolve({
                    data: dataUrl,
                    width: canvas.width,
                    height: canvas.height,
                    size: sizeBytes,
                });
            };

            img.onerror = () => reject(new Error('Failed to load image'));
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
    });
};

/**
 * Generate multiple sizes for an image (for responsive loading)
 */
export const generateImageSizes = async (
    file: File,
    types: ImagePresetType[] = ['thumbnail', 'item', 'item_large']
): Promise<Map<ImagePresetType, string>> => {
    const results = new Map<ImagePresetType, string>();

    for (const type of types) {
        try {
            const { data } = await compressImage(file, type);
            results.set(type, data);
        } catch (error) {}
    }

    return results;
};

// ============================================================================
// FILE HELPERS
// ============================================================================

/**
 * Convert file to base64 without compression
 */
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

/**
 * Get file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * Validate image file
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 10 * 1024 * 1024; // 10MB max upload

    if (!validTypes.includes(file.type)) {
        return { valid: false, error: 'نوع الملف غير مدعوم. استخدم JPG, PNG, WebP أو GIF' };
    }

    if (file.size > maxSize) {
        return { valid: false, error: 'حجم الملف كبير جداً. الحد الأقصى 10 MB' };
    }

    return { valid: true };
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Upload image to server with automatic compression
 */
export const uploadImage = async (
    file: File,
    type: ImagePresetType = 'other'
): Promise<{ url: string; id: string; width: number; height: number; size: number }> => {
    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    try {
        // Compress image
        const { data, width, height, size } = await compressImage(file, type, { fitMode: 'cover' });

        const result = await apiRequest<{ url?: string; id: string }>('/images', {
            method: 'POST',
            body: JSON.stringify({
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                filename: file.name,
                data: data,
                contentType: 'image/webp',
                type,
                width,
                height,
                size,
            }),
        });

        return {
            url: result.url || data,
            id: result.id,
            width,
            height,
            size,
        };
    } catch (error: any) {
        // Fallback: return compressed base64 directly (works offline)
        const { data, width, height, size } = await compressImage(file, type, { fitMode: 'cover' });
        return {
            url: data,
            id: `local-${Date.now()}`,
            width,
            height,
            size,
        };
    }
};

/**
 * Get image from server
 */
export const getImage = async (id: string): Promise<string | null> => {
    try {
        const data = await apiRequest<{ url?: string; data?: string }>(`/images/${encodeURIComponent(id)}`);
        return data.url || data.data;
    } catch {
        return null;
    }
};

/**
 * Delete image from server
 */
export const deleteImage = async (id: string): Promise<boolean> => {
    try {
        await apiRequest(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return true;
    } catch {
        return false;
    }
};

export default {
    uploadImage,
    getImage,
    deleteImage,
    fileToBase64,
    compressImage,
    validateImageFile,
    formatFileSize,
    generateImageSizes,
    IMAGE_PRESETS,
};
