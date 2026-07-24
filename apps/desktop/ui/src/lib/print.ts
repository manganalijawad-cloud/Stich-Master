/**
 * Print the current page.
 * In Electron, opens an in-app PDF print preview (Chromium print preview is not available).
 * In a normal browser, falls back to window.print().
 */
export function printPage(): void {
  const api = (window as any).electronAPI;
  if (api?.isElectron && typeof api.print === 'function') {
    void api.print().then((result: { success?: boolean; error?: string } | void) => {
      if (result && result.success === false) {
        console.error('Electron print failed:', result.error || 'Unknown error');
      }
    }).catch((err: unknown) => {
      console.error('Electron print IPC failed:', err);
    });
    return;
  }
  window.print();
}
