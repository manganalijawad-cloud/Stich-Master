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
        const detail = result.error || 'Unknown error';
        console.error('Electron print failed:', detail);
        window.alert(`Printing failed: ${detail}`);
      }
    }).catch((err: unknown) => {
      console.error('Electron print IPC failed:', err);
      window.alert(`Printing failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    return;
  }
  window.print();
}
