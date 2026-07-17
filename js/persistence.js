(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, constants, GAME_STATES } = app;

  function defaultState() {
    return {
      schemaVersion: CONFIG.schemaVersion,
      coins: CONFIG.startingCoins,
      lineBetIndex: 0,
      sound: true,
      lastWin: 0,
      gamePhase: GAME_STATES.IDLE,
      pendingSpin: null,
    };
  }

  function readSavedState() {
    const primary = localStorage.getItem(constants.storageKey);
    if (primary) return JSON.parse(primary);

    for (const legacyKey of constants.legacyStorageKeys) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) return JSON.parse(legacy);
    }

    return null;
  }

  function normalizePendingSpin(pendingSpin) {
    if (!pendingSpin || typeof pendingSpin !== "object") return null;
    if (typeof pendingSpin.id !== "string") return null;
    if (!Array.isArray(pendingSpin.targetStops)) return null;
    if (!Number.isFinite(pendingSpin.wager) || pendingSpin.wager < 0) return null;
    if (!Number.isFinite(pendingSpin.totalWin) || pendingSpin.totalWin < 0) return null;

    return {
      ...pendingSpin,
      wager: Math.floor(pendingSpin.wager),
      totalWin: Math.floor(pendingSpin.totalWin),
      settlementStatus: "pending",
    };
  }

  function loadState() {
    try {
      const saved = readSavedState();
      if (!saved) return defaultState();

      const pendingSpin = normalizePendingSpin(saved.pendingSpin);
      return {
        schemaVersion: CONFIG.schemaVersion,
        coins: Number.isFinite(saved.coins) ? Math.max(0, Math.floor(saved.coins)) : CONFIG.startingCoins,
        lineBetIndex: Number.isInteger(saved.lineBetIndex)
          ? Math.min(Math.max(saved.lineBetIndex, 0), CONFIG.lineBets.length - 1)
          : 0,
        sound: saved.sound !== false,
        lastWin: Number.isFinite(saved.lastWin) ? Math.max(0, Math.floor(saved.lastWin)) : 0,
        gamePhase: pendingSpin ? GAME_STATES.RESOLVING : GAME_STATES.IDLE,
        pendingSpin,
      };
    } catch {
      return defaultState();
    }
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
        pendingSpin: state.pendingSpin,
      }));
      return true;
    } catch {
      return false;
    }
  }

  app.persistence = { defaultState, loadState, saveState };
})();
