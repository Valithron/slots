(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const FS = app.freeSpins.FREE_SPIN_STATUSES;
  const ui = app.ui.createUI();
  let state = app.persistence.loadState();
  let phase = app.freeSpins.getSessionPhase(state.freeSpinSession, state.pendingSpin);
  let aborter = null;
  let cleanup = null;
  let manualStops = null;
  let currentResult = state.pendingSpin;
  let loop = null;

  const audio = app.audio.createAudio(() => state.sound);
  const statistics = app.statistics.createStatistics();
  const reels = app.reels.createReelController({
    reelGrid: ui.elements.reelGrid,
    playTick: audio.playTick,
    playReelStop: audio.playReelStop,
    onReelStop: (index, options) => app.effects.reelImpact(ui.elements.machine, ui.elements.reelFrame, index, options),
    onAnticipation: (level, active) => {
      ui.setAnticipation(level, active);
      app.effects.setAnticipation(ui.elements.machine, reels.getReelElements(), level, active);
      if (active) audio.playAnticipation(level);
    },
    onManualStopStateChange: value => { manualStops = value; render(); },
  });

  const id = prefix => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const activeSession = () => state.freeSpinSession?.active;
  const lineBet = () => activeSession() ? state.freeSpinSession.lockedLineBet : app.payouts.getLineBet(state);
  const totalBet = () => activeSession() ? state.freeSpinSession.referenceBet : app.payouts.getTotalBet(state);
  function save() { state.gamePhase = phase; app.persistence.saveState(state); }
  function setPhase(value, persist = false) { phase = value; state.gamePhase = value; if (persist) save(); }
  function render() {
    ui.updateDisplay({
      state, phase, lineBet: lineBet(), totalBet: totalBet(), manualStopState: manualStops,
      fortuneSpinActive: Boolean(currentResult?.fortuneSpin?.active && phase !== GAME_STATES.IDLE),
    });
  }
  function setMessage(result) {
    if (!result.totalWin) return ui.showMessage(result.spinType === "free" ? "No win on this free spin." : "No line this time.");
    const lines = result.lineWins.length ? `${result.lineWins.length} winning line${result.lineWins.length === 1 ? "" : "s"}` : "No ordinary line win";
    const combo = result.combinationWins.length ? ` plus ${result.combinationWins.map(win => win.name).join(", ")}` : "";
    ui.showMessage(`${lines}${combo}. You won ${ui.formatNumber(result.totalWin)} coins!`, true);
  }
  function clearPresentation() {
    cleanup?.(); cleanup = null; aborter = null;
    ui.hideCelebration(); ui.hideReaction(); ui.hideCombinationCallout(); ui.hideFortuneResult(); ui.hideAllyCallout?.();
    ui.clearAwakeningMark(); ui.clearCombinationMarks(); ui.clearTriggerTrees();
  }
  function signal(free = false) {
    aborter ||= new AbortController();
    if (!free) setPhase(GAME_STATES.CELEBRATING, true);
    ui.setPrimaryAction("skip"); ui.setControlsDisabled(true, state, { allowSpin: true }); render();
    return aborter.signal;
  }
  async function restore(result) {
    if (!result?.targetStops || JSON.stringify(reels.getCurrentTopStops()) === JSON.stringify(result.targetStops)) return;
    ui.setSpinning(true);
    await reels.spinTo(result.targetStops, { anticipation: "none", reducedMotion: true, dramaEnabled: false, manualStopsEnabled: false });
    ui.setSpinning(false);
  }
  async function presentFeatures(result, free) {
    if (!result.transformations.length && !result.combinationWins.length) return;
    const s = signal(free); const reduced = app.effects.prefersReducedMotion();
    if (result.transformations.some(item => item.type === "expanding-wild")) {
      ui.markAwakeningSource(result, reels); audio.playAwakening();
      await app.effects.presentExpandingWild({ elements: ui.elements, reducedMotion: reduced || free, signal: s });
      ui.clearAwakeningMark();
    }
    if (!s.aborted && result.combinationWins[0]) {
      const win = result.combinationWins[0];
      ui.markCombination(win, result, reels); ui.showCombinationCallout(win); audio.playCombination(win.id === "full-commune");
      await app.effects.presentCombination({ combinationWin: win, elements: ui.elements, reducedMotion: reduced || free, signal: s });
      ui.hideCombinationCallout(); ui.clearCombinationMarks();
    }
  }
  async function presentResult(result, free = false, featuresAlreadyPresented = false) {
    if (!featuresAlreadyPresented) await presentFeatures(result, free);
    const reduced = app.effects.prefersReducedMotion();
    const tier = app.gameFlow.getPresentationTier(result, CONFIG.features.winTiers);
    const reaction = app.reactions.selectReaction(result, { enabled: CONFIG.features.characterReactions, compact: free, reducedMotion: reduced });
    const model = app.reactions.createReactionPresentationModel(reaction);
    setMessage(result);
    if (!result.totalWin) {
      audio.playLossSound();
      if (free) await app.effects.wait(reduced ? 100 : 260, { signal: signal(true) });
      return;
    }
    ui.markWins(result.lineWins, reels, tier, { reaction: Boolean(reaction) }); ui.setWinDisplay(result.totalWin);
    const panel = model && (app.gameFlow.isLongCelebrationTier(tier) || reaction.level === "combination");
    if (!panel) {
      audio.playTierSound("small"); app.effects.burstCoins(16, ui.elements.reelFrame, { reducedMotion: reduced, spread: 0.72 });
      if (free) await app.effects.wait(reduced ? 100 : 300, { signal: signal(true) });
      return;
    }
    const s = signal(free); const shownTier = reaction.level === "combination" ? "nice" : tier;
    ui.showReaction(model, { tier: reaction.level || shownTier, compact: free }); ui.updateReactionAmount(0);
    model.type === "character" ? audio.playCharacterReaction(shownTier) : audio.playGroupReaction();
    audio.playTierSound(shownTier); cleanup = app.effects.startTierEffects({ tier: shownTier, elements: ui.elements, reducedMotion: reduced });
    await Promise.all([
      app.effects.countUp({ totalWin: result.totalWin, duration: app.gameFlow.getCountUpDuration(shownTier, { reducedMotion: reduced, compact: free }), signal: s, onUpdate: ui.updateReactionAmount }),
      app.effects.wait(app.gameFlow.getCelebrationDuration(shownTier, { reducedMotion: reduced, compact: free }), { signal: s }),
    ]);
    ui.updateReactionAmount(result.totalWin);
  }
  function settle() { return app.payouts.settlePendingSpinState(state); }
  async function spinAnimation(result, { manualStopsEnabled = CONFIG.features.manualStops } = {}) {
    ui.setSpinning(true); audio.playSpinStart();
    await reels.spinTo(result.targetStops, {
      anticipation: CONFIG.features.spinDrama ? result.anticipation : "none",
      reducedMotion: app.effects.prefersReducedMotion(), dramaEnabled: CONFIG.features.spinDrama,
      manualStopsEnabled,
    });
    ui.setSpinning(false);
  }
  async function presentAllyCallout(activation) {
    if (!activation?.activated || !ui.showAllyCallout?.(activation, state.freeSpinSession)) return;
    const duration = app.effects.prefersReducedMotion() ? 180 : 520;
    await app.effects.wait(duration);
    ui.hideAllyCallout();
  }
  function replayActivation(result) {
    if (result.allyReplay?.type === "gabi") return {
      allyId: "gabi", abilityName: CONFIG.allies.gabi.abilityName, activated: true,
      selected: result.allyReplay.selected, bonus: result.allyReplay.netImprovement,
    };
    if (result.allyReplay?.type === "ashley") return {
      allyId: "ashley", abilityName: CONFIG.allies.ashley.abilityName, activated: true,
      bonus: result.allyReplay.netImprovement,
    };
    return null;
  }
  async function animateAuthoritativeFreeResult(result) {
    if (result.allyEffect?.allyId === "ryan" && result.allyEffect.activated) await presentAllyCallout(result.allyEffect);
    if (!result.allyReplay) return spinAnimation(result);
    await spinAnimation(result.allyReplay.originalResult);
    await presentAllyCallout(replayActivation(result));
    await spinAnimation(result.allyReplay.replacementResult);
    if (result.allyReplay.selected === "original") await restore(result.allyReplay.originalResult);
  }
  async function paidSpin() {
    if (phase !== GAME_STATES.IDLE || activeSession()) return;
    const cost = app.payouts.getTotalBet(state);
    if (state.coins < cost) { ui.showMessage("Not enough coins. Lower the bet or refill."); return audio.playErrorSound(); }
    setPhase(GAME_STATES.SPINNING); ui.clearWins(); ui.clearFeaturePresentation(); ui.showMessage("The reels are turning…");
    try {
      await app.bonuses.beforeSpin({ state, totalBet: cost });
      const result = app.payouts.createSpinResult({ targetStops: reels.randomStops(), state, id: id("spin"), spinType: "paid" });
      app.payouts.consumeFortuneChargeState(state, result); state.coins -= result.coinCost; state.lastWin = 0; state.pendingSpin = result; currentResult = result; save(); render();
      await spinAnimation(result); setPhase(GAME_STATES.RESOLVING);
      const before = app.payouts.normalizeFortuneMeter(state.fortuneMeter); const done = settle();
      statistics.recordSpin({ wager: done.referenceBet, coinCost: done.coinCost, payout: done.totalWin, spinType: "paid" }); save();
      ui.animateFortuneGain({ from: before.value, to: state.fortuneMeter.value, award: done.fortuneMeterAward, charged: state.fortuneMeter.charged });
      await presentResult(done); await app.bonuses.afterSpin({ state, spinResult: done }); clearPresentation();
      if (activeSession()) await showIntro(); else setPhase(GAME_STATES.IDLE, true);
    } catch (error) {
      console.error(error); aborter?.abort(); clearPresentation();
      const done = settle(); if (done) statistics.recordSpin({ wager: done.referenceBet, coinCost: done.coinCost, payout: done.totalWin, spinType: done.spinType });
      save(); activeSession() ? await showIntro() : setPhase(GAME_STATES.IDLE, true);
    } finally { currentResult = null; manualStops = null; ui.setSpinning(false); render(); }
  }
  async function showIntro() {
    const session = state.freeSpinSession; if (!session?.active) return;
    setPhase(GAME_STATES.BONUS, true); clearPresentation(); ui.hideFreeSpinLayer(); await restore(session.triggerResult);
    ui.markTriggerTrees(session.triggerTreeCells, session.triggerResult, reels);
    if (CONFIG.features.chooseYourAlly && !session.ally?.confirmed && !session.ally?.legacyNoAlly) {
      ui.showAllySelection(session);
      ui.showMessage("Choose one ally, then confirm your choice.", true);
      ui.setControlsDisabled(true, state);
      audio.playFreeSpinTrigger(); render(); return;
    }
    ui.hideAllySelection?.(); ui.showFreeSpinIntro(session);
    ui.showMessage(`${session.startingSpins} Commune Free Spins awarded.`, true); ui.setPrimaryAction("start");
    ui.setControlsDisabled(true, state, { allowSpin: true }); render();
  }
  async function showSummary() {
    if (!activeSession()) return;
    state.freeSpinSession = app.freeSpins.markSummary(state.freeSpinSession); setPhase(GAME_STATES.BONUS, true); clearPresentation();
    await restore(state.freeSpinSession.lastResult); const summary = app.freeSpins.getSessionSummary(state.freeSpinSession);
    ui.showFreeSpinSummary(summary, app.reactions.createSummaryReaction(state.freeSpinSession)); ui.setPrimaryAction("continue");
    ui.setControlsDisabled(true, state, { allowSpin: true }); ui.showMessage(`Commune Free Spins won ${ui.formatNumber(summary.accumulatedWin)} coins.`, summary.accumulatedWin > 0);
    audio.playFreeSpinSummary(); render();
  }
  async function presentFree(result) {
    setPhase(GAME_STATES.FREE_SPINS, true); const s = signal(true); await presentFeatures(result, true);
    if (!s.aborted && result.freeSpinTrigger?.triggered) {
      ui.markTriggerTrees(result.freeSpinTrigger.treeCells, result, reels); ui.showRetrigger(result); audio.playRetrigger();
      await app.effects.wait(app.effects.prefersReducedMotion() ? 220 : CONFIG.characterPresentation.durations.retrigger, { signal: s });
      ui.hideFreeSpinLayer(); ui.clearTriggerTrees();
    }
    await presentResult(result, true, true); clearPresentation(); ui.hideFreeSpinLayer();
    state.freeSpinSession = app.freeSpins.markFreeSpinPresented(state.freeSpinSession, result.id); save(); render();
  }
  async function freeLoop() {
    if (loop) return loop;
    loop = (async () => {
      try {
        while (activeSession()) {
          const session = state.freeSpinSession;
          if (session.status === FS.PRESENTING) {
            if (session.presentationSpin) { await restore(session.presentationSpin); await presentFree(session.presentationSpin); }
            else { state.freeSpinSession = app.freeSpins.markFreeSpinPresented(session, session.lastSettledFreeSpinId); save(); }
          } else if (session.status === FS.COMPLETE || session.remainingSpins <= 0) { await showSummary(); break; }
          else if (session.status === FS.READY) {
            session.status = FS.SPINNING; setPhase(GAME_STATES.FREE_SPINS); ui.clearWins(); ui.clearFeaturePresentation();
            const result = app.payouts.createSpinResult({ targetStops: reels.randomStops(), state: app.freeSpins.getLockedSpinState(session, state), id: id("free"), spinType: "free", referenceBet: session.referenceBet, totalAwardedSpins: session.totalAwardedSpins });
            state.pendingSpin = result; currentResult = result; save(); render(); await animateAuthoritativeFreeResult(result);
            const done = settle(); statistics.recordSpin({ wager: done.referenceBet, coinCost: 0, payout: done.totalWin, spinType: "free" }); save(); render();
            const activation = state.freeSpinSession?.ally?.lastActivation;
            const alreadyPresented = done.allyReplay || done.allyEffect?.allyId === "ryan";
            if (!alreadyPresented && activation?.activated) await presentAllyCallout(activation);
          } else break;
          if (state.freeSpinSession?.status === FS.READY) await app.effects.wait(app.effects.prefersReducedMotion() ? CONFIG.freeSpins.reducedMotionDelay : CONFIG.freeSpins.autoAdvanceDelay);
        }
      } catch (error) {
        console.error(error); aborter?.abort(); clearPresentation(); const done = settle();
        if (done) statistics.recordSpin({ wager: done.referenceBet, coinCost: 0, payout: done.totalWin, spinType: "free" }); save();
        if (activeSession()) state.freeSpinSession.remainingSpins > 0 ? void freeLoop() : await showSummary();
      } finally { loop = null; currentResult = null; manualStops = null; ui.setSpinning(false); render(); }
    })();
    return loop;
  }
  function startFreeSpins() {
    if (!app.freeSpins.canStartFeature(state.freeSpinSession)) return false;
    state.freeSpinSession = app.allies.beginFeature(state.freeSpinSession);
    ui.clearTriggerTrees(); ui.hideFreeSpinLayer(); ui.hideAllySelection?.(); state.freeSpinSession.status = FS.READY; setPhase(GAME_STATES.FREE_SPINS, true);
    audio.playFreeSpinStart(); render(); void freeLoop(); return true;
  }
  function selectAlly(allyId) {
    if (!activeSession() || state.freeSpinSession.status !== FS.INTRO) return false;
    state.freeSpinSession = app.allies.setPendingSelection(state.freeSpinSession, allyId); save(); ui.showAllySelection(state.freeSpinSession); render(); return true;
  }
  function confirmAlly() {
    if (!activeSession() || state.freeSpinSession.status !== FS.INTRO || !state.freeSpinSession.ally?.selectedId) return false;
    state.freeSpinSession = app.allies.confirmSelection(state.freeSpinSession); save(); ui.hideAllySelection(); void showIntro(); return true;
  }
  function continueSummary() {
    if (phase !== GAME_STATES.BONUS || !activeSession() || ![FS.SUMMARY, FS.COMPLETE].includes(state.freeSpinSession.status)) return false;
    ui.hideFreeSpinLayer(); ui.hideAllySelection?.(); ui.hideAllyCallout?.(); state.freeSpinSession = null; state.lastWin = 0; setPhase(GAME_STATES.IDLE, true);
    ui.showMessage("Choose a bet and spin."); ui.setControlsDisabled(false, state); render(); return true;
  }
  function requestStop() {
    const moving = phase === GAME_STATES.SPINNING || (phase === GAME_STATES.FREE_SPINS && state.freeSpinSession?.status === FS.SPINNING);
    if (!moving || !CONFIG.features.manualStops) return false;
    const request = reels.requestNextStop(); if (!request.accepted) return false; manualStops = reels.getManualStopState(); render(); return true;
  }
  function skip() { if (!aborter || ![GAME_STATES.CELEBRATING, GAME_STATES.FREE_SPINS].includes(phase)) return false; aborter.abort(); return true; }
  function primary() {
    return app.gameFlow.routePrimaryAction({
      phase, freeSpinStatus: state.freeSpinSession?.status, reelsMoving: phase === GAME_STATES.SPINNING || state.freeSpinSession?.status === FS.SPINNING,
      manualStopsEnabled: CONFIG.features.manualStops, onSpin: () => void paidSpin(), onStop: requestStop, onSkip: skip, onStart: startFreeSpins, onContinue: continueSummary,
    });
  }
  function bet(delta) {
    if (phase !== GAME_STATES.IDLE || activeSession()) return;
    state.lineBetIndex = Math.min(Math.max(state.lineBetIndex + delta, 0), CONFIG.lineBets.length - 1); state.lastWin = 0; save(); render(); audio.playButtonTone();
  }
  function refill() { if (phase !== GAME_STATES.IDLE || activeSession()) return; state.coins = CONFIG.startingCoins; state.lastWin = 0; save(); ui.clearWins(); render(); audio.playRefillSound(); }
  function bind() {
    ui.elements.betDown.addEventListener("click", () => bet(-1)); ui.elements.betUp.addEventListener("click", () => bet(1));
    ui.elements.spinButton.addEventListener("click", primary); ui.elements.refillButton.addEventListener("click", refill);
    ui.elements.soundButton.addEventListener("click", () => { state.sound = !state.sound; save(); render(); if (state.sound) audio.playButtonTone(); });
    ui.elements.helpButton.addEventListener("click", ui.openHelp); ui.elements.closeHelp.addEventListener("click", ui.closeHelp);
    ui.elements.helpModal.addEventListener("click", event => { if (event.target === ui.elements.helpModal) ui.closeHelp(); });
    ui.bindAllySelection?.({ onSelect: selectAlly, onConfirm: confirmAlly });
    document.addEventListener("keydown", event => {
      if (ui.isHelpOpen()) { if (event.key === "Escape") ui.closeHelp(); return; }
      if ((event.code === "Space" || event.key === "Enter") && !event.repeat) { event.preventDefault(); primary(); }
      else if (event.key === "ArrowLeft") bet(-1); else if (event.key === "ArrowRight") bet(1);
    });
  }
  async function recover() {
    if (state.pendingSpin) { const done = settle(); if (done) statistics.recordSpin({ wager: done.referenceBet, coinCost: done.coinCost, payout: done.totalWin, spinType: done.spinType }); save(); }
    if (!activeSession()) { setPhase(GAME_STATES.IDLE, true); ui.showMessage("Choose a bet and spin."); return; }
    const status = state.freeSpinSession.status;
    if (status === FS.INTRO) return showIntro(); if ([FS.COMPLETE, FS.SUMMARY].includes(status)) return showSummary();
    if (status === FS.SPINNING && !state.pendingSpin) { state.freeSpinSession.status = FS.READY; save(); }
    setPhase(GAME_STATES.FREE_SPINS, true); void freeLoop();
  }
  async function init() { ui.buildPaytable(); ui.buildCombinationReference(); bind(); await reels.buildReels(); await recover(); render(); }
  app.game = { spin: paidSpin, handlePrimaryAction: primary, requestManualStop: requestStop, skipCelebration: skip, startFreeSpins, selectAlly, confirmAlly, continueFromSummary: continueSummary, adjustBet: bet, refill, getState: () => structuredClone(state), getPhase: () => phase, getManualStopState: () => reels.getManualStopState(), getSessionStatistics: statistics.snapshot };
  void init();
})();
