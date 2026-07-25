/** Stable QR payloads for opening an order from a printed slip or invoice. */

export const ORDER_QR_SCHEME = 'hellodarzi';

export function buildOrderQrPayload(orderId: string, itemIdx?: number): string {
  const params = new URLSearchParams();
  params.set('orderId', orderId);
  if (itemIdx !== undefined && itemIdx !== null && !Number.isNaN(itemIdx)) {
    params.set('itemIdx', String(itemIdx));
  }
  // Custom scheme — independent of Electron localhost / file origins
  return `${ORDER_QR_SCHEME}://order?${params.toString()}`;
}

export function parseOrderQrPayload(
  raw: string
): { orderId: string; itemIdx?: number } | null {
  const value = (raw || '').trim();
  if (!value) return null;

  // Bare order UUID
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    return { orderId: value };
  }

  try {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      // Relative "?orderId=…" or "orderId=…"
      url = new URL(
        value.includes('://') || value.startsWith('?') || value.startsWith('/')
          ? value
          : `?${value}`,
        `${ORDER_QR_SCHEME}://local`
      );
    }

    const pathOrderId = url.pathname.match(/\/(?:order\/)?([^/?#]+)/)?.[1];
    const orderId =
      url.searchParams.get('orderId') ||
      url.searchParams.get('id') ||
      (url.hostname === 'order' && pathOrderId && pathOrderId !== 'order'
        ? pathOrderId
        : null) ||
      (pathOrderId && pathOrderId !== 'order' ? pathOrderId : null);

    if (!orderId) return null;

    const itemIdxStr = url.searchParams.get('itemIdx');
    if (itemIdxStr === null || itemIdxStr === '') {
      return { orderId };
    }
    const itemIdx = parseInt(itemIdxStr, 10);
    if (Number.isNaN(itemIdx) || itemIdx < 0) {
      return { orderId };
    }
    return { orderId, itemIdx };
  } catch {
    return null;
  }
}
