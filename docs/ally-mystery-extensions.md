# Ally Mystery Spin Extension Math

## Rule

Mystery Scatter awards originating from an active, confirmed Commune Ally Free Spins session are resolved inside that same session.

| Visible Mystery Tokens | Inside an active Ally feature | Outside an active Ally feature |
| ---: | --- | --- |
| 1 | Shimmer only | Shimmer only |
| 2 | +10 Fortune and one normal modifier; no added spin | +10 Fortune and one normal modifier; no added spin |
| 3 | +1 Ally Free Spin and one normal modifier | +1 ordinary Mystery Free Spin and one normal modifier |
| 4+ | +2 Ally Free Spins and one Strong modifier, with the existing normal fallback | +2 ordinary Mystery Free Spins and one Strong modifier, with the existing normal fallback |

The conversion does not create a second feature. It retains the session ID, selected Ally, locked line bet, reference bet, accumulated feature win, completed-spin count, total-awarded count, retrigger count, Ally ability state, modifier queue, result IDs, and settlement markers.

## Award ordering

The authoritative pending result stores the Mystery award and its Ally-extension plan before reel presentation begins. Settlement uses this order:

1. Settle the coherent selected spin result exactly once.
2. Apply a natural Three Trees retrigger, if present.
3. Apply the Mystery Ally extension against the remaining feature capacity.
4. Preserve overflow as ordinary queued Mystery Free Spins for after the Ally summary.
5. Finalize an Ally end bonus only when no Ally spin remains.
6. Present the natural retrigger and Mystery extension as separate reasons.

Therefore a spin with a +2 natural retrigger and a +2 Mystery extension adds four spins. Neither award overwrites the other.

## Safety cap

Let:

- `M` be `CONFIG.freeSpins.maximumAwardedSpins`.
- `T` be total awarded Ally spins after the current spin and any natural retrigger settle.
- `R` be the Mystery-requested extension, either 1 or 2.

Then:

```text
capacity = max(0, M - T)
allySpinsAdded = min(R, capacity)
overflowMysterySpins = R - allySpinsAdded
```

Overflow first enters the ordinary Mystery queue. If that queue is already full, the excess remains in the persisted deferred-overflow lane and is consumed after queued tickets. No extension award is silently discarded.

## Exactly-once recovery

The saved authoritative result records:

- award ID
- session ID and Ally ID
- token count
- requested spins
- Ally spins added
- overflow queued and deferred
- modifier and Strong fallback state
- natural retrigger contribution
- before and after remaining-spin counts
- before and after total-awarded counts
- application, presentation, and settlement status

The existing Mystery applied-award ID is the settlement guard. Reload before settlement applies the award once. Reload after settlement cannot apply it again. Reload during an extension spin resumes the existing feature loop without reopening Ally selection or showing the summary early.

## Ally-state invariants

Adding spins mutates only `remainingSpins` and `totalAwardedSpins`, plus the authoritative extension record. It does not reset Ally state.

- Sterling keeps loss count, Insurance Pot, and paid state.
- Ryan keeps the originally selected boost spin and consumed state. Extension spins do not create or relocate a boost.
- Cooper keeps consecutive losses and Rage.
- Cydney keeps the first recorded win, Echo amount, and paid state.
- Gabi keeps her one-use replay and selected coherent result.
- Kenly keeps qualifying-win count and Lemonade total.
- Ashley keeps her one-use replay and improvement.

## Simulation

The before/after Monte Carlo tool uses the same production result, Mystery queue, Ally ability, persistence, settlement, retrigger, and cap logic. The `before` mode disables only in-feature conversion; awards wait in the ordinary queue. The `after` mode enables conversion.

```bash
node tools/simulate-mystery-scatter.mjs --cycles=50000 --ally-cycles=50000 --seed=1297634388
node tools/simulate-mystery-scatter.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

The JSON report includes RTP by Ally before and after, average Ally spins, Mystery-added spins, extension frequency, multiple-extension frequency, average feature payout, zero-pay frequency, maximum feature length and payout, natural retrigger frequency, combined retrigger-plus-extension frequency, cap and overflow frequency, Ryan boost activation frequency, and Rescue reward-preservation metrics.

### Seeded 100,000-cycle-per-Ally audit

Seed `1297634388` produced the following after-change results. RTP deltas are percentage-point differences from the same seeded run with in-feature conversion disabled.

| Ally | RTP after | RTP delta | Avg Ally spins | Mystery-added spins | Features with extension | Multiple extensions | Avg feature payout | Zero-pay | Max length | Max payout |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sterling | 100.5964% | +0.0966 | 4.5840 | 0.4142 | 29.5726% | 5.5840% | 23.5709 | 0.0000% | 10 | 164 |
| Ryan | 100.4372% | -0.0068 | 4.5686 | 0.4326 | 29.2085% | 6.6332% | 21.8361 | 22.7425% | 12 | 270 |
| Cooper | 99.5912% | +0.3586 | 4.5561 | 0.4145 | 28.9004% | 6.1025% | 23.5366 | 23.7191% | 10 | 208 |
| Cydney | 100.6764% | +0.1004 | 4.5744 | 0.4209 | 29.3669% | 6.1547% | 22.7743 | 23.0363% | 11 | 174 |
| Gabi | 100.1100% | +0.0084 | 4.6431 | 0.4260 | 30.2083% | 6.0307% | 23.3448 | 21.4912% | 13 | 231 |
| Kenly | 99.8430% | +0.1046 | 4.5778 | 0.4439 | 31.6934% | 6.0069% | 22.0664 | 21.6819% | 11 | 162 |
| Ashley | 99.6690% | -0.1154 | 4.6348 | 0.4427 | 30.1505% | 7.5810% | 22.1476 | 16.4352% | 11 | 154 |

Across all seven Allies, RTP moved from 100.0538% to 100.1319%, average feature length moved from 4.1502 to 4.5915 spins, average feature payout moved from 20.5529 to 22.7547 coins, and zero-pay frequency fell from 21.5395% to 18.4510%. Mystery extensions occurred in 29.8731% of features, multiple extensions occurred in 6.2968%, and the average feature received 0.4278 Mystery-added Ally spins. The longest observed feature was 13 spins. No feature reached the twenty-spin cap, and no cap overflow occurred in this seeded audit. Ryan's boost activated exactly once in every triggered Ryan feature.

## Rescue Spin blank-result boundary

Rescue Spin now rerolls only a truly blank zero-coin result. Two or more Mystery Tokens, a natural Three Trees trigger or retrigger, Fortune Burst, and any other persistent mechanical feature award make the candidate nonblank and preserve it. One Mystery Token remains presentation-only and may still reroll. Stacked Rescue attempts stop on the first coin win or meaningful non-coin reward, and the selected coherent result remains reload-safe and exactly-once.

The 100,000-cycle-per-Ally after-change audit observed 53,494 Rescue-bearing results. Rescue preserved 21,548 meaningful zero-coin outcomes instead of rerolling them: 21,446 results with two or more Mystery Tokens and 102 natural Three Trees awards. The average Rescue result used 0.4695 attempts. No Fortune Burst-protected zero-coin result appeared in this seed, but deterministic coverage verifies that Fortune Burst and generic persisted feature awards are classified as nonblank.
