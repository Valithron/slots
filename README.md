# Commune Fortune

Commune Fortune is a private, static 3-by-3 slot-style game built with plain HTML, CSS, and JavaScript. It uses fake coins only. There is no backend, framework, build process, purchase flow, cash-out, or runtime dependency.

## Current feature set

- Five fixed paylines on three 24-stop reels
- Authoritative predetermined spin results
- Reload-safe, exactly-once settlement
- Manual left-to-right reel stopping
- Auto, Full, and Reduced visual-effects modes
- Mobile WebKit compositing safeguards
- Small, Nice, Big, and Commune Jackpot win tiers
- Tree of Life Wild and Tree Awakening
- Any-order named Commune Line combinations and Full Commune
- Fortune Meter with a 1.5x charged paid spin
- Mystery Scatter Tokens that count anywhere on the visible grid
- Persistent, stackable one-spin Mystery Modifiers
- Chainable Mystery Free Spin tickets that use the ordinary base-game flow
- Mystery-awarded spins that extend the active Ally feature up to its safety cap
- Character Reaction Framework using the seven existing portraits
- Commune Free Spins with retriggers, locked bets, persistence, and MVP summary
- Choose Your Ally with seven mutually exclusive free-spin abilities
- Exact transition simulator, seeded Monte Carlo verification, and deterministic regression tests

## Choose Your Ally

After a paid Three Trees trigger resolves, the player must select and confirm one Commune member before the free-spin intro begins. New sessions cannot start without a valid confirmed ally. The selected ally is saved before the first free spin and cannot change after the feature starts.

| Ally | Ability | Final rule |
| --- | --- | --- |
| Sterling | No Whammys | Each final losing spin builds Insurance at 0.35x total bet per loss, capped at 1.5x total bet, paid once at feature end. |
| Ryan | Big Win | One of the first four free-spin positions is stored secretly. Its monetary payout is multiplied by 2x. A loss receives no benefit. |
| Cooper | Rage-Bait | Consecutive losses prepare the next win at 1.3x, 1.6x, then 2x. Rage resets after that win and expires unused at feature end. |
| Cydney | I’m Listening | The first final monetary win is recorded. The feature pays an Echo equal to 45% of that win at feature end. |
| Gabi | Eww | The first win below 3x total bet is replayed from a win-only judgment pool. The coherent result with the greater monetary payout is retained. Ties retain the original. |
| Kenly | Big Lemons | Every natural Small Win receives a 37% Lemonade Bonus. The tier is classified before the ally bonus. |
| Ashley | Fastball | The first losing spin is replayed once. The original loss is abandoned, and only the replay result settles. |

All multipliers and percentages use integer coins and `Math.floor`. Only one ally is active per free-spin session. Ally abilities do not interact with one another and do not alter the Fortune Meter.

### Selection and recovery

The session stores the pending selection, confirmation state, selected ally, hidden Ryan spin, replay results, streak state, recorded values, and end-bonus payment flags.

- Reload before confirmation restores the selection screen.
- Reload after confirmation restores the exact ally.
- Reload during a replay settles the already stored coherent result once.
- Reload before Insurance or Echo payment cannot duplicate the end bonus.
- Legacy free-spin sessions created before this feature continue without an ally. No random ally is invented for an old session.

## Authoritative replay model

Ashley and Gabi produce a composite pending result before presentation begins. It contains the original result, replacement result, selected result identifier, and final coherent payout. The composite result is saved before either reel presentation runs.

Only the selected result contributes payout, retriggers, Tree Awakening, combinations, feature totals, contribution statistics, and settlement. The abandoned result never settles.

Gabi's production replacement generator draws until it obtains a positive result, up to 512 authoritative attempts. A deterministic positive fallback is stored if the limit is reached. The exact simulator models the equivalent conditional positive-outcome distribution.

## Mystery Tokens and modifiers

`MYS` uses `assets/symbols/scatter.svg` as a real reel symbol. Tokens count anywhere in the visible 3-by-3 grid and never need to land on a payline.

| Visible tokens | Award |
| ---: | --- |
| 1 | Shimmer and semantic audio cue only |
| 2 | +10 Fortune and one normal Mystery Modifier |
| 3 | Outside an Ally feature: +1 ordinary Mystery Free Spin. Inside an active Ally feature: +1 additional Ally Free Spin. One normal modifier is also awarded. |
| 4+ | Outside an Ally feature: +2 ordinary Mystery Free Spins. Inside an active Ally feature: +2 additional Ally Free Spins. One strong modifier is also awarded, with the existing normal fallback. |

All queued modifiers apply together to the next eligible paid, Mystery, or Ally spin and are consumed when that result is committed. Duplicate Spotlight, Double Commune, Rescue Spin, and Fortune Burst awards stack to their configured caps. Different Spotlight characters remain independent.

