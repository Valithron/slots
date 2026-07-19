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
- Persistent one-spin Mystery Modifiers with defensive stack caps
- Chainable Mystery Free Spin tickets that use the ordinary base-game flow
- Character reactions on winning reel cells with preload-first fallbacks
- Commune Free Spins with retriggers, locked bets, persistence, and MVP summary
- Choose Your Ally with seven mutually exclusive free-spin abilities
- Exact transition simulation, seeded Monte Carlo verification, and deterministic regression tests

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

All multipliers and percentages use integer coins and `Math.floor`. Only one ally is active per free-spin session. Ally abilities do not interact with one another and do not alter ordinary Fortune rules.

### Selection and recovery

The session stores the pending selection, confirmation state, selected ally, hidden Ryan spin, replay results, streak state, recorded values, and end-bonus payment flags.

- Reload before confirmation restores the selection screen.
- Reload after confirmation restores the exact ally.
- Reload during a replay settles the already stored coherent result once.
- Reload before Insurance or Echo payment cannot duplicate the end bonus.
- Legacy free-spin sessions created before this feature continue without an ally. No random ally is invented for an old session.

## Authoritative replay model

Ashley, Gabi, and Rescue Spin produce stored candidate results before presentation begins. Only one final coherent result is selected and saved. Only that result contributes payout, Fortune, Mystery awards, retriggers, Tree Awakening, combinations, feature totals, contribution statistics, and settlement.

Gabi's production replacement generator draws until it obtains a positive result, up to 512 authoritative attempts. A deterministic positive fallback is stored if the limit is reached. The exact simulator models the equivalent conditional positive-outcome distribution.

## Character reactions

Character reaction assets are resolved through the central `characterPresentation` manifest.

- Small Win: `small -> base`
- Nice Win and Commune Combination: `nice -> small -> base`
- Big Win and Jackpot: `big -> nice -> small -> base`

Cydney's production Nice and Big assets are active:

```text
assets/symbols/cydney-nice.svg
assets/symbols/cydney-big.svg
```

A candidate reaction image is preloaded and decoded before it replaces the visible reel portrait. Failed URLs are cached, successful resolutions are reused, and the currently visible image remains in place if every variant fails. A generation guard prevents stale image loads or old timers from overwriting a later spin. Tree, Mystery Token, and Center Tree cells never enter the portrait-swap path.

Persistent reel reactions continue after the popup closes. They stop and restore their base portraits when the next reel reset begins. The portrait asset cache version is `portraits-v6`.

## Mystery Tokens and modifiers

`MYS` uses `assets/symbols/scatter.svg` as a real reel symbol. Tokens count anywhere in the visible 3-by-3 grid and never need to land on a payline.

| Visible tokens | Award |
| ---: | --- |
| 1 | Shimmer and semantic audio cue only |
| 2 | +10 Fortune and one normal Mystery Modifier |
| 3 | +1 Mystery Free Spin and one normal Mystery Modifier |
| 4+ | +2 Mystery Free Spins and one strong modifier; the current empty strong pool safely falls back to a normal modifier |

A naturally earned modifier applies to the next eligible paid, Mystery, or Ally spin and is consumed when that result is committed. Since each settled result awards at most one modifier and the next spin consumes the queue, normal play presently produces no multi-modifier backlog. Stack caps remain authoritative for QA-injected queues, recovered state, and any future award path that can accumulate more than one modifier.

| Modifier | One-spin rule |
| --- | --- |
| Spotlight | The selected character's line wins pay 2x, upgrading to 3x and 4x if multiple stacks exist. Tree Wilds completing that character's line benefit. |
| Center Tree | The center cell becomes a Tree Wild before line evaluation unless it is already a Tree or Mystery Token. It never creates a natural Three Trees trigger. |
| Double Commune | Named Commune combinations, including Full Commune, pay 2x, upgrading to 3x and 4x if multiple stacks exist. Ordinary line wins are unchanged. |
| Rescue Spin | A total loss rerolls once, or twice if two stacks exist. Only the final coherent result settles. |
| Fortune Burst | Adds +20 Fortune after a win or +10 after a loss per stack, capped at three stacks. |

Mystery Free Spins are ordinary base-game spins with a zero coin cost. They retain paylines, Tree Wild behavior, Tree Awakening, combinations, Fortune eligibility, and Three Trees triggering. They can award more tokens and tickets. The global queue is capped at twenty, persists across reloads and Refills, pauses while an Ally feature runs, and resumes after its summary. Tokens remain active inside Ally Free Spins, while tickets earned there wait until the Ally feature finishes.

## Commune Free Spins

A paid spin triggers four free spins when `originalMatrix` contains at least one natural Tree on each reel. The same natural event during a free spin awards two additional spins, with a maximum of twenty total awarded spins.

Ally Free Spins retain all paylines, Wild substitution, Tree Awakening, combinations, win tiers, reactions, manual stopping, and Mystery Tokens. They cost zero coins, lock the triggering line bet and reference bet, and keep their ordinary Fortune isolation. Explicit Mystery Token Fortune and Fortune Burst awards still add Fortune during the feature.

## Mobile presentation boundary

Choose Your Ally and Mystery presentation add static cards, borders, opacity transitions, token shimmer, short callouts, and modifier-specific highlights. They do not change reel rendering, cabinet movement, stop bumps, viewport transforms, or frame filters.

The selection screen supports touch, native keyboard focus, narrow layouts, and reduced motion. Reaction image reliability is deterministic and covered by source-level tests. Physical iPhone Safari, iPhone Chrome, and in-app WebKit verification remains a manual pre-merge requirement.

## Math and balance

