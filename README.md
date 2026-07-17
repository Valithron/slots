# Commune Fortune

Commune Fortune is a private, static 3-by-3 slot-style game built with plain HTML, CSS, and JavaScript. It uses fake coins only. There is no backend, framework, build process, purchase flow, cash-out, or runtime dependency.

## Current feature set

- Five fixed paylines on three 24-stop reels
- Authoritative predetermined spin results
- Reload-safe, exactly-once settlement
- Better Spin Drama and manual left-to-right reel stopping
- Auto, Full, and Reduced visual-effects modes
- WebKit-safe mobile reel-stop and anticipation feedback
- Small, Nice, Big, and Commune Jackpot win tiers
- Tree of Life Wild and Tree Awakening
- Any-order named Commune Line combinations and Full Commune
- Fortune Meter with a 1.5x charged paid spin
- Character Reaction Framework using all seven current portraits
- Commune Free Spins with retriggers, locked bets, persistence, and MVP summary
- Synthesized Web Audio cues
- Exact weighted simulator and automated regression tests

## Visual effects modes

The Help panel includes a local visual-effects preference:

```text
Auto
Full
Reduced
```

- **Auto** follows the device or browser `prefers-reduced-motion` setting.
- **Full** uses the complete presentation allowed for the current device class.
- **Reduced** removes repeated pulsing and uses the shortest visible feedback.

The preference is saved in browser state as:

```js
visualEffectsMode: "auto" // "auto" | "full" | "reduced"
```

All reduced-motion decisions route through `app.effects.getMotionMode(state)` and `app.effects.isReducedMotionActive(state)`. Mobile tuning activates at 768 pixels or narrower or when a coarse pointer is reported. It changes presentation intensity only and has **0.0000% RTP effect**.

### Mobile WebKit stability

On iPhone Safari, iPhone Chrome, and many application browsers, the engine is WebKit. Transforming or filtering the clipped reel viewport, reel frame, or entire cabinet while the long reel strip is independently transform-animated can cause blank reels and severe clipping.

Mobile tactile feedback therefore keeps reel geometry stationary:

- no mobile reel-viewport bump transform
- no mobile frame filter animation
- no mobile cabinet movement
- stop feedback uses a short overlay flash
- final-reel anticipation uses an overlay glow

The mobile-safe classes are applied before reel construction and before any spin can start. Automated compositing guards prevent mobile viewport, frame, or cabinet movement from being reintroduced. Physical iPhone and in-app-browser verification is required before merge.

Desktop retains the existing localized movement where it is stable.

## Commune Line combinations

The dedicated Commune Line remains the middle row only. Named combinations trigger when their required three symbols appear in **any order** across that row.

They do not trigger on the top row, bottom row, vertical columns, diagonals, or other paylines. Combination detection always uses `originalMatrix`, so Tree Awakening cannot manufacture a combination.

| Combination | Required symbols | Award |
| --- | --- | ---: |
| KPs | Sterling, Cydney, Tree | 2× line bet |
| Walls | Ryan, Gabi, Tree | 2× line bet |
| Jaaps | Kenly, Cooper, Tree | 2× line bet |
| Brotherhood | Cooper, Sterling, Ryan | 3× line bet |
| Wives’ Circle | Kenly, Gabi, Cydney | 1× line bet |
| Household | Ashley, Sterling, Cydney | 2× line bet |
| Full Commune | All seven members visible and Tree in center | 5× total bet |

Full Commune remains a separate grid-wide special case and suppresses the lesser named combinations.

## Character Reaction Framework

Reaction presentation is centralized in `CONFIG.characterPresentation`. All portrait URLs pass through `versionAssetUrl`, and missing optional reaction variants fall back to the current base portrait and then to the Tree of Life.

Pure reaction selection gives priority to Full Commune, named combinations, a unique dominant line winner, tied dominant winners, Tree-only wins, and finally no reaction. During free spins, reactions use a shorter compact mode. The final summary uses ordinary line-win attribution to select a unique MVP, tied group, Tree MVP, or neutral Commune result.

## Commune Free Spins

A paid spin triggers four free spins when the natural visible `originalMatrix` contains at least one Tree of Life on each reel. The same natural Three Trees event during a free spin awards two additional spins, with a maximum of twenty total awarded spins.

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

The triggering line bet and reference total bet remain locked for the entire feature.

## Authoritative result and recovery model

Every result stores explicit paid/free classification, coin cost, reference bet, target stops, original and resolved matrices, feature rolls, transformations, line wins, combination wins, modifiers, trigger data, and settlement status before reel animation begins.

Animation progress is not persisted. On reload, the authoritative result is restored and settled exactly once. Recovery handles refreshes during reel movement, trigger intro, free-spin settlement, reaction, retrigger, and summary without rerolls, lost spins, duplicated credits, duplicated retriggers, or Fortune changes.

## Exact math

At line bet 1 and total bet 5, the production simulator enumerates all 55,296 weighted stop-and-Tree-roll outcomes, solves the Fortune stationary distribution, and solves the bounded free-spin transition model exactly.

| Metric | Previous exact-order model | New any-order model |
| --- | ---: | ---: |
| Base line RTP | 82.0023% | 82.0023% |
| Tree Awakening increment | 2.6215% | 2.6215% |
| Total combination RTP | 2.1759% | 2.7980% |
| Named combination RTP | 1.5972% | 2.2193% |
| Full Commune RTP | 0.5787% | 0.5787% |
| Fortune increment | 1.0190% | 1.1016% |
| RTP before free spins | 87.8188% | 88.5234% |
| Free-spin increment | 5.6000% | 5.6401% |
| Final combined RTP | 93.4188% | 94.1636% |
| Total RTP change | — | +0.7448 percentage points |
| Visual-effects RTP effect | 0.0000% | 0.0000% |

### Exact combination trigger frequencies

| Combination | Previous | New |
| --- | ---: | ---: |
| KPs | 0.1157% | 0.6944% |
| Walls | 0.1157% | 0.6076% |
| Jaaps | 0.1736% | 1.0489% |
| Brotherhood | 0.0868% | 0.5787% |
| Wives’ Circle | 0.4630% | 2.3438% |
| Household | 0.1736% | 1.1574% |
| Full Commune | 0.1157% | 0.1157% |

See `docs/math-model.md` for the exact contribution table and transition details.

## Commands

```bash
npm test
npm run simulate
npm run simulate:without-free-spins
npm run simulate:with-free-spins
node tools/simulate.mjs --check
node tools/simulate.mjs --json
```

## Feature flags

Character reactions and free spins remain independent feature flags:

```js
CONFIG.features.characterReactions
CONFIG.features.freeSpins
```

Visual-effects mode is a presentation preference rather than a feature flag and cannot change results, payouts, settlement, or RTP.

## Accessibility

Auto respects the operating-system reduced-motion preference. Reduced mode removes repeated movement and cabinet motion while keeping brief visible impact signaling, clear text labels, keyboard Skip, non-color labels, and meaningful announcements.

## Known limitations and deferred work

- Alternate reaction portraits, frame animations, and video expressions are deferred.
- Ally Selection and all seven ally abilities are deferred.
- No Scatter symbol is used. The existing Tree performs both Wild and trigger roles.
- Mystery modifiers, risk-or-collect, daily rewards, and secret events are deferred.
- Audio is synthesized. No imported audio is included.
- The project remains local-browser persistence only.