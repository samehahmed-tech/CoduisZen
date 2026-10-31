export const validateBridgeDeviceScope = (input: {
    existingBranchId?: string | null;
    requestedBranchId: string;
    existingGatewayId?: string | null;
    requestedGatewayId?: string | null;
}) => {
    const existingBranch = String(input.existingBranchId || '').trim();
    const requestedBranch = String(input.requestedBranchId || '').trim();
    if (existingBranch && requestedBranch && existingBranch !== requestedBranch) {
        return { ok: false as const, code: 'DEVICE_BRANCH_MISMATCH' };
    }

    const existingGateway = String(input.existingGatewayId || '').trim();
    const requestedGateway = String(input.requestedGatewayId || '').trim();
    if (existingGateway && requestedGateway && existingGateway !== requestedGateway) {
        return { ok: false as const, code: 'GATEWAY_DEVICE_MISMATCH' };
    }

    return { ok: true as const };
};
