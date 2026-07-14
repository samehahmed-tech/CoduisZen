import { Response } from 'express';

const getErrorText = (error: any) => [
    error?.message,
    error?.originalError?.message,
    error?.precedingErrors?.map((e: any) => e?.message).join(' '),
    error?.cause?.message,
].filter(Boolean).join(' ');

export const isForeignKeyDeleteError = (error: any) => {
    const text = getErrorText(error);
    return error?.code === '23503'
        || error?.number === 547
        || error?.originalError?.number === 547
        || /REFERENCE constraint|foreign key constraint|violates foreign key constraint/i.test(text);
};

export const writeForeignKeyDeleteConflict = (
    res: Response,
    noun = 'record',
    linkedTables?: string[],
) => res.status(409).json({
    code: 'RECORD_HAS_LINKED_DATA',
    error: 'RECORD_HAS_LINKED_DATA',
    message: `Cannot delete this ${noun} because it is linked to operational data. Archive/deactivate it instead.`,
    messageAr: `لا يمكن حذف هذا السجل لأنه مرتبط ببيانات تشغيل. استخدم الأرشفة أو التعطيل بدل الحذف.`,
    linkedTables,
});
