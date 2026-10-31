export type OvertimeSource = 'ATTENDANCE' | 'MANUAL_APPROVED' | 'MAX_OF_SOURCES';

export type OvertimeReconciliation = {
    attendanceMinutes: number;
    approvedManualMinutes: number;
    reconciledMinutes: number;
    source: OvertimeSource;
    deltaMinutes: number;
};

export const reconcileOvertime = (attendanceMinutes: number, approvedManualMinutes: number): OvertimeReconciliation => {
    const attendance = Math.max(0, Number(attendanceMinutes) || 0);
    const manual = Math.max(0, Number(approvedManualMinutes) || 0);
    const reconciledMinutes = Math.max(attendance, manual);
    return {
        attendanceMinutes: attendance,
        approvedManualMinutes: manual,
        reconciledMinutes,
        source: attendance === manual ? 'ATTENDANCE' : manual > attendance ? 'MANUAL_APPROVED' : 'MAX_OF_SOURCES',
        deltaMinutes: Math.abs(attendance - manual),
    };
};
