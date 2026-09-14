import { MenuItem } from '@/types';

export type SelectedModifier = {
  id: string;
  groupName: string;
  optionName: string;
  price: number;
};

type SelectedModsMap = Record<string, Set<string>>;

/**
 * Flattens the modal's per-group selection map into the normalized
 * modifier list shape consumed by cartMerge and the POS order flow.
 */
export const buildSelectedModifiers = (
  item: MenuItem,
  selectedMods: SelectedModsMap,
): SelectedModifier[] => {
  const finalMods: SelectedModifier[] = [];
  if (!item?.modifierGroups) return finalMods;
  for (const group of item.modifierGroups) {
    const selectedSet = selectedMods[group.id];
    if (!selectedSet) continue;
    for (const optId of selectedSet) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) {
        finalMods.push({
          id: opt.id,
          groupName: group.name,
          optionName: opt.name,
          price: opt.price,
        });
      }
    }
  }
  return finalMods;
};
