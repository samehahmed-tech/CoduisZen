import { describe, expect, it } from 'vitest';
import { getTableManagementView } from '../src/features/pos/tableManagementFlow';
import { findActiveTableOrder } from '../utils/tableOrder';

describe('table management flow', () => {
  it('opens item selection before target selection for partial moves', () => {
    expect(getTableManagementView('TRANSFER_ITEMS', false)).toBe('ITEMS');
    expect(getTableManagementView('SPLIT', false)).toBe('ITEMS');
  });

  it('opens table selection for whole transfer and merge', () => {
    expect(getTableManagementView('TRANSFER_ALL', false)).toBe('TABLES');
    expect(getTableManagementView('MERGE', false)).toBe('TABLES');
  });

  it('advances partial moves to table selection', () => {
    expect(getTableManagementView('TRANSFER_ITEMS', true)).toBe('TABLES');
    expect(getTableManagementView('SPLIT', true)).toBe('TABLES');
  });

  it('ignores stale orders when table has no current order reference', () => {
    const tables = [{ id: 'table-3', status: 'AVAILABLE', currentOrderId: null }] as any;
    const orders = [{ id: 'old-order', tableId: 'table-3', status: 'PENDING' }] as any;
    expect(findActiveTableOrder(orders, tables, 'table-3')).toBeUndefined();
  });
});
