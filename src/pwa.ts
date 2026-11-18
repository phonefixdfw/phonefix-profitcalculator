/** Register only in production (never inside the Chrome extension popup); Vite serves a cleanup worker for existing installs. */
export async function setupPwa(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || location.protocol === 'chrome-extension:') return;
  const banner = document.createElement('aside');
  banner.className = 'app-update';
  banner.setAttribute('aria-label', 'App update');
  banner.hidden = true;
  banner.innerHTML = '<p role="status">Updated app available.</p><button class="primary-button" type="button">Updated, reload</button>';
  document.body.append(banner);
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    function offerUpdate(): void {
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      banner.hidden = false;
      banner.querySelector('button')!.onclick = () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        registration.waiting?.postMessage('SKIP_WAITING');
      };
    }
    offerUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
    });
    // Check every load, including when the page itself came from the offline cache.
    await registration.update();
  } catch { /* Offline startup and restricted browsers can still use the calculator. */ }
}
