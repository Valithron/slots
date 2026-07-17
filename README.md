# Commune Fortune

A self-contained, private-play 3x3 slot machine using fake coins only.

## Run it

Open `index.html` in a modern browser. No build, server, account, or internet connection is required.

For the most reliable local testing, you can also run a tiny local server from this folder:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

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
- Responsive desktop and mobile layout
- No dependencies and no external services

## Replace the placeholder art

The game loads these files:

- `assets/symbols/sterling.svg`
- `assets/symbols/cydney.svg`
- `assets/symbols/ryan.svg`
- `assets/symbols/gabi.svg`
- `assets/symbols/cooper.svg`
- `assets/symbols/kenly.svg`
- `assets/symbols/ashley.svg`
- `assets/symbols/tree-of-life.svg`

You have two easy options:

1. Export your finished art using the exact same filenames and overwrite the placeholder files.
2. Export PNGs and update the image paths in the `CONFIG.symbols` section near the bottom of `index.html`.

Recommended source art: square 512 x 512 or 1024 x 1024 transparent PNGs. The page scales them automatically. You do not need to manually assemble long reel-strip sheets because the webpage builds the vertical strips from the individual symbol files.

## Current reel maps

The exact 24-stop maps are in the `CONFIG.reels` array in `index.html`. Symbol abbreviations:

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
- Cydney: 10
- Ashley: 12
- Cooper: 12
- Ryan: 18
- Sterling: 25
- Tree of Life Wild: 60

Because all five paylines are active, total spin cost is `line bet x 5`. With the included reel maps, the default tuning produces a win on roughly 28.9 percent of spins and an approximately 80.5 percent theoretical return over a very large number of spins.

## Reset saved data

Use the in-game **Refill** button to restore 1,000 coins. To erase all browser-local settings, remove the `commune-fortune-v1` item from localStorage in your browser developer tools.