| Modifier | One-spin rule |
| --- | --- |
| Spotlight | The selected character's line wins pay 2x, upgrading to 3x and 4x. Tree Wilds completing that character's line benefit. |
| Center Tree | The center cell becomes a Tree Wild before line evaluation unless it is already a Tree or Mystery Token. It never creates a natural Three Trees trigger. |
| Double Commune | Named Commune combinations, including Full Commune, pay 2x, upgrading to 3x and 4x. Ordinary line wins are unchanged. |
| Rescue Spin | A total loss rerolls once, or twice when stacked. Only the final coherent result settles. |
| Fortune Burst | Adds +20 Fortune after a win or +10 after a loss per stack, capped at three stacks. |

Mystery Free Spins outside an Ally feature remain ordinary zero-cost base-game spins. During an active Commune Ally feature, a 3-Token or 4+-Token free-spin award instead extends the same Ally session immediately. The selected Ally, locked line bet, reference bet, accumulated feature state, modifier queue, automatic progression, and exactly-once settlement are preserved. Natural Three Trees retriggers and Mystery extensions stack. Only overflow beyond the twenty-spin Ally cap is preserved as ordinary Mystery Free Spins for after the summary.

### Mystery extensions inside Ally features

The conversion extends the existing session object. It never creates a second Ally selection or intro. Three Tokens add one Ally spin. Four or more add two. Total Awarded and Free Spins update immediately, extension spins count toward Spins Played and Feature Win, and further Tokens or natural retriggers may chain.

All seven Ally states remain continuous. Sterling keeps his Insurance Pot, Cooper keeps Rage, Cydney cannot record a second first win, Gabi and Ashley cannot regain their replays, Kenly keeps Lemonade totals, and Ryan's stored one-use boost is neither duplicated nor silently moved to an extension spin.

The authoritative pending result stores requested spins, accepted Ally spins, cap overflow, modifier and fallback state, before-and-after counters, and application, presentation, and settlement status before presentation begins. Reload cannot lose or duplicate the award. See `docs/ally-mystery-extensions.md` for the exact ordering, cap formula, persistence invariants, and reproducible before-and-after simulation contract.

## Commune Free Spins

A paid spin triggers four free spins when `originalMatrix` contains at least one natural Tree on each reel. The same natural event during a free spin awards two additional spins, with a maximum of twenty total awarded spins.

Ally Free Spins retain all paylines, Wild substitution, Tree Awakening, combinations, win tiers, reactions, manual stopping, and Mystery Tokens. They cost zero coins, lock the triggering line bet and reference bet, and keep their ordinary Fortune isolation. Explicit Mystery Token Fortune and Fortune Burst awards still add Fortune during the feature.

## Mobile presentation boundary

Choose Your Ally adds static cards, borders, opacity transitions, checkmarks, a compact HUD, and short callouts. The active Ally occupies a complete flexible HUD row. Its name and complete ability label use the available width and may wrap naturally without ellipsis, letter clipping, horizontal page overflow, or collision with Free Spins, Total Awarded, Feature Win, or Locked Bet.

The selection screen supports touch, native keyboard focus, narrow layouts, safe-area behavior, Safari-style text scaling, portrait fallback, and reduced motion. Existing portrait fallback behavior remains in force. No alternate reaction art is required.

## Exact math

At line bet 1 and total bet 5, the simulator still enumerates all 55,296 reel-stop and Tree-roll outcomes. It reports the pre-reward reel model exactly, including token-count frequency, then runs deterministic paid-spin cycles through the production Mystery queue, Fortune, Rescue, Ally-trigger, and in-session extension paths.

### Exact visible-grid frequencies

| Mystery Tokens | Exact frequency |
| ---: | ---: |
| 0 | 27.6693% |
| 1 | 41.3411% |
| 2 | 22.9818% |
| 3 | 6.8359% |
| 4+ | 1.1719% |

The exact reel pass requests 0.091797 Mystery Free Spins per paid spin and awards a modifier on 30.9896% of paid results. Deliberate adjacent Scatter placement on reel one makes four-token results genuinely possible while keeping them rare.

### Seeded production-chain report

The established Mystery baseline uses seed `0x4d595354`. At 50,000 paid-spin cycles before in-feature conversion:

| Metric | Result |
| --- | ---: |
| Pre-reward reel, Fortune, and ordinary Commune Free Spins RTP | 76.5828% |
| Mystery Token, ticket, and Fortune increment | +8.7684% |
| Mystery Modifier increment | +14.1580% |
| Total RTP before selecting a specific Ally ability | 99.5092% |
| Mystery Free Spins played per paid spin | 0.104640 |
| Paid cycles starting a Mystery chain | 8.2960% |
| Average conditional Mystery chain length | 1.2613 spins |
| Longest observed chain | 8 spins |
| Fortune charge consumption frequency | 5.5185% |
| Ally trigger frequency from paid spins | 1.6140% |
| Ally trigger frequency from Mystery Free Spins | 2.1024% |
| Maximum coherent spin | 145 coins |
| Maximum complete paid-spin cycle | 206 coins |

