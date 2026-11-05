import './style.css';
import { calculateTicket, getWarrantyTierReference, type TicketResult } from './calc';
import { DEFAULT_CONFIG, type ShopConfig } from './config';
import { setupSettings } from './settings-ui';
import { loadSettings } from './settings';
import { formatMoney, parseMoney } from './money';

const phoneIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="PhoneFix DFW home">
      <span class="brand-icon">${phoneIcon}</span>
      <span>PhoneFix <span class="brand-place">DFW</span></span>
    </a>
    <span class="header-caption"><span class="status-dot"></span> Shop counter tools</span>
  </header>
  <main>
    <div class="intro">
      <p class="eyebrow">EVERY REPAIR. EVERY DOLLAR.</p>
      <h1>Know what you keep.</h1>
      <p class="intro-copy">Your repair profit, with the real costs built in.</p>
      <button id="settings-toggle" class="clear-button settings-toggle" type="button" aria-expanded="false" aria-controls="settings-panel">Settings</button>
    </div>
    <section id="settings-panel" class="settings-panel" aria-labelledby="settings-heading" hidden></section>
    <div class="calculator">
      <section class="ticket-panel" aria-labelledby="ticket-heading">
        <div class="panel-heading">
          <div><p class="eyebrow">THE INPUTS</p><h2 id="ticket-heading">Repair ticket</h2></div>
          <button id="clear" class="clear-button" type="button">Clear <span aria-hidden="true">↺</span></button>
        </div>
        <form id="ticket-form" novalidate>
          <div class="field">
            <label for="price">Repair price <span>before tax</span></label>
            <div class="money-field"><span aria-hidden="true">$</span><input id="price" name="price" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-describedby="price-error" spellcheck="false" /></div>
            <p id="price-error" class="field-error" hidden></p>
          </div>
          <div class="field">
            <label for="part-cost">Part cost</label>
            <div class="money-field"><span aria-hidden="true">$</span><input id="part-cost" name="part-cost" type="text" inputmode="decimal" autocomplete="off" value="0.00" aria-describedby="part-error" spellcheck="false" /></div>
            <p id="part-error" class="field-error" hidden></p>
          </div>
          <label class="screen-option" for="screen-repair">
            <input id="screen-repair" name="screen-repair" type="checkbox" checked />
            <span><span class="option-title">Screen repair</span><span class="option-description">Include 1-year accidental damage warranty</span></span>
          </label>
          <fieldset class="payment-field">
            <legend>Payment method</legend>
            <div class="payment-options">
              <label for="card"><input id="card" type="radio" name="payment" value="card" checked /><span>Card</span></label>
              <label for="cash"><input id="cash" type="radio" name="payment" value="cash" /><span>Cash</span></label>
            </div>
          </fieldset>
        </form>
        <p id="rates-note" class="rates-note"></p>
      </section>
      <section class="results-panel" aria-labelledby="results-heading">
        <div class="profit-card" aria-live="polite" aria-atomic="true">
          <div class="profit-heading"><h2 id="results-heading">Net profit</h2><span id="profit-status" class="profit-badge">Ready to calculate</span></div>
          <output id="profit" for="price part-cost screen-repair card cash" aria-label="Net profit">—</output>
          <p id="margin">Your take-home profit before overhead</p>
        </div>
        <div class="breakdown">
          <div class="breakdown-heading"><h3>Ticket breakdown</h3><span>USD</span></div>
          <dl>
            <div class="breakdown-row"><dt>Repair price <span>before tax</span></dt><dd id="price-value">—</dd></div>
            <div class="breakdown-row"><dt id="tax-label">Sales tax</dt><dd id="tax-value">—</dd></div>
            <div class="breakdown-row ticket-total"><dt>Ticket total <span>customer pays</span></dt><dd id="total-value">—</dd></div>
            <div class="breakdown-row"><dt>Part cost</dt><dd id="part-value">—</dd></div>
            <div class="breakdown-row"><dt>Card fee <span id="card-detail"></span></dt><dd id="card-value">—</dd></div>
            <div class="breakdown-row"><dt>Screen warranty <span id="warranty-detail"></span></dt><dd id="warranty-value">—</dd></div>
          </dl>
          <p class="tax-note">Sales tax is collected for the state and excluded from profit.</p>
        </div>
        <p id="input-status" class="input-status" role="status">Enter a repair price to see your profit.</p>
        <aside id="cliff-hint" class="cliff-hint" aria-label="Warranty pricing suggestion" aria-live="polite" hidden>
          <span class="hint-icon" aria-hidden="true">↗</span><div><h3>A small price change could help</h3><p id="cliff-copy"></p><p id="cliff-profit" class="hint-profit"></p></div>
        </aside>
        <p id="tier-limit" class="tier-limit" hidden></p>
      </section>
    </div>
    <details id="warranty-reference" class="warranty-reference">
      <summary>Warranty tiers <span>Tier quick reference</span></summary>
      <div class="warranty-reference-content">
        <p id="warranty-reference-note"></p>
        <table aria-label="Warranty tiers" aria-describedby="warranty-reference-note">
          <colgroup><col class="reference-tier-column"><col><col><col></colgroup>
          <thead><tr><th scope="col">Tier</th><th scope="col">Ticket total <span>tax included</span></th><th scope="col">Warranty cost</th><th scope="col">Max repair price <span>before tax</span></th></tr></thead>
          <tbody id="warranty-reference-rows"></tbody>
        </table>
      </div>
    </details>
    <footer><span>Built for the PhoneFix DFW counter.</span><span>Calculated on this device · No data sent</span></footer>
  </main>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const form = element<HTMLFormElement>('ticket-form');
