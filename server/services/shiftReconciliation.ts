const shiftValidationError = (code: string) => {
    const error: any = new Error(code);
    error.code = code;
    error.status = 400;
    return error;
};

export const parseNonNegativeShiftAmount = (value: unknown, requiredCode: string) => {
    if (value === undefined || value === null || value === '') {
        throw shiftValidationError(requiredCode);
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw shiftValidationError('INVALID_CASH_BALANCE');
    }
    return amount;
};

export const requireShiftVarianceReason = (
    actualBalance: number,
    expectedBalance: number,
    notes?: unknown,
) => {
    const variance = actualBalance - expectedBalance;
    if (Math.abs(variance) > 1 && !String(notes || '').trim()) {
        throw shiftValidationError('VARIANCE_REASON_REQUIRED');
    }
    return variance;
};
