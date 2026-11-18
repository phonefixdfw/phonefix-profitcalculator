# PhoneFix DFW repair profit calculator

A small, static Vite + TypeScript app for pricing one repair at the shop counter. Runs entirely in the browser, with no backend, tracking, external fonts, or application network requests. Shop settings and saved repairs are saved in this browser; no data is sent.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
# Custom preview port (the server fails if the port is occupied):
PORT=5795 npm run dev
```

The dev server listens on all interfaces; the default port is 5173. `PORT` is read in `vite.config.ts`. Both dev and preview allow the shop's LAN hostname `taint`, the current machine's hostname, localhost and IP addresses, and fail if the requested port is occupied.

```sh
npm run build       # TypeScript check, then static files in dist/
npm run preview     # Serve the production build locally
npm test            # Vitest unit tests
npx playwright install chromium
npm run test:e2e    # Desktop Chromium and 390px phone smoke tests
```

Both dev and preview respect `PORT`; preview defaults to 4173. Run `npm run build` before the e2e suite. Playwright serves the production build on port 5795 (or `PORT`) and stops it afterward; locally it can reuse an existing preview server. The suite checks search-engine directives, installation, offline use, updates and settings transfer on desktop and a 390px phone. CI installs Chromium and runs build, unit tests and browser tests. Deploy the contents of `dist/` to a static host.

## Install and use offline

Visit `https://calc.phone-fix.com/` once while connected and let the page finish loading. Use the browser's **Install app** / **Add to Home Screen** menu to install on a phone or desktop. The production service worker precaches all built app files, including the locally bundled QR generator, manifest and icons. The app then opens and calculates without an internet connection. Settings still live in each browser's localStorage; clearing site data removes both settings and the offline cache.

Every production build generates a service worker with a content-based cache revision. On the next connected load it checks for a deploy; **Updated, reload** activates the downloaded update and reloads when convenient. Closing all app windows also lets a waiting update activate for the next launch. Old app caches are removed after activation; saved settings are retained. The app registers the worker only in production builds. When switching a preview origin to development, Vite serves a temporary cleanup worker at `/sw.js`: even a cached production page can update to it, remove only the app's precaches, unregister and reload controlled tabs into development. Saved settings and unrelated caches are retained. Serve over HTTPS (localhost also works); the host should revalidate `/sw.js` rather than cache it immutably.

The app icons are original calculator/phone artwork in `public/app-icon.svg`. To regenerate the committed PNGs after editing the artwork, install Playwright Chromium and run `node scripts/generate-icons.mjs`. The maskable version uses the same artwork inside its central safe area.

## Search engines

`public/robots.txt` is copied to the build root and disallows crawling for all user agents. The HTML includes `robots` (`noindex, nofollow, noarchive, nosnippet`) and `googlebot` (`noindex, nofollow`) meta directives. No sitemap or social preview tags are published. These directives rely on crawler compliance; the calculator remains publicly accessible without a login. No hosting header configuration is tracked in this repo; the host can also send `X-Robots-Tag: noindex, nofollow` on all paths.

## Rates and money contract

The owner's real rates live in **`src/config.ts`**, in `DEFAULT_CONFIG`: 8.25% sales tax, a 2% Square card fee on the tax-included total, a $0 fixed card fee, and all 12 screen-warranty tiers. These are shop-provided business inputs, not a tax-rate lookup. All money in config and calculation inputs/outputs is **integer cents**. Rates are integer basis points: 825 = 8.25%, 200 = 2%.

Warranty tiers are an ordered list of `{ min, max, cost }` in cents. Both bounds are inclusive; only the last tier has `max: null` (no upper limit). Tier selection uses the **tax-included ticket total**. Screen repairs include the shop-paid 1-year accidental damage warranty; other repairs have no warranty charge.

`calculateTicket(input, config = DEFAULT_CONFIG)` in **`src/calc.ts`** is pure and accepts custom `ShopConfig` values and receives the saved settings from the settings screen. Custom configs must have nonnegative integer basis-point rates, cent amounts, and contiguous ordered tiers covering zero upward.

## Calculation order and rounding

