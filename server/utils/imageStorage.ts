import fs from 'fs';
import path from 'path';

const programData = process.env.ProgramData || process.env.PROGRAMDATA;

export const uploadsDirectory = programData
    ? path.join(programData, 'Sameh', 'RestoFlow ERP', 'uploads')
    : path.resolve(process.cwd(), 'uploads');

export const normalizeImageId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : null;
};

export const localImageKey = (id: string, extension: string) => `${id}.${extension}`;
export const localImageUrl = (key: string) => `/uploads/${encodeURIComponent(key)}`;

export const resolveLocalImagePath = (key: string): string | null => {
    const fileName = path.basename(key);
    if (fileName !== key || !/^[A-Za-z0-9_-]{1,120}\.(?:jpg|png|webp|gif)$/.test(fileName)) return null;

    const resolved = path.resolve(uploadsDirectory, fileName);
    return path.dirname(resolved) === path.resolve(uploadsDirectory) ? resolved : null;
};

export const ensureUploadsDirectory = () => {
    fs.mkdirSync(uploadsDirectory, { recursive: true });
};
