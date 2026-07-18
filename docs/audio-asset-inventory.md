# Commune Fortune audio asset inventory

All events are optional. `Missing` is the expected status until the separate asset-integration phase.

| Event ID | Purpose | Bus | Loop | Priority | Asset status |
| --- | --- | --- | --- | --- | --- |
| ui.button | Standard button press | UI | No | Low | Missing |
| ui.error | Invalid action | UI | No | Medium | Missing |
| ui.refill | Coin refill confirmation | UI | No | Low | Missing |
| reel.spin-start | Reels begin moving | Reels | No | Medium | Missing |
| reel.tick | Reel symbol tick | Reels | No | Low | Missing |
| reel.stop | Authoritative reel landing | Reels | No | Medium | Missing |
| reel.anticipation | Existing anticipation classification | Reels | No | Medium | Missing |
| tree.awakening | Tree expansion presentation | Features | No | High | Missing |
| win.combination | Commune combination | Wins | No | High | Missing |
| win.small | Small Win accent | Wins | No | Medium | Missing |
| win.nice | Nice Win fanfare | Wins | No | High | Missing |
| win.big | Big Win fanfare | Wins | No | High | Missing |
| win.jackpot | Jackpot fanfare | Wins | No | Critical | Missing |
| win.loss | Losing result accent | Wins | No | Low | Missing |
| character.reaction | Character win reaction | Characters | No | High | Missing |
| character.group | Group reaction | Characters | No | High | Missing |
| free-spins.trigger | Three Trees trigger | Features | No | High | Missing |
| free-spins.start | Feature begins | Features | No | High | Missing |
| free-spins.retrigger | Additional spins awarded | Features | No | High | Missing |
| free-spins.summary | Feature total | Features | No | High | Missing |

## Planned directory

```text
assets/audio/
├── music/
├── ambience/
├── ui/
├── reels/
├── wins/
├── tree/
├── fortune/
├── free-spins/
├── allies/
└── characters/
```

Use lowercase, hyphenated `category-event-variation.format` names. Important events should normally offer OGG or Opus and MP3 fallbacks. Do not upload downloaded or temporary copyrighted audio.
