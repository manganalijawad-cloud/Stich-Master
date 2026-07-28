import { useEffect, useRef, type RefObject } from 'react';
import { focusElement, isEditableTarget, isMod, matchHotkeys } from '../lib/keyboard';

export interface OrdersHotkeyApi {
  isCreating: boolean;
  isEditing: boolean;
  bookingStep: 'customer' | 'garments' | 'summary';
  showCreateCustomer: boolean;
  createSuccess: boolean;
  restoreDialogOpen: boolean;
  isScannerOpen: boolean;
  showPaymentDialog: boolean;
  showMoreMenu: boolean;
  showShortcuts: boolean;
  hasScannedItem: boolean;
  setShowShortcuts: (v: boolean) => void;
  orders: Array<{ id: string }>;
  selectedOrderId: string | null;
  searchResults: Array<{ id: string }>;
  highlightIndex: number;
  setHighlightIndex: (n: number | ((prev: number) => number)) => void;
  searchQuery: string;
  customerSearch: string;
  searchRef: RefObject<HTMLInputElement | null>;
  customerSearchRef: RefObject<HTMLInputElement | null>;
  paidAmountRef: RefObject<HTMLInputElement | null>;
  startNewBooking: () => void;
  cancelBooking: () => void;
  selectOrderByIndex: (index: number) => void;
  selectCustomerByIndex: (index: number) => void;
  openCreateCustomer: () => void;
  closeCreateCustomer: () => void;
  goGarmentsStep: () => void;
  goSummaryStep: () => void;
  goCustomerStep: () => void;
  lockOrder: () => void;
  saveEdits: () => void;
  startEdit: () => void;
  cancelEdit: () => void;
  printSelected: () => void;
  deleteSelected: () => void;
  advanceSelected: () => void;
  closeCreateSuccess: () => void;
  closeRestore: () => void;
  closeScanner: () => void;
  closeScannedItem: () => void;
  closePayment: () => void;
  confirmPayment: () => void;
  confirmRestore: () => void;
  closeMoreMenu: () => void;
  closeShortcuts: () => void;
}

/**
 * Orders desk hotkeys. Modal layers win over page shortcuts.
 */
