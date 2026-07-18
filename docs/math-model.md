# Commune Fortune Math Model

## Locked targets

- Base-game RTP: **82% to 83%**
- Tree Awakening increment: **2.5% to 3.5%**
- Combination contribution after this patch: **2.5% to 3.1%**
- Commune Free Spins increment target: **5.4% to 5.9%**
- Long-term final target: **96% to 97%**
- Character reactions: **0.0000% RTP effect**
- Manual stopping: **0.0000% RTP effect**
- Visual-effects mode and mobile WebKit stabilization: **0.0000% RTP effect**

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

`tools/simulate.mjs` imports the production configuration, free-spin logic, and payout engine. It does not maintain simulator-only strips, payouts, triggers, feature rolls, Fortune awards, or multipliers.

## Previous and current wager RTP

At line bet 1 and total bet 5:

| Component | Previous exact-order model | New any-order model |
| --- | ---: | ---: |
| Base line RTP | 82.0023% | 82.0023% |
| Tree Awakening increment | 2.6215% | 2.6215% |
| Named combination RTP | 1.5972% | 2.2193% |
| Full Commune RTP | 0.5787% | 0.5787% |
| Total combination RTP | 2.1759% | 2.7980% |
| Pre-Fortune total | 86.7998% | 87.4220% |
| Fortune Meter increment | 1.0190% | 1.1016% |
| Total without free spins | 87.8188% | 88.5234% |
| Free-spin increment | 5.6000% | 5.6401% |
| Final combined RTP | 93.4188% | 94.1636% |
| Final total change | — | +0.7448 percentage points |

The new total combination contribution is inside the requested **2.5% to 3.1%** target.

## Any-order Commune Line combinations

The standard named combinations use the middle row from `originalMatrix`. Each definition is a three-symbol member set. The matcher compares a canonical sorted key for the visible middle-row symbols against a canonical key for each definition.

This makes all six permutations equivalent while preserving the boundary:

- top row does not qualify
- bottom row does not qualify
- vertical columns do not qualify
- diagonals do not qualify
- other paylines do not qualify
- Tree Awakening cannot manufacture a combination

Full Commune remains separate. It requires all seven members somewhere in the visible grid and a natural Tree in the center cell. It suppresses standard named combinations.

### Payout table

| Combination | Award |
| --- | ---: |
| KPs | 2× line bet |
| Walls | 2× line bet |
| Jaaps | 2× line bet |
| Brotherhood | 3× line bet |
| Wives’ Circle | 1× line bet |
| Household | 2× line bet |
| Full Commune | 5× total bet |

### Exact trigger frequencies

| Combination | Previous exact order | New any order |
| --- | ---: | ---: |
| KPs | 0.1157% | 0.6944% |
| Walls | 0.1157% | 0.6076% |
| Jaaps | 0.1736% | 1.0489% |
| Brotherhood | 0.0868% | 0.5787% |
| Wives’ Circle | 0.4630% | 2.3438% |
| Household | 0.1736% | 1.1574% |
| Full Commune | 0.1157% | 0.1157% |

### Exact contribution by combination

| Combination | RTP contribution |
| --- | ---: |
| KPs | 0.2778% |
| Walls | 0.2431% |
| Jaaps | 0.4196% |
| Brotherhood | 0.3472% |
| Wives’ Circle | 0.4688% |
| Household | 0.4630% |
| Named combinations total | 2.2193% |
| Full Commune | 0.5787% |
| All combinations | 2.7980% |

## Fortune Meter model

Every paid spin adds two base points, then natural-tier and combination points. The meter has states 0 through 100. State 100 means the next paid spin is charged. A charged paid spin consumes the state before its current outcome award is applied.

The any-order model changes the stationary distribution because standard combinations occur more often and therefore award Fortune points more often. The exact stationary solution gives a new incremental Fortune contribution of **1.1016%**.

Free spins do not transition the Fortune state. A charge present before or earned by the triggering result remains unchanged throughout the feature.

## Three Trees trigger frequency

Each 24-stop reel contains two Tree symbols. A three-row window contains a Tree with probability:

```text
6 visible Tree-containing top stops / 24 top stops = 1/4
```

The reels are independent:

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

The simulator solves states identified by `(remainingSpins, totalAwardedSpins)`. The state space is finite because total awarded spins cannot exceed twenty.

Under the new any-order model, the exact free-spin contribution is **5.6401%**.

## Presentation isolation

Visual-effects mode, mobile detection, animation classes, flash overlays, anticipation glow, and WebKit stabilization are presentation-only. They are absent from result generation and settlement.

Mobile WebKit stabilization specifically removes transforms and filters from the clipped reel viewport, reel frame, and cabinet while the reel strip is moving. It changes only how stop feedback is drawn.

```text
Visual-effects RTP effect = 0.0000%
Mobile WebKit stabilization RTP effect = 0.0000%
```

Tests compare authoritative result fields across visual modes and assert the mobile CSS path cannot reintroduce viewport, frame, or cabinet transform animations.

## Exactly-once settlement and recovery

Before animation, every result stores target stops, original and resolved matrices, feature rolls, transformations, wins, trigger data, payout, and classification as `pendingSpin`.

Settlement credits the result once, updates Fortune and free-spin state once, stores the settled presentation result, clears `pendingSpin`, and saves before presentation. Animation progress is never authoritative and is not persisted.

## Commands

```bash
npm test
npm run simulate
npm run simulate:without-free-spins
npm run simulate:with-free-spins
node tools/simulate.mjs --check
node tools/simulate.mjs --json
```

`--check` fails if combination RTP leaves 2.5% to 3.1%, the paid trigger frequency changes from 1 in 64, free-spin contribution leaves 5.4% to 5.9%, visual effects alter result math, or the exact report drifts from the locked values.

## Deferred systems

The model does not include Ally Selection, ally abilities, alternate reaction assets, a Scatter symbol, mystery modifiers, risk-or-collect, daily rewards, or secret events.