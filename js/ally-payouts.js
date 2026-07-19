(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const createBaseResult = app.payouts.createSpinResult;
  const settleBase = app.payouts.settlePendingSpinState;
  const clone = value => structuredClone(value);

  function randomStops(rng = Math.random) {
    return CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
  }

  function createUnmodifiedResult(options, suffix, overrides = {}) {
    return createBaseResult({
      ...options,
      ...overrides,
      id: `${options.id}-${suffix}`,
      targetStops: overrides.targetStops || randomStops(options.rng || Math.random),
      allyBypass: true,
      mysterySkipRescue: true,
    });
  }

  function createWinningReplay(options) {
    const definition = CONFIG.allies.gabi;
    const maximum = definition.parameters.maximumReplayDraws;
    for (let attempt = 1; attempt <= maximum; attempt += 1) {
      const replay = createUnmodifiedResult(options, `eww-${attempt}`);
      if (replay.totalWin > 0) return { replay, attempts: attempt, fallback: false };
    }
    const replay = createUnmodifiedResult(options, "eww-fallback", {
      targetStops: [0, 1, 3],
      featureRolls: { expandingWild: { roll: 0 } },
    });
    return { replay, attempts: maximum, fallback: true };
  }

  function coherentSelectedResult(original, replacement, selected, type, metadata = {}) {
    const chosen = selected === "replacement" ? replacement : original;
    return {
      ...clone(chosen),
      id: original.id,
      createdAt: original.createdAt,
      allyReplay: {
        type,
        originalResult: clone(original),
        replacementResult: clone(replacement),
        selected,
        selectedResultId: chosen.id,
        netImprovement: Math.max(0, chosen.totalWin - original.totalWin),
        ...metadata,
      },
      settlementStatus: "pending",
    };
  }

  function createSpinResult(options) {
    const base = createBaseResult(options);
    if (options.allyBypass || base.spinType !== "free" || !CONFIG.features.allyAbilities) return base;
    const session = options.state?.freeSpinSession;
    const ally = app.allies.normalizeAllyState(session?.ally);
    const definition = app.allies.getDefinition({ ally });
    if (!definition || !ally.confirmed || ally.legacyNoAlly) return base;

    if (definition.id === "ashley" && !ally.ashley.used && base.totalWin === 0) {
      const replacement = createUnmodifiedResult(options, "fastball");
      return coherentSelectedResult(base, replacement, "replacement", "ashley");
    }

    if (definition.id === "gabi" && !ally.gabi.used) {
      const threshold = Math.floor(session.referenceBet * definition.parameters.thresholdMultiplier);
      if (base.totalWin > 0 && base.totalWin < threshold) {
        const generated = createWinningReplay(options);
        const replacement = generated.replay;
        const selected = replacement.totalWin > base.totalWin ? "replacement" : "original";
        return coherentSelectedResult(base, replacement, selected, "gabi", {
          attempts: generated.attempts,
          fallback: generated.fallback,
          threshold,
        });
      }
    }

    return app.allies.applySpinModifier(base, session);
  }

  function settlePendingSpinState(state) {
    const settled = settleBase(state);
    if (!settled) return null;
    const finalization = app.allies.finalizeSession(state);
    if (!finalization.applied) return settled;
    return { ...settled, allyEndBonus: finalization };
  }

  app.allyPayouts = { randomStops, createWinningReplay, coherentSelectedResult };
  app.payouts.createSpinResult = createSpinResult;
  app.payouts.settlePendingSpinState = settlePendingSpinState;
})();
