# Commune Fortune math model

## Production outcome space

The game uses three 24-stop circular reel strips, a visible three-symbol window per reel, five fixed paylines, and four predetermined Tree Awakening roll outcomes.

```text
24 × 24 × 24 × 4 = 55,296 exact weighted outcomes
```

`tools/simulate.mjs` imports the production configuration and payout wrappers. The exact pass covers reel payouts, Tree Awakening, combinations, Fortune, the natural Three Trees trigger, bounded Commune Free Spins, isolated Ally state machines, and visible Mystery Token counts.

Mystery modifiers and chained tickets add persistent state that is substantially larger than the existing exact feature solver. The simulator therefore adds a seeded production-path Monte Carlo pass for the full Mystery chain. The seed is fixed at `0x4d595354`, and `npm test` runs 50,000 paid-spin cycles in both full and token-only modes.

## Mystery reel placement

`MYS` is a real nonpaying Scatter symbol. It does not substitute and cannot produce an ordinary line win. Tokens count from the final coherent `originalMatrix` anywhere on the visible 3-by-3 grid.

Reel one contains an adjacent Scatter pair plus one isolated Scatter. Reels two and three each contain three isolated Scatters. The adjacent pair is required because a single visible reel must be able to contribute two tokens to a four-plus result.

| Visible tokens | Exact probability | Award |
| ---: | ---: | --- |
| 0 | 27.6693% | None |
| 1 | 41.3411% | Presentation only |
| 2 | 22.9818% | +10 Fortune and one normal modifier |
| 3 | 6.8359% | +1 Mystery Free Spin and one normal modifier |
| 4+ | 1.1719% | +2 Mystery Free Spins and one strong modifier, falling back to normal while the strong pool is empty |

The exact base pass requests 0.091796875 Mystery Free Spins per paid spin and produces a modifier award on 30.9895833% of paid results.

## Authoritative resolution order

Every paid, Mystery, and Ally spin creates one complete pending result before animation.

1. Select `paid`, `mystery-free`, or `free` spin type.
2. Read and normalize all queued Mystery Modifiers.
3. Read a charged Fortune state for paid and Mystery spins.
4. Generate authoritative reel stops and the stored Tree Awakening roll.
5. Apply Center Tree before line evaluation without changing the natural matrix.
6. Evaluate line wins, combinations, natural Three Trees, and payout modifiers.
7. If Rescue applies to a total loss, generate up to two stored replacements.
8. Select one coherent result. Abandoned Rescue or Ally replay candidates remain nested recovery data only.
9. Atomically consume the Mystery ticket when applicable and clear the active one-spin modifier queue.
10. Save the pending result before presentation.
11. Settle coins, ordinary Fortune, Fortune Burst, and explicit token Fortune once.
12. Apply the final grid's Mystery award once, using its persisted award ID.
13. Create or update the Ally session if the final natural grid qualifies.

The result stores its consumed-ticket marker, active modifiers, Rescue candidates, selected replacement, token cells, award, strong fallback, and settlement status. Reloading never draws a new replacement or reapplies an award.

## Mystery Free Spin state machine

Mystery Free Spins use the same reel and payout generator as paid spins with `coinCost = 0` and `spinType = "mystery-free"`.

They:

- use the current line bet and all five paylines;
- retain Wild substitution, Tree Awakening, and Commune combinations;
- build ordinary Fortune;
- consume a charged Fortune state and receive the 1.5x multiplier;
- can trigger a new four-spin Choose Your Ally session from natural Three Trees;
- can award more tokens, modifiers, and tickets.

The global ticket queue is capped at 20. A Mystery spin consumes exactly one ticket before its pending result is saved. A Three Trees trigger pauses the remaining queue because the active Ally session owns the game loop. Clearing the Ally summary exposes the same persisted Mystery queue again.

Ally Free Spins never consume Mystery tickets. Tokens earned there still settle normally, and their modifier queue is available to the next Ally spin. Tickets earned there wait until the active Ally session closes.

## Modifier math

### Spotlight

Each character has an independent stack count.

```text
line multiplier = min(4, 1 + stacks)
```

The multiplier applies only to line wins whose paying symbol is the selected character. Tree Wilds completing that character's line inherit the same multiplier.

### Center Tree

The center resolved cell changes to `TOL` before paylines are evaluated unless the cell is already `TOL` or `MYS`. The original matrix remains untouched, so Center Tree never creates a natural Three Trees trigger or a natural Full Commune center condition.

### Double Commune

```text
combination multiplier = min(4, 1 + stacks)
```

The multiplier applies to named Commune combinations and Full Commune. It does not modify ordinary lines.

