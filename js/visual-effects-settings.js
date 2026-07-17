(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { constants } = app;
  const VALID_MODES = new Set(["auto", "full", "reduced"]);
  const normalizeVisualEffectsMode = value => VALID_MODES.has(value) ? value : "auto";

  const originalDefaultState = app.persistence.defaultState;
  const originalLoadState = app.persistence.loadState;
  const originalSaveState = app.persistence.saveState;

  function readStoredMode() {
    const keys = [constants.storageKey, ...constants.legacyStorageKeys];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) return normalizeVisualEffectsMode(JSON.parse(raw)?.visualEffectsMode);
      } catch {
        return "auto";
      }
    }
    return "auto";
  }

  function defaultState() {
    return {
      ...originalDefaultState(),
      visualEffectsMode: "auto",
    };
  }

  function loadState() {
    return {
      ...originalLoadState(),
      visualEffectsMode: readStoredMode(),
    };
  }

  function saveState(state) {
    if (!state || typeof state !== "object") return false;
    const mode = normalizeVisualEffectsMode(state.visualEffectsMode);
    state.visualEffectsMode = mode;
    if (!originalSaveState(state)) return false;
    try {
      const saved = JSON.parse(localStorage.getItem(constants.storageKey) || "{}");
      saved.visualEffectsMode = mode;
      localStorage.setItem(constants.storageKey, JSON.stringify(saved));
      return true;
    } catch {
      return false;
    }
  }

  app.visualEffectsSettings = {
    VALID_MODES,
    normalizeVisualEffectsMode,
    readStoredMode,
  };
  app.persistence.defaultState = defaultState;
  app.persistence.loadState = loadState;
  app.persistence.saveState = saveState;
})();