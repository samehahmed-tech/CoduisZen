import { type RefObject, useEffect, useEffectEvent } from 'react';
import { OrderType } from '../types';

type TableLike = {
   id: string;
};

type TableLookup = {
   id: string;
} | undefined;

/** Normalize Arabic-Indic / Persian digits to Western digits. */
export const normalizeDigits = (value: string): string =>
   String(value || '')
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

interface UsePOSKeyboardShortcutsOptions {
   searchInputRef: RefObject<HTMLInputElement | null>;
   tableNumberBufferRef: RefObject<string>;
   tableNumberTimerRef: RefObject<number | null>;
   cartHasItems: boolean;
   selectedTableId: string | null;
   showSplitModal: boolean;
   editingItemId: string | null;
   activeOrderType: OrderType;
   showMap: boolean;
   categoryHotkeys: string[];
   sortedTables: TableLike[];
   currentTableIndex: number;
   onDismissSplitModal: () => void;
   onClearEditingItem: () => void;
   onClearCart: () => void;
   onShowTableMap: () => void;
   onSetActiveCategory: (categoryId: string) => void;
   onSwitchToTable: (tableId: string) => void;
   onLeaveTable: () => void;
   onFindTableByNumber: (value: string) => TableLookup;
   onQuickPay: () => void | Promise<void>;
   onSendKitchen: () => void | Promise<void>;
   onSubmitOrder: () => void | Promise<void>;
   onVoidOrder: () => void | Promise<void>;
   onSetOrderMode: (orderType: OrderType) => void;
   onRecallShortcut: () => void;
   onOpenHelp?: () => void;
   onHoldOrder?: () => void;
   onShowHeldOrders?: () => void;
   onReprintLast?: () => void;
   onTableNotFound?: (value: string) => void;
}

