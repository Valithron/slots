(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, constants } = app;
  const originalNormalizeSession = app.persistence.normalizeFreeSpinSession;
  const originalDefaultState = app.persistence.defaultState;
  const originalLoadState = app.persistence.loadState;

  function readRawState() {
    for (const key of [constants.storageKey, ...(constants.legacyStorageKeys || [])]) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  }

  function normalizeFreeSpinSession(session, pendingSpin = null) {
    const normalized = originalNormalizeSession(session, pendingSpin);
    if (!normalized) return null;
    const legacy = !session?.ally;
    normalized.ally = app.allies.normalizeAllyState(session?.ally, { legacy });
    return normalized;
  }

  function defaultState() {
    const state = originalDefaultState();
    state.schemaVersion = CONFIG.schemaVersion;
    return state;
  }

  function loadState() {
    const raw = readRawState();
    const state = originalLoadState();
    state.schemaVersion = CONFIG.schemaVersion;
    if (state.freeSpinSession) {
      state.freeSpinSession.ally = app.allies.normalizeAllyState(raw?.freeSpinSession?.ally, {
        legacy: !raw?.freeSpinSession?.ally,
      });
    }
    return state;
  }

  function saveState(state) {
    try {
      localStorage.setItem(constants.storageKey, JSON.stringify({
        schemaVersion: CONFIG.schemaVersion,
        coins: state.coins,
        lineBetIndex: state.lineBetIndex,
        sound: state.sound,
        lastWin: state.lastWin,
        gamePhase: state.gamePhase,
        pendingSpin: app.persistence.normalizePendingSpin(state.pendingSpin),
        fortuneMeter: app.persistence.normalizeFortuneMeter(state.fortuneMeter),
        freeSpinSession: normalizeFreeSpinSession(state.freeSpinSession, state.pendingSpin),
        visualEffectsMode: state.visualEffectsMode,
        mystery: app.mystery?.normalizeState?.(state.mystery) || state.mystery,
      }));
      return true;
    } catch {
      return false;
    }
  }

  app.persistence.normalizeFreeSpinSession = normalizeFreeSpinSession;
  app.persistence.defaultState = defaultState;
  app.persistence.loadState = loadState;
  app.persistence.saveState = saveState;
})();