const priceInput = element<HTMLInputElement>('price');
const partInput = element<HTMLInputElement>('part-cost');
const screenInput = element<HTMLInputElement>('screen-repair');
const cardInput = element<HTMLInputElement>('card');
const fields = ['price-value', 'tax-value', 'total-value', 'part-value', 'card-value', 'warranty-value'];
const percent = (bps: number): string => `${bps / 100}%`;

let config: ShopConfig = loadSettings();
function updateRates(): void {
  element('rates-note').textContent = `Shop rates: ${percent(config.salesTaxBps)} sales tax · ${percent(config.cardFeeBps)} + ${formatMoney(config.cardFixedFee)} card fee on the total after tax.`;
  element('tax-label').textContent = `Sales tax · ${percent(config.salesTaxBps)}`;
  element('warranty-reference-note').textContent = `Screen warranty tiers at ${percent(config.salesTaxBps)} sales tax. Ranges include both endpoints. The current ticket’s tier is highlighted.`;
  element('warranty-reference-rows').innerHTML = getWarrantyTierReference(config).map((tier, index) => `
    <tr>
      <th scope="row">${index + 1}</th>
      <td>${formatMoney(tier.min)} ${tier.max === null ? 'and up' : `– ${formatMoney(tier.max)}`}</td>
      <td>${formatMoney(tier.cost)}</td>
      <td class="reference-max">${tier.maxRepairPrice === null ? '—' : formatMoney(tier.maxRepairPrice)}</td>
    </tr>`).join('');
}
updateRates();

function highlightWarrantyTier(index: number | null): void {
  element('warranty-reference-rows').querySelectorAll('tr').forEach((row, rowIndex) => {
    if (rowIndex === index) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  });
}

function setError(input: HTMLInputElement, errorId: string, message?: string): void {
  input.setAttribute('aria-invalid', String(Boolean(message)));
  const error = element(errorId);
  error.hidden = !message;
  error.textContent = message ?? '';
}

