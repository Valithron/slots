# Commune Fortune

A private-play 3 x 3 slot machine using fake coins only. The game is a static HTML, CSS, and JavaScript site with no framework, backend, database, bundler, runtime dependency, account, purchase, or cash-out system.

## Run it

Open `index.html` in a modern browser. A small local static server is recommended:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Current mathematical features

### Tree of Life Awakening Wild

The Tree of Life remains the normal substituting Wild everywhere on the grid. It is eligible to awaken only when it naturally lands in the exact center cell, reel 2 and row 2 in player-facing terms, or `[1][1]` in zero-based matrix coordinates.

An eligible Tree receives one predetermined four-outcome roll while the authoritative spin result is created, before any reel animation begins. Roll `0` activates the feature. Rolls `1`, `2`, and `3` leave the Tree as an ordinary Wild. The activation rule and outcome count are configured in `CONFIG.expandingWild`.

When activated, all three visible cells on the middle reel resolve as Tree Wilds. The result stores both matrices:

- `originalMatrix`: the naturally landed symbols, never mutated
- `resolvedMatrix`: the matrix used for normal payline evaluation after transformation

The stored feature roll, transformation, matrices, wins, tier, and anticipation are authoritative. Reload recovery never rerolls the feature.

### Commune combinations

The middle horizontal row is the Commune Line. A named trio triggers only in its exact left-to-right order. Combination detection always uses `originalMatrix`, so an expanded Tree cannot manufacture a combination.

| Combination | Exact sequence | Award |
| --- | --- | ---: |
| KPs | Sterling, Cydney, Tree | 8 x line bet |
| Walls | Ryan, Gabi, Tree | 8 x line bet |
| Jaaps | Kenly, Cooper, Tree | 8 x line bet |
| Brotherhood | Cooper, Sterling, Ryan | 12 x line bet |
| Wives’ Circle | Kenly, Gabi, Cydney | 5 x line bet |
| Household | Ashley, Sterling, Cydney | 8 x line bet |
| Full Commune | All seven members anywhere, plus Tree in the exact center | 5 x total bet |

Full Commune has priority over every named trio. It awards only Full Commune, while ordinary paylines and Tree Awakening may still stack. All combination awards are added to normal line payouts before the final win tier and anticipation level are classified.

## Outcome and settlement pipeline

Each spin follows one authoritative pipeline:

1. Generate target reel stops.
2. Build `originalMatrix`.
3. Generate feature rolls from the injected RNG source.
4. Detect combinations from `originalMatrix`.
5. Determine Tree Awakening activation.
6. Build `resolvedMatrix`.
7. Apply the middle-reel Wild transformation.
8. Evaluate normal paylines from `resolvedMatrix`.
9. Calculate combination awards.
10. Calculate `totalWin`.
11. Classify the final win tier.
12. Classify anticipation from the final result.
13. Save the pending result.
14. Animate the predetermined stops.
15. Present the transformation and combination callouts.
16. Settle exactly once.
17. Present the existing final win tier.

A refresh during reel motion, Tree Awakening, combination presentation, or the final celebration cannot change the result or duplicate the payout. If presentation is interrupted, recovery credits the stored `totalWin` once and returns the game to `IDLE`.

## Presentation behavior

Tree Awakening uses the existing Tree artwork, CSS light and branch-like motion, a full-middle-reel overlay, border illumination, and synthesized audio. The transformed reel remains visibly Wild during payline highlighting and the final celebration.

Combination callouts are intentionally shorter than a Nice Win. Standard trios highlight the Commune Line, connect the three cells, name the combination, and show the separate bonus award. Full Commune highlights the seven members and center Tree with all seven accent colors. Both then feed into the existing combined payout and win-tier presentation.

Spin, Enter, or Space skips the remaining presentation without starting another spin. Reduced-motion mode replaces vertical Wild growth with a short crossfade, removes repeated pulses and cabinet shake, and retains a clear border flash and sound when sound is enabled.

## Exact production math

