# Commune Fortune Math Model

## Locked targets

- Base-game RTP: **82% to 83%**
- Tree Awakening increment: **2.5% to 3.5%**
- Combination contribution: **1.75% to 2.35%**
- Pre-Fortune combined RTP: **86.7998%**
- Fortune Meter increment: **0.8% to 1.2%**
- Current RTP without free spins: **87.8188%**
- Commune Free Spins increment target: **5.4% to 5.9%**
- Combined target after this pass: **93.2% to 93.8%**
- Long-term final target: **96% to 97%**
- Character reactions: **0.0000% RTP effect**
- Manual stopping: **0.0000% RTP effect**

External grants and Refill are excluded from wager RTP.

## Exact weighted outcome space

Three 24-stop reels produce:

```text
24 x 24 x 24 = 13,824 stop combinations
```

Tree Awakening has four equally weighted predetermined roll states:

```text
13,824 x 4 = 55,296 weighted outcomes
```

`tools/simulate.mjs` imports production `js/config.js`, `js/free-spins.js`, and `js/payouts.js`. It does not maintain simulator-only strips, payouts, triggers, feature rolls, Fortune awards, or multipliers.

## Existing wager RTP

| Component | Exact RTP |
| --- | ---: |
| Base line RTP | 82.0023% |
| Tree Awakening increment | 2.6215% |
| Commune combinations | 2.1759% |
| Pre-Fortune total | 86.7998% |
| Fortune Meter increment | 1.0190% |
| Current total without free spins | 87.8188% |

Disabling `CONFIG.features.freeSpins` therefore preserves the prior 87.8188% total.

## Fortune Meter model

Every paid spin adds two base points, then natural-tier and combination points. The meter has states 0 through 100. State 100 means the next paid spin is charged. A charged paid spin consumes the state before its current outcome award is applied.

The exact 101-state stationary solution gives:

- Fortune Spin frequency: **2.4015%**
- Average cycle length: **41.6401 paid spins**
- Average Fortune bonus: **2.121636 coins when charged**
- Incremental Fortune RTP: **1.0190%**

Free spins do not transition the Fortune state. A charge present before or earned by the triggering result remains unchanged throughout the feature.

## Three Trees trigger frequency

Each 24-stop reel contains two Tree symbols. A three-row window contains a Tree with probability:

```text
6 visible Tree-containing top stops / 24 top stops = 1/4
```

The reels are independent, so:

```text
P(Tree on all three reels) = 1/4 x 1/4 x 1/4 = 1/64
```

Therefore:

- Paid trigger frequency: **1.5625%**
- Average paid spins between triggers: **64.0000**

The test is applied to `originalMatrix`. Tree Awakening modifies only `resolvedMatrix`, so it has no trigger influence.

## Free-spin transition model

A paid trigger starts with four spins. Every free spin independently uses the same exact weighted outcome distribution as the natural game, with Fortune disabled and the triggering `referenceBet` locked.

On a natural Three Trees free-spin result:

```text
remaining = remaining - 1 + min(2, 20 - totalAwarded)
totalAwarded = totalAwarded + min(2, 20 - totalAwarded)
```

Otherwise:

```text
remaining = remaining - 1
```

The simulator solves states identified by:

```text
(remainingSpins, totalAwardedSpins)
```

The state space is finite because total awarded spins cannot exceed twenty.

## Exact free-spin results

At line bet 1 and reference bet 5:

| Metric | Exact result |
| --- | ---: |
| Average natural payout per free spin | 4.339988 coins |
| Retrigger probability per free spin | 1.5625% |
| Average free spins per feature | 4.129032 |
| Average retriggers per feature | 0.064516 |
| Features with at least one retrigger | 6.1050% |
| Average feature payout | 17.919952 coins |
| Average feature payout multiple | 3.583990x |
| Zero-pay feature frequency | 23.5401% |
| Tree Awakening frequency per free spin | 2.0833% |
| Any combination frequency per free spin | 1.2442% |
| Maximum single free-spin payout | 101 coins |
| Maximum feature payout | 2,020 coins |
| Maximum feature payout multiple | 404.00x |
| Maximum triggering paid result with Fortune | 151 coins |
| Maximum trigger plus feature | 2,171 coins |
| Maximum trigger-plus-feature multiple | 434.20x |