function showResult(result: TicketResult): void {
  highlightWarrantyTier(result.warrantyTierIndex);
  const loss = result.netProfit < 0;
  element('results-heading').textContent = loss ? 'Net loss' : 'Net profit';
  element('profit').textContent = formatMoney(result.netProfit);
  element('profit-status').textContent = loss ? 'Loss' : 'After repair costs';
  element('profit').closest('.profit-card')!.classList.toggle('is-loss', loss);
  element('margin').textContent = `${((result.margin ?? 0) * 100).toFixed(1)}% margin · before overhead`;
  const values = [result.price, result.tax, result.ticketTotal, result.partCost, result.cardFee, result.warranty];
  fields.forEach((id, index) => { element(id).textContent = formatMoney(values[index]); });
  element('card-detail').textContent = cardInput.checked ? `${percent(config.cardFeeBps)} + ${formatMoney(config.cardFixedFee)}` : 'cash · no fee';
  element('warranty-detail').textContent = result.warrantyTierIndex === null ? 'not a screen repair' : `tier ${result.warrantyTierIndex + 1} · 1 year`;

  const hint = result.warrantyPricing?.lowerTierHint;
  element('cliff-hint').hidden = !hint;
  if (hint) {
    const comparison = hint.gain === 0 ? 'the same profit as' : `${formatMoney(hint.gain)} more than`;
    element('cliff-copy').textContent = `At ${formatMoney(hint.price)}, the warranty costs ${formatMoney(hint.warranty)}. You'd make ${comparison} at ${formatMoney(result.price)}.`;
    element('cliff-profit').textContent = `Net profit at ${formatMoney(hint.price)}: ${formatMoney(hint.profit)}`;
  }
  element('tier-limit').hidden = !result.warrantyPricing;
  if (result.warrantyPricing) {
    const cap = result.warrantyPricing.currentTierMaxPrice;
    element('tier-limit').textContent = cap === null
      ? 'You’re in the highest warranty tier. There are no further warranty increases.'
      : `You can charge up to ${formatMoney(cap)} before the warranty goes up (before-tax price).`;
  }
}

function clearResult(message: string): void {
  highlightWarrantyTier(null);
  element('results-heading').textContent = 'Net profit';
  element('profit').textContent = '—';
  element('profit-status').textContent = 'Ready to calculate';
  element('profit').closest('.profit-card')!.classList.remove('is-loss');
  element('margin').textContent = 'Your take-home profit before overhead';
  fields.forEach((id) => { element(id).textContent = '—'; });
  element('card-detail').textContent = '';
  element('warranty-detail').textContent = '';
  element('cliff-hint').hidden = true;
  element('tier-limit').hidden = true;
  element('input-status').textContent = message;
  element('input-status').hidden = false;
}

function update(): void {
  const price = parseMoney(priceInput.value);
  const part = parseMoney(partInput.value);
  // An untouched or cleared price is the useful empty state, not an error.
  setError(priceInput, 'price-error', priceInput.value ? price.error : undefined);
  setError(partInput, 'part-error', part.error);
  if (price.cents === undefined || part.cents === undefined) {
    clearResult(!priceInput.value ? 'Enter a repair price to see your profit.' : 'Check the amounts to see your profit.');
    return;
  }
  if (price.cents === 0) {
    clearResult('Enter a repair price above $0.00 to see your profit.');
    return;
  }
  const result = calculateTicket({ price: price.cents, partCost: part.cents, screenRepair: screenInput.checked, payment: cardInput.checked ? 'card' : 'cash' }, config);
  showResult(result);
  element('input-status').hidden = true;
}

setupSettings(element('settings-panel'), element<HTMLButtonElement>('settings-toggle'), config, (next) => {
  config = next;
  updateRates();
  update();
}, DEFAULT_CONFIG);
form.addEventListener('input', update);
form.addEventListener('submit', (event) => { event.preventDefault(); });
element('clear').addEventListener('click', () => {
  form.reset();
  update();
  priceInput.focus();
});
update();
