import { parseSelectedPrice } from './price-parser';
import { configFromStored, SETTINGS_KEY } from './settings';
import { EXTENSION_STORAGE_KEY } from './extension-storage';
import type { SuggestRequest } from './extension-suggest-box';

interface Tab { id?: number }
interface ClickInfo { menuItemId: string | number; selectionText?: string }
declare const chrome: {
  runtime: { onInstalled: { addListener(cb: () => void): void } };
  contextMenus: {
    create(props: { id: string; title: string; contexts: string[] }): void;
    removeAll(cb: () => void): void;
    onClicked: { addListener(cb: (info: ClickInfo, tab?: Tab) => void): void };
  };
  storage: { local: { get(key: string): Promise<Record<string, unknown>> } };
  scripting: {
    executeScript(injection: { target: { tabId: number }; files?: string[]; func?: (request: SuggestRequest) => void; args?: unknown[] }): Promise<unknown>;
  };
};

const MENU_ID = 'phonefix-suggest-price';

chrome.runtime.onInstalled.addListener(() => {
  // Shown only when text is selected.
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: MENU_ID, title: 'Suggest repair price', contexts: ['selection'] }));
});

async function loadConfig() {
  try {
    const stored = (await chrome.storage.local.get(EXTENSION_STORAGE_KEY))[EXTENSION_STORAGE_KEY] as Record<string, unknown> | undefined;
    const raw = stored?.[SETTINGS_KEY];
    return configFromStored(typeof raw === 'string' ? raw : null);
  } catch {
    return configFromStored(null);
  }
}

export async function handleMenuClick(info: ClickInfo, tab?: Tab): Promise<void> {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
  const request: SuggestRequest = {
    partCostCents: parseSelectedPrice(info.selectionText ?? ''),
    config: await loadConfig(),
  };
  const target = { tabId: tab.id };
  try {
    // activeTab (granted by this click) lets us inject into the current tab only.
    await chrome.scripting.executeScript({ target, files: ['suggest-box.js'] });
    await chrome.scripting.executeScript({ target, func: (req) => window.__phonefixSuggest?.(req), args: [request] });
  } catch { /* Pages Chrome does not allow scripts on (chrome://, the Web Store) just show nothing. */ }
}

chrome.contextMenus.onClicked.addListener((info, tab) => { void handleMenuClick(info, tab); });
