# Commune Fortune Math Model

## Locked targets

- Base-game RTP: **82% to 83%**
- Tree Awakening increment: **2.5% to 3.5%**
- Combination contribution: **1.75% to 2.35%**
- Pre-Fortune combined RTP: locked at **86.7998%**
- Fortune Meter increment: **0.8% to 1.2%**
- Fortune combined target: **87.6% to 88.0%**
- Long-term final game target: **96% to 97%**
- External grants and rescue refills are excluded from wager RTP.
- Manual reel stopping must have **0.0000%** RTP effect.

## Exact outcome space

Three 24-stop reels produce:

```text
24 x 24 x 24 = 13,824 reel-stop combinations
```

Tree Awakening has four equally weighted predetermined roll states:

```text
13,824 x 4 = 55,296 weighted outcomes
```

`tools/simulate.mjs` imports production `js/config.js` and `js/payouts.js`. There is no simulator-only paytable, feature roll, meter-award function, or multiplier implementation.

## Existing natural wager RTP

| Mode | Base RTP | Tree increment | Combination RTP | Total RTP |
| --- | ---: | ---: | ---: | ---: |
| Base only | 82.0023% | 0.0000% | 0.0000% | 82.0023% |
| Base + Tree | 82.0023% | 2.6215% | 0.0000% | 84.6238% |
| Base + combinations | 82.0023% | 0.0000% | 2.1759% | 84.1782% |
| Base + Tree + combinations | 82.0023% | 2.6215% | 2.1759% | 86.7998% |

The disabled Fortune feature therefore preserves the prior exact combined result.

## Fortune award function

For every paid spin:

```text
award = 2 base points
      + natural-tier points
      + combination points
```

| Natural event | Points |
| --- | ---: |
| Paid spin | 2 |
| Small Win | +1 |
| Nice Win | +3 |
| Big Win | +8 |
| Standard named combination | +3 |
| Full Commune | +10 |
| Commune Jackpot | Charge to 100 |

Tier points are determined from `preModifierWin`. The 1.5× modifier cannot elevate its own meter award.

The exact natural-outcome award distribution is:

| Total points | Weighted outcomes | Frequency |
| ---: | ---: | ---: |
| 2 | 38,537 | 69.6922% |
| 3 | 14,202 | 25.6840% |
| 5 | 1,826 | 3.3024% |
| 6 | 616 | 1.1140% |
| 8 | 8 | 0.0145% |
| 10 | 43 | 0.0778% |
| 15 | 64 | 0.1157% |

Average meter gain is **2.422598 points per paid spin**.

## Fortune payout function

Natural wager-generated payout is calculated first:

```text
preModifierWin = lineWinTotal + combinationWinTotal
```

A charged spin uses:

```text
finalWin = floor(preModifierWin x 1.5)
fortuneBonus = finalWin - preModifierWin
totalWin = finalWin
```

A zero payout remains zero. Fractional halves round down. The modifier is represented exactly once in `result.modifiers` and the final total is credited once.

## Stateful exact meter model

The Fortune Meter is represented by 101 states:

```text
0, 1, 2, ... 99, 100
```

State `100` means charged. When a charged paid spin begins, its starting value is consumed to `0` before the outcome award is applied. For each state `s` and exact natural outcome award `g`:

```text
base(s) = 0 when s = 100, otherwise s
next(s, g) = min(100, base(s) + g)
```

A Jackpot transition maps directly to state `100`.

The simulator builds the weighted transition matrix from all 55,296 natural outcomes and iterates the probability vector to a tolerance below `1e-15`. The stationary mass at state `100` is the long-run Fortune Spin frequency.

Results:

- Stationary charged probability: **2.40152995596%**
- Fortune Spin frequency: **2.4015%**
- Average cycle length: **41.6401 paid spins**
- Average natural payout when a Fortune Spin occurs: **4.339988 coins**
- Average final Fortune payout: **6.461625 coins**
- Average Fortune bonus: **2.121636 coins**
- Incremental Fortune RTP: **1.0190%**
- Final combined RTP: **87.8188%**

The full 0-through-100 stationary distribution is emitted by:

```bash
node tools/simulate.mjs --json
```

## Fortune Spin tier distribution

The final displayed tier is calculated after the multiplier.

| Final tier | Frequency among Fortune Spins |
| --- | ---: |
| No Win | 69.6922% |
| Small Win | 22.2584% |
| Nice Win | 7.6859% |
| Big Win | 0.3635% |
| Commune Jackpot | 0.0000% |

Maximum current outcomes at line bet 1:

| Result | Coins | Total-bet multiple |
| --- | ---: | ---: |
| Maximum natural payout | 101 | 20.20× |
| Maximum Fortune payout | 151 | 30.20× |

## Authoritative state transaction

At spin start, the result stores target stops, original and resolved matrices, feature rolls, transformations, wins, subtotals, `preModifierWin`, Fortune modifier, natural and final tiers, anticipation, and `fortuneMeterAward`. If charged, the persistent meter is reset before the wager and pending result are saved.

At settlement, `totalWin` is credited and `fortuneMeterAward` is applied in one exactly-once transition. The pending result is then cleared and settled state is saved before presentation.

This order prevents:

- reusing a charged meter by refreshing
- duplicating the 1.5× modifier
- crediting a Fortune bonus separately
- applying meter points twice
- using the final tier to inflate the award
- rerolling Tree Awakening or target stops

## Manual stop isolation

Manual stopping exists only in `js/reels.js` and `js/game-flow.js`. No stop request, timestamp, queue state, or animation position is included in `createSpinResult`.

The exact guard creates the same predetermined spin with `manualStops: false` and `manualStops: true`, then compares:

- target stops
- original and resolved matrices
- feature rolls
- transformations
- line and combination wins
- `preModifierWin`
- Fortune Meter award
- final payout
- final tier

All fields must be identical. Therefore:

```text
Manual stop RTP effect = 0.0000%
```

## Commands

```bash
npm test
npm run simulate
node tools/simulate.mjs --check
node tools/simulate.mjs --json
```

The exact check fails if the locked base or pre-Fortune RTP changes, if Tree, combination, or Fortune contributions leave their configured targets, if final Fortune RTP leaves 87.6% to 88.0%, or if manual-stop isolation fails.

## Remaining budget and limitations

The current combined RTP is **87.8188%**. Relative to the long-term 96% to 97% target, approximately **8.1812 to 9.1812 percentage points** remain for future wager-generated features.

This model excludes external grants, Scatters, free spins, mystery modifiers, daily rewards, secret events, and risk games. No current natural outcome reaches the 40× Commune Jackpot threshold, so instant Jackpot charging is implemented but has zero current transition weight.
