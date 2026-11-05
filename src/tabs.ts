/** Automatically activated tabs with one tab stop and wrapping arrow navigation. */
export function setupTabs(tablist: HTMLElement): (id: string) => void {
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  function select(id: string): void {
    tabs.forEach((tab) => {
      const selected = tab.id === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')!)!.hidden = !selected;
      if (selected) tab.focus();
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.id));
    tab.addEventListener('keydown', (event) => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next !== null) { event.preventDefault(); select(tabs[next].id); }
    });
  });
  return select;
}
