(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const STACKED_QA_SENTINEL = "__qa-natural-retrigger-plus-four-tokens__";
  const EXTENSION_QA_KEY = "commune-fortune-ally-extension-qa-v1";

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

  function installStackedQaResultPath() {
    if (!app.qa?.enabled || !app.payouts?.createSpinResult || !app.allyMysteryExtensions) return;

    const createSpinResult = app.payouts.createSpinResult;
    app.payouts.createSpinResult = options => {
      const syntheticStack = options?.mysteryAwardModifier === STACKED_QA_SENTINEL;
      const result = createSpinResult(syntheticStack
        ? { ...options, mysteryAwardModifier: "fortune-burst" }
        : options);
      if (!syntheticStack) return result;

      const mysteryAward = app.mystery.createAward(4, {
        id: result.id,
        queue: app.mystery.peekModifierQueue(options.state),
        forcedModifierId: "fortune-burst",
        rng: options.rng || Math.random,
      });
      const withoutOldPlan = {
        ...result,
        freeSpinTrigger: {
          triggered: true,
          retrigger: true,
          awardedSpins: CONFIG.freeSpins.retriggerAward,
          treeCells: [],
          qaSyntheticStack: true,
        },
        mysteryTokenCount: 4,
        mysteryAward: { ...mysteryAward },
      };
      return app.allyMysteryExtensions.attachAllyExtensionPlan(withoutOldPlan, options.state);
    };

    globalThis.document?.addEventListener?.("DOMContentLoaded", () => {
      const consumeSpinOverride = app.qa.consumeSpinOverride;
      app.qa.consumeSpinOverride = options => {
        let flags = {};
        try { flags = JSON.parse(globalThis.sessionStorage?.getItem(EXTENSION_QA_KEY) || "{}") || {}; } catch { flags = {}; }
        if (options?.spinType === "free" && flags.retriggerFour === true) {
          flags.retriggerFour = false;
          globalThis.sessionStorage?.setItem(EXTENSION_QA_KEY, JSON.stringify(flags));
          const match = app.qa.findMysteryCount(4, options);
          return {
            ...match,
            label: "Natural retrigger + 4 Mystery Tokens",
            mysteryAwardModifier: STACKED_QA_SENTINEL,
          };
        }
        return consumeSpinOverride(options);
      };
    }, { once: true });
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

  installStackedQaResultPath();
})();
