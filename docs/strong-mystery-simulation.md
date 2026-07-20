# Strong Mystery simulation contract

The Strong Mystery feature ships with two complementary deterministic simulators.

## Detailed production-path report

`tools/simulate-strong-mystery.mjs` measures the Strong-enabled game at scale and reports:

- Strong selection frequency by modifier
- active-spin payout, zero-coin, and Rescue rates by modifier
- Scatter Magnet and Commune Chaos follow-up and self-loop counts
- Strong chain length and maximum queued Mystery spins
- maximum coherent spin, paid cycle, and Ally feature payout
- Mystery and Ally spins played
- persistent Fortune contribution
- feature-cap and overflow events
- Strong-enabled RTP by Ally

The required command is:

```bash
node tools/simulate-strong-mystery.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

## Matched before-and-after audit

`tools/simulate-strong-mystery-paired.mjs` uses the same seed and the same sample size on both sides of the comparison. It runs 500,000 paid cycles before Strong is installed and 500,000 paid cycles after Strong is installed. It also runs at least 100,000 Ally-feature cycles per mode, divided deterministically across all seven Allies.

It reports overall before and after RTP, the RTP delta, before and after RTP for every Ally, maximum paid-cycle and Ally-feature payouts on both sides, Strong award frequency, Mystery and Ally spin counts, and guard-trip counts.

```bash
npm run simulate:strong-paired
node tools/simulate-strong-mystery-paired.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

## Reproducibility and interpretation

Both tools use seed `1297634388`, production reel strips, production payout and settlement modules, the real Mystery queues, the real Ally state machines, natural retriggers, feature caps, overflow handling, and exactly-once settlement.

The matched report compares equal-sized aggregate samples. The Ally split divides 100,000 requested cycles across seven Allies, producing 14,285 cycles per Ally and 99,995 actual cycles per mode. Per-Ally deltas remain noisier than the 500,000-cycle aggregate because Strong selections consume additional RNG draws and the two paths diverge after the first Strong award. Those rows are diagnostics, not independent balance targets.

The detailed and matched reports are uploaded by `.github/workflows/strong-mystery-validation.yml`. No simulator result automatically changes payouts or feature frequency. Any balance adjustment requires a separate reviewed change.
