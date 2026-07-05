import { Request, Response } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');

/**
 * Trigger a PostgreSQL database backup via pg_dump.
 * Only available to SUPER_ADMIN (enforced at route level).
 * Returns the backup filename on success.
 */
export const triggerBackup = async (_req: Request, res: Response) => {
    try {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            return res.status(500).json({ error: 'DATABASE_URL not configured' });
        }

        // Ensure backup directory exists
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `coduiszen-backup-${timestamp}.sql`;
        const filePath = path.join(BACKUP_DIR, filename);

        // Run pg_dump
        execSync(`pg_dump "${dbUrl}" --no-owner --no-acl -f "${filePath}"`, {
            timeout: 120_000, // 2 minute timeout
            stdio: 'ignore',
        });

        // Get file size
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        logger.info({ filename, sizeMB }, 'Database backup completed');

        res.json({
            ok: true,
            filename,
            size: `${sizeMB} MB`,
            path: filePath,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Database backup failed');
        res.status(500).json({
            error: 'BACKUP_FAILED',
            message: error.message || 'pg_dump failed. Ensure pg_dump is installed and DATABASE_URL is correct.',
        });
    }
};

/**
 * List existing backups with metadata.
 */
export const listBackups = async (_req: Request, res: Response) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            return res.json({ backups: [] });
        }

        const files = fs.readdirSync(BACKUP_DIR)
            .filter((f) => f.endsWith('.sql') || f.endsWith('.sql.gz'))
            .map((f) => {
                const stats = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    filename: f,
                    size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
                    createdAt: stats.birthtime.toISOString(),
                };
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        res.json({ backups: files, directory: BACKUP_DIR });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Download a specific backup file.
 */
export const downloadBackup = async (req: Request, res: Response) => {
    try {
        const filename = String(req.params.filename || '');
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'INVALID_FILENAME' });
        }

        const filePath = path.join(BACKUP_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'BACKUP_NOT_FOUND' });
        }

        res.download(filePath, filename);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
