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

The JSON report includes RTP by Ally before and after, average Ally spins, Mystery-added spins, extension frequency, multiple-extension frequency, average feature payout, zero-pay frequency, maximum feature length and payout, natural retrigger frequency, combined retrigger-plus-extension frequency, cap and overflow frequency, and Ryan boost activation frequency.

## Rescue Spin blank-result boundary

Rescue Spin now rerolls only a truly blank zero-coin result. Two or more Mystery Tokens, a natural Three Trees trigger or retrigger, Fortune Burst, and any other persistent mechanical feature award make the candidate nonblank and preserve it. One Mystery Token remains presentation-only and may still reroll. Stacked Rescue attempts stop on the first coin win or meaningful non-coin reward, and the selected coherent result remains reload-safe and exactly-once.