The production simulator imports the same `config.js` and `payouts.js` used by the game. Exact feature calculation enumerates:

```text
13,824 reel-stop combinations x 4 Wild-roll states = 55,296 weighted outcomes
```

| Configuration | Base line RTP | Wild increment | Combination RTP | Total RTP |
| --- | ---: | ---: | ---: | ---: |
| Base only | 82.0023% | 0.0000% | 0.0000% | 82.0023% |
| Base + expanding Wild | 82.0023% | 2.6215% | 0.0000% | 84.6238% |
| Base + combinations | 82.0023% | 0.0000% | 2.1759% | 84.1782% |
| Base + both | 82.0023% | 2.6215% | 2.1759% | 86.7998% |

With both features enabled:

- House edge: **13.2002%**
- Any-return frequency: **30.3078%**
- Net-profitable frequency: **29.8665%**
- Tree eligibility frequency: **8.3333%**
- Tree activation frequency: **2.0833%**
- Maximum payout at line bet 1: **101 coins**, or **20.20 x total bet**
- Maximum stops and roll: `[7, 4, 5]`, roll `0`

Exact combination frequencies and RTP contributions:

| Combination | Trigger frequency | RTP contribution |
| --- | ---: | ---: |
| KPs | 0.1157% | 0.1852% |
| Walls | 0.1157% | 0.1852% |
| Jaaps | 0.1736% | 0.2778% |
| Brotherhood | 0.0868% | 0.2083% |
| Wives’ Circle | 0.4630% | 0.4630% |
| Household | 0.1736% | 0.2778% |
| Full Commune | 0.1157% | 0.5787% |

See `docs/math-model.md` for the full calculation and distributions.

## Validation commands

```bash
npm test
node tools/simulate.mjs --check
npm run simulate
npm run simulate:monte-carlo
```

The exact check fails if the disabled-feature base RTP changes from 82.0023%, if either feature contribution leaves its accepted range, or if the combined feature-pass RTP leaves 86.0% to 87.5%.

## Development-only deterministic forcing

On `file:`, `localhost`, or `127.0.0.1`, a single next spin can be forced with query parameters:

```text
?debugStops=4,14,10&debugRoll=0
```

The helper is unavailable on the production hostname and is consumed after one spin. Useful cases at line bet 1:

| Scenario | Query values |
| --- | --- |
| Ordinary loss | `debugStops=0,0,0&debugRoll=1` |
| Ordinary line win | `debugStops=0,1,3&debugRoll=1` |
| Center Tree, no awakening | `debugStops=0,4,0&debugRoll=1` |
| Center Tree awakens and creates a line | `debugStops=0,4,1&debugRoll=0` |
| KPs | `debugStops=5,1,4&debugRoll=1` |
| Walls | `debugStops=11,5,4&debugRoll=1` |
| Jaaps | `debugStops=1,3,4&debugRoll=1` |
| Brotherhood | `debugStops=3,6,9&debugRoll=1` |
| Wives’ Circle | `debugStops=1,5,0&debugRoll=1` |
| Household | `debugStops=2,6,0&debugRoll=1` |
| Full Commune without awakening | `debugStops=4,14,10&debugRoll=1` |
| Full Commune plus awakening | `debugStops=4,14,10&debugRoll=0` |
| Maximum payout | `debugStops=7,4,5&debugRoll=0` |

## Project structure

```text
/
├── index.html
├── styles.css
├── presentation.css
├── feature-presentation.css
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

The JavaScript uses ordered classic scripts and one `globalThis.CommuneFortune` namespace. This preserves direct static hosting and lets Node import the production math modules without a build process.

## Known limitations

This feature pass intentionally does not add Scatters, free spins, the Fortune Meter, portrait animation, alternate portraits, manual stopping, mystery modifiers, secret events, or a backend. The current combined RTP is 86.7998%, leaving 9.2002 to 10.2002 percentage points for later wager-generated features while preserving the long-term 96% to 97% target. No exact outcome in the current model reaches the 40 x Commune Jackpot threshold.
