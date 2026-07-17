# Commune Fortune

A private-play 3 x 3 slot machine using fake coins only. The game is a static HTML, CSS, and JavaScript site with no framework, backend, database, bundler, runtime dependency, account, purchase, or cash-out system.

## Run it

Open `index.html` in a modern browser. A small local static server is recommended:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Current systems

### Tree of Life Awakening Wild

The Tree remains the ordinary substituting Wild. When it naturally lands in the exact center cell, one predetermined four-outcome roll is stored in the authoritative result. Roll `0` awakens the Tree and resolves all three visible cells on the middle reel as Wilds. `originalMatrix` remains immutable and `resolvedMatrix` is used for line evaluation.

### Commune combinations

The middle row is the Commune Line. Named trios require exact left-to-right order and are detected from `originalMatrix`, so an awakened Tree cannot manufacture a combination.

| Combination | Exact sequence | Award |
| --- | --- | ---: |
| KPs | Sterling, Cydney, Tree | 8 x line bet |
| Walls | Ryan, Gabi, Tree | 8 x line bet |
| Jaaps | Kenly, Cooper, Tree | 8 x line bet |
| Brotherhood | Cooper, Sterling, Ryan | 12 x line bet |
| Wives’ Circle | Kenly, Gabi, Cydney | 5 x line bet |
| Household | Ashley, Sterling, Cydney | 8 x line bet |
| Full Commune | All seven members anywhere, plus Tree in the exact center | 5 x total bet |

Full Commune has priority over lesser combinations. Ordinary paylines and Tree Awakening may still stack.

### Fortune Meter and Fortune Spins

Every paid spin advances a persistent 100-point Fortune Meter. Gains stack:

| Event | Fortune gained |
| --- | ---: |
| Every paid spin | 2 |
| Natural Small Win | +1 |
| Natural Nice Win | +3 |
| Natural Big Win | +8 |
| Standard named combination | +3 |
| Full Commune | +10 |
| Natural Commune Jackpot | Instantly charge |

At 100 points, the meter remains charged until the next paid spin. Changing the line bet, refilling coins, closing the page, or reloading does not clear the charge.

The next paid spin becomes a Fortune Spin. The charge is consumed and saved before reel motion begins, even if the spin loses or the page reloads. The Fortune Spin then starts the next meter cycle with its normal settlement award.

Payout order:

```text
lineWinTotal + combinationWinTotal = preModifierWin
finalWin = floor(preModifierWin x 1.5)
fortuneBonus = finalWin - preModifierWin
totalWin = finalWin
```

The multiplier applies to normal paylines, Tree-created line wins, named combinations, and Full Commune. It never applies to refills or other external grants. Meter gain uses the natural pre-multiplier win tier. The displayed win tier uses the final multiplied total.

### Manual reel stopping

When enabled, the primary button changes from **Spin** to **Stop** while reels move. Each click, tap, Space press, or Enter press requests exactly one unresolved reel in order:

```text
Reel 1 -> Reel 2 -> Reel 3
```

Early inputs queue. Reels still obey minimum stop times and minimum gaps, retain final approach and overshoot, and fall back to normal automatic timing when the player does nothing.

| Timing | Value |
| --- | ---: |
| Reel 1 minimum | 650 ms |
| Reel 2 minimum | 900 ms |
| Reel 3 minimum | 1,150 ms |
| Minimum gap | 180 ms |
| Manual approach | 220 ms |
| Reduced-motion approach | 120 ms |
| Mild anticipation minimum | 150 ms |
| Strong anticipation minimum | 300 ms |
| Reduced mild minimum | 60 ms |
| Reduced strong minimum | 100 ms |

Manual stopping is presentation-only. It does not enter the authoritative result and cannot alter target stops, matrices, feature rolls, meter awards, payouts, tiers, or RTP. Held-key repeat events are ignored.

## Authoritative outcome and settlement pipeline

At paid-spin start:

1. Read the wager and Fortune state.
2. Determine whether the spin is a Fortune Spin.
3. Generate target stops and existing feature rolls.
4. Build the natural and resolved outcome.
5. Calculate line and combination subtotals.
6. Apply the Fortune modifier when active.
7. Calculate the Fortune Meter award from the natural tier.
8. Consume a charged meter when applicable.
9. Deduct the wager.
10. Save the complete pending result before reel motion.

