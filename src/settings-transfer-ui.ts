import { renderSVG } from 'uqr';
import type { ShopConfig } from './config';
import { formatMoney } from './money';
import { decodeSettingsCode, encodeSettingsCode, settingsShareLink } from './settings-code';

export function setupSettingsTransfer(container: HTMLElement, getCurrent: () => ShopConfig, apply: (config: ShopConfig) => boolean, openSettings: () => void): void {
  container.innerHTML = `
    <h3>Share shop settings</h3>
    <p class="settings-help">Copy your saved settings to another device, or scan the QR code. Save any edits before copying.</p>
    <button id="copy-settings-code" class="clear-button" type="button">Copy settings code</button>
    <div id="settings-export" hidden>
      <div class="settings-field"><label for="settings-export-code">Settings code</label><textarea id="settings-export-code" rows="3" readonly spellcheck="false"></textarea></div>
      <div id="settings-qr" role="img" aria-label="QR code to load these shop settings"></div>
      <a id="settings-share-link">Open settings link</a>
    </div>
    <form id="settings-import-form">
      <div class="settings-field"><label for="settings-import-code">Load settings code</label><textarea id="settings-import-code" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="settings-transfer-status"></textarea></div>
      <button class="clear-button" type="submit">Review settings code</button>
    </form>
    <p id="settings-transfer-status" class="settings-status" role="status" aria-live="polite"></p>
    <dialog id="settings-import-dialog" aria-labelledby="settings-import-heading" aria-describedby="settings-import-help">
      <h2 id="settings-import-heading" tabindex="-1" autofocus>Review settings changes</h2>
      <p id="settings-import-help" class="settings-help">Confirm to replace the saved shop settings on this browser.</p>
      <dl id="settings-import-summary"></dl>
      <div id="settings-import-tiers"></div>
      <p id="settings-import-error" class="field-error" role="alert" hidden></p>
      <div class="settings-actions"><button id="confirm-settings-import" class="primary-button" type="button">Confirm and save settings</button><button id="cancel-settings-import" class="clear-button" type="button">Cancel</button></div>
    </dialog>`;
  const find = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const status = find('#settings-transfer-status');
  const dialog = find<HTMLDialogElement>('#settings-import-dialog');
  const codeInput = find<HTMLTextAreaElement>('#settings-import-code');
  const importError = find('#settings-import-error');
  let pending: ShopConfig | undefined;
  let reviewRequest = 0;

  function clearHash(): void {
    if (window.location.hash.startsWith('#settings=')) history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  const percentage = (bps: number) => `${(bps / 100).toFixed(2)}%`;
  const range = (tier: ShopConfig['warrantyTiers'][number]) => tier.max === null ? `${formatMoney(tier.min)} and up` : `${formatMoney(tier.min)}–${formatMoney(tier.max)}`;

  async function review(code: string): Promise<void> {
    const request = ++reviewRequest;
    status.textContent = '';
    codeInput.removeAttribute('aria-invalid');
    try {
      const config = await decodeSettingsCode(code);
      if (request !== reviewRequest) return;
      pending = config;
      const current = getCurrent();
      const summary = find('#settings-import-summary');
      summary.replaceChildren();
      for (const [label, before, after] of [
        ['Sales tax', percentage(current.salesTaxBps), percentage(config.salesTaxBps)],
        ['Card fee', percentage(current.cardFeeBps), percentage(config.cardFeeBps)],
        ['Fixed card fee', formatMoney(current.cardFixedFee), formatMoney(config.cardFixedFee)],
        ['Warranty tiers', String(current.warrantyTiers.length), String(config.warrantyTiers.length)],
        ['Target profit', 'No saved target profit', 'No saved target profit'],
      ]) {
        const row = document.createElement('div');
        row.className = 'breakdown-row';
        const term = document.createElement('dt'); term.textContent = label;
        const detail = document.createElement('dd'); detail.textContent = before === after ? `${after} (unchanged)` : `${before} → ${after}`;
        row.append(term, detail); summary.append(row);
      }
      const tierSummary = find('#settings-import-tiers');
      tierSummary.replaceChildren();
      const heading = document.createElement('h3'); heading.textContent = 'Warranty tier changes';
      const list = document.createElement('ol');
      for (let index = 0; index < Math.max(current.warrantyTiers.length, config.warrantyTiers.length); index++) {
        const before = current.warrantyTiers[index]; const after = config.warrantyTiers[index];
        const item = document.createElement('li');
        const beforeText = before ? `${range(before)}: ${formatMoney(before.cost)}` : 'New tier';
        const afterText = after ? `${range(after)}: ${formatMoney(after.cost)}` : 'Removed';
        item.textContent = beforeText === afterText ? `${afterText} (unchanged)` : `${beforeText} → ${afterText}`;
        list.append(item);
      }
      tierSummary.append(heading, list);
      importError.hidden = true;
      if (!dialog.open) dialog.showModal();
    } catch (error) {
      if (request !== reviewRequest) return;
      pending = undefined;
      status.textContent = error instanceof Error ? error.message : 'Could not read this settings code. Nothing was changed.';
      codeInput.setAttribute('aria-invalid', 'true');
    }
  }

  find<HTMLButtonElement>('#copy-settings-code').addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      const code = await encodeSettingsCode(getCurrent());
      const link = settingsShareLink(code);
      const output = find<HTMLTextAreaElement>('#settings-export-code');
      output.value = code;
      const anchor = find<HTMLAnchorElement>('#settings-share-link'); anchor.href = link;
      find('#settings-export').hidden = false;
      let qrReady = false;
      const qr = find('#settings-qr');
      qr.replaceChildren();
      try {
        // Only the library's SVG markup is inserted; no imported text becomes HTML.
        qr.innerHTML = renderSVG(link, { border: 4, ecc: 'L' });
        qrReady = true;
      } catch { /* Large tier lists can still be copied even if they exceed QR capacity. */ }
      try {
        await navigator.clipboard.writeText(code);
        status.textContent = 'Settings code copied.';
      } catch {
        output.focus(); output.select();
        status.textContent = 'Select and copy the settings code below. Clipboard access is unavailable.';
      }
      if (!qrReady) status.textContent += ' Too many tiers for a QR code; use the text code instead.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not create a settings code.';
    } finally { button.disabled = false; }
  });
  find<HTMLFormElement>('#settings-import-form').addEventListener('submit', (event) => { event.preventDefault(); void review(codeInput.value); });
  find('#confirm-settings-import').addEventListener('click', () => {
    if (!pending) return;
    if (!apply(pending)) {
      importError.textContent = 'Could not save settings in this browser. Check browser storage and try again.';
      importError.hidden = false;
      return;
    }
    pending = undefined;
    codeInput.value = '';
    find('#settings-export').hidden = true;
    status.textContent = 'Settings loaded and applied.';
    clearHash();
    dialog.close();
  });
  find('#cancel-settings-import').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { pending = undefined; clearHash(); });

  function readHash(): void {
    if (!window.location.hash.startsWith('#settings=')) return;
    openSettings();
    void review(window.location.hash.slice('#settings='.length));
    // Keep the transfer code out of subsequent browser history and copied URLs,
    // including when it is invalid or the confirmation is cancelled.
    clearHash();
  }
  window.addEventListener('hashchange', readHash);
  readHash();
}