export function useOrdersHotkeys(api: OrdersHotkeyApi): void {
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const a = apiRef.current;
      const editable = isEditableTarget(e.target);

      matchHotkeys(e, [
        // Cheat sheet
        (ev) => {
          if (ev.key === '?' && !editable && !isMod(ev) && !ev.altKey) {
            a.setShowShortcuts(true);
            return true;
          }
        },
        (ev) => {
          if (ev.key === 'Escape' && a.showShortcuts) {
            a.closeShortcuts();
            return true;
          }
        },

        // Modal layer (highest)
        (ev) => {
          if (ev.key !== 'Escape' && ev.key !== 'Enter') return;
          if (a.createSuccess) {
            if (ev.key === 'Escape') {
              a.closeCreateSuccess();
              return true;
            }
            return;
          }
          if (a.showPaymentDialog) {
            if (ev.key === 'Escape') {
              a.closePayment();
              return true;
            }
            if (ev.key === 'Enter' && !editable) {
              a.confirmPayment();
              return true;
            }
            return;
          }
          if (a.restoreDialogOpen) {
            if (ev.key === 'Escape') {
              a.closeRestore();
              return true;
            }
            if (ev.key === 'Enter' && !editable) {
              a.confirmRestore();
              return true;
            }
            return;
          }
          if (a.isScannerOpen) {
            if (ev.key === 'Escape') {
              a.closeScanner();
              return true;
            }
          }
          if (a.hasScannedItem && ev.key === 'Escape') {
            a.closeScannedItem();
            return true;
          }
        },

        (ev) => {
          if (ev.key === 'Escape' && a.showMoreMenu) {
            a.closeMoreMenu();
            return true;
          }
        },

        // Create flow
        (ev) => {
          if (!a.isCreating) return;
          if (ev.key === 'Escape') {
            if (a.showCreateCustomer) {
              a.closeCreateCustomer();
              return true;
            }
            if (a.bookingStep === 'summary') {
              a.goGarmentsStep();
              return true;
            }
            if (a.bookingStep === 'garments') {
              a.goCustomerStep();
              return true;
            }
            a.cancelBooking();
            return true;
          }
          if (isMod(ev) && ev.key === 'Enter') {
            if (a.bookingStep === 'customer' && !a.showCreateCustomer) {
              if (a.searchResults.length > 0) {
                const idx = Math.max(0, Math.min(a.highlightIndex, a.searchResults.length - 1));
                a.selectCustomerByIndex(idx);
                return true;
              }
              a.openCreateCustomer();
              return true;
            }
            if (a.bookingStep === 'garments') {
              a.goSummaryStep();
              return true;
            }
            if (a.bookingStep === 'summary') {
              a.lockOrder();
              return true;
            }
          }
          if (a.bookingStep === 'customer' && !a.showCreateCustomer && !editable) {
            if (ev.key === 'ArrowDown' && a.searchResults.length > 0) {
              a.setHighlightIndex((prev) => Math.min(prev + 1, a.searchResults.length - 1));
              return true;
            }
            if (ev.key === 'ArrowUp' && a.searchResults.length > 0) {
              a.setHighlightIndex((prev) => Math.max(prev - 1, 0));
              return true;
            }
            if (ev.key === 'Enter' && a.searchResults.length > 0) {
              const idx = Math.max(0, Math.min(a.highlightIndex, a.searchResults.length - 1));
              a.selectCustomerByIndex(idx);
              return true;
            }
          }
        },

        // Edit flow
        (ev) => {
          if (!a.isEditing) return;
          if (ev.key === 'Escape') {
            a.cancelEdit();
            return true;
          }
          if (isMod(ev) && (ev.key === 's' || ev.key === 'S' || ev.key === 'Enter')) {
            a.saveEdits();
            return true;
          }
        },

        // Browse / detail
        (ev) => {
          if (a.isCreating || a.isEditing) return;
          if (a.createSuccess || a.showPaymentDialog || a.restoreDialogOpen || a.isScannerOpen) return;

          if (isMod(ev) && (ev.key === 'n' || ev.key === 'N')) {
            a.startNewBooking();
            return true;
          }
          if ((isMod(ev) && (ev.key === 'f' || ev.key === 'F')) || (ev.key === '/' && !editable)) {
            focusElement(a.searchRef.current);
            return true;
          }
          if (!editable && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
            if (a.orders.length === 0) return;
            const current = a.orders.findIndex((o) => o.id === a.selectedOrderId);
            const next =
              ev.key === 'ArrowDown'
                ? Math.min((current < 0 ? -1 : current) + 1, a.orders.length - 1)
                : Math.max((current < 0 ? a.orders.length : current) - 1, 0);
            a.selectOrderByIndex(next);
            return true;
          }
          if (isMod(ev) && (ev.key === 'p' || ev.key === 'P') && a.selectedOrderId) {
            a.printSelected();
            return true;
          }
          if (ev.key === 'F2' && a.selectedOrderId) {
            a.startEdit();
            return true;
          }
          if (isMod(ev) && ev.shiftKey && (ev.key === 'ArrowRight' || ev.key === 'Right') && a.selectedOrderId) {
            a.advanceSelected();
            return true;
          }
          if ((ev.key === 'Delete' || ev.key === 'Backspace') && !editable && a.selectedOrderId && isMod(ev) === false && ev.key === 'Delete') {
            a.deleteSelected();
            return true;
          }
          if (isMod(ev) && (ev.key === 's' || ev.key === 'S') && a.selectedOrderId) {
            // No dirty form — ignore
            return;
          }
        },
      ]);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

/** Focus primary field when create/edit surfaces open. */
export function useAutoFocusOnOpen(
  shouldFocus: boolean,
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): void {
  useEffect(() => {
    if (!shouldFocus) return;
    focusElement(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFocus, ...deps]);
}
