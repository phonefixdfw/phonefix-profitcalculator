import { findTargetPrice } from './calc';
import type { ShopConfig } from './config';
import { formatMoney, parseMoney } from './money';
import { summarizeTarget } from './target-summary';

export interface SuggestRequest {
  /** Part cost in cents, or null when the selection was not one clean price. */
  readonly partCostCents: number | null;
  readonly config: ShopConfig;
}

const HOST_ID = 'phonefix-suggest-box-host';

const STYLE = `
:host { all: initial; }
.box { position: fixed; z-index: 2147483647; top: 16px; right: 16px; width: 320px; max-width: calc(100vw - 32px); box-sizing: border-box;
  font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1f2937; background: #fff; border: 1px solid #cbd5e1;
  border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.25); padding: 12px 14px; }
.box * { box-sizing: border-box; }
h2 { margin: 0 0 6px; font-size: 13px; font-weight: 700; letter-spacing: .02em; color: #475569; text-transform: uppercase; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 4px 0; }
.big { font-size: 24px; font-weight: 700; color: #0f172a; }
.note { margin: 2px 0 6px; font-size: 12px; color: #475569; }
.drop { margin: 6px 0 0; font-size: 12px; color: #334155; }
label { font-size: 13px; }
.opts { display: flex; gap: 14px; margin: 8px 0 4px; flex-wrap: wrap; }
.opts label { display: inline-flex; align-items: center; gap: 4px; }
input[type=text] { width: 90px; padding: 3px 6px; font: inherit; border: 1px solid #94a3b8; border-radius: 6px; }
.error { color: #b91c1c; margin: 6px 0 0; }
hr { border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0; }
.close { position: absolute; top: 6px; right: 8px; border: 0; background: none; font-size: 18px; cursor: pointer; color: #64748b; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(label: string, value: HTMLElement | string, valueClass?: string): HTMLElement {
  const wrapper = el('div', 'row');
  wrapper.append(el('span', undefined, label), typeof value === 'string' ? el('span', valueClass, value) : value);
  return wrapper;
}

/** Where to place the box: beside the highlighted text, never off screen. */
function placeNearSelection(box: HTMLElement): void {
  const rect = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : null;
  if (!rect || (rect.width === 0 && rect.height === 0)) return;
  const width = 320;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 16));
  const below = rect.bottom + 10;
  const top = below + 240 > window.innerHeight ? Math.max(8, rect.top - 250) : below;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.right = 'auto';
}

export function showSuggestBox(request: SuggestRequest): void {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const box = el('div', 'box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Suggested repair price');
  root.append(style, box);

  function dismiss(): void {
    host.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
  }
  function onKey(event: KeyboardEvent): void { if (event.key === 'Escape') dismiss(); }
  function onOutside(event: Event): void { if (!event.composedPath().includes(host)) dismiss(); }

  const close = el('button', 'close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', dismiss);

  const { partCostCents, config } = request;
  if (typeof partCostCents !== 'number') { // null (or dropped in transit) means no clean price
    box.append(close, el('h2', undefined, 'Suggest repair price'), el('p', 'error', "Couldn't read a price. Highlight just one price, like $16.38."));
  } else {
    const target = el('input');
    target.type = 'text';
    target.inputMode = 'decimal';
    target.autocomplete = 'off';
    target.spellcheck = false;
    target.value = (config.defaultTargetProfit / 100).toFixed(2);
    target.id = 'target';
    const screen = el('input'); screen.type = 'checkbox'; screen.checked = true; screen.id = 'screen';
    const cash = el('input'); cash.type = 'checkbox'; cash.id = 'cash';
    const targetLabel = el('label', undefined, 'Target profit $');
    targetLabel.htmlFor = 'target';
    const screenLabel = el('label'); screenLabel.append(screen, 'Screen repair');
    const cashLabel = el('label'); cashLabel.append(cash, 'Cash');
    const opts = el('div', 'opts'); opts.append(screenLabel, cashLabel);
    const targetRow = el('div', 'row'); targetRow.append(targetLabel, target);
    const out = el('div');
    out.setAttribute('aria-live', 'polite');

    const render = (): void => {
      out.replaceChildren();
      const goal = parseMoney(target.value);
      if (goal.cents === undefined) { out.append(el('p', 'error', goal.error)); return; }
      let suggestion;
      try {
        suggestion = findTargetPrice({ partCost: partCostCents, targetProfit: goal.cents, screenRepair: screen.checked, payment: cash.checked ? 'cash' : 'card' }, config);
      } catch { suggestion = null; }
      if (!suggestion) { out.append(el('p', 'error', 'This target cannot be reached with these costs and fees.')); return; }
      const result = suggestion.minimum;
      out.append(row('Charge (before tax)', formatMoney(result.price), 'big'), row('Profit', formatMoney(result.netProfit)));
      const summary = summarizeTarget(suggestion);
      if (summary.topOfTier) {
        out.append(el('hr'), row('Recommended: top of tier', summary.topOfTier.price, 'big'), el('p', 'note', summary.topOfTier.note));
      }
      if (summary.dropTier) out.append(el('p', 'drop', summary.dropTier));
    };
    target.addEventListener('input', render);
    screen.addEventListener('change', render);
    cash.addEventListener('change', render);

    box.append(close, el('h2', undefined, 'Suggest repair price'), row('Part cost', formatMoney(partCostCents)), targetRow, opts, el('hr'), out);
    render();
  }

  document.documentElement.append(host);
  placeNearSelection(box);
  document.addEventListener('keydown', onKey, true);
  // Registered after the current event so the menu click that opened the box does not close it.
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
}

declare global { interface Window { __phonefixSuggest?: (request: SuggestRequest) => void } }
window.__phonefixSuggest = showSuggestBox;
