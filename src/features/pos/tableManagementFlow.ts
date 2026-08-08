export type TableManagementMode =
  | 'ACTIONS'
  | 'TRANSFER_ALL'
  | 'TRANSFER_ITEMS'
  | 'SPLIT'
  | 'MERGE';

export const getTableManagementView = (
  mode: TableManagementMode,
  isSelectingTarget: boolean,
) => {
  if (mode === 'ACTIONS') return 'ACTIONS';
  if ((mode === 'TRANSFER_ITEMS' || mode === 'SPLIT') && !isSelectingTarget) return 'ITEMS';
  return 'TABLES';
};
