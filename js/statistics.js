(() => {
  "use strict";

  const app = window.CommuneFortune;

  function createStatistics() {
    const session = {
      spins: 0,
      winningSpins: 0,
      coinsWagered: 0,
      coinsWon: 0,
    };

    function recordSpin({ wager, payout }) {
      session.spins += 1;
      session.coinsWagered += wager;
      session.coinsWon += payout;
      if (payout > 0) session.winningSpins += 1;
    }

    function snapshot() {
      return { ...session };
    }

    return { recordSpin, snapshot };
  }

  app.statistics = { createStatistics };
})();
