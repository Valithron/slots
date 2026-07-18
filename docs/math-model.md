# Commune Fortune Math Model

## Locked targets

- Current pre-ally total RTP: approximately **94.16%**
- Selected-ally total RTP target: **95.2% to 95.8%**
- Preferred center: approximately **95.5%**
- Maximum without explicit justification: **96.0%**
- Ally parity spread target: no more than **0.10 percentage points** preferred, **0.15 points** maximum
- Manual stopping, reactions, selection presentation, and mobile-safe visual effects: **0.0000% RTP effect**

External grants and Refill are excluded from wager RTP.

## Exact weighted outcome space

Three 24-stop reels and four predetermined Tree Awakening rolls produce:

```text
24 x 24 x 24 x 4 = 55,296 weighted outcomes
```

The simulator imports the production reel strips, payouts, feature settings, combination definitions, and ally parameter values. Its payout evaluator mirrors the production result pipeline and is guarded by deterministic source and exact-value tests.

## Current baseline

At line bet 1 and total bet 5:

| Component | RTP |
| --- | ---: |
| Base lines | 82.0023% |
| Tree Awakening increment | 2.6215% |
| Any-order combinations | 2.7980% |
| Fortune Meter increment | 1.1016% |
| RTP before free spins | 88.5234% |
| Commune Free Spins increment | 5.6401% |
| Current total RTP | 94.1636% |

The natural Three Trees trigger remains exactly 1 in 64 paid spins. The bounded base feature has an average payout of 18.048387 coins, average length of 4.129032 spins, 19.0708% zero-pay frequency, and 6.1050% probability of at least one retrigger.

## Shared ally settlement rules

Only one ally is active per feature. Each spin starts from one coherent natural free-spin result containing line wins, combination wins, Tree state, retrigger data, and natural tier.

All percentage and multiplier calculations use:

```js
Math.floor(baseAmount * configuredMultiplier)
```

End bonuses are credited after the final accepted free spin reduces `remainingSpins` to zero. They are added to browser coins and `session.accumulatedWin` exactly once. `endBonusPaid` prevents duplication.

Replays are resolved before settlement. The original and replacement remain stored for recovery, but only the selected coherent result reaches settlement.

## Ally state machines

### Sterling: No Whammys

State:

```text
lossCount
insurancePot
paid
```

After each final zero-pay spin:

```text
lossCount += 1
insurancePot = min(
  floor(1.5 x referenceBet),
  floor(lossCount x 0.35 x referenceBet)
)
```

The pot pays once at feature completion. Wins do not reset or increase it.

Exact metrics:

- Incremental RTP: **1.3906%**
- Total RTP: **95.5542%**
- Average Insurance Pot: **4.4500 coins**
- Insurance cap frequency: **22.0691%**
- Average insured losses: **2.7303**
- Baseline zero-pay sessions rescued: **19.0708%**
- Final zero-pay frequency: **0.0000%**
- Standard deviation: **17.1166**

### Ryan: Big Win

At session confirmation, one integer from 1 through 4 is generated and stored. On that free-spin position:

```text
finalSpinPayout = floor(baseSpinPayout x 2)
```

The designation is revealed before the selected spin begins. It does not multiply retrigger counts, end bonuses, or Fortune.

Exact metrics:

- Incremental RTP: **1.3660%**
- Total RTP: **95.5295%**
- Marked-spin monetary hit rate: **33.8759%**
- Average marked base payout: **4.3711 coins**
- Zero-value marked spin rate: **66.1241%**
- Maximum ally bonus: **101 coins**
- Maximum feature payout: **2,121 coins**
- Standard deviation: **23.3131**, highest of the seven

### Cooper: Rage-Bait

State is consecutive final losses, capped at three. The next winning spin uses:

| Stored losses | Multiplier |
| ---: | ---: |
| 0 | 1x |
| 1 | 1.3x |
| 2 | 1.6x |
| 3+ | 2x |

After an empowered win, Rage resets to zero. Stored Rage expires at feature end.

Exact metrics:

- Incremental RTP: **1.2975%**
- Total RTP: **95.4611%**
- Average maximum Rage multiplier reached: **1.6818x**
- Features ending with unused Rage: **67.1002%**
- Expected 1.3x empowered wins per feature: **0.3888**
- Expected 1.6x empowered wins per feature: **0.2055**
- Expected 2x empowered wins per feature: **0.1033**
- Average Rage bonus: **4.1521 coins**
- Standard deviation: **21.5357**

### Cydney: I’m Listening

The first final monetary win stores its spin ID and payout. Later wins cannot replace it.

```text
echoBonus = floor(recordedPayout x 0.45)
```

The Echo pays once at feature completion.

Exact metrics:

- Incremental RTP: **1.3279%**
- Total RTP: **95.4914%**
- Features recording a win: **80.9292%**
- Average recorded amount: **10.4425 coins**
- Average Echo Bonus: **4.2492 coins**
- No-Echo frequency: **19.0708%**
- Maximum feature payout: **2,065 coins**
- Standard deviation: **21.4539**

### Gabi: Eww

The starting unrestricted replay proposal produced only 0.2171% incremental RTP. Threshold changes could not reach parity without making the rule vague or excessively broad. The final mechanic preserves weak-win rejection but changes the replacement source to a win-only judgment pool.

