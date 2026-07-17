(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const FREE_SPIN_STATUSES = Object.freeze({
    INTRO: "intro",
    READY: "ready",
    SPINNING: "spinning",
    PRESENTING: "presenting",
    COMPLETE: "complete",
    SUMMARY: "summary",
  });

  function createId(prefix = "free-spins") {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getNaturalTreeCells(originalMatrix, symbolKey = CONFIG.freeSpins.triggerSymbolKey) {
    if (!Array.isArray(originalMatrix)) return [];
    const cells = [];
    originalMatrix.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      row.forEach((key, reelIndex) => {
        if (key === symbolKey) cells.push({ row: rowIndex, reel: reelIndex });
      });
    });
    return cells;
  }

  function hasTreeOnEveryReel(originalMatrix) {
    const reelCount = CONFIG.reels.length;
    const reelsWithTree = new Set(getNaturalTreeCells(originalMatrix).map(cell => cell.reel));
    return reelsWithTree.size === reelCount && Array.from({ length: reelCount }, (_, reel) => reel).every(reel => reelsWithTree.has(reel));
  }

  function selectTriggerTreeCells(originalMatrix) {
    const cells = getNaturalTreeCells(originalMatrix);
    return Array.from({ length: CONFIG.reels.length }, (_, reel) => cells.find(cell => cell.reel === reel)).filter(Boolean);
  }

  function createFreeSpinTrigger(originalMatrix, {
    enabled = CONFIG.features.freeSpins,
    spinType = "paid",
    totalAwardedSpins = 0,
  } = {}) {
    if (!enabled || !hasTreeOnEveryReel(originalMatrix)) {
      return {
        triggered: false,
        type: "three-trees",
        awardedSpins: 0,
        retrigger: spinType === "free",
        treeCells: [],
        capped: false,
      };
    }
    const requested = spinType === "free" ? CONFIG.freeSpins.retriggerAward : CONFIG.freeSpins.startingAward;
    const remainingCapacity = Math.max(0, CONFIG.freeSpins.maximumAwardedSpins - Math.max(0, Math.floor(totalAwardedSpins)));
    const awardedSpins = Math.min(requested, remainingCapacity);
    return {
      triggered: true,
      type: "three-trees",
      awardedSpins,
      retrigger: spinType === "free",
      treeCells: selectTriggerTreeCells(originalMatrix),
      capped: awardedSpins < requested,
    };
  }

  function createFreeSpinSession(triggerResult, {
    sessionId = createId(),
  } = {}) {
    if (!triggerResult?.freeSpinTrigger?.triggered || triggerResult.spinType !== "paid") return null;
    const startingSpins = Math.max(0, Math.floor(triggerResult.freeSpinTrigger.awardedSpins));
    if (startingSpins <= 0) return null;
    return {
      active: true,
      sessionId,
      status: FREE_SPIN_STATUSES.INTRO,
      lockedLineBetIndex: Number.isInteger(triggerResult.lineBetIndex) ? triggerResult.lineBetIndex : 0,
      lockedLineBet: Math.max(1, Math.floor(triggerResult.lineBet || 1)),
      referenceBet: Math.max(1, Math.floor(triggerResult.referenceBet || triggerResult.wager || 1)),
      startingSpins,
      remainingSpins: startingSpins,
      completedSpins: 0,
      totalAwardedSpins: startingSpins,
      retriggerCount: 0,
      accumulatedWin: 0,
      characterWinTotals: app.reactions.createEmptyContributionTotals(),
      triggerSpinId: triggerResult.id,
      lastSettledFreeSpinId: null,
      lastPresentedFreeSpinId: null,
      lastRetriggerSpinId: null,
      triggerTreeCells: triggerResult.freeSpinTrigger.treeCells.map(cell => ({ ...cell })),
      triggerResult: { ...structuredClone(triggerResult), settlementStatus: "settled" },
      presentationSpin: null,
      lastResult: null,
    };
  }

  function cloneSession(session) {
    if (!session) return null;
    return {
      ...session,
      characterWinTotals: app.reactions.normalizeContributionTotals(session.characterWinTotals),
      triggerTreeCells: Array.isArray(session.triggerTreeCells) ? session.triggerTreeCells.map(cell => ({ ...cell })) : [],
      triggerResult: session.triggerResult ? structuredClone(session.triggerResult) : null,
      presentationSpin: session.presentationSpin ? structuredClone(session.presentationSpin) : null,
      lastResult: session.lastResult ? structuredClone(session.lastResult) : null,
    };
  }

  function applyFreeSpinSettlement(session, spinResult) {
    const next = cloneSession(session);
    if (!next?.active || spinResult?.spinType !== "free") {
      return { session: next, applied: false, retriggerApplied: 0 };
    }
    if (next.lastSettledFreeSpinId === spinResult.id) {
      return { session: next, applied: false, retriggerApplied: 0 };
    }

    next.completedSpins += 1;
    next.remainingSpins = Math.max(0, next.remainingSpins - 1);
    next.accumulatedWin += Math.max(0, Math.floor(spinResult.totalWin || 0));
    next.characterWinTotals = app.reactions.addLineContributions(next.characterWinTotals, spinResult.lineWins);

    let retriggerApplied = 0;
    if (spinResult.freeSpinTrigger?.triggered && spinResult.freeSpinTrigger.retrigger) {
      const requested = Math.max(0, Math.floor(spinResult.freeSpinTrigger.awardedSpins || 0));
      const capacity = Math.max(0, CONFIG.freeSpins.maximumAwardedSpins - next.totalAwardedSpins);
      retriggerApplied = Math.min(requested, capacity);
      if (retriggerApplied > 0) {
        next.totalAwardedSpins += retriggerApplied;
        next.remainingSpins += retriggerApplied;
        next.retriggerCount += 1;
        next.lastRetriggerSpinId = spinResult.id;
      }
    }

    next.lastSettledFreeSpinId = spinResult.id;
    next.presentationSpin = { ...structuredClone(spinResult), settlementStatus: "settled" };
    next.lastResult = { ...structuredClone(spinResult), settlementStatus: "settled" };
    next.status = FREE_SPIN_STATUSES.PRESENTING;
    return { session: next, applied: true, retriggerApplied };
  }

  function markFreeSpinPresented(session, spinId) {
    const next = cloneSession(session);
    if (!next?.active) return next;
    if (typeof spinId === "string") next.lastPresentedFreeSpinId = spinId;
    if (!spinId || next.presentationSpin?.id === spinId) next.presentationSpin = null;
    next.status = next.remainingSpins > 0 ? FREE_SPIN_STATUSES.READY : FREE_SPIN_STATUSES.COMPLETE;
    return next;
  }

  function markSummary(session) {
    const next = cloneSession(session);
    if (!next?.active) return next;
    next.status = FREE_SPIN_STATUSES.SUMMARY;
    return next;
  }

  function closeSession(session) {
    const next = cloneSession(session);
    if (!next) return null;
    return { ...next, active: false, status: FREE_SPIN_STATUSES.COMPLETE };
  }

  function getSessionPhase(session, pendingSpin = null) {
    if (pendingSpin?.spinType === "free") return GAME_STATES.FREE_SPINS;
    if (!session?.active) return pendingSpin ? GAME_STATES.RESOLVING : GAME_STATES.IDLE;
    if ([FREE_SPIN_STATUSES.INTRO, FREE_SPIN_STATUSES.COMPLETE, FREE_SPIN_STATUSES.SUMMARY].includes(session.status)) return GAME_STATES.BONUS;
    return GAME_STATES.FREE_SPINS;
  }

  function getLockedSpinState(session, baseState = {}) {
    return {
      ...baseState,
      lineBetIndex: session.lockedLineBetIndex,
      fortuneMeter: baseState.fortuneMeter ? { ...baseState.fortuneMeter } : { value: 0, charged: false },
    };
  }

  function canStartFeature(session) {
    return Boolean(session?.active && session.status === FREE_SPIN_STATUSES.INTRO && session.remainingSpins > 0);
  }

  function canRunNextSpin(session, pendingSpin = null) {
    return Boolean(session?.active
      && !pendingSpin
      && session.remainingSpins > 0
      && [FREE_SPIN_STATUSES.READY].includes(session.status));
  }

  function getSessionSummary(session) {
    if (!session) return null;
    const mvp = app.reactions.calculateSessionMvp(session.characterWinTotals, { accumulatedWin: session.accumulatedWin });
    return {
      sessionId: session.sessionId,
      completedSpins: session.completedSpins,
      totalAwardedSpins: session.totalAwardedSpins,
      retriggerCount: session.retriggerCount,
      accumulatedWin: session.accumulatedWin,
      mvp,
    };
  }

  app.freeSpins = {
    FREE_SPIN_STATUSES,
    createId,
    getNaturalTreeCells,
    hasTreeOnEveryReel,
    selectTriggerTreeCells,
    createFreeSpinTrigger,
    createFreeSpinSession,
    cloneSession,
    applyFreeSpinSettlement,
    markFreeSpinPresented,
    markSummary,
    closeSession,
    getSessionPhase,
    getLockedSpinState,
    canStartFeature,
    canRunNextSpin,
    getSessionSummary,
  };
})();
