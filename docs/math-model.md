# Commune Fortune Math Model

## Locked targets

- Final total RTP target: **96% to 97%**
- Base-game RTP target before feature value: **82% to 83%**
- Tree Awakening incremental target: **2.5% to 3.5%**
- Combination contribution target: **1.75% to 2.35%**
- Combined target for this feature pass: **86.0% to 87.5%**
- Grants, rescue refills, and other external coin injections are excluded from theoretical wager RTP.

## Exact outcome space

The game uses three 24-stop reels, three visible rows, five always-active paylines, and one ordinary substituting Wild. Base stops produce:

```text
24 x 24 x 24 = 13,824 reel-stop combinations
```

Tree Awakening has four equally weighted predetermined roll states. Exact feature enumeration therefore uses:

```text
13,824 x 4 = 55,296 weighted feature outcomes
```

The production simulator enumerates all 55,296 outcomes for each required feature-flag configuration. It imports `js/config.js` and `js/payouts.js`, so there is no parallel simulator-only paytable or feature implementation.

## Base line game

The disabled-feature base game remains unchanged:

```text
Base RTP = 82.0023148148%
```

The reel strips, symbol frequencies, normal paylines, line bets, base payouts, and ordinary Wild substitution are unchanged. Better Spin Drama and win tiers remain presentation-only.

## Tree of Life Awakening Wild

Eligibility is defined by the natural matrix:

```js
originalMatrix[1][1] === "TOL"
```

An eligible Tree activates when the stored feature roll is `0` out of four possible values. The result keeps `originalMatrix` intact, copies it to `resolvedMatrix`, and replaces only the three visible cells of reel index `1` with `TOL` when activated.

Normal paylines are evaluated twice for reporting:

```text
base line payout = line payout from originalMatrix
resolved line payout = line payout from resolvedMatrix
incremental Wild payout = resolved line payout - base line payout
```

Only that difference is classified as incremental Tree Awakening RTP. The full transformed line payout is not mislabeled as feature contribution.

Exact results:

- Eligibility frequency: **8.3333%**
- Activation frequency: **2.0833%**, equal to 8.3333% x 25%
- Incremental Tree Awakening RTP: **2.6215%**
- Base plus Tree Awakening RTP: **84.6238%**
- RTP paid on activated expanded-line outcomes, including their pre-existing base value: **7.7257%**

No activation-chance tuning was required.

## Commune combination bonuses

Named trios use the exact left-to-right sequence on the middle row of `originalMatrix`. Full Commune requires every character symbol in the visible grid plus a Tree in the exact center. Because the window contains nine cells, one character may be duplicated.

Full Commune is checked first. If it triggers, no lesser combination is awarded. Ordinary line wins and Tree Awakening remain stackable.

| ID | Name | Trigger | Award | Frequency | RTP |
| --- | --- | --- | ---: | ---: | ---: |
| `kps` | KPs | STR, CYD, TOL | 8 x line bet | 0.1157% | 0.1852% |
| `walls` | Walls | RYN, GAB, TOL | 8 x line bet | 0.1157% | 0.1852% |
| `jaaps` | Jaaps | KEN, COP, TOL | 8 x line bet | 0.1736% | 0.2778% |
| `brotherhood` | Brotherhood | COP, STR, RYN | 12 x line bet | 0.0868% | 0.2083% |
| `wives-circle` | Wives’ Circle | KEN, GAB, CYD | 5 x line bet | 0.4630% | 0.4630% |
| `household` | Household | ASH, STR, CYD | 8 x line bet | 0.1736% | 0.2778% |
| `full-commune` | Full Commune | All seven plus center TOL | 5 x total bet | 0.1157% | 0.5787% |
| | **Total** | | | | **2.1759%** |

No payout-multiplier tuning was required.

## Required feature-flag reports

| Mode | Base line RTP | Wild increment | Combination RTP | Total RTP | House edge |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base only | 82.0023% | 0.0000% | 0.0000% | 82.0023% | 17.9977% |
| Base + expanding Wild | 82.0023% | 2.6215% | 0.0000% | 84.6238% | 15.3762% |
| Base + combinations | 82.0023% | 0.0000% | 2.1759% | 84.1782% | 15.8218% |
| Base + both | 82.0023% | 2.6215% | 2.1759% | 86.7998% | 13.2002% |

The combined expectation is additive because combination awards are based on the natural matrix and the Wild contribution is measured as the resolved-minus-natural line difference for the same stop and roll state.

## Combined distribution

With both features enabled:

- Weighted outcomes: **55,296**
- Any-return frequency: **30.3078%**
- Net-profitable frequency: **29.8665%**
- Maximum payout: **101 coins** at line bet 1
- Maximum payout multiple: **20.20 x total bet**
- Maximum stops: `[7, 4, 5]`
- Maximum feature roll: `0`

Win-tier distribution:

| Tier | Frequency |
| --- | ---: |
| No win | 69.6922% |
| Small Win | 26.7976% |
| Nice Win | 3.4324% |
| Big Win | 0.0778% |
| Commune Jackpot | 0.0000% |

Transformation-count distribution:

| Transformations | Frequency |
| ---: | ---: |
| 0 | 97.9167% |
| 1 | 2.0833% |

## Authoritative result and reload safety

The saved spin result contains:

- target stops
- original and resolved matrices
- feature eligibility, roll, outcomes, and activation
- transformations
- natural and resolved line wins
- combination wins and cells
- each payout subtotal
- final total, tier, anticipation, and settlement status

No feature decision is made after animation begins. A pending result is settled through one pure exactly-once state transition. Recovery never calls the RNG or recalculates a different feature outcome.

## Commands

Run all deterministic presentation, feature, settlement, and exact-math checks:

```bash
npm test
```

Run the exact guard directly:

```bash
node tools/simulate.mjs --check
```

Print all four exact reports:

```bash
npm run simulate
```

Run the seeded million-spin comparison for all four modes:

```bash
npm run simulate:monte-carlo
```

JSON output is available with:

```bash
node tools/simulate.mjs --json
```

## Remaining RTP budget and limitations

The combined feature-pass RTP is **86.7998%**. Relative to the final 96% to 97% target, the remaining wager-generated feature budget is approximately **9.2002 to 10.2002 percentage points**.

This branch intentionally excludes Scatters, free spins, the Fortune Meter, portrait animation, alternate portraits, manual reel stopping, mystery modifiers, secret events, and any backend. Future feature math must continue to report its isolated incremental contribution and the new combined exact total.
