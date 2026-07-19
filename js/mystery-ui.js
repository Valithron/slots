(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const createBaseUI = app.ui.createUI;

  function createUI() {
    const ui = createBaseUI();
    const { elements } = ui;
    Object.assign(elements, {
      mysteryHud: document.getElementById("mysteryHud"),
      mysteryFreeCounter: document.getElementById("mysteryFreeCounter"),
      mysteryFreeSpinCount: document.getElementById("mysteryFreeSpinCount"),
      mysteryModifierQueue: document.getElementById("mysteryModifierQueue"),
      mysteryQueueLabel: document.getElementById("mysteryQueueLabel"),
      mysteryModifierChips: document.getElementById("mysteryModifierChips"),
      mysterySpinBadge: document.getElementById("mysterySpinBadge"),
      mysteryCalloutLayer: document.getElementById("mysteryCalloutLayer"),
      mysteryCalloutPanel: document.getElementById("mysteryCalloutPanel"),
      mysteryCalloutKicker: document.getElementById("mysteryCalloutKicker"),
      mysteryCalloutTitle: document.getElementById("mysteryCalloutTitle"),
      mysteryCalloutDetail: document.getElementById("mysteryCalloutDetail"),
      mysteryAnnouncer: document.getElementById("mysteryAnnouncer"),
    });

    const escapeHtml = value => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

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

    function updateMysteryHud(state, phase) {
      const mystery = app.mystery.normalizeState(state?.mystery);
      const active = phase !== GAME_STATES.IDLE && state?.pendingSpin?.mysteryActiveModifiers?.length
        ? app.mystery.normalizeModifierQueue(state.pendingSpin.mysteryActiveModifiers)
        : [];
      const queued = app.mystery.getQueueDisplay({ mystery });
      const shown = active.length ? active.map(modifier => ({
        ...modifier,
        label: app.mystery.getModifierLabel(modifier),
        accent: modifier.id === "spotlight"
          ? CONFIG.characterAccentColorMap[modifier.characterKey]
          : modifier.id === "center-tree" ? CONFIG.characterAccentColorMap.TOL : CONFIG.characterAccentColorMap.MYS,
      })) : queued;
      const visible = mystery.queuedFreeSpins > 0 || shown.length > 0;
      elements.mysteryHud.hidden = !visible;
      elements.mysteryFreeCounter.hidden = mystery.queuedFreeSpins <= 0;
      elements.mysteryFreeSpinCount.textContent = String(mystery.queuedFreeSpins);
      elements.mysteryModifierQueue.hidden = shown.length === 0;
      elements.mysteryQueueLabel.textContent = active.length ? "Active This Spin" : "Next Spin";
      elements.mysteryModifierChips.innerHTML = shown.map(modifier =>
        `<span class="mystery-chip" style="--mystery-chip-accent:${escapeHtml(modifier.accent || CONFIG.characterAccentColorMap.MYS)}">${escapeHtml(modifier.label)}</span>`
      ).join("");
    }

    const baseSetPrimaryAction = ui.setPrimaryAction;
    function setPrimaryAction(mode, options = {}) {
      if (mode !== "mystery-free") return baseSetPrimaryAction(mode, options);
      baseSetPrimaryAction("spin", options);
      elements.spinButton.textContent = "Free Spin";
      elements.spinButton.setAttribute("aria-label", "Use one queued Mystery Free Spin");
      elements.spinButton.classList.add("is-mystery-free");
    }

    const baseUpdateDisplay = ui.updateDisplay;
    function updateDisplay(model) {
      baseUpdateDisplay(model);
      const mysterySpinActive = model.state?.pendingSpin?.spinType === "mystery-free"
        || model.mysterySpinActive === true;
      elements.mysterySpinBadge.classList.toggle("is-visible", mysterySpinActive);
      elements.mysterySpinBadge.setAttribute("aria-hidden", mysterySpinActive ? "false" : "true");
      elements.machine.classList.toggle("is-mystery-free-spin", mysterySpinActive);
      updateMysteryHud(model.state, model.phase);
      const available = model.phase === GAME_STATES.IDLE
        && !model.state?.freeSpinSession?.active
        && app.mystery.hasQueuedFreeSpin(model.state);
      elements.spinButton.classList.toggle("is-mystery-free", available);
      if (available) {
        setPrimaryAction("mystery-free");
        elements.betValue.textContent = "Free";
      }
    }

    function markMysteryTokens(result, reelController) {
      document.querySelectorAll(".symbol-cell.is-mystery-token, .symbol-cell.is-mystery-four-plus")
        .forEach(cell => cell.classList.remove("is-mystery-token", "is-mystery-four-plus"));
      cellsForCoordinates(result?.mysteryTokenCells, reelController, result?.originalMatrix).forEach(({ cell }) => {
        cell.classList.add("is-mystery-token");
        if (result.mysteryTokenCount >= 4) cell.classList.add("is-mystery-four-plus");
      });
    }

    function restoreCenterTreeVisual() {
      document.querySelectorAll("img[data-center-tree-original-src]").forEach(image => {
        image.src = image.dataset.centerTreeOriginalSrc;
        image.removeAttribute("data-center-tree-original-src");
        image.closest(".symbol-cell")?.classList.remove("is-center-tree");
      });
    }

    function applyCenterTreeVisual(result, reelController) {
      const transformation = result?.transformations?.find(item => item.type === "center-tree");
      if (!transformation?.created) return false;
      cellsForCoordinates([
        { row: transformation.rowIndex, reel: transformation.reelIndex },
      ], reelController, result.originalMatrix).forEach(({ cell }) => {
        const image = cell.querySelector("img");
        if (!image) return;
        if (!image.dataset.centerTreeOriginalSrc) image.dataset.centerTreeOriginalSrc = image.src;
        image.src = CONFIG.symbols.TOL.image;
        cell.classList.add("is-center-tree");
      });
      return true;
    }

    function applyMysteryResultVisuals(result, reelController) {
      markMysteryTokens(result, reelController);
      applyCenterTreeVisual(result, reelController);
    }

    function showMysteryCallout({ kicker = "Mystery Tokens", title = "Mystery Modifier", detail = "Queued for the next spin.", tone = "normal" } = {}) {
      elements.mysteryCalloutKicker.textContent = kicker;
      elements.mysteryCalloutTitle.textContent = title;
      elements.mysteryCalloutDetail.textContent = detail;
      elements.mysteryCalloutLayer.className = `mystery-callout-layer is-visible tone-${tone}`;
      elements.mysteryCalloutLayer.setAttribute("aria-hidden", "false");
      elements.mysteryCalloutPanel.setAttribute("aria-label", `${kicker}. ${title}. ${detail}`);
      elements.mysteryAnnouncer.textContent = `${kicker}. ${title}. ${detail}`;
      return true;
    }

    function hideMysteryCallout() {
      elements.mysteryCalloutLayer.className = "mystery-callout-layer";
      elements.mysteryCalloutLayer.setAttribute("aria-hidden", "true");
    }

    function buildMysteryCallouts(result) {
      const callouts = [];
      const freeSpinTitle = settlement => {
        if (!settlement?.capped || settlement.freeSpinsAwarded === settlement.freeSpinsRequested) {
          return `+${settlement.freeSpinsRequested} Free Spin${settlement.freeSpinsRequested === 1 ? "" : "s"}`;
        }
        if (settlement.freeSpinsAwarded <= 0) return "MAX FREE SPINS";
        return `+${settlement.freeSpinsAwarded} Free Spin${settlement.freeSpinsAwarded === 1 ? "" : "s"}`;
      };
      const center = result?.transformations?.find(item => item.type === "center-tree");
      if (center) callouts.push({
        kicker: "Mystery Modifier",
        title: "Center Tree",
        detail: center.created ? "The center cell becomes a Tree Wild." : "Center already charged. The modifier resolves safely.",
        tone: "tree",
      });
      const spotlightWin = result?.lineWins?.find(win => (win.mysteryMultiplier || 1) > 1);
      if (spotlightWin) callouts.push({
        kicker: "Mystery Modifier",
        title: `Spotlight ${spotlightWin.mysteryMultiplier}×`,
        detail: `${CONFIG.symbols[spotlightWin.symbolKey]?.name || spotlightWin.symbolKey} leads the line win.`,
        tone: "spotlight",
      });
      const communeWin = result?.combinationWins?.find(win => (win.mysteryMultiplier || 1) > 1);
      if (communeWin) callouts.push({
        kicker: "Mystery Modifier",
        title: communeWin.mysteryMultiplier === 2 ? "Double Commune" : `Commune ${communeWin.mysteryMultiplier}×`,
        detail: `${communeWin.baseName || communeWin.name} pays ${communeWin.payout} coins.`,
        tone: "commune",
      });
      if (result?.fortuneBurstPoints > 0) callouts.push({
        kicker: "Mystery Modifier",
        title: `Fortune Burst +${result.fortuneBurstPoints}`,
        detail: result.totalWin > 0 ? "The final win surges into the Fortune Meter." : "Even the loss adds Fortune.",
        tone: "fortune",
      });
      const settlement = result?.mysterySettlement;
      if (settlement?.tokenCount === 2) callouts.push({
        kicker: "2 Mystery Tokens",
        title: "Mystery Modifier",
        detail: `+10 Fortune · ${settlement.modifier ? app.mystery.getModifierLabel(settlement.modifier) : "Modifier queued"}`,
        tone: "normal",
      });
      if (settlement?.tokenCount === 3) callouts.push({
        kicker: "3 Mystery Tokens",
        title: freeSpinTitle(settlement),
        detail: settlement.modifier ? `${app.mystery.getModifierLabel(settlement.modifier)} queued.` : "Mystery Modifier queued.",
        tone: "free-spin",
      });
      if (settlement?.tokenCount >= 4) callouts.push({
        kicker: `${settlement.tokenCount} Mystery Tokens`,
        title: freeSpinTitle(settlement),
        detail: settlement.strongFallback
          ? `${app.mystery.getModifierLabel(settlement.modifier)} awarded as the strong-modifier fallback.`
          : `${app.mystery.getModifierLabel(settlement.modifier)} queued.`,
        tone: "four-plus",
      });
      if (settlement?.capped && settlement.freeSpinsAwarded < settlement.freeSpinsRequested
        && !(settlement.tokenCount >= 4 && settlement.freeSpinsAwarded === 0)) callouts.push({
        kicker: "Mystery Free Spins",
        title: "MAX FREE SPINS",
        detail: `The queue is capped at ${CONFIG.mystery.maximumQueuedFreeSpins}.`,
        tone: "four-plus",
      });
      return callouts;
    }

    const baseMarkWins = ui.markWins;
    function markWins(wins, reelController, tier = "small", options = {}) {
      baseMarkWins(wins, reelController, tier, options);
      (wins || []).filter(win => (win.mysteryMultiplier || 1) > 1).forEach(win => {
        win.rows.forEach((row, reel) => {
          const stop = (reelController.getCurrentTopStops()[reel] + row) % CONFIG.reels[reel].length;
          reelController.getReelElements()[reel].strip.querySelectorAll(`.symbol-cell[data-stop="${stop}"]`).forEach(cell => {
            cell.classList.add("is-spotlight-win");
            cell.style.setProperty("--spotlight-accent", CONFIG.characterAccentColorMap[win.symbolKey] || CONFIG.characterAccentColorMap.MYS);
          });
        });
      });
    }

    const baseClearFeaturePresentation = ui.clearFeaturePresentation;
    function clearFeaturePresentation(options) {
      baseClearFeaturePresentation(options);
      restoreCenterTreeVisual();
      hideMysteryCallout();
      document.querySelectorAll(".symbol-cell.is-mystery-token, .symbol-cell.is-mystery-four-plus, .symbol-cell.is-spotlight-win")
        .forEach(cell => {
          cell.classList.remove("is-mystery-token", "is-mystery-four-plus", "is-spotlight-win");
          cell.style.removeProperty("--spotlight-accent");
        });
    }

    Object.assign(ui, {
      elements,
      updateDisplay,
      setPrimaryAction,
      updateMysteryHud,
      markMysteryTokens,
      applyCenterTreeVisual,
      restoreCenterTreeVisual,
      applyMysteryResultVisuals,
      showMysteryCallout,
      hideMysteryCallout,
      buildMysteryCallouts,
      markWins,
      clearFeaturePresentation,
    });
    return ui;
  }

  app.ui = { createUI };
})();
