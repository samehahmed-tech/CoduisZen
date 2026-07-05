type TableDisplaySource = {
  tableId?: string | null;
  table_id?: string | null;
  tableName?: string | null;
  table_name?: string | null;
  name?: string | null;
};

export const getTableDisplayName = (source?: TableDisplaySource | string | null) => {
  const rawName = typeof source === 'string'
    ? ''
    : String(source?.tableName || source?.table_name || source?.name || '').trim();
  if (rawName) return rawName;

  const id = String(typeof source === 'string' ? source : source?.tableId || source?.table_id || '').trim();
  if (!id) return '';

  const parts = id.split('-').filter(Boolean);
  const shortNumber = parts.find(part => /^\d{1,4}$/.test(part));
  if (shortNumber) return shortNumber;

  return id.length > 16 ? id.slice(0, 16) : id;
};
