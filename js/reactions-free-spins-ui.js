(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const createBaseUI = app.ui.createUI;

  function createUI() {
    const ui = createBaseUI();
    const { elements } = ui;
    Object.assign(elements, {
      reactionLayer: document.getElementById("reactionLayer"),
      reactionPanel: document.getElementById("reactionPanel"),
      reactionRoster: document.getElementById("reactionRoster"),
      reactionTree: document.getElementById("reactionTree"),
      reactionKicker: document.getElementById("reactionKicker"),
      reactionName: document.getElementById("reactionName"),
      reactionAmount: document.getElementById("reactionAmount"),
      reactionAnnouncer: document.getElementById("reactionAnnouncer"),
      freeSpinLayer: document.getElementById("freeSpinLayer"),
      freeSpinPanel: document.getElementById("freeSpinPanel"),
      freeSpinRoster: document.getElementById("freeSpinRoster"),
      freeSpinTitle: document.getElementById("freeSpinTitle"),
      freeSpinAward: document.getElementById("freeSpinAward"),
      freeSpinDetail: document.getElementById("freeSpinDetail"),
      freeSpinSummaryGrid: document.getElementById("freeSpinSummaryGrid"),
      freeSpinAnnouncer: document.getElementById("freeSpinAnnouncer"),
      freeSpinsHud: document.getElementById("freeSpinsHud"),
      freeSpinsRemaining: document.getElementById("freeSpinsRemaining"),
      featureWinValue: document.getElementById("featureWinValue"),
      lockedBetValue: document.getElementById("lockedBetValue"),
    });

    const formatNumber = value => Math.floor(Number(value) || 0).toLocaleString();
    const genericAsset = () => app.reactions.versionAssetUrl(CONFIG.characterPresentation.genericAsset);

    function safeImageMarkup(asset, alt = "", className = "") {
      const src = asset?.path || genericAsset();
      const fallback = asset?.fallbackPath || asset?.genericPath || genericAsset();
      const generic = asset?.genericPath || genericAsset();
      const safeAlt = String(alt).replaceAll('"', '&quot;');
      return `<img${className ? ` class="${className}"` : ""} src="${src}" data-fallback-src="${fallback}" data-generic-src="${generic}" alt="${safeAlt}">`;
    }

    function installImageFallbacks(root = document) {
      root?.querySelectorAll?.("img[data-fallback-src]").forEach(image => {
        if (image.dataset.fallbackBound === "true") return;
        image.dataset.fallbackBound = "true";
        image.addEventListener("error", () => {
          const fallback = image.dataset.fallbackSrc;
          const generic = image.dataset.genericSrc;
          const current = image.getAttribute("src") || "";
          if (fallback && current !== fallback) {
            image.setAttribute("src", fallback);
            image.dataset.fallbackSrc = generic || "";
          } else if (generic && current !== generic) {
            image.setAttribute("src", generic);
            image.removeAttribute("data-fallback-src");
          }
        });
      });
    }

    function buildRoster(container, characterKeys, { full = false, decorative = true } = {}) {
      if (!container) return;
      const keys = Array.isArray(characterKeys) ? characterKeys : [];
      container.className = `reaction-roster${keys.length > 1 ? " is-group" : ""}${full ? " is-full" : ""}`;
      container.innerHTML = keys.map(key => {
        const character = CONFIG.characterPresentation.characters[key];
        return safeImageMarkup(app.reactions.resolveReactionAsset(key, "base"), decorative ? "" : (character?.name || key), "reaction-portrait");
      }).join("");
      if (decorative) container.querySelectorAll("img").forEach(image => image.setAttribute("aria-hidden", "true"));
      installImageFallbacks(container);
    }

    function clearCellClasses(classNames) {
      document.querySelectorAll(classNames.map(name => `.symbol-cell.${name}`).join(",")).forEach(cell => {
        classNames.forEach(name => cell.classList.remove(name));
        cell.style.removeProperty("--feature-accent");
        cell.style.removeProperty("--reaction-cell-accent");
      });
    }

    function cellsForCoordinates(cells, reelController, matrix) {
      const topStops = reelController.getCurrentTopStops();
      const reelElements = reelController.getReelElements();
      const found = [];
      (cells || []).forEach(({ row, reel }) => {
        const stop = (topStops[reel] + row) % CONFIG.reels[reel].length;
        const symbolKey = matrix?.[row]?.[reel];
        reelElements[reel].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => found.push({ cell, symbolKey }));
      });
      return found;
    }

    function updateFreeSpinsHud(session) {
      const active = Boolean(session?.active);
      if (elements.freeSpinsHud) elements.freeSpinsHud.hidden = !active;
      elements.machine?.classList.toggle("is-free-spins", active);
      if (!active) return;
      elements.freeSpinsRemaining.textContent = formatNumber(session.remainingSpins);
      elements.featureWinValue.textContent = formatNumber(session.accumulatedWin);
      elements.lockedBetValue.textContent = formatNumber(session.referenceBet);
    }

    function setPrimaryAction(mode, { reelIndex = null } = {}) {
      const labels = { spin: "Spin", skip: "Skip", stop: "Stop", "stop-disabled": "Stop", start: "Start", continue: "Continue", disabled: "Spin" };
      elements.spinButton.textContent = labels[mode] || "Spin";
      const aria = mode === "skip" ? "Skip remaining presentation"
        : mode === "stop" || mode === "stop-disabled" ? app.gameFlow.getStopAriaLabel(reelIndex)
          : mode === "start" ? "Start Commune Free Spins"
            : mode === "continue" ? "Continue to normal play"
              : mode === "spin" ? "Spin the reels" : "Action unavailable";
      elements.spinButton.setAttribute("aria-label", aria);
      elements.spinButton.classList.toggle("is-skip", mode === "skip");
      elements.spinButton.classList.toggle("is-stop", mode === "stop" || mode === "stop-disabled");
      elements.spinButton.disabled = mode === "stop-disabled" || mode === "disabled";
    }

    function updateDisplay({ state, phase, lineBet, totalBet, manualStopState = null, fortuneSpinActive = false }) {
      const session = state.freeSpinSession;
      const busy = phase !== GAME_STATES.IDLE;
      const nextStopIndex = manualStopState?.nextStopIndex ?? null;
      const reelsMoving = phase === GAME_STATES.SPINNING
        || (phase === GAME_STATES.FREE_SPINS && session?.status === app.freeSpins.FREE_SPIN_STATUSES.SPINNING);
      elements.coinsValue.textContent = formatNumber(state.coins);
      elements.betValue.textContent = formatNumber(totalBet);
      elements.winValue.textContent = formatNumber(state.lastWin);
      elements.lineBetValue.textContent = lineBet;
      elements.soundState.textContent = state.sound ? "On" : "Off";
      elements.betDown.disabled = busy || Boolean(session?.active) || state.lineBetIndex === 0;
      elements.betUp.disabled = busy || Boolean(session?.active) || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = busy || Boolean(session?.active);
      const mode = app.gameFlow.getPrimaryActionMode({
        phase,
        freeSpinStatus: session?.status || null,
        reelsMoving,
        manualStopsEnabled: CONFIG.features.manualStops,
        nextStopIndex,
      });
      setPrimaryAction(mode, { reelIndex: nextStopIndex });
      ui.updateFortuneMeter({ meter: state.fortuneMeter, active: fortuneSpinActive });
      ui.setFortuneSpinActive(fortuneSpinActive);
      updateFreeSpinsHud(session);
      elements.spinButton.classList.toggle("fortune-ready", phase === GAME_STATES.IDLE && Boolean(state.fortuneMeter?.charged));
    }

    function setControlsDisabled(disabled, state, { allowSpin = false } = {}) {
      elements.spinButton.disabled = disabled && !allowSpin;
      elements.betDown.disabled = disabled || Boolean(state.freeSpinSession?.active) || state.lineBetIndex === 0;
      elements.betUp.disabled = disabled || Boolean(state.freeSpinSession?.active) || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = disabled || Boolean(state.freeSpinSession?.active);
    }

    const baseMarkWins = ui.markWins;
    function markWins(wins, reelController, tier = "small", { reaction = false } = {}) {
      baseMarkWins(wins, reelController, tier);
      if (!reaction) return;
      const topStops = reelController.getCurrentTopStops();
      const reelElements = reelController.getReelElements();
      wins.forEach(win => win.rows.forEach((row, reelIndex) => {
        const stop = (topStops[reelIndex] + row) % CONFIG.reels[reelIndex].length;
        reelElements[reelIndex].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => {
          cell.classList.add("is-reaction-win");
          cell.style.setProperty("--reaction-cell-accent", CONFIG.characterAccentColorMap[win.symbolKey] || CONFIG.characterAccentColorMap.TOL);
        });
      }));
    }

    function markTriggerTrees(cells, resultOrMatrix, reelController) {
      clearCellClasses(["is-trigger-tree"]);
      const matrix = resultOrMatrix?.originalMatrix || resultOrMatrix;
      cellsForCoordinates(cells, reelController, matrix).forEach(({ cell }) => cell.classList.add("is-trigger-tree"));
    }
    function clearTriggerTrees() { clearCellClasses(["is-trigger-tree"]); }

    function showReaction(model, { tier = model?.level || "nice", compact = false } = {}) {
      if (!model || !elements.reactionLayer) return false;
      elements.reactionLayer.className = `reaction-layer is-visible tier-${tier}${compact ? " is-compact" : ""}${model.type === "group" ? " is-group" : ""}`;
      elements.reactionLayer.setAttribute("aria-hidden", "false");
      elements.reactionPanel.style.setProperty("--reaction-accent", model.accent || CONFIG.characterAccentColorMap.TOL);
      buildRoster(elements.reactionRoster, model.portraits.map(item => item.characterKey), { full: model.portraits.length >= 7 });
      elements.reactionTree.hidden = !model.includesTree && model.type !== "tree";
      if (!elements.reactionTree.hidden) {
        const tree = model.treeAsset || app.reactions.resolveReactionAsset("TOL", "base");
        elements.reactionTree.src = tree.path;
        elements.reactionTree.dataset.fallbackSrc = tree.fallbackPath || tree.genericPath || "";
        elements.reactionTree.dataset.genericSrc = tree.genericPath || "";
        installImageFallbacks(elements.reactionLayer);
      }
      const labels = { small: "Small Win", nice: "Nice Win", big: "Big Win", jackpot: "Commune Jackpot", combination: "Commune Combination", summary: "Feature MVP" };
      elements.reactionKicker.textContent = labels[tier] || labels[model.level] || "Commune Win";
      elements.reactionName.textContent = model.label || "The Commune";
      elements.reactionAmount.textContent = formatNumber(model.payout);
      elements.reactionPanel.setAttribute("aria-label", model.accessibleLabel);
      elements.reactionAnnouncer.textContent = model.accessibleLabel;
      return true;
    }
    function updateReactionAmount(value) { elements.reactionAmount.textContent = formatNumber(value); ui.setWinDisplay(value); }
    function hideReaction() {
      if (!elements.reactionLayer) return;
      elements.reactionLayer.className = "reaction-layer";
      elements.reactionLayer.setAttribute("aria-hidden", "true");
      elements.reactionRoster.innerHTML = "";
    }

    function showFreeSpinIntro(session) {
      elements.freeSpinLayer.className = "free-spin-layer is-visible is-intro";
      elements.freeSpinLayer.setAttribute("aria-hidden", "false");
      buildRoster(elements.freeSpinRoster, CONFIG.characterPresentation.allMembers, { full: true });
      elements.freeSpinTitle.textContent = "Commune Free Spins";
      elements.freeSpinAward.textContent = `${session.startingSpins} Free Spins`;
      elements.freeSpinDetail.textContent = "Three natural Trees landed, one on each reel. Press Start.";
      elements.freeSpinSummaryGrid.hidden = true;
      const label = `${session.startingSpins} Commune Free Spins awarded. Press Start.`;
      elements.freeSpinPanel.setAttribute("aria-label", label);
      elements.freeSpinAnnouncer.textContent = label;
    }
    function showRetrigger(result) {
      elements.freeSpinLayer.className = "free-spin-layer is-visible is-retrigger";
      elements.freeSpinLayer.setAttribute("aria-hidden", "false");
      elements.freeSpinRoster.innerHTML = "";
      elements.freeSpinTitle.textContent = "Three Trees";
      elements.freeSpinAward.textContent = `+${result.freeSpinSettlement?.retriggerApplied ?? result.freeSpinTrigger?.awardedSpins ?? 0} Free Spins`;
      elements.freeSpinDetail.textContent = result.freeSpinTrigger?.capped ? "The twenty-spin session cap has been reached." : "The Commune feature continues.";
      elements.freeSpinSummaryGrid.hidden = true;
      elements.freeSpinAnnouncer.textContent = `${elements.freeSpinTitle.textContent}. ${elements.freeSpinAward.textContent}.`;
    }
    function showFreeSpinSummary(summary, reactionModel) {
      elements.freeSpinLayer.className = "free-spin-layer is-visible is-summary";
      elements.freeSpinLayer.setAttribute("aria-hidden", "false");
      const keys = reactionModel?.portraits?.map(item => item.characterKey) || CONFIG.characterPresentation.allMembers;
      buildRoster(elements.freeSpinRoster, keys, { full: keys.length >= 7 });
      elements.freeSpinTitle.textContent = "Commune Free Spins Complete";
      elements.freeSpinAward.textContent = `${formatNumber(summary.accumulatedWin)} Coins`;
      elements.freeSpinDetail.textContent = reactionModel?.label || "The Commune";
      elements.freeSpinSummaryGrid.hidden = false;
      elements.freeSpinSummaryGrid.innerHTML = `<div><span>Spins Played</span><strong>${formatNumber(summary.completedSpins)}</strong></div><div><span>Retriggers</span><strong>${formatNumber(summary.retriggerCount)}</strong></div><div><span>Total Awarded</span><strong>${formatNumber(summary.totalAwardedSpins)}</strong></div><div><span>Feature Win</span><strong>${formatNumber(summary.accumulatedWin)}</strong></div>`;
      const label = `Commune Free Spins complete. ${summary.completedSpins} spins played, ${summary.retriggerCount} retriggers, and ${summary.accumulatedWin} coins won. ${reactionModel?.label || "Commune result"}. Press Continue.`;
      elements.freeSpinPanel.setAttribute("aria-label", label);
      elements.freeSpinAnnouncer.textContent = label;
    }
    function hideFreeSpinLayer() {
      if (!elements.freeSpinLayer) return;
      elements.freeSpinLayer.className = "free-spin-layer";
      elements.freeSpinLayer.setAttribute("aria-hidden", "true");
      elements.freeSpinSummaryGrid.hidden = true;
    }

    const baseClearWins = ui.clearWins;
    function clearWins() { baseClearWins(); clearCellClasses(["is-reaction-win", "is-trigger-tree"]); }
    const baseClearFeaturePresentation = ui.clearFeaturePresentation;
    function clearFeaturePresentation(options) {
      baseClearFeaturePresentation(options);
      clearCellClasses(["is-reaction-win", "is-trigger-tree"]);
      hideReaction();
    }

    Object.assign(ui, {
      elements,
      installImageFallbacks,
      updateDisplay,
      updateFreeSpinsHud,
      setControlsDisabled,
      setPrimaryAction,
      clearWins,
      markWins,
      markTriggerTrees,
      clearTriggerTrees,
      showReaction,
      updateReactionAmount,
      hideReaction,
      showFreeSpinIntro,
      showRetrigger,
      showFreeSpinSummary,
      hideFreeSpinLayer,
      clearFeaturePresentation,
    });
    return ui;
  }

  app.ui = { createUI };
})();
