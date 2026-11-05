# PhoneFix DFW repair profit calculator

A small, static Vite + TypeScript app for pricing one repair at the shop counter. Runs entirely in the browser, with no backend, tracking, external fonts, or application network requests. Shop settings are saved in this browser; no data is sent.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
# Custom preview port (the server fails if the port is occupied):
PORT=5795 npm run dev
```

The dev server listens on all interfaces; the default port is 5173. `PORT` is read in `vite.config.ts`.

```sh
npm run build       # TypeScript check, then static files in dist/
npm run preview     # Serve the production build locally
npm test            # Vitest unit tests
npx playwright install chromium
npm run test:e2e    # Desktop Chromium and 390px phone smoke tests
```

Run `npm run build` before the e2e suite, which also checks the generated search-engine directives in `dist/`. Playwright starts the dev server on port 5795 (or `PORT`) and stops it afterward; locally it can reuse an existing server. CI installs Chromium and runs build, unit tests and browser tests. Deploy the contents of `dist/` to a static host.

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

- Default to a screen repair paid by card, with $0 parts. Clear restores these defaults and focuses the blank price for the next ticket.
- Enter dollars and up to two decimal places, without currency signs, commas or exponent notation. Negative, blank, malformed or excessive amounts show a short message and clear the result. A zero entered repair price shows a prompt. A positive price discounted to zero shows the actual loss, including parts, warranty and any fixed card fee.
- Price and parts are each capped at **$999,999.99** to reject accidental huge input and keep the counter UI readable. The pure engine accepts zero cents but rejects negative, fractional, non-finite and over-limit monetary inputs.
- Losses show a red result and a “Loss” label. The margin is rounded to one decimal place for display.
- The layout supports desktop and phone widths with labeled decimal inputs and keyboard-accessible controls. Live results do not move focus.

## Shop settings

Open **Settings** from the calculator to edit the default target profit, tax rate, card percentage and fixed fee, and screen-warranty tiers. Save applies changes to the current ticket immediately and stores them in this browser's localStorage. Settings are specific to the browser and device; clearing site data removes them. Missing, invalid, or corrupt saved settings fall back to the defaults in `src/config.ts`. If browser storage is unavailable, the app reports that saving failed.

Enter percentages and dollar amounts with up to two decimal places. Rates must be non-negative and at most 10,000%; amounts are capped at $999,999.99. Tier endpoints are inclusive: start at $0.00, put each next tier one cent above the preceding upper bound, and leave only the final upper bound blank for “and up”. Add or remove rows as needed. Invalid settings show inline errors and cannot be saved. **Reset to defaults** asks for confirmation, clears saved settings, and immediately restores the shop defaults.

## Target-profit pricing, discounts and labor time

Choose **What should I charge?** to enter a target profit with the same part cost, screen-repair and payment controls. The default target is **$80.00**, editable in Settings. Saving or resetting settings applies that default to the target field; Clear restores it. Older saved settings retain their rates and tiers and gain the $80 default.

`findTargetPrice` in `src/calc.ts` returns the **lowest pre-tax cent price** meeting the target, with a full `calculateTicket` breakdown. It searches each warranty tier separately, in price order. Exact integer bounds narrow the usual cent search. For unusual rates near or above a 100% effective card fee, a bounded search of 10,000 tax-rounding residues solves the exact half-up inequality. It does not assume profit is monotonic, even within a tier. Every suggested result is verified by `calculateTicket`. Targets that cannot be reached within the $999,999.99 price limit show a message.

The **nice price** is the first price at or above the minimum ending in .99. Its actual profit is shown, including a warning if crossing a warranty cliff puts it below the target. A boundary note shows how far a suggested price sits above the preceding tier's highest repair price.

Hand check with the default settings, screen warranty, card payment, $50 parts and $80 target:

- $162.03 × 8.25% = $13.367475 → **$13.37** tax, total **$175.40**.
- $175.40 × 2% = $3.508 → **$3.51** fee; warranty tier 3 costs **$28.52**.
- $162.03 − $50 − $3.51 − $28.52 = **$80.00** profit.
- At $162.02, tax and fees remain the same, so profit is **$79.99**.

In **Profit from a price** mode, the optional discount accepts a dollar amount or a percentage with up to two decimal places. Percent discounts round half-up to cents before subtraction. Tax, ticket total, card fee, warranty tier and margin use the discounted price. The result compares profit with and without the discount and flags warranty savings. For example, discounting $93 by $0.63 moves the total from $100.67 to $99.99: the warranty falls from $21.89 to $15.26, and profit **increases $6.01**. Discounts must be nonnegative and cannot exceed the price or 100%; an empty discount means zero.

Optional **labor minutes** works in both modes. It accepts up to two decimal places, from zero to 999,999.99 minutes. `calculateProfitPerHour` takes integer hundredths of a minute and rounds the final hourly profit to cents, half-up (away from zero on a loss). $80 over 45 minutes is **$106.67/hr**. Empty or zero time displays “—”; invalid time shows an inline error and hides the hourly result. Labor time never subtracts a cost or changes the ticket's profit.