On the first accepted payout below 3x total bet:

1. Store the original result.
2. Generate and store a positive replacement result before animation.
3. Compare monetary payout.
4. Select the replacement only when it is strictly greater.
5. Preserve all retrigger and feature data from the selected coherent result.
6. Consume Eww regardless of improvement.

Production uses bounded rejection sampling with 512 attempts and a deterministic positive fallback. The exact model uses the mathematically equivalent positive-outcome conditional distribution.

Exact metrics:

- Incremental RTP: **1.3007%**
- Total RTP: **95.4642%**
- Activation frequency: **69.9752%**
- Average original weak win: **6.0722 coins per feature**
- Average replacement payout: **9.0291 coins per feature**
- Replay improves the result in **37.9575%** of features
- Replay ties in **11.4718%** of features
- Average net improvement: **3.9660 coins**
- Average free spins: **4.1739**, slightly higher because the selected replacement may retrigger
- Standard deviation: **20.5079**

### Kenly: Big Lemons

Qualification uses the natural pre-ally tier. For each natural Small Win:

```text
lemonBonus = floor(baseSpinPayout x 0.37)
finalSpinPayout = baseSpinPayout + lemonBonus
```

The bonus cannot recursively change its own qualification.

Exact metrics:

- Incremental RTP: **1.3031%**
- Total RTP: **95.4666%**
- Average qualifying Small Wins: **1.2536 per feature**
- Average Lemonade Bonus: **4.1699 coins**
- Features receiving no Lemonade Bonus: **29.0352%**
- Average bonus per qualifying spin: **3.3264 coins**
- Standard deviation: **20.7610**

### Ashley: Fastball

The first natural zero-pay result is stored but abandoned. A replacement result is generated and stored before its animation. The replacement becomes the only accepted result for that position and may win, lose, retrigger, awaken the Tree, or trigger a combination.

Exact metrics:

- Incremental RTP: **1.3912%**
- Total RTP: **95.5547%**
- Activation frequency: **98.8783%**
- Replay monetary win frequency: **33.8759%**
- Replay retrigger frequency: **1.5625%**
- Operational zero-pay rescue frequency: **6.3042%**
- Final zero-pay frequency: **12.6104%**
- Average Fastball improvement: **4.3221 coins**
- Average free spins: **4.1587**
- Standard deviation: **20.0844**

## Tuning history

| Ally | Initial setting | Initial total RTP | Final setting | Final total RTP |
| --- | --- | ---: | --- | ---: |
| Sterling | 0.5x per loss, 3x cap | 96.2194% | 0.35x per loss, 1.5x cap | 95.5542% |
| Ryan | 5x marked spin | 99.6274% | 2x marked spin | 95.5295% |
| Cooper | 1.5x, 2x, 3x ladder | 96.5880% | 1.3x, 1.6x, 2x ladder | 95.4611% |
| Cydney | 50% Echo | 95.7516% | 45% Echo | 95.4914% |
| Gabi | First win below 1x, ordinary replay | 94.3806% | First win below 3x, win-only replay | 95.4642% |
| Kenly | 50% Small Win bonus | 96.1503% | 37% Small Win bonus | 95.4666% |
| Ashley | One first-loss replay | 95.5547% | Unchanged | 95.5547% |

Final parity spread:

```text
95.5547% - 95.4611% = 0.0936 percentage points
```

## Persistence and migration

Schema version 6 stores the complete ally state inside the free-spin session. The selected ally and all hidden decisions are normalized but never rerolled.

Legacy policy:

- Existing sessions without an `ally` object are marked `legacyNoAlly`.
- They continue under the prior free-spin math.
- They do not show selection and do not receive an invented ally.
- New sessions require selection and confirmation.

## Fortune isolation

Free spins still do not gain Fortune, consume a charged Fortune state, or receive the Fortune multiplier. Ally effects never read or write the Fortune Meter. A charged state waits for the next paid spin.

## Simulator methodology

The exact solver:

1. Enumerates 55,296 weighted production outcomes.
2. Solves the 101-state Fortune stationary distribution.
3. Compresses free-spin outcomes by payout, natural tier, and retrigger state.
4. Solves bounded transition states through the 20-spin cap.
5. Adds ally-specific state such as losses, selected spin, Rage, first win, replay-used flags, and recorded amounts.
6. Computes first and second payout moments, zero-pay probability, maxima, activation metrics, ally bonus, retriggers, average feature length, and cap frequency.
7. Runs a seeded Monte Carlo comparison as an independent verification path.

Median is not emitted. A full payout distribution across replay and recorded-value states would materially expand memory, while variance, zero-pay frequency, and maxima already capture the balancing distinctions used here.

## Regression commands

```bash
npm test
npm run test:allies
node tools/simulate.mjs --check
node tools/simulate.mjs --json
node tools/simulate.mjs --monte-carlo --sessions=200000
```

`--check` fails when baseline RTP drifts, the Three Trees trigger leaves 1 in 64, any ally leaves the 95.2% to 95.8% target, parity exceeds 0.10 percentage points, probabilities become invalid, or the feature cap contract changes.
