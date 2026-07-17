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

  let currentMode = readStoredMode();

  function writeStoredMode(mode) {
    currentMode = normalizeVisualEffectsMode(mode);
    try {
      const saved = JSON.parse(localStorage.getItem(constants.storageKey) || "{}");
      saved.visualEffectsMode = currentMode;
      localStorage.setItem(constants.storageKey, JSON.stringify(saved));
      return true;
    } catch {
      return false;
    }
  }

  function defaultState() {
    return {
      ...originalDefaultState(),
      visualEffectsMode: currentMode,
    };
  }

  function loadState() {
    currentMode = readStoredMode();
    return {
      ...originalLoadState(),
      visualEffectsMode: currentMode,
    };
  }

  function saveState(state) {
    if (!state || typeof state !== "object") return false;
    state.visualEffectsMode = currentMode;
    if (!originalSaveState(state)) return false;
    return writeStoredMode(currentMode);
  }

  function setMode(mode) {
    writeStoredMode(mode);
    return currentMode;
  }

  app.visualEffectsSettings = {
    VALID_MODES,
    normalizeVisualEffectsMode,
    readStoredMode,
    getMode: () => currentMode,
    setMode,
  };
  app.persistence.defaultState = defaultState;
  app.persistence.loadState = loadState;
  app.persistence.saveState = saveState;
})();