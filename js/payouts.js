(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

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

  function createSpinResult({ targetStops, state, id }) {
    const originalMatrix = matrixFromStops(targetStops);
    const resolvedMatrix = originalMatrix.map(row => [...row]);
    const lineWins = evaluateWins(resolvedMatrix, state);
    const totalWin = lineWins.reduce((sum, win) => sum + win.payout, 0);

    return {
      id,
      createdAt: new Date().toISOString(),
      wager: getTotalBet(state),
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
      settlementStatus: "pending",
    };
  }

  app.payouts = {
    getLineBet,
    getTotalBet,
    matrixFromStops,
    evaluateLine,
    evaluateWins,
    createSpinResult,
  };
})();
