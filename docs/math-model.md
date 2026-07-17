# Commune Fortune Math Model

## Locked targets

- Final total RTP target: **96% to 97%**
- Working center: **96.5%**
- Base-game RTP target before feature value: **82% to 83%**
- Daily grants, rescue refills, and other external coin injections are excluded from theoretical wager RTP.

## Current base game

The current game uses three 24-stop reels, three visible rows, five always-active paylines, and one substituting Wild symbol. The exact outcome space is:

```text
24 x 24 x 24 = 13,824 stop combinations
```

Because this space is small, base-game RTP is calculated by exact enumeration rather than estimated through random sampling.

The Cydney line multiplier is set to 11. With the current reel strips and all other payouts unchanged, the exact base-game RTP is approximately **82.0023%**. Rearranging the existing reel strips without changing symbol counts can change clustering and volatility, but it does not materially change the expectation of a basic independent payline. Keep reel-order changes focused on visible formation, multi-line clustering, near misses, and future window-based mechanics.

## Feature budget

At a 96.5% total target and an 82.0023% base game, approximately **14.50 percentage points** remain for wager-generated features.

A starting allocation could be:

| Component | Provisional RTP |
| --- | ---: |
| Base paylines and ordinary Wild substitution | 82.0% |
| Expanding Wild | 3.0% |
| Group combinations | 1.5% |
| Scatter direct awards | 0.5% |
| Free spins and retriggers | 7.0% |
| Mystery modifiers | 1.5% |
| Mechanical secret events | 0.5% |
| Unallocated tuning reserve | 0.5% |
| **Total** | **96.5%** |

These feature allocations are provisional. Every implemented feature must report its own incremental RTP contribution and the combined result.

## Commands

Run the exact enumerator:

```bash
npm run simulate
```

Fail when base RTP falls outside the configured 82% to 83% range:

```bash
npm test
```

Run a seeded million-spin comparison:

```bash
npm run simulate:monte-carlo
```

The simulator imports the production `config.js` and `payouts.js` modules. It does not maintain a separate copy of the paytable or payout rules.

## Required metrics

Base and feature simulations should track at least:

- RTP and house edge
- Any-return frequency
- Partial-return frequency
- Break-even frequency
- Net-profitable frequency
- Average payout per spin
- Average payout on winning spins
- Maximum payout
- Payout distribution
- Winning-line count distribution
- RTP contribution by symbol or feature
- Feature trigger and retrigger frequency
- Long losing streaks and bankroll survival for stateful simulations
