(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const ui = app.ui.createUI();

  let state = app.persistence.loadState();
  let phase = state.pendingSpin ? GAME_STATES.RESOLVING : GAME_STATES.IDLE;
  let presentationAbortController = null;
  let presentationCleanup = null;
  let activeSpinResult = state.pendingSpin || null;
  let manualStopSnapshot = null;
  state.gamePhase = phase;

  const audio = app.audio.createAudio(() => state.sound);
  const statistics = app.statistics.createStatistics();
  const reels = app.reels.createReelController({
    reelGrid: ui.elements.reelGrid,
    playTick: audio.playTick,
    playReelStop: audio.playReelStop,
    onReelStop: (reelIndex, options) => app.effects.reelImpact(ui.elements.machine, ui.elements.reelFrame, reelIndex, options),
    onAnticipation: (level, active) => {
      ui.setAnticipation(level, active);
      app.effects.setAnticipation(ui.elements.machine, reels.getReelElements(), level, active);
      if (active) audio.playAnticipation(level);
    },
    onManualStopStateChange: snapshot => {
      manualStopSnapshot = snapshot;
      if (phase === GAME_STATES.SPINNING) updateDisplay();
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
  const isDevelopmentHost = globalThis.location && (
    globalThis.location.protocol === "file:"
    || globalThis.location.hostname === "localhost"
    || globalThis.location.hostname === "127.0.0.1"
  );
  let forcedOutcomeConsumed = false;

  function readDevelopmentForcedOutcome() {
    if (!isDevelopmentHost || forcedOutcomeConsumed || !globalThis.location) return null;
    const params = new URLSearchParams(globalThis.location.search);
    const rawStops = params.get("debugStops");
    if (!rawStops) return null;
    const targetStops = rawStops.split(",").map(Number);
    if (targetStops.length !== CONFIG.reels.length || targetStops.some((stop, reel) => !Number.isInteger(stop) || stop < 0 || stop >= CONFIG.reels[reel].length)) {
      console.warn("Ignored invalid debugStops query value.");
      return null;
    }
    const rawRoll = params.get("debugRoll");
    const roll = rawRoll === null ? null : Number(rawRoll);
    if (roll !== null && (!Number.isInteger(roll) || roll < 0 || roll >= CONFIG.expandingWild.outcomes)) {
      console.warn("Ignored invalid debugRoll query value.");
      return null;
    }
    forcedOutcomeConsumed = true;
    return { targetStops, roll };
  }

  function createResultId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `spin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function saveState() {
    state.gamePhase = phase;
    app.persistence.saveState(state);
  }

  function setPhase(nextPhase, { force = false, persist = false } = {}) {
    if (!force && nextPhase !== phase && !allowedTransitions[phase]?.has(nextPhase)) throw new Error(`Invalid game-state transition: ${phase} -> ${nextPhase}`);
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
      manualStopState: manualStopSnapshot,
      fortuneSpinActive: Boolean(activeSpinResult?.fortuneSpin?.active && phase !== GAME_STATES.IDLE),
    });
  }

  function chooseLossMessage(result = null) {
    if (result?.fortuneSpin?.active) return "The Fortune Spin was consumed. No win this time.";
    const messages = ["No line this time.", "Close. Give it another spin.", "The Commons keeps its coins this round.", "Nothing matched across an active line.", "A cold spin. The next one may turn."];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  function settlePendingSpin() {
    return app.payouts.settlePendingSpinState(state);
  }

  function recoverPendingSpin() {
    if (!state.pendingSpin) {
      setPhase(GAME_STATES.IDLE, { force: true });
      activeSpinResult = null;
      return false;
    }
    const meterBefore = app.payouts.normalizeFortuneMeter(state.fortuneMeter);
    const recovered = settlePendingSpin();
    setPhase(GAME_STATES.IDLE, { force: true });
    activeSpinResult = null;
    saveState();
    if (recovered?.fortuneMeterAward?.totalPoints > 0 || recovered?.fortuneMeterAward?.jackpotCharge) {
      ui.animateFortuneGain({
        from: meterBefore.value,
        to: state.fortuneMeter.value,
        award: recovered.fortuneMeterAward,
        charged: state.fortuneMeter.charged,
      });
    }
    if (recovered?.totalWin > 0) ui.showMessage(`Recovered an interrupted spin and credited ${ui.formatNumber(recovered.totalWin)} coins.`, true);
    else ui.showMessage("Recovered an interrupted spin. No win was due.");
    return true;
  }

  function getWinMessage(result) {
    const linePart = result.lineWins.length
      ? `${result.lineWins.length} winning line${result.lineWins.length === 1 ? "" : "s"}`
      : "No ordinary line win";
    const combinationPart = result.combinationWins.length ? ` plus ${result.combinationWins.map(win => win.name).join(", ")}` : "";
    const fortunePart = result.fortuneSpin?.active && result.fortuneBonus > 0 ? ` Fortune added ${ui.formatNumber(result.fortuneBonus)} coins.` : "";
    return `${linePart}${combinationPart}. You won ${ui.formatNumber(result.totalWin)} coins!${fortunePart}`;
  }

  function ensurePresentationMode() {
    if (phase === GAME_STATES.RESOLVING) setPhase(GAME_STATES.CELEBRATING, { persist: true });
    if (!presentationAbortController) presentationAbortController = new AbortController();
    ui.setPrimaryAction("skip");
    ui.setControlsDisabled(true, state, { allowSpin: true });
    return presentationAbortController.signal;
  }

  function endPresentationMode() {
    presentationCleanup?.();
    presentationCleanup = null;
    presentationAbortController = null;
    ui.hideCelebration();
    ui.hideCombinationCallout();
    ui.hideFortuneResult();
    ui.setPrimaryAction("spin");
    if (phase !== GAME_STATES.IDLE) setPhase(GAME_STATES.IDLE, { force: true, persist: true });
  }

  async function presentFeatureSequence(result) {
    if (!result.transformations.length && !result.combinationWins.length) return;
    const signal = ensurePresentationMode();
    const reducedMotion = app.effects.prefersReducedMotion();

    if (result.transformations.some(item => item.type === "expanding-wild")) {
      ui.markAwakeningSource(result, reels);
      audio.playAwakening();
      await app.effects.presentExpandingWild({ elements: ui.elements, reducedMotion, signal });
      ui.clearAwakeningMark();
    }

    if (signal.aborted) return;
    const combinationWin = result.combinationWins[0];
    if (combinationWin) {
      ui.markCombination(combinationWin, result, reels);
      ui.showCombinationCallout(combinationWin);
      audio.playCombination(combinationWin.id === "full-commune");
      await app.effects.presentCombination({ combinationWin, elements: ui.elements, reducedMotion, signal });
      ui.hideCombinationCallout();
      ui.clearCombinationMarks();
    }
  }

  async function presentFortuneModifier(result) {
    if (!result.fortuneSpin?.active || result.totalWin <= 0) return;
    const signal = ensurePresentationMode();
    if (signal.aborted) return;
    ui.showFortuneResult(result);
    await app.effects.wait(app.effects.prefersReducedMotion() ? 380 : 900, { signal });
    ui.hideFortuneResult();
  }

  function presentSmallWin(result, tier) {
    ui.markWins(result.lineWins, reels, tier);
    ui.setWinDisplay(result.totalWin);
    ui.showMessage(getWinMessage(result), true);
    audio.playTierSound("small");
    app.effects.burstCoins(Math.min(30, 10 + result.lineWins.length * 6 + result.combinationWins.length * 8), ui.elements.reelFrame, {
      reducedMotion: app.effects.prefersReducedMotion(),
      spread: 0.72,
    });
  }

  async function presentCelebration(result, tier) {
    const reducedMotion = app.effects.prefersReducedMotion();
    const signal = ensurePresentationMode();
    const dominantKey = app.payouts.getDominantWinningSymbol(result.lineWins);
    const dominantName = dominantKey ? CONFIG.symbols[dominantKey].name : null;
    const countUpDuration = app.gameFlow.getCountUpDuration(tier, { reducedMotion });
    const celebrationDuration = app.gameFlow.getCelebrationDuration(tier, { reducedMotion });

    ui.markWins(result.lineWins, reels, tier);
    ui.showCelebration({ tier, dominantName });
    ui.showMessage(`${tier === "jackpot" ? "Commune Jackpot" : tier === "big" ? "Big Win" : "Nice Win"}!`, true);
    presentationCleanup = app.effects.startTierEffects({ tier, elements: ui.elements, reducedMotion });
    audio.playTierSound(tier);

    await Promise.all([
      app.effects.countUp({ totalWin: result.totalWin, duration: countUpDuration, signal, onUpdate: ui.updateCelebrationAmount }),
      app.effects.wait(celebrationDuration, { signal }),
    ]);

    ui.updateCelebrationAmount(result.totalWin);
    ui.announceCelebration({ tier, totalWin: result.totalWin });
    ui.showMessage(getWinMessage(result), true);
    endPresentationMode();
  }

  async function presentResult(result) {
    if (presentationAbortController?.signal.aborted) {
      ui.setWinDisplay(result.totalWin);
      ui.showMessage(result.totalWin > 0 ? getWinMessage(result) : chooseLossMessage(result), result.totalWin > 0);
      endPresentationMode();
      return;
    }

    if (result.totalWin <= 0) {
      ui.showMessage(chooseLossMessage(result));
      audio.playLossSound();
      if (phase === GAME_STATES.CELEBRATING) endPresentationMode();
      return;
    }

    const tier = app.gameFlow.getPresentationTier(result, CONFIG.features.winTiers);
    if (!CONFIG.features.winTiers || !app.gameFlow.isLongCelebrationTier(tier)) {
      presentSmallWin(result, tier);
      if (phase === GAME_STATES.CELEBRATING) endPresentationMode();
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
    ui.clearFeaturePresentation();
    ui.hideCelebration();
    ui.setSpinning(true);
    ui.showMessage(state.fortuneMeter?.charged ? "Fortune Spin activated." : "The reels are turning…");
    audio.playSpinStart();

    try {
      await app.bonuses.beforeSpin({ state, totalBet });
      const forcedOutcome = readDevelopmentForcedOutcome();
      const targetStops = forcedOutcome?.targetStops || reels.randomStops();
      const spinResult = app.payouts.createSpinResult({
        targetStops,
        state,
        id: createResultId(),
        featureRolls: forcedOutcome?.roll === null || forcedOutcome?.roll === undefined
          ? null
          : { expandingWild: { roll: forcedOutcome.roll } },
      });

      app.payouts.consumeFortuneChargeState(state, spinResult);
      state.coins -= totalBet;
      state.lastWin = 0;
      state.pendingSpin = spinResult;
      activeSpinResult = spinResult;
      saveState();
      updateDisplay();

      await reels.spinTo(spinResult.targetStops, {
        anticipation: CONFIG.features.spinDrama ? spinResult.anticipation : "none",
        reducedMotion: app.effects.prefersReducedMotion(),
        dramaEnabled: CONFIG.features.spinDrama,
        manualStopsEnabled: CONFIG.features.manualStops,
      });
      ui.setSpinning(false);
      setPhase(GAME_STATES.RESOLVING);

      const meterBeforeSettlement = app.payouts.normalizeFortuneMeter(state.fortuneMeter);
      const settledResult = settlePendingSpin();
      if (!settledResult) throw new Error("Spin result was already settled or unavailable.");
      saveState();
      statistics.recordSpin({ wager: settledResult.wager, payout: settledResult.totalWin });
      ui.animateFortuneGain({
        from: meterBeforeSettlement.value,
        to: state.fortuneMeter.value,
        award: settledResult.fortuneMeterAward,
        charged: state.fortuneMeter.charged,
      });
      updateDisplay();

      await presentFeatureSequence(settledResult);
      await presentFortuneModifier(settledResult);
      await app.bonuses.afterSpin({ state, spinResult: settledResult });
      await presentResult(settledResult);

      if (phase === GAME_STATES.RESOLVING) setPhase(GAME_STATES.IDLE);
      saveState();
    } catch (error) {
      console.error(error);
      presentationAbortController?.abort();
      presentationCleanup?.();
      presentationAbortController = null;
      presentationCleanup = null;
      ui.hideCelebration();
      ui.clearFeaturePresentation();
      ui.setAnticipation("none", false);
      const meterBeforeSettlement = app.payouts.normalizeFortuneMeter(state.fortuneMeter);
      const recovered = settlePendingSpin();
      if (recovered) {
        ui.animateFortuneGain({
          from: meterBeforeSettlement.value,
          to: state.fortuneMeter.value,
          award: recovered.fortuneMeterAward,
          charged: state.fortuneMeter.charged,
        });
      }
      setPhase(GAME_STATES.IDLE, { force: true });
      saveState();
      ui.setSpinning(false);
      if (recovered?.totalWin > 0) ui.showMessage(`The animation was interrupted, but ${ui.formatNumber(recovered.totalWin)} coins were safely credited.`, true);
      else ui.showMessage("The spin was interrupted and safely resolved. Try again.");
    } finally {
      if (phase !== GAME_STATES.IDLE) setPhase(GAME_STATES.IDLE, { force: true, persist: true });
      activeSpinResult = null;
      manualStopSnapshot = null;
      ui.hideCelebration();
      ui.hideCombinationCallout();
      ui.hideFortuneResult();
      ui.setFortuneSpinActive(false);
      ui.setPrimaryAction("spin");
      ui.setControlsDisabled(false, state);
      updateDisplay();
    }
  }

  function skipCelebration() {
    if (phase !== GAME_STATES.CELEBRATING || !presentationAbortController) return false;
    presentationAbortController.abort();
    return true;
  }

  function requestManualStop() {
    if (phase !== GAME_STATES.SPINNING || !CONFIG.features.manualStops) return false;
    const request = reels.requestNextStop();
    if (!request.accepted) return false;
    manualStopSnapshot = reels.getManualStopState();
    updateDisplay();
    return true;
  }

  function handlePrimaryAction() {
    return app.gameFlow.routePrimaryAction({
      phase,
      manualStopsEnabled: CONFIG.features.manualStops,
      onSpin: () => { void spin(); },
      onStop: requestManualStop,
      onSkip: skipCelebration,
    });
  }

  function adjustBet(direction) {
    if (isBusy()) return;
    state.lineBetIndex = Math.min(Math.max(state.lineBetIndex + direction, 0), CONFIG.lineBets.length - 1);
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
    ui.clearFeaturePresentation();
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
    ui.elements.helpModal.addEventListener("click", event => { if (event.target === ui.elements.helpModal) ui.closeHelp(); });
    document.addEventListener("keydown", event => {
      if (ui.isHelpOpen()) { if (event.key === "Escape") ui.closeHelp(); return; }
      if ((event.code === "Space" || event.key === "Enter") && !event.repeat) { event.preventDefault(); handlePrimaryAction(); return; }
      if (event.key === "ArrowLeft") adjustBet(-1);
      if (event.key === "ArrowRight") adjustBet(1);
    });
    globalThis.addEventListener("resize", () => { if (!isBusy()) reels.reposition(); });
  }

  async function initialize() {
    ui.buildPaytable();
    ui.buildCombinationReference();
    bindEvents();
    await reels.buildReels();
    const recovered = recoverPendingSpin();
    if (!recovered) ui.showMessage("Choose a bet and spin.");
    updateDisplay();
  }

  app.game = {
    spin,
    handlePrimaryAction,
    requestManualStop,
    skipCelebration,
    adjustBet,
    refill,
    getState: () => ({ ...state, fortuneMeter: { ...state.fortuneMeter } }),
    getPhase: () => phase,
    getManualStopState: () => reels.getManualStopState(),
    getSessionStatistics: statistics.snapshot,
    getDevelopmentForcedOutcome: () => isDevelopmentHost ? readDevelopmentForcedOutcome() : null,
  };
  void initialize();
})();