(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  if (!app?.CONFIG || !app.persistence || !app.payouts || !app.freeSpins) return;
  const { CONFIG, constants } = app;
  const clone = value => value == null ? value : (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const floor = value => Math.max(0, Math.floor(Number(value) || 0));

  CONFIG.fortuneFavor = Object.freeze({
    enabled: true,
    chance: 0.10,
    guaranteedAttempt: 5,
    pityFailureCap: 4,
    startingSpins: CONFIG.freeSpins.startingAward,
  });

  const runtime = {
    currentState: null,
    lastSettledResult: null,
    forcedOutcome: null,
    enabledOverride: null,
  };

  const normalizeFailures = value => Math.min(CONFIG.fortuneFavor.pityFailureCap, floor(value));
  const normalizeRoll = value => Number.isFinite(value) ? Math.min(0.999999999999, Math.max(0, Number(value))) : null;
  const favorEnabled = () => runtime.enabledOverride == null ? CONFIG.fortuneFavor.enabled : runtime.enabledOverride === true;

  function normalizeAttempt(value, sourceSpinId = null) {
    if (!value || typeof value !== "object") return null;
    const pityBefore = normalizeFailures(value.pityBefore);
    const outcome = ["success", "failure", "skipped-natural"].includes(value.outcome) ? value.outcome : null;
    if (!outcome) return null;
    const guaranteed = value.guaranteed === true || value.mode === "guaranteed";
    const mode = outcome === "skipped-natural" ? "skipped-natural" : guaranteed ? "guaranteed" : "random";
    const pityAfter = outcome === "success" ? 0 : outcome === "failure"
      ? Math.min(CONFIG.fortuneFavor.pityFailureCap, pityBefore + 1)
      : pityBefore;
    return {
      version: 1,
      source: "fortune-meter",
      sourceSpinId: typeof value.sourceSpinId === "string" ? value.sourceSpinId : sourceSpinId,
      eligible: value.eligible !== false,
      chargedFortuneSpin: value.chargedFortuneSpin !== false,
      pityBefore,
      attemptNumber: Math.min(CONFIG.fortuneFavor.guaranteedAttempt, Math.max(1, floor(value.attemptNumber) || pityBefore + 1)),
      mode,
      chance: CONFIG.fortuneFavor.chance,
      roll: mode === "random" ? normalizeRoll(value.roll) : null,
      guaranteed: mode === "guaranteed",
      outcome,
      awarded: outcome === "success",
      pityAfter,
      pityIncremented: value.pityIncremented === true,
      pityReset: value.pityReset === true,
      awardApplied: value.awardApplied === true,
      presentationShown: value.presentationShown === true,
      featureStartTransitionCompleted: value.featureStartTransitionCompleted === true,
    };
  }

  function resolveAttempt({ pityFailures = 0, naturalTrigger = false, rng = Math.random, forcedOutcome = null, sourceSpinId = null } = {}) {
    const pityBefore = normalizeFailures(pityFailures);
    const attemptNumber = Math.min(CONFIG.fortuneFavor.guaranteedAttempt, pityBefore + 1);
    if (naturalTrigger) return normalizeAttempt({
      sourceSpinId, pityBefore, attemptNumber, mode: "skipped-natural", outcome: "skipped-natural",
    }, sourceSpinId);

    const guaranteed = pityBefore >= CONFIG.fortuneFavor.pityFailureCap || forcedOutcome === "guaranteed";
    if (guaranteed) return normalizeAttempt({
      sourceSpinId,
      pityBefore,
      attemptNumber: CONFIG.fortuneFavor.guaranteedAttempt,
      mode: "guaranteed",
      guaranteed: true,
      outcome: "success",
    }, sourceSpinId);

    const roll = forcedOutcome === "success" ? 0
      : forcedOutcome === "failure" ? CONFIG.fortuneFavor.chance
        : normalizeRoll(rng());
    return normalizeAttempt({
      sourceSpinId,
      pityBefore,
      attemptNumber,
      mode: "random",
      roll,
      outcome: roll < CONFIG.fortuneFavor.chance ? "success" : "failure",
    }, sourceSpinId);
  }

  function getProgressLabel(value) {
    const failures = normalizeFailures(value);
    return failures >= CONFIG.fortuneFavor.pityFailureCap
      ? "Fortune’s Favor progress complete. The next Fortune Spin guarantees Fortune’s Favor."
      : `Fortune’s Favor progress: ${failures} of ${CONFIG.fortuneFavor.pityFailureCap} failed meter attempts. The next Fortune Spin has a 10 percent Favor chance.`;
  }

  function isQaProbe(options) {
    return options?.allyBypass === true || options?.qaPreview === true || String(options?.id || "").startsWith("qa-probe-");
  }

  function attachAttempt(result, options) {
    if (!favorEnabled() || !result || result.fortuneFavor || isQaProbe(options)) return result;
    if (!["paid", "mystery-free"].includes(result.spinType) || result.fortuneSpin?.active !== true) return result;
    const naturalTrigger = Boolean(result.freeSpinTrigger?.triggered && floor(result.freeSpinTrigger.awardedSpins) > 0);
    const forcedOutcome = app.qa?.enabled ? runtime.forcedOutcome : null;
    if (forcedOutcome) runtime.forcedOutcome = null;
    return {
      ...result,
      fortuneFavor: resolveAttempt({
        pityFailures: options?.state?.fortuneFavorFailures,
        naturalTrigger,
        rng: options?.rng || Math.random,
        forcedOutcome,
        sourceSpinId: result.id,
      }),
    };
  }

  const originalCreateFreeSpinSession = app.freeSpins.createFreeSpinSession;
  function createMeterAwardedSession(settled) {
    const adapter = {
      ...clone(settled),
      freeSpinTrigger: {
        triggered: true,
        type: "fortune-favor-meter",
        awardedSpins: CONFIG.fortuneFavor.startingSpins,
        retrigger: false,
        treeCells: [],
        capped: false,
        source: "fortune-meter",
      },
    };
    const session = originalCreateFreeSpinSession(adapter);
    if (!session) return null;
    session.triggerTreeCells = [];
    session.triggerSource = "fortune-meter";
    session.triggerResult = { ...clone(settled), settlementStatus: "settled" };
    session.fortuneFavor = clone(settled.fortuneFavor);
    return session;
  }

  const originalNormalizePendingSpin = app.persistence.normalizePendingSpin;
  app.persistence.normalizePendingSpin = pending => {
    const normalized = originalNormalizePendingSpin(pending);
    if (normalized) normalized.fortuneFavor = normalizeAttempt(normalized.fortuneFavor, normalized.id);
    return normalized;
  };

  function readStoredFailures() {
    for (const key of [constants.storageKey, ...(constants.legacyStorageKeys || [])]) {
      try {
        const saved = JSON.parse(globalThis.localStorage?.getItem(key) || "null");
        if (saved) return normalizeFailures(saved.fortuneFavorFailures);
      } catch {}
    }
    return 0;
  }

  const originalDefaultState = app.persistence.defaultState;
  app.persistence.defaultState = () => ({ ...originalDefaultState(), fortuneFavorFailures: 0 });

  const originalLoadState = app.persistence.loadState;
  app.persistence.loadState = () => {
    const failures = readStoredFailures();
    const state = originalLoadState();
    state.fortuneFavorFailures = failures;
    if (state.pendingSpin?.fortuneFavor) state.pendingSpin.fortuneFavor = normalizeAttempt(state.pendingSpin.fortuneFavor, state.pendingSpin.id);
    if (state.freeSpinSession?.triggerResult?.fortuneFavor) {
      state.freeSpinSession.triggerResult.fortuneFavor = normalizeAttempt(state.freeSpinSession.triggerResult.fortuneFavor, state.freeSpinSession.triggerResult.id);
    }
    return state;
  };

  const originalSaveState = app.persistence.saveState;
  app.persistence.saveState = state => {
    state.fortuneFavorFailures = normalizeFailures(state.fortuneFavorFailures);
    if (!originalSaveState(state)) return false;
    try {
      const stored = JSON.parse(globalThis.localStorage?.getItem(constants.storageKey) || "null") || {};
      stored.fortuneFavorFailures = state.fortuneFavorFailures;
      if (stored.pendingSpin?.fortuneFavor) stored.pendingSpin.fortuneFavor = normalizeAttempt(stored.pendingSpin.fortuneFavor, stored.pendingSpin.id);
      globalThis.localStorage?.setItem(constants.storageKey, JSON.stringify(stored));
      return true;
    } catch {
      return false;
    }
  };

  app.freeSpins.createFreeSpinSession = (triggerResult, options) => triggerResult?.fortuneFavor?.awarded === true
    && triggerResult.fortuneFavor.source === "fortune-meter"
    ? createMeterAwardedSession(triggerResult)
    : originalCreateFreeSpinSession(triggerResult, options);

  const originalCreateSpinResult = app.payouts.createSpinResult;
  app.payouts.createSpinResult = options => attachAttempt(originalCreateSpinResult(options), options);

  const originalSettlePendingSpinState = app.payouts.settlePendingSpinState;
  app.payouts.settlePendingSpinState = state => {
    const settled = originalSettlePendingSpinState(state);
    if (!settled) return null;
    const attempt = normalizeAttempt(settled.fortuneFavor, settled.id);
    if (!attempt) {
      runtime.lastSettledResult = settled;
      return settled;
    }

    if (attempt.outcome === "failure" && !attempt.pityIncremented) {
      state.fortuneFavorFailures = attempt.pityAfter;
      attempt.pityIncremented = true;
    } else if (attempt.outcome === "success" && !attempt.pityReset) {
      state.fortuneFavorFailures = 0;
      attempt.pityReset = true;
    } else state.fortuneFavorFailures = normalizeFailures(state.fortuneFavorFailures);

    if (attempt.awarded && !attempt.awardApplied) {
      if (!state.freeSpinSession?.active) {
        const session = createMeterAwardedSession({ ...settled, fortuneFavor: attempt });
        if (session) {
          state.freeSpinSession = session;
          attempt.awardApplied = true;
          attempt.featureStartTransitionCompleted = true;
        }
      } else if (state.freeSpinSession.triggerSpinId === settled.id) {
        attempt.awardApplied = true;
        attempt.featureStartTransitionCompleted = true;
      }
    }

    const finalSettled = { ...settled, fortuneFavor: attempt };
    if (state.freeSpinSession?.triggerSpinId === settled.id) {
      state.freeSpinSession.triggerResult = { ...clone(finalSettled), settlementStatus: "settled" };
      state.freeSpinSession.fortuneFavor = clone(attempt);
    }
    runtime.lastSettledResult = finalSettled;
    return finalSettled;
  };

  app.fortuneFavor = {
    config: CONFIG.fortuneFavor,
    runtime,
    normalizeFailures,
    normalizeAttempt,
    resolveAttempt,
    getProgressLabel,
    favorEnabled,
    setEnabledForSimulation(value = null) { runtime.enabledOverride = value == null ? null : value === true; },
    attachAttempt,
  };
})();