### Rescue Spin

```text
attempts = min(2, stacks)
```

Rerolls stop as soon as a replacement wins. If the original wins, Rescue expires unused. Settlement sees only the selected coherent result, so abandoned losses cannot award coins, Fortune, tokens, combinations, or Three Trees.

### Fortune Burst

```text
win points  = 20 × stacks
loss points = 10 × stacks
stacks      = min(3, stacks)
```

Fortune Burst uses the final coherent win/loss state and adds to ordinary Fortune. It remains active during Ally Free Spins even though those spins otherwise isolate Fortune.

## Current simulator report

The pre-reward exact model is deliberately lower because Mystery Tokens occupy reel stops. The new system's return comes from its modifiers, Fortune, and zero-cost chain spins.

| Exact component | RTP |
| --- | ---: |
| Base lines | 66.1169% |
| Tree Awakening increment | 2.2844% |
| Any-order combinations | 2.0631% |
| Fortune increment before Mystery rewards | 1.5723% |
| RTP before ordinary Commune Free Spins | 72.0367% |
| Ordinary Commune Free Spins increment | 4.5461% |
| Pre-reward baseline | 76.5828% |

The seeded 50,000-cycle full-chain report is:

| Mystery chain metric | Result |
| --- | ---: |
| Mystery Token, ticket, and Fortune increment | +8.7684% RTP |
| Mystery Modifier increment | +14.1580% RTP |
| New total before a specific Ally ability | 99.5092% RTP |
| Mystery Free Spins awarded per paid spin | 0.104640 |
| Mystery Free Spins played per paid spin | 0.104640 |
| Paid cycles starting a Mystery chain | 8.2960% |
| Average chain length when started | 1.2613 |
| Longest observed chain | 8 |
| Fortune charge consumption | 5.5185% of paid and Mystery spins |
| Natural Ally trigger from paid spins | 1.6140% |
| Natural Ally trigger from Mystery spins | 2.1024% |
| Maximum coherent spin | 145 coins |
| Maximum complete paid cycle | 206 coins |

Modifier awards per paid cycle in the same seeded run:

| Modifier | Awards per paid cycle |
| --- | ---: |
| Spotlight | 0.072400 |
| Center Tree | 0.066360 |
| Double Commune | 0.073880 |
| Rescue Spin | 0.073320 |
| Fortune Burst | 0.075180 |

This elevated combined return is intentional for a fake-coin game. The paired token-only pass disables modifier consumption while preserving token Fortune, tickets, and Ally triggering. Its delta from the exact baseline is reported as the token increment; the full pass minus token-only is reported as the modifier increment.

## Ally interaction

The original seven Ally rules remain unchanged:

- Sterling accumulates loss Insurance.
- Ryan doubles one stored early spin.
- Cooper builds a loss ladder for the next win.
- Cydney echoes 45% of the first win.
- Gabi stores a win-only replay and keeps the better coherent result.
- Kenly adds 37% to natural Small Wins.
- Ashley stores one replay for the first loss.

Mystery applies before ordinary Ally payout modifiers. Ashley and Gabi replacements reuse the Mystery result generator while explicitly suppressing a second Rescue loop. The outer Ally composite still retains exactly one final result. Tokens and Fortune Burst are taken from whichever Ally replay result is selected.

The exact Ally table printed by the simulator remains an isolated comparison on the new reel distribution. The full Mystery total intentionally does not claim an exact per-Ally combined RTP because the cross-product of Ally state, modifier stacks, Rescue candidates, Fortune, token tickets, and retriggers is handled by the seeded production-chain pass.

## Persistence invariants

Schema version 6 normalizes:

- `mystery.queuedFreeSpins`;
- the modifier queue, stack caps, and Spotlight character IDs;
- the last 64 applied Mystery award IDs;
- the last applied award presentation record;
- pending Rescue candidates and selected result;
- the Mystery ticket-consumption marker;
- explicit token and Fortune Burst point components;
- strong-to-normal fallback metadata.

Refill changes coins only. It does not clear tickets or modifiers. Legacy saves without Mystery state receive an empty queue.

## Regression commands

```bash
npm test
npm run test:mystery
npm run simulate
npm run simulate:json
node tools/simulate.mjs --check --mystery-sessions=50000
node tools/simulate.mjs --monte-carlo --sessions=200000
```

`--check` validates the 1-in-64 natural Tree trigger, exact token probability sum, noticeable two-token frequency, occasional three-token frequency, rare-but-possible four-plus results, production Mystery chain completion, queue cap, paid and Mystery Ally trigger paths, and reconciliation of the two Mystery RTP components.
