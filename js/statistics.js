(() => {
  "use strict";

  const app = globalThis.CommuneFortune;

  function createStatistics() {
    const session = {
      paidSpins: 0,
      freeSpins: 0,
      winningPaidSpins: 0,
      winningFreeSpins: 0,
      coinsWagered: 0,
      coinsWon: 0,
      paidCoinsWon: 0,
      freeSpinCoinsWon: 0,
    };

    function recordSpin({ wager = 0, coinCost = wager, payout = 0, spinType = "paid" }) {
      const paid = spinType !== "free";
      if (paid) {
        session.paidSpins += 1;
        session.coinsWagered += Math.max(0, Math.floor(coinCost));
        session.paidCoinsWon += Math.max(0, Math.floor(payout));
        if (payout > 0) session.winningPaidSpins += 1;
      } else {
        session.freeSpins += 1;
        session.freeSpinCoinsWon += Math.max(0, Math.floor(payout));
        if (payout > 0) session.winningFreeSpins += 1;
      }
      session.coinsWon += Math.max(0, Math.floor(payout));
    }

    function snapshot() {
      return {
        ...session,
        spins: session.paidSpins,
        winningSpins: session.winningPaidSpins,
      };
    }

    return { recordSpin, snapshot };
  }

  app.statistics = { createStatistics };
})();
