/**
 * Legacy browser fiscal integration.
 * ETA credentials, signing, submission, and status checks must stay server-side.
 */
export const fiscalService = {
    prepareETAReceipt: () => {
        throw new Error('LEGACY_FISCAL_CLIENT_DISABLED: use the authenticated server fiscal API');
    },

    submitToETA: async () => {
        throw new Error('LEGACY_FISCAL_CLIENT_DISABLED: use the authenticated server fiscal API');
    },
};
