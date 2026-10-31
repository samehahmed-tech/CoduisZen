export const canAccessFinanceException = (input: {
    effectiveBranchId?: string | null;
    exceptionBranchId?: string | null;
    role?: string | null;
}): boolean => {
    if (String(input.role || '').toUpperCase() === 'SUPER_ADMIN') return true;
    const branch = String(input.effectiveBranchId || '').trim();
    const exceptionBranch = String(input.exceptionBranchId || '').trim();
    return Boolean(branch && exceptionBranch && branch === exceptionBranch);
};

export const sanitizeFinanceException = (exception: any) => ({
    id: exception?.id,
    reference: exception?.reference,
    referenceType: exception?.referenceType,
    branchId: exception?.branchId,
    reason: exception?.reason,
    status: exception?.status,
    resolvedBy: exception?.resolvedBy,
    resolvedAt: exception?.resolvedAt,
    resolutionNotes: exception?.resolutionNotes,
    createdAt: exception?.createdAt,
    updatedAt: exception?.updatedAt,
});

export const canRetryFinanceExceptionStatus = (status?: string | null): boolean =>
    String(status || '').toUpperCase() === 'PENDING' || String(status || '').toUpperCase() === 'DEAD_LETTER';
