(() => {
  "use strict";

  const app = window.CommuneFortune;
  const { CONFIG } = app;

  const getLineBet = state => CONFIG.lineBets[state.lineBetIndex];
  const getTotalBet = state => getLineBet(state) * CONFIG.paylines.length;

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
          rows,
          keys,
          symbolKey: result.symbolKey,
          payout: result.multiplier * lineBet,
        });
      }
    });

    return wins;
  }

  app.payouts = { getLineBet, getTotalBet, evaluateLine, evaluateWins };
})();