1. **Tax** = pre-tax repair price × tax rate, rounded half-up to the nearest cent. **Ticket total** = price + rounded tax.
2. **Card fee**, for card payments only = ticket total × card rate, rounded half-up to the nearest cent, plus the fixed fee in cents. Adding the integer fixed fee before or after rounding gives the same result. Cash has no fee.
3. **Warranty**, for screen repairs only = cost of the tier containing the ticket total.
4. **Net profit** = pre-tax price − part cost − card fee − warranty. Tax goes to the state: it is neither revenue nor a cost in this formula.
5. **Margin** = net profit ÷ pre-tax price. The engine returns `null` for a zero-price margin. This is profit before labor, overhead and income taxes.

Percentage calculations use integer `BigInt` arithmetic and explicit half-up rounding, so floating-point multiplication cannot move a ticket across a cent boundary. Only the final margin is a floating-point ratio. Input text is parsed directly into cents without rounding extra decimals.

Examples with a $0 part cost, card payment and screen repair:

| Price | Tax | Ticket total | Card fee | Warranty | Net profit |
| --- | --- | --- | --- | --- | --- |
| $91.00 | $7.51 | $98.51 | $1.97 | $15.26 (tier 1) | $73.77 |
| $93.00 | $7.67 | $100.67 | $2.01 | $21.89 (tier 2) | $69.10 |
| $92.37 | $7.62 | $99.99 | $2.00 | $15.26 (tier 1) | $75.11 |
| $92.38 | $7.62 | $100.00 | $2.00 | $21.89 (tier 2) | $68.49 |

## Warranty pricing hints

The engine binary-searches integer pre-tax cents to find the highest price whose **rounded** tax-included total fits in the previous tier. It recalculates profit using the same parts and payment method, and returns a hint only if that price earns the same or more profit. At $93, the hint recommends $92.37 and shows **$6.01 more profit** ($75.11). There is no lower-tier hint at $91.

It also returns the highest pre-tax price for the current tier, even when no lower-price hint applies. The first tier's cap is $92.37; the second is $138.56. The top tier has no cap. No warranty hints apply to non-screen repairs. Tests cover every tier boundary, all finite price caps (including the next cent), equal-profit hints, cash, custom settings, and the open-ended tier.

Open **Warranty tiers** below the calculator for a quick reference showing every tier's tax-included range, warranty cost, and highest repair price before tax. It uses the same rounded-tax search as the pricing hints and follows saved settings, including tax rate and tier edits. The current screen-repair tier is highlighted; the last tier says “and up” and has no maximum. The reference starts collapsed and sits after the inputs and results, so opening it does not move them on a phone.

## Counter behavior and input limits

- Open in **What should I charge?** (target-profit) mode, with the target set to the saved default, a screen repair paid by card and $0 parts. **Clear** restores these defaults, including the mode, and focuses part cost. Switch to **Profit from a price** at any time; the choice is not stored, so a reload or Clear returns to target mode.
- Enter dollars and up to two decimal places, without currency signs, commas or exponent notation. Negative, blank, malformed or excessive amounts show a short message and clear the result. A zero entered repair price shows a prompt. A positive price discounted to zero shows the actual loss, including parts, warranty and any fixed card fee.
- Price and parts are each capped at **$999,999.99** to reject accidental huge input and keep the counter UI readable. The pure engine accepts zero cents but rejects negative, fractional, non-finite and over-limit monetary inputs.
- Losses show a red result and a “Loss” label. The margin is rounded to one decimal place for display.
- The layout supports desktop and phone widths with labeled decimal inputs and keyboard-accessible controls. Live results do not move focus.

## Shop settings

Open **Settings** from the calculator to edit the default target profit, tax rate, card percentage and fixed fee, and screen-warranty tiers. Save applies changes to the current ticket immediately and stores them in this browser's localStorage. Settings are specific to the browser and device; clearing site data removes them. Missing, invalid, or corrupt saved settings fall back to the defaults in `src/config.ts`. If browser storage is unavailable, the app reports that saving failed.

