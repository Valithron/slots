(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const originalCreateSpinResult = app.payouts.createSpinResult;

  const canonicalMembers = members => [...members].sort().join("|");

  function findSymbolCell(matrix, symbolKey, used = new Set()) {
    for (let row = 0; row < matrix.length; row += 1) {
      for (let reel = 0; reel < matrix[row].length; reel += 1) {
        const cellKey = `${row}:${reel}`;
        if (matrix[row][reel] === symbolKey && !used.has(cellKey)) {
          used.add(cellKey);
          return { row, reel };
        }
      }
    }
    return null;
  }

  function detectCombinationMatches(originalMatrix, {
    enabled = CONFIG.features.combinationBonuses,
    mode = CONFIG.combinations.matchMode,
    definitions = CONFIG.combinations.definitions,
  } = {}) {
    if (!enabled || !Array.isArray(originalMatrix)) return [];

    const full = CONFIG.combinations.fullCommune;
    const flat = originalMatrix.flat();
    const centerRow = CONFIG.expandingWild.rowIndex;
    const centerReel = CONFIG.expandingWild.reelIndex;
    const centerTree = originalMatrix?.[centerRow]?.[centerReel] === CONFIG.expandingWild.symbolKey;
    const hasAllCharacters = full.requiredCharacters.every(symbolKey => flat.includes(symbolKey));

    if (centerTree && hasAllCharacters) {
      const used = new Set([`${centerRow}:${centerReel}`]);
      const cells = full.requiredCharacters.map(symbolKey => findSymbolCell(originalMatrix, symbolKey, used));
      cells.push({ row: centerRow, reel: centerReel });
      return [{ ...full, symbols: [...full.requiredCharacters, CONFIG.expandingWild.symbolKey], cells }];
    }

    const rowIndex = CONFIG.combinations.communeRow;
    const row = originalMatrix?.[rowIndex];
    if (!Array.isArray(row) || row.length !== CONFIG.reels.length) return [];

    const match = definitions.find(definition => {
      if (mode === "exact-order") {
        return Array.isArray(definition.sequence)
          && definition.sequence.length === row.length
          && definition.sequence.every((key, index) => row[index] === key);
      }
      return Array.isArray(definition.members)
        && definition.members.length === row.length
        && canonicalMembers(definition.members) === canonicalMembers(row);
    });

    if (!match) return [];
    return [{
      ...match,
      symbols: [...row],
      cells: row.map((_, reel) => ({ row: rowIndex, reel })),
    }];
  }

  function applyCombinationModel(baseResult, state, featureFlags, options = {}) {
    const matches = detectCombinationMatches(baseResult.originalMatrix, {
      enabled: Boolean(featureFlags.combinationBonuses),
      mode: options.mode,
      definitions: options.definitions,
    });
    const combinationWins = app.payouts.calculateCombinationWins(matches, state);
    const combinationWinTotal = combinationWins.reduce((sum, win) => sum + win.payout, 0);
    const preModifierWin = baseResult.lineWinTotal + combinationWinTotal;
    const naturalWinTier = app.payouts.classifyWinTier(preModifierWin, baseResult.referenceBet);
    const fortuneSpin = baseResult.fortuneSpin;
    const totalWin = fortuneSpin.active
      ? Math.floor(preModifierWin * fortuneSpin.multiplier)
      : preModifierWin;
    const fortuneBonus = totalWin - preModifierWin;
    const modifiers = fortuneSpin.active ? [{
      id: "fortune-spin",
      name: "Fortune Spin",
      multiplier: fortuneSpin.multiplier,
      baseWin: preModifierWin,
      bonusWin: fortuneBonus,
      finalWin: totalWin,
    }] : [];
    const fortuneMeterAward = app.payouts.createFortuneMeterAward({
      paidSpin: baseResult.spinType === "paid",
      naturalWinTier,
      combinationWins,
      enabled: Boolean(featureFlags.fortuneMeter),
    });

    const result = {
      ...baseResult,
      combinationWins,
      modifiers,
      combinationWinTotal,
      preModifierWin,
      fortuneMeterAward,
      fortuneBonus,
      naturalWinTier,
      totalWin,
      finalWinTier: app.payouts.classifyWinTier(totalWin, baseResult.referenceBet),
    };
    result.winTier = result.finalWinTier;
    result.anticipation = app.payouts.classifyAnticipation(result, {
      enabled: Boolean(featureFlags.spinDrama),
    });
    return result;
  }

  function createSpinResultWithCombinationModel(options, {
    mode = CONFIG.combinations.matchMode,
    definitions = CONFIG.combinations.definitions,
  } = {}) {
    const featureFlags = options.featureFlags || CONFIG.features;
    const baseResult = originalCreateSpinResult({
      ...options,
      featureFlags: { ...featureFlags, combinationBonuses: false },
    });
    return applyCombinationModel(baseResult, options.state, featureFlags, { mode, definitions });
  }

  app.combinationClarity = {
    canonicalMembers,
    detectCombinationMatches,
    createSpinResultWithCombinationModel,
  };
  app.payouts.detectCombinationMatches = detectCombinationMatches;
  app.payouts.createSpinResult = options => createSpinResultWithCombinationModel(options);
})();