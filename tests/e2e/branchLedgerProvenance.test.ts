import { describe, expect, it } from 'vitest';
import { pool } from '../../server/db';
import { ensureLoyaltySchema } from '../../server/services/loyaltyService';
import { walletService } from '../../server/services/walletService';
import { ensureSupplierSchema } from '../../server/controllers/supplierController';

describe('branch ledger provenance schema', () => {
    it('repairs branch provenance columns on an existing database', async () => {
        await ensureLoyaltySchema();
        await walletService.ensureWalletSchema();
        await ensureSupplierSchema();
        const result = await pool.query(`
            SELECT
                COL_LENGTH(N'dbo.loyalty_ledger', N'branch_id') AS loyaltyBranchLength,
                COL_LENGTH(N'dbo.wallet_transactions', N'branch_id') AS walletBranchLength,
                COL_LENGTH(N'dbo.customer_wallets', N'branch_id') AS walletScopeLength,
                COL_LENGTH(N'dbo.suppliers', N'branch_id') AS supplierBranchLength
        `);
        const row = result.rows[0] as any;
        expect(Number(row.loyaltyBranchLength)).toBeGreaterThan(0);
        expect(Number(row.walletBranchLength)).toBeGreaterThan(0);
        expect(Number(row.walletScopeLength)).toBeGreaterThan(0);
        expect(Number(row.supplierBranchLength)).toBeGreaterThan(0);
    });
});
