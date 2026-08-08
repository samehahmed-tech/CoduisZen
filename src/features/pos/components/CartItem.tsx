import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, Trash2, Pencil, Tag, Percent } from 'lucide-react';
import { OrderItem } from '@/types';

interface CartItemProps {
    item: OrderItem;
    currencySymbol: string;
    isTouchMode: boolean;
    onEditNote: (cartId: string, currentNote: string) => void;
    onUpdateQuantity: (cartId: string, delta: number) => void;
    onRemove: (cartId: string) => void;
    onEditSeat: (cartId: string, currentSeat?: number) => void;
    onEditCourse?: (cartId: string, currentCourse?: string) => void;
    onEditItemDiscount?: (cartId: string) => void;
    lang: 'en' | 'ar';
    isLastAdded?: boolean;
}

const CartItem: React.FC<CartItemProps> = React.memo(({
    item, onEditNote, onUpdateQuantity, onRemove, onEditItemDiscount, lang, isLastAdded,
}) => {
    const displayName = lang === 'ar' ? (item.nameAr || item.name) : item.name;
    const unitPrice = Number(item.price || 0);
    const modPrice = (item.selectedModifiers || []).reduce((sum, modifier) => sum + (modifier.price || 0), 0);
    const lineGross = (unitPrice + modPrice) * Number(item.quantity || 0);

    let discountAmount = 0;
    if (item.itemDiscount && item.itemDiscount > 0) {
        discountAmount = item.itemDiscountType === 'percent'
            ? lineGross * (item.itemDiscount / 100)
            : item.itemDiscount;
    }
    const lineTotal = lineGross - discountAmount;

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const startEdit = () => {
        setDraft(String(item.quantity));
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 0);
    };

    const commitEdit = useCallback(() => {
        const parsed = parseInt(draft, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
            const delta = parsed - item.quantity;
            if (delta !== 0) onUpdateQuantity(item.cartId, delta);
        }
        setEditing(false);
    }, [draft, item.cartId, item.quantity, onUpdateQuantity]);

    const cancelEdit = () => setEditing(false);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 15, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="relative mb-1.5 overflow-hidden rounded-[14px]"
        >
            <motion.div
                className={`group relative flex flex-col gap-2 rounded-[14px] border bg-card/95 px-2.5 py-2.5 shadow-sm backdrop-blur-sm transition-colors duration-200 ${
                    isLastAdded
                        ? 'border-primary/30 shadow-md shadow-primary/10'
                        : 'border-border/10 hover:border-primary/20'
                }`}
            >
                <div className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1 py-0.5">
                        <p className="mb-1 line-clamp-2 break-words text-[13px] font-bold leading-snug text-main" title={displayName}>
                            {displayName}
                        </p>

                        {((item.selectedModifiers && item.selectedModifiers.length > 0) || item.notes || (item.itemDiscount && item.itemDiscount > 0)) && (
                            <div className="flex flex-wrap items-center gap-1">
                                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                    <span className="max-w-[120px] truncate text-[9px] font-medium text-muted/80">
                                        +{item.selectedModifiers.map(modifier => modifier.optionName).join(', ')}
                                    </span>
                                )}
                                {item.notes && (
                                    <span className="max-w-[96px] truncate rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold text-amber-600/90">
                                        {item.notes}
                                    </span>
                                )}
                                {item.itemDiscount && item.itemDiscount > 0 && (
                                    <span className="flex items-center gap-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-px text-[9px] font-bold text-emerald-600">
                                        <Percent size={8} />
                                        {item.itemDiscountType === 'percent' ? `${item.itemDiscount}%` : `-${item.itemDiscount.toFixed(0)}`}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-col justify-center text-right">
                        <span className="text-[15px] font-black tracking-tight text-main tabular-nums">
                            {lineTotal.toFixed(2)}
                        </span>
                        {discountAmount > 0 && (
                            <div className="text-[10px] font-semibold text-muted/40 line-through tabular-nums">
                                {lineGross.toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border/8 pt-2">
                    <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-xl border border-border/10 bg-elevated/40 shadow-inner">
                        <button
                            onClick={(event) => { event.stopPropagation(); onUpdateQuantity(item.cartId, -1); }}
                            className="flex h-full min-w-[44px] items-center justify-center text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500 active:scale-90"
                            title="Decrease quantity"
                        >
                            <Minus size={16} strokeWidth={2.5} />
                        </button>

                        {editing ? (
                            <input
                                ref={inputRef}
                                type="number"
                                min={1}
                                value={draft}
                                onChange={event => setDraft(event.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={event => {
                                    event.stopPropagation();
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        commitEdit();
                                    }
                                    if (event.key === 'Escape') cancelEdit();
                                }}
                                className="h-full w-9 border-x border-border/10 bg-primary/8 text-center text-[12px] font-black text-primary outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                        ) : (
                            <button
                                onClick={startEdit}
                                title="Edit quantity"
                                className="flex h-full w-9 cursor-text items-center justify-center border-x border-border/10 text-[12px] font-black text-main tabular-nums transition-colors hover:text-primary"
                            >
                                {item.quantity}
                            </button>
                        )}

                        <button
                            onClick={(event) => { event.stopPropagation(); onUpdateQuantity(item.cartId, 1); }}
                            className="flex h-full min-w-[44px] items-center justify-center text-muted transition-colors hover:bg-primary/10 hover:text-primary active:scale-90"
                            title="Increase quantity"
                        >
                            <Plus size={16} strokeWidth={2.5} />
                        </button>
                    </div>

                    <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
                        {onEditItemDiscount && (
                            <button
                                onClick={(event) => { event.stopPropagation(); onEditItemDiscount(item.cartId); }}
                                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                                    item.itemDiscount && item.itemDiscount > 0
                                        ? 'bg-success/10 text-success hover:bg-success/20'
                                        : 'text-muted hover:bg-success/10 hover:text-success'
                                }`}
                                title="Item discount"
                            >
                                <Tag size={13} />
                            </button>
                        )}
                        <button
                            onClick={(event) => { event.stopPropagation(); onEditNote(item.cartId, item.notes || ''); }}
                            className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                                item.notes
                                    ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                                    : 'text-muted hover:bg-primary/10 hover:text-primary'
                            }`}
                            title="Item note"
                        >
                            <Pencil size={13} />
                        </button>
                        <button
                            onClick={(event) => { event.stopPropagation(); onRemove(item.cartId); }}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                            title="Remove item"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
});

export default CartItem;
