# Strong Mystery Modifiers

Strong Mystery Modifiers are one-spin, reload-safe feature instances awarded by four or more visible Mystery Tokens. The valid pool contains seven equally weighted entries:

1. Golden Payline
2. Fortune Flood
3. Scatter Magnet
4. Commune Gathering
5. Sevenfold Fortune
6. Full Fortune
7. Commune Chaos

Each draw is independent. Repeats, self-repeats, and chains are valid. There is no bag, cooldown, recent-repeat protection, or temporary pool removal.

## Four-token award

Four or more final visible Mystery Tokens award two Mystery spins and one Strong Mystery Modifier. During an active Ally feature, the spins extend the same selected Ally session under the existing cap and overflow rules. Full Fortune may double the spin award, but it never doubles the modifier count.

The Strong Modifier applies to the next eligible paid, Mystery Free, or Ally Free spin. It is consumed when that result is authoritatively committed. A Strong Modifier earned by that spin is a separate instance queued for the following eligible spin.

## Atomic persistence

Strong Modifiers are stored in `state.mystery.strongModifierQueue` as atomic instances. Each instance includes:

- `instanceId`
- `id`
- `name`
- `tier: "strong"`
- `selectionPayload`
- `awardSourceSpinId`
- application status
- consumption status
- presentation status

The queue does not merge different instances by modifier ID. Two Golden Paylines may retain different selected lines. Two Sevenfold Fortune instances may retain different characters. Commune Chaos packages retain their three selected effects and any fixed character or line selections.

Fixed selections are made when the modifier is awarded and survive reload. Candidate-dependent selections, including Magnet overlays, Wild Spark cells, and Scatter Spark overlays, are stored inside each generated candidate. Rescue keeps the fixed package while allowing each candidate to retain its own generated cells. Only the final coherent candidate settles.

## Golden Payline

**ID:** `golden-payline`

One of the five configured paylines is selected when awarded. An ordinary line win on that line receives a final 4x line multiplier. Tree substitution remains valid. Named combinations, Full Commune, Gathering, Mystery awards, Ally end bonuses, and Fortune points are excluded.

Golden Payline multiplies with other eligible line effects. Golden Payline 4x and Spotlight 2x produce 8x on the qualifying line. Rescue retains the saved line.

## Fortune Flood

**ID:** `fortune-flood`

The final current-spin monetary payout is multiplied by 2x after ordinary line, combination, Fortune Spin, replay, and current-spin Ally calculations. Delayed Sterling Insurance and an already paid Cydney Echo are not separately doubled.

After ordinary Fortune settlement, the meter is set to the greater of its calculated value and 50. The floor never lowers Fortune and does not count as an award when it changes nothing. A zero-coin result that is persistently raised to 50 is meaningful and stops Rescue. A zero-coin result already above the floor may still be blank.

## Scatter Magnet

**ID:** `scatter-magnet`

Two non-destructive Mystery overlays are added to eligible cells. Overlays count toward the final Mystery tier while the underlying symbol remains authoritative for paylines, combinations, natural Three Trees, Tree Awakening, reactions, and Ally logic.

Examples:

- zero natural plus two overlays becomes the two-token tier
- one natural plus two overlays becomes the three-token tier
- two natural plus two overlays becomes the four-plus tier

A four-plus result may independently select Scatter Magnet again. The follow-up applies to the next spin, never recursively to the current spin.

## Commune Gathering

**ID:** `commune-gathering`

One configured named group is selected with equal weight from KPs, Walls, Jaaps, Brotherhood, Wives’ Circle, and Household. Full Commune is excluded.

After the natural result is evaluated, a separate combination award is added:

`configured combination payout x 3`

It scales with line bet and participates in the authoritative combination collection. Natural and Gathering awards may coexist, including when both name the same group. Double Commune and Chaos Double Commune affect Gathering. Golden Payline and Sevenfold Fortune do not. Gathering never creates natural Trees or feature triggers.

## Sevenfold Fortune

**ID:** `sevenfold-fortune`

One of the seven Commune members is selected with equal weight. Ordinary line wins attributed to that character pay 3x. A line containing three natural copies of the selected portrait pays 7x instead. The 7x replaces the 3x.

The original natural matrix determines the natural trio. Tree Wilds and payout-only transformations can qualify for 3x but never 7x. Named combinations, Gathering, Mystery awards, Fortune, and Ally end bonuses are excluded. Spotlight multiplies with Sevenfold.

## Full Fortune

**ID:** `full-fortune`

Full Fortune doubles each supported mechanical reward once:

- final current-spin monetary payout
- Fortune points earned by the spin
- Mystery Free Spins
- Mystery-awarded Ally extensions
- natural starting Ally spins
- natural Ally retriggers

It does not double wager, token count, modifier count, Strong count, safety caps, delayed Sterling Insurance, or a later Cydney Echo. A blank result remains blank because twice zero is zero.

Monetary doubling occurs after line-specific effects, combinations, charged Fortune, coherent replay selection, current-spin Ally calculation, and Fortune Flood. Fortune point doubling does not double Fortune Flood's meter floor.

