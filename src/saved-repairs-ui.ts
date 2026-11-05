import { formatMoney } from './money';
import { loadSavedRepairs, MAX_REPAIR_NAME_LENGTH, saveSavedRepairs, validateRepair, type RepairDraft, type SavedRepair } from './saved-repairs';

export function setupSavedRepairs(panel: HTMLElement, onLoad: (repair: SavedRepair) => void): (draft: RepairDraft) => void {
  let repairs = loadSavedRepairs();
  let editingId: string | undefined;
  panel.innerHTML = `
    <div class="panel-heading"><div><p class="eyebrow">YOUR COMMON JOBS</p><h2>Saved repairs</h2></div><button id="add-repair" class="primary-button" type="button">Add repair</button></div>
    <p class="settings-help">Tap a repair to fill the calculator. Saved on this browser.</p>
    <form id="repair-form" class="repair-form" aria-labelledby="repair-form-heading" novalidate hidden>
      <h3 id="repair-form-heading">Add repair</h3>
      <div class="settings-field"><label for="repair-name">Repair name</label><input id="repair-name" data-key="name" type="text" maxlength="${MAX_REPAIR_NAME_LENGTH}" autocomplete="off" aria-describedby="repair-error-name"><p id="repair-error-name" class="field-error" hidden></p></div>
      <div class="repair-fields">
        <div class="settings-field"><label for="repair-part">Part cost ($)</label><input id="repair-part" data-key="partCost" type="text" inputmode="decimal" aria-describedby="repair-error-partCost"><p id="repair-error-partCost" class="field-error" hidden></p></div>
        <div class="settings-field"><label for="repair-price">Usual price ($), before tax</label><input id="repair-price" data-key="price" type="text" inputmode="decimal" aria-describedby="repair-error-price"><p id="repair-error-price" class="field-error" hidden></p></div>
        <div class="settings-field"><label for="repair-labor">Labor minutes (optional)</label><input id="repair-labor" data-key="laborMinutes" type="text" inputmode="decimal" aria-describedby="repair-error-laborMinutes"><p id="repair-error-laborMinutes" class="field-error" hidden></p></div>
      </div>
      <label class="screen-option"><input id="repair-screen" type="checkbox"><span class="option-title">Include screen warranty</span></label>
      <div class="settings-actions"><button class="primary-button" type="submit">Save repair</button><button id="cancel-repair" class="clear-button" type="button">Cancel</button></div>
    </form>
    <div id="repair-search-field" class="settings-field repair-search" hidden><label for="repair-search">Search saved repairs</label><input id="repair-search" type="search" autocomplete="off" placeholder="Search by name"></div>
    <p id="repairs-status" class="settings-status" role="status"></p>
    <p id="repairs-empty" class="settings-help"></p>
    <ul id="repair-list" class="repair-list" aria-label="Saved repairs"></ul>`;
  const find = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>('#repair-form');
  const input = (key: string) => find<HTMLInputElement>(`[data-key="${key}"]`);
  const screen = find<HTMLInputElement>('#repair-screen');
  const search = find<HTMLInputElement>('#repair-search');
  const status = find<HTMLElement>('#repairs-status');
  const list = find<HTMLUListElement>('#repair-list');
  const add = find<HTMLButtonElement>('#add-repair');

  function openForm(draft: RepairDraft, id?: string): void {
    editingId = id;
    for (const key of ['name', 'partCost', 'price', 'laborMinutes'] as const) input(key).value = draft[key];
    screen.checked = draft.screenRepair;
    form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
    form.querySelectorAll<HTMLElement>('.field-error').forEach((node) => { node.hidden = true; });
    find<HTMLElement>('#repair-form-heading').textContent = id ? 'Edit repair' : 'Add repair';
    status.textContent = '';
    form.hidden = false;
    input('name').focus();
  }

  function persist(next: SavedRepair[], message: string): boolean {
    if (!saveSavedRepairs(next)) {
      status.textContent = 'Could not save repairs in this browser. Check browser storage and try again.';
      return false;
    }
    repairs = next;
    status.textContent = message;
    render();
    return true;
  }

  function render(): void {
    const searchVisible = repairs.length > 10;
    find<HTMLElement>('#repair-search-field').hidden = !searchVisible;
    if (!searchVisible) search.value = '';
    const matches = repairs.filter((repair) => repair.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
    list.replaceChildren();
    const empty = find<HTMLElement>('#repairs-empty');
    empty.hidden = matches.length > 0;
    empty.textContent = repairs.length ? 'No repairs match your search.' : 'No saved repairs yet. Add a common job or save the current calculator inputs.';
    matches.forEach((repair) => {
      const row = document.createElement('li');
      row.className = 'repair-row';
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'repair-load';
      const name = document.createElement('span');
      name.className = 'repair-title';
      name.textContent = repair.name;
      const detail = document.createElement('span');
      detail.className = 'repair-detail';
      detail.textContent = `${formatMoney(repair.price)} before tax · ${repair.screenRepair ? 'Screen repair' : 'Other repair'}${repair.laborHundredths === undefined ? '' : ` · ${repair.laborHundredths / 100} min`}`;
      load.append(name, detail);
      load.addEventListener('click', () => onLoad(repair));
      const actions = document.createElement('div');
      actions.className = 'repair-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'clear-button';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${repair.name}`);
      edit.addEventListener('click', () => openForm({ name: repair.name, partCost: (repair.partCost / 100).toFixed(2), price: (repair.price / 100).toFixed(2),
        screenRepair: repair.screenRepair, laborMinutes: repair.laborHundredths === undefined ? '' : (repair.laborHundredths / 100).toFixed(2) }, repair.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'clear-button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${repair.name}`);
      remove.addEventListener('click', () => {
        if (!window.confirm(`Delete “${repair.name}” from saved repairs?`)) return;
        if (persist(repairs.filter((item) => item.id !== repair.id), 'Repair deleted.')) {
          if (editingId === repair.id) form.hidden = true;
          add.focus();
        }
      });
      actions.append(edit, remove);
      row.append(load, actions);
      list.append(row);
    });
  }

  add.addEventListener('click', () => openForm({ name: '', partCost: '0.00', price: '', screenRepair: true, laborMinutes: '' }));
  find<HTMLButtonElement>('#cancel-repair').addEventListener('click', () => { form.hidden = true; add.focus(); });
  search.addEventListener('input', render);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateRepair({ name: input('name').value, partCost: input('partCost').value, price: input('price').value,
      screenRepair: screen.checked, laborMinutes: input('laborMinutes').value });
    for (const key of ['name', 'partCost', 'price', 'laborMinutes']) {
      const message = result.errors[key];
      input(key).setAttribute('aria-invalid', String(Boolean(message)));
      const error = find<HTMLElement>(`#repair-error-${key}`);
      error.textContent = message ?? '';
      error.hidden = !message;
    }
    if (!result.repair) {
      status.textContent = 'Check the highlighted fields before saving.';
      form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    // getRandomValues also works on HTTP shop-network addresses, where randomUUID may be unavailable.
    const repair = { ...result.repair, id: editingId ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join('-') };
    const next = editingId ? repairs.map((item) => item.id === editingId ? repair : item) : [...repairs, repair];
    if (persist(next, editingId ? 'Repair updated.' : 'Repair saved.')) { form.hidden = true; add.focus(); }
  });
  render();
  return (draft) => openForm(draft);
}
