# Commune Fortune math model

## Production outcome space

The game uses three 24-stop circular reel strips, a visible three-symbol window per reel, five fixed paylines, and four predetermined Tree Awakening roll outcomes.

```text
24 × 24 × 24 × 4 = 55,296 exact weighted outcomes
```

`tools/simulate.mjs` imports the production configuration and payout wrappers. Its exact pass covers reel payouts, Tree Awakening, combinations, Fortune, the natural Three Trees trigger, bounded Commune Free Spins, isolated Ally state machines, and visible Mystery Token counts.

`tools/simulate-mystery-scatter.mjs` runs the production settlement path with a fixed seed. It measures persistent Mystery queues, Rescue candidates, Fortune, Mystery Free Spins, Ally triggering, selected Ally abilities, and complete paid-spin cycles. The committed decimal seed is `1297634388`.

## Requested RTP layers

The historical pre-Mystery configuration is preserved at commit `d5b044c`. It had no Scatter symbols and returned 94.1636% after ordinary Commune Free Spins. Since Mystery Tokens occupy real stops, current-strip layers are necessarily lower before Mystery awards are restored.

| Layer | Definition | Result |
| --- | --- | ---: |
| A | Historical pre-Mystery exact total, commit `d5b044c` | 94.1636% |
| B | Current strips with tokens counted but all Mystery awards disabled | 79.2902% Monte Carlo; 79.4423% exact current-strip baseline |
| C | Current strips with +10 Fortune awards only | 79.8975% |
| D | Fortune and modifiers, no Mystery Free Spin tickets | 89.9597% |
| E | Fortune and Mystery Free Spin tickets, no modifiers | 84.7562% |
| F | Full Mystery system without a selected Ally ability | 95.3734% |
| G | Full Mystery system with each production Ally ability | 96.5688% to 97.2830% |

Layers B through F use 500,000 paid cycles. Layer G uses 100,000 paid cycles per Ally. The no-Ally F layer is a diagnostic and legacy path. New Three Trees sessions require a selected Ally, so Layer G is the production-facing return range.

## Mystery reel placement and tuning

`MYS` is a real nonpaying Scatter symbol. It does not substitute and cannot produce an ordinary line win. Tokens count from the final coherent `originalMatrix` anywhere on the visible 3-by-3 grid.

The initial strips placed three Scatters on every reel. Reel one included an adjacent pair, which allows a single reel window to contribute two tokens. The initial 2+ outcome rate was 30.9896%, which matched the player report that tokens felt too constant.

The implemented Path B adjustment is deliberately small:

- preserve all three Scatters on reel one, including the adjacent pair;
- replace one isolated reel-two Scatter with Kenly;
- replace one isolated reel-three Scatter with Gabi;
- preserve all Mystery award values, modifier caps, and ticket caps.

| Visible tokens | Before | Current exact | Award |
| ---: | ---: | ---: | --- |
| 0 | 27.6693% | 39.8438% | None |
| 1 | 41.3411% | 38.2813% | Presentation only |
| 2 | 22.9818% | 16.9271% | +10 Fortune and one normal modifier |
| 3 | 6.8359% | 4.4271% | +1 Mystery Free Spin and one normal modifier |
| 4+ | 1.1719% | 0.5208% | +2 Mystery Free Spins and one strong modifier, falling back to normal while the strong pool is empty |
| 2+ total | 30.9896% | 21.8750% | Modifier-awarding result |

The current exact base pass requests 0.0546875 Mystery Free Spins per paid spin. The 500,000-cycle full run observed 2+ tokens on 21.6784% of paid spins and 0.869404 visible tokens per paid spin, consistent with the exact distribution.

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
14. Present reactions only from the final selected result.

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

Ally Free Spins never consume Mystery tickets. Tokens earned there still settle normally, and tickets earned there wait until the active Ally session closes. In the 500,000-cycle F run, the longest Mystery chain was 6 spins, the maximum queued ticket count was 4, and the queue cap was never reached.

## Modifier queue and stacking

A naturally earned modifier applies to the next eligible spin. That spin consumes the queue before its result can award a replacement modifier. Since each result awards at most one modifier, natural play currently produces at most one queued modifier.

The 500,000-cycle full run measured:

- any queued modifier after settlement: 21.6549% of settled spins;
- multiple queued modifiers: 0.0000%;
- chain-inclusive modifier awards: 0.245286 awards per paid cycle.

Stack caps are still authoritative for QA-injected queues, recovered state, and future award paths that can accumulate multiple awards.

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

Rerolls stop as soon as a replacement wins. If the original wins, Rescue expires unused. Settlement and reel reactions use only the selected coherent result, so abandoned losses cannot award coins, Fortune, tokens, combinations, Three Trees, or portrait animations.

### Fortune Burst

```text
win points  = 20 × stacks
loss points = 10 × stacks
stacks      = min(3, stacks)
```

Fortune Burst uses the final coherent win/loss state and adds to ordinary Fortune. It remains active during Ally Free Spins even though those spins otherwise isolate Fortune.

## Current full-system metrics

The 500,000-cycle Layer F run produced:

