(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

  const WIN_TIERS = Object.freeze({
    NONE: "none",
    SMALL: "small",
    NICE: "nice",
    BIG: "big",
    JACKPOT: "jackpot",
  });

  const ANTICIPATION_LEVELS = Object.freeze({
    NONE: "none",
    MILD: "mild",
    STRONG: "strong",
  });

  const getLineBet = state => CONFIG.lineBets[state.lineBetIndex];
  const getTotalBet = state => getLineBet(state) * CONFIG.paylines.length;

  function matrixFromStops(targetStops) {
    if (!Array.isArray(targetStops) || targetStops.length !== CONFIG.reels.length) {
      throw new Error(`Expected ${CONFIG.reels.length} reel stops.`);
    }

    return Array.from({ length: CONFIG.rowCount }, (_, row) => {
      return CONFIG.reels.map((reel, reelIndex) => {
        const stop = targetStops[reelIndex];
        if (!Number.isInteger(stop) || stop < 0 || stop >= reel.length) {
          throw new Error(`Invalid stop ${stop} for reel ${reelIndex + 1}.`);
        }
        return reel[(stop + row) % reel.length];
      });
    });
  }

  function evaluateLine(keys) {
    const wildKey = "TOL";

    if (keys.every(key => key === wildKey)) {
      return { symbolKey: wildKey, multiplier: CONFIG.symbols[wildKey].payout };
    }

    const target = keys.find(key => key !== wildKey);
    if (!target) return null;

    if (keys.every(key => key === target || key === wildKey)) {
      return { symbolKey: target, multiplier: CONFIG.symbols[target].payout };
    }

    return null;
  }

  function evaluateWins(matrix, state) {
    const lineBet = getLineBet(state);
    const wins = [];

    CONFIG.paylines.forEach((rows, lineIndex) => {
      const keys = rows.map((row, reelIndex) => matrix[row][reelIndex]);
      const result = evaluateLine(keys);

      if (result) {
        wins.push({
          lineIndex,
          rows: [...rows],
          keys,
          symbolKey: result.symbolKey,
          multiplier: result.multiplier,
          payout: result.multiplier * lineBet,
        });
      }
    });

    return wins;
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
      if (!first || !second) return false;
      return first === second || first === "TOL" || second === "TOL";
    });
  }

  function classifyAnticipation(spinResult, { enabled = true } = {}) {
    if (!enabled || !spinResult) return ANTICIPATION_LEVELS.NONE;
    if ([WIN_TIERS.NICE, WIN_TIERS.BIG, WIN_TIERS.JACKPOT].includes(spinResult.winTier)) {
      return ANTICIPATION_LEVELS.STRONG;
    }
    if (hasPlausibleFirstTwoReelMatch(spinResult.originalMatrix)) {
      return ANTICIPATION_LEVELS.MILD;
    }
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

  function createSpinResult({ targetStops, state, id }) {
    const originalMatrix = matrixFromStops(targetStops);
    const resolvedMatrix = originalMatrix.map(row => [...row]);
    const lineWins = evaluateWins(resolvedMatrix, state);
    const totalWin = lineWins.reduce((sum, win) => sum + win.payout, 0);
    const wager = getTotalBet(state);
    const winTier = classifyWinTier(totalWin, wager);

    const result = {
      id,
      createdAt: new Date().toISOString(),
      wager,
      lineBet: getLineBet(state),
      targetStops: [...targetStops],
      originalMatrix,
      resolvedMatrix,
      transformations: [],
      lineWins,
      scatterWins: [],
      combinationWins: [],
      modifiers: [],
      totalWin,
      winTier,
      anticipation: ANTICIPATION_LEVELS.NONE,
      settlementStatus: "pending",
    };

    result.anticipation = classifyAnticipation(result, { enabled: CONFIG.features.spinDrama });
    return result;
  }

  app.WIN_TIERS = WIN_TIERS;
  app.ANTICIPATION_LEVELS = ANTICIPATION_LEVELS;
  app.payouts = {
    getLineBet,
    getTotalBet,
    matrixFromStops,
    evaluateLine,
    evaluateWins,
    classifyWinTier,
    classifyAnticipation,
    hasPlausibleFirstTwoReelMatch,
    getDominantWinningSymbol,
    createSpinResult,
  };
})();
