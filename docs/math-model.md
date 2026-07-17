# Commune Fortune Math Model

## Locked targets

- Base-game RTP: **82% to 83%**
- Tree Awakening increment: **2.5% to 3.5%**
- Any-order combination contribution: **2.5% to 3.1%**
- Commune Free Spins increment: **5.4% to 5.9%**
- Combined total after this patch: **93.9% to 94.4%**
- Character reactions: **0.0000% RTP effect**
- Manual stopping: **0.0000% RTP effect**
- Visual-effects mode and mobile tuning: **0.0000% RTP effect**

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

`tools/simulate-polish.mjs` imports the production configuration, free-spin trigger, payout engine, and combination matcher. It runs both the former exact-order definitions and the production any-order definitions against the same authoritative outcome space.

## Commune Line rule

The middle row is the only Commune Line.

For standard named combinations, the production matcher compares the sorted three-symbol middle row with the sorted required `members` set. Order therefore does not matter, but row location still does.

The following do not qualify:

- top row
- bottom row
- vertical column
- diagonal
- another payline
- a trio manufactured outside the natural middle row by Tree Awakening

Detection uses `originalMatrix`. Ordinary line evaluation may use `resolvedMatrix` after Tree Awakening, but combination evaluation does not.

## Combination definitions and awards

| Combination | Members | Award |
| --- | --- | ---: |
| KPs | STR, CYD, TOL | 2× line bet |
| Walls | RYN, GAB, TOL | 2× line bet |
| Jaaps | KEN, COP, TOL | 2× line bet |
| Brotherhood | COP, STR, RYN | 3× line bet |
| Wives’ Circle | KEN, GAB, CYD | 1× line bet |
| Household | ASH, STR, CYD | 2× line bet |
| Full Commune | all seven members visible and TOL center | 5× total bet |

Full Commune is evaluated first. When present, it suppresses every lesser named combination.

## Old-versus-new exact result

At line bet 1 and total bet 5:

| Component | Previous exact order | New any order | Delta |
| --- | ---: | ---: | ---: |
| Base line RTP | 82.0023% | 82.0023% | 0.0000 pp |
| Tree Awakening increment | 2.6215% | 2.6215% | 0.0000 pp |
| Named combination RTP | 1.5972% | 2.2193% | +0.6221 pp |
| Full Commune RTP | 0.5787% | 0.5787% | 0.0000 pp |
| Total combination RTP | 2.1759% | 2.7980% | +0.6221 pp |
| Pre-Fortune wager RTP | 86.7998% | 87.4219% | +0.6221 pp |
| Fortune increment | 1.0190% | 1.1016% | +0.0825 pp |
| RTP before free spins | 87.8188% | 88.5234% | +0.7046 pp |
| Free-spin increment | 5.6000% | 5.6401% | +0.0401 pp |
| Final combined RTP | 93.4188% | 94.1636% | +0.7448 pp |

The 2.7980% combination contribution is within the required 2.5% to 3.1% zone.

The Fortune increment rises slightly because combination awards add Fortune points and therefore affect the exact stationary meter distribution. Free-spin RTP also rises slightly because the any-order combination rule remains active during free spins.

## Exact trigger frequencies

| Combination | Previous exact order | New any order |
| --- | ---: | ---: |
| KPs | 0.1157% | 0.6944% |
| Walls | 0.1157% | 0.6076% |
| Jaaps | 0.1736% | 1.0489% |
| Brotherhood | 0.0868% | 0.5787% |
| Wives’ Circle | 0.4630% | 2.3438% |
| Household | 0.1736% | 1.1574% |
| Full Commune | 0.1157% | 0.1157% |

The frequencies are not uniformly six times the former rate because duplicate reel-strip windows, Full Commune suppression, and the actual production strips determine the exact weighted outcome count.

## Fortune Meter model

Every paid spin adds two base points, then natural-tier and combination points. The meter has states 0 through 100. State 100 means the next paid spin is charged. A charged paid spin consumes the state before the current outcome award is applied.

The simulator solves the exact 101-state stationary distribution for both combination models. Free spins do not transition the Fortune state. A charge present before or earned by the triggering result remains unchanged throughout the feature.

## Three Trees trigger frequency

Each reel contains two Tree symbols. A three-row window contains a Tree on six of the twenty-four possible top stops:

```text
P(Tree visible on one reel) = 6 / 24 = 1 / 4
P(Tree visible on all reels) = 1 / 4 x 1 / 4 x 1 / 4 = 1 / 64
```

Therefore:

- Paid trigger frequency: **1.5625%**
- Average paid spins between triggers: **64.0000**

The trigger uses `originalMatrix`; Tree Awakening cannot create it.

## Free-spin transition model

A paid trigger starts with four spins. Every free spin uses the exact weighted natural outcome distribution, with Fortune disabled and the triggering reference bet locked.

A natural Three Trees result awards up to two additional spins without exceeding twenty total awarded spins:

```text
remaining = remaining - 1 + min(2, 20 - totalAwarded)
totalAwarded = totalAwarded + min(2, 20 - totalAwarded)
```

Otherwise:

```text
remaining = remaining - 1
```

The bounded state is identified by `(remainingSpins, totalAwardedSpins)`.

## New exact free-spin results

| Metric | Exact result |
| --- | ---: |
| Average free spins per feature | 4.129032 |
| Average retriggers per feature | 0.064516 |
| Features with at least one retrigger | 6.1050% |
| Average feature payout | 18.048387 coins |
| Incremental free-spin RTP | 5.6401% |
| Zero-pay feature frequency | 19.0708% |
| Maximum feature payout | 2,020 coins |

The feature frequency and duration distribution are unchanged. Only the payout distribution changes through the clearer combination rule.

## Exactly-once transaction and recovery

Before animation, each paid or free result stores target stops, original and resolved matrices, feature roll, transformations, line wins, combination wins, trigger data, payout, and classification as `pendingSpin`.

Settlement performs one transaction:

1. Credit the individual payout.
2. Apply Fortune changes for paid spins.
3. Increment free-spin completion state when applicable.
4. Apply a retrigger once, subject to the cap.
5. Store the settled result for presentation recovery.
6. Clear `pendingSpin`.
7. Save before presentation.

The combination patch changes result classification before settlement but does not alter the settlement transaction.

## Presentation isolation

Manual stop input, reactions, sound, and visual effects operate after authoritative result generation. Auto, Full, and Reduced visual modes modify CSS classes and animation intensity only.

```text
Manual-stop RTP effect    = 0.0000%
Reaction RTP effect       = 0.0000%
Visual-effects RTP effect = 0.0000%
```

Deterministic tests compare the mathematical result fields across visual modes and manual-stop settings.

## Commands

```bash
npm test
npm run test:features
npm run test:presentation
npm run test:polish
npm run simulate
npm run simulate:without-free-spins
npm run simulate:with-free-spins
node tools/simulate-polish.mjs --check
node tools/simulate-polish.mjs --json
```

`--check` fails if the previous baseline drifts, the new exact total drifts, combination RTP leaves 2.5% to 3.1%, total RTP leaves 93.9% to 94.4%, Three Trees ceases to be exactly 1 in 64, or visual effects acquire any mathematical contribution.
