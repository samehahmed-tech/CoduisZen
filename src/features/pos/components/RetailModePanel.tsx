import React, { useRef, useEffect } from 'react';
import { ShoppingBag, Box, ScanLine, Tag } from 'lucide-react';
import { MenuItem } from '@/types';

interface RetailModePanelProps {
  cartItems: any[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lang: string;
  t: any;
  currencySymbol: string;
  onAddItem: (item: any) => void;
  pricedItems?: MenuItem[];
}

const RetailModePanel: React.FC<RetailModePanelProps> = ({
  cartItems,
  searchQuery,
  onSearchChange,
  lang,
  t,
  currencySymbol,
  onAddItem,
  pricedItems = [],
}) => {
  const isRTL = lang === 'ar';
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount and after successful scan
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(focusTimer);
  }, []);

  const recentlyScanned = cartItems.slice().reverse().slice(0, 8); // show last 8 items

  return (
    <div className="flex-1 flex flex-col h-full bg-app">
      {/* Search Header */}
      <div className="border-b border-border/10 bg-card/60 p-4 shrink-0">
         <div className="flex items-center gap-3 bg-app border-2 border-primary/20 focus-within:border-primary rounded-xl px-4 py-3 shadow-inner transition-colors">
            <ScanLine className="text-primary animate-pulse" size={24} />
            <input
               ref={inputRef}
               type="text"
               className="flex-1 bg-transparent border-none outline-none text-lg font-bold placeholder:text-muted/60"
               placeholder={isRTL ? 'امسح الباركود أو ابحث عن الصنف...' : 'Scan barcode or search item...'}
               value={searchQuery}
               onChange={(e) => onSearchChange(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim().length > 0) {
                      const query = searchQuery.trim().toLowerCase();
                      const item = pricedItems.find(i => 
                          (i.barcode && i.barcode.toLowerCase() === query) || 
                          (i.sku && i.sku.toLowerCase() === query)
                      );
                      if (item) {
                          onAddItem(item);
                          onSearchChange(''); // Clear instantly to be ready for next barcode
                      } else {
                          // Flash red if not found
                          if (inputRef.current) {
                              inputRef.current.parentElement?.classList.add('border-rose-500', 'bg-rose-500/5');
                              setTimeout(() => {
                                  inputRef.current?.parentElement?.classList.remove('border-rose-500', 'bg-rose-500/5');
                                  onSearchChange(''); // Auto clear error input for next scan
                              }, 800);
                          }
                      }
                  }
               }}
            />
         </div>
         <p className="text-center text-xs text-muted mt-2 font-medium tracking-wide">
             {isRTL ? 'وضع البيع السريع (سوبر ماركت) - جاهز للمسح' : 'Fast Checkout Mode (Retail) - Ready to Scan'}
         </p>
      </div>

      {/* Scanned Items Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
         {recentlyScanned.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-muted/50">
                <Box size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-bold">{isRTL ? 'لا توجد أصناف ممزوجة بعد' : 'No items scanned yet'}</p>
                <p className="text-sm">{isRTL ? 'ابدأ بسحب الباركود...' : 'Start scanning barcodes...'}</p>
             </div>
         ) : (
             <div className="space-y-2">
                 <h3 className="text-sm font-bold text-muted/80 mb-3 px-1">{isRTL ? 'آخر الأصناف المسحوبة' : 'Recently Scanned'}</h3>
                 {recentlyScanned.map((item, idx) => (
                     <div key={item.cartId || idx} className="flex items-center justify-between bg-card border border-border/10 rounded-lg p-3 shadow-sm animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-md bg-elevated flex items-center justify-center text-primary/70">
                                <Tag size={18} />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm">{isRTL ? (item.nameAr || item.name) : item.name}</h4>
                                <div className="text-xs text-muted flex gap-2">
                                    <span>#{item.sku || item.barcode || 'N/A'}</span>
                                    <span>•</span>
                                    <span>{item.quantity} x {currencySymbol}{item.price.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="font-black text-primary">{currencySymbol}{((item.price) * item.quantity).toFixed(2)}</span>
                        </div>
                     </div>
                 ))}
             </div>
         )}
      </div>
    </div>
  );
};

export default RetailModePanel;