export const usePOSKeyboardShortcuts = ({
   searchInputRef,
   tableNumberBufferRef,
   tableNumberTimerRef,
   cartHasItems,
   selectedTableId,
   showSplitModal,
   editingItemId,
   activeOrderType,
   showMap,
   categoryHotkeys,
   sortedTables,
   currentTableIndex,
   onDismissSplitModal,
   onClearEditingItem,
   onClearCart,
   onShowTableMap,
   onSetActiveCategory,
   onSwitchToTable,
   onLeaveTable,
   onFindTableByNumber,
   onQuickPay,
   onSendKitchen,
   onSubmitOrder,
   onVoidOrder,
   onSetOrderMode,
   onRecallShortcut,
   onOpenHelp,
   onHoldOrder,
   onShowHeldOrders,
   onReprintLast,
   onTableNotFound,
}: UsePOSKeyboardShortcutsOptions) => {
   const commitBufferedTableNumber = useEffectEvent(() => {
      if (tableNumberTimerRef.current) {
         window.clearTimeout(tableNumberTimerRef.current);
         tableNumberTimerRef.current = null;
      }

      const raw = tableNumberBufferRef.current;
      tableNumberBufferRef.current = '';
      const target = normalizeDigits(raw).replace(/\D/g, '');
      if (!target) return;

      const table = onFindTableByNumber(target);
      if (table) onSwitchToTable(table.id);
      else onTableNotFound?.(target);
   });

   const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isInput = tagName === 'INPUT';
      const isTextarea = tagName === 'TEXTAREA';
      const isContentEditable = target?.isContentEditable === true;
      const inFloorMap = showMap && activeOrderType === OrderType.DINE_IN;

      // Help: F1 or "?" (Shift+/) works everywhere except while typing in inputs
      // (except allow "?" when NOT in a text field).
      if (!isInput && !isTextarea && !isContentEditable) {
         if (event.key === 'F1' || event.key === '?') {
            event.preventDefault();
            onOpenHelp?.();
            return;
         }
      }
      // Shift+/ produces "?" on most layouts when not in input — also catch it.
      if (!isInput && !isTextarea && !isContentEditable && event.shiftKey && event.key === '/') {
         event.preventDefault();
         onOpenHelp?.();
         return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'f' || event.key.toLowerCase() === 'k')) {
         event.preventDefault();
         searchInputRef.current?.focus();
         return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
         event.preventDefault();
         if (cartHasItems) onHoldOrder?.();
         return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
         event.preventDefault();
         onReprintLast?.();
         return;
      }

      if (isInput || isTextarea || isContentEditable) {
         if (event.key === 'Escape') {
            target?.blur();
            if (showSplitModal) onDismissSplitModal();
            if (editingItemId) onClearEditingItem();
         }

         return;
      }

      if (event.key === 'Escape') {
         // Clear a partially typed table number first.
         if (inFloorMap && tableNumberBufferRef.current) {
            tableNumberBufferRef.current = '';
            if (tableNumberTimerRef.current) {
               window.clearTimeout(tableNumberTimerRef.current);
               tableNumberTimerRef.current = null;
            }
            return;
         }
         if (showSplitModal) onDismissSplitModal();

         if (cartHasItems || selectedTableId) {
            if (activeOrderType === OrderType.DINE_IN) onShowTableMap();
            else onClearCart();
         }
         return;
      }

      // Practical cashier shortcuts (work outside inputs).
      if (event.key === 'F2') {
         event.preventDefault();
         if (cartHasItems && !showSplitModal) onQuickPay();
         return;
      }
      if (event.key === 'F3') {
         event.preventDefault();
         if (cartHasItems) onHoldOrder?.();
         return;
      }
      if (event.key === 'F4') {
         event.preventDefault();
         onShowHeldOrders?.();
         return;
      }
      if (event.key === 'F9') {
         event.preventDefault();
         if (cartHasItems && !showSplitModal) onSendKitchen();
         return;
      }

      // Floor map quick-jump: typing digits opens the table. Takes priority
      // over category hotkeys while the map is visible.
      if (inFloorMap) {
         const normalizedKey = normalizeDigits(event.key);
         const isDigit = normalizedKey >= '0' && normalizedKey <= '9' && normalizedKey.length === 1;
         if (isDigit && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            tableNumberBufferRef.current += normalizedKey;
            if (tableNumberTimerRef.current) {
               window.clearTimeout(tableNumberTimerRef.current);
            }
            tableNumberTimerRef.current = window.setTimeout(() => {
               commitBufferedTableNumber();
            }, 600);
            return;
         }

         if (event.key === 'Enter') {
            event.preventDefault();
            commitBufferedTableNumber();
            return;
         }

         if (event.key === 'Backspace' && tableNumberBufferRef.current) {
            event.preventDefault();
            tableNumberBufferRef.current = tableNumberBufferRef.current.slice(0, -1);
            return;
         }
      }

      // Category hotkeys 1-9 only when NOT on the floor map (no conflict).
      if (!inFloorMap && event.key >= '1' && event.key <= '9' && !event.ctrlKey && !event.metaKey && !event.altKey) {
         const categoryIndex = parseInt(event.key, 10) - 1;
         if (categoryIndex < categoryHotkeys.length) {
            onSetActiveCategory(categoryHotkeys[categoryIndex]);
         }
      }

      if (event.key === 'Enter' && cartHasItems) {
         event.preventDefault();
         onQuickPay();
         return;
      }

      if (event.key === '/') {
         event.preventDefault();
         searchInputRef.current?.focus();
      }

      if (event.altKey) {
         if (event.key === '1') {
            event.preventDefault();
            onSetOrderMode(OrderType.DINE_IN);
         }
         if (event.key === '2') {
            event.preventDefault();
            onSetOrderMode(OrderType.TAKEAWAY);
         }
         if (event.key === '3') {
            event.preventDefault();
            onSetOrderMode(OrderType.PICKUP);
         }
         if (event.key === '4') {
            event.preventDefault();
            onSetOrderMode(OrderType.DELIVERY);
         }
         if (event.key.toLowerCase() === 'r') {
            event.preventDefault();
            onRecallShortcut();
         }
      }

      if (activeOrderType === OrderType.DINE_IN && event.altKey) {
         if (event.key === 'ArrowRight' && sortedTables.length > 0) {
            event.preventDefault();
            const nextIndex = currentTableIndex === -1 ? 0 : (currentTableIndex + 1) % sortedTables.length;
            onSwitchToTable(sortedTables[nextIndex].id);
         }
         if (event.key === 'ArrowLeft' && sortedTables.length > 0) {
            event.preventDefault();
            const prevIndex = currentTableIndex <= 0 ? sortedTables.length - 1 : currentTableIndex - 1;
            onSwitchToTable(sortedTables[prevIndex].id);
         }
         if (event.key === '0') {
            event.preventDefault();
            onLeaveTable();
         }
      }
   });

   useEffect(() => {
      const listener = (event: KeyboardEvent) => {
         handleKeyDown(event);
      };

      window.addEventListener('keydown', listener);
      return () => {
         window.removeEventListener('keydown', listener);
         if (tableNumberTimerRef.current) {
            window.clearTimeout(tableNumberTimerRef.current);
            tableNumberTimerRef.current = null;
         }
      };
   }, [handleKeyDown, tableNumberTimerRef]);
};
