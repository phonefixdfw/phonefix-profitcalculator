import { createExtensionStorage, type StorageArea } from './extension-storage';

declare const chrome: { storage: { local: StorageArea } };

// The shared modules read and write localStorage synchronously. Back it with
// chrome.storage.local before they load so the calculator code stays identical.
const storage = await createExtensionStorage(chrome.storage.local);
Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
await import('./main');
// Loaded last so the extension layout wins over the shared stylesheet.
await import('./extension.css');
// The options page hosts the same Settings panel (and settings-code import); open it right away.
if (document.body.dataset.view === 'options') document.querySelector<HTMLButtonElement>('#settings-toggle')!.click();
