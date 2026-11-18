# PhoneFix DFW repair profit calculator

A small static Vite + TypeScript app for pricing one repair at the shop counter. It runs entirely in the browser: no backend, tracking, external fonts or application network requests. Shop settings and saved repairs live in this browser only. The same calculator is also packaged as a private Chrome extension (toolbar popup plus a right-click price suggestion).

- [Quick start](#quick-start)
- [Install and use offline](#install-and-use-offline) · [Search engines](#search-engines)
- [Rates and money contract](#rates-and-money-contract) · [Calculation order and rounding](#calculation-order-and-rounding)
- [Warranty pricing hints](#warranty-pricing-hints) · [Counter behavior and input limits](#counter-behavior-and-input-limits)
- [Shop settings](#shop-settings) · [Settings code format](#settings-code-format)
- [Target-profit pricing](#target-profit-pricing-what-should-i-charge) · [Discounts and labor time](#discounts-and-labor-time)
- [Saved repairs and customer quotes](#saved-repairs-and-customer-quotes)
- [Chrome extension](#chrome-extension-private-sideloaded)

## Quick start

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev                 # http://localhost:5173 (PORT=5795 npm run dev for another port)
```

| Command | What it does |
| --- | --- |
| `npm run build` | TypeScript check, then the static site in `dist/` (deploy that folder to any static host) |
| `npm run preview` | Serve the production build locally (port 4173, or `PORT`) |
| `npm test` | Vitest unit tests |
| `npx playwright install chromium` then `npm run test:e2e` | Browser tests on desktop Chromium and a 390px phone; run `npm run build` first |
| `npm run build:extension` | TypeScript check, then the Chrome extension in `dist-extension/` |
| `npm run typecheck` | TypeScript check only |

Dev and preview listen on all interfaces, fail if the port is taken, and allow the shop's LAN hostname `taint`, the machine's hostname, localhost and IP addresses (`vite.config.ts`). Playwright serves the production build on port 5795 (or `PORT`) and stops it afterward; locally it can reuse a running server. The e2e suite covers search-engine directives, installation, offline use, updates, settings transfer, saved repairs and the built extension. The extension tests run once, on desktop. CI (`.github/workflows/ci.yml`) runs install, build, unit tests and the e2e suite on every pull request and push to `main`.

## Install and use offline

Visit `https://calc.phone-fix.com/` once while connected and let the page finish loading, then use the browser's **Install app** / **Add to Home Screen** menu. The production service worker precaches every built file (including the locally bundled QR generator, manifest and icons), so the app opens and calculates without a connection. Clearing site data removes both settings and the offline cache.

Each production build gets a service worker with a content-based cache revision. On the next connected load the app checks for a deploy; **Updated, reload** activates the downloaded update and reloads when convenient. Closing all app windows also lets a waiting update activate on next launch. Old caches are removed after activation; saved settings are kept. The worker is registered only in production builds (never in the extension). When a preview origin is switched to the dev server, Vite serves a cleanup worker at `/sw.js` that removes only the app's precaches, unregisters and reloads controlled tabs. Serve over HTTPS (localhost also works) and have the host revalidate `/sw.js` rather than cache it immutably.

Icons are original artwork in `public/app-icon.svg`. To regenerate the committed PNGs after editing it, install Playwright Chromium and run `node scripts/generate-icons.mjs` (the maskable version reuses the artwork in its safe area).

## Search engines

`public/robots.txt` (copied to the build root) disallows all crawlers, and the HTML carries `robots` (`noindex, nofollow, noarchive, nosnippet`) and `googlebot` (`noindex, nofollow`) meta tags. No sitemap or social preview tags are published. These rely on crawler compliance; the calculator stays publicly reachable without a login. No hosting headers are tracked in this repo; the host can also send `X-Robots-Tag: noindex, nofollow`.

## Rates and money contract

The shop's rates live in **`src/config.ts`** (`DEFAULT_CONFIG`): 8.25% sales tax, a 2% Square card fee on the tax-included total, a $0 fixed card fee, an $80.00 default target profit and all 12 screen-warranty tiers. These are shop-provided inputs, not a tax-rate lookup. All money is **integer cents** and rates are integer **basis points** (825 = 8.25%, 200 = 2%).

Warranty tiers are an ordered list of `{ min, max, cost }` in cents. Both bounds are inclusive; only the last tier has `max: null` (no upper limit). The tier is chosen by the **tax-included ticket total**. Screen repairs include the shop-paid 1-year accidental damage warranty; other repairs have no warranty charge.

`calculateTicket(input, config = DEFAULT_CONFIG)` in **`src/calc.ts`** is pure and takes any `ShopConfig`, such as the saved settings. A custom config needs nonnegative integer basis-point rates and cent amounts, and contiguous ordered tiers that start at zero.

## Calculation order and rounding

1. **Tax** = pre-tax price × tax rate, rounded half-up to the cent. **Ticket total** = price + tax.
2. **Card fee** (card payments only) = ticket total × card rate, rounded half-up, plus the fixed fee. Cash has no fee.
3. **Warranty** (screen repairs only) = cost of the tier containing the ticket total.
4. **Net profit** = pre-tax price − part cost − card fee − warranty. Tax goes to the state, so it is neither revenue nor a cost here.
5. **Margin** = net profit ÷ pre-tax price (`null` for a zero price). This is profit before labor, overhead and income taxes.

Percentages use integer `BigInt` arithmetic with explicit half-up rounding, so floating point never moves a ticket across a cent boundary. Only the final margin is a floating-point ratio. Input text is parsed straight into cents; extra decimals are rejected, not rounded.

Examples ($0 parts, card, screen repair, default settings):

| Price | Tax | Ticket total | Card fee | Warranty | Net profit |
| --- | --- | --- | --- | --- | --- |
| $91.00 | $7.51 | $98.51 | $1.97 | $15.26 (tier 1) | $73.77 |
| $93.00 | $7.67 | $100.67 | $2.01 | $21.89 (tier 2) | $69.10 |
| $92.37 | $7.62 | $99.99 | $2.00 | $15.26 (tier 1) | $75.11 |
| $92.38 | $7.62 | $100.00 | $2.00 | $21.89 (tier 2) | $68.49 |

## Warranty pricing hints

In **Profit from a price** mode the engine binary-searches integer pre-tax cents for the highest price whose **rounded** tax-included total still fits in the previous tier. It recalculates profit with the same parts and payment, and shows a hint only if that price earns the same or more. At $93 the hint recommends $92.37 and **$6.01 more profit** ($75.11); at $91 there is no lower-tier hint. It also reports the highest pre-tax price of the current tier: $92.37 for tier 1, $138.56 for tier 2, and none for the open-ended top tier. Non-screen repairs get no warranty hints.

Open **Warranty tiers** below the calculator for a reference table of every tier's tax-included range, warranty cost and highest pre-tax repair price. It uses the same rounded-tax search, follows saved settings, highlights the current tier, and starts collapsed below the results so opening it never moves them on a phone.

## Counter behavior and input limits

- The app opens in **What should I charge?** (target-profit) mode with the saved default target, a screen repair, card payment and $0 parts. **Clear** restores these defaults, including the mode, and focuses part cost. Switch to **Profit from a price** at any time; the mode is not stored.
- Enter dollars with up to two decimals, without currency signs, commas or exponents. Negative, blank, malformed or excessive amounts show a short message and clear the result. A zero price shows a prompt; a positive price discounted to zero shows the actual loss.
- Price and parts are each capped at **$999,999.99**. The engine accepts zero but rejects negative, fractional, non-finite and over-limit amounts.
- Losses show a red result and a “Loss” label. Margin is displayed to one decimal place.
- The layout supports desktop and phone widths with labeled decimal inputs and keyboard-accessible controls. Live results never move focus.

## Shop settings

Open **Settings** to edit the default target profit, tax rate, card percentage and fixed fee, and the warranty tiers. **Save** applies immediately to the current ticket and stores the settings in this browser's localStorage (specific to the browser and device; clearing site data removes them). Missing, invalid or corrupt saved settings fall back to `src/config.ts`; if storage is unavailable the app says saving failed. Saving or resetting also sets the target field to the new default target.

Rules: percentages and dollar amounts take up to two decimals; rates are 0–10,000%; amounts are capped at $999,999.99. Tier endpoints are inclusive: start at $0.00, begin each tier one cent above the previous upper bound, and leave only the final upper bound blank for “and up”. Add or remove rows as needed. Invalid settings show inline errors and cannot be saved. **Reset to defaults** asks for confirmation, clears saved settings and restores `src/config.ts`.

**Copy settings between devices:** save any edits, choose **Copy settings code**, and either scan the QR code (it links to `https://calc.phone-fix.com/#settings=<code>`, generated locally) or copy the text; if the clipboard is unavailable, select the displayed code manually. On the other device, scan the QR or paste into **Load settings code** and choose **Review settings code**. Compare the current and incoming rates and every tier, then **Confirm and save settings**. Cancel or Escape changes nothing, invalid codes can never change settings, and the `#settings=` fragment is removed from the address bar as soon as it is read.

### Settings code format

`PF.<base64url JSON>.<checksum>` (version 2), where the JSON is `{ v: 2, target: defaultTargetProfitCents, rates: [taxBps, cardBps, fixedFeeCents], tiers: [[minCents, maxCentsOrNull, costCents], ...] }`. The checksum is the first 12 bytes of the SHA-256 of the encoded payload, base64url-encoded; it detects accidental corruption, not who made the code, so confirmation is always required. Strict validation of version, shape, integers, amounts and tiers prevents partial imports. Codes are limited to 20,000 characters (long tier lists too big for a QR can still be copied as text). Saved repairs are **not** included. Version 1 codes (no target profit), unknown versions and extra fields are rejected with a request to make a new code. Settings saved before the target profit existed keep their rates and tiers and gain the $80 default.

## Target-profit pricing (What should I charge?)

Enter a target profit with the usual part cost, screen-repair and payment controls. `findTargetPrice` in `src/calc.ts` returns the **lowest pre-tax cent price** that meets the target, with a full `calculateTicket` breakdown. It searches each warranty tier separately in price order, using exact integer bounds to narrow the cent search. For unusual rates near or above a 100% effective card fee, a bounded search over 10,000 tax-rounding residues solves the exact half-up inequality; profit is never assumed monotonic. Every result is verified by `calculateTicket`. A target that cannot be reached within $999,999.99 shows a message.

Hand check (defaults, screen warranty, card, $50 parts, $80 target):

- $162.03 × 8.25% = $13.367475 → **$13.37** tax, total **$175.40**.
- $175.40 × 2% = $3.508 → **$3.51** fee; tier 3 warranty **$28.52**.
- $162.03 − $50 − $3.51 − $28.52 = **$80.00**. At $162.02 the tax, total and warranty are the same but profit is **$79.99**.

### Recommended: top of tier

With the screen warranty on, the warranty cost is the same anywhere inside a tier, so the result also shows **Recommended: top of tier**: the highest pre-tax price whose tax-included total stays in the lowest price's tier. It reuses `highestPriceForTotal` (the same inversion behind the tier reference table), so rounding is exact and the total never exceeds the tier max. Same example:

- $162.03 totals $175.40, tier 3 (tax-included range up to $199.99), warranty $28.52.
- $184.75 × 8.25% = $15.241875 → **$15.24** tax, total **$199.99**, still tier 3; $184.76 totals $200.00, tier 4.
- Fee $199.99 × 2% = $3.9998 → $4.00. Profit $184.75 − $50 − $4.00 − $28.52 = **$102.23**, which is **$22.23** more than at $162.03.

The note under it is one line, e.g. `Total $199.99 with tax, still tier 3, same warranty. +$22.23 profit.` If the lowest price is already the top of its tier, the note says so and shows how much more the next tier's warranty costs. The open-ended top tier shows `None` and a note that it has no cap. Unchecking the warranty hides this section.

### Drop a tier?

When the lowest price is in tier 2 or higher and the previous tier's top price (`previousTierMaxPrice`) misses the target by no more than the warranty that dropping saves (the cost difference between the two tiers, `dropTierMaxShortfall`, in exact cents), the result adds a **Drop a tier?** line: that top price, its profit, how far it misses the target, the warranty saved, and the profit at the lowest and recommended prices. A lower tier that already met the target would itself be the lowest price, so the line never appears then.

Hand check (defaults, card, $0 parts, $76.50 target): the lowest price is **$100.57** (tier 2, warranty $21.89, profit $76.50) and the recommended top of tier is $138.56 ($113.67). Tier 1 tops out at $92.37: tax $7.62, total $99.99, fee $2.00, warranty $15.26, profit **$75.11**, which is $1.39 short. That is under the **$6.63** saved ($21.89 − $15.26), so the result says: `Drop a tier? $92.37 earns $75.11 (misses target by $1.39, saves $6.63 warranty) vs $76.50 at $100.57 / $113.67 at $138.56.` An $82.00 target misses by $6.89, more than $6.63, so there is no note.

### Nice price

A **Nice price** line (first price at or above the lowest price that ends in .99, with its actual profit) is shown only when the warranty is off, or when that price lands in a costlier warranty tier. It then states the extra warranty cost and whether profit falls below the target.

## Discounts and labor time

In **Profit from a price** mode, the optional discount is a dollar amount or a percentage with up to two decimals. Percent discounts round half-up to cents before subtraction. Tax, total, card fee, warranty tier and margin all use the discounted price, and the result compares profit with and without it and flags warranty savings. For example, discounting $93 by $0.63 moves the total from $100.67 to $99.99, the warranty falls from $21.89 to $15.26, and profit **increases $6.01**. A discount cannot exceed the price or 100%; empty means zero.

Optional **labor minutes** work in both modes (up to two decimals, 0–999,999.99). `calculateProfitPerHour` takes integer hundredths of a minute and rounds hourly profit to cents, half-up (away from zero on a loss): $80 over 45 minutes is **$106.67/hr**. Empty or zero time shows “—”, and invalid time shows an inline error. Labor never changes the ticket's profit.

## Saved repairs and customer quotes

The **Calculator** and **Saved repairs** tabs work by tap or the left/right arrow keys (Home/End jump to the first/last). Settings is an inline panel above the tabs.

**Add repair** saves a name (up to 120 characters), part cost, usual pre-tax price, screen-warranty choice and optional labor minutes. Repairs sort A–Z, with a name search once there are more than ten; edit them, or delete after confirmation. Tapping a repair fills the calculator, switches to **Profit from a price** with its saved price, clears any discount and keeps the current card/cash choice. **Clear** also clears the loaded repair name. **Save current as repair** opens a prefilled form: it uses the usual price in Profit from a price mode (before any discount) or the calculated lowest price in target mode. Payment and discounts are never saved.

Repairs are stored under the localStorage key `phonefix-saved-repairs` as `{ version: 1, repairs: [...] }`, with money in integer cents and optional `laborHundredths`. Missing, corrupt or unknown-version data starts an empty list without touching settings; a failed write keeps the form open with an error. Saved repairs are specific to the browser and device.

**Copy quote** copies plain text such as `iPhone 13 screen: $129.99 + tax = $140.71`: the loaded repair name (or “Repair”), the discounted pre-tax price (or the lowest price in target mode) and the rounded tax-included total, with no parts, fees, warranty or profit. “Copied” confirms; if the clipboard is unavailable the quote appears selected in a text box. Invalid or empty tickets disable copying.

## Chrome extension (private, sideloaded)

An internal Manifest V3 Chrome extension that reuses the same calculation, config, money and settings code as the web app. It is **not published** to the Chrome Web Store; each computer loads it unpacked from a local build. It has no host permissions, makes no network requests and loads no remote code.

### Install

```sh
npm ci
npm run build:extension      # writes dist-extension/
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** and choose the `dist-extension` folder.
3. Pin **PhoneFix Profit Calculator** from the puzzle-piece menu and click its icon to open the popup.

**Update:** `git pull`, run `npm run build:extension` again, then click the reload icon on the extension's card in `chrome://extensions`. If a release adds permissions, Chrome may ask you to accept them. There is no automatic update.

### Import your settings once

The extension keeps its own data in `chrome.storage.local`, separate from `calc.phone-fix.com`, so it starts with the built-in defaults from `src/config.ts` until you import. In the web app open **Settings → Copy settings code**. In Chrome, right-click the extension's toolbar icon and choose **Options** (or **Details → Extension options** on `chrome://extensions`), paste the code into **Load settings code**, review and confirm. Options is the same Settings panel and the same [code format](#settings-code-format). The popup and the right-click box pick up new settings the next time they open. Settings are not synced between computers, so repeat the import on each one.

### Popup

The toolbar popup is the full calculator (both modes, discounts, labor time, warranty tier reference, **Saved repairs** and **Copy quote**) in a compact 380px layout, without the intro block or a Settings button. Saved repairs inside the popup are kept in the extension's storage and are not shared with the web app or settings codes. Screenshot: `docs/issue-23/popup.png`.

### Right-click “Suggest repair price”

On a vendor page, highlight a part price (for example `$16.38`), right-click and choose **Suggest repair price**. The number is the **part cost**, and a small box next to the selection shows the same result as **What should I charge?**: the lowest price that hits the target with its profit and, for screen repairs, **Recommended: top of tier** and **Drop a tier?** when they apply.

- Defaults: screen repair, card, and the default target from the settings you imported.
- Edit the target profit or toggle **Screen repair** and **Cash** in the box; the result updates as you type. Close it with Escape, a click outside or ×.
- The menu item appears only when text is selected. The text must be one clean price; ranges (`$10 - $20`), several numbers, percentages, negatives, `$0.00` and non-price text show “Couldn't read a price” and no result. `src/price-parser.ts` accepts an optional `$`, thousands commas, one or two decimals and short surrounding text such as `Price: $16.38 USD` (text around the number needs a `$` or `USD`), and reads it into integer cents through `parseMoney`.
- It works on any site with no site-specific scraping. The page is read only through the selected text Chrome hands the extension, and the box is a single shadow-DOM element so page styles and the box's styles stay separate. Screenshot: `docs/issue-24/result-box.png` (uses made-up warranty costs).

### Permissions (`extension/manifest.json`)

| Permission | Why |
| --- | --- |
| `storage` | Keep the imported settings and saved repairs. |
| `contextMenus` | The **Suggest repair price** item, shown only for a selection. |
| `activeTab` | Temporary access to the current tab after you choose the menu item. |
| `scripting` | Inject the result box (`suggest-box.js`, bundled in the extension) into that tab. |

No host permissions, network requests or remote code.

### Known limits

- Chromium browsers only, sideloaded per computer, no auto-update and no settings sync (import and rebuild by hand).
- The popup has no Settings button; use Options. Saved repairs and settings are not shared between the extension and the web app.
- The right-click box cannot appear on pages Chrome does not let extensions script, such as `chrome://` pages and the Chrome Web Store; nothing is shown there.
- Only a single price in the selection is read; there is no scraping of a whole page.

### Extension tests

`src/price-parser.test.ts` and `src/extension-storage.test.ts` (unit); `tests/extension.spec.ts` builds the extension and drives the popup and Options in Chromium; `tests/extension-context-menu.spec.ts` loads it on `tests/fixtures/vendor-price.html`. Chrome's native context menu cannot be clicked from Playwright, so that test fires the same `contextMenus.onClicked` event and uses a test-only manifest copy with a host permission for the local fixture server; the shipped manifest is asserted to have none.
