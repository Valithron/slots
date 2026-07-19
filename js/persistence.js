(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, constants, GAME_STATES } = app;
  const VALID_SESSION_STATUSES = new Set(Object.values(app.freeSpins.FREE_SPIN_STATUSES));

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
      freeSpinSession: null,
      mystery: app.mystery?.createState?.() || { queuedFreeSpins: 0, modifierQueue: [], appliedAwardIds: [], lastAward: null },
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
    const fortuneBurstPoints = normalizePoints(award?.fortuneBurstPoints);
    const mysteryTokenPoints = normalizePoints(award?.mysteryTokenPoints);
    const computedTotal = paidSpinPoints + tierPoints + combinationPoints + fortuneBurstPoints + mysteryTokenPoints;
    return {
      paidSpinPoints,
      tierPoints,
      combinationPoints,
      fortuneBurstPoints,
      mysteryTokenPoints,
      jackpotCharge: award?.jackpotCharge === true,
      totalPoints: Number.isFinite(award?.totalPoints) ? normalizePoints(award.totalPoints) : computedTotal,
    };
  }

  function normalizeFreeSpinTrigger(trigger, spinType) {
    const retrigger = spinType === "free";
    const requestedMaximum = retrigger ? CONFIG.freeSpins.retriggerAward : CONFIG.freeSpins.startingAward;
    const awardedSpins = Number.isFinite(trigger?.awardedSpins)
      ? Math.min(requestedMaximum, Math.max(0, Math.floor(trigger.awardedSpins)))
      : 0;
    const treeCells = Array.isArray(trigger?.treeCells)
      ? trigger.treeCells
        .filter(cell => Number.isInteger(cell?.row) && Number.isInteger(cell?.reel)
          && cell.row >= 0 && cell.row < CONFIG.rowCount
          && cell.reel >= 0 && cell.reel < CONFIG.reels.length)
        .map(cell => ({ row: cell.row, reel: cell.reel }))
      : [];
    return {
      triggered: trigger?.triggered === true && treeCells.length === CONFIG.reels.length,
      type: "three-trees",
      awardedSpins,
      retrigger,
      treeCells,
      capped: trigger?.capped === true,
    };
  }

  function normalizePendingSpin(pendingSpin) {
    if (!pendingSpin || typeof pendingSpin !== "object") return null;
    if (typeof pendingSpin.id !== "string" || !Array.isArray(pendingSpin.targetStops)) return null;
    if (pendingSpin.settlementStatus && pendingSpin.settlementStatus !== "pending") return null;
    if (!Number.isFinite(pendingSpin.totalWin) || pendingSpin.totalWin < 0) return null;

    const spinType = ["paid", "free", "mystery-free"].includes(pendingSpin.spinType) ? pendingSpin.spinType : "paid";
    const fortuneEligible = spinType !== "free";
    const referenceBet = Number.isFinite(pendingSpin.referenceBet)
      ? Math.max(1, Math.floor(pendingSpin.referenceBet))
      : Number.isFinite(pendingSpin.wager)
        ? Math.max(1, Math.floor(pendingSpin.wager))
        : CONFIG.paylines.length;
    const coinCost = spinType !== "paid"
      ? 0
      : Number.isFinite(pendingSpin.coinCost)
        ? Math.max(0, Math.floor(pendingSpin.coinCost))
        : referenceBet;
    const totalWin = Math.floor(pendingSpin.totalWin);
    const preModifierWin = Number.isFinite(pendingSpin.preModifierWin)
      ? Math.max(0, Math.floor(pendingSpin.preModifierWin))
      : totalWin;
    const fortuneSpinActive = fortuneEligible && pendingSpin.fortuneSpin?.active === true;
    const multiplier = Number.isFinite(pendingSpin.fortuneSpin?.multiplier) && pendingSpin.fortuneSpin.multiplier > 0
      ? pendingSpin.fortuneSpin.multiplier
      : CONFIG.fortuneMeter.multiplier;
    const normalizedAward = normalizeFortuneMeterAward(pendingSpin.fortuneMeterAward);

    return {
      ...pendingSpin,
      spinType,
      paidSpin: spinType === "paid",
      mysteryFreeSpin: spinType === "mystery-free",
      coinCost,
      referenceBet,
      wager: referenceBet,
      lineBetIndex: Number.isInteger(pendingSpin.lineBetIndex)
        ? Math.min(Math.max(pendingSpin.lineBetIndex, 0), CONFIG.lineBets.length - 1)
        : 0,
      lineBet: Number.isFinite(pendingSpin.lineBet) ? Math.max(1, Math.floor(pendingSpin.lineBet)) : 1,
      baseLineWinTotal: Number.isFinite(pendingSpin.baseLineWinTotal) ? Math.max(0, Math.floor(pendingSpin.baseLineWinTotal)) : 0,
      lineWinTotal: Number.isFinite(pendingSpin.lineWinTotal) ? Math.max(0, Math.floor(pendingSpin.lineWinTotal)) : preModifierWin,
      combinationWinTotal: Number.isFinite(pendingSpin.combinationWinTotal) ? Math.max(0, Math.floor(pendingSpin.combinationWinTotal)) : 0,
      preModifierWin,
      fortuneBonus: !fortuneEligible
        ? 0
        : Number.isFinite(pendingSpin.fortuneBonus)
          ? Math.max(0, Math.floor(pendingSpin.fortuneBonus))
          : Math.max(0, totalWin - preModifierWin),
      fortuneSpin: {
        active: fortuneSpinActive,
        multiplier,
        consumedCharge: fortuneSpinActive && pendingSpin.fortuneSpin?.consumedCharge !== false,
      },
      modifiers: Array.isArray(pendingSpin.modifiers) ? pendingSpin.modifiers.map(modifier => ({ ...modifier })) : [],
      fortuneMeterAward: normalizedAward,
      freeSpinTrigger: normalizeFreeSpinTrigger(pendingSpin.freeSpinTrigger, spinType),
      naturalWinTier: typeof pendingSpin.naturalWinTier === "string" ? pendingSpin.naturalWinTier : (pendingSpin.winTier || "none"),
      finalWinTier: typeof pendingSpin.finalWinTier === "string" ? pendingSpin.finalWinTier : (pendingSpin.winTier || "none"),
      winTier: typeof pendingSpin.winTier === "string" ? pendingSpin.winTier : (pendingSpin.finalWinTier || "none"),
      totalWin,
      settlementStatus: "pending",
    };
  }

  function normalizeFreeSpinSession(session, pendingSpin = null) {
    if (!session || typeof session !== "object" || session.active !== true) return null;
    if (typeof session.sessionId !== "string" || typeof session.triggerSpinId !== "string") return null;
    const maximum = CONFIG.freeSpins.maximumAwardedSpins;
    const startingSpins = Math.min(maximum, Math.max(1, Math.floor(Number(session.startingSpins) || CONFIG.freeSpins.startingAward)));
    const totalAwardedSpins = Math.min(maximum, Math.max(startingSpins, Math.floor(Number(session.totalAwardedSpins) || startingSpins)));
    const completedSpins = Math.min(totalAwardedSpins, Math.max(0, Math.floor(Number(session.completedSpins) || 0)));
    const computedRemaining = Math.max(0, totalAwardedSpins - completedSpins);
    const storedRemaining = Math.max(0, Math.floor(Number(session.remainingSpins) || 0));
    const remainingSpins = Math.min(maximum, Math.max(computedRemaining, storedRemaining));
    let status = VALID_SESSION_STATUSES.has(session.status) ? session.status : app.freeSpins.FREE_SPIN_STATUSES.INTRO;
    if (status === app.freeSpins.FREE_SPIN_STATUSES.SPINNING && pendingSpin?.spinType !== "free") {
      status = remainingSpins > 0 ? app.freeSpins.FREE_SPIN_STATUSES.READY : app.freeSpins.FREE_SPIN_STATUSES.COMPLETE;
    }
    const triggerResult = session.triggerResult && typeof session.triggerResult === "object" && typeof session.triggerResult.id === "string"
      ? {
        ...structuredClone(session.triggerResult),
        settlementStatus: "settled",
        spinType: session.triggerResult.spinType === "mystery-free" ? "mystery-free" : "paid",
        paidSpin: session.triggerResult.spinType !== "mystery-free",
        mysteryFreeSpin: session.triggerResult.spinType === "mystery-free",
        coinCost: session.triggerResult.spinType === "mystery-free" ? 0 : Math.max(0, Math.floor(session.triggerResult.coinCost || session.referenceBet || 0)),
      }
      : null;
    const presentationSpin = session.presentationSpin && typeof session.presentationSpin === "object" && typeof session.presentationSpin.id === "string"
      ? { ...structuredClone(session.presentationSpin), settlementStatus: "settled", spinType: "free", paidSpin: false, coinCost: 0 }
      : null;
    const lastResult = session.lastResult && typeof session.lastResult === "object" && typeof session.lastResult.id === "string"
      ? { ...structuredClone(session.lastResult), settlementStatus: "settled", spinType: "free", paidSpin: false, coinCost: 0 }
      : presentationSpin;
    if (status === app.freeSpins.FREE_SPIN_STATUSES.PRESENTING && !presentationSpin) {
      status = remainingSpins > 0 ? app.freeSpins.FREE_SPIN_STATUSES.READY : app.freeSpins.FREE_SPIN_STATUSES.COMPLETE;
    }
    if (remainingSpins === 0 && ![app.freeSpins.FREE_SPIN_STATUSES.PRESENTING, app.freeSpins.FREE_SPIN_STATUSES.SUMMARY, app.freeSpins.FREE_SPIN_STATUSES.COMPLETE].includes(status)) {
      status = app.freeSpins.FREE_SPIN_STATUSES.COMPLETE;
    }
    return {
      active: true,
      sessionId: session.sessionId,
      status,
      lockedLineBetIndex: Number.isInteger(session.lockedLineBetIndex)
        ? Math.min(Math.max(session.lockedLineBetIndex, 0), CONFIG.lineBets.length - 1)
        : 0,
      lockedLineBet: Number.isFinite(session.lockedLineBet)
        ? Math.max(1, Math.floor(session.lockedLineBet))
        : CONFIG.lineBets[0],
      referenceBet: Number.isFinite(session.referenceBet)
        ? Math.max(1, Math.floor(session.referenceBet))
        : CONFIG.lineBets[0] * CONFIG.paylines.length,
      startingSpins,
      remainingSpins,
      completedSpins,
      totalAwardedSpins,
      retriggerCount: Math.max(0, Math.floor(Number(session.retriggerCount) || 0)),
      accumulatedWin: Math.max(0, Math.floor(Number(session.accumulatedWin) || 0)),
      characterWinTotals: app.reactions.normalizeContributionTotals(session.characterWinTotals),
      triggerSpinId: session.triggerSpinId,
      lastSettledFreeSpinId: typeof session.lastSettledFreeSpinId === "string" ? session.lastSettledFreeSpinId : null,
      lastPresentedFreeSpinId: typeof session.lastPresentedFreeSpinId === "string" ? session.lastPresentedFreeSpinId : null,
      lastRetriggerSpinId: typeof session.lastRetriggerSpinId === "string" ? session.lastRetriggerSpinId : null,
      triggerTreeCells: Array.isArray(session.triggerTreeCells)
        ? session.triggerTreeCells.filter(cell => Number.isInteger(cell?.row) && Number.isInteger(cell?.reel)).map(cell => ({ row: cell.row, reel: cell.reel }))
        : [],
      triggerResult,
      presentationSpin,
      lastResult,
    };
  }

  function loadState() {
    try {
      const saved = readSavedState();
      if (!saved) return defaultState();
      const pendingSpin = normalizePendingSpin(saved.pendingSpin);
      const freeSpinSession = normalizeFreeSpinSession(saved.freeSpinSession, pendingSpin);
      const safePendingSpin = pendingSpin?.spinType === "free" && !freeSpinSession ? null : pendingSpin;
      const gamePhase = app.freeSpins.getSessionPhase(freeSpinSession, safePendingSpin);
      return {
        schemaVersion: CONFIG.schemaVersion,
        coins: Number.isFinite(saved.coins) ? Math.max(0, Math.floor(saved.coins)) : CONFIG.startingCoins,
        lineBetIndex: Number.isInteger(saved.lineBetIndex) ? Math.min(Math.max(saved.lineBetIndex, 0), CONFIG.lineBets.length - 1) : 0,
        sound: saved.sound !== false,
        lastWin: Number.isFinite(saved.lastWin) ? Math.max(0, Math.floor(saved.lastWin)) : 0,
        gamePhase,
        pendingSpin: safePendingSpin,
        fortuneMeter: normalizeFortuneMeter(saved.fortuneMeter),
        freeSpinSession,
        mystery: app.mystery?.normalizeState?.(saved.mystery) || saved.mystery || defaultState().mystery,
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
        freeSpinSession: normalizeFreeSpinSession(state.freeSpinSession, state.pendingSpin),
        mystery: app.mystery?.normalizeState?.(state.mystery) || state.mystery || defaultState().mystery,
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
    normalizeFreeSpinTrigger,
    normalizePendingSpin,
    normalizeFreeSpinSession,
    loadState,
    saveState,
  };
})();
