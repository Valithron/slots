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

## Commune Free Spins

A paid spin triggers four free spins when `originalMatrix` contains at least one natural Tree on each reel. The same natural event during a free spin awards two additional spins, with a maximum of twenty total awarded spins.

Free spins retain all paylines, Wild substitution, Tree Awakening, combinations, win tiers, reactions, and manual stopping. They cost zero coins, lock the triggering line bet and reference bet, do not add Fortune, do not consume a charged Fortune state, and do not receive the Fortune multiplier.

## Mobile presentation boundary

Choose Your Ally adds static cards, borders, opacity transitions, checkmarks, a compact HUD, and short callouts. It does not change reel rendering, cabinet movement, stop bumps, viewport transforms, frame filters, or the rolled-back mobile smoothing work.

The selection screen supports touch, native keyboard focus, narrow layouts, and reduced motion. Existing portrait fallback behavior remains in force. No alternate reaction art is required.

## Exact math

At line bet 1 and total bet 5, the simulator enumerates all 55,296 weighted reel-stop and Tree-roll outcomes, solves the Fortune stationary distribution, then solves the bounded free-spin and ally state machines.

### Current baseline

| Metric | Exact result |
| --- | ---: |
| Base line RTP | 82.0023% |
| Tree Awakening increment | 2.6215% |
| Combination RTP | 2.7980% |
| Fortune increment | 1.1016% |
| RTP before free spins | 88.5234% |
| Free-spin increment | 5.6401% |
| Current total RTP | 94.1636% |
| Average base feature payout | 18.048387 coins |
| Base feature zero-pay frequency | 19.0708% |
| Average free spins per feature | 4.129032 |
| Features with a retrigger | 6.1050% |
| Maximum base feature payout | 2,020 coins |
| Maximum trigger-plus-feature payout | 2,171 coins |

### Initial untuned ally results

| Ally | Proposed incremental RTP | Proposed total RTP |
| --- | ---: | ---: |
| Sterling | 2.0559% | 96.2194% |
| Ryan | 5.4639% | 99.6274% |
| Cooper | 2.4245% | 96.5880% |
| Cydney | 1.5880% | 95.7516% |
| Gabi | 0.2171% | 94.3806% |
| Kenly | 1.9867% | 96.1503% |
| Ashley | 1.3912% | 95.5547% |

The initial proposal was not balanced. Ryan was far too strong, while Gabi's unrestricted ordinary replay was too weak to reach parity through threshold changes alone.

### Final tuned ally results

| Ally | Incremental RTP | Total RTP | Average feature | Zero-pay | Standard deviation | Maximum feature |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sterling | 1.3906% | 95.5542% | 22.4984 | 0.0000% | 17.1166 | 2,020 |
| Ryan | 1.3660% | 95.5295% | 22.4195 | 19.0708% | 23.3131 | 2,121 |
| Cooper | 1.2975% | 95.4611% | 22.2005 | 19.0708% | 21.5357 | 2,020 |
| Cydney | 1.3279% | 95.4914% | 22.2976 | 19.0708% | 21.4539 | 2,065 |
| Gabi | 1.3007% | 95.4642% | 22.2105 | 19.0708% | 20.5079 | 2,020 |
| Kenly | 1.3031% | 95.4666% | 22.2183 | 19.0708% | 20.7610 | 2,020 |
| Ashley | 1.3912% | 95.5547% | 22.5001 | 12.6104% | 20.0844 | 2,020 |

The final total-RTP range is **95.4611% to 95.5547%**. The parity spread is **0.0936 percentage points**, inside the preferred 0.10-point target. Ryan remains the most volatile. Sterling is the least volatile and eliminates zero-pay feature totals through Insurance. Ashley materially reduces zero-pay sessions while retaining more volatility than Sterling.

The exact solver reports mean, variance, zero-pay probability, activation metrics, and maxima. It intentionally omits median because retaining full payout distributions across all replay states would substantially increase memory without affecting the parity decision.

See `docs/math-model.md` for ability-specific metrics, exact state definitions, settlement rules, and tuning history.

## Commands

```bash
npm test
npm run test:allies
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
node tools/simulate.mjs --check
node tools/simulate.mjs --monte-carlo --sessions=200000
```

## Feature flags

```js
CONFIG.features.freeSpins
CONFIG.features.chooseYourAlly
CONFIG.features.allyAbilities
CONFIG.features.characterReactions
```

Disabling `allyAbilities` preserves the current pre-ally free-spin result math. Legacy sessions also follow the pre-ally path. Selection presentation is separately controlled by `chooseYourAlly`.

## Known limitations

- Alternate reaction portraits, frame animation, and imported audio remain deferred.
- Physical iPhone Safari, iPhone Chrome, and in-app-browser verification is still required before merge.
- Gabi's 512-attempt production guard has a deterministic fallback. The probability of exhausting the positive-result draw loop is negligible, but it is not mathematically identical to an unbounded loop.
- Persistence remains local to the browser.
- No Scatter symbol, mystery modifier, risk-or-collect system, daily reward, secret event, backend, database, framework, bundler, or runtime dependency is included.
