(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const core = app.strongMysteryCore;
  const {
    STRONG_IDS,
    CHAOS_EFFECTS,
    runtime,
    clone,
    floor,
    isStrongId,
    randomIndex,
    createStrongInstance,
    normalizeStrongInstance,
    normalizeStrongQueue,
    migrateStrongQueue,
    strongLabel,
    applyStrongToCoherentAllyResult,
    trulyBlank,
    coherentRescue,
  } = core;

  function installCore() {
    if (app.strongMystery?.installed || !app.mystery || !app.payouts) return false;

    CONFIG.mystery.strongModifierPool = [...STRONG_IDS];

    const originalNormalizeState = app.mystery.normalizeState;
    const originalCreateState = app.mystery.createState;
    const originalGetQueueDisplay = app.mystery.getQueueDisplay;
    const originalQueueModifier = app.mystery.queueModifier;
    const originalClearQueue = app.mystery.clearQueue;
    const originalQueueFreeSpins = app.mystery.queueFreeSpins;
    const originalSetQueuedFreeSpins = app.mystery.setQueuedFreeSpins;
    const originalHasQueuedFreeSpin = app.mystery.hasQueuedFreeSpin;
    const originalPeekModifierQueue = app.mystery.peekModifierQueue;
    const originalCommit = app.mystery.commitSpinStart;
    const originalCreateResult = app.payouts.createSpinResult;
    const originalSettle = app.payouts.settlePendingSpinState;

    app.mystery.createState = () => ({ ...originalCreateState(), strongModifierQueue: [] });
    app.mystery.normalizeState = value => {
      const normalized = originalNormalizeState(value);
      normalized.strongModifierQueue = normalizeStrongQueue(value?.strongModifierQueue);
      const holder = { mystery: normalized };
      migrateStrongQueue(holder);
      return holder.mystery;
    };

    const preserveStrongQueue = (state, operation) => {
      if (!state?.mystery) return operation();
      migrateStrongQueue(state);
      const strongQueue = normalizeStrongQueue(state.mystery.strongModifierQueue);
      const result = operation();
      state.mystery.strongModifierQueue = normalizeStrongQueue(strongQueue);
      return result;
    };

    app.mystery.queueFreeSpins = (state, amount) => preserveStrongQueue(state, () => originalQueueFreeSpins(state, amount));
    app.mystery.setQueuedFreeSpins = (state, amount) => preserveStrongQueue(state, () => originalSetQueuedFreeSpins(state, amount));
    app.mystery.hasQueuedFreeSpin = state => preserveStrongQueue(state, () => originalHasQueuedFreeSpin(state));
    app.mystery.peekModifierQueue = state => preserveStrongQueue(state, () => originalPeekModifierQueue(state));

    app.mystery.clearQueue = state => {
      const cleared = originalClearQueue(state);
      if (state?.mystery) state.mystery.strongModifierQueue = [];
      return cleared;
    };

    app.mystery.queueModifier = (state, modifier) => {
      if (!isStrongId(modifier?.id)) {
        return preserveStrongQueue(state, () => originalQueueModifier(state, modifier));
      }
      const forced = runtime.qaQueuedSelection || modifier.selectionPayload || {};
      const instance = createStrongInstance(
        { ...modifier, selectionPayload: forced },
        modifier.awardSourceSpinId || `manual-${Date.now()}`,
        modifier.rng || Math.random,
        forced,
      );
      return app.mystery.queueStrongModifier(state, instance);
    };

    app.mystery.getQueueDisplay = state => {
      const normal = preserveStrongQueue(state, () => originalGetQueueDisplay(state));
      const strongQueue = normalizeStrongQueue(state?.mystery?.strongModifierQueue).map(instance => ({
        ...clone(instance),
        label: strongLabel(instance),
        accent: CONFIG.characterAccentColorMap.MYS,
        strong: true,
      }));
      return [...normal, ...strongQueue];
    };

    app.mystery.getStrongQueue = state => normalizeStrongQueue(state?.mystery?.strongModifierQueue);
    app.mystery.queueStrongModifier = (state, instance) => {
      if (!state?.mystery) return [];
      const normalized = normalizeStrongInstance(instance, instance?.awardSourceSpinId || "queued");
      if (!normalized) return app.mystery.getStrongQueue(state);
      const queue = migrateStrongQueue(state);
      if (!queue.some(item => item.instanceId === normalized.instanceId)) queue.push(normalized);
      state.mystery.strongModifierQueue = normalizeStrongQueue(queue);
      return clone(state.mystery.strongModifierQueue);
    };

    app.mystery.normalizeStrongInstance = normalizeStrongInstance;
    app.mystery.createStrongInstance = createStrongInstance;
    app.mystery.getStrongModifierLabel = strongLabel;
    app.mystery.STRONG_MODIFIER_IDS = STRONG_IDS;
    app.mystery.CHAOS_EFFECT_IDS = CHAOS_EFFECTS;

    app.mystery.commitSpinStart = (state, spinResult) => {
      migrateStrongQueue(state);
      const queuedBefore = normalizeStrongQueue(state.mystery.strongModifierQueue);
      const consumed = normalizeStrongQueue(spinResult?.strongMysteryActiveModifiers);
      const committed = originalCommit(state, spinResult);
      if (!committed) {
        state.mystery.strongModifierQueue = queuedBefore;
        return false;
      }
      const consumedIds = new Set(consumed.map(item => item.instanceId));
      state.mystery.strongModifierQueue = queuedBefore.filter(item => !consumedIds.has(item.instanceId));
      spinResult.strongMysteryConsumption = {
        committed: true,
        modifiersConsumed: consumed.map(item => ({ ...item, consumptionStatus: "consumed" })),
      };
      return true;
    };

    app.payouts.createSpinResult = options => {
      migrateStrongQueue(options.state);
      const active = normalizeStrongQueue(
        options.strongMysteryModifiers ?? options.state?.mystery?.strongModifierQueue,
      );
      const normalModifiers = (
        options.mysteryModifiers ?? options.state?.mystery?.modifierQueue ?? []
      ).filter(item => !isStrongId(item?.id));
      const rescueStacks = normalModifiers
        .filter(item => item.id === "rescue-spin")
        .reduce((sum, item) => sum + floor(item.stacks || 1), 0);
      const withoutRescue = normalModifiers.filter(item => item.id !== "rescue-spin");
      const rawOptions = { ...options, mysteryModifiers: withoutRescue, mysterySkipRescue: true };
      const original = applyStrongToCoherentAllyResult(
        originalCreateResult(rawOptions),
        active,
        rawOptions,
        0,
      );
      const attemptsAllowed = options.mysterySkipRescue
        ? 0
        : Math.min(2, rescueStacks) + floor(original.strongMysteryRescueAttempts);
      const replacements = [];
      let current = original;
      for (let attempt = 0; attempt < attemptsAllowed && trulyBlank(current); attempt += 1) {
        const targetStops = options.mysteryRescueStops?.[attempt]
          || CONFIG.reels.map(reel => randomIndex(reel.length, options.rng || Math.random));
        const candidateOptions = {
          ...rawOptions,
          id: `${options.id}-strong-rescue-${attempt + 1}`,
          targetStops,
          featureRolls: options.mysteryRescueFeatureRolls?.[attempt],
          allyBypass: options.allyBypass,
        };
        current = applyStrongToCoherentAllyResult(
          originalCreateResult(candidateOptions),
          active,
          candidateOptions,
          attempt + 1,
        );
        replacements.push(current);
      }
      const selectedResult = attemptsAllowed
        ? coherentRescue(original, replacements, attemptsAllowed)
        : original;
      runtime.qaForcedAwardSelection = null;
      return selectedResult;
    };

    app.payouts.settlePendingSpinState = state => {
      migrateStrongQueue(state);
      const queuedBefore = normalizeStrongQueue(state.mystery?.strongModifierQueue);
      const settled = originalSettle(state);
      if (!settled) {
        if (state?.mystery) state.mystery.strongModifierQueue = queuedBefore;
        return null;
      }

      const awarded = settled.mysteryAward?.modifier;
      state.mystery.strongModifierQueue = queuedBefore;
      if (isStrongId(awarded?.id)) {
        state.mystery.modifierQueue = (state.mystery.modifierQueue || [])
          .filter(item => !isStrongId(item?.id));
      }
      migrateStrongQueue(state);
      if (isStrongId(awarded?.id)) app.mystery.queueStrongModifier(state, awarded);

      const floorTarget = floor(settled.strongMysteryGlobal?.meterFloor);
      if (floorTarget > 0 && floor(state.fortuneMeter?.value) < floorTarget) {
        state.fortuneMeter = {
          value: floorTarget,
          charged: floorTarget >= CONFIG.fortuneMeter.capacity,
        };
      }

      const finalSettled = {
        ...settled,
        fortuneMeterAfterSettlement: app.payouts.normalizeFortuneMeter(state.fortuneMeter),
        strongMysterySettlement: {
          consumed: clone(settled.strongMysteryActiveModifiers || []),
          awarded: isStrongId(awarded?.id) ? clone(awarded) : null,
          queue: app.mystery.getStrongQueue(state),
        },
      };
      if (state.freeSpinSession?.presentationSpin?.id === settled.id) {
        state.freeSpinSession.presentationSpin = {
          ...clone(finalSettled),
          settlementStatus: "settled",
        };
      }
      if (state.freeSpinSession?.lastResult?.id === settled.id) {
        state.freeSpinSession.lastResult = {
          ...clone(finalSettled),
          settlementStatus: "settled",
        };
      }
      return finalSettled;
    };

    core.coreInstalled = true;
    return true;
  }

  core.installCore = installCore;
})();
