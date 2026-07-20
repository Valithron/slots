# Mobile usability and responsive presentation

This presentation pass changes layout and interaction only. Reel strips, RNG consumption, payout evaluation, Fortune math, Mystery and Strong Modifier behavior, Ally abilities, free-spin counts, settlement, persistence, reactions, audio timing, and simulation seeds remain unchanged.

## Choose Your Ally

The Ally picker uses a single overlay with three regions:

1. A compact header with the selection instruction.
2. One scrollable content region containing compact radio-card choices and the selected Ally description.
3. A persistent confirmation footer with a normal-height primary action.

The overlay uses dynamic viewport units with viewport-height fallbacks and safe-area padding. Opening it locks the cabinet scroll position; closing it restores the previous position and keyboard focus. The seven choices use native radio semantics, visible focus, a non-color-only checkmark, stable square portrait containers, and full wrapping for names and ability labels.

## Compact active Ally play cluster

Once the Ally feature begins, the cabinet receives the scoped `ally-feature-active` presentation state. Mobile play is compressed into this order:

1. Compact Coins, Bet, and Last Win row
2. Slim Fortune row with the complete production meter
3. Compact Ally HUD
4. Conditional Mystery strip
5. Complete reel cabinet
6. Primary Spin, Stop, or Skip action

The Ally HUD contains one portrait row and one three-column metric row:

- Spins Left
- Feature Win
- Locked Bet

The selected Ally name, full ability name, and current production ability status remain visible. Status words such as `USED`, `READY`, `HIDDEN`, or `INSURANCE 35` are derived from the existing Ally state rather than invented display state. Total Awarded is removed from live play and remains available in the final details.

The first active-play render positions the mobile viewport at the HUD once per feature session. It does not scroll before every spin, during reel movement, or while the player is using manual Stop. Reduced-motion users receive an immediate rather than smooth position change.

## Wallet, Fortune, and Mystery presentation

The wallet values retain their existing bindings and become shorter only during active Ally play.

Fortune retains its icon, numeric value, progressbar semantics, fill animation, charged state, reduced-motion behavior, gains, consumption, and capacity. Only its outer spacing and height are reduced.

The Mystery strip is conditional:

- Zero Mystery spins and no modifier: hidden
- Modifier only: compact `NEXT` chip row
- Mystery spins only: compact count row
- Spins and modifier: one compact combined strip, wrapping to two rows only when required

The UI reads the production Mystery state and never calls queue, consume, or settlement functions. Long normal and Strong Modifier labels wrap without ellipsis.

## Short-height and landscape behavior

Height-aware presentation tuning is applied below 700 and 620 CSS pixels. It reduces gaps, static card padding, decorative chrome, Fortune spacing, Mystery spacing, and static reel-cell dimensions through normal layout sizing. It never transform-scales the reel cabinet or modifies moving reel-strip transforms.

Supported composition targets include:

- 320 × 568
- 360 × 640
- 375 × 667
- 390 × 844
- 430 × 932
- short mobile landscape
- tablet and desktop widths

On common mobile widths, the compact Ally HUD, complete reel window, and primary action are intended to remain in one useful frame. At 320 pixels, secondary wallet and queue presentation use their most compressed valid form.

## Feature-complete summary

When the session reaches Summary:

- The active Ally HUD is hidden.
- The live Fortune and Mystery panels collapse.
- Ordinary bet, refill, sound, and reel controls remain disabled and are hidden behind the summary.
- The existing primary action button is moved into the summary card and rendered as a 50-pixel rectangular Continue button.
- The same production Continue route dismisses the presentation once; no second settlement path is introduced.
- Secondary statistics remain in a native details disclosure.
- The disclosure renders one state label: `Show feature details` when collapsed and `Hide feature details` when expanded.
- A queued Mystery spin or modifier remains intact and may be shown as a compact next-spin note inside the summary.

The primary summary remains:

- Feature Complete
- Total Win
- MVP
- Continue

## QA collision handling

When the Ally picker, active play cluster, or feature summary is the primary surface, the QA drawer automatically collapses to its small edge badge. It does not cover Spin, Stop, reel controls, or Continue. Production mode is unaffected because QA controls are absent.

## QA previews

`?qa=ally` provides deterministic production-component previews for:

- Active Ally feature with 4 or 12 spins
- Ability ready and used states
- Large Feature Win and Locked Bet
- Empty, modifier-only, Mystery-spins-only, and combined Mystery states
- Feature Complete, queued-next summary, and expanded details
- Long Strong Modifier labels, large balances, and portrait fallback

These previews are display-only and do not change saved progress, queues, odds, or settlement.

## Validation

Run:

```sh
git diff --check
npm test
npm run test:mobile-ui
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
```

Physical iPhone Safari, iPhone Chrome, the in-app WebKit browser, Android Chrome when available, browser-toolbar transitions, rotation, text zoom, background-and-return behavior, and real safe-area rendering remain required branch-preview checks.
