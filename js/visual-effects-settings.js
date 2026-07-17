(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const VALID_MODES = new Set(["auto", "full", "reduced"]);
  const normalizeVisualEffectsMode = value => VALID_MODES.has(value) ? value : "auto";

  const originalDefaultState = app.persistence.defaultState;
  const originalLoadState = app.persistence.loadState;
  const originalSaveState = app.persistence.saveState;

  function defaultState() {
    return {
      ...originalDefaultState(),
      visualEffectsMode: "auto",
    };
  }

  function loadState() {
    const state = originalLoadState();
    state.visualEffectsMode = normalizeVisualEffectsMode(state.visualEffectsMode);
    return state;
  }

  function saveState(state) {
    if (!state || typeof state !== "object") return false;
    state.visualEffectsMode = normalizeVisualEffectsMode(state.visualEffectsMode);
    return originalSaveState(state);
  }

  app.visualEffectsSettings = {
    VALID_MODES,
    normalizeVisualEffectsMode,
  };
  app.persistence.defaultState = defaultState;
  app.persistence.loadState = loadState;
  app.persistence.saveState = saveState;
})();