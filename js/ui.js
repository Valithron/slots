(() => {
  "use strict";
  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;

  function createUI() {
    const elements = {
      reelGrid: document.getElementById("reelGrid"),
      reelFrame: document.getElementById("reelFrame"),
      stage: document.querySelector(".stage"),
      machine: document.getElementById("machine"),
      coinsValue: document.getElementById("coinsValue"),
      betValue: document.getElementById("betValue"),
      winValue: document.getElementById("winValue"),
      lineBetValue: document.getElementById("lineBetValue"),
      message: document.getElementById("message"),
      spinButton: document.getElementById("spinButton"),
      betDown: document.getElementById("betDown"),
      betUp: document.getElementById("betUp"),
      refillButton: document.getElementById("refillButton"),
      soundButton: document.getElementById("soundButton"),
      soundState: document.getElementById("soundState"),
      helpButton: document.getElementById("helpButton"),
      helpModal: document.getElementById("helpModal"),
      closeHelp: document.getElementById("closeHelp"),
      paylinesSvg: document.getElementById("paylines"),
      screenFlash: document.getElementById("screenFlash"),
      paytable: document.getElementById("paytable"),
      celebrationLayer: document.getElementById("celebrationLayer"),
      celebrationPanel: document.getElementById("celebrationPanel"),
      celebrationTitle: document.getElementById("celebrationTitle"),
      celebrationName: document.getElementById("celebrationName"),
      celebrationAmount: document.getElementById("celebrationAmount"),
      celebrationAnnouncer: document.getElementById("celebrationAnnouncer"),
      wildAwakeningOverlay: document.getElementById("wildAwakeningOverlay"),
      combinationLayer: document.getElementById("combinationLayer"),
      combinationTitle: document.getElementById("combinationTitle"),
      combinationAmount: document.getElementById("combinationAmount"),
      combinationReference: document.getElementById("combinationReference"),
      combinationConnector: document.getElementById("combinationConnector"),
    };

    const formatNumber = value => Math.floor(value).toLocaleString();

    function buildPaytable() {
      elements.paytable.innerHTML = CONFIG.paytableOrder.map(key => {
        const symbol = CONFIG.symbols[key];
        return `<div class="pay-card"><img src="${symbol.image}" alt=""><div><strong>${symbol.name}</strong><span>3 × ${symbol.payout}</span></div></div>`;
      }).join("");
    }

    function buildCombinationReference() {
      if (!elements.combinationReference) return;
      const entries = CONFIG.combinations.definitions.map(definition => {
        const symbols = definition.sequence.map(key => `<img src="${CONFIG.symbols[key].image}" alt="${CONFIG.symbols[key].name}">`).join('<span aria-hidden="true">→</span>');
        return `<div class="combination-reference-row"><div class="combination-reference-name"><strong>${definition.name}</strong><small>${definition.multiplier}× line bet</small></div><div class="combination-reference-symbols">${symbols}</div></div>`;
      });
      const full = CONFIG.combinations.fullCommune;
      entries.push(`<div class="combination-reference-row full"><div class="combination-reference-name"><strong>${full.name}</strong><small>${full.multiplier}× total bet</small></div><div class="combination-reference-description">All seven members plus the Tree in the center cell</div></div>`);
      elements.combinationReference.innerHTML = entries.join("");
    }

    function updateDisplay({ state, phase, lineBet, totalBet }) {
      const busy = phase !== GAME_STATES.IDLE;
      const celebrating = phase === GAME_STATES.CELEBRATING;
      elements.coinsValue.textContent = formatNumber(state.coins);
      elements.betValue.textContent = formatNumber(totalBet);
      elements.winValue.textContent = formatNumber(state.lastWin);
      elements.lineBetValue.textContent = lineBet;
      elements.soundState.textContent = state.sound ? "On" : "Off";
      elements.betDown.disabled = busy || state.lineBetIndex === 0;
      elements.betUp.disabled = busy || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = busy;
      elements.spinButton.disabled = busy && !celebrating;
      setPrimaryAction(celebrating ? "skip" : "spin");
    }

    function setControlsDisabled(disabled, state, { allowSpin = false } = {}) {
      elements.spinButton.disabled = disabled && !allowSpin;
      elements.betDown.disabled = disabled || state.lineBetIndex === 0;
      elements.betUp.disabled = disabled || state.lineBetIndex === CONFIG.lineBets.length - 1;
      elements.refillButton.disabled = disabled;
    }

    function setPrimaryAction(mode) {
      const skipping = mode === "skip";
      elements.spinButton.textContent = skipping ? "Skip" : "Spin";
      elements.spinButton.setAttribute("aria-label", skipping ? "Skip remaining win presentation" : "Spin the reels");
      elements.spinButton.classList.toggle("is-skip", skipping);
    }

    const setWinDisplay = value => { elements.winValue.textContent = formatNumber(value); };
    function showMessage(text, isWin = false) {
      elements.message.textContent = text;
      elements.message.classList.toggle("win", isWin);
    }

    function clearCellClasses(classNames) {
      document.querySelectorAll(classNames.map(name => `.symbol-cell.${name}`).join(",")).forEach(cell => {
        classNames.forEach(name => cell.classList.remove(name));
        cell.style.removeProperty("--feature-accent");
      });
    }

    function clearWins() {
      clearCellClasses(["is-win"]);
      document.querySelectorAll(".payline.active").forEach(line => line.classList.remove("active", "tier-small", "tier-nice", "tier-big", "tier-jackpot"));
      elements.reelFrame.classList.remove("win-tier-small", "win-tier-nice", "win-tier-big", "win-tier-jackpot");
      elements.message.classList.remove("win");
    }

    function cellsForCoordinates(cells, reelController, matrix) {
      const currentTopStops = reelController.getCurrentTopStops();
      const reelElements = reelController.getReelElements();
      const found = [];
      cells.forEach(({ row, reel }) => {
        const stop = (currentTopStops[reel] + row) % CONFIG.reels[reel].length;
        const symbolKey = matrix?.[row]?.[reel];
        reelElements[reel].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => found.push({ cell, symbolKey }));
      });
      return found;
    }

    function markWins(wins, reelController, tier = "small") {
      const currentTopStops = reelController.getCurrentTopStops();
      const reelElements = reelController.getReelElements();
      elements.reelFrame.classList.add(`win-tier-${tier}`);
      wins.forEach(win => {
        elements.paylinesSvg.querySelector(`[data-line="${win.lineIndex}"]`)?.classList.add("active", `tier-${tier}`);
        win.rows.forEach((row, reelIndex) => {
          const stop = (currentTopStops[reelIndex] + row) % CONFIG.reels[reelIndex].length;
          reelElements[reelIndex].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => cell.classList.add("is-win"));
        });
      });
    }

    function markAwakeningSource(result, reelController) {
      clearCellClasses(["is-awakening-source"]);
      const transformation = result.transformations.find(item => item.type === "expanding-wild");
      if (!transformation) return;
      cellsForCoordinates([{ row: transformation.sourceRow, reel: transformation.reelIndex }], reelController, result.originalMatrix)
        .forEach(({ cell }) => cell.classList.add("is-awakening-source"));
    }

    function clearAwakeningMark() {
      clearCellClasses(["is-awakening-source"]);
    }

    function markCombination(combinationWin, result, reelController) {
      clearCellClasses(["is-combination"]);
      elements.reelFrame.classList.toggle("is-full-commune-combination", combinationWin.id === "full-commune");
      cellsForCoordinates(combinationWin.cells, reelController, result.originalMatrix).forEach(({ cell, symbolKey }) => {
        cell.classList.add("is-combination");
        cell.style.setProperty("--feature-accent", CONFIG.characterAccentColorMap[symbolKey] || "#f1d98a");
      });
      if (elements.combinationConnector) elements.combinationConnector.classList.toggle("is-visible", combinationWin.id !== "full-commune");
    }

    function showCombinationCallout(combinationWin) {
      if (!elements.combinationLayer) return;
      const full = combinationWin.id === "full-commune";
      elements.combinationLayer.className = `combination-layer is-visible${full ? " full-commune" : ""}`;
      elements.combinationLayer.setAttribute("aria-hidden", "false");
      elements.combinationTitle.textContent = combinationWin.name;
      elements.combinationAmount.textContent = `+${formatNumber(combinationWin.payout)} coins`;
      elements.celebrationAnnouncer.textContent = `${combinationWin.name} combination bonus: ${formatNumber(combinationWin.payout)} coins.`;
    }

    function hideCombinationCallout() {
      if (!elements.combinationLayer) return;
      elements.combinationLayer.className = "combination-layer";
      elements.combinationLayer.setAttribute("aria-hidden", "true");
    }

    function clearCombinationMarks() {
      clearCellClasses(["is-combination"]);
      elements.reelFrame.classList.remove("is-full-commune-combination");
      elements.combinationConnector?.classList.remove("is-visible");
    }

    function clearFeaturePresentation({ keepWild = false } = {}) {
      clearCellClasses(["is-awakening-source", "is-combination"]);
      clearCombinationMarks();
      hideCombinationCallout();
      elements.machine.classList.remove("is-tree-awakening", "is-combination-win", "is-full-commune");
      elements.reelFrame.classList.remove("tree-awakening-active");
      if (!keepWild && elements.wildAwakeningOverlay) elements.wildAwakeningOverlay.className = "wild-awakening-overlay";
    }

    function setSpinning(active) { elements.machine.classList.toggle("is-spinning", active); }
    function setAnticipation(level, active) {
      elements.machine.classList.toggle("is-anticipating", active);
      elements.machine.classList.toggle("anticipation-mild", active && level === "mild");
      elements.machine.classList.toggle("anticipation-strong", active && level === "strong");
    }

    function showCelebration({ tier, dominantName }) {
      const labels = { nice: "Nice Win", big: "Big Win", jackpot: "Commune Jackpot" };
      elements.celebrationLayer.className = `celebration-layer is-visible tier-${tier}`;
      elements.celebrationLayer.setAttribute("aria-hidden", "false");
      elements.celebrationTitle.textContent = labels[tier] || "Win";
      elements.celebrationAmount.textContent = "0";
      elements.celebrationName.textContent = dominantName ? `${dominantName} leads the win` : "";
      elements.celebrationName.hidden = !dominantName;
    }
    function updateCelebrationAmount(value) { elements.celebrationAmount.textContent = formatNumber(value); setWinDisplay(value); }
    function hideCelebration() { elements.celebrationLayer.className = "celebration-layer"; elements.celebrationLayer.setAttribute("aria-hidden", "true"); }
    function announceCelebration({ tier, totalWin }) {
      const labels = { nice: "Nice Win", big: "Big Win", jackpot: "Commune Jackpot" };
      elements.celebrationAnnouncer.textContent = `${labels[tier] || "Win"}: ${formatNumber(totalWin)} coins.`;
    }
    const openHelp = () => elements.helpModal.classList.add("open");
    const closeHelp = () => elements.helpModal.classList.remove("open");
    const isHelpOpen = () => elements.helpModal.classList.contains("open");

    return {
      elements,
      formatNumber,
      buildPaytable,
      buildCombinationReference,
      updateDisplay,
      setControlsDisabled,
      setPrimaryAction,
      setWinDisplay,
      showMessage,
      clearWins,
      markWins,
      markAwakeningSource,
      clearAwakeningMark,
      markCombination,
      showCombinationCallout,
      hideCombinationCallout,
      clearCombinationMarks,
      clearFeaturePresentation,
      setSpinning,
      setAnticipation,
      showCelebration,
      updateCelebrationAmount,
      hideCelebration,
      announceCelebration,
      openHelp,
      closeHelp,
      isHelpOpen,
    };
  }
  app.ui = { createUI };
})();
