# Commune Fortune math model

## Production outcome space

The game uses three 24-stop circular reel strips, a visible three-symbol window per reel, five fixed paylines, and four predetermined Tree Awakening roll outcomes.

```text
24 × 24 × 24 × 4 = 55,296 exact weighted outcomes
```

`tools/simulate.mjs` imports the production configuration and payout wrappers. The exact pass covers reel payouts, Tree Awakening, combinations, Fortune, the natural Three Trees trigger, bounded Commune Free Spins, isolated Ally state machines, and visible Mystery Token counts.

Mystery modifiers, chained tickets, and in-session Ally extensions add persistent state that is substantially larger than the existing exact feature solver. Seeded production-path Monte Carlo passes cover the full Mystery chain and the before-and-after Ally conversion. The established Mystery seed is `0x4d595354`; the Ally-extension audit seed is `1297634388`.

## Mystery reel placement

`MYS` is a real nonpaying Scatter symbol. It does not substitute and cannot produce an ordinary line win. Tokens count from the final coherent `originalMatrix` anywhere on the visible 3-by-3 grid.

Reel one contains an adjacent Scatter pair plus one isolated Scatter. Reels two and three each contain three isolated Scatters. The adjacent pair is required because a single visible reel must be able to contribute two tokens to a four-plus result.

| Visible tokens | Exact probability | Outside an Ally feature | Inside an active Ally feature |
| ---: | ---: | --- | --- |
| 0 | 27.6693% | None | None |
| 1 | 41.3411% | Presentation only | Presentation only |
| 2 | 22.9818% | +10 Fortune and one normal modifier | +10 Fortune and one normal modifier |
| 3 | 6.8359% | +1 ordinary Mystery Free Spin and one normal modifier | +1 Ally Free Spin and one normal modifier |
| 4+ | 1.1719% | +2 ordinary Mystery Free Spins and one strong modifier, falling back to normal while the strong pool is empty | +2 Ally Free Spins and the same strong/fallback modifier rule |

The exact base pass requests 0.091796875 free spins per paid spin and produces a modifier award on 30.9895833% of paid results. The destination of the free-spin component depends only on whether the originating result belongs to an active confirmed Ally session.

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
9. Attach the Mystery award and, for an active Ally result, its extension plan.
10. Atomically consume the Mystery ticket when applicable and clear the active one-spin modifier queue.
11. Save the pending result before presentation.
12. Settle coins, ordinary Fortune, Fortune Burst, and explicit token Fortune once.
13. Apply a natural Ally retrigger, if present.
14. Apply the Mystery award once, using its persisted award ID.
15. Convert the free-spin component into the same Ally session up to the feature cap; preserve overflow as ordinary Mystery spins.
16. Finalize an Ally end bonus only when no Ally spins remain.

The result stores its consumed-ticket marker, active modifiers, Rescue candidates, selected replacement, token cells, award, Ally-extension plan, strong fallback, and settlement and presentation statuses. Reloading never draws a new replacement, reapplies an award, duplicates a modifier, or re-adds an extension.

## Mystery Free Spin state machine

Mystery Free Spins use the same reel and payout generator as paid spins with `coinCost = 0` and `spinType = "mystery-free"`.

They:

- use the current line bet and all five paylines;
- retain Wild substitution, Tree Awakening, and Commune combinations;
- build ordinary Fortune;
- consume a charged Fortune state and receive the 1.5x multiplier;
- can trigger a new four-spin Choose Your Ally session from natural Three Trees;
- can award more tokens, modifiers, and tickets.

The global ordinary ticket queue is capped at 20. A Mystery spin consumes exactly one ticket before its pending result is saved. A Three Trees trigger pauses the remaining queue because the active Ally session owns the game loop. Clearing the Ally summary exposes the same persisted Mystery queue again.

During an active Ally session, three- and four-plus-token awards no longer enter that ordinary queue unless the Ally safety cap has no capacity. The modifier still queues normally and applies to the next eligible Ally spin. Overflow first enters the ordinary queue; if that queue is already full, a persisted deferred-overflow lane drains after the queued tickets so no awarded spin is discarded.

## Ally Mystery extension state machine

The conversion extends the current session object. It preserves the session ID, selected Ally, confirmation and feature-started state, completed and remaining spins, total awarded spins, retrigger count, locked line bet, reference bet, feature win, contribution totals, trigger and presentation results, settlement markers, selected result IDs, modifier queue, and all Ally-specific state.

