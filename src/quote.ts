import type { TicketResult } from './calc';
import { formatMoney } from './money';

/** Only customer-facing totals are read; internal ticket costs never enter a quote. */
export function formatQuote(name: string | undefined, ticket: Pick<TicketResult, 'price' | 'ticketTotal'>): string {
  const label = name?.trim().replace(/\s+/g, ' ') || 'Repair';
  return `${label}: ${formatMoney(ticket.price)} + tax = ${formatMoney(ticket.ticketTotal)}`;
}

export function setupQuote(panel: HTMLElement): (text: string) => void {
  const button = panel.querySelector<HTMLButtonElement>('#copy-quote')!;
  const status = panel.querySelector<HTMLElement>('#quote-status')!;
  const fallback = panel.querySelector<HTMLElement>('#quote-fallback')!;
  const selection = panel.querySelector<HTMLTextAreaElement>('#quote-text')!;
  let quote = '';
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  button.addEventListener('click', async () => {
    clearTimeout(timer);
    const current = revision;
    const text = quote;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (current !== revision) return;
      fallback.hidden = true;
      status.textContent = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => { status.textContent = ''; }, 2500);
    } catch {
      if (current !== revision) return;
      selection.value = text;
      fallback.hidden = false;
      selection.focus();
      selection.select();
      status.textContent = 'Copy the selected quote using your device’s Copy command.';
    }
  });
  return (text) => {
    if (text !== quote) {
      revision++;
      clearTimeout(timer);
      status.textContent = '';
      selection.value = '';
      fallback.hidden = true;
    }
    quote = text;
    button.disabled = !quote;
  };
}
