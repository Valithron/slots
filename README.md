# Commune Fortune

A private-play 3x3 slot machine using fake coins only.

## Run it

Open `index.html` in a modern browser. No build, account, database, framework, or internet connection is required.

For the most reliable local testing, run a small static server from the project folder:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Project structure

```text
/
├── index.html
├── styles.css
├── presentation.css
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
│   └── presentation-tests.mjs
├── docs/
│   └── math-model.md
├── assets/
│   ├── symbols/
│   ├── portraits/
│   ├── effects/
│   ├── audio/
│   └── backgrounds/
└── README.md
```

The JavaScript uses ordered classic scripts and a single `globalThis.CommuneFortune` namespace. This keeps the game compatible with direct local opening while allowing the production math modules to be imported by Node validation tools.

### Module responsibilities

- `config.js`: reel maps, symbols, payouts, feature flags, RTP targets, win-tier thresholds, and presentation timings
- `game-engine.js`: game phase, authoritative spin-result creation, reload-safe settlement, and spin orchestration
- `game-flow.js`: pure state-aware input routing and celebration timing helpers
- `reels.js`: reel construction, buffered strip positioning, staged movement, and predetermined reel stops
- `payouts.js`: pure matrix generation, line evaluation, tier classification, anticipation classification, and spin-result calculation
- `ui.js`: DOM references, display updates, help modal, win highlighting, and celebration text
- `effects.js`: cabinet effects, particles, flashes, anticipation state, and cancellable count-ups
- `audio.js`: synthesized spin, stop, anticipation, and win-tier sounds
- `bonuses.js`: extension hooks for free spins, modifiers, and bonus rounds
- `persistence.js`: versioned browser-local state and pending-spin recovery
- `statistics.js`: session-statistics tracking and future analytics hooks
- `tools/simulate.mjs`: exact enumeration and seeded Monte Carlo validation
- `tools/presentation-tests.mjs`: deterministic tier, anticipation, feature-flag, count-up, and skip-routing tests

## Included features

- 3 reels x 3 visible rows
- 5 always-active paylines
- Line bets of 1, 2, 5, or 10 coins
- 1,000 fake starting coins
- Weighted outcomes defined by the 24-stop reel maps
- Tree of Life Wild substitution
- Multiple simultaneous line wins
- Authoritative outcomes generated before animation
- Three-stage reel movement: acceleration, sustained speed, and controlled deceleration
- Staggered reel stops with localized overshoot, flash, synthesized impact, and restrained cabinet response
- Result-derived mild and strong third-reel anticipation
- Win-tier presentation based on total-bet multiples
- Browser-local saved balance and settings
- Reload-safe, exactly-once settlement of interrupted spins
- Responsive desktop and mobile layout
- Reduced-motion support
- No runtime dependencies or external services

## Win tiers

Win tiers use the final payout divided by the total bet. They do not change reel stops, paylines, payouts, hit frequency, wager math, or RTP.

| Tier | Stable ID | Threshold |
| --- | --- | ---: |
| No Win | `none` | `0` |
| Small Win | `small` | Greater than `0`, less than `5x` total bet |
| Nice Win | `nice` | `5x` to less than `15x` total bet |
| Big Win | `big` | `15x` to less than `40x` total bet |
| Commune Jackpot | `jackpot` | `40x` total bet or greater |

The current base machine cannot normally reach the Commune Jackpot threshold. Its full-stage Tree of Life presentation is implemented for future mathematical features without altering the current game.

Nice, Big, and Commune Jackpot celebrations can be skipped by pressing the main **Spin/Skip** control, **Enter**, or **Space**. The skip input only ends the current celebration; it cannot also start the next spin. The real balance is settled once before presentation begins, and the count-up is display-only.

## Better Spin Drama

With `CONFIG.features.spinDrama` enabled, each reel uses a staged motion profile and stops against the predetermined target. Anticipation is derived from the authoritative result:

- `none`: ordinary timing
- `mild`: the first two reel targets create a plausible active-line continuation
- `strong`: the result is a Nice Win or greater

Anticipation may delay the third reel, dim the stage, intensify the final stop, and add a restrained pulse. It never changes stops or manufactures near misses. Set `CONFIG.features.spinDrama` to `false` to retain normal predetermined spinning without the anticipation layer.

## Reduced motion

The game respects `prefers-reduced-motion: reduce`. Reduced-motion mode shortens reel and celebration timing, minimizes reel bounce, removes cabinet shake and repeated pulses, suppresses confetti, and still communicates stops, tiers, winning lines, and the exact final payout.

## Presentation configuration

Important tuning fields are centralized in `js/config.js`:

- `features.spinDrama` and `features.winTiers`
- `winTiers.thresholds`
- `winTiers.celebrationDurations`
- `winTiers.countUpDurations`
- `winTiers.countUpMinimum` and `winTiers.countUpMaximum`
- `anticipation.delays`
- `reelAnimation.durations`
- `reelAnimation.cycles`
- `reelAnimation.finalApproachDuration`
- `reelAnimation.stopOvershootRatio`
- `reelAnimation.settleDuration`
- `reducedMotion.*Scale`
- `characterAccentColors`

The repeated strip buffer is validated when reels are built so every configured animation path retains additional full copies beyond the visible rows.

## Math and presentation validation

The current three-reel base game has only 13,824 possible stop combinations, so the simulator enumerates every outcome exactly.

```bash
npm run simulate
```

Run deterministic presentation tests and the configured base-RTP regression check:

```bash
npm test
```

Run the exact RTP check directly:

```bash
node tools/simulate.mjs --check
```

Run a seeded million-spin Monte Carlo comparison:

```bash
npm run simulate:monte-carlo
```

The current exact base-game RTP is approximately **82.0023%**, within the configured 82% to 83% base target. Better Spin Drama and Win Tiers are presentation-only and do not contribute or remove RTP. The final total RTP target, after wager-generated features, is 96% to 97%. See `docs/math-model.md`.

## Replace the symbol art

The game loads these files:

- `assets/symbols/sterling.svg`
- `assets/symbols/cydney.svg`
- `assets/symbols/ryan.svg`
- `assets/symbols/gabi.svg`
- `assets/symbols/cooper.svg`
- `assets/symbols/kenly.svg`
- `assets/symbols/ashley.svg`
- `assets/symbols/tree-of-life.svg`

You have two options:

1. Export finished art using the exact same filenames and overwrite the placeholder files.
2. Export PNGs and update the image paths in `js/config.js`.

Recommended source art is a square 512 x 512 or 1024 x 1024 transparent PNG. The page scales each image automatically and constructs the vertical reel strips from individual symbol files.

## Current reel maps

The exact 24-stop maps are in `CONFIG.reels` inside `js/config.js`. Symbol abbreviations:

- STR: Sterling
- CYD: Cydney
- RYN: Ryan
- GAB: Gabi
- COP: Cooper
- KEN: Kenly
- ASH: Ashley
- TOL: Tree of Life Wild

## Current payouts

Payouts are per line-bet coin:

- Kenly: 8
- Gabi: 8
- Cydney: 11
- Ashley: 12
- Cooper: 12
- Ryan: 18
- Sterling: 25
- Tree of Life Wild: 60

Because all five paylines are active, total spin cost is `line bet x 5`. With the included reel maps, the default tuning produces a return on roughly 28.9 percent of spins and an approximately 82.0 percent exact theoretical return.

## Reset saved data

Use the in-game **Refill** button to restore 1,000 coins. Version 2 state is stored under `commune-fortune-v2`; existing `commune-fortune-v1` balances and sound settings migrate automatically when first loaded.
