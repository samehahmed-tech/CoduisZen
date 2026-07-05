import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../server/db';
import { branches, employees } from '../src/db/schema';
import { hrExtendedService } from '../server/services/hrExtendedService';

describe('HR document vault', () => {
    beforeEach(async () => {
        await db.insert(branches).values({
            id: 'test-doc-branch',
            name: 'Document Branch',
            location: 'Alexandria',
        });
        await db.insert(employees).values({
            id: 'test-doc-employee',
            branchId: 'test-doc-branch',
            employeeCode: 'DOC-100',
            attendanceCode: 'DOC-100',
            name: 'Document Employee',
            role: 'Staff',
            basicSalary: 5000,
        });
    });

    it('stores employee documents and marks near-expiry records', async () => {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 10);

        const created = await hrExtendedService.upsertEmployeeDocument({
            employeeId: 'test-doc-employee',
            branchId: 'test-doc-branch',
            documentType: 'HEALTH_CERTIFICATE',
            title: 'Health Certificate',
            documentNumber: 'HC-123',
            expiryDate,
        });

        const documents = await hrExtendedService.getEmployeeDocuments({
            branchId: 'test-doc-branch',
            expiringWithinDays: 30,
        });

        expect(created.id).toMatch(/^EDOC-/);
        expect(documents).toHaveLength(1);
        expect(documents[0].computedStatus).toBe('EXPIRING_SOON');
        expect(documents[0].daysToExpiry).toBeGreaterThan(0);
    });

    it('archives employee documents without deleting their audit trail', async () => {
        const created = await hrExtendedService.upsertEmployeeDocument({
            employeeId: 'test-doc-employee',
            documentType: 'CONTRACT',
            title: 'Employment Contract',
        });

        await hrExtendedService.archiveEmployeeDocument(created.id);
        const documents = await hrExtendedService.getEmployeeDocuments({
            employeeId: 'test-doc-employee',
        });

        expect(documents).toHaveLength(1);
        expect(documents[0].computedStatus).toBe('ARCHIVED');
    });
});
