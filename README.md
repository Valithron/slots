# Commune Fortune

Commune Fortune is a private, static 3-by-3 slot-style game built with plain HTML, CSS, and JavaScript. It uses fake coins only. There is no backend, framework, build process, purchase flow, cash-out, or runtime dependency.

## Current feature set

- Five fixed paylines on three 24-stop reels
- Authoritative predetermined spin results
- Reload-safe, exactly-once settlement
- Better Spin Drama and manual left-to-right reel stopping
- Small, Nice, Big, and Commune Jackpot win tiers
- Tree of Life Wild and Tree Awakening
- Named Commune combinations and Full Commune
- Fortune Meter with a 1.5x charged paid spin
- Character Reaction Framework using all seven current portraits
- Commune Free Spins with retriggers, locked bets, persistence, and MVP summary
- Synthesized Web Audio cues
- Exact weighted simulator and automated regression tests

## Character Reaction Framework

Reaction presentation is centralized in `CONFIG.characterPresentation`.

Each member has:

```js
{
  name: "Sterling",
  base: "assets/symbols/sterling.svg",
  nice: null,
  big: null,
  accent: "#d3d8e8"
}
```

All portrait URLs pass through one helper:

```js
versionAssetUrl(path, CONFIG.characterPresentation.assetVersion)
```

This appends a version query so same-filename portrait uploads do not remain stale in browser or Cloudflare caches.

The fallback order is:

```text
requested reaction asset
then current base portrait
then generic Tree of Life presentation
```

Missing optional reaction assets never create a broken presentation. No alternate portraits are required in this release.

Pure reaction selection gives priority to Full Commune, named combinations, a unique dominant line winner, tied dominant winners, Tree-only wins, and finally no reaction. Ties remain group reactions rather than choosing an arbitrary person.

During free spins, reactions use a shorter compact mode. The final summary uses ordinary line-win attribution to select a unique MVP, tied group, Tree MVP, or neutral Commune result.

## Commune Free Spins

### Trigger

A paid spin triggers four free spins when the natural visible `originalMatrix` contains at least one Tree of Life on each reel:

```text
reel 1 has a Tree
and reel 2 has a Tree
and reel 3 has a Tree
```

Tree Awakening uses `resolvedMatrix` for line evaluation but cannot manufacture the free-spin trigger. The current strips produce the Three Trees event exactly once per 64 paid spins on average.

### Retrigger

The same natural Three Trees event during a free spin awards two additional spins. Retrigger spins are applied after the current free spin settles. A session may award no more than twenty total spins.

### Locked bet and Fortune interaction

Free spins use the line-bet index and total reference bet from the triggering paid spin.

Free spins:

- use all five paylines
- retain ordinary Wild substitution
- retain Tree Awakening
- retain Commune combinations
- retain win tiers, reactions, and manual stopping
- cost zero coins
- do not add Fortune points
- do not consume a charged Fortune Meter
- do not receive the 1.5x Fortune multiplier
- do not permit bet adjustment or Refill

A Fortune charge earned by the triggering paid spin remains stored for the next paid spin after the feature.

## Authoritative result model

Every result stores explicit classification:

```js
{
  spinType: "paid", // or "free"
  coinCost: 5,
  referenceBet: 5
}
```

`referenceBet` drives payout scaling, tier classification, and payout multiples. `coinCost` drives balance deductions, paid-wager statistics, and Fortune eligibility. Free spins therefore do not appear as extra paid wagers.

Trigger data is saved before reel animation:

```js
{
  freeSpinTrigger: {
    triggered: true,
    type: "three-trees",
    awardedSpins: 4,
    treeCells: [{ row: 0, reel: 0 }, { row: 2, reel: 1 }, { row: 1, reel: 2 }]
  }
}
```

## Persistence and recovery

The browser save includes the free-spin session, pending result, original and resolved matrices, feature rolls, trigger cells, settled presentation result, locked bet, accumulated win, retriggers, contribution totals, and summary status.

The session uses these statuses:

```text
intro
ready
spinning
presenting
complete
summary
```

Animation-frame progress is not stored. On reload, the authoritative result is restored and settled exactly once. Recovery handles refreshes during the trigger intro, free-spin motion, settlement, reaction, retrigger, and final summary without rerolls, lost spins, duplicated credits, duplicated retriggers, or Fortune changes.

## Exact math

At line bet 1 and total bet 5:

| Metric | Exact result |
| --- | ---: |
| Current RTP without free spins | 87.8188% |
| Three Trees paid trigger | 1.5625% |
| Average paid spins between triggers | 64.0000 |
| Incremental free-spin RTP | 5.6000% |
| Final combined RTP | 93.4188% |
| Average free spins per feature | 4.129032 |
| Average retriggers per feature | 0.064516 |
| Features with at least one retrigger | 6.1050% |
| Average feature payout | 17.919952 coins |
| Zero-pay feature frequency | 23.5401% |
| Maximum feature payout | 2,020 coins |
| Maximum trigger-plus-feature payout | 2,171 coins |
| Reaction framework RTP effect | 0.0000% |

See `docs/math-model.md` for the weighted transition model and full distributions.

## Commands

```bash
npm test
npm run simulate
npm run simulate:without-free-spins
npm run simulate:with-free-spins
node tools/simulate.mjs --check
node tools/simulate.mjs --json
```

The simulator enumerates all 55,296 weighted stop-and-Tree-roll outcomes, solves the Fortune stationary distribution, and then solves the bounded free-spin transition model exactly.

## Feature flags

The two new systems are independent:

```js
CONFIG.features.characterReactions
CONFIG.features.freeSpins
```

Supported configurations:

- reactions off, free spins off
- reactions on, free spins off
- reactions off, free spins on
- reactions on, free spins on

With free spins disabled, the current exact RTP remains 87.8188%. Reactions always have zero mathematical effect.

## Accessibility and reduced motion

Reaction and feature panels use meaningful labels, single final announcements, keyboard Skip, non-color text labels, decorative-image hiding, and no focus trap. Reduced motion replaces repeated movement with short fades, removes reaction pulsing and cabinet movement, shortens free-spin reactions, and keeps Skip behavior intact.

## Known limitations and deferred work

- Alternate reaction portraits, frame animations, and video expressions are deferred. The fallback framework is ready for them.
- Ally Selection and all seven ally abilities are deferred.
- No Scatter symbol is used. The existing Tree performs both Wild and trigger roles.
- Mystery modifiers, risk-or-collect, daily rewards, and secret events are deferred.
- Audio is synthesized. No imported audio is included.
- The project remains local-browser persistence only.
