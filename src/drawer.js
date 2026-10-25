// A side panel (checkout, order status): opens over the page, pauses smooth scroll,
// closes on the overlay, the × or Escape, and gives focus back where it was.
export function createDrawer(el, lenis, { onOpen } = {}) {
  let lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    lenis?.stop();
    onOpen?.();
  }

  function close() {
    if (!el.classList.contains('is-open')) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    lenis?.start();
    lastFocus?.focus?.();
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  return { open, close };
}

export const phoneOk = (v) => /^5\d{8}$/.test(String(v).replace(/[\s\-().]/g, '').replace(/^\+?995/, ''));

export async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'შეცდომა. სცადე თავიდან.');
  return data;
}
