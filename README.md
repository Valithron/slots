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
├── package.json
├── js/
│   ├── config.js
│   ├── game-engine.js
│   ├── reels.js
│   ├── payouts.js
│   ├── ui.js
│   ├── effects.js
│   ├── audio.js
│   ├── bonuses.js
│   ├── persistence.js
│   └── statistics.js
├── tools/
│   └── simulate.mjs
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

The JavaScript uses ordered classic scripts and a single `globalThis.CommuneFortune` namespace. This keeps the game compatible with direct local opening while allowing the production math modules to be imported by the Node simulator.

### Module responsibilities

- `config.js`: reel maps, symbols, payouts, feature flags, RTP targets, line bets, and timing values
- `game-engine.js`: game phase, authoritative spin-result creation, reload-safe settlement, and spin orchestration
- `reels.js`: reel construction, positioning, and animation toward predetermined stops
- `payouts.js`: pure matrix generation, line evaluation, and spin-result calculation
- `ui.js`: DOM references, display updates, help modal, and win highlighting
- `effects.js`: coin particles and screen flashes
- `audio.js`: synthesized game sounds
- `bonuses.js`: extension hooks for free spins, modifiers, and bonus rounds
- `persistence.js`: versioned browser-local state and pending-spin recovery
- `statistics.js`: session-statistics tracking and future analytics hooks
- `tools/simulate.mjs`: exact enumeration and seeded Monte Carlo validation

## Included features

- 3 reels x 3 visible rows
- 5 always-active paylines
- Line bets of 1, 2, 5, or 10 coins
- 1,000 fake starting coins
- Weighted outcomes defined by the 24-stop reel maps
- Tree of Life Wild substitution
- Multiple simultaneous line wins
- Sequential reel stopping, bounce, paylines, win highlights, particles, and synthesized sound
- Browser-local saved balance and settings
- Reload-safe settlement of interrupted spins
- Responsive desktop and mobile layout
- No runtime dependencies or external services

## Math validation

The current three-reel base game has only 13,824 possible stop combinations, so the simulator enumerates every outcome exactly.

```bash
npm run simulate
```

Run the configured base-RTP regression check:

```bash
npm test
```

Run a seeded million-spin Monte Carlo comparison:

```bash
npm run simulate:monte-carlo
```

The current exact base-game RTP is approximately **82.0023%**, within the configured 82% to 83% base target. The final total RTP target, after wager-generated features, is 96% to 97%. See `docs/math-model.md`.

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