At settlement:

1. Credit `totalWin` exactly once.
2. Apply `fortuneMeterAward` exactly once.
3. Cap and charge the meter when appropriate.
4. Clear the pending result.
5. Save settled state.
6. Present feature callouts, Fortune gain, and the final win tier.

A refresh during automatic motion, manual stopping, feature presentation, or celebration cannot reroll or duplicate the result.

## Exact production math

The production simulator imports the same `config.js` and `payouts.js` used by the game. It enumerates:

```text
13,824 reel-stop combinations x 4 Tree-roll states = 55,296 weighted outcomes
```

The Fortune mode then solves the 101-state persistent meter system exactly to its stationary distribution.

| Configuration | Base RTP | Tree increment | Combination RTP | Fortune increment | Total RTP |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base only | 82.0023% | 0.0000% | 0.0000% | 0.0000% | 82.0023% |
| Base + Tree | 82.0023% | 2.6215% | 0.0000% | 0.0000% | 84.6238% |
| Base + combinations | 82.0023% | 0.0000% | 2.1759% | 0.0000% | 84.1782% |
| Base + Tree + combinations | 82.0023% | 2.6215% | 2.1759% | 0.0000% | 86.7998% |
| Base + Tree + combinations + Fortune | 82.0023% | 2.6215% | 2.1759% | 1.0190% | 87.8188% |

Fortune metrics:

- Fortune Spin frequency: **2.4015%**
- Average paid spins between Fortune Spins: **41.6401**
- Average meter gain per paid spin: **2.422598**
- Average natural payout on a Fortune Spin: **4.339988 coins**
- Average final payout on a Fortune Spin: **6.461625 coins**
- Average Fortune bonus per Fortune Spin: **2.121636 coins**
- Fortune Spins paying zero: **69.6922%**
- Maximum natural payout at line bet 1: **101 coins**, or **20.20 x total bet**
- Maximum Fortune payout at line bet 1: **151 coins**, or **30.20 x total bet**
- Manual-stop RTP effect: **0.0000%**

See `docs/math-model.md` for the model and distributions.

## Validation commands

```bash
npm test
npm run simulate
node tools/simulate.mjs --check
node tools/simulate.mjs --json
```

`npm test` runs deterministic presentation tests, feature and settlement tests, all five exact reports, Fortune target guards, the locked 86.7998% pre-Fortune regression, and a manual-stop outcome-isolation assertion.

Pull requests to `main` also run `npm test` through `.github/workflows/validate.yml`.

## Development-only deterministic forcing

On `file:`, `localhost`, or `127.0.0.1`, a single next spin can be forced with:

```text
?debugStops=4,14,10&debugRoll=0
```

The helper is unavailable on the production hostname and is consumed after one spin.

## Project structure

```text
/
├── index.html
├── styles.css
├── presentation.css
├── feature-presentation.css
├── fortune.css
├── package.json
├── js/
│   ├── config.js
│   ├── game-engine.js
│   ├── game-flow.js
│   ├── reels.js
│   ├── payouts.js
│   ├── ui.js
│   ├── effects.js
│   ├── audio.js
│   ├── bonuses.js
│   ├── persistence.js
│   └── statistics.js
├── tools/
│   ├── simulate.mjs
│   ├── presentation-tests.mjs
│   └── feature-tests.mjs
├── docs/
│   └── math-model.md
└── assets/
```

The JavaScript uses ordered classic scripts and one `globalThis.CommuneFortune` namespace. This preserves direct static hosting and lets Node import production math modules without a build process.

## Accessibility and reduced motion

The Fortune Meter uses `role="progressbar"`, exposes its minimum, maximum, and settled value, and announces only completed gains or charge events. The Stop button identifies the next reel. Space and Enter ignore held-key repeat events. Reduced-motion mode removes the repeating charged pulse, shortens meter and reel approaches, and preserves clear static state changes.

## Known limitations

This pass intentionally does not add Scatters, free spins, portrait animation, alternate portraits, imported audio, mystery modifiers, risk-or-collect, daily rewards, secret events, a backend, or a database. Manual stopping does not resume its exact visual progress after reload; the existing pending transaction instead resolves safely and exactly once. No current exact outcome reaches the 40 x natural Commune Jackpot threshold, though Jackpot charging is implemented for future wager-generated outcomes.