At line bet 1 and total bet 5, the exact simulator enumerates all 55,296 reel-stop and Tree-roll outcomes. The layered Mystery simulator then runs the production queue, Fortune, Rescue, Mystery Free Spin, and Ally paths with a fixed seed.

### Historical pre-Mystery baseline

The last mainline snapshot before Mystery Tokens, commit `d5b044c`, used no Scatter symbols and returned **94.1636% total RTP** after ordinary Commune Free Spins. This is the true historical Layer A reference. Current-strip layers are measured separately because Mystery Tokens occupy real reel stops.

### Scatter tuning

The initial Mystery strips awarded a modifier on 30.9896% of paid spins. Player feedback correctly identified that rate as visually constant. The production adjustment removed one isolated Scatter from reel two and one from reel three while preserving reel one's adjacent pair, which keeps four-plus-token outcomes possible.

| Visible tokens | Before | Current |
| ---: | ---: | ---: |
| 0 | 27.6693% | 39.8438% |
| 1 | 41.3411% | 38.2813% |
| 2 | 22.9818% | 16.9271% |
| 3 | 6.8359% | 4.4271% |
| 4+ | 1.1719% | 0.5208% |
| 2+ total | 30.9896% | 21.8750% |

The current exact reel pass requests 0.054688 Mystery Free Spins per paid spin and awards a modifier on 21.8750% of paid results.

### Current 50,000-cycle report

The committed seed is `0x4d595354`.

| Metric | Before | Current |
| --- | ---: | ---: |
| Current-strip RTP before Mystery awards | 76.5828% | 79.4423% |
| Mystery Token, ticket, and Fortune increment | +8.7684% | +5.5505% |
| Mystery Modifier increment | +14.1580% | +10.5352% |
| Full Mystery RTP without a selected Ally ability | 99.5092% | 95.5280% |
| Mystery Free Spins played per paid spin | 0.104640 | 0.059820 |
| Paid cycles starting a Mystery chain | 8.2960% | 5.0580% |
| Average conditional chain length | 1.2613 | 1.1827 |
| Longest observed chain | 8 | 6 |
| Fortune charge consumption | 5.5185% | 4.7291% |
| Ally triggers from paid spins | 1.6140% | 1.6540% |
| Ally triggers from Mystery spins | 2.1024% | 1.5379% |
| Maximum coherent spin | 145 | 139 |
| Maximum complete paid cycle | 206 | 241 |

The no-ally layer is a diagnostic and legacy path. New Three Trees sessions require an Ally, so production player return must also be reviewed by ally choice. The deep audit reports those totals separately instead of hiding the variation inside one blended number.

See `docs/math-model.md` for the A through G layer definitions, modifier frequencies, Ally interaction metrics, chain outcomes, and tuning rationale.

## Hidden QA mode

Add `?qa=ally` to the page URL, for example `https://your-preview.example/?qa=ally`. The exact query gate adds a red **TEST MODE** panel. Removing the query returns the game to normal play.

The QA panel is entirely client-side. It has no backend, account, database, network request, or production-visible admin route. It queues deterministic reel stops and feature rolls through the same production result generator, persistence, animations, ally modifiers, settlement, retrigger, and summary paths used by ordinary play.

### Reaction QA

The **Reel Reaction Preview** can select any of the seven characters and run fixed Small, Nice, Big, Jackpot, or Commune Combination boards without changing coins or saved progress. It uses the same preload, fallback, and persistent reel controller as production.

### Mystery QA

The **Mystery QA** section can force one, two, three, or four-plus tokens; queue any modifier; set or clear the Mystery Free Spin count; force a Mystery Free Spin into Three Trees; exercise Rescue loss-to-win; compare Fortune Burst wins and losses; and run deterministic Spotlight, Center Tree, Double Commune, and strong-pool fallback cases. Token forcing targets whichever paid, Mystery, or Ally spin is next, so the same control verifies tokens inside an Ally event.

### Ally QA

1. Press **Trigger Free Spins**.
2. Choose an ally manually, or select one in the panel and press **Apply Ally Selection**.
3. Press the normal **Start** button. QA step mode pauses before each free spin.
4. Select a precise next result, then press **Queue & Run Next**.
5. Use **Force Ally Ability** to prepare the current ally's qualifying state and next result.
6. Use **Set 1 Spin Left** to reach Insurance, Echo, or the summary quickly.
7. Use **Reset Feature State** before switching to another ally.

QA settings and queued cases use `sessionStorage`; actual game and feature state continue to use the normal reload-safe persistence layer.

## Commands

```bash
npm test
npm run test:allies
npm run test:mystery
npm run test:qa
npm run test:reel-reactions
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
npm run simulate:mystery
node tools/simulate.mjs --check --mystery-sessions=50000
node tools/simulate.mystery-scatter.mjs --cycles=50000 --seed=1297634388
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

- Sterling and Cydney have dedicated Nice and Big reaction assets. Other characters currently use the tested fallback chain until their corresponding variants are added.
- Physical iPhone Safari, iPhone Chrome, and in-app-browser verification is still required before merge.
- Gabi's 512-attempt production guard has a deterministic fallback. The probability of exhausting the positive-result draw loop is negligible, but it is not mathematically identical to an unbounded loop.
- The strong Mystery Modifier pool is intentionally empty in v1. Four-plus tokens use the tested normal-modifier fallback path.
- Natural play currently produces at most one queued modifier. Multi-stack behavior remains tested for QA, recovered state, and future award paths.
- Persistence remains local to the browser.
- No risk-or-collect system, daily reward, secret event, backend, database, framework, bundler, or runtime dependency is included.