| Metric | Result |
| --- | ---: |
| Current-strip pre-award RTP | 79.2902% |
| Full Mystery RTP without selected Ally | 95.3734% |
| Increment over current-strip pre-award layer | +16.0832 points |
| Mystery Free Spins awarded per paid spin | 0.060762 |
| Mystery Free Spins played per paid spin | 0.060762 |
| Paid cycles starting a Mystery chain | 5.1772% |
| Average conditional Mystery chain length | 1.173646 |
| Longest Mystery chain | 6 |
| Fortune charge consumption | 4.7044% |
| Ally trigger from paid spins | 1.6348% |
| Ally trigger from Mystery spins | 1.7215% |
| Ally Free Spins containing at least one Mystery Token | 60.0111% |
| Average Mystery Tokens per Ally Free Spin | 0.875146 |
| Maximum coherent spin | 168 coins |
| Maximum complete paid cycle | 216 coins |
| Maximum queued Mystery Free Spins | 4 |
| Queue-cap frequency | 0.0000% |

### Modifier frequency

These are chain-inclusive awards per paid cycle in the same Layer F run.

| Modifier | Awards per paid cycle | Applications per settled spin |
| --- | ---: | ---: |
| Spotlight | 0.049552 | 4.3747% |
| Center Tree | 0.046978 | 4.1473% |
| Double Commune | 0.049422 | 4.3632% |
| Rescue Spin | 0.049744 | 4.3916% |
| Fortune Burst | 0.049590 | 4.3780% |

## Full Mystery RTP by Ally

Each row uses 100,000 paid cycles through the full production Mystery and Ally state machines.

| Ally | Full RTP | Average paid-cycle payout | Mystery-origin Ally Free Spins | Paid-origin Ally Free Spins | Maximum paid cycle |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sterling | 97.2830% | 4.86415 | 412 | 6,620 | 209 |
| Ryan | 96.5688% | 4.82844 | 380 | 6,638 | 315 |
| Cooper | 97.0928% | 4.85464 | 412 | 6,620 | 243 |
| Cydney | 97.0204% | 4.85102 | 412 | 6,620 | 225 |
| Gabi | 96.9740% | 4.84870 | 416 | 6,710 | 239 |
| Kenly | 96.9152% | 4.84576 | 412 | 6,620 | 204 |
| Ashley | 96.7224% | 4.83612 | 422 | 6,678 | 225 |

The production range is **96.5688% to 97.2830%**, a spread of 0.7142 percentage points. The range is above the historical pre-Mystery Ally totals of roughly 95.46% to 95.55%, but it is no longer in runaway or constant-feature territory. No further award reduction is recommended.

## Top 10 observed paid-cycle outcomes

| Root cycle | Payout | Mystery spins | Ally spins | Total feature spins | Tokens | Modifier awards |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 471,285 | 216 | 2 | 8 | 10 | 15 | Fortune Burst ×2, Center Tree ×2, Double Commune ×1 |
| 334,598 | 215 | 2 | 10 | 12 | 12 | Rescue ×1, Spotlight ×1, Center Tree ×1 |
| 97,856 | 204 | 0 | 6 | 6 | 5 | Center Tree ×2 |
| 217,730 | 204 | 0 | 6 | 6 | 5 | None |
| 144,866 | 199 | 0 | 6 | 6 | 6 | Spotlight ×1, Center Tree ×1 |
| 385,366 | 193 | 1 | 8 | 9 | 10 | Rescue ×2, Center Tree ×1 |
| 86,791 | 193 | 0 | 8 | 8 | 8 | Spotlight ×1 |
| 395,008 | 190 | 0 | 8 | 8 | 5 | Rescue ×1, Spotlight ×1 |
| 199,626 | 190 | 0 | 6 | 6 | 1 | None |
| 495,303 | 188 | 0 | 4 | 4 | 2 | None |

## Tuning recommendation

The initial audit justified Path B, a light reduction in Scatter appearance, because 2+ tokens occurred on 30.9896% of spins and visibly dominated ordinary play. The implemented 3/2/2 Scatter layout now places every award tier inside the intended band:

- 2 tokens: 16.9271%;
- 3 tokens: 4.4271%;
- 4+ tokens: 0.5208%.

Post-tuning chain behavior is short, no queue pressure exists, and all production Ally totals remain generous. Keep the current strip adjustment. Do not reduce Fortune, modifier strength, Rescue attempts, Spotlight caps, Double Commune caps, or ticket caps at this time.

## Reaction reliability invariants

The reel reaction controller enforces:

- preload and decode before visible `src` replacement;
- `small -> base`, `nice -> small -> base`, and `big -> nice -> small -> base` fallbacks;
- successful and failed URL caches;
- one generation token for timer and async-load cancellation;
- deduplicated winning cells;
- Tree, Mystery Token, and Center Tree exclusion;
- popup close independence;
- full restoration on the next reel reset;
- final Rescue or Ally replacement result only.

The deterministic stress test runs more than 100 start-clear cycles and rejects empty, null, undefined, or known-broken visible sources.

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

## Regression and audit commands

```bash
npm test
npm run test:mystery
npm run test:reel-reactions
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
npm run simulate:mystery
node tools/simulate.mjs --check --mystery-sessions=50000
node tools/simulate-mystery-scatter.mjs --cycles=50000 --ally-cycles=50000 --seed=1297634388
node tools/simulate-mystery-scatter.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

The audit workflow saves the exact report, Ally Monte Carlo report, 50,000-cycle human-readable Mystery report, and 500,000-cycle JSON report as GitHub Actions artifacts.