To copy settings between devices, save any edits, then choose **Copy settings code**. It copies a text code and shows a QR code for `https://calc.phone-fix.com/#settings=<code>`. QR generation runs locally, without external requests. If clipboard access is unavailable, select and copy the displayed code manually. Scan the QR on the other device or paste the code into **Load settings code** and choose **Review settings code**. Review the current and incoming rates and every tier, then choose **Confirm and save settings**. Cancel or Escape leaves settings unchanged. Invalid, damaged or unsupported codes cannot change settings, and the import fragment is removed from the address bar as soon as it is read.

Transfer format v2 is `PF.<base64url JSON>.<checksum>`, with `{ v: 2, target: defaultTargetProfitCents, rates: [taxBps, cardBps, fixedFeeCents], tiers: [[minCents, maxCentsOrNull, costCents], ...] }`. The checksum is the first 12 bytes of SHA-256 of the encoded payload, encoded as base64url. It detects accidental corruption, not who created a code; confirmation remains required. Strict version, shape, integer, amount and tier validation prevents partial imports. Codes are limited to 20,000 characters; lists too large for a QR can still be copied as text. This version includes all shop settings, including the saved target profit. Saved repairs stay on this browser and are not included in settings codes. Older v1 codes without target profit, unknown versions and extra fields are rejected with a request to create a new code in the current app.

Enter percentages and dollar amounts with up to two decimal places. Rates must be non-negative and at most 10,000%; amounts are capped at $999,999.99. Tier endpoints are inclusive: start at $0.00, put each next tier one cent above the preceding upper bound, and leave only the final upper bound blank for “and up”. Add or remove rows as needed. Invalid settings show inline errors and cannot be saved. **Reset to defaults** asks for confirmation, clears saved settings, and immediately restores the shop defaults.

## Target-profit pricing, discounts and labor time

**What should I charge?** is the default mode on load and after Clear: enter a target profit with the same part cost, screen-repair and payment controls. The default target is **$80.00**, editable in Settings. Saving or resetting settings applies that default to the target field; Clear restores it. Older saved settings retain their rates and tiers and gain the $80 default.

`findTargetPrice` in `src/calc.ts` returns the **lowest pre-tax cent price** meeting the target, with a full `calculateTicket` breakdown. It searches each warranty tier separately, in price order. Exact integer bounds narrow the usual cent search. For unusual rates near or above a 100% effective card fee, a bounded search of 10,000 tax-rounding residues solves the exact half-up inequality. It does not assume profit is monotonic, even within a tier. Every suggested result is verified by `calculateTicket`. Targets that cannot be reached within the $999,999.99 price limit show a message.

The **nice price** is the first price at or above the minimum ending in .99. Its actual profit is shown, including a warning if crossing a warranty cliff puts it below the target. A boundary note shows how far a suggested price sits above the preceding tier's highest repair price.

Hand check with the default settings, screen warranty, card payment, $50 parts and $80 target:

- $162.03 × 8.25% = $13.367475 → **$13.37** tax, total **$175.40**.
- $175.40 × 2% = $3.508 → **$3.51** fee; warranty tier 3 costs **$28.52**.
- $162.03 − $50 − $3.51 − $28.52 = **$80.00** profit.
- At $162.02, tax and fees remain the same, so profit is **$79.99**.

### Recommended: top of tier

With the screen warranty checked, tiers are set by the **tax-included** total, so the warranty cost is the same anywhere inside a tier. Besides the **Lowest price that hits target**, the result shows **Recommended: top of tier**: the highest pre-tax price whose tax-included total is still within the lowest price's tier. It reuses `highestPriceForTotal` (the same inversion behind the tier reference table), so tax rounding is exact and the total never exceeds the tier max, even where rounding skips a total. The same example, $50 parts, $80 target, card:

- $162.03 has total $175.40, tier 3 (up to $199.99 with tax), warranty **$28.52**.
- $184.75 × 8.25% = $15.241875 → **$15.24** tax, total **$199.99**: still tier 3. $184.76 totals $200.00, which is tier 4.
- $199.99 × 2% = $3.9998 → **$4.00** fee. Profit $184.75 − $50 − $4.00 − $28.52 = **$102.23**, which is **$22.23** more than at $162.03 with the same warranty cost.