## Commune Chaos

**ID:** `commune-chaos`

Each award selects three distinct effects without replacement from:

- Chaos Spotlight
- Chaos Center Tree
- Chaos Double Commune
- Chaos Rescue
- Lucky Line
- Wild Spark
- Scatter Spark

A new Commune Chaos award makes a new independent package. The selected effect IDs, Spotlight character, and Lucky Line are fixed in the instance.

### Chaos Spotlight

One saved character receives 2x on ordinary line wins. Named combinations are unaffected.

### Chaos Center Tree

The center cell becomes a payout Wild unless it is already a Tree or Mystery Token. It does not alter the natural matrix and cannot create a natural trigger or retrigger.

### Chaos Double Commune

Named combination awards, including Gathering, pay 2x. Ordinary paylines are unchanged.

### Chaos Rescue

One corrected Rescue attempt is available. It evaluates the candidate only after the other Chaos effects have created any line win, token award, trigger, or persistent Fortune value.

### Lucky Line

One saved payline pays 2x on ordinary line wins. Named combinations are unaffected.

### Wild Spark

One eligible non-Tree, non-Mystery cell becomes a payout-only Tree Wild in the resolved matrix. Natural trigger and combination detection remain based on the original matrix.

### Scatter Spark

One non-destructive Mystery overlay is added. It can create any higher Mystery tier and may award Commune Chaos again. There is no loop prevention.

## Evaluation order

The production implementation follows this observable order:

1. Generate and save the natural candidate.
2. Preserve the original matrix for natural tokens, combinations, Trees, triggers, and natural-trio checks.
3. Apply payout-only Center Tree and Wild Spark transformations.
4. Add non-destructive Magnet and Scatter Spark overlays.
5. Evaluate paylines.
6. Apply Spotlight, Golden Payline, Sevenfold, Chaos Spotlight, and Lucky Line multiplicatively.
7. Retain natural Commune combinations.
8. Add Gathering as a separate combination award.
9. Apply Double Commune and Chaos Double Commune.
10. Apply charged Fortune and existing monetary logic.
11. Resolve the current-spin Ally ability or coherent replay.
12. Apply Fortune Flood.
13. Apply Full Fortune's final monetary doubling.
14. Calculate Fortune and Mystery awards.
15. Enforce Fortune Flood's meter floor.
16. Apply Full Fortune to eligible Fortune and spin awards.
17. Enforce feature caps and preserve overflow.
18. Evaluate corrected blankness.
19. Generate Rescue candidates only while still blank.
20. Save one coherent result.
21. Present and settle exactly once.

## Rescue definition

A candidate is truly blank only when it has zero coins and no meaningful persistent reward. Rescue stops on a coin win, two or more Mystery Tokens, natural Three Trees, Mystery or Ally spins, a modifier award, Fortune Burst, a real Fortune Flood increase, or another persistent feature award. One token alone remains presentation-only and may reroll.

## UI and accessibility

Queue chips show the saved selection, not only the modifier name. Strong chips wrap naturally on narrow screens. Active Golden Payline selection is traced before and through the spin. Mystery overlays are badges that leave the underlying portrait legible. Reduced motion uses static highlights and immediate placement.

The reveal language is `STRONG MYSTERY`. Existing semantic audio events provide synthetic fallbacks for Strong reveal, paylines, Flood, Magnet, Gathering, Sevenfold, Full Fortune, Chaos, Wild Spark, and Scatter Spark. Mute, interruption recovery, and existing volume behavior remain authoritative.

## QA

Open the existing hidden QA mode with `?qa=ally`. The Strong Mystery section can:

- queue any Strong Modifier through the production queue
- force any Strong Modifier as a four-plus-token award
- select a payline, character, or Gathering group
- queue repeated atomic instances
- perform a random Strong draw
- queue a deterministic Chaos package containing Spotlight, Lucky Line, and Scatter Spark

Existing deterministic result controls can be combined with these controls to force hits, misses, token counts, Rescue, Ally extensions, retriggers, caps, overflow, and reload-ready pending results.

## Tests and simulation

Run:

```bash
npm test
npm run test:strong-mystery
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
node tools/simulate-strong-mystery.mjs --cycles=500000 --ally-cycles=100000 --seed=1297634388 --json
```

`tools/strong-mystery-tests.mjs` covers the configured pool, independent repeat draws, atomic persistence, all seven modifiers, corrected Rescue, loops, and exactly-once settlement. `tools/simulate-strong-mystery.mjs` runs a paired pre-Strong baseline and Strong-enabled production-path simulation, then reports RTP, Ally splits, selection frequencies, zero-coin rates, Rescue rates, loop and chain metrics, maximum payouts, Fortune contribution, cap frequency, and overflow.

No simulator-driven nerf is automatic. Reel strips, Scatter frequency, Mystery awards, base payouts, Commune payouts, normal modifiers, Ally abilities, starting spins, retriggers, and ordinary Fortune gains remain unchanged unless a later reviewed change explicitly tunes them.
