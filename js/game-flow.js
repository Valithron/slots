(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  function routePrimaryAction({ phase, onSpin, onSkip }) {
    if (phase === GAME_STATES.CELEBRATING) { onSkip?.(); return "skipped"; }
    if (phase === GAME_STATES.IDLE) { onSpin?.(); return "spun"; }
    return "ignored";
  }
  function getPresentationTier(spinResult, enabled = CONFIG.features.winTiers) {
    if (!spinResult || spinResult.totalWin <= 0) return "none";
    return enabled ? spinResult.winTier : "small";
  }
  const isLongCelebrationTier = tier => tier === "nice" || tier === "big" || tier === "jackpot";
  function getCountUpDuration(tier, { reducedMotion = false } = {}) {
    const configured = CONFIG.winTiers.countUpDurations[tier] || CONFIG.winTiers.countUpMinimum;
    const bounded = Math.min(CONFIG.winTiers.countUpMaximum, Math.max(CONFIG.winTiers.countUpMinimum, configured));
    return Math.round(bounded * (reducedMotion ? CONFIG.reducedMotion.countUpDurationScale : 1));
  }
  function getCelebrationDuration(tier, { reducedMotion = false } = {}) {
    const configured = CONFIG.winTiers.celebrationDurations[tier] || 0;
    return Math.round(configured * (reducedMotion ? CONFIG.reducedMotion.celebrationDurationScale : 1));
  }
  function getCountUpValue(totalWin, progress) {
    if (!Number.isFinite(totalWin) || totalWin < 0) throw new Error("totalWin must be non-negative.");
    const clamped = Math.min(1, Math.max(0, progress));
    if (clamped === 1) return totalWin;
    return Math.floor(totalWin * (1 - Math.pow(1 - clamped, 3)));
  }
  app.gameFlow = { routePrimaryAction, getPresentationTier, isLongCelebrationTier, getCountUpDuration, getCelebrationDuration, getCountUpValue };
})();