Session length distribution:

| Spins completed | Probability |
| ---: | ---: |
| 4 | 93.8950% |
| 6 | 5.7767% |
| 8 | 0.3110% |
| 10 | 0.0164% |
| 12 | 0.0009% |
| 14 | less than 0.0001% |
| 16 | less than 0.0001% |
| 18 | less than 0.0001% |
| 20 | less than 0.0001% |

## Incremental and combined RTP

A feature begins once per 64 paid spins and pays 17.919952 coins on average:

```text
incremental free-spin RTP
= (1/64 x 17.919952) / 5
= 5.599985%
```

Rounded reporting:

```text
incremental free-spin RTP = 5.6000%
final combined RTP        = 93.4188%
```

This intentionally leaves approximately 2.5812 to 3.5812 percentage points for later Ally Selection, mystery modifiers, secret events, and final tuning.

## Result classification

Every result stores:

```js
spinType: "paid" // or "free"
coinCost: 5       // zero for free spins
referenceBet: 5   // locked triggering total bet for free spins
```

`referenceBet` is used for line scaling, tier classification, RTP comparison, and payout multiples. `coinCost` is used for balance deduction, paid-wager statistics, and Fortune eligibility.

Free-spin results therefore do not create additional paid wagers.

## Exactly-once session transaction

Before animation, each free spin stores target stops, original and resolved matrices, feature roll, transformations, wins, trigger data, payout, and session classification as `pendingSpin`.

Settlement performs one transaction:

1. Credit the individual payout.
2. Increment completed spins.
3. Decrement remaining spins.
4. Add the payout to `accumulatedWin`.
5. Add ordinary line-win contribution totals.
6. Apply a retrigger once, subject to the cap.
7. Store the settled result for reaction and retrigger recovery.
8. Clear `pendingSpin`.
9. Save before presentation.

The summary displays `accumulatedWin` but never credits it again.

## Recovery model

Persistent session statuses are:

```text
intro
ready
spinning
presenting
complete
summary
```

The save retains the trigger result, last settled free-spin result, presentation result, trigger cells, locked bet, counts, total win, and contribution totals. Reload never regenerates stops or feature rolls.

A reload during reel motion settles the saved pending result once. A reload during reaction or retrigger presentation restores the saved settled result. A reload during summary restores presentation only.

## Reaction isolation

Reaction selection consumes an already authoritative result and returns presentation metadata only. The simulator runs the exact same result math with reactions disabled and confirms:

```text
Reaction framework RTP effect = 0.0000%
```

The tests also compare target stops, matrices, rolls, transformations, wins, triggers, Fortune awards, and totals with reactions on and off.

## Manual-stop isolation

Manual stop input changes reel animation timing only. It is absent from result generation and settlement. Automated tests compare all mathematical result fields with manual stops enabled and disabled.

```text
Manual-stop RTP effect = 0.0000%
```

## Commands

```bash
npm test
npm run simulate
npm run simulate:without-free-spins
npm run simulate:with-free-spins
node tools/simulate.mjs --check
node tools/simulate.mjs --json
```

`--check` fails if the locked current RTP changes, trigger frequency is not exactly 1 in 64, free-spin contribution leaves 5.4% to 5.9%, final combined RTP leaves 93.2% to 93.8%, or reaction RTP is nonzero.

## Deferred systems

The model does not include Ally Selection, ally abilities, alternate reaction assets, a Scatter symbol, mystery modifiers, risk-or-collect, daily rewards, or secret events. Existing base payouts, reel strips, Tree Awakening, combinations, and Fortune values are unchanged.