The supporting text is one short line each, for example `Total $199.99 with tax, still tier 3, same warranty. +$22.23 profit.` The top tier has no upper limit, so it shows no recommendation. With the warranty unchecked nothing changes. If the lowest price is already the top of its tier, the note says so and shows how much more the next tier's warranty costs.

**Drop a tier?** appears when the lowest price is in tier 2 or higher and the preceding tier's top price (`previousTierMaxPrice`) misses the target by no more than the warranty that dropping saves, i.e. the cost difference between the two tiers (`dropTierMaxShortfall`, exact integer cents). It shows that top price, its profit, how much it misses the target and the warranty saved, then the profit at the lowest and recommended prices, so you can judge whether the lower price is worth it. A lower tier that already met the target would itself be the lowest price, so the note never appears in that case.

Hand check, default settings, card, $0 parts, $76.50 target. The lowest price is **$100.57** (tier 2, warranty $21.89, profit $76.50) and the recommended top of tier is $138.56 ($113.67). Tier 1 tops out at $92.37: tax $7.62, total $99.99, fee $2.00, warranty $15.26, so profit is $92.37 − $2.00 − $15.26 = **$75.11**, which is $1.39 short. That is under the **$6.63** warranty saved (tier 2 − tier 1 = $21.89 − $15.26), so the result shows: `Drop a tier? $92.37 earns $75.11 (misses target by $1.39, saves $6.63 warranty) vs $76.50 at $100.57 / $113.67 at $138.56.` A $82.00 target misses by $6.89, more than $6.63, so no note. The **Nice price** (.99) line shows only if it lands in a costlier tier (or when the warranty is unchecked).

In **Profit from a price** mode, the optional discount accepts a dollar amount or a percentage with up to two decimal places. Percent discounts round half-up to cents before subtraction. Tax, ticket total, card fee, warranty tier and margin use the discounted price. The result compares profit with and without the discount and flags warranty savings. For example, discounting $93 by $0.63 moves the total from $100.67 to $99.99: the warranty falls from $21.89 to $15.26, and profit **increases $6.01**. Discounts must be nonnegative and cannot exceed the price or 100%; an empty discount means zero.

Optional **labor minutes** works in both modes. It accepts up to two decimal places, from zero to 999,999.99 minutes. `calculateProfitPerHour` takes integer hundredths of a minute and rounds the final hourly profit to cents, half-up (away from zero on a loss). $80 over 45 minutes is **$106.67/hr**. Empty or zero time displays “—”; invalid time shows an inline error and hides the hourly result. Labor time never subtracts a cost or changes the ticket's profit.

## Saved repairs and customer quotes

Use the **Calculator** and **Saved repairs** tabs with a tap or the left/right arrow keys. Home and End select the first and last tabs. Settings remains an inline panel above the tabs.

**Add repair** saves a name (up to 120 characters), part cost, usual pre-tax price, screen warranty choice, and optional labor minutes. Repairs appear A–Z, with a name search when there are more than ten. Edit a repair or delete it after confirmation. Tapping a repair fills the calculator, switches to **Profit from a price** mode (its saved price is the input), and clears any discount; the current card/cash choice stays in place. **Clear** also clears the loaded repair name.

**Save current as repair** opens a prefilled form. In Profit from a price mode, it uses the usual price before any discount. In target-profit mode, it uses the calculated minimum price. Payment and temporary discounts are not saved in a preset.

Repairs use their own localStorage key, `phonefix-saved-repairs`, containing `{ version: 1, repairs: [...] }`. Money is stored in integer cents and optional `laborHundredths` in hundredths of a minute. Missing, corrupt, invalid or unknown-version data starts with an empty list without modifying settings. Failed writes keep the form available with an error message. Saved repairs are specific to this browser and device; clearing site data removes them.

**Copy quote** copies plain text such as `iPhone 13 screen: $129.99 + tax = $140.71`. It uses the loaded repair name or “Repair”, the current discounted pre-tax price (or suggested minimum in target mode), and the calculator's rounded tax-included total. Quotes contain no parts, fees, warranty costs or profit. A brief “Copied” message confirms success. If clipboard access is unavailable or denied, the quote appears selected in a text box for the device's Copy command. Invalid or empty tickets disable copying.

