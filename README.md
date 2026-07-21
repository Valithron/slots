# Commune Fortune

Commune Fortune is a private, static 3-by-3 slot-style game built with plain HTML, CSS, and JavaScript. It uses fake coins only. There is no backend, account system, purchase flow, cash-out, framework, bundler, database, or runtime dependency.

## Current feature set

- Five fixed paylines on three 24-stop reels
- Authoritative predetermined spin results
- Reload-safe, exactly-once settlement
- Manual left-to-right reel stopping
- Auto, Full, and Reduced visual-effects modes
- Mobile WebKit compositing safeguards
- Small, Nice, Big, and Commune Jackpot tiers
- Tree of Life Wild and Tree Awakening
- Any-order named Commune Line combinations and Full Commune
- Fortune Meter with a 1.5x Fortune Spin, flat 10% Favor attempts, and a guaranteed fifth attempt
- Four persistent golden pity leaves
- Mystery Scatter Tokens anywhere on the visible grid
- Five normal Mystery Modifiers
- Seven Strong Mystery Modifiers
- Chainable Mystery Free Spins
- Mystery-awarded Fortune’s Favor extension spins
- Character reaction portraits
- Fortune’s Favor with retriggers and a twenty-spin cap
- Choose Your Ally with seven persistent feature abilities
- Deterministic tests and seeded production-path simulation

## Fortune’s Favor and Choose Your Ally

A natural Three Trees trigger or a successful Fortune Meter award opens four Fortune’s Favor spins. Before the feature starts, the player selects and confirms one Ally. The choice, locked bet, hidden rolls, replay results, streak state, recorded values, extension spins, and end-bonus flags persist across reload.

| Ally | Ability | Rule |
| --- | --- | --- |
| Sterling | No Whammys | Losses build Insurance at 0.35x total bet per loss, capped at 1.5x, paid once at feature end. |
| Ryan | Big Win | One stored position among the first four Free Spins pays 2x. |
| Cooper | Rage-Bait | Consecutive losses prepare the next win at 1.3x, 1.6x, then 2x. |
| Cydney | I’m Listening | The first final monetary win is recorded and pays a 45% Echo at feature end. |
| Gabi | Eww | The first qualifying weak win is replayed from a win-only pool; the better coherent result is retained. |
| Kenly | Big Lemons | Natural Small Wins receive a 37% Lemonade bonus. |
| Ashley | Fastball | The first loss is replayed once and only the replacement settles. |

Gabi and Ashley store both candidates and the selected result before presentation. Strong modifiers are applied coherently to both replay candidates before the final selection. Abandoned candidates never settle and never consume a Fortune’s Favor meter roll.

## Mystery Tokens

`MYS` uses `assets/symbols/scatter.svg` as a reel symbol. Tokens count anywhere in the visible grid.

| Visible tokens | Award |
| ---: | --- |
| 1 | Shimmer and semantic audio only |
| 2 | +10 Fortune and one normal Mystery Modifier |
| 3 | +1 Mystery Free Spin, or +1 spin inside active Fortune’s Favor, plus one normal modifier |
| 4+ | +2 Mystery Free Spins, or +2 spins inside active Fortune’s Favor, plus one Strong Mystery Modifier |

Mystery Free Spins cost zero coins, retain ordinary base-game math, build and consume Fortune, can award more tokens, and can trigger Fortune’s Favor. During an active feature, Mystery spin awards extend the same selected Ally session. Cap overflow is preserved as ordinary Mystery Free Spins after the feature.

## Normal Mystery Modifiers

| Modifier | Rule |
| --- | --- |
| Spotlight | The selected character's ordinary line wins pay 2x, stacking to 3x and 4x. |
| Center Tree | The center becomes a payout Wild unless already Tree or Mystery. It cannot create natural Three Trees. |
| Double Commune | Named Commune combinations pay 2x, stacking to 3x and 4x. |
| Rescue Spin | Rerolls only a truly blank result. Stacks provide up to two attempts. |
| Fortune Burst | Adds persistent Fortune after the final result. |

A result is truly blank only when it has zero coins and no meaningful persistent reward. Rescue preserves two or more Tokens, natural Three Trees, Mystery or Ally spins, modifiers, Fortune Burst, a real Fortune Flood increase, and other persistent awards. One Token alone may still reroll.

## Strong Mystery Modifiers

Four or more Tokens draw independently from seven equally weighted Strong Modifiers. Repeats, self-repeats, and chains are allowed. There is no bag, cooldown, or loop suppression.

| Strong Modifier | One-spin rule |
| --- | --- |
| Golden Payline | One saved payline pays 4x on ordinary line wins. |
| Fortune Flood | Final current-spin money pays 2x and settled Fortune cannot finish below 50. |
| Scatter Magnet | Adds two non-destructive Mystery Token overlays. |
| Commune Gathering | One saved named group pays a separate guaranteed 3x combination bonus. |
| Sevenfold Fortune | One saved character pays 3x, or 7x for three natural copies. |
| Full Fortune | Doubles final money, Fortune points, Mystery spins, and eligible Ally trigger or extension spins once. |
| Commune Chaos | Three distinct saved effects strike together from a seven-effect Chaos pool. |

Strong modifiers are atomic instances stored separately from the normal stackable queue. Their line, character, group, and Chaos selections are made at award time and do not redraw after reload. Candidate-dependent overlay and Wild Spark cells are stored inside each authoritative candidate.

