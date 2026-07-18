(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const createBaseUI = app.ui.createUI;

  function createUI() {
    const ui = createBaseUI();
    const { elements } = ui;
    Object.assign(elements, {
      allyHud: document.getElementById("allyHud"),
      allyHudPortrait: document.getElementById("allyHudPortrait"),
      allyHudName: document.getElementById("allyHudName"),
      allyHudValue: document.getElementById("allyHudValue"),
      allySelectionLayer: document.getElementById("allySelectionLayer"),
      allySelectionPanel: document.getElementById("allySelectionPanel"),
      allySelectionGrid: document.getElementById("allySelectionGrid"),
      allyConfirmButton: document.getElementById("allyConfirmButton"),
      allySelectionAnnouncer: document.getElementById("allySelectionAnnouncer"),
      allyCalloutLayer: document.getElementById("allyCalloutLayer"),
      allyCalloutPanel: document.getElementById("allyCalloutPanel"),
      allyCalloutPortrait: document.getElementById("allyCalloutPortrait"),
      allyCalloutName: document.getElementById("allyCalloutName"),
      allyCalloutAbility: document.getElementById("allyCalloutAbility"),
      allyCalloutDetail: document.getElementById("allyCalloutDetail"),
      allyCalloutAnnouncer: document.getElementById("allyCalloutAnnouncer"),
    });

    let selectHandler = null;
    let confirmHandler = null;

    const escapeHtml = value => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const portraitUrl = definition => app.reactions.versionAssetUrl(definition?.portrait || CONFIG.characterPresentation.genericAsset);

    function bindAllySelection({ onSelect, onConfirm } = {}) {
      selectHandler = typeof onSelect === "function" ? onSelect : null;
      confirmHandler = typeof onConfirm === "function" ? onConfirm : null;
      elements.allySelectionGrid?.addEventListener("click", event => {
        const button = event.target.closest("button[data-ally-id]");
        if (!button || !elements.allySelectionGrid.contains(button)) return;
        selectHandler?.(button.dataset.allyId);
      });
      elements.allyConfirmButton?.addEventListener("click", () => confirmHandler?.());
    }

    function showAllySelection(session) {
      if (!elements.allySelectionLayer || !elements.allySelectionGrid) return;
      const ally = app.allies.normalizeAllyState(session?.ally);
      elements.allySelectionGrid.innerHTML = CONFIG.allyOrder.map(id => {
        const definition = CONFIG.allies[id];
        const selected = ally.selectedId === id;
        return `<button class="ally-card${selected ? " is-selected" : ""}" type="button" data-ally-id="${id}" aria-pressed="${selected}" style="--ally-accent:${escapeHtml(definition.accent)}">
          <span class="ally-card-check" aria-hidden="true">✓</span>
          <img src="${portraitUrl(definition)}" alt="${escapeHtml(definition.name)}">
          <span class="ally-card-copy">
            <strong>${escapeHtml(definition.name)}</strong>
            <b>${escapeHtml(definition.abilityName)}</b>
            <small>${escapeHtml(definition.description)}</small>
          </span>
        </button>`;
      }).join("");
      elements.allyConfirmButton.disabled = !ally.selectedId;
      elements.allyConfirmButton.textContent = ally.selectedId
        ? `Choose ${CONFIG.allies[ally.selectedId].name}`
        : "Choose an Ally";
      elements.allySelectionLayer.className = "ally-selection-layer is-visible";
      elements.allySelectionLayer.setAttribute("aria-hidden", "false");
      elements.allySelectionPanel?.setAttribute("aria-label", ally.selectedId
        ? `${CONFIG.allies[ally.selectedId].name}, ${CONFIG.allies[ally.selectedId].abilityName}, selected. Confirm your ally.`
        : "Choose one Commune member as your ally, then confirm.");
      elements.allySelectionAnnouncer.textContent = ally.selectedId
        ? `${CONFIG.allies[ally.selectedId].name} selected. Press Choose ${CONFIG.allies[ally.selectedId].name} to confirm.`
        : "Choose your ally for Commune Free Spins.";
    }

    function hideAllySelection() {
      if (!elements.allySelectionLayer) return;
      elements.allySelectionLayer.className = "ally-selection-layer";
      elements.allySelectionLayer.setAttribute("aria-hidden", "true");
    }

    function calloutDetail(activation, session) {
      const allyId = activation?.allyId || session?.ally?.selectedId;
      if (allyId === "sterling") return activation?.endBonus
        ? `Insurance pays +${activation.bonus || 0} coins.`
        : "A loss added to the Insurance Pot.";
      if (allyId === "ryan") return activation?.baseWin > 0
        ? `Big Win multiplies ${activation.baseWin} to ${activation.baseWin + activation.bonus}.`
        : "The Big Win Spin landed no payout.";
      if (allyId === "cooper") return `${activation.multiplier}× Rage adds +${activation.bonus || 0} coins.`;
      if (allyId === "cydney") return activation?.endBonus
        ? `The Echo pays +${activation.bonus || 0} coins.`
        : `First win recorded. Echo waiting: ${activation.bonus || 0}.`;
      if (allyId === "gabi") return activation?.selected === "replacement"
        ? `Gabi rejected the weak win and improved it by ${activation.bonus || 0}.`
        : "Gabi replayed the weak win, but the original was better.";
      if (allyId === "kenly") return `Lemonade Bonus: +${activation.bonus || 0} coins.`;
      if (allyId === "ashley") return activation?.bonus > 0
        ? `Fastball rescued the loss for +${activation.bonus} coins.`
        : "Fastball replayed the loss.";
      return "Ally ability activated.";
    }

    function showAllyCallout(activation, session) {
      const allyId = activation?.allyId || session?.ally?.selectedId;
      const definition = CONFIG.allies?.[allyId];
      if (!definition || !elements.allyCalloutLayer) return false;
      const detail = calloutDetail(activation, session);
      elements.allyCalloutPanel.style.setProperty("--ally-accent", definition.accent);
      elements.allyCalloutPortrait.src = portraitUrl(definition);
      elements.allyCalloutPortrait.alt = definition.name;
      elements.allyCalloutName.textContent = definition.name;
      elements.allyCalloutAbility.textContent = definition.abilityName;
      elements.allyCalloutDetail.textContent = detail;
      elements.allyCalloutLayer.className = "ally-callout-layer is-visible";
      elements.allyCalloutLayer.setAttribute("aria-hidden", "false");
      const label = `${definition.name}: ${definition.abilityName}. ${detail}`;
      elements.allyCalloutPanel.setAttribute("aria-label", label);
      elements.allyCalloutAnnouncer.textContent = label;
      return true;
    }

    function hideAllyCallout() {
      if (!elements.allyCalloutLayer) return;
      elements.allyCalloutLayer.className = "ally-callout-layer";
      elements.allyCalloutLayer.setAttribute("aria-hidden", "true");
    }

    function updateAllyHud(session) {
      if (!elements.allyHud) return;
      const active = Boolean(session?.active && session?.ally?.confirmed && session?.ally?.selectedId);
      elements.allyHud.hidden = !active;
      if (!active) return;
      const hud = app.allies.getHudState(session);
      elements.allyHud.style.setProperty("--ally-accent", hud.accent || CONFIG.characterAccentColorMap.TOL);
      elements.allyHudPortrait.src = app.reactions.versionAssetUrl(hud.portrait || CONFIG.characterPresentation.genericAsset);
      elements.allyHudPortrait.alt = "";
      elements.allyHudName.textContent = hud.label;
      elements.allyHudValue.textContent = hud.value;
    }

    const baseUpdateDisplay = ui.updateDisplay;
    function updateDisplay(model) {
      baseUpdateDisplay(model);
      const session = model.state?.freeSpinSession;
      updateAllyHud(session);
      if (CONFIG.features.chooseYourAlly
        && session?.active
        && session.status === app.freeSpins.FREE_SPIN_STATUSES.INTRO
        && !session.ally?.confirmed
        && !session.ally?.legacyNoAlly) {
        ui.setPrimaryAction("disabled");
      }
    }

    const baseShowFreeSpinSummary = ui.showFreeSpinSummary;
    function showFreeSpinSummary(summary, reactionModel) {
      baseShowFreeSpinSummary(summary, reactionModel);
      if (!summary?.ally || !elements.freeSpinSummaryGrid) return;
      elements.freeSpinDetail.textContent = `${summary.ally.name} · ${summary.ally.abilityName}`;
      elements.freeSpinSummaryGrid.insertAdjacentHTML("beforeend", `<div class="ally-summary-cell"><span>Ally Bonus</span><strong>${Math.floor(summary.allyBonus || 0).toLocaleString()}</strong></div>`);
      const baseLabel = elements.freeSpinPanel.getAttribute("aria-label") || "Commune Free Spins complete.";
      elements.freeSpinPanel.setAttribute("aria-label", `${baseLabel} ${summary.ally.name} provided ${summary.allyBonus || 0} bonus coins.`);
    }

    Object.assign(ui, {
      elements,
      bindAllySelection,
      showAllySelection,
      hideAllySelection,
      showAllyCallout,
      hideAllyCallout,
      updateAllyHud,
      updateDisplay,
      showFreeSpinSummary,
    });
    return ui;
  }

  app.ui = { createUI };
})();
