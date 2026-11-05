import type { ShopConfig } from './config';
import { draftFromConfig, resetSettings, saveSettings, validateSettings, type SettingsDraft } from './settings';
import { setupSettingsTransfer } from './settings-transfer-ui';

export function setupSettings(panel: HTMLElement, toggle: HTMLButtonElement, initial: ShopConfig, onSave: (config: ShopConfig) => void, defaults: ShopConfig): void {
  let current = initial;
  let draft = draftFromConfig(current);
  panel.innerHTML = `
    <div class="panel-heading"><div><p class="eyebrow">SHOP RATES</p><h2 id="settings-heading">Settings</h2></div></div>
    <p class="settings-help">Changes are saved on this browser and apply to the calculator. Enter amounts in dollars; tier bounds include both endpoints.</p>
    <section id="settings-transfer" class="settings-transfer" aria-label="Share shop settings"></section>
    <form id="settings-form" novalidate>
      <div class="settings-rates">
        <div class="settings-field"><label for="settings-tax">Sales tax rate (%)</label><input id="settings-tax" data-key="salesTax" type="text" inputmode="decimal" aria-describedby="error-salesTax"><p class="field-error" id="error-salesTax" hidden></p></div>
        <div class="settings-field"><label for="settings-card">Card fee (%)</label><input id="settings-card" data-key="cardFee" type="text" inputmode="decimal" aria-describedby="error-cardFee"><p class="field-error" id="error-cardFee" hidden></p></div>
        <div class="settings-field"><label for="settings-fixed">Fixed card fee ($)</label><input id="settings-fixed" data-key="cardFixedFee" type="text" inputmode="decimal" aria-describedby="error-cardFixedFee"><p class="field-error" id="error-cardFixedFee" hidden></p></div>
      </div>
      <div class="settings-tier-heading"><h3>Screen warranty tiers</h3><p>Based on the ticket total after tax. Leave the last upper bound blank for “and up”.</p></div>
      <p id="error-tiers" class="field-error" hidden></p><div id="settings-tiers"></div>
      <button id="add-tier" class="clear-button" type="button">Add tier</button>
      <div class="settings-actions"><button class="primary-button" type="submit">Save settings</button><button id="reset-settings" class="clear-button" type="button">Reset to defaults</button></div>
      <p id="settings-status" class="settings-status" role="status" aria-live="polite"></p>
    </form>`;
  const form = panel.querySelector<HTMLFormElement>('#settings-form')!;
  const tiers = panel.querySelector<HTMLElement>('#settings-tiers')!;
  const status = panel.querySelector<HTMLElement>('#settings-status')!;
  const input = (key: string) => form.querySelector<HTMLInputElement>(`[data-key="${key}"]`)!;

  function readDraft(): SettingsDraft {
    return {
      salesTax: input('salesTax').value, cardFee: input('cardFee').value, cardFixedFee: input('cardFixedFee').value,
      tiers: Array.from(tiers.querySelectorAll<HTMLElement>('.tier-row')).map((row) => ({
        min: row.querySelector<HTMLInputElement>('[data-part="min"]')!.value,
        max: row.querySelector<HTMLInputElement>('[data-part="max"]')!.value,
        cost: row.querySelector<HTMLInputElement>('[data-part="cost"]')!.value,
      })),
    };
  }
  function render(): void {
    input('salesTax').value = draft.salesTax;
    input('cardFee').value = draft.cardFee;
    input('cardFixedFee').value = draft.cardFixedFee;
    tiers.innerHTML = '';
    draft.tiers.forEach((tier, index) => {
      const row = document.createElement('fieldset');
      row.className = 'tier-row';
      row.innerHTML = `<legend>Tier ${index + 1}</legend><div class="tier-fields">
        ${(['min', 'max', 'cost'] as const).map((part) => `<div class="settings-field"><label for="tier-${index}-${part}">${part === 'min' ? 'From ($)' : part === 'max' ? 'To ($)' : 'Warranty cost ($)'}</label><input id="tier-${index}-${part}" data-key="tier-${index}-${part}" data-part="${part}" type="text" inputmode="decimal" aria-describedby="error-tier-${index}-${part}"><p id="error-tier-${index}-${part}" class="field-error" hidden></p></div>`).join('')}
        </div><button class="clear-button remove-tier" type="button" aria-label="Remove tier ${index + 1}">Remove tier</button>`;
      for (const part of ['min', 'max', 'cost'] as const) row.querySelector<HTMLInputElement>(`[data-part="${part}"]`)!.value = tier[part];
      row.querySelector('button')!.addEventListener('click', () => {
        draft = readDraft(); draft.tiers.splice(index, 1); render(); status.textContent = 'Tier removed. Save settings to apply changes.';
        panel.querySelector<HTMLButtonElement>('#add-tier')!.focus();
      });
      tiers.append(row);
    });
    clearErrors();
  }
  function clearErrors(): void {
    form.querySelectorAll<HTMLInputElement>('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
    form.querySelectorAll<HTMLElement>('.field-error').forEach((node) => { node.hidden = true; node.textContent = ''; });
  }
  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    if (opening) { draft = draftFromConfig(current); render(); status.textContent = ''; input('salesTax').focus(); }
    else toggle.focus();
  });
  panel.querySelector('#add-tier')!.addEventListener('click', () => {
    draft = readDraft(); draft.tiers.push({ min: '', max: '', cost: '' }); render();
    input(`tier-${draft.tiers.length - 1}-min`).focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault(); draft = readDraft(); clearErrors();
    const result = validateSettings(draft);
    if (!result.config) {
      Object.entries(result.errors).forEach(([key, message]) => {
        const error = panel.querySelector<HTMLElement>(`#error-${key}`);
        if (error) { error.textContent = message; error.hidden = false; }
        form.querySelector<HTMLInputElement>(`[data-key="${key}"]`)?.setAttribute('aria-invalid', 'true');
      });
      status.textContent = 'Check the highlighted settings before saving.';
      form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (!saveSettings(result.config)) { status.textContent = 'Could not save settings in this browser. Check browser storage and try again.'; return; }
    current = result.config; onSave(current); status.textContent = 'Settings saved and applied.';
  });
  panel.querySelector('#reset-settings')!.addEventListener('click', () => {
    if (!window.confirm('Reset all shop settings to their defaults?')) return;
    if (!resetSettings()) { status.textContent = 'Could not reset settings in this browser. Check browser storage and try again.'; return; }
    current = defaults; draft = draftFromConfig(current); render(); onSave(current); status.textContent = 'Default settings restored.';
  });
  render();
  setupSettingsTransfer(panel.querySelector<HTMLElement>('#settings-transfer')!, () => current, (config) => {
    if (!saveSettings(config)) return false;
    current = config; draft = draftFromConfig(current); render(); onSave(current);
    status.textContent = '';
    return true;
  }, () => { if (panel.hidden) toggle.click(); });
}
