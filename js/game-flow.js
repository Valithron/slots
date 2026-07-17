(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;

  function routePrimaryAction({
    phase,
    freeSpinStatus = null,
    reelsMoving = phase === GAME_STATES.SPINNING,
    manualStopsEnabled = false,
    onSpin,
    onStop,
    onSkip,
    onStart,
    onContinue,
  }) {
    if (phase === GAME_STATES.CELEBRATING) {
      onSkip?.();
      return "skipped";
    }
    if (phase === GAME_STATES.BONUS) {
      if (freeSpinStatus === app.freeSpins?.FREE_SPIN_STATUSES?.INTRO) {
        onStart?.();
        return "started";
      }
      if ([app.freeSpins?.FREE_SPIN_STATUSES?.SUMMARY, app.freeSpins?.FREE_SPIN_STATUSES?.COMPLETE].includes(freeSpinStatus)) {
        onContinue?.();
        return "continued";
      }
      return "ignored";
    }
    if (phase === GAME_STATES.FREE_SPINS) {
      if (reelsMoving && manualStopsEnabled) {
        const accepted = onStop?.();
        return accepted === false ? "stop-ignored" : "stop-requested";
      }
      if (freeSpinStatus === app.freeSpins?.FREE_SPIN_STATUSES?.PRESENTING) {
        onSkip?.();
        return "skipped";
      }
      return "ignored";
    }
    if (phase === GAME_STATES.SPINNING && manualStopsEnabled) {
      const accepted = onStop?.();
      return accepted === false ? "stop-ignored" : "stop-requested";
    }
    if (phase === GAME_STATES.IDLE) {
      onSpin?.();
      return "spun";
    }
    return "ignored";
  }

  function getPrimaryActionMode({
    phase,
    freeSpinStatus = null,
    reelsMoving = phase === GAME_STATES.SPINNING,
    manualStopsEnabled = false,
    nextStopIndex = null,
  }) {
    if (phase === GAME_STATES.CELEBRATING) return "skip";
    if (phase === GAME_STATES.BONUS) {
      if (freeSpinStatus === app.freeSpins?.FREE_SPIN_STATUSES?.INTRO) return "start";
      if ([app.freeSpins?.FREE_SPIN_STATUSES?.SUMMARY, app.freeSpins?.FREE_SPIN_STATUSES?.COMPLETE].includes(freeSpinStatus)) return "continue";
      return "disabled";
    }
    if (phase === GAME_STATES.FREE_SPINS) {
      if (reelsMoving && manualStopsEnabled) return nextStopIndex === null ? "stop-disabled" : "stop";
      if (freeSpinStatus === app.freeSpins?.FREE_SPIN_STATUSES?.PRESENTING) return "skip";
      return "disabled";
    }
    if (phase === GAME_STATES.SPINNING && manualStopsEnabled) return nextStopIndex === null ? "stop-disabled" : "stop";
    return phase === GAME_STATES.IDLE ? "spin" : "disabled";
  }

  function getStopAriaLabel(reelIndex) {
    return Number.isInteger(reelIndex) ? `Stop reel ${reelIndex + 1}` : "All reel stops requested";
  }

  function getPresentationTier(spinResult, enabled = CONFIG.features.winTiers) {
    if (!spinResult || spinResult.totalWin <= 0) return "none";
    return enabled ? spinResult.winTier : "small";
  }

  const isLongCelebrationTier = tier => tier === "nice" || tier === "big" || tier === "jackpot";

  function getCountUpDuration(tier, { reducedMotion = false, compact = false } = {}) {
    const configured = CONFIG.winTiers.countUpDurations[tier] || CONFIG.winTiers.countUpMinimum;
    const bounded = Math.min(CONFIG.winTiers.countUpMaximum, Math.max(CONFIG.winTiers.countUpMinimum, configured));
    const compactScale = compact ? 0.45 : 1;
    return Math.round(bounded * compactScale * (reducedMotion ? CONFIG.reducedMotion.countUpDurationScale : 1));
  }

  function getCelebrationDuration(tier, { reducedMotion = false, compact = false } = {}) {
    if (compact) {
      const configured = tier === "big" || tier === "jackpot"
        ? CONFIG.characterPresentation.durations.compactBig
        : CONFIG.characterPresentation.durations.compactNice;
      return reducedMotion ? CONFIG.characterPresentation.durations.reducedCompact : configured;
    }
    const configured = CONFIG.winTiers.celebrationDurations[tier] || 0;
    return Math.round(configured * (reducedMotion ? CONFIG.reducedMotion.celebrationDurationScale : 1));
  }

  function getCountUpValue(totalWin, progress) {
    if (!Number.isFinite(totalWin) || totalWin < 0) throw new Error("totalWin must be non-negative.");
    const clamped = Math.min(1, Math.max(0, progress));
    if (clamped === 1) return totalWin;
    return Math.floor(totalWin * (1 - Math.pow(1 - clamped, 3)));
  }

  app.gameFlow = {
    routePrimaryAction,
    getPrimaryActionMode,
    getStopAriaLabel,
    getPresentationTier,
    isLongCelebrationTier,
    getCountUpDuration,
    getCelebrationDuration,
    getCountUpValue,
  };
})();
