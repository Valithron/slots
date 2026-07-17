(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

  const WIN_TIERS = Object.freeze({ NONE: "none", SMALL: "small", NICE: "nice", BIG: "big", JACKPOT: "jackpot" });
  const ANTICIPATION_LEVELS = Object.freeze({ NONE: "none", MILD: "mild", STRONG: "strong" });

  const getLineBet = state => CONFIG.lineBets[state.lineBetIndex];
  const getTotalBet = state => getLineBet(state) * CONFIG.paylines.length;
  const cloneMatrix = matrix => matrix.map(row => [...row]);

  function normalizeFortuneMeter(meter, capacity = CONFIG.fortuneMeter.capacity) {
    const rawValue = Number.isFinite(meter?.value) ? Math.floor(meter.value) : 0;
    const value = Math.min(capacity, Math.max(0, rawValue));
    return { value, charged: value >= capacity };
  }

  function matrixFromStops(targetStops) {
    if (!Array.isArray(targetStops) || targetStops.length !== CONFIG.reels.length) {
      throw new Error(`Expected ${CONFIG.reels.length} reel stops.`);
    }
    return Array.from({ length: CONFIG.rowCount }, (_, row) => CONFIG.reels.map((reel, reelIndex) => {
      const stop = targetStops[reelIndex];
      if (!Number.isInteger(stop) || stop < 0 || stop >= reel.length) {
        throw new Error(`Invalid stop ${stop} for reel ${reelIndex + 1}.`);
      }
      return reel[(stop + row) % reel.length];
    }));
  }

  function evaluateLine(keys) {
    const wildKey = CONFIG.expandingWild.symbolKey;
    if (keys.every(key => key === wildKey)) return { symbolKey: wildKey, multiplier: CONFIG.symbols[wildKey].payout };
    const target = keys.find(key => key !== wildKey);
    if (!target) return null;
    return keys.every(key => key === target || key === wildKey)
      ? { symbolKey: target, multiplier: CONFIG.symbols[target].payout }
      : null;
  }

  function evaluateWins(matrix, state) {
    const lineBet = getLineBet(state);
    const wins = [];
    CONFIG.paylines.forEach((rows, lineIndex) => {
      const keys = rows.map((row, reelIndex) => matrix[row][reelIndex]);
      const result = evaluateLine(keys);
      if (result) wins.push({
        lineIndex,
        rows: [...rows],
        keys,
        symbolKey: result.symbolKey,
        multiplier: result.multiplier,
        payout: result.multiplier * lineBet,
      });
    });
    return wins;
  }

  function isExpandingWildEligible(originalMatrix) {
    const { rowIndex, reelIndex, symbolKey } = CONFIG.expandingWild;
    return originalMatrix?.[rowIndex]?.[reelIndex] === symbolKey;
  }

  function createExpandingWildRoll(originalMatrix, {
    enabled = CONFIG.features.expandingWilds,
    rng = Math.random,
    storedRoll = null,
  } = {}) {
    const eligible = isExpandingWildEligible(originalMatrix);
    const outcomes = CONFIG.expandingWild.outcomes;
    let roll = null;
    if (enabled && eligible) {
      roll = Number.isInteger(storedRoll) ? storedRoll : Math.floor(rng() * outcomes);
      if (roll < 0 || roll >= outcomes) throw new Error(`Expanding-Wild roll must be between 0 and ${outcomes - 1}.`);
    }
    return {
      eligible,
      roll,
      outcomes,
      activated: Boolean(enabled && eligible && CONFIG.expandingWild.activatingRolls.includes(roll)),
    };
  }

  function applyExpandingWild(originalMatrix, expandingWildRoll) {
    const resolvedMatrix = cloneMatrix(originalMatrix);
    const transformations = [];
    if (!expandingWildRoll?.activated) return { resolvedMatrix, transformations };

    const { reelIndex, rowIndex, symbolKey } = CONFIG.expandingWild;
    const affectedRows = Array.from({ length: CONFIG.rowCount }, (_, row) => row);
    affectedRows.forEach(row => { resolvedMatrix[row][reelIndex] = symbolKey; });
    transformations.push({
      type: "expanding-wild",
      symbolKey,
      reelIndex,
      sourceRow: rowIndex,
      affectedRows,
      activated: true,
    });
    return { resolvedMatrix, transformations };
  }

  function findSymbolCell(matrix, symbolKey, used = new Set()) {
    for (let row = 0; row < matrix.length; row += 1) {
      for (let reel = 0; reel < matrix[row].length; reel += 1) {
        const key = `${row}:${reel}`;
        if (matrix[row][reel] === symbolKey && !used.has(key)) {
          used.add(key);
          return { row, reel };
        }
      }
    }
    return null;
  }

  function detectCombinationMatches(originalMatrix, { enabled = CONFIG.features.combinationBonuses } = {}) {
    if (!enabled) return [];
    const full = CONFIG.combinations.fullCommune;
    const flat = originalMatrix.flat();
    const centerTree = originalMatrix?.[CONFIG.expandingWild.rowIndex]?.[CONFIG.expandingWild.reelIndex] === CONFIG.expandingWild.symbolKey;
    const hasAllCharacters = full.requiredCharacters.every(symbolKey => flat.includes(symbolKey));

    if (centerTree && hasAllCharacters) {
      const used = new Set([`${CONFIG.expandingWild.rowIndex}:${CONFIG.expandingWild.reelIndex}`]);
      const cells = full.requiredCharacters.map(symbolKey => findSymbolCell(originalMatrix, symbolKey, used));
      cells.push({ row: CONFIG.expandingWild.rowIndex, reel: CONFIG.expandingWild.reelIndex });
      return [{ ...full, symbols: [...full.requiredCharacters, CONFIG.expandingWild.symbolKey], cells }];
    }

    const rowIndex = CONFIG.combinations.communeRow;
    const sequence = originalMatrix[rowIndex];
    const match = CONFIG.combinations.definitions.find(definition => definition.sequence.every((key, index) => sequence[index] === key));
    if (!match) return [];
    return [{
      ...match,
      symbols: [...match.sequence],
      cells: match.sequence.map((_, reel) => ({ row: rowIndex, reel })),
    }];
  }

  function calculateCombinationWins(matches, state) {
    const lineBet = getLineBet(state);
    const totalBet = getTotalBet(state);
    return matches.map(match => ({
      id: match.id,
      name: match.name,
      symbols: [...match.symbols],
      cells: match.cells.map(cell => ({ ...cell })),
      payoutType: match.payoutType,
      multiplier: match.multiplier,
      payout: match.multiplier * (match.payoutType === "totalBet" ? totalBet : lineBet),
    }));
  }

  function classifyWinTier(totalWin, totalBet, thresholds = CONFIG.winTiers.thresholds) {
    if (!Number.isFinite(totalWin) || totalWin < 0) throw new Error("totalWin must be a non-negative number.");
    if (!Number.isFinite(totalBet) || totalBet <= 0) throw new Error("totalBet must be greater than zero.");
    if (totalWin === 0) return WIN_TIERS.NONE;
    const multiple = totalWin / totalBet;
    if (multiple >= thresholds.jackpot) return WIN_TIERS.JACKPOT;
    if (multiple >= thresholds.big) return WIN_TIERS.BIG;
    if (multiple >= thresholds.nice) return WIN_TIERS.NICE;
    return WIN_TIERS.SMALL;
  }

  function hasPlausibleFirstTwoReelMatch(matrix) {
    if (!Array.isArray(matrix) || matrix.length < CONFIG.rowCount) return false;
    return CONFIG.paylines.some(rows => {
      const first = matrix[rows[0]]?.[0];
      const second = matrix[rows[1]]?.[1];
      return Boolean(first && second && (first === second || first === "TOL" || second === "TOL"));
    });
  }

  function classifyAnticipation(spinResult, { enabled = true } = {}) {
    if (!enabled || !spinResult) return ANTICIPATION_LEVELS.NONE;
    if ([WIN_TIERS.NICE, WIN_TIERS.BIG, WIN_TIERS.JACKPOT].includes(spinResult.winTier)) return ANTICIPATION_LEVELS.STRONG;
    if (hasPlausibleFirstTwoReelMatch(spinResult.originalMatrix)) return ANTICIPATION_LEVELS.MILD;
    return ANTICIPATION_LEVELS.NONE;
  }

  function getDominantWinningSymbol(lineWins) {
    if (!Array.isArray(lineWins) || lineWins.length === 0) return null;
    const totals = new Map();
    lineWins.forEach(win => {
      if (win.symbolKey === "TOL") return;
      totals.set(win.symbolKey, (totals.get(win.symbolKey) || 0) + win.payout);
    });
    if (totals.size === 0) return null;
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
    return ranked[0][0];
  }

  function getTierFortunePoints(naturalWinTier) {
    const gains = CONFIG.fortuneMeter.gains;
    if (naturalWinTier === WIN_TIERS.SMALL) return gains.smallWin;
    if (naturalWinTier === WIN_TIERS.NICE) return gains.niceWin;
    if (naturalWinTier === WIN_TIERS.BIG) return gains.bigWin;
    return 0;
  }

  function createFortuneMeterAward({
    paidSpin = true,
    naturalWinTier = WIN_TIERS.NONE,
    combinationWins = [],
    enabled = CONFIG.features.fortuneMeter,
  } = {}) {
    if (!enabled || !paidSpin) {
      return { paidSpinPoints: 0, tierPoints: 0, combinationPoints: 0, jackpotCharge: false, totalPoints: 0 };
    }
    const gains = CONFIG.fortuneMeter.gains;
    const combination = combinationWins[0] || null;
    const paidSpinPoints = gains.paidSpin;
    const tierPoints = getTierFortunePoints(naturalWinTier);
    const combinationPoints = combination
      ? (combination.id === CONFIG.combinations.fullCommune.id ? gains.fullCommune : gains.combination)
      : 0;
    const jackpotCharge = naturalWinTier === WIN_TIERS.JACKPOT;
    return {
      paidSpinPoints,
      tierPoints,
      combinationPoints,
      jackpotCharge,
      totalPoints: paidSpinPoints + tierPoints + combinationPoints,
    };
  }

  function applyFortuneMeterAward(state, award) {
    const current = normalizeFortuneMeter(state?.fortuneMeter);
    if (!state || !award) return current;
    if (award.jackpotCharge) {
      state.fortuneMeter = { value: CONFIG.fortuneMeter.capacity, charged: true };
      return state.fortuneMeter;
    }
    const points = Number.isFinite(award.totalPoints) ? Math.max(0, Math.floor(award.totalPoints)) : 0;
    const value = Math.min(CONFIG.fortuneMeter.capacity, current.value + points);
    state.fortuneMeter = { value, charged: value >= CONFIG.fortuneMeter.capacity };
    return state.fortuneMeter;
  }

  function getFortuneSpinState(state, enabled = CONFIG.features.fortuneMeter) {
    const meter = normalizeFortuneMeter(state?.fortuneMeter);
    const active = Boolean(enabled && meter.charged);
    return { active, multiplier: CONFIG.fortuneMeter.multiplier, consumedCharge: active };
  }

  function consumeFortuneChargeState(state, spinResult) {
    if (!state || !spinResult?.fortuneSpin?.consumedCharge) return false;
    state.fortuneMeter = { value: 0, charged: false };
    return true;
  }

  function createSpinResult({
    targetStops,
    state,
    id,
    rng = Math.random,
    featureFlags = CONFIG.features,
    featureRolls: storedFeatureRolls = null,
    createdAt = new Date().toISOString(),
    paidSpin = true,
  }) {
    const originalMatrix = matrixFromStops(targetStops);
    const expandingWild = createExpandingWildRoll(originalMatrix, {
      enabled: Boolean(featureFlags.expandingWilds),
      rng,
      storedRoll: storedFeatureRolls?.expandingWild?.roll,
    });
    const combinationMatches = detectCombinationMatches(originalMatrix, { enabled: Boolean(featureFlags.combinationBonuses) });
    const { resolvedMatrix, transformations } = applyExpandingWild(originalMatrix, expandingWild);
    const baseLineWins = evaluateWins(originalMatrix, state);
    const lineWins = evaluateWins(resolvedMatrix, state);
    const combinationWins = calculateCombinationWins(combinationMatches, state);
    const baseLineWinTotal = baseLineWins.reduce((sum, win) => sum + win.payout, 0);
    const lineWinTotal = lineWins.reduce((sum, win) => sum + win.payout, 0);
    const combinationWinTotal = combinationWins.reduce((sum, win) => sum + win.payout, 0);
    const preModifierWin = lineWinTotal + combinationWinTotal;
    const wager = getTotalBet(state);
    const naturalWinTier = classifyWinTier(preModifierWin, wager);
    const fortuneSpin = getFortuneSpinState(state, Boolean(featureFlags.fortuneMeter));
    const totalWin = fortuneSpin.active ? Math.floor(preModifierWin * fortuneSpin.multiplier) : preModifierWin;
    const fortuneBonus = totalWin - preModifierWin;
    const modifiers = fortuneSpin.active ? [{
      id: "fortune-spin",
      name: "Fortune Spin",
      multiplier: fortuneSpin.multiplier,
      baseWin: preModifierWin,
      bonusWin: fortuneBonus,
      finalWin: totalWin,
    }] : [];
    const fortuneMeterAward = createFortuneMeterAward({
      paidSpin,
      naturalWinTier,
      combinationWins,
      enabled: Boolean(featureFlags.fortuneMeter),
    });
    const result = {
      id,
      createdAt,
      wager,
      lineBet: getLineBet(state),
      targetStops: [...targetStops],
      originalMatrix,
      resolvedMatrix,
      featureRolls: { expandingWild },
      transformations,
      baseLineWins,
      lineWins,
      scatterWins: [],
      combinationWins,
      modifiers,
      baseLineWinTotal,
      lineWinTotal,
      combinationWinTotal,
      preModifierWin,
      fortuneSpin,
      fortuneMeterAward,
      fortuneBonus,
      naturalWinTier,
      totalWin,
      finalWinTier: classifyWinTier(totalWin, wager),
      winTier: WIN_TIERS.NONE,
      anticipation: ANTICIPATION_LEVELS.NONE,
      settlementStatus: "pending",
    };
    result.winTier = result.finalWinTier;
    result.anticipation = classifyAnticipation(result, { enabled: Boolean(featureFlags.spinDrama) });
    return result;
  }

  function settlePendingSpinState(state) {
    const pending = state?.pendingSpin;
    if (!pending || pending.settlementStatus !== "pending") return null;
    state.coins += pending.totalWin;
    state.lastWin = pending.totalWin;
    applyFortuneMeterAward(state, pending.fortuneMeterAward);
    const settled = {
      ...pending,
      settlementStatus: "settled",
      fortuneMeterAfterSettlement: normalizeFortuneMeter(state.fortuneMeter),
    };
    state.pendingSpin = null;
    return settled;
  }

  app.WIN_TIERS = WIN_TIERS;
  app.ANTICIPATION_LEVELS = ANTICIPATION_LEVELS;
  app.payouts = {
    getLineBet,
    getTotalBet,
    cloneMatrix,
    normalizeFortuneMeter,
    matrixFromStops,
    evaluateLine,
    evaluateWins,
    isExpandingWildEligible,
    createExpandingWildRoll,
    applyExpandingWild,
    detectCombinationMatches,
    calculateCombinationWins,
    classifyWinTier,
    classifyAnticipation,
    hasPlausibleFirstTwoReelMatch,
    getDominantWinningSymbol,
    getTierFortunePoints,
    createFortuneMeterAward,
    applyFortuneMeterAward,
    getFortuneSpinState,
    consumeFortuneChargeState,
    createSpinResult,
    settlePendingSpinState,
  };
})();