Let:

- `M` be `CONFIG.freeSpins.maximumAwardedSpins`;
- `T` be total awarded spins after the current result and any natural retrigger;
- `R` be the Mystery-requested extension, either 1 or 2.

```text
capacity = max(0, M - T)
allySpinsAdded = min(R, capacity)
overflowMysterySpins = R - allySpinsAdded
```

A natural +2 retrigger and a +2 Mystery extension therefore add four spins when capacity permits. The two reasons remain separate in authoritative result and presentation data.

The plan records award ID, token count, requested spins, accepted Ally spins, queued and deferred overflow, modifier and Strong fallback, natural retrigger contribution, before-and-after remaining counts, before-and-after total-awarded counts, application status, presentation status, and settlement status.

### Ally invariants

- Sterling retains loss count, Insurance Pot, and paid state.
- Ryan retains the originally selected boost spin and consumed state. An extension neither creates nor relocates a boost.
- Cooper retains consecutive losses and Rage multiplier.
- Cydney retains the first recorded winning spin, amount, Echo bonus, and paid state.
- Gabi retains her one-use replay, original and replacement results, selected result, and improvement.
- Kenly retains qualifying-win count and accumulated Lemonade bonus.
- Ashley retains her one-use replay, original spin ID, replacement result, and improvement.

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

## Established Mystery baseline

The pre-reward exact model is deliberately lower because Mystery Tokens occupy reel stops. The system's return comes from its modifiers, Fortune, and zero-cost chain spins.

| Exact component | RTP |
| --- | ---: |
| Base lines | 66.1169% |
| Tree Awakening increment | 2.2844% |
| Any-order combinations | 2.0631% |
| Fortune increment before Mystery rewards | 1.5723% |
| RTP before ordinary Commune Free Spins | 72.0367% |
| Ordinary Commune Free Spins increment | 4.5461% |
| Pre-reward baseline | 76.5828% |

The seeded 50,000-cycle full-chain report before in-feature conversion is:

| Mystery chain metric | Result |
| --- | ---: |
| Mystery Token, ticket, and Fortune increment | +8.7684% RTP |
| Mystery Modifier increment | +14.1580% RTP |
| Total before a specific Ally ability | 99.5092% RTP |
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

The in-feature conversion is an intentional generosity increase. No compensating reduction is applied to Scatter frequency, Mystery awards, Ally abilities, modifiers, payouts, Fortune, starting spins, or natural retriggers.

## Before-and-after Ally simulation

`tools/simulate-mystery-scatter.mjs` uses the same production result generator, Mystery queue, Ally abilities, settlement, retriggers, feature cap, and exactly-once paths in both modes. `before` disables only in-feature conversion; `after` enables it. The report includes:

- RTP by Ally before and after;
- average Ally spins and Mystery-added spins per feature;
- feature extension and multiple-extension frequency;
- average feature payout and zero-pay frequency by Ally and overall;
- maximum observed feature length and payout;
- natural retrigger, Mystery extension, and combined-event frequency;
- feature-cap and overflow frequency;
- Ryan boost activation frequency and Ryan RTP.

The seed is written into every JSON report so all results are reproducible. See `docs/ally-mystery-extensions.md` for the full contract.

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

The extension plan is nested in the authoritative spin and preserved by the existing free-spin presentation and result cloning. Deferred overflow is stored with the last Mystery award. Refill changes coins only and does not clear tickets, modifiers, extension state, or overflow. Legacy saves without Mystery state receive an empty queue.

## Regression commands

```bash
npm test
npm run test:mystery
npm run test:ally-mystery
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
node tools/simulate.mjs --check --mystery-sessions=50000
node tools/simulate.mjs --monte-carlo --sessions=200000
node tools/simulate-mystery-scatter.mjs --cycles=50000 --ally-cycles=50000 --seed=1297634388
node tools/simulate-mystery-scatter.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

The deterministic suite validates 1-, 2-, 3-, and 4+-Token behavior, natural retrigger stacking, repeated extension chains, final-spin summary suppression, modifier consumption, all seven Ally-state invariants, Ryan's one-use boost, reload before and after application, cap overflow, deferred overflow, outside-feature behavior, QA controls, complete ability labels, flexible HUD width, and absence of horizontal overflow or ellipsis-inducing CSS.
