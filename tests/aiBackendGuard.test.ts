import { describe, it, expect } from 'vitest';
import { evaluateActionAuthorization } from '../server/services/aiPolicy';

describe('ai backend policy guard', () => {
    it('rejects unsupported action types', () => {
        const result = evaluateActionAuthorization(
            { id: 'u1', role: 'SUPER_ADMIN', permissions: [] },
            'DROP_DATABASE',
        );
        expect(result.ok).toBe(false);
        expect(result.code).toBe('UNSAFE_ACTION_TYPE');
    });

    it('rejects when required permission is missing', () => {
        const result = evaluateActionAuthorization(
            { id: 'u2', role: 'BRANCH_MANAGER', permissions: ['NAV_REPORTS'] },
            'UPDATE_MENU_ITEM',
        );
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('allows valid role + permission', () => {
        const result = evaluateActionAuthorization(
            { id: 'u3', role: 'BRANCH_MANAGER', permissions: ['CFG_EDIT_MENU_PRICING'] },
            'UPDATE_MENU_ITEM',
        );
        expect(result.ok).toBe(true);
    });

    it('allows HR manager to run HR-scoped AI actions', () => {
        const result = evaluateActionAuthorization(
            { id: 'u4', role: 'HR_MANAGER', permissions: ['NAV_PEOPLE', 'NAV_PAYROLL'] },
            'CREATE_EMPLOYEE',
        );
        expect(result.ok).toBe(true);
    });

    it('rejects HR payroll action without payroll permission', () => {
        const result = evaluateActionAuthorization(
            { id: 'u5', role: 'HR_MANAGER', permissions: ['NAV_ATTENDANCE'] },
            'CREATE_EMPLOYEE_LOAN',
        );
        expect(result.ok).toBe(false);
        expect(result.code).toBe('INSUFFICIENT_PERMISSION');
    });
});
