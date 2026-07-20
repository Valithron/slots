(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG, GAME_STATES } = app;
  const FS = app.freeSpins.FREE_SPIN_STATUSES;
  const createBaseUI = app.ui.createUI;

  if (!document.querySelector('link[data-ally-feature-compact]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "ally-feature-compact.css";
    stylesheet.dataset.allyFeatureCompact = "true";
    document.head.append(stylesheet);
  }

  function createUI() {
    const ui = createBaseUI();
    const { elements } = ui;
    Object.assign(elements, {
      statusStrip: document.querySelector(".status-strip"),
      fortuneMeterWrap: document.getElementById("fortuneMeterWrap"),
      mysteryHud: document.getElementById("mysteryHud"),
      mysteryFreeCounter: document.getElementById("mysteryFreeCounter"),
      mysteryModifierQueue: document.getElementById("mysteryModifierQueue"),
      mysteryQueueLabel: document.getElementById("mysteryQueueLabel"),
      mysteryModifierChips: document.getElementById("mysteryModifierChips"),
      controls: document.querySelector(".controls"),
      message: document.getElementById("message"),
      freeSpinsHud: document.getElementById("freeSpinsHud"),
      freeSpinLayer: document.getElementById("freeSpinLayer"),
      freeSpinPanel: document.getElementById("freeSpinPanel"),
      freeSpinSummaryGrid: document.getElementById("freeSpinSummaryGrid"),
    });

    let lastDisplayModel = null;
    let positionedSessionId = null;
    let suppressNextAutoPosition = false;
    let summaryButtonMoved = false;
    let summaryMode = false;
    const spinButtonAnchor = document.createComment("spin-button-anchor");

    const reducedMotion = () => app.effects?.prefersReducedMotion?.() === true;

    function ensureCompactHudStructure() {
      const hud = elements.freeSpinsHud;
      if (!hud || hud.dataset.compactStructure === "true") return;

      const duplicate = hud.querySelector("#totalAwardedSpinsValue")?.closest(".feature-hud-stat, div");
      duplicate?.remove();
      elements.totalAwardedSpinsValue = null;

      const allyHud = elements.allyHud || document.getElementById("allyHud");
      const stats = [...hud.children].filter(child => child !== allyHud);
      const definitions = [
        { key: "spins", long: "Spins Left", short: "Spins" },
        { key: "win", long: "Feature Win", short: "Win" },
        { key: "bet", long: "Locked Bet", short: "Bet" },
      ];
      stats.slice(0, 3).forEach((stat, index) => {
        const definition = definitions[index];
        stat.classList.add("feature-hud-stat");
        stat.dataset.metric = definition.key;
        const label = stat.querySelector("span");
        if (label) label.innerHTML = `<span class="feature-label-long">${definition.long}</span><span class="feature-label-short">${definition.short}</span>`;
      });

      if (allyHud) {
        allyHud.classList.add("ally-hud", "ally-hud-compact");
        allyHud.setAttribute("role", "group");
      }

      if (elements.allyHudValue && !document.getElementById("allyHudState")) {
        const state = document.createElement("small");
        state.id = "allyHudState";
        state.className = "ally-hud-state";
        elements.allyHudValue.insertAdjacentElement("afterend", state);
        elements.allyHudState = state;
      } else if (!elements.allyHudState) {
        elements.allyHudState = document.getElementById("allyHudState");
      }

      const copy = allyHud?.querySelector(".ally-hud-copy");
      if (copy && elements.allyHudValue && !copy.querySelector(".ally-hud-ability-row")) {
        const row = document.createElement("span");
        row.className = "ally-hud-ability-row";
        elements.allyHudValue.parentNode.insertBefore(row, elements.allyHudValue);
        row.append(elements.allyHudValue);
        if (elements.allyHudState) row.append(elements.allyHudState);
      }

      hud.dataset.responsiveStructure = "true";
      hud.dataset.compactStructure = "true";
    }

    function normalizeAbilityStatus(definition, hud) {
      let status = String(hud?.value || "").trim();
      const ability = String(definition?.abilityName || "").trim();
      if (!status || status === ability) return "";
      if (ability && status.toLowerCase().startsWith(ability.toLowerCase())) {
        status = status.slice(ability.length).trim();
      }
      return status.replace(/^[-·:]+\s*/, "").trim();
    }

    function updateCompactAllyHud(session) {
      if (!session?.active || !session.ally?.confirmed || !session.ally?.selectedId) return;
      const definition = CONFIG.allies[session.ally.selectedId];
      const hud = app.allies.getHudState(session);
      if (!definition || !hud) return;
      const status = normalizeAbilityStatus(definition, hud);
      elements.allyHudName.textContent = definition.name;
      elements.allyHudValue.textContent = definition.abilityName;
      if (elements.allyHudState) {
        elements.allyHudState.textContent = status ? `· ${status}` : "";
        elements.allyHudState.hidden = !status;
      }
      elements.allyHud?.setAttribute("aria-label", `${definition.name}. ${definition.abilityName}${status ? `. ${status}` : ""}.`);
    }

    function updateCompactMystery(state, phase, summaryOpen = false) {
      if (!elements.mysteryHud) return;
      const mystery = app.mystery.normalizeState(state?.mystery);
      const activeModifiers = phase !== GAME_STATES.IDLE && state?.pendingSpin?.mysteryActiveModifiers?.length
        ? app.mystery.normalizeModifierQueue(state.pendingSpin.mysteryActiveModifiers)
        : [];
      const queuedModifiers = activeModifiers.length
        ? activeModifiers
        : app.mystery.getQueueDisplay({ mystery });
      const hasSpins = mystery.queuedFreeSpins > 0;
      const hasModifier = queuedModifiers.length > 0;
      const visible = hasSpins || hasModifier;

      elements.mysteryHud.hidden = !visible || summaryOpen;
      elements.mysteryHud.dataset.compactMode = hasSpins && hasModifier
        ? "combined"
        : hasSpins ? "spins" : hasModifier ? "modifier" : "none";
      if (elements.mysteryFreeCounter) {
        elements.mysteryFreeCounter.hidden = !hasSpins;
        const label = elements.mysteryFreeCounter.querySelector("span");
        if (label) label.textContent = "Mystery Spins";
      }
      if (elements.mysteryModifierQueue) elements.mysteryModifierQueue.hidden = !hasModifier;
      if (elements.mysteryQueueLabel) elements.mysteryQueueLabel.textContent = activeModifiers.length ? "Active" : "Next";
    }

    function ensureSummaryActionHost() {
      if (!elements.freeSpinPanel) return null;
      let host = elements.freeSpinPanel.querySelector(".feature-summary-action");
      if (!host) {
        host = document.createElement("div");
        host.className = "feature-summary-action";
        host.hidden = true;
        elements.freeSpinSummaryGrid?.insertAdjacentElement("afterend", host);
      }
      return host;
    }

    function ensureSummaryQueueChip() {
      if (!elements.freeSpinPanel) return null;
      let chip = elements.freeSpinPanel.querySelector(".feature-summary-next");
      if (!chip) {
        chip = document.createElement("div");
        chip.className = "feature-summary-next";
        chip.hidden = true;
        elements.freeSpinSummaryGrid?.insertAdjacentElement("afterend", chip);
      }
      return chip;
    }

    function queueSummaryText(state) {
      const mystery = app.mystery.normalizeState(state?.mystery);
      const queue = app.mystery.getQueueDisplay({ mystery });
      const parts = [];
      if (mystery.queuedFreeSpins > 0) parts.push(`Mystery spins: ${mystery.queuedFreeSpins}`);
      if (queue.length > 0) parts.push(`Next spin: ${queue.map(item => item.label || app.mystery.getModifierLabel(item)).join(" + ")}`);
      return parts.join(" · ");
    }

    function updateSummaryQueue(state) {
      const chip = ensureSummaryQueueChip();
      if (!chip) return;
      const text = queueSummaryText(state);
      chip.textContent = text;
      chip.hidden = !text;
    }

    function bindSummaryDisclosure() {
      const details = elements.freeSpinSummaryGrid?.querySelector(".feature-summary-details");
      const summary = details?.querySelector(":scope > summary");
      if (!details || !summary) return;

      let label = summary.querySelector(".feature-summary-details-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "feature-summary-details-label";
        const chevron = document.createElement("span");
        chevron.className = "disclosure-chevron";
        chevron.setAttribute("aria-hidden", "true");
        summary.replaceChildren(label, chevron);
      }
      const update = () => {
        label.textContent = details.open ? "Hide feature details" : "Show feature details";
        summary.setAttribute("aria-expanded", String(details.open));
      };
      if (details.dataset.compactToggleBound !== "true") {
        details.dataset.compactToggleBound = "true";
        details.addEventListener("toggle", update);
      }
      details.open = false;
      update();
    }

    function moveContinueIntoSummary() {
      const host = ensureSummaryActionHost();
      if (!host || !elements.spinButton || summaryButtonMoved) return;
      if (elements.spinButton.parentNode) elements.spinButton.parentNode.insertBefore(spinButtonAnchor, elements.spinButton);
      host.hidden = false;
      host.append(elements.spinButton);
      elements.spinButton.classList.add("feature-summary-continue");
      summaryButtonMoved = true;
    }

    function restorePrimaryButton() {
      const host = ensureSummaryActionHost();
      if (!summaryButtonMoved || !elements.spinButton) {
        if (host) host.hidden = true;
        return;
      }
      if (spinButtonAnchor.parentNode) spinButtonAnchor.parentNode.insertBefore(elements.spinButton, spinButtonAnchor);
      spinButtonAnchor.remove();
      elements.spinButton.classList.remove("feature-summary-continue");
      if (host) host.hidden = true;
      summaryButtonMoved = false;
    }

    function setQaCollisionMode(active) {
      document.body.classList.toggle("qa-primary-surface-open", Boolean(active));
    }

    function setSummaryMode(active) {
      summaryMode = Boolean(active);
      elements.machine?.classList.toggle("is-feature-summary", summaryMode);
      document.body.classList.toggle("feature-summary-open", summaryMode);
      if (summaryMode) {
        elements.freeSpinsHud.hidden = true;
        elements.fortuneMeterWrap?.setAttribute("aria-hidden", "true");
        updateCompactMystery(lastDisplayModel?.state, lastDisplayModel?.phase, true);
        moveContinueIntoSummary();
        updateSummaryQueue(lastDisplayModel?.state);
        setQaCollisionMode(true);
      } else {
        elements.fortuneMeterWrap?.removeAttribute("aria-hidden");
        restorePrimaryButton();
        document.body.classList.remove("feature-summary-open");
      }
    }

    function positionPlayClusterOnce(session) {
      if (!session?.sessionId || positionedSessionId === session.sessionId || suppressNextAutoPosition) {
        suppressNextAutoPosition = false;
        return;
      }
      positionedSessionId = session.sessionId;
      if (globalThis.innerWidth > 720) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        elements.freeSpinsHud?.scrollIntoView?.({
          block: "start",
          inline: "nearest",
          behavior: reducedMotion() ? "auto" : "smooth",
        });
      }));
    }

    function applyFeatureMode(model) {
      const session = model.state?.freeSpinSession;
      const summaryOpen = Boolean(session?.active && [FS.SUMMARY, FS.COMPLETE].includes(session.status));
      const activePlay = Boolean(session?.active
        && session.ally?.confirmed
        && session.ally?.selectedId
        && session.ally?.featureStarted
        && !summaryOpen
        && session.status !== FS.INTRO);

      elements.machine?.classList.toggle("ally-feature-active", activePlay);
      document.body.classList.toggle("ally-feature-play-active", activePlay);
      setSummaryMode(summaryOpen || elements.freeSpinLayer?.classList.contains("is-summary"));
      setQaCollisionMode(activePlay || summaryMode || elements.allySelectionLayer?.classList.contains("is-visible"));

      if (summaryOpen) {
        elements.freeSpinsHud.hidden = true;
      } else if (session?.active) {
        elements.freeSpinsHud.hidden = false;
      }

      updateCompactAllyHud(session);
      updateCompactMystery(model.state, model.phase, summaryMode);
      if (activePlay) positionPlayClusterOnce(session);
      if (!session?.active) positionedSessionId = null;
    }

    const baseUpdateDisplay = ui.updateDisplay;
    function updateDisplay(model) {
      lastDisplayModel = model;
      ensureCompactHudStructure();
      baseUpdateDisplay(model);
      applyFeatureMode(model);
    }

    const baseShowFreeSpinSummary = ui.showFreeSpinSummary;
    function showFreeSpinSummary(summary, reactionModel) {
      baseShowFreeSpinSummary(summary, reactionModel);
      bindSummaryDisclosure();
      setSummaryMode(true);
      updateSummaryQueue(lastDisplayModel?.state);
    }

    const baseHideFreeSpinLayer = ui.hideFreeSpinLayer;
    function hideFreeSpinLayer() {
      baseHideFreeSpinLayer();
      if (summaryMode) setSummaryMode(false);
    }

    const baseShowAllySelection = ui.showAllySelection;
    function showAllySelection(session) {
      baseShowAllySelection(session);
      setQaCollisionMode(true);
    }

    const baseHideAllySelection = ui.hideAllySelection;
    function hideAllySelection() {
      baseHideAllySelection();
      const active = elements.machine?.classList.contains("ally-feature-active") || summaryMode;
      setQaCollisionMode(active);
    }

    function buildPreviewState({
      allyId = "gabi",
      spins = 4,
      featureWin = 110,
      lockedBet = 50,
      used = false,
      mysterySpins = 0,
      modifierId = null,
      modifierName = null,
      summary = false,
      largeCoins = false,
    } = {}) {
      const ally = app.allies.createAllyState();
      ally.selectedId = CONFIG.allies[allyId] ? allyId : "gabi";
      ally.confirmed = true;
      ally.featureStarted = true;
      if (ally.selectedId === "gabi") ally.gabi.used = used;
      if (ally.selectedId === "ashley") ally.ashley.used = used;
      if (ally.selectedId === "ryan") ally.ryan.consumed = used;
      if (ally.selectedId === "sterling") ally.sterling.insurancePot = used ? 35 : 0;
      if (ally.selectedId === "cydney" && used) {
        ally.cydney.recordedSpinId = "qa-first-win";
        ally.cydney.echoBonus = 49500;
      }
      const mystery = app.mystery.createState();
      mystery.queuedFreeSpins = mysterySpins;
      if (modifierId) mystery.modifierQueue = [{
        id: modifierId,
        name: modifierName || modifierId,
        stacks: 1,
        requestedTier: CONFIG.mystery.strongModifierPool.includes(modifierId) ? "strong" : "normal",
        actualTier: CONFIG.mystery.strongModifierPool.includes(modifierId) ? "strong" : "normal",
      }];
      const status = summary ? FS.SUMMARY : FS.READY;
      return {
        state: {
          coins: largeCoins ? 987654321 : 1585,
          lineBetIndex: 0,
          sound: true,
          lastWin: 110,
          fortuneMeter: { value: 64, charged: false },
          pendingSpin: null,
          mystery,
          freeSpinSession: {
            active: true,
            sessionId: `qa-compact-${ally.selectedId}-${summary ? "summary" : "play"}`,
            status,
            startingSpins: 4,
            remainingSpins: summary ? 0 : spins,
            completedSpins: summary ? 14 : Math.max(0, 16 - spins),
            totalAwardedSpins: summary ? 18 : 16,
            retriggerCount: summary ? 4 : 2,
            accumulatedWin: featureWin,
            referenceBet: lockedBet,
            lockedLineBet: Math.max(1, Math.floor(lockedBet / CONFIG.paylines.length)),
            ally,
          },
        },
        phase: GAME_STATES.BONUS,
        lineBet: Math.max(1, Math.floor(lockedBet / CONFIG.paylines.length)),
        totalBet: lockedBet,
        manualStopState: null,
        fortuneSpinActive: false,
        mysterySpinActive: false,
      };
    }

    function previewActiveFeature(options = {}) {
      suppressNextAutoPosition = true;
      const model = buildPreviewState(options);
      updateDisplay(model);
      elements.freeSpinLayer?.classList.remove("is-summary", "is-visible");
      setSummaryMode(false);
      return model;
    }

    function usedBonus(ally) {
      if (ally.selectedId === "sterling") return ally.sterling.insurancePot;
      if (ally.selectedId === "cydney") return ally.cydney.echoBonus;
      return ally.totalBonus || 0;
    }

    function previewCompactSummary(options = {}) {
      suppressNextAutoPosition = true;
      const model = buildPreviewState({ ...options, summary: true });
      lastDisplayModel = model;
      baseUpdateDisplay(model);
      const definition = CONFIG.allies[model.state.freeSpinSession.ally.selectedId];
      showFreeSpinSummary({
        accumulatedWin: model.state.freeSpinSession.accumulatedWin,
        completedSpins: model.state.freeSpinSession.completedSpins,
        retriggerCount: model.state.freeSpinSession.retriggerCount,
        totalAwardedSpins: model.state.freeSpinSession.totalAwardedSpins,
        allyBonus: usedBonus(model.state.freeSpinSession.ally),
        ally: definition,
      }, { label: definition.name, portraits: [{ characterKey: definition.characterKey }] });
      applyFeatureMode(model);
      return model;
    }

    function previewExpandedFeatureDetails(options = {}) {
      previewCompactSummary(options);
      const details = elements.freeSpinSummaryGrid?.querySelector(".feature-summary-details");
      if (details) details.open = true;
    }

    function clearCompactPreview() {
      setSummaryMode(false);
      document.body.classList.remove("ally-feature-play-active", "qa-primary-surface-open");
      elements.machine?.classList.remove("ally-feature-active", "is-feature-summary");
      ui.hideFreeSpinLayer?.();
    }

    Object.assign(ui, {
      updateDisplay,
      showFreeSpinSummary,
      hideFreeSpinLayer,
      showAllySelection,
      hideAllySelection,
    });

    app.mobileUsabilityQA ||= {};
    Object.assign(app.mobileUsabilityQA, {
      previewActiveFeature,
      previewCompactSummary,
      previewExpandedFeatureDetails,
      clearCompactPreview,
    });

    ensureCompactHudStructure();
    ensureSummaryActionHost();
    ensureSummaryQueueChip();
    return ui;
  }

  app.ui = { createUI };
})();
