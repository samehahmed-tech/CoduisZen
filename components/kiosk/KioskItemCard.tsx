import React from 'react';
import { ImageOff, Plus } from 'lucide-react';
import { MenuItem } from '../../types';

interface KioskItemCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  lang: string;
  currency: string;
}

const KioskItemCard: React.FC<KioskItemCardProps> = ({ item, onAdd, lang, currency }) => {
  const isAr = lang === 'ar';
  return (
    <button type="button" onClick={() => onAdd(item)} className="kiosk-item-card">
      <div className="kiosk-item-image">
        {item.image ? (
          <img src={item.image} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="kiosk-image-placeholder"><ImageOff size={38} /></div>
        )}
      </div>
      <div className="kiosk-item-body">
        <h3>{isAr ? item.nameAr || item.name : item.name}</h3>
        <p>{isAr ? item.descriptionAr || item.description : item.description}</p>
        <div className="kiosk-item-footer">
          <span className="kiosk-item-price">{Number(item.price || 0).toLocaleString()} {currency}</span>
          <span className="kiosk-add-mark" aria-hidden="true"><Plus size={24} /></span>
        </div>
      </div>
    </button>
  );
};

export default KioskItemCard;