## Chrome extension (private, toolbar popup)

The calculator is also packaged as a Manifest V3 Chrome extension that opens from the toolbar. It uses the same calculation, config, money and settings modules as the web app. Its permissions are listed under [Right-click price suggestion](#right-click-price-suggestion-extension-phase-2); it has no host access, makes no network requests and loads no remote code. It is loaded unpacked; it is not published to the Chrome Web Store.

Build it:

```sh
npm ci
npm run build:extension   # writes dist-extension/
```

Load it:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `dist-extension` folder.
3. Pin **PhoneFix Profit Calculator** from the puzzle-piece menu, then click its icon.

Update it: `git pull`, run `npm run build:extension` again, then click the reload icon on the extension's card in `chrome://extensions`.

Settings must be imported once. The extension has its own storage (`chrome.storage.local`), separate from `calc.phone-fix.com`, and the popup has no Settings button to keep it small. In the web app, open Settings and use **Copy settings code**. Then right-click the extension's toolbar icon, choose **Options** (it opens in a tab, or use **Details → Extension options** on `chrome://extensions`), paste the code into **Load settings code**, review and confirm. The Options page is the same Settings panel as the web app and the code format is unchanged. The popup picks the new rates up the next time it opens.

Screenshot: `docs/issue-23/popup.png`. The Playwright test `tests/extension.spec.ts` builds the extension and loads it in Chromium.

### Right-click price suggestion (extension phase 2)

On any vendor page, highlight a part price (for example `$16.38`, `$19.40` or `$37.03`), right-click and choose **Suggest repair price**. The extension treats the number as the **part cost** and shows a small result box next to the selection with the same target-profit result as the web app's **What should I charge?** mode: the lowest price that hits the target ("Charge") with its profit and, for screen repairs, **Recommended: top of tier** with the same short note (plus **Drop a tier?** when it applies).

- Defaults: screen repair (warranty on), card, and the saved default target profit from the settings you imported into the extension (see above; without an import, the built-in defaults are used).
- In the box you can edit the target profit and toggle **Screen repair** and **Cash**; the result updates as you type. Press **Escape**, click outside the box or use × to close it.
- The menu item appears only when text is selected. If the selection is not one clean price (a range like `$10 - $20`, several numbers, an empty or non-price selection, `$0.00`), the box says "Couldn't read a price" and shows no result. `src/price-parser.ts` reads the text into integer cents with the existing `parseMoney`, so no floating point is involved. It accepts an optional `$`, thousands commas, one or two decimals and short surrounding text such as `Price: $16.38 USD`; text around the number needs a `$` or `USD` marker.
- It works on any site; there is no site-specific scraping. The page is read only through the selected text the menu hands over; the result box is a single shadow-DOM element, so page styles and the box's styles do not affect each other.

Permissions (`extension/manifest.json`), all minimal:

| Permission | Why |
| --- | --- |
| `storage` | Keep the imported settings (phase 1). |
| `contextMenus` | The **Suggest repair price** item, shown only for a selection. |
| `activeTab` | Temporary access to the current tab after you choose the menu item. |
| `scripting` | Inject the result box into that tab. |

There are **no host permissions**, no network requests and no remote code. The result box script (`suggest-box.js`) ships inside the extension and is injected only when you choose the menu item.

After pulling, run `npm run build:extension` (it now also builds `suggest-box.js` and the background worker) and reload the extension in `chrome://extensions`; Chrome may ask you to accept the new permissions.

Tests: `src/price-parser.test.ts` (parser) and `tests/extension-context-menu.spec.ts` (loads the built extension in Chromium on `tests/fixtures/vendor-price.html`; Chrome's native menu can't be clicked from Playwright, so the test fires the same `contextMenus.onClicked` event and uses a test-only copy of the manifest with a host permission for the local fixture server; the shipped manifest is asserted to have none). Screenshot: `docs/issue-24/result-box.png` (uses made-up warranty costs, not the shop's).
