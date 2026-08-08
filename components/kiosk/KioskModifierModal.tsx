import React, { useMemo, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import { MenuItem, ModifierOption } from '../../types';

interface KioskModifierModalProps {
  item: MenuItem;
  onClose: () => void;
  onConfirm: (item: MenuItem, selectedModifiers: any[], quantity: number) => void;
  lang: string;
  currency: string;
}

const KioskModifierModal: React.FC<KioskModifierModalProps> = ({ item, onClose, onConfirm, lang, currency }) => {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const isAr = lang === 'ar';
  const tr = (en: string, ar: string) => isAr ? ar : en;

  const toggleOption = (groupId: string, option: ModifierOption, maxSelection: number) => {
    setSelections(currentSelections => {
      const current = currentSelections[groupId] || [];
      if (current.includes(option.id)) {
        setError('');
        return { ...currentSelections, [groupId]: current.filter(id => id !== option.id) };
      }
      if (maxSelection === 1) {
        setError('');
        return { ...currentSelections, [groupId]: [option.id] };
      }
      if (current.length >= maxSelection) {
        setError(tr(`Choose up to ${maxSelection} options.`, `اختار بحد أقصى ${maxSelection}.`));
        return currentSelections;
      }
      setError('');
      return { ...currentSelections, [groupId]: [...current, option.id] };
    });
  };

  const selectedModifiers = useMemo(() => (
    Object.entries(selections).flatMap(([groupId, optionIds]) => {
      const group = item.modifierGroups?.find(candidate => candidate.id === groupId);
      return optionIds.flatMap(optionId => {
        const option = group?.options.find(candidate => candidate.id === optionId);
        return option ? [{ ...option, groupId }] : [];
      });
    })
  ), [item.modifierGroups, selections]);

  const total = useMemo(() => (
    (Number(item.price || 0) + selectedModifiers.reduce((sum, option) => sum + Number(option.price || 0), 0)) * quantity
  ), [item.price, quantity, selectedModifiers]);

  const confirm = () => {
    const missingGroup = (item.modifierGroups || []).find(group => (
      (selections[group.id]?.length || 0) < Number(group.minSelection || 0)
    ));
    if (missingGroup) {
      const groupName = isAr ? missingGroup.nameAr || missingGroup.name : missingGroup.name;
      setError(tr(`Complete the required choices in ${groupName}.`, `كمل الاختيارات المطلوبة في ${groupName}.`));
      return;
    }
    onConfirm(item, selectedModifiers, quantity);
  };

  return (
    <div className="kiosk-modifier-overlay" role="dialog" aria-modal="true" aria-labelledby="kiosk-modifier-title">
      <section className="kiosk-modifier-panel">
        <header>
          <div className="kiosk-modifier-product">
            {item.image ? <img src={item.image} alt="" /> : null}
            <div>
              <p className="kiosk-eyebrow">{tr('Customize item', 'ظبط الصنف')}</p>
              <h2 id="kiosk-modifier-title">{isAr ? item.nameAr || item.name : item.name}</h2>
              <span>{Number(item.price || 0).toLocaleString()} {currency}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={tr('Close', 'إغلاق')} className="kiosk-close-button"><X size={26} /></button>
        </header>

        <div className="kiosk-modifier-content">
          {(item.modifierGroups || []).map(group => {
            const selectedCount = selections[group.id]?.length || 0;
            const minSelection = Number(group.minSelection || 0);
            const maxSelection = Math.max(1, Number(group.maxSelection || 1));
            return (
              <fieldset key={group.id} className="kiosk-modifier-group">
                <legend>
                  <span>{isAr ? group.nameAr || group.name : group.name}</span>
                  <small>{minSelection > 0 ? tr(`Required · ${minSelection}–${maxSelection}`, `مطلوب · من ${minSelection} إلى ${maxSelection}`) : tr(`Up to ${maxSelection}`, `حتى ${maxSelection}`)}</small>
                </legend>
                <div className="kiosk-option-grid">
                  {group.options.filter(option => option.isAvailable !== false).map(option => {
                    const selected = selections[group.id]?.includes(option.id) || false;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleOption(group.id, option, maxSelection)}
                      >
                        <span className="kiosk-option-check">{selected ? <Check size={20} /> : null}</span>
                        <strong>{isAr ? option.nameAr || option.name : option.name}</strong>
                        <small>{Number(option.price || 0) > 0 ? `+${Number(option.price).toLocaleString()} ${currency}` : tr('No extra charge', 'بدون زيادة')}</small>
                      </button>
                    );
                  })}
                </div>
                <p>{selectedCount} / {maxSelection}</p>
              </fieldset>
            );
          })}

          <section className="kiosk-modifier-quantity">
            <div><strong>{tr('Quantity', 'الكمية')}</strong><span>{tr('Choose how many you want', 'حدد العدد المطلوب')}</span></div>
            <div className="kiosk-quantity-control">
              <button type="button" onClick={() => setQuantity(current => Math.max(1, current - 1))} aria-label={tr('Decrease', 'تقليل')}><Minus size={22} /></button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity(current => Math.min(99, current + 1))} aria-label={tr('Increase', 'زيادة')}><Plus size={22} /></button>
            </div>
          </section>
        </div>

        <footer>
          <div><span>{tr('Item total', 'إجمالي الصنف')}</span><strong>{total.toLocaleString()} {currency}</strong></div>
          <div>
            {error && <p role="alert">{error}</p>}
            <button type="button" onClick={confirm} className="kiosk-primary-action"><Plus size={22} />{tr('Add to order', 'أضف للطلب')}</button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default KioskModifierModal;
