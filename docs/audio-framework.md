# Commune Fortune audio framework

## Scope

This foundation keeps audio optional and isolated from reel timing, result generation, settlement, persistence, and RTP.

Commune Fortune's existing synthesized sounds remain the built-in default and fallback. Future recorded assets can replace individual semantic events without redesigning gameplay or making the game silent while assets are still missing.

## Central manager

All playback routes through `app.audio`. Gameplay modules must not create `Audio`, `AudioContext`, source nodes, or gain nodes directly.

The manager supports initialization, user-gesture unlock, preload groups, one-shot and loop playback, playback handles, owner cleanup, stop-all, pause/resume, mute, master and bus volumes, persisted settings, and status inspection.

The original helper methods used by the current game remain available through `app.audio.createAudio()`.

## Buses

| Bus | Default |
| --- | ---: |
| Master | 1.00 |
| Music | 0.55 |
| Ambience | 0.45 |
| UI | 0.70 |
| Reels | 0.80 |
| Wins | 0.90 |
| Features | 0.90 |
| Characters | 1.00 |

## Asset resolution

Each event resolves to one of these states:

- `available`
- `synthetic-fallback`
- `failed`
- `disabled`
- `not-yet-loaded`

An available recorded asset overrides the synthesized cue. An event with no file, a missing file, or a failed file uses its synthesized fallback when one exists. Unknown events remain silent and harmless.

This means the game remains fully playable with no `assets/audio` directory while still retaining the current sound design.

Mystery gameplay registers semantic events for each token tier, modifier reveal, ticket award and start, Rescue, and Fortune Burst. Every event currently uses the same nonfatal synthesized-fallback path as the existing reel and feature cues.

## Unlock lifecycle

`initialize()` never creates an audio context. `unlock()` creates or resumes one only after a meaningful user gesture. It also starts a silent one-frame buffer for iOS/WebKit compatibility. Rejected autoplay or resume attempts are absorbed and never interrupt gameplay.

Only one audio context is created per manager.

## Concurrency

Supported policies:

- `allow`
- `restart`
- `ignore-if-playing`
- `replace-oldest`
- `limit-N`
- `single-per-owner`

Playback handles track event, bus, owner, group, loop state, start time, active source or element, and stopped state. The initial global one-shot ceiling is 20.

## Persistence

Persisted audio settings are limited to:

- muted
- master volume
- bus volumes

Active handles, playback positions, queued sounds, and session state are never persisted. The existing public sound toggle continues to gate the manager.

## Visibility and interruptions

When the page is hidden, HTML audio is paused and the Web Audio context is suspended. On return, only valid loops may resume. Old one-shots are not replayed, preventing a burst after app switching or screen lock.

Muting stops active handles immediately. Unmuting does not replay missed sounds.

## Preload groups

Events may declare:

- `critical`
- `early`
- `feature`
- `on-demand`

Preloading is advisory and never blocks gameplay or animation.

## QA status

Open `?qa=ally` or `?qa=audio` to see backend, context state, unlock state, mute state, active handles, available assets, synthesized fallbacks, failed assets, and unloaded assets.

The normal synthesized game cues are intentional product audio. Any later QA-only test tones should remain a separate mechanism.

## Mystery event catalog

| Event | Trigger |
| --- | --- |
| `mystery.token.one` | One visible token shimmer |
| `mystery.token.two` | Two-token Fortune and modifier result |
| `mystery.token.three` | Three-token ticket result |
| `mystery.token.fourPlus` | Four-plus special result |
| `mystery.modifier.reveal` | A modifier is revealed and queued |
| `mystery.freeSpin.awarded` | One or more Mystery tickets are added |
| `mystery.freeSpin.start` | A queued zero-cost spin starts |
| `mystery.rescue.trigger` | Rescue begins a stored reroll presentation |
| `mystery.fortuneBurst` | Fortune Burst points settle |

## Registering a real asset

Add sources to the centralized event definition:

```js
"win.big": {
  bus: "wins",
  sources: [
    "assets/audio/wins/win-big-01.ogg",
    "assets/audio/wins/win-big-01.mp3"
  ],
  volume: 1,
  concurrency: "restart",
  preload: "early",
  required: false
}
```

Do not put filenames in gameplay modules. Once a source is available, it automatically replaces that event's synthesized fallback.

## Remaining limits

The framework does not yet include recorded Mystery assets, music crossfades, ducking, voice priority, or a complete QA sequence console. Missing files remain safe and silent only when no synthesized fallback exists.
