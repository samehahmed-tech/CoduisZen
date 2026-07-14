import { pool } from '../db/index.js';

export const toSettingValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    return JSON.stringify(value ?? null);
};

export const parseSettingJson = <T>(value: unknown, fallback: T): T => {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value as T;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

export const upsertSetting = async (input: {
    key: string;
    value: unknown;
    category?: string | null;
    updatedBy?: string | null;
}) => {
    const value = toSettingValue(input.value);
    const category = input.category || 'general';
    const updatedBy = input.updatedBy || null;
    const { rows } = await pool.query(
        `MERGE settings WITH (HOLDLOCK) AS target
         USING (SELECT $1 AS [key], $2 AS [value], $3 AS category, $4 AS updated_by) AS source
         ON target.[key] = source.[key]
         WHEN MATCHED THEN
             UPDATE SET [value] = source.[value], category = source.category, updated_by = source.updated_by, updated_at = GETDATE()
         WHEN NOT MATCHED THEN
             INSERT ([key], [value], category, updated_by, updated_at)
             VALUES (source.[key], source.[value], source.category, source.updated_by, GETDATE())
         OUTPUT INSERTED.*;`,
        [input.key, value, category, updatedBy],
    );
    return rows[0] || { key: input.key, value, category, updated_by: updatedBy };
};
