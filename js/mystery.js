(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const createBaseResult = app.payouts.createSpinResult;
  const settleBase = app.payouts.settlePendingSpinState;
  const clone = value => value == null ? value : structuredClone(value);
  const floor = value => Math.max(0, Math.floor(Number(value) || 0));
  const MODIFIER_NAMES = Object.freeze({
    spotlight: "Spotlight",
    "center-tree": "Center Tree",
    "double-commune": "Double Commune",
    "rescue-spin": "Rescue Spin",
    "fortune-burst": "Fortune Burst",
  });

  function allModifierIds() {
    return [...new Set([
      ...(CONFIG.mystery.normalModifierPool || []),
      ...(CONFIG.mystery.strongModifierPool || []),
    ])];
  }

  function modifierKey(modifier) {
    return modifier?.id === "spotlight"
      ? `${modifier.id}:${modifier.characterKey || ""}`
      : modifier?.id || "";
  }

  function normalizeModifier(modifier) {
    if (!modifier || !allModifierIds().includes(modifier.id)) return null;
    const cap = Math.max(1, floor(CONFIG.mystery.modifierCaps[modifier.id]) || 1);
    const normalized = {
      id: modifier.id,
      name: MODIFIER_NAMES[modifier.id] || modifier.name || modifier.id,
      stacks: Math.min(cap, Math.max(1, floor(modifier.stacks) || 1)),
    };
    if (modifier.id === "spotlight") {
      normalized.characterKey = CONFIG.characterPresentation.allMembers.includes(modifier.characterKey)
        ? modifier.characterKey
        : CONFIG.characterPresentation.allMembers[0];
      normalized.characterName = CONFIG.symbols[normalized.characterKey]?.name || normalized.characterKey;
    }
    if (modifier.requestedTier === "strong") normalized.requestedTier = "strong";
    if (modifier.actualTier) normalized.actualTier = modifier.actualTier;
    if (modifier.fallbackFromStrong === true) normalized.fallbackFromStrong = true;
    return normalized;
  }

  function mergeModifier(queue, modifier) {
    const normalized = normalizeModifier(modifier);
    if (!normalized) return queue;
    const key = modifierKey(normalized);
    const existing = queue.find(item => modifierKey(item) === key);
    if (!existing) {
      queue.push(normalized);
      return queue;
    }
    const cap = Math.max(1, floor(CONFIG.mystery.modifierCaps[normalized.id]) || 1);
    existing.stacks = Math.min(cap, existing.stacks + normalized.stacks);
    existing.fallbackFromStrong ||= normalized.fallbackFromStrong === true;
    existing.requestedTier ||= normalized.requestedTier;
    existing.actualTier ||= normalized.actualTier;
    return queue;
  }

  function normalizeModifierQueue(queue) {
    const normalized = [];
    if (Array.isArray(queue)) queue.forEach(modifier => mergeModifier(normalized, modifier));
    return normalized;
  }

  function createState() {
    return {
      queuedFreeSpins: 0,
      modifierQueue: [],
      appliedAwardIds: [],
      lastAward: null,
    };
  }

  function normalizeState(value) {
    const maximum = CONFIG.mystery.maximumQueuedFreeSpins;
    return {
      queuedFreeSpins: Math.min(maximum, floor(value?.queuedFreeSpins)),
      modifierQueue: normalizeModifierQueue(value?.modifierQueue),
      appliedAwardIds: Array.isArray(value?.appliedAwardIds)
        ? value.appliedAwardIds.filter(id => typeof id === "string").slice(-64)
        : [],
      lastAward: value?.lastAward && typeof value.lastAward === "object" ? clone(value.lastAward) : null,
    };
  }

  function ensureState(state) {
    if (!state) return createState();
    state.mystery = normalizeState(state.mystery);
    return state.mystery;
  }

  function queueModifier(state, modifier) {
    const mystery = ensureState(state);
    mergeModifier(mystery.modifierQueue, modifier);
    return clone(mystery.modifierQueue);
  }

  function queueFreeSpins(state, amount = 1) {
    const mystery = ensureState(state);
    const before = mystery.queuedFreeSpins;
    mystery.queuedFreeSpins = Math.min(CONFIG.mystery.maximumQueuedFreeSpins, before + floor(amount));
    return {
      before,
      after: mystery.queuedFreeSpins,
      awarded: mystery.queuedFreeSpins - before,
      capped: mystery.queuedFreeSpins - before < floor(amount),
    };
  }

  function setQueuedFreeSpins(state, amount) {
    const mystery = ensureState(state);
    mystery.queuedFreeSpins = Math.min(CONFIG.mystery.maximumQueuedFreeSpins, floor(amount));
    return mystery.queuedFreeSpins;
  }

  function clearQueue(state) {
    const mystery = ensureState(state);
    mystery.queuedFreeSpins = 0;
    mystery.modifierQueue = [];
    mystery.lastAward = null;
    return mystery;
  }

  function hasQueuedFreeSpin(state) {
    return ensureState(state).queuedFreeSpins > 0;
  }

  function peekModifierQueue(state) {
    return clone(ensureState(state).modifierQueue);
  }

  function commitSpinStart(state, spinResult) {
    if (!state || !spinResult || !["paid", "free", "mystery-free"].includes(spinResult.spinType)) return false;
    const mystery = ensureState(state);
    const activeModifiers = normalizeModifierQueue(spinResult.mysteryActiveModifiers);
    const ticketConsumed = spinResult.spinType === "mystery-free";
    if (ticketConsumed && mystery.queuedFreeSpins <= 0) return false;
    if (ticketConsumed) mystery.queuedFreeSpins -= 1;
    if (spinResult.mysteryModifiersEnabled !== false) mystery.modifierQueue = [];
    spinResult.mysteryConsumption = {
      ticketConsumed,
      modifiersConsumed: clone(activeModifiers),
      committed: true,
    };
    return true;
  }

  function countTokens(matrix) {
    const cells = [];
    (matrix || []).forEach((row, rowIndex) => (row || []).forEach((symbolKey, reelIndex) => {
      if (symbolKey === CONFIG.mystery.symbolKey) cells.push({ row: rowIndex, reel: reelIndex });
    }));
    return { count: cells.length, cells };
  }

  function randomIndex(length, rng = Math.random) {
    return Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
  }

  function existingStacks(queue, id, characterKey = null) {
    const match = normalizeModifierQueue(queue).find(item => item.id === id
      && (id !== "spotlight" || item.characterKey === characterKey));
    return match?.stacks || 0;
  }

  function canAwardModifier(id, queue) {
    const cap = CONFIG.mystery.modifierCaps[id] || 1;
    if (id !== "spotlight") return existingStacks(queue, id) < cap;
    return CONFIG.characterPresentation.allMembers.some(characterKey => existingStacks(queue, id, characterKey) < cap);
  }

  function chooseSpotlightCharacter(queue, rng, forcedCharacterKey = null) {
    const members = CONFIG.characterPresentation.allMembers;
    if (members.includes(forcedCharacterKey)) return forcedCharacterKey;
    const cap = CONFIG.mystery.modifierCaps.spotlight;
    const available = members.filter(characterKey => existingStacks(queue, "spotlight", characterKey) < cap);
    const pool = available.length ? available : members;
    return pool[randomIndex(pool.length, rng)];
  }

  function chooseModifier({ tier = "normal", queue = [], rng = Math.random, forcedId = null, forcedSpotlight = null } = {}) {
    const requestedTier = tier === "strong" ? "strong" : "normal";
    const configuredPool = requestedTier === "strong" ? CONFIG.mystery.strongModifierPool : CONFIG.mystery.normalModifierPool;
    const fallbackFromStrong = requestedTier === "strong" && configuredPool.length === 0;
    const actualTier = fallbackFromStrong ? "normal" : requestedTier;
    const basePool = fallbackFromStrong ? CONFIG.mystery.normalModifierPool : configuredPool;
    const forcedAllowed = basePool.includes(forcedId);
    const eligible = basePool.filter(id => canAwardModifier(id, queue));
    const pool = eligible.length ? eligible : basePool;
    if (!pool.length) return null;
    const id = forcedAllowed ? forcedId : pool[randomIndex(pool.length, rng)];
    const modifier = {
      id,
      name: MODIFIER_NAMES[id] || id,
      stacks: 1,
      requestedTier,
      actualTier,
      fallbackFromStrong,
    };
    if (id === "spotlight") {
      modifier.characterKey = chooseSpotlightCharacter(queue, rng, forcedSpotlight);
      modifier.characterName = CONFIG.symbols[modifier.characterKey].name;
    }
    return modifier;
  }

  function createAward(count, {
    id,
    queue = [],
    rng = Math.random,
    forcedModifierId = null,
    forcedSpotlight = null,
  } = {}) {
    const safeCount = floor(count);
    const award = {
      id: `${id}:mystery-award`,
      tokenCount: safeCount,
      fortunePoints: 0,
      freeSpinsRequested: 0,
      modifier: null,
      requestedModifierTier: null,
      strongFallback: false,
    };
    if (safeCount === 2) {
      award.fortunePoints = CONFIG.mystery.rewards.twoTokenFortune;
      award.requestedModifierTier = "normal";
    } else if (safeCount === 3) {
      award.freeSpinsRequested = CONFIG.mystery.rewards.threeTokenFreeSpins;
      award.requestedModifierTier = "normal";
    } else if (safeCount >= 4) {
      award.freeSpinsRequested = CONFIG.mystery.rewards.fourPlusFreeSpins;
      award.requestedModifierTier = "strong";
    }
    if (award.requestedModifierTier) {
      award.modifier = chooseModifier({
        tier: award.requestedModifierTier,
        queue,
        rng,
        forcedId: forcedModifierId,
        forcedSpotlight,
      });
      award.strongFallback = award.modifier?.fallbackFromStrong === true;
    }
    return award;
  }

  function spotlightMultipliers(modifiers) {
    return Object.fromEntries(modifiers
      .filter(modifier => modifier.id === "spotlight")
      .map(modifier => [modifier.characterKey, Math.min(4, 1 + modifier.stacks)]));
  }

  function applyPayoutModifiers(baseResult, activeModifiers, state, featureFlags = CONFIG.features) {
    const modifiers = normalizeModifierQueue(activeModifiers);
    const centerTree = modifiers.find(modifier => modifier.id === "center-tree");
    const doubleCommune = modifiers.find(modifier => modifier.id === "double-commune");
    const fortuneBurst = modifiers.find(modifier => modifier.id === "fortune-burst");
    const resolvedMatrix = app.payouts.cloneMatrix(baseResult.resolvedMatrix);
    const transformations = clone(baseResult.transformations) || [];
    const centerRow = CONFIG.expandingWild.rowIndex;
    const centerReel = CONFIG.expandingWild.reelIndex;
    let centerTreeCreated = false;
    let centerTreeBlockedBy = null;
    if (centerTree) {
      const current = resolvedMatrix?.[centerRow]?.[centerReel];
      if (![CONFIG.expandingWild.symbolKey, CONFIG.mystery.symbolKey].includes(current)) {
        resolvedMatrix[centerRow][centerReel] = CONFIG.expandingWild.symbolKey;
        centerTreeCreated = true;
      } else {
        centerTreeBlockedBy = current;
      }
      transformations.push({
        type: "center-tree",
        symbolKey: CONFIG.expandingWild.symbolKey,
        rowIndex: centerRow,
        reelIndex: centerReel,
        created: centerTreeCreated,
        blockedBy: centerTreeBlockedBy,
      });
    }

    const spotlights = spotlightMultipliers(modifiers);
    const lineWins = app.payouts.evaluateWins(resolvedMatrix, state).map(win => {
      const multiplier = spotlights[win.symbolKey] || 1;
      return {
        ...win,
        basePayout: win.payout,
        mysteryMultiplier: multiplier,
        payout: Math.floor(win.payout * multiplier),
      };
    });
    const communeMultiplier = doubleCommune ? Math.min(4, 1 + doubleCommune.stacks) : 1;
    const combinationWins = (baseResult.combinationWins || []).map(win => ({
      ...win,
      baseName: win.baseName || win.name,
      name: communeMultiplier === 1
        ? win.name
        : communeMultiplier === 2
          ? `${win.name} · Double Commune`
          : `${win.name} · Commune ${communeMultiplier}×`,
      basePayout: win.payout,
      mysteryMultiplier: communeMultiplier,
      payout: Math.floor(win.payout * communeMultiplier),
    }));
    const lineWinTotal = lineWins.reduce((sum, win) => sum + win.payout, 0);
    const combinationWinTotal = combinationWins.reduce((sum, win) => sum + win.payout, 0);
    const preMysteryModifierWin = baseResult.lineWinTotal + baseResult.combinationWinTotal;
    const preModifierWin = lineWinTotal + combinationWinTotal;
    const fortuneSpin = clone(baseResult.fortuneSpin);
    const totalWin = fortuneSpin.active ? Math.floor(preModifierWin * fortuneSpin.multiplier) : preModifierWin;
    const fortuneBonus = totalWin - preModifierWin;
    const naturalWinTier = app.payouts.classifyWinTier(preModifierWin, baseResult.referenceBet);
    const fortuneMeterAward = app.payouts.createFortuneMeterAward({
      paidSpin: baseResult.spinType === "paid",
      eligibleSpin: baseResult.spinType !== "free",
      naturalWinTier,
      combinationWins,
      enabled: Boolean(featureFlags.fortuneMeter),
    });
    const fortuneBurstPoints = fortuneBurst
      ? fortuneBurst.stacks * (totalWin > 0 ? CONFIG.mystery.fortuneBurst.win : CONFIG.mystery.fortuneBurst.loss)
      : 0;
    fortuneMeterAward.fortuneBurstPoints = fortuneBurstPoints;
    fortuneMeterAward.mysteryTokenPoints = 0;
    fortuneMeterAward.totalPoints += fortuneBurstPoints;
    const applied = modifiers.map(modifier => ({
      ...clone(modifier),
      multiplier: ["spotlight", "double-commune"].includes(modifier.id) ? Math.min(4, 1 + modifier.stacks) : null,
      fortunePoints: modifier.id === "fortune-burst" ? fortuneBurstPoints : 0,
    }));
    if (fortuneSpin.active) applied.push({
      id: "fortune-spin",
      name: "Fortune Spin",
      multiplier: fortuneSpin.multiplier,
      baseWin: preModifierWin,
      bonusWin: fortuneBonus,
      finalWin: totalWin,
    });
    const result = {
      ...baseResult,
      resolvedMatrix,
      transformations,
      lineWins,
      combinationWins,
      modifiers: applied,
      mysteryActiveModifiers: clone(modifiers),
      mysterySpotlights: clone(spotlights),
      centerTree: centerTree ? { created: centerTreeCreated, blockedBy: centerTreeBlockedBy } : null,
      baseLineWinTotal: baseResult.baseLineWinTotal,
      lineWinTotal,
      combinationWinTotal,
      preMysteryModifierWin,
      preModifierWin,
      fortuneMeterAward,
      fortuneBurstPoints,
      fortuneBonus,
      naturalWinTier,
      totalWin,
      finalWinTier: app.payouts.classifyWinTier(totalWin, baseResult.referenceBet),
    };
    result.winTier = result.finalWinTier;
    result.anticipation = app.payouts.classifyAnticipation(result, { enabled: Boolean(featureFlags.spinDrama) });
    return result;
  }

  function randomStops(rng = Math.random) {
    return CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
  }

  function buildCandidate(options, targetStops, id, featureRolls) {
    const featureFlags = options.featureFlags || CONFIG.features;
    const base = createBaseResult({
      ...options,
      targetStops,
      id,
      featureRolls,
    });
    return applyPayoutModifiers(base, options.mysteryModifiers, options.state, featureFlags);
  }

  function coherentRescueResult(original, replacements, selected) {
    const chosen = selected === "original" ? original : replacements.at(-1);
    return {
      ...clone(chosen),
      id: original.id,
      createdAt: original.createdAt,
      mysteryRescue: {
        attemptsAllowed: Math.min(2, original.mysteryActiveModifiers.find(item => item.id === "rescue-spin")?.stacks || 0),
        attemptsUsed: replacements.length,
        originalResult: clone(original),
        replacementResults: clone(replacements),
        selected,
        selectedResultId: chosen.id,
        rescued: original.totalWin === 0 && chosen.totalWin > 0,
        expiredUnused: replacements.length === 0 && original.totalWin > 0,
      },
      settlementStatus: "pending",
    };
  }

  function attachAward(result, options, rng) {
    const featureFlags = options.featureFlags || CONFIG.features;
    const tokenResult = featureFlags.scatters
      ? countTokens(result.originalMatrix)
      : { count: 0, cells: [] };
    const award = createAward(tokenResult.count, {
      id: result.id,
      queue: options.state?.mystery?.modifierQueue,
      rng,
      forcedModifierId: options.mysteryAwardModifier,
      forcedSpotlight: options.mysteryAwardSpotlight,
    });
    if (!featureFlags.mysteryModifiers) {
      award.modifier = null;
      award.strongFallback = false;
    }
    const fortuneMeterAward = clone(result.fortuneMeterAward) || app.payouts.createFortuneMeterAward({ enabled: false });
    fortuneMeterAward.mysteryTokenPoints = award.fortunePoints;
    fortuneMeterAward.totalPoints = floor(fortuneMeterAward.totalPoints) + award.fortunePoints;
    return {
      ...result,
      mysteryTokenCount: tokenResult.count,
      mysteryTokenCells: tokenResult.cells,
      scatterWins: tokenResult.count ? [{ symbolKey: CONFIG.mystery.symbolKey, count: tokenResult.count, payout: 0, cells: tokenResult.cells }] : [],
      mysteryAward: award,
      mysteryModifiersEnabled: Boolean(featureFlags.mysteryModifiers),
      fortuneMeterAward,
    };
  }

  function createSpinResult(options) {
    const rng = options.rng || Math.random;
    const featureFlags = options.featureFlags || CONFIG.features;
    const activeModifiers = featureFlags.mysteryModifiers
      ? normalizeModifierQueue(options.mysteryModifiers ?? options.state?.mystery?.modifierQueue)
      : [];
    const common = { ...options, mysteryModifiers: activeModifiers };
    const original = buildCandidate(common, options.targetStops, options.id, options.featureRolls);
    const rescue = activeModifiers.find(modifier => modifier.id === "rescue-spin");
    const attemptsAllowed = options.mysterySkipRescue ? 0 : Math.min(2, rescue?.stacks || 0);
    const replacements = [];
    let selected = "original";
    let current = original;
    for (let attempt = 0; attempt < attemptsAllowed && current.totalWin === 0; attempt += 1) {
      const forcedStops = options.mysteryRescueStops?.[attempt];
      const targetStops = Array.isArray(forcedStops) ? forcedStops : randomStops(rng);
      const replacement = buildCandidate(
        { ...common, mysterySkipRescue: true },
        targetStops,
        `${options.id}-mystery-rescue-${attempt + 1}`,
        options.mysteryRescueFeatureRolls?.[attempt],
      );
      replacements.push(replacement);
      current = replacement;
      selected = "replacement";
    }
    const coherent = rescue && !options.mysterySkipRescue
      ? coherentRescueResult(original, replacements, selected)
      : original;
    return attachAward(coherent, common, rng);
  }

  function applyMysterySettlement(state, settled) {
    const mystery = ensureState(state);
    const award = settled?.mysteryAward;
    if (!award?.id) return { applied: false, tokenCount: settled?.mysteryTokenCount || 0 };
    if (mystery.appliedAwardIds.includes(award.id)) return { applied: false, duplicate: true, tokenCount: award.tokenCount };
    mystery.appliedAwardIds.push(award.id);
    mystery.appliedAwardIds = mystery.appliedAwardIds.slice(-64);
    if (award.modifier) mergeModifier(mystery.modifierQueue, award.modifier);
    const freeSpinAward = queueFreeSpins(state, award.freeSpinsRequested);
    const settlement = {
      applied: true,
      tokenCount: award.tokenCount,
      fortunePoints: award.fortunePoints,
      fortuneBurstPoints: settled.fortuneBurstPoints || 0,
      modifier: clone(award.modifier),
      strongFallback: award.strongFallback === true,
      freeSpinsRequested: award.freeSpinsRequested,
      freeSpinsAwarded: freeSpinAward.awarded,
      queuedFreeSpins: state.mystery.queuedFreeSpins,
      capped: freeSpinAward.capped,
      modifierQueue: clone(state.mystery.modifierQueue),
    };
    ensureState(state).lastAward = { ...clone(settlement), spinId: settled.id };
    return settlement;
  }

  function settlePendingSpinState(state) {
    const settled = settleBase(state);
    if (!settled) return null;
    const mysterySettlement = applyMysterySettlement(state, settled);
    const finalSettled = {
      ...settled,
      mysteryAward: settled.mysteryAward ? { ...clone(settled.mysteryAward), applied: mysterySettlement.applied } : null,
      mysterySettlement,
      fortuneMeterAfterSettlement: app.payouts.normalizeFortuneMeter(state.fortuneMeter),
    };
    if (state.freeSpinSession?.presentationSpin?.id === settled.id) {
      state.freeSpinSession.presentationSpin = { ...clone(finalSettled), settlementStatus: "settled" };
    }
    if (state.freeSpinSession?.lastResult?.id === settled.id) {
      state.freeSpinSession.lastResult = { ...clone(finalSettled), settlementStatus: "settled" };
    }
    return finalSettled;
  }

  function getModifierLabel(modifier) {
    const normalized = normalizeModifier(modifier);
    if (!normalized) return "Mystery Modifier";
    if (normalized.id === "spotlight") return `Spotlight: ${normalized.characterName} ${Math.min(4, 1 + normalized.stacks)}×`;
    if (normalized.id === "double-commune") return normalized.stacks === 1 ? "Double Commune" : `Commune ${Math.min(4, 1 + normalized.stacks)}×`;
    if (normalized.id === "rescue-spin" && normalized.stacks > 1) return `Rescue Spin ×${normalized.stacks}`;
    if (normalized.id === "fortune-burst" && normalized.stacks > 1) return `Fortune Burst ×${normalized.stacks}`;
    return normalized.name;
  }

  function getQueueDisplay(state) {
    return normalizeModifierQueue(state?.mystery?.modifierQueue).map(modifier => ({
      ...clone(modifier),
      label: getModifierLabel(modifier),
      accent: modifier.id === "spotlight"
        ? CONFIG.characterAccentColorMap[modifier.characterKey]
        : modifier.id === "center-tree" ? CONFIG.characterAccentColorMap.TOL : CONFIG.characterAccentColorMap.MYS,
    }));
  }

  app.mystery = {
    MODIFIER_NAMES,
    createState,
    normalizeState,
    normalizeModifier,
    normalizeModifierQueue,
    queueModifier,
    queueFreeSpins,
    setQueuedFreeSpins,
    clearQueue,
    hasQueuedFreeSpin,
    peekModifierQueue,
    commitSpinStart,
    countTokens,
    chooseModifier,
    createAward,
    applyPayoutModifiers,
    applyMysterySettlement,
    getModifierLabel,
    getQueueDisplay,
    randomStops,
  };
  app.payouts.createSpinResult = createSpinResult;
  app.payouts.settlePendingSpinState = settlePendingSpinState;
})();
