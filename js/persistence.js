(() => {
  "use strict";

  const app = window.CommuneFortune;
  const { CONFIG, constants } = app;

  function defaultState() {
    return {
      coins: CONFIG.startingCoins,
      lineBetIndex: 0,
      sound: true,
      lastWin: 0,
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(constants.storageKey));
      return {
        coins: Number.isFinite(saved?.coins) ? Math.max(0, Math.floor(saved.coins)) : CONFIG.startingCoins,
        lineBetIndex: Number.isInteger(saved?.lineBetIndex)
          ? Math.min(Math.max(saved.lineBetIndex, 0), CONFIG.lineBets.length - 1)
          : 0,
        sound: saved?.sound !== false,
        lastWin: 0,
      };
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(constants.storageKey, JSON.stringify({
      coins: state.coins,
      lineBetIndex: state.lineBetIndex,
      sound: state.sound,
    }));
  }

  app.persistence = { loadState, saveState };
})();
