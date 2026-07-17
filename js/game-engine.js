(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const ui = app.ui.createUI();

  let state = app.persistence.loadState();
  let phase = state.pendingSpin ? GAME_STATES.RESOLVING : GAME_STATES.IDLE;
  let celebrationAbortController = null;
  let celebrationCleanup = null;
  state.gamePhase = phase;

  const audio = app.audio.createAudio(() => state.sound);
  const statistics = app.statistics.createStatistics();
  const reels = app.reels.createReelController({
    reelGrid: ui.elements.reelGrid,
    playTick: audio.playTick,
    playReelStop: audio.playReelStop,
    onReelStop: (reelIndex, options) => {
      app.effects.reelImpact(ui.elements.machine, ui.elements.reelFrame, reelIndex, options);
    },
    onAnticipation: (level, active) => {
      ui.setAnticipation(level, active);
      app.effects.setAnticipation(ui.elements.machine, reels.getReelElements(), level, active);
      if (active) audio.playAnticipation(level);
    },
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
      phase,
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

  function getWinMessage(result) {
    const labels = result.lineWins
      .map(win => CONFIG.symbols[win.symbolKey].name.replace(" Wild", ""))
      .join(", ");
    return `${result.lineWins.length} winning line${result.lineWins.length === 1 ? "" : "s"}: ${labels}. You won ${ui.formatNumber(result.totalWin)} coins!`;
  }

  function presentSmallWin(result, tier) {
    ui.markWins(result.lineWins, reels, tier);
    ui.setWinDisplay(result.totalWin);
    ui.showMessage(getWinMessage(result), true);
    audio.playTierSound("small");
    app.effects.burstCoins(Math.min(28, 10 + result.lineWins.length * 6), ui.elements.reelFrame, {
      reducedMotion: app.effects.prefersReducedMotion(),
      spread: 0.72,
    });
  }

  async function presentCelebration(result, tier) {
    const reducedMotion = app.effects.prefersReducedMotion();
    const dominantKey = app.payouts.getDominantWinningSymbol(result.lineWins);
    const dominantName = dominantKey ? CONFIG.symbols[dominantKey].name : null;
    const countUpDuration = app.gameFlow.getCountUpDuration(tier, { reducedMotion });
    const celebrationDuration = app.gameFlow.getCelebrationDuration(tier, { reducedMotion });

    setPhase(GAME_STATES.CELEBRATING, { persist: true });
    ui.markWins(result.lineWins, reels, tier);
    ui.showCelebration({ tier, dominantName });
    ui.setPrimaryAction("skip");
    ui.setControlsDisabled(true, state, { allowSpin: true });
    ui.showMessage(`${tier === "jackpot" ? "Commune Jackpot" : tier === "big" ? "Big Win" : "Nice Win"}!`, true);

    celebrationAbortController = new AbortController();
    celebrationCleanup = app.effects.startTierEffects({
      tier,
      elements: ui.elements,
      reducedMotion,
    });
    audio.playTierSound(tier);

    const signal = celebrationAbortController.signal;
    await Promise.all([
      app.effects.countUp({
        totalWin: result.totalWin,
        duration: countUpDuration,
        signal,
        onUpdate: ui.updateCelebrationAmount,
      }),
      app.effects.wait(celebrationDuration, { signal }),
    ]);

    ui.updateCelebrationAmount(result.totalWin);
    ui.announceCelebration({ tier, totalWin: result.totalWin });
    ui.showMessage(getWinMessage(result), true);
    celebrationCleanup?.();
    celebrationCleanup = null;
    celebrationAbortController = null;
    ui.hideCelebration();
    ui.setPrimaryAction("spin");
    setPhase(GAME_STATES.IDLE, { persist: true });
  }

  async function presentResult(result) {
    if (result.totalWin <= 0) {
      ui.showMessage(chooseLossMessage());
      audio.playLossSound();
      return;
    }

    const tier = app.gameFlow.getPresentationTier(result, CONFIG.features.winTiers);
    if (!CONFIG.features.winTiers || !app.gameFlow.isLongCelebrationTier(tier)) {
      presentSmallWin(result, tier);
      return;
    }

    await presentCelebration(result, tier);
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
    ui.hideCelebration();
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

      await reels.spinTo(spinResult.targetStops, {
        anticipation: CONFIG.features.spinDrama ? spinResult.anticipation : "none",
        reducedMotion: app.effects.prefersReducedMotion(),
        dramaEnabled: CONFIG.features.spinDrama,
      });
      ui.setSpinning(false);
      setPhase(GAME_STATES.RESOLVING);

      const settledResult = settlePendingSpin();
      if (!settledResult) throw new Error("Spin result was already settled or unavailable.");
      saveState();

      statistics.recordSpin({ wager: settledResult.wager, payout: settledResult.totalWin });
      await app.bonuses.afterSpin({ state, spinResult: settledResult });
      await presentResult(settledResult);

      if (phase === GAME_STATES.RESOLVING) setPhase(GAME_STATES.IDLE);
      saveState();
    } catch (error) {
      console.error(error);
      celebrationAbortController?.abort();
      celebrationCleanup?.();
      celebrationAbortController = null;
      celebrationCleanup = null;
      ui.hideCelebration();
      ui.setAnticipation("none", false);

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
      if (phase === GAME_STATES.CELEBRATING) setPhase(GAME_STATES.IDLE, { force: true, persist: true });
      ui.hideCelebration();
      ui.setPrimaryAction("spin");
      ui.setControlsDisabled(false, state);
      updateDisplay();
    }
  }

  function skipCelebration() {
    if (phase !== GAME_STATES.CELEBRATING || !celebrationAbortController) return false;
    celebrationAbortController.abort();
    return true;
  }

  function handlePrimaryAction() {
    return app.gameFlow.routePrimaryAction({
      phase,
      onSpin: () => { void spin(); },
      onSkip: skipCelebration,
    });
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
    ui.elements.spinButton.addEventListener("click", handlePrimaryAction);
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
        handlePrimaryAction();
        return;
      }

      if (event.key === "ArrowLeft") adjustBet(-1);
      if (event.key === "ArrowRight") adjustBet(1);
    });

    globalThis.addEventListener("resize", () => {
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
    handlePrimaryAction,
    skipCelebration,
    adjustBet,
    refill,
    getState: () => ({ ...state }),
    getPhase: () => phase,
    getSessionStatistics: statistics.snapshot,
  };

  void initialize();
})();
