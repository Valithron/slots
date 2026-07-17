(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const ui = app.ui.createUI();

  let state = app.persistence.loadState();
  let phase = state.pendingSpin ? GAME_STATES.RESOLVING : GAME_STATES.IDLE;
  state.gamePhase = phase;

  const audio = app.audio.createAudio(() => state.sound);
  const statistics = app.statistics.createStatistics();
  const reels = app.reels.createReelController({
    reelGrid: ui.elements.reelGrid,
    playTick: audio.playTick,
    playReelStop: audio.playReelStop,
  });

  const allowedTransitions = {
    [GAME_STATES.IDLE]: new Set([GAME_STATES.SPINNING]),
    [GAME_STATES.SPINNING]: new Set([GAME_STATES.RESOLVING, GAME_STATES.IDLE]),
    [GAME_STATES.RESOLVING]: new Set([GAME_STATES.CELEBRATING, GAME_STATES.IDLE]),
    [GAME_STATES.CELEBRATING]: new Set([GAME_STATES.IDLE]),
  };

  const getLineBet = () => app.payouts.getLineBet(state);
  const getTotalBet = () => app.payouts.getTotalBet(state);
  const isBusy = () => phase !== GAME_STATES.IDLE;

  function createResultId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `spin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function saveState() {
    state.gamePhase = phase;
    app.persistence.saveState(state);
  }

  function setPhase(nextPhase, { force = false, persist = false } = {}) {
    if (!force && nextPhase !== phase && !allowedTransitions[phase]?.has(nextPhase)) {
      throw new Error(`Invalid game-state transition: ${phase} -> ${nextPhase}`);
    }

    phase = nextPhase;
    state.gamePhase = nextPhase;
    if (persist) saveState();
  }

  function updateDisplay() {
    ui.updateDisplay({
      state,
      spinning: isBusy(),
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

  function settlePendingSpin() {
    const pending = state.pendingSpin;
    if (!pending || pending.settlementStatus !== "pending") return null;

    state.coins += pending.totalWin;
    state.lastWin = pending.totalWin;
    const settled = { ...pending, settlementStatus: "settled" };
    state.pendingSpin = null;
    return settled;
  }

  function recoverPendingSpin() {
    if (!state.pendingSpin) {
      setPhase(GAME_STATES.IDLE, { force: true });
      return false;
    }

    const recovered = settlePendingSpin();
    setPhase(GAME_STATES.IDLE, { force: true });
    saveState();

    if (recovered?.totalWin > 0) {
      ui.showMessage(`Recovered an interrupted spin and credited ${ui.formatNumber(recovered.totalWin)} coins.`, true);
    } else {
      ui.showMessage("Recovered an interrupted spin. No win was due.");
    }
    return true;
  }

  async function spin() {
    if (isBusy()) return;

    const totalBet = getTotalBet();
    if (state.coins < totalBet) {
      ui.showMessage("Not enough coins. Lower the bet or refill.");
      audio.playErrorSound();
      return;
    }

    setPhase(GAME_STATES.SPINNING);
    ui.clearWins();
    ui.setSpinning(true);
    ui.setControlsDisabled(true, state);
    ui.showMessage("The reels are turning…");
    audio.playSpinStart();

    try {
      await app.bonuses.beforeSpin({ state, totalBet });

      const targetStops = reels.randomStops();
      const spinResult = app.payouts.createSpinResult({
        targetStops,
        state,
        id: createResultId(),
      });

      state.coins -= totalBet;
      state.lastWin = 0;
      state.pendingSpin = spinResult;
      saveState();
      updateDisplay();

      await reels.spinTo(spinResult.targetStops);
      ui.setSpinning(false);
      setPhase(GAME_STATES.RESOLVING);

      const settledResult = settlePendingSpin();
      if (!settledResult) throw new Error("Spin result was already settled or unavailable.");
      saveState();

      if (settledResult.totalWin > 0) {
        setPhase(GAME_STATES.CELEBRATING);
        ui.markWins(settledResult.lineWins, reels);

        const labels = settledResult.lineWins
          .map(win => CONFIG.symbols[win.symbolKey].name.replace(" Wild", ""))
          .join(", ");

        ui.showMessage(
          `${settledResult.lineWins.length} winning line${settledResult.lineWins.length === 1 ? "" : "s"}: ${labels}. You won ${ui.formatNumber(settledResult.totalWin)} coins!`,
          true,
        );
        audio.playWinSound(settledResult.totalWin);
        app.effects.burstCoins(Math.min(56, 18 + settledResult.lineWins.length * 10), ui.elements.reelFrame);
        app.effects.flashScreen(ui.elements.screenFlash);
      } else {
        ui.showMessage(chooseLossMessage());
        audio.playLossSound();
      }

      statistics.recordSpin({ wager: settledResult.wager, payout: settledResult.totalWin });
      await app.bonuses.afterSpin({ state, spinResult: settledResult });
      setPhase(GAME_STATES.IDLE, { force: phase !== GAME_STATES.CELEBRATING });
      saveState();
    } catch (error) {
      console.error(error);
      const recovered = settlePendingSpin();
      setPhase(GAME_STATES.IDLE, { force: true });
      saveState();
      ui.setSpinning(false);

      if (recovered?.totalWin > 0) {
        ui.showMessage(`The animation was interrupted, but ${ui.formatNumber(recovered.totalWin)} coins were safely credited.`, true);
      } else {
        ui.showMessage("The spin was interrupted and safely resolved. Try again.");
      }
    } finally {
      ui.setControlsDisabled(false, state);
      updateDisplay();
    }
  }

  function adjustBet(direction) {
    if (isBusy()) return;
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
    if (isBusy()) return;
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
      if (!isBusy()) reels.reposition();
    });
  }

  async function initialize() {
    ui.buildPaytable();
    bindEvents();
    await reels.buildReels();
    const recovered = recoverPendingSpin();
    if (!recovered) ui.showMessage("Choose a bet and spin.");
    updateDisplay();
  }

  app.game = {
    spin,
    adjustBet,
    refill,
    getState: () => ({ ...state }),
    getPhase: () => phase,
    getSessionStatistics: statistics.snapshot,
  };

  initialize();
})();
