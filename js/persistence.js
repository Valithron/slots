(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, constants, GAME_STATES } = app;

  function normalizeFortuneMeter(fortuneMeter) {
    const rawValue = Number.isFinite(fortuneMeter?.value) ? Math.floor(fortuneMeter.value) : 0;
    const value = Math.min(CONFIG.fortuneMeter.capacity, Math.max(0, rawValue));
    return { value, charged: value >= CONFIG.fortuneMeter.capacity };
  }

  function defaultState() {
    return {
      schemaVersion: CONFIG.schemaVersion,
      coins: CONFIG.startingCoins,
      lineBetIndex: 0,
      sound: true,
      lastWin: 0,
      gamePhase: GAME_STATES.IDLE,
      pendingSpin: null,
      fortuneMeter: normalizeFortuneMeter(null),
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

  function normalizeFortuneMeterAward(award) {
    const normalizePoints = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const paidSpinPoints = normalizePoints(award?.paidSpinPoints);
    const tierPoints = normalizePoints(award?.tierPoints);
    const combinationPoints = normalizePoints(award?.combinationPoints);
    const computedTotal = paidSpinPoints + tierPoints + combinationPoints;
    return {
      paidSpinPoints,
      tierPoints,
      combinationPoints,
      jackpotCharge: award?.jackpotCharge === true,
      totalPoints: Number.isFinite(award?.totalPoints) ? normalizePoints(award.totalPoints) : computedTotal,
    };
  }

  function normalizePendingSpin(pendingSpin) {
    if (!pendingSpin || typeof pendingSpin !== "object") return null;
    if (typeof pendingSpin.id !== "string" || !Array.isArray(pendingSpin.targetStops)) return null;
    if (pendingSpin.settlementStatus && pendingSpin.settlementStatus !== "pending") return null;
    if (!Number.isFinite(pendingSpin.wager) || pendingSpin.wager < 0) return null;
    if (!Number.isFinite(pendingSpin.totalWin) || pendingSpin.totalWin < 0) return null;

    const totalWin = Math.floor(pendingSpin.totalWin);
    const preModifierWin = Number.isFinite(pendingSpin.preModifierWin)
      ? Math.max(0, Math.floor(pendingSpin.preModifierWin))
      : totalWin;
    const fortuneSpinActive = pendingSpin.fortuneSpin?.active === true;
    const multiplier = Number.isFinite(pendingSpin.fortuneSpin?.multiplier) && pendingSpin.fortuneSpin.multiplier > 0
      ? pendingSpin.fortuneSpin.multiplier
      : CONFIG.fortuneMeter.multiplier;

    return {
      ...pendingSpin,
      wager: Math.floor(pendingSpin.wager),
      lineBet: Number.isFinite(pendingSpin.lineBet) ? Math.floor(pendingSpin.lineBet) : 1,
      baseLineWinTotal: Number.isFinite(pendingSpin.baseLineWinTotal) ? Math.floor(pendingSpin.baseLineWinTotal) : 0,
      lineWinTotal: Number.isFinite(pendingSpin.lineWinTotal) ? Math.floor(pendingSpin.lineWinTotal) : preModifierWin,
      combinationWinTotal: Number.isFinite(pendingSpin.combinationWinTotal) ? Math.floor(pendingSpin.combinationWinTotal) : 0,
      preModifierWin,
      fortuneBonus: Number.isFinite(pendingSpin.fortuneBonus) ? Math.max(0, Math.floor(pendingSpin.fortuneBonus)) : Math.max(0, totalWin - preModifierWin),
      fortuneSpin: {
        active: fortuneSpinActive,
        multiplier,
        consumedCharge: fortuneSpinActive && pendingSpin.fortuneSpin?.consumedCharge !== false,
      },
      modifiers: Array.isArray(pendingSpin.modifiers) ? pendingSpin.modifiers.map(modifier => ({ ...modifier })) : [],
      fortuneMeterAward: normalizeFortuneMeterAward(pendingSpin.fortuneMeterAward),
      naturalWinTier: typeof pendingSpin.naturalWinTier === "string" ? pendingSpin.naturalWinTier : (pendingSpin.winTier || "none"),
      finalWinTier: typeof pendingSpin.finalWinTier === "string" ? pendingSpin.finalWinTier : (pendingSpin.winTier || "none"),
      winTier: typeof pendingSpin.winTier === "string" ? pendingSpin.winTier : (pendingSpin.finalWinTier || "none"),
      totalWin,
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
        lineBetIndex: Number.isInteger(saved.lineBetIndex) ? Math.min(Math.max(saved.lineBetIndex, 0), CONFIG.lineBets.length - 1) : 0,
        sound: saved.sound !== false,
        lastWin: Number.isFinite(saved.lastWin) ? Math.max(0, Math.floor(saved.lastWin)) : 0,
        gamePhase: pendingSpin ? GAME_STATES.RESOLVING : GAME_STATES.IDLE,
        pendingSpin,
        fortuneMeter: normalizeFortuneMeter(saved.fortuneMeter),
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
        fortuneMeter: normalizeFortuneMeter(state.fortuneMeter),
      }));
      return true;
    } catch {
      return false;
    }
  }

  app.persistence = {
    defaultState,
    normalizeFortuneMeter,
    normalizeFortuneMeterAward,
    normalizePendingSpin,
    loadState,
    saveState,
  };
})();