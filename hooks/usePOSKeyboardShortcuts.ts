import { type RefObject, useEffect, useEffectEvent } from 'react';
import { OrderType } from '../types';

type TableLike = {
   id: string;
};

type TableLookup = {
   id: string;
} | undefined;

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
}: UsePOSKeyboardShortcutsOptions) => {
   const commitBufferedTableNumber = useEffectEvent(() => {
      if (tableNumberTimerRef.current) {
         window.clearTimeout(tableNumberTimerRef.current);
         tableNumberTimerRef.current = null;
      }

      const target = tableNumberBufferRef.current;
      tableNumberBufferRef.current = '';
      if (!target) return;

      const table = onFindTableByNumber(target);
      if (table) onSwitchToTable(table.id);
   });

   const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isInput = tagName === 'INPUT';
      const isTextarea = tagName === 'TEXTAREA';
      const isContentEditable = target?.isContentEditable === true;

      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
         event.preventDefault();
         searchInputRef.current?.focus();
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
         if (showSplitModal) onDismissSplitModal();

         if (cartHasItems || selectedTableId) {
            if (activeOrderType === OrderType.DINE_IN) onShowTableMap();
            else onClearCart();
         }
      }

      if (event.key >= '1' && event.key <= '9') {
         const categoryIndex = parseInt(event.key, 10) - 1;
         if (categoryIndex < categoryHotkeys.length) {
            onSetActiveCategory(categoryHotkeys[categoryIndex]);
         }
      }

      if (showMap && activeOrderType === OrderType.DINE_IN) {
         const isDigit = event.key >= '0' && event.key <= '9';
         if (isDigit) {
            event.preventDefault();
            tableNumberBufferRef.current += event.key;
            if (tableNumberTimerRef.current) {
               window.clearTimeout(tableNumberTimerRef.current);
            }
            tableNumberTimerRef.current = window.setTimeout(() => {
               commitBufferedTableNumber();
            }, 700);
         }

         if (event.key === 'Enter') {
            event.preventDefault();
            commitBufferedTableNumber();
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

      if (event.shiftKey && event.key === 'Enter' && cartHasItems && !showSplitModal) {
         event.preventDefault();
         onQuickPay();
         return;
      }

      if (event.ctrlKey && event.key === 'Enter' && cartHasItems && !showSplitModal) {
         event.preventDefault();
         onSendKitchen();
         return;
      }

      if (event.key === 'Enter' && cartHasItems && !showSplitModal) onSubmitOrder();
      if (event.key === 'Delete' && cartHasItems) onVoidOrder();

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
         if (event.key >= '5' && event.key <= '9') {
            const tableIndex = parseInt(event.key, 10) - 1;
            if (tableIndex >= 0 && tableIndex < sortedTables.length) {
               event.preventDefault();
               onSwitchToTable(sortedTables[tableIndex].id);
            }
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
