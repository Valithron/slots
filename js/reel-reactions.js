(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const BASE_MS = 450;
  const REACTION_MS = 650;
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const active = new Map();
  let capturedUI = null;
  let capturedReels = null;
  let previewTimer = null;
  let pendingCombinationWins = [];

  const normalizeTier = tier => tier === "jackpot" || tier === "big" ? "big" : tier === "combination" || tier === "nice" ? "nice" : tier === "small" ? "small" : "base";
  const baseAsset = symbolKey => app.reactions.resolveReactionAsset(symbolKey, "base");
  function fallbackLevels(tier) {
    const level = normalizeTier(tier);
    return level === "big" ? ["big", "nice", "small", "base"] : level === "nice" ? ["nice", "small", "base"] : level === "small" ? ["small", "base"] : ["base"];
  }
  function resolveVariantChain(symbolKey, tier) {
    if (!symbolKey || symbolKey === "TOL") return [baseAsset("TOL")];
    const seen = new Set();
    return fallbackLevels(tier).map(level => app.reactions.resolveReactionAsset(symbolKey, level)).filter(asset => {
      if (!asset?.path || seen.has(asset.path)) return false;
      seen.add(asset.path);
      return true;
    });
  }
  const cellImage = cell => cell?.querySelector?.("img") || null;
  const keyForCell = (cell, reel, row) => cell?.dataset?.stop ? `${reel}:${cell.dataset.stop}` : `${reel}:${row}`;
  function participatingCells(wins, reelController) {
    const topStops = reelController?.getCurrentTopStops?.() || [];
    const reelElements = reelController?.getReelElements?.() || [];
    const found = new Map();
    (wins || []).forEach(win => (win?.rows || []).forEach((row, reel) => {
      const strip = reelElements[reel]?.strip;
      const reelLength = CONFIG.reels[reel]?.length || 0;
      if (!strip || !reelLength || !Number.isInteger(row)) return;
      const stop = (topStops[reel] + row) % reelLength;
      strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => {
        const key = keyForCell(cell, reel, row);
        if (!found.has(key)) found.set(key, { key, cell, reel, row, symbolKey: win.symbolKey });
      });
    }));
    return [...found.values()];
  }
  function clearTimer(entry) {
    if (entry?.timer) globalThis.clearTimeout(entry.timer);
    if (entry) entry.timer = null;
  }
  function restoreEntry(entry) {
    clearTimer(entry);
    if (!entry?.image) return;
    entry.image.onerror = entry.originalOnError || null;
    if (entry.baseSrc) entry.image.setAttribute("src", entry.baseSrc);
    entry.image.removeAttribute("data-reel-reaction-active");
    entry.image.removeAttribute("data-reel-reaction-tier");
  }
  function stopAll() {
    if (previewTimer) globalThis.clearTimeout(previewTimer);
    previewTimer = null;
    active.forEach(restoreEntry);
    active.clear();
  }
  function installFallback(entry) {
    entry.image.onerror = () => {
      entry.variantIndex += 1;
      while (entry.variantIndex < entry.chain.length && entry.chain[entry.variantIndex]?.path === entry.baseSrc) entry.variantIndex += 1;
      if (entry.variantIndex >= entry.chain.length) {
        entry.reactionSrc = entry.baseSrc;
        entry.image.setAttribute("src", entry.baseSrc);
        return;
      }
      entry.reactionSrc = entry.chain[entry.variantIndex].path;
      entry.image.setAttribute("src", entry.reactionSrc);
    };
  }
  function schedule(entry, showingReaction) {
    clearTimer(entry);
    entry.timer = globalThis.setTimeout(() => {
      if (!active.has(entry.key) || !entry.image?.isConnected) return;
      const nextReaction = !showingReaction;
      entry.image.setAttribute("src", nextReaction ? entry.reactionSrc : entry.baseSrc);
      schedule(entry, nextReaction);
    }, showingReaction ? REACTION_MS : BASE_MS);
  }
  function start(wins, reelController, tier = "small") {
    stopAll();
    const cells = participatingCells(wins, reelController);
    const reducedMotion = globalThis.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true;
    cells.forEach(item => {
      const image = cellImage(item.cell);
      if (!image) return;
      const symbolKey = item.cell.dataset.symbol || item.symbolKey;
      const chain = resolveVariantChain(symbolKey, tier);
      const baseSrc = baseAsset(symbolKey)?.path || image.getAttribute("src") || "";
      const reactionSrc = chain.find(asset => asset?.path && asset.path !== baseSrc)?.path || baseSrc;
      const entry = { ...item, image, symbolKey, chain, variantIndex: Math.max(0, chain.findIndex(asset => asset.path === reactionSrc)), reactionSrc, baseSrc, originalOnError: image.onerror, timer: null };
      active.set(item.key, entry);
      image.dataset.reelReactionActive = "true";
      image.dataset.reelReactionTier = normalizeTier(tier);
      installFallback(entry);
      if (reducedMotion) image.setAttribute("src", reactionSrc);
      else if (reactionSrc !== baseSrc) {
        image.setAttribute("src", baseSrc);
        schedule(entry, false);
      }
    });
    return cells;
  }
  const activeCount = () => active.size;
  function combinationWins(combinationWin) {
    return (combinationWin?.cells || []).map(({ row, reel }) => {
      const rows = Array(CONFIG.reels.length);
      rows[reel] = row;
      return { symbolKey: "TOL", rows };
    });
  }
  function patchFactories() {
    const baseCreateUI = app.ui.createUI;
    app.ui.createUI = function createUIWithReelReactions(...args) {
      const ui = baseCreateUI(...args);
      capturedUI = ui;
      const baseMarkWins = ui.markWins.bind(ui);
      const baseMarkCombination = ui.markCombination?.bind(ui);
      const baseClearWins = ui.clearWins.bind(ui);
      const baseClearFeaturePresentation = ui.clearFeaturePresentation.bind(ui);
      if (baseMarkCombination) ui.markCombination = function markCombinationWithReactions(combinationWin, result, reelController) {
        pendingCombinationWins = combinationWins(combinationWin);
        return baseMarkCombination(combinationWin, result, reelController);
      };
      ui.markWins = function markWinsWithReactions(wins, reelController, tier, options) {
        const result = baseMarkWins(wins, reelController, tier, options);
        if (options?.reaction) start([...(wins || []), ...pendingCombinationWins], reelController, pendingCombinationWins.length ? "nice" : tier);
        pendingCombinationWins = [];
        return result;
      };
      ui.clearWins = function clearWinsWithReactions(...clearArgs) {
        pendingCombinationWins = [];
        stopAll();
        return baseClearWins(...clearArgs);
      };
      ui.clearFeaturePresentation = function clearFeatureWithReactions(...clearArgs) {
        pendingCombinationWins = [];
        stopAll();
        return baseClearFeaturePresentation(...clearArgs);
      };
      ui.stopReelReactions = stopAll;
      return ui;
    };
    const baseCreateReels = app.reels.createReelController;
    app.reels.createReelController = function createCapturedReels(...args) {
      capturedReels = baseCreateReels(...args);
      return capturedReels;
    };
  }
  async function preview(tier, characterKey = "sterling") {
    if (!app.qa?.enabled || !capturedUI || !capturedReels || !app.game) return { ok: false, message: "The game is still initializing." };
    const before = JSON.stringify(app.game.getState());
    stopAll();
    const state = app.game.getState();
    const scenarioId = tier === "combination" ? "combination" : tier === "jackpot" ? "big-win" : `${tier}-win`;
    const scenario = app.qa.findScenario(scenarioId, { state, spinType: "free", referenceBet: app.payouts.getTotalBet(state), totalAwardedSpins: state.freeSpinSession?.totalAwardedSpins || 4 });
    const result = app.payouts.createSpinResult({ targetStops: scenario.targetStops, featureRolls: scenario.featureRolls, state, id: `qa-reel-reaction-${tier}`, spinType: "free", referenceBet: app.payouts.getTotalBet(state), totalAwardedSpins: state.freeSpinSession?.totalAwardedSpins || 4, allyBypass: true });
    await capturedReels.spinTo(result.targetStops, { anticipation: "none", reducedMotion: true, dramaEnabled: false, manualStopsEnabled: false });
    const forcedTier = tier === "jackpot" ? "jackpot" : tier === "combination" ? "nice" : tier;
    capturedUI.clearWins();
    if (tier === "combination" && result.combinationWins[0]) capturedUI.markCombination(result.combinationWins[0], result, capturedReels);
    capturedUI.markWins(result.lineWins, capturedReels, forcedTier, { reaction: true });
    const reaction = app.reactions.selectReaction({ ...result, winTier: forcedTier, finalWinTier: forcedTier }, { enabled: true });
    const model = app.reactions.createReactionPresentationModel(reaction);
    if (model && tier !== "small") {
      capturedUI.showReaction(model, { tier: tier === "combination" ? "combination" : forcedTier });
      previewTimer = globalThis.setTimeout(() => capturedUI.hideReaction(), 1800);
    }
    if (JSON.stringify(app.game.getState()) !== before) throw new Error("QA reel preview changed persistent game state.");
    return { ok: true, message: `${tier === "combination" ? "Commune Combination" : `${tier[0].toUpperCase()}${tier.slice(1)} Win`} reel reaction running for ${characterKey}.` };
  }
  function mountQA() {
    if (!app.qa?.enabled) return;
    const body = document.querySelector(".qa-panel-body");
    if (!body || body.querySelector("[data-reel-reaction-preview]")) return;
    const section = document.createElement("section");
    section.className = "qa-reaction-preview";
    section.dataset.reelReactionPreview = "true";
    section.innerHTML = `<div class="qa-heading"><strong>Reel Reaction Preview</strong><span>No payout or saved progress</span></div>
      <label class="qa-field">Character<select data-reaction-character>${CONFIG.characterPresentation.allMembers.map(id => `<option value="${id}"${id === "sterling" ? " selected" : ""}>${CONFIG.characterPresentation.characters[id]?.name || id}</option>`).join("")}</select></label>
      <div class="qa-row qa-row-split"><button type="button" data-reaction-tier="small">Small Win</button><button type="button" data-reaction-tier="nice">Nice Win</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-reaction-tier="big">Big Win</button><button type="button" data-reaction-tier="jackpot">Jackpot</button></div>
      <button type="button" data-reaction-tier="combination">Commune Combination</button>
      <button class="qa-danger" type="button" data-reaction-clear>Clear Reel Reactions</button>`;
    body.insertBefore(section, body.querySelector(".qa-status"));
    section.addEventListener("click", async event => {
      const tier = event.target.closest("button[data-reaction-tier]")?.dataset.reactionTier;
      if (event.target.closest("button[data-reaction-clear]")) {
        pendingCombinationWins = [];
        stopAll();
        capturedUI?.hideReaction?.();
        return;
      }
      if (!tier) return;
      const character = section.querySelector("[data-reaction-character]")?.value || "sterling";
      try { await preview(tier, character); } catch (error) { console.error(error); }
    });
  }
  patchFactories();
  app.reelReactions = { BASE_MS, REACTION_MS, normalizeTier, fallbackLevels, resolveVariantChain, participatingCells, combinationWins, start, stopAll, activeCount, preview };
  if (app.qa?.enabled) globalThis.setTimeout(mountQA, 0);
})();
