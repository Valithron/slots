# Mobile usability and responsive presentation

This presentation pass changes layout and interaction only. Reel strips, RNG consumption, payout evaluation, Mystery and Strong Modifier behavior, Ally math, settlement, persistence, and simulation seeds remain unchanged.

## Choose Your Ally

The Ally picker uses a single overlay with three regions:

1. A compact header with the selection instruction.
2. One scrollable content region containing compact radio-card choices and the selected Ally description.
3. A persistent confirmation footer with a normal-height primary action.

The overlay uses dynamic viewport units with viewport-height fallbacks and safe-area padding. Opening it locks the cabinet scroll position; closing it restores the previous position and keyboard focus. The seven choices use native radio semantics, visible focus, a non-color-only checkmark, stable square portrait containers, and full wrapping for names and ability labels.

At 360 pixels and wider the picker prefers two columns. At narrower widths it falls back to one compact column. Short landscape screens use a wider grid while preserving the same one-scroll-owner structure.

## Supplemental references

Symbol payouts are collapsed by default under **Show symbol payouts**. Commune combination rules are separately collapsed under **Show Commune combinations** in Help. Neither disclosure state is persisted.

Expanded symbol cards read their values from the existing configured paytable. The responsive grid uses two columns on common phone widths and does not become a source of game math.

## Active feature HUD

The selected Ally occupies the full HUD row with a stable portrait, full name, full ability name, and current ability state. Free Spins, Total Awarded, Feature Win, and Locked Bet use a two-column metric grid with wrapping and tabular values.

## Feature summaries

The primary result is shown first as **Feature Complete** and **Total Win**. MVP information remains visible. Secondary statistics and Ally Bonus are retained behind **Show feature details**. The existing external Continue control and exactly-once settlement flow are unchanged.

## Overlay and text rules

Production overlays use bounded dynamic-viewport sizing, safe-area padding, and one content scroll owner where scrolling is required. Mechanically important labels wrap instead of using ellipsis. Static portraits and symbols reserve dimensions before loading and fall back without changing layout.

The pass does not add filters, transformed ancestors, source swaps, or new animation work to moving reel strips.

## QA and supported widths

`?qa=ally` adds a **Mobile Presentation** section that opens the production Ally sheet and previews the production active HUD, feature summary, payout disclosure, long modifier labels, large values, and missing-portrait fallback.

Automated presentation contracts cover:

- 320 × 568
- 360 × 640
- 375 × 667
- 390 × 844
- 430 × 932
- 667 × 375 landscape
- 844 × 390 landscape
- 768-pixel tablet width
- desktop widths

Run:

```sh
npm run test:mobile-ui
```

Physical iPhone Safari, iPhone Chrome, in-app WebKit, Android Chrome, browser-toolbar transitions, text zoom, background-and-return behavior, and real safe-area rendering still require branch-preview device review.
