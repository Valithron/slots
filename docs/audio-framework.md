# Commune Fortune audio framework

## Scope

This asset-independent foundation keeps audio optional and isolated from reel timing, result generation, settlement, persistence, and RTP. The game remains playable when every audio source is absent.

## Architecture

`js/audio.js` owns the centralized event catalog, bus defaults, lifecycle, loading, playback handles, concurrency, persistence, and QA status panel. Existing gameplay helper calls are preserved through a compatibility adapter, but all playback now routes through one manager. Do not construct `Audio` elements in unrelated modules.

The manager prefers one Web Audio `AudioContext`, falls back to `HTMLAudioElement`, and becomes a safe no-op when neither backend is available.

## Public API

- `initialize()` loads settings and lifecycle listeners.
- `unlock()` creates or resumes audio after a user gesture.
- `preloadGroup(groupId)` loads one configured preload group.
- `play(eventId, options)` and `playLoop(eventId, options)` return handles or `null`.
- `stop()`, `stopGroup()`, `stopOwner()`, and `stopAll()` clean up playback.
- `pauseAll()` and `resumeAll()` handle page and app interruption.
- `setMuted()`, `setMasterVolume()`, and `setBusVolume()` persist preferences.
- `beginSpinSession()` and `endSpinSession()` support owner cleanup.
- `clearFeatureAudio()` stops feature and character audio.
- `getStatus()` and `getAssets()` support QA diagnostics.

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

Effective gain is master × bus × event × instance volume. Muting stops active playback and blocks new playback. Unmuting never replays missed one-shots.

## Asset states

Every event resolves to `available`, `missing`, `failed`, `disabled`, or `not-yet-loaded`. Missing files return `null`, log at most once in QA mode, and never throw into gameplay.

## Concurrency

Supported policies are `allow`, `restart`, `ignore-if-playing`, `replace-oldest`, `limit-N`, and `single-per-owner`. Long sounds return explicit handles. Owner IDs should be stable spin, presentation, feature-session, or activation IDs.

## Unlock and interruption behavior

The first sound-producing interaction calls `unlock()`. The manager creates at most one context, resumes suspended or interrupted contexts, and starts a silent buffer for iOS compatibility. Autoplay rejection is absorbed.

When the document becomes hidden, audio is suspended. On return, loops may resume, while interrupted one-shots are discarded instead of producing a delayed burst.

## Persistence

Only mute, master volume, and bus volumes are persisted. Active handles, source positions, queues, and spin state are never persisted. The existing game sound toggle continues to gate the compatibility adapter.

## Registering an event

Add one semantic entry to the centralized catalog in `audio.js` and later provide fallback sources:

```js
"win.big": {
  bus: "wins",
  sources: [
    "assets/audio/wins/win-big-01.ogg",
    "assets/audio/wins/win-big-01.mp3",
  ],
  volume: 1,
  concurrency: "restart",
  preload: "early",
  required: false,
}
```

Gameplay should reference only `win.big`; filenames remain centralized.

## QA

Open `?qa=ally` or `?qa=audio`. The Audio status panel reports backend, context state, unlock state, mute state, active handles, and asset counts. Synthetic tones and complete sequence controls belong to the later QA-audio PR and are not enabled in normal play.

## Browser limits

Web Audio decode and exact loop behavior vary by browser. No load or playback promise may gate animation. iOS can interrupt a context during app switching; the manager treats this as recoverable and does not queue old one-shots.
