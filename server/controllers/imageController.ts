import { Request, Response } from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../db';
import { images } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getStringParam } from '../utils/request';

const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true' || !!S3_ENDPOINT;

const s3 = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: S3_FORCE_PATH_STYLE,
    credentials: S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY ? {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
    } : undefined,
});

const contentTypeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
};

const buildPublicUrl = (key: string) => {
    if (S3_PUBLIC_URL) return `${S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    if (S3_ENDPOINT) return `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${key}`;
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
};

const decodeBase64 = (data: string) => {
    const match = data.match(/^data:(.+);base64,(.+)$/);
    if (match) {
        return {
            buffer: Buffer.from(match[2], 'base64'),
            contentType: match[1],
        };
    }
    return {
        buffer: Buffer.from(data, 'base64'),
        contentType: 'application/octet-stream',
    };
};

export const uploadImage = async (req: Request, res: Response) => {
    try {
        const { id, filename, data, contentType, width, height, size } = req.body || {};

        if (!S3_BUCKET) {
            return res.status(500).json({ error: 'S3_BUCKET is not configured' });
        }
        if (!id || !data) {
            return res.status(400).json({ error: 'id and data are required' });
        }

        const decoded = decodeBase64(data);
        const finalContentType = contentType || decoded.contentType;
        const ext = contentTypeToExt[finalContentType] || 'bin';
        const key = `images/${id}.${ext}`;

        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: decoded.buffer,
            ContentType: finalContentType,
        }));

        const url = buildPublicUrl(key);

        await db.insert(images).values({
            id,
            key,
            url,
            filename,
            contentType: finalContentType,
            width,
            height,
            size,
            createdAt: new Date(),
        }).onConflictDoUpdate({
            target: images.id,
            set: {
                key,
                url,
                filename,
                contentType: finalContentType,
                width,
                height,
                size,
            }
        });

        res.status(201).json({ id, url, width, height, size });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getImage = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'IMAGE_ID_REQUIRED' });
        const [record] = await db.select().from(images).where(eq(images.id, id));
        if (!record) return res.status(404).json({ error: 'Image not found' });

        res.json({
            id: record.id,
            url: record.url,
            filename: record.filename,
            contentType: record.contentType,
            width: record.width,
            height: record.height,
            size: record.size,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteImage = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'IMAGE_ID_REQUIRED' });
        const [record] = await db.select().from(images).where(eq(images.id, id));
        if (!record) return res.status(404).json({ error: 'Image not found' });

        if (S3_BUCKET) {
            await s3.send(new DeleteObjectCommand({
                Bucket: S3_BUCKET,
                Key: record.key,
            }));
        }

        await db.delete(images).where(eq(images.id, id));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
