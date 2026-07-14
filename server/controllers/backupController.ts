import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import logger from '../utils/logger';
import { createVerifiedDatabaseBackup, getDatabaseBackupDirectory } from '../services/databaseBackupService';

export const triggerBackup = async (_req: Request, res: Response) => {
    try {
        const result = await createVerifiedDatabaseBackup();
        const size = `${(result.bytes / (1024 * 1024)).toFixed(2)} MB`;
        logger.info({ filename: result.filename, size }, 'Verified database backup completed');
        return res.json({
            ok: true,
            filename: result.filename,
            size,
            verified: result.verified,
            timestamp: result.timestamp,
        });
    } catch (error: any) {
        logger.error({ error: error?.message }, 'Database backup failed');
        return res.status(500).json({
            error: 'BACKUP_FAILED',
            message: error?.message || 'SQL Server backup failed.',
        });
    }
};

export const listBackups = async (_req: Request, res: Response) => {
    try {
        const backupDir = getDatabaseBackupDirectory();
        if (!fs.existsSync(backupDir)) return res.json({ backups: [] });

        const backups = fs.readdirSync(backupDir)
            .filter(filename => filename.toLowerCase().endsWith('.bak'))
            .map(filename => {
                const stats = fs.statSync(path.join(backupDir, filename));
                return {
                    filename,
                    size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
                    createdAt: stats.birthtime.toISOString(),
                };
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        return res.json({ backups });
    } catch (error: any) {
        return res.status(500).json({ error: 'BACKUP_LIST_FAILED', message: error?.message });
    }
};

export const downloadBackup = async (req: Request, res: Response) => {
    try {
        const filename = String(req.params.filename || '');
        if (!filename.toLowerCase().endsWith('.bak') || filename !== path.basename(filename)) {
            return res.status(400).json({ error: 'INVALID_FILENAME' });
        }

        const filePath = path.join(getDatabaseBackupDirectory(), filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'BACKUP_NOT_FOUND' });
        return res.download(filePath, filename);
    } catch (error: any) {
        return res.status(500).json({ error: 'BACKUP_DOWNLOAD_FAILED', message: error?.message });
    }
};