The in-feature conversion is an intentional generosity increase and does not reduce Scatter frequency, Mystery awards, Ally strength, modifiers, payouts, Fortune, starting spins, or natural retriggers. `tools/simulate-mystery-scatter.mjs` produces the required reproducible before-and-after RTP and feature metrics for every Ally using seed `1297634388`.

See `docs/math-model.md` and `docs/ally-mystery-extensions.md` for state definitions, settlement rules, cap handling, Ally-specific invariants, and simulator output fields.

## Hidden QA mode

Choose Your Ally can be tested without waiting for a natural Three Trees result. Add `?qa=ally` to the page URL, for example `https://your-preview.example/?qa=ally`. The exact query gate adds a red **TEST MODE** panel; removing the query returns the game to normal play.

The QA panel is entirely client-side. It has no backend, account, database, network request, or production-visible admin route. It queues deterministic reel stops and feature rolls through the same production result generator, persistence, animations, ally modifiers, settlement, retrigger, and summary paths used by ordinary play.

Recommended ally test flow:

1. Press **Trigger Free Spins**. The next paid spin is forced to natural Three Trees and still pays, settles, and opens the real feature normally.
2. Choose an ally manually, or select one in the panel and press **Apply Ally Selection**.
3. Press the normal **Start** button. QA step mode pauses before each free spin.
4. Select a precise next result, then press **Queue & Run Next**. Available cases include a clean loss, weak win, ordinary Small Win, Nice Win, Big Win, retrigger, Tree Awakening, and named combination.
5. Use **Force Ally Ability** to prepare the current ally's qualifying state and next result.
6. Use **Set 1 Spin Left** to reach Insurance, Echo, or the summary quickly.
7. Use **Reset Feature State** before switching to another ally.

The **Mystery QA** section can force one, two, three, or four-plus tokens; queue any modifier; set or clear the Mystery Free Spin count; force a Mystery Free Spin into Three Trees; exercise Rescue loss-to-win; compare Fortune Burst wins and losses; and run deterministic Spotlight, Center Tree, Double Commune, and strong-pool fallback cases.

The **Ally Mystery Extensions** section adds direct controls for 3 Tokens, 4+ Tokens, natural retrigger plus 4 Tokens, final-spin extension, repeated extension chains, safety-cap overflow, reload-ready pending settlement, and a seven-Ally mobile HUD preview. Every control uses production result, persistence, settlement, and feature-loop paths rather than a separate fake implementation.

The current reel math has no standalone non-trigger Big Win. The QA Big Win case therefore truthfully produces a Big Win together with natural Three Trees instead of fabricating a payout outside the production math. QA settings and queued cases use `sessionStorage`; the actual game and feature state continue to use the normal reload-safe persistence layer.

## Commands

```bash
npm test
npm run test:allies
npm run test:mystery
npm run test:ally-mystery
npm run test:qa
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
node tools/simulate.mjs --check
node tools/simulate.mjs --check --mystery-sessions=50000
node tools/simulate.mjs --monte-carlo --sessions=200000
node tools/simulate-mystery-scatter.mjs --cycles=50000 --ally-cycles=50000 --seed=1297634388
node tools/simulate-mystery-scatter.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

## Feature flags

```js
CONFIG.features.freeSpins
CONFIG.features.scatters
CONFIG.features.mysteryModifiers
CONFIG.features.chooseYourAlly
CONFIG.features.allyAbilities
CONFIG.features.characterReactions
```

Disabling `allyAbilities` preserves the pre-ally free-spin result math. Legacy sessions also follow the pre-ally path. Selection presentation is separately controlled by `chooseYourAlly`. The Mystery system is enabled by both `scatters` and `mysteryModifiers`; QA overrides remain gated behind `?qa=ally` and never affect normal-play odds.

## Known limitations

- Physical iPhone Safari, iPhone Chrome, and in-app-browser verification is still required before merge.
- Gabi's 512-attempt production guard has a deterministic fallback. The probability of exhausting the positive-result draw loop is negligible, but it is not mathematically identical to an unbounded loop.
- The strong Mystery Modifier pool is intentionally empty in v1. Four-plus tokens use the tested normal-modifier fallback path.
- Persistence remains local to the browser.
- No risk-or-collect system, daily reward, secret event, backend, database, framework, bundler, or runtime dependency is included.
