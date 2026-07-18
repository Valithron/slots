(() => {
  "use strict";

  const app = globalThis.CommuneFortune = globalThis.CommuneFortune || {};
  const BUS_DEFAULTS = Object.freeze({ master: 1, music: .55, ambience: .45, ui: .7, reels: .8, wins: .9, features: .9, characters: 1 });
  const event = (bus, concurrency = "restart", preload = "early", volume = 1) => Object.freeze({ bus, concurrency, preload, volume, sources: [], required: false });
  const EVENTS = Object.freeze({
    "ui.button": event("ui", "restart", "critical"),
    "ui.error": event("ui", "restart", "critical"),
    "ui.refill": event("ui"),
    "reel.spin-start": event("reels", "restart", "critical"),
    "reel.tick": event("reels", { policy: "limit-N", limit: 3 }, "critical", .5),
    "reel.stop": event("reels", { policy: "limit-N", limit: 3 }, "critical"),
    "reel.anticipation": event("reels"),
    "tree.awakening": event("features"),
    "win.combination": event("wins"),
    "win.small": event("wins", "restart", "critical"),
    "win.nice": event("wins"),
    "win.big": event("wins"),
    "win.jackpot": event("wins", "restart", "on-demand"),
    "win.loss": event("wins", "restart", "critical", .7),
    "character.reaction": event("characters", "single-per-owner", "on-demand"),
    "character.group": event("characters", "restart", "on-demand"),
    "free-spins.trigger": event("features"),
    "free-spins.start": event("features", "restart", "feature"),
    "free-spins.retrigger": event("features", "restart", "feature"),
    "free-spins.summary": event("features", "restart", "feature"),
  });

  const CONFIG = app.audioConfig = Object.freeze({
    storageKey: "commune-fortune-audio-settings-v1",
    buses: BUS_DEFAULTS,
    events: EVENTS,
    limits: Object.freeze({ maximumActiveOneShots: 20 }),
  });

  const clamp = value => Math.min(1, Math.max(0, Number(value) || 0));
  const clone = value => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

  function createAudioManager(options = {}) {
    const env = options.env || globalThis;
    const storage = options.storage || env.localStorage;
    const AudioContextClass = options.AudioContext === null ? null : (options.AudioContext || env.AudioContext || env.webkitAudioContext);
    const HtmlAudioClass = options.Audio === null ? null : (options.Audio || env.Audio);
    const fetcher = options.fetch || env.fetch?.bind(env);
    const legacyEnabled = options.getSoundEnabled || (() => true);
    const qa = options.qaMode ?? /(?:^|[?&])qa=(?:ally|audio)(?:&|$)/i.test(env.location?.search || "");
    const settings = { muted: false, masterVolume: 1, busVolumes: Object.fromEntries(Object.entries(BUS_DEFAULTS).filter(([id]) => id !== "master")) };
    const state = {
      initialized: false,
      unlocked: false,
      context: null,
      handles: new Map(),
      buffers: new Map(),
      assets: new Map(),
      warnings: new Set(),
      spinId: null,
      sequence: 0,
      hiddenPause: false,
    };
    const gains = new Map();

    const warnOnce = (key, ...message) => {
      if (!qa || state.warnings.has(key)) return;
      state.warnings.add(key);
      console.warn("[audio]", ...message);
    };
    const saveSettings = () => { try { storage?.setItem(CONFIG.storageKey, JSON.stringify(settings)); } catch {} };
    const loadSettings = () => {
      try {
        const saved = JSON.parse(storage?.getItem(CONFIG.storageKey) || "null");
        if (!saved) return;
        settings.muted = saved.muted === true;
        if (Number.isFinite(saved.masterVolume)) settings.masterVolume = clamp(saved.masterVolume);
        for (const bus of Object.keys(settings.busVolumes)) {
          if (Number.isFinite(saved.busVolumes?.[bus])) settings.busVolumes[bus] = clamp(saved.busVolumes[bus]);
        }
      } catch {}
    };
    const setGain = (node, value) => {
      if (!node?.gain) return;
      const time = state.context?.currentTime || 0;
      node.gain.cancelScheduledValues?.(time);
      node.gain.setValueAtTime?.(value, time);
      if (!node.gain.setValueAtTime) node.gain.value = value;
    };
    const effectiveVolume = (bus, eventVolume = 1, instanceVolume = 1) =>
      settings.muted || !legacyEnabled() ? 0 : settings.masterVolume * (settings.busVolumes[bus] ?? 1) * clamp(eventVolume) * clamp(instanceVolume);
    const refreshVolumes = () => {
      setGain(gains.get("master"), settings.muted || !legacyEnabled() ? 0 : settings.masterVolume);
      for (const [bus, volume] of Object.entries(settings.busVolumes)) setGain(gains.get(bus), volume);
      for (const handle of state.handles.values()) {
        if (handle.element) handle.element.volume = effectiveVolume(handle.bus, handle.eventVolume, handle.instanceVolume);
      }
    };
    const buildGraph = () => {
      if (!state.context || gains.size) return;
      const master = state.context.createGain();
      master.connect(state.context.destination);
      gains.set("master", master);
      for (const bus of Object.keys(settings.busVolumes)) {
        const gain = state.context.createGain();
        gain.connect(master);
        gains.set(bus, gain);
      }
      refreshVolumes();
    };

    function initialize() {
      if (state.initialized) return getStatus();
      state.initialized = true;
      loadSettings();
      for (const [id, definition] of Object.entries(EVENTS)) {
        state.assets.set(id, definition.sources.length ? "not-yet-loaded" : "synthetic-fallback");
      }
      env.document?.addEventListener?.("visibilitychange", onVisibilityChange);
      env.addEventListener?.("pagehide", () => pauseAll(true));
      env.addEventListener?.("pageshow", () => { if (!env.document?.hidden) void resumeAll(true); });
      return getStatus();
    }

    async function unlock() {
      initialize();
      if (state.unlocked && state.context?.state === "running") return true;
      try {
        if (AudioContextClass && !state.context) {
          state.context = new AudioContextClass();
          buildGraph();
        }
        if (["suspended", "interrupted"].includes(state.context?.state)) await state.context.resume?.();
        if (state.context) {
          const source = state.context.createBufferSource?.();
          if (source) {
            source.buffer = state.context.createBuffer?.(1, 1, state.context.sampleRate || 44100);
            source.connect(gains.get("master") || state.context.destination);
            source.start(0);
          }
        }
        state.unlocked = state.context ? state.context.state !== "suspended" : Boolean(HtmlAudioClass);
        return state.unlocked;
      } catch (error) {
        warnOnce("unlock", "Unlock rejected; gameplay continues.", error);
        return false;
      }
    }

    const selectSource = definition => {
      if (!definition?.sources?.length) return null;
      if (!HtmlAudioClass) return definition.sources[0];
      try {
        const probe = new HtmlAudioClass();
        const types = { mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/ogg; codecs=opus", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav" };
        return definition.sources.find(source => {
          const ext = source.split("?")[0].split(".").pop()?.toLowerCase();
          return !types[ext] || probe.canPlayType?.(types[ext]);
        }) || null;
      } catch {
        return definition.sources[0];
      }
    };

    async function loadEvent(eventId, { reload = false } = {}) {
      initialize();
      const definition = EVENTS[eventId];
      if (!definition) {
        state.assets.set(eventId, "disabled");
        warnOnce(`unknown:${eventId}`, `Unknown event ${eventId}`);
        return null;
      }
      const source = selectSource(definition);
      if (!source) {
        state.assets.set(eventId, "synthetic-fallback");
        return null;
      }
      if (!reload && state.buffers.has(eventId)) return state.buffers.get(eventId);
      state.assets.set(eventId, "not-yet-loaded");
      if (!state.context || !fetcher) return source;
      try {
        const response = await fetcher(source);
        if (!response?.ok) throw new Error(`HTTP ${response?.status || "failure"}`);
        const buffer = await state.context.decodeAudioData((await response.arrayBuffer()).slice(0));
        state.buffers.set(eventId, buffer);
        state.assets.set(eventId, "available");
        return buffer;
      } catch (error) {
        state.assets.set(eventId, "synthetic-fallback");
        warnOnce(`load:${eventId}`, `Asset load failed for ${eventId}; using synthesized fallback.`, error);
        return null;
      }
    }

    async function preloadGroup(groupId) {
      await Promise.all(Object.entries(EVENTS).filter(([, value]) => value.preload === groupId).map(([id]) => loadEvent(id)));
      return getAssets();
    }

    const activeFor = (eventId, ownerId) => [...state.handles.values()].filter(handle => !handle.stopped && handle.eventId === eventId && (ownerId == null || handle.ownerId === ownerId));
    function stop(handleOrChannel) {
      if (!handleOrChannel) return false;
      const targets = typeof handleOrChannel === "string"
        ? [...state.handles.values()].filter(handle => [handle.id, handle.bus, handle.groupId].includes(handleOrChannel))
        : [handleOrChannel];
      for (const handle of targets) {
        if (!handle || handle.stopped) continue;
        try { handle.source?.stop?.(0); } catch {}
        for (const source of handle.sources || []) { try { source.stop?.(0); } catch {} }
        try { handle.element?.pause?.(); if (handle.element) handle.element.currentTime = 0; } catch {}
        handle.stopped = true;
        state.handles.delete(handle.id);
      }
      return targets.length > 0;
    }
    function allowPlayback(eventId, definition, ownerId) {
      const rule = definition.concurrency || "allow";
      const policy = typeof rule === "string" ? rule : rule.policy;
      const active = activeFor(eventId);
      if (policy === "restart") active.forEach(stop);
      if (policy === "ignore-if-playing" && active.length) return false;
      if (policy === "single-per-owner" && activeFor(eventId, ownerId).length) return false;
      if (policy === "replace-oldest" && active.length) stop(active[0]);
      if (policy === "limit-N") while (active.filter(item => !item.stopped).length >= Math.max(1, Number(rule.limit) || 1)) stop(active.shift());
      const oneShots = [...state.handles.values()].filter(handle => !handle.loop && !handle.stopped);
      while (oneShots.length >= CONFIG.limits.maximumActiveOneShots) stop(oneShots.shift());
      return true;
    }
    const finish = handle => {
      if (!handle || handle.stopped) return;
      handle.stopped = true;
      state.handles.delete(handle.id);
    };
    const makeHandle = (eventId, definition, options, ownerId) => {
      const handle = {
        id: `audio-${++state.sequence}`,
        eventId,
        bus: definition.bus,
        ownerId,
        groupId: options.groupId || null,
        loop: options.loop === true,
        startTime: Date.now(),
        stopped: false,
        paused: false,
        source: null,
        sources: [],
        element: null,
        eventVolume: definition.volume,
        instanceVolume: options.volume ?? 1,
      };
      state.handles.set(handle.id, handle);
      return handle;
    };

    function synthTone(handle, { frequency = 440, duration = .08, type = "sine", gain = .08, when = 0, endFrequency = null }) {
      const context = state.context;
      if (!context || handle.stopped) return;
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const start = context.currentTime + when;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(gain, start + .01);
      volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(volume).connect(gains.get(handle.bus) || gains.get("master"));
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
      handle.sources.push(oscillator);
    }
    function synthChord(handle, notes, { spacing = .09, duration = .24, gain = .07, type = "triangle" } = {}) {
      notes.forEach((frequency, index) => synthTone(handle, { frequency, duration, gain, type, when: index * spacing }));
    }
    function playSynthetic(eventId, definition, options, ownerId) {
      if (!state.context || options.loop) return null;
      const handle = makeHandle(eventId, definition, options, ownerId);
      const pitch = Number(options.pitch) || 1;
      switch (eventId) {
        case "ui.button": synthTone(handle, { frequency: 480, duration: .055, gain: .04 }); break;
        case "ui.error": synthTone(handle, { frequency: 115, duration: .12, type: "square", gain: .035 }); synthTone(handle, { frequency: 92, duration: .14, type: "square", gain: .03, when: .13 }); break;
        case "ui.refill": synthChord(handle, [330, 440, 550, 660], { spacing: .07, duration: .12, gain: .05 }); break;
        case "reel.spin-start": synthTone(handle, { frequency: 130, endFrequency: 340, duration: .34, type: "sawtooth", gain: .045 }); synthTone(handle, { frequency: 260, endFrequency: 580, duration: .3, type: "triangle", gain: .03, when: .03 }); break;
        case "reel.tick": synthTone(handle, { frequency: 170 * pitch, duration: .028, type: "square", gain: .018 }); break;
        case "reel.stop": { const index = Number(options.index) || 0; const intensity = Number(options.volume) || 1; synthTone(handle, { frequency: 150 + index * 45, duration: .1, type: "triangle", gain: .075 * intensity }); synthTone(handle, { frequency: 75 + index * 18, duration: .15, gain: .055 * intensity, when: .015 }); synthTone(handle, { frequency: 680 + index * 80, duration: .035, type: "square", gain: .014 * intensity }); break; }
        case "reel.anticipation": { const strong = options.level === "strong"; synthTone(handle, { frequency: strong ? 105 : 130, endFrequency: strong ? 210 : 175, duration: strong ? .55 : .32, gain: .035 }); if (strong) synthTone(handle, { frequency: 420, duration: .18, type: "triangle", gain: .025, when: .28 }); break; }
        case "tree.awakening": synthTone(handle, { frequency: 110, endFrequency: 440, duration: .72, gain: .05 }); synthTone(handle, { frequency: 220, endFrequency: 880, duration: .55, type: "triangle", gain: .045, when: .12 }); synthChord(handle, [523, 659, 784], { spacing: .07, duration: .26, gain: .045, type: "sine" }); synthTone(handle, { frequency: 76, duration: .18, type: "square", gain: .035, when: .68 }); break;
        case "win.combination": options.fullCommune ? synthChord(handle, [392, 494, 587, 698, 880], { spacing: .075, duration: .3, gain: .065 }) : synthChord(handle, [587, 740, 880, 1175], { spacing: .065, duration: .2, gain: .052 }); break;
        case "win.small": synthChord(handle, [740, 930, 1110], { spacing: .055, duration: .13, gain: .045 }); break;
        case "win.nice": synthChord(handle, [523, 659, 784, 1047], { spacing: .1, duration: .28, gain: .07 }); synthTone(handle, { frequency: 196, endFrequency: 392, duration: .62, gain: .04 }); break;
        case "win.big": synthChord(handle, [392, 523, 659, 784, 1047], { spacing: .12, duration: .34, gain: .085 }); synthTone(handle, { frequency: 98, endFrequency: 196, duration: .86, type: "sawtooth", gain: .035 }); break;
        case "win.jackpot": synthChord(handle, [262, 330, 392, 523, 659, 784, 1047, 1319], { spacing: .1, duration: .38, gain: .08 }); synthChord(handle, [523, 659, 784, 1047], { spacing: .08, duration: .5, gain: .06, type: "sine" }); synthTone(handle, { frequency: 65, endFrequency: 260, duration: 1.4, type: "sawtooth", gain: .04 }); break;
        case "win.loss": synthTone(handle, { frequency: 180, endFrequency: 120, duration: .22, type: "triangle", gain: .035 }); break;
        case "character.reaction": { const base = ["big", "jackpot"].includes(options.level) ? 440 : 587; synthChord(handle, [base, base * 1.25, base * 1.5], { spacing: .055, duration: .18, gain: .045, type: "sine" }); break; }
        case "character.group": synthChord(handle, [392, 494, 587, 740], { spacing: .05, duration: .22, gain: .048 }); break;
        case "free-spins.trigger": synthTone(handle, { frequency: 98, endFrequency: 392, duration: .8, gain: .045 }); synthChord(handle, [392, 523, 659, 784], { spacing: .09, duration: .34, gain: .058 }); break;
        case "free-spins.start": synthChord(handle, [330, 440, 554, 659], { spacing: .075, duration: .22, gain: .05 }); synthTone(handle, { frequency: 165, endFrequency: 330, duration: .42, gain: .03 }); break;
        case "free-spins.retrigger": synthChord(handle, [523, 659, 784, 1047], { spacing: .055, duration: .2, gain: .06 }); synthTone(handle, { frequency: 130, endFrequency: 260, duration: .42, type: "triangle", gain: .035 }); break;
        case "free-spins.summary": synthChord(handle, [262, 330, 392, 523, 659], { spacing: .085, duration: .32, gain: .055, type: "sine" }); break;
        default: finish(handle); return null;
      }
      const latestEnd = Math.max(...handle.sources.map(source => Number(source?.context?.currentTime) || 0), 0);
      env.setTimeout?.(() => finish(handle), Math.max(100, (latestEnd + 1.6) * 1000));
      return handle;
    }

    async function play(eventId, options = {}) {
      initialize();
      const definition = EVENTS[eventId];
      if (!definition || settings.muted || !legacyEnabled() || !state.unlocked) return null;
      const ownerId = options.ownerId ?? state.spinId;
      if (!allowPlayback(eventId, definition, ownerId)) return null;
      const asset = await loadEvent(eventId);
      if (settings.muted || !state.unlocked) return null;
      if (!asset) return playSynthetic(eventId, definition, options, ownerId);
      const handle = makeHandle(eventId, definition, options, ownerId);
      try {
        if (state.context && typeof asset !== "string") {
          const source = state.context.createBufferSource();
          const gain = state.context.createGain();
          source.buffer = asset;
          source.loop = handle.loop;
          setGain(gain, clamp(handle.eventVolume) * clamp(handle.instanceVolume));
          source.connect(gain).connect(gains.get(handle.bus) || gains.get("master"));
          source.onended = () => finish(handle);
          handle.source = source;
          source.start(0);
        } else if (HtmlAudioClass) {
          const element = new HtmlAudioClass(typeof asset === "string" ? asset : selectSource(definition));
          element.loop = handle.loop;
          element.volume = effectiveVolume(handle.bus, handle.eventVolume, handle.instanceVolume);
          element.addEventListener?.("ended", () => finish(handle), { once: true });
          handle.element = element;
          await element.play();
        } else {
          finish(handle);
          return playSynthetic(eventId, definition, options, ownerId);
        }
        return handle;
      } catch (error) {
        finish(handle);
        warnOnce(`play:${eventId}`, `Asset playback failed for ${eventId}; using synthesized fallback.`, error);
        return playSynthetic(eventId, definition, options, ownerId);
      }
    }

    const playLoop = (eventId, options = {}) => play(eventId, { ...options, loop: true });
    const stopGroup = stop;
    const stopOwner = ownerId => [...state.handles.values()].filter(handle => handle.ownerId === ownerId).forEach(stop);
    const stopAll = () => [...state.handles.values()].forEach(stop);
    function pauseAll(hidden = false) {
      if (hidden) state.hiddenPause = true;
      for (const handle of state.handles.values()) if (handle.element) { handle.element.pause?.(); handle.paused = true; }
      if (state.context?.state === "running") void state.context.suspend?.().catch?.(() => {});
    }
    async function resumeAll(hidden = false) {
      if (hidden && !state.hiddenPause || env.document?.hidden) return;
      state.hiddenPause = false;
      try {
        if (state.unlocked && state.context?.state === "suspended") await state.context.resume?.();
        for (const handle of [...state.handles.values()]) {
          if (!handle.element || !handle.paused) continue;
          if (handle.loop && !settings.muted) { handle.paused = false; await handle.element.play?.().catch?.(() => {}); }
          else stop(handle);
        }
      } catch {}
    }
    function onVisibilityChange() { env.document?.hidden ? pauseAll(true) : void resumeAll(true); }
    function setMuted(value) { settings.muted = Boolean(value); if (settings.muted) stopAll(); refreshVolumes(); saveSettings(); return settings.muted; }
    const isMuted = () => settings.muted;
    function setMasterVolume(value) { settings.masterVolume = clamp(value); refreshVolumes(); saveSettings(); return settings.masterVolume; }
    function setBusVolume(busId, value) {
      if (!(busId in settings.busVolumes)) return null;
      settings.busVolumes[busId] = clamp(value);
      refreshVolumes();
      saveSettings();
      return settings.busVolumes[busId];
    }
    const getSettings = () => clone(settings);
    const getAssets = () => Object.fromEntries(state.assets);
    const getStatus = () => ({
      initialized: state.initialized,
      unlocked: state.unlocked,
      backend: AudioContextClass ? "web-audio" : (HtmlAudioClass ? "html-audio" : "none"),
      contextState: state.context?.state || "unavailable",
      muted: settings.muted,
      activeHandles: state.handles.size,
      spinId: state.spinId,
      assets: getAssets(),
    });
    function beginSpinSession(spinId) { if (state.spinId && state.spinId !== spinId) stopOwner(state.spinId); return state.spinId = spinId || null; }
    function endSpinSession(spinId = state.spinId) { if (spinId) stopOwner(spinId); if (state.spinId === spinId) state.spinId = null; }
    const clearFeatureAudio = () => [...state.handles.values()].filter(handle => ["features", "characters"].includes(handle.bus) || handle.groupId === "feature").forEach(stop);

    return {
      initialize, unlock, preloadGroup, loadEvent, play, playLoop, stop, stopGroup, stopOwner, stopAll,
      pauseAll, resumeAll, setMuted, isMuted, setMasterVolume, setBusVolume, getSettings, getStatus,
      getAssets, beginSpinSession, endSpinSession, clearFeatureAudio,
    };
  }

  const manager = createAudioManager();
  manager.initialize();
  function createAudio(getSoundEnabled) {
    const scoped = createAudioManager({ getSoundEnabled });
    scoped.initialize();
    const fire = (id, options) => void scoped.unlock().then(() => scoped.play(id, options));
    return {
      manager: scoped,
      unlock: scoped.unlock,
      playSpinStart: () => fire("reel.spin-start"),
      playTick: pitch => fire("reel.tick", { pitch }),
      playReelStop: (index, intensity) => fire("reel.stop", { index, volume: intensity }),
      playAnticipation: level => fire("reel.anticipation", { level }),
      playAwakening: () => fire("tree.awakening"),
      playCombination: fullCommune => fire("win.combination", { fullCommune }),
      playTierSound: tier => fire(`win.${tier}`),
      playCharacterReaction: level => fire("character.reaction", { level }),
      playGroupReaction: () => fire("character.group"),
      playFreeSpinTrigger: () => fire("free-spins.trigger"),
      playFreeSpinStart: () => fire("free-spins.start"),
      playRetrigger: () => fire("free-spins.retrigger"),
      playFreeSpinSummary: () => fire("free-spins.summary"),
      playWinSound: amount => fire(amount >= 100 ? "win.nice" : "win.small"),
      playLossSound: () => fire("win.loss"),
      playErrorSound: () => fire("ui.error"),
      playButtonTone: () => fire("ui.button"),
      playRefillSound: () => fire("ui.refill"),
    };
  }
  app.audio = Object.assign(manager, { createAudio, createAudioManager });

  if (/(?:^|[?&])qa=(?:ally|audio)(?:&|$)/i.test(globalThis.location?.search || "") && globalThis.document) {
    const mount = () => {
      if (document.getElementById("audioQaStatus")) return;
      const panel = document.createElement("details");
      panel.id = "audioQaStatus";
      panel.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:10000;width:min(300px,calc(100vw - 24px));padding:10px 12px;border:1px solid #587891;border-radius:12px;background:#071322f5;color:#edf7ff;font:12px/1.35 system-ui";
      panel.innerHTML = '<summary style="cursor:pointer;font-weight:800">Audio status</summary><pre style="white-space:pre-wrap;margin:10px 0 0"></pre>';
      document.body.append(panel);
      const refresh = () => {
        const status = manager.getStatus();
        const counts = Object.values(status.assets).reduce((out, value) => ((out[value] = (out[value] || 0) + 1), out), {});
        panel.querySelector("pre").textContent = [
          `Backend: ${status.backend}`,
          `Context: ${status.contextState}`,
          `Unlocked: ${status.unlocked ? "Yes" : "No"}`,
          `Muted: ${status.muted ? "Yes" : "No"}`,
          `Active handles: ${status.activeHandles}`,
          `Available assets: ${counts.available || 0}`,
          `Synthetic fallbacks: ${counts["synthetic-fallback"] || 0}`,
          `Failed: ${counts.failed || 0}`,
          `Not loaded: ${counts["not-yet-loaded"] || 0}`,
        ].join("\n");
      };
      refresh();
      globalThis.setInterval(refresh, 750);
    };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
  }
})();