(() => {
  "use strict";

  const app = window.CommuneFortune;
  const { CONFIG } = app;
  const ui = app.ui.createUI();

  let state = app.persistence.loadState();
  let spinning = false;

  const audio = app.audio.createAudio(() => state.sound);
  const statistics = app.statistics.createStatistics();
  const reels = app.reels.createReelController({
    reelGrid: ui.elements.reelGrid,
    playTick: audio.playTick,
    playReelStop: audio.playReelStop,
  });

  const getLineBet = () => app.payouts.getLineBet(state);
  const getTotalBet = () => app.payouts.getTotalBet(state);

  function saveState() {
    app.persistence.saveState(state);
  }

  function updateDisplay() {
    ui.updateDisplay({
      state,
      spinning,
      lineBet: getLineBet(),
      totalBet: getTotalBet(),
    });
  }

  function chooseLossMessage() {
    const messages = [
      "No line this time.",
      "Close. Give it another spin.",
      "The Commons keeps its coins this round.",
      "Nothing matched across an active line.",
      "A cold spin. The next one may turn.",
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  async function spin() {
    if (spinning) return;

    const totalBet = getTotalBet();
    if (state.coins < totalBet) {
      ui.showMessage("Not enough coins. Lower the bet or refill.");
      audio.playErrorSound();
      return;
    }

    spinning = true;
    ui.clearWins();
    ui.setSpinning(true);
    state.coins -= totalBet;
    state.lastWin = 0;
    updateDisplay();
    saveState();
    ui.setControlsDisabled(true, state);
    ui.showMessage("The reels are turning…");
    audio.playSpinStart();

    await app.bonuses.beforeSpin({ state, totalBet });

    const targetStops = reels.randomStops();
    await reels.spinTo(targetStops);

    ui.setSpinning(false);
    const matrix = reels.getVisibleMatrix();
    const wins = app.payouts.evaluateWins(matrix, state);
    const totalWin = wins.reduce((sum, win) => sum + win.payout, 0);

    if (totalWin > 0) {
      state.coins += totalWin;
      state.lastWin = totalWin;
      ui.markWins(wins, reels);

      const labels = wins
        .map(win => CONFIG.symbols[win.symbolKey].name.replace(" Wild", ""))
        .join(", ");

      ui.showMessage(
        `${wins.length} winning line${wins.length === 1 ? "" : "s"}: ${labels}. You won ${ui.formatNumber(totalWin)} coins!`,
        true,
      );
      audio.playWinSound(totalWin);
      app.effects.burstCoins(Math.min(56, 18 + wins.length * 10), ui.elements.reelFrame);
      app.effects.flashScreen(ui.elements.screenFlash);
    } else {
      state.lastWin = 0;
      ui.showMessage(chooseLossMessage());
      audio.playLossSound();
    }

    statistics.recordSpin({ wager: totalBet, payout: totalWin });
    await app.bonuses.afterSpin({ state, totalBet, matrix, wins, totalWin });

    updateDisplay();
    saveState();
    spinning = false;
    ui.setControlsDisabled(false, state);
    updateDisplay();
  }

  function adjustBet(direction) {
    if (spinning) return;

    state.lineBetIndex = Math.min(
      Math.max(state.lineBetIndex + direction, 0),
      CONFIG.lineBets.length - 1,
    );
    state.lastWin = 0;
    ui.showMessage(`Line bet ${getLineBet()}. Total spin cost ${getTotalBet()} coins.`);
    updateDisplay();
    saveState();
    audio.playButtonTone();
  }

  function refill() {
    if (spinning) return;

    state.coins = CONFIG.startingCoins;
    state.lastWin = 0;
    ui.clearWins();
    ui.showMessage("Coin bank restored to 1,000.");
    updateDisplay();
    saveState();
    audio.playRefillSound();
  }

  function toggleSound() {
    state.sound = !state.sound;
    updateDisplay();
    saveState();
    if (state.sound) audio.playButtonTone();
  }

  function bindEvents() {
    ui.elements.betDown.addEventListener("click", () => adjustBet(-1));
    ui.elements.betUp.addEventListener("click", () => adjustBet(1));
    ui.elements.spinButton.addEventListener("click", spin);
    ui.elements.refillButton.addEventListener("click", refill);
    ui.elements.soundButton.addEventListener("click", toggleSound);
    ui.elements.helpButton.addEventListener("click", ui.openHelp);
    ui.elements.closeHelp.addEventListener("click", ui.closeHelp);

    ui.elements.helpModal.addEventListener("click", event => {
      if (event.target === ui.elements.helpModal) ui.closeHelp();
    });

    document.addEventListener("keydown", event => {
      if (ui.isHelpOpen()) {
        if (event.key === "Escape") ui.closeHelp();
        return;
      }

      if ((event.code === "Space" || event.key === "Enter") && !event.repeat) {
        event.preventDefault();
        spin();
      }

      if (event.key === "ArrowLeft") adjustBet(-1);
      if (event.key === "ArrowRight") adjustBet(1);
    });

    window.addEventListener("resize", () => {
      if (!spinning) reels.reposition();
    });
  }

  async function initialize() {
    ui.buildPaytable();
    bindEvents();
    await reels.buildReels();
    updateDisplay();
  }

  app.game = {
    spin,
    adjustBet,
    refill,
    getState: () => ({ ...state }),
    getSessionStatistics: statistics.snapshot,
  };

  initialize();
})();
