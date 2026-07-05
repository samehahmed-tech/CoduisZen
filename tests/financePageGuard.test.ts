import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const financePage = readFileSync(resolve(process.cwd(), 'components/Finance.tsx'), 'utf8');
const financeStore = readFileSync(resolve(process.cwd(), 'stores/useFinanceStore.ts'), 'utf8');

describe('finance page operational guardrails', () => {
    it('does not expose an unused branch filter', () => {
        expect(financePage).not.toContain('selectedBranch');
        expect(financePage).not.toContain('allBranches');
        expect(financePage).toContain('ledgerScope');
    });

    it('does not fetch finance data twice on mount', () => {
        expect(financePage).not.toContain('useEffect(() => { fetchFinanceData(); }, [fetchFinanceData]);');
    });

    it('throws action failures so success toasts cannot lie', () => {
        for (const action of ['recordTransaction', 'createReconciliation', 'closePeriod', 'approveJournal', 'reverseJournal']) {
            const start = financeStore.indexOf(`${action}: async`);
            expect(start).toBeGreaterThan(-1);
            const nextAction = financeStore.indexOf('\n\n    ', start + action.length + 1);
            const body = financeStore.slice(start, nextAction > start ? nextAction : undefined);
            expect(body).toContain('throw error;');
        }
    });
});