See [Strong Mystery Modifiers](docs/strong-mystery-modifiers.md) for exact rules, evaluation order, Rescue behavior, persistence invariants, QA, and simulation fields. See [Strong Mystery simulation contract](docs/strong-mystery-simulation.md) for the detailed and matched audit methods.

## Evaluation and settlement

The natural matrix remains authoritative for natural Mystery Tokens, named combinations, Three Trees, Tree Awakening eligibility, and Sevenfold natural-trio checks. Payout-only transformations and non-destructive overlays are applied afterward. Line multipliers multiply rather than add. Gathering is represented in the combination payout collection. Fortune Flood and Full Fortune apply only after the coherent current-spin payout is known.

The pending result stores natural and resolved matrices, overlays, transformations, modifier instances, replay candidates, Rescue candidates, selected result ID, token awards, Ally extensions, Fortune’s Favor attempt metadata, cap overflow, and settlement status. A committed result settles once. Reload never redraws a Favor result, duplicates pity, pays an abandoned candidate, or starts Fortune’s Favor twice.

## Named Commune combinations

KPs, Walls, Jaaps, Brotherhood, Wives’ Circle, and Household trigger when their required symbols appear in any order across the middle Commune Line. Full Commune requires all seven members in the visible grid and the Tree in the exact center.

## Fortune Meter

Paid and Mystery Free Spins build Fortune. At 100, the next eligible spin becomes a 1.5x Fortune Spin and consumes the charge. Ally Free Spins ordinarily isolate Fortune, except explicit Mystery Token Fortune, Fortune Burst, Full Fortune doubling, and Fortune Flood's persistent floor behavior.

Every eligible completed-meter attempt also connects to Fortune’s Favor:

| Meter attempt | Favor rule |
| ---: | --- |
| 1 | 10% chance |
| 2 | 10% chance |
| 3 | 10% chance |
| 4 | 10% chance |
| 5 | Guaranteed |

The first four chances remain flat at 10%. Each miss lights one golden leaf. Natural Three Trees preserve the leaf progress. Natural Three Trees on a charged Fortune Spin skip the meter roll, keep pity unchanged, retain the 1.5x payout treatment, and start only one feature. Only a meter-awarded Fortune’s Favor clears the leaves.

A full meter earned during Fortune’s Favor waits until the feature ends and survives reload. See [Fortune Meter and Fortune’s Favor](docs/fortune-favor-meter.md) for exact ordering, persistence, QA, and validation rules.

## Hidden QA mode

Add `?qa=ally` to a branch preview. The client-only QA panel uses production result generation, persistence, presentation, and settlement paths.

The existing sections can force Ally triggers, specific free-spin outcomes, Mystery Token counts, normal modifiers, Rescue, retriggers, caps, overflow, and reload-ready pending results. The Strong Mystery section can queue or force any Strong Modifier, select a payline, character, or Gathering group, queue repeated atomic instances, make random draws, and force a deterministic Commune Chaos package.

The Fortune’s Favor Meter section can set the meter to 100, set pity from zero through four, force random success or failure, force the guaranteed fifth attempt, queue natural Three Trees on a charged spin, store a charge during the active feature, prepare a charged Mystery Free Spin, save reload-ready pending outcomes, and preview every leaf state and the success callout.

The current reel math has no standalone non-trigger Big Win, so that QA case remains paired with the natural Three Trees result instead of fabricating an impossible payout.

Remove `?qa=ally` for normal play.

## Tests and simulation

```bash
npm test
npm run test:allies
npm run test:mystery
npm run test:ally-mystery
npm run test:strong-mystery
npm run test:fortune-favor
npm run test:qa
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
npm run simulate:strong-paired
npm run simulate:fortune-favor
npm run simulate:fortune-favor:json
npm run simulate:fortune-favor:deep
node tools/simulate.mjs --check
node tools/simulate-mystery-scatter.mjs --cycles=50000 --ally-cycles=50000 --seed=1297634388
node tools/simulate-strong-mystery.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
node tools/simulate-strong-mystery-paired.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
node tools/simulate-fortune-favor.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

The original exact reel pass remains in `tools/simulate.mjs`. `tools/simulate-strong-mystery.mjs` provides detailed Strong selection, payout, Rescue, loop, Fortune, cap, overflow, and maximum-payout diagnostics. `tools/simulate-strong-mystery-paired.mjs` runs matched equal-sized before and after samples, including per-Ally RTP comparisons. `tools/simulate-fortune-favor.mjs` compares the existing 1.5x-only baseline with the approved flat-10%-then-guaranteed model and reports RTP, natural versus meter feature frequency, pity reach, guarantee frequency, droughts, preserved charges, Strong interactions, caps, overflow, and per-Ally results.

The Fortune’s Favor system does not automatically tune reel strips, natural Three Trees, Scatter frequency, Mystery awards, base payouts, Commune payouts, normal modifiers, Ally abilities, starting spins, retriggers, ordinary Fortune gains, or the 1.5x multiplier. Any balance adjustment requires a separate reviewed decision.

## Feature flags

```js
CONFIG.features.freeSpins
CONFIG.features.scatters
CONFIG.features.mysteryModifiers
CONFIG.features.chooseYourAlly
CONFIG.features.allyAbilities
CONFIG.features.characterReactions
CONFIG.fortuneFavor.enabled
```

## Known limitations

- Physical iPhone Safari, iPhone Chrome, and in-app-browser verification is still required before merge.
- Gabi's guarded win-only replacement draw has a deterministic fallback.
- Persistence remains local to the browser.
- No risk-or-collect system, daily reward, backend, database, framework, bundler, or runtime dependency is included.