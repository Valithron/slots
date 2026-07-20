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
    let selectionEventsBound = false;
    let lastFocusedBeforeSelection = null;
    let lockedScrollY = 0;
    let qaPreviewMode = false;

    const escapeHtml = value => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const formatNumber = value => Math.floor(Number(value) || 0).toLocaleString();
    const portraitUrl = definition => app.reactions.versionAssetUrl(definition?.portrait || CONFIG.characterPresentation.genericAsset);
    const genericPortraitUrl = () => app.reactions.versionAssetUrl(CONFIG.characterPresentation.genericAsset);

    function ensureAllySelectionStructure() {
      const panel = elements.allySelectionPanel;
      const grid = elements.allySelectionGrid;
      const button = elements.allyConfirmButton;
      if (!panel || !grid || !button || panel.dataset.responsiveStructure === "true") return;

      const heading = panel.querySelector(".ally-selection-heading");
      const subtitle = panel.querySelector(".ally-selection-subtitle");
      const header = document.createElement("header");
      header.className = "ally-selection-header";
      if (heading) header.append(heading);
      if (subtitle) {
        subtitle.textContent = "Pick one Ally for this Free Spins event.";
        header.append(subtitle);
      }

      const scroll = document.createElement("div");
      scroll.className = "ally-selection-scroll";
      scroll.id = "allySelectionScroll";
      grid.setAttribute("role", "radiogroup");
      grid.setAttribute("aria-label", "Choose one Ally");
      scroll.append(grid);

      const detail = document.createElement("section");
      detail.className = "ally-selection-detail";
      detail.id = "allySelectionDetail";
      detail.hidden = true;
      detail.setAttribute("aria-live", "polite");
      detail.innerHTML = `
        <strong class="ally-selection-detail-title" id="allySelectionDetailTitle"></strong>
        <p class="ally-selection-detail-copy" id="allySelectionDetailCopy"></p>`;
      scroll.append(detail);

      const footer = document.createElement("footer");
      footer.className = "ally-selection-footer";
      footer.innerHTML = `<div class="ally-selection-footer-summary" id="allySelectionFooterSummary">Choose an Ally to continue</div>`;
      button.classList.add("ally-confirm-button");
      footer.append(button);

      panel.replaceChildren(header, scroll, footer);
      panel.dataset.responsiveStructure = "true";
      panel.setAttribute("aria-describedby", "allySelectionDetailCopy");
      elements.allySelectionScroll = scroll;
      elements.allySelectionDetail = detail;
      elements.allySelectionDetailTitle = detail.querySelector("#allySelectionDetailTitle");
      elements.allySelectionDetailCopy = detail.querySelector("#allySelectionDetailCopy");
      elements.allySelectionFooterSummary = footer.querySelector("#allySelectionFooterSummary");
    }

    function ensureFeatureHudStructure() {
      const hud = document.getElementById("freeSpinsHud");
      if (!hud || hud.dataset.responsiveStructure === "true") return;
      [...hud.children].forEach(child => child.classList.add(child === elements.allyHud ? "ally-hud" : "feature-hud-stat"));

      const totalAwarded = document.createElement("div");
      totalAwarded.className = "feature-hud-stat";
      totalAwarded.innerHTML = `<span>Total Awarded</span><strong id="totalAwardedSpinsValue">0</strong>`;
      hud.insertBefore(totalAwarded, elements.allyHud || null);
      elements.totalAwardedSpinsValue = totalAwarded.querySelector("#totalAwardedSpinsValue");

      if (elements.allyHudValue && !document.getElementById("allyHudState")) {
        const state = document.createElement("small");
        state.id = "allyHudState";
        state.className = "ally-hud-state";
        elements.allyHudValue.insertAdjacentElement("afterend", state);
        elements.allyHudState = state;
      }
      hud.dataset.responsiveStructure = "true";
    }

    function makeDisclosureSummary(showLabel, hideLabel) {
      const summary = document.createElement("summary");
      summary.innerHTML = `<span class="disclosure-label-closed">${escapeHtml(showLabel)}</span><span class="disclosure-label-open">${escapeHtml(hideLabel)}</span><span class="disclosure-chevron" aria-hidden="true"></span>`;
      return summary;
    }

    function ensurePayoutDisclosure() {
      const paytable = elements.paytable;
      if (!paytable || paytable.closest(".payout-disclosure")) return;
      const details = document.createElement("details");
      details.className = "payout-disclosure reference-disclosure";
      details.append(makeDisclosureSummary("Show symbol payouts", "Hide symbol payouts"));
      paytable.parentNode.insertBefore(details, paytable);
      details.append(paytable);
      details.open = false;
    }

    function ensureCombinationDisclosure() {
      const reference = elements.combinationReference;
      if (!reference || reference.closest(".combination-disclosure")) return;
      const heading = reference.previousElementSibling?.classList.contains("combination-reference-heading")
        ? reference.previousElementSibling
        : null;
      const details = document.createElement("details");
      details.className = "combination-disclosure reference-disclosure";
      details.append(makeDisclosureSummary("Show Commune combinations", "Hide Commune combinations"));
      const content = document.createElement("div");
      content.className = "combination-disclosure-content";
      reference.parentNode.insertBefore(details, heading || reference);
      if (heading) {
        heading.classList.add("disclosure-content-heading");
        content.append(heading);
      }
      content.append(reference);
      details.append(content);
      details.open = false;
    }

    function installImageFallbacks(root) {
      root?.querySelectorAll?.("img[data-fallback-src]").forEach(image => {
        if (image.dataset.responsiveFallbackBound === "true") return;
        image.dataset.responsiveFallbackBound = "true";
        image.addEventListener("error", () => {
          const fallback = image.dataset.fallbackSrc || genericPortraitUrl();
          if ((image.getAttribute("src") || "") === fallback) return;
          image.setAttribute("src", fallback);
        });
      });
    }

    function lockBackgroundScroll() {
      if (document.body.classList.contains("ally-selection-open")) return;
      lockedScrollY = globalThis.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add("ally-selection-open");
      document.body.classList.add("ally-selection-open");
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.width = "100%";
    }

    function unlockBackgroundScroll() {
      if (!document.body.classList.contains("ally-selection-open")) return;
      document.documentElement.classList.remove("ally-selection-open");
      document.body.classList.remove("ally-selection-open");
      document.body.style.removeProperty("top");
      document.body.style.removeProperty("width");
      globalThis.scrollTo?.(0, lockedScrollY);
    }

    function focusableSelectionElements() {
      if (!elements.allySelectionPanel) return [];
      return [...elements.allySelectionPanel.querySelectorAll('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
    }

    function handleSelectionKeydown(event) {
      if (!elements.allySelectionLayer?.classList.contains("is-visible")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableSelectionElements();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function renderAllyCards(selectedId = null) {
      if (!elements.allySelectionGrid) return;
      elements.allySelectionGrid.innerHTML = CONFIG.allyOrder.map(id => {
        const definition = CONFIG.allies[id];
        const selected = selectedId === id;
        const inputId = `ally-choice-${id}`;
        return `<label class="ally-card${selected ? " is-selected" : ""}" data-ally-card="${id}" style="--ally-accent:${escapeHtml(definition.accent)}">
          <input class="ally-card-radio" id="${inputId}" type="radio" name="ally-choice" value="${id}" data-ally-id="${id}"${selected ? " checked" : ""}>
          <span class="ally-card-check" aria-hidden="true">✓</span>
          <span class="ally-card-portrait"><img src="${portraitUrl(definition)}" data-fallback-src="${genericPortraitUrl()}" alt="${escapeHtml(definition.name)}"></span>
          <span class="ally-card-copy">
            <strong>${escapeHtml(definition.name)}</strong>
            <b>${escapeHtml(definition.abilityName)}</b>
          </span>
        </label>`;
      }).join("");
      installImageFallbacks(elements.allySelectionGrid);
    }

    function updateSelectedAllyUI(selectedId) {
      const definition = CONFIG.allies[selectedId] || null;
      elements.allySelectionGrid?.querySelectorAll(".ally-card").forEach(card => {
        const selected = card.dataset.allyCard === selectedId;
        card.classList.toggle("is-selected", selected);
        const input = card.querySelector(".ally-card-radio");
        if (input) input.checked = selected;
      });

      if (elements.allySelectionDetail) elements.allySelectionDetail.hidden = !definition;
      if (elements.allySelectionDetailTitle) elements.allySelectionDetailTitle.textContent = definition
        ? `${definition.name.toUpperCase()} · ${definition.abilityName.toUpperCase()}`
        : "";
      if (elements.allySelectionDetailCopy) elements.allySelectionDetailCopy.textContent = definition?.description || "";
      if (elements.allySelectionFooterSummary) elements.allySelectionFooterSummary.textContent = definition
        ? `Selected: ${definition.name} · ${definition.abilityName}`
        : "Choose an Ally to continue";
      if (elements.allyConfirmButton) {
        elements.allyConfirmButton.disabled = !definition;
        elements.allyConfirmButton.textContent = definition ? `Start with ${definition.name}` : "Select an Ally";
        elements.allyConfirmButton.setAttribute("aria-disabled", String(!definition));
      }
      elements.allySelectionPanel?.setAttribute("aria-label", definition
        ? `${definition.name}, ${definition.abilityName}, selected. Review the ability and confirm.`
        : "Choose one Commune member as your Ally, review the ability, then confirm.");
      if (elements.allySelectionAnnouncer) elements.allySelectionAnnouncer.textContent = definition
        ? `${definition.name} selected. ${definition.abilityName}. ${definition.description}`
        : "Choose your Ally for Commune Free Spins.";
    }

    function bindAllySelection({ onSelect, onConfirm } = {}) {
      ensureAllySelectionStructure();
      selectHandler = typeof onSelect === "function" ? onSelect : null;
      confirmHandler = typeof onConfirm === "function" ? onConfirm : null;
      if (selectionEventsBound) return;
      selectionEventsBound = true;
      elements.allySelectionGrid?.addEventListener("change", event => {
        const input = event.target.closest("input[data-ally-id]");
        if (!input || !elements.allySelectionGrid.contains(input)) return;
        updateSelectedAllyUI(input.dataset.allyId);
        if (!qaPreviewMode) selectHandler?.(input.dataset.allyId);
      });
      elements.allyConfirmButton?.addEventListener("click", () => {
        if (qaPreviewMode) {
          qaPreviewMode = false;
          hideAllySelection();
          return;
        }
        confirmHandler?.();
      });
      elements.allySelectionLayer?.addEventListener("keydown", handleSelectionKeydown);
    }

    function showAllySelection(session) {
      ensureAllySelectionStructure();
      if (!elements.allySelectionLayer || !elements.allySelectionGrid) return;
      const wasVisible = elements.allySelectionLayer.classList.contains("is-visible");
      const activeAllyId = document.activeElement?.dataset?.allyId || null;
      const ally = app.allies.normalizeAllyState(session?.ally);
      if (!wasVisible) lastFocusedBeforeSelection = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      renderAllyCards(ally.selectedId);
      updateSelectedAllyUI(ally.selectedId);
      elements.allySelectionLayer.className = "ally-selection-layer is-visible";
      elements.allySelectionLayer.setAttribute("aria-hidden", "false");
      lockBackgroundScroll();
      requestAnimationFrame(() => {
        const preferredId = activeAllyId || ally.selectedId;
        const preferred = preferredId
          ? elements.allySelectionGrid.querySelector(`[data-ally-id="${preferredId}"]`)
          : null;
        if (preferred) preferred.focus();
        else if (!wasVisible) elements.allySelectionGrid.querySelector(".ally-card-radio")?.focus();
      });
    }

    function hideAllySelection() {
      if (!elements.allySelectionLayer) return;
      const wasVisible = elements.allySelectionLayer.classList.contains("is-visible");
      elements.allySelectionLayer.className = "ally-selection-layer";
      elements.allySelectionLayer.setAttribute("aria-hidden", "true");
      unlockBackgroundScroll();
      if (wasVisible) requestAnimationFrame(() => {
        if (lastFocusedBeforeSelection?.isConnected) lastFocusedBeforeSelection.focus();
        else elements.spinButton?.focus();
        lastFocusedBeforeSelection = null;
      });
    }

    function calloutDetail(activation, session) {
      const allyId = activation?.allyId || session?.ally?.selectedId;
      if (allyId === "sterling") return activation?.endBonus
        ? `Insurance pays +${activation.bonus || 0} coins.`
        : "A loss added to the Insurance Pot.";
      if (allyId === "ryan") {
        if (activation?.preSpin) return "This is the Big Win Spin. Any win pays 2×.";
        return activation?.baseWin > 0
          ? `Big Win multiplies ${activation.baseWin} to ${activation.baseWin + activation.bonus}.`
          : "The Big Win Spin landed no payout.";
      }
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
      elements.allyCalloutPortrait.dataset.fallbackSrc = genericPortraitUrl();
      elements.allyCalloutPortrait.alt = definition.name;
      installImageFallbacks(elements.allyCalloutPanel);
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
      ensureFeatureHudStructure();
      if (!elements.allyHud) return;
      const active = Boolean(session?.active && session?.ally?.confirmed && session?.ally?.selectedId);
      elements.allyHud.hidden = !active;
      if (elements.totalAwardedSpinsValue) elements.totalAwardedSpinsValue.textContent = formatNumber(session?.totalAwardedSpins || 0);
      if (!active) return;
      const hud = app.allies.getHudState(session);
      const definition = CONFIG.allies[session.ally.selectedId];
      elements.allyHud.style.setProperty("--ally-accent", hud.accent || CONFIG.characterAccentColorMap.TOL);
      elements.allyHudPortrait.src = app.reactions.versionAssetUrl(hud.portrait || CONFIG.characterPresentation.genericAsset);
      elements.allyHudPortrait.dataset.fallbackSrc = genericPortraitUrl();
      elements.allyHudPortrait.alt = "";
      installImageFallbacks(elements.allyHud);
      elements.allyHudName.textContent = definition?.name || hud.label;
      elements.allyHudValue.textContent = definition?.abilityName || hud.value;
      if (elements.allyHudState) {
        elements.allyHudState.textContent = hud.value && hud.value !== definition?.abilityName ? hud.value : "";
        elements.allyHudState.hidden = !elements.allyHudState.textContent;
      }
    }

    const baseBuildPaytable = ui.buildPaytable;
    function buildPaytable() {
      baseBuildPaytable();
      ensurePayoutDisclosure();
      installImageFallbacks(elements.paytable);
    }

    const baseBuildCombinationReference = ui.buildCombinationReference;
    function buildCombinationReference() {
      baseBuildCombinationReference();
      ensureCombinationDisclosure();
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

    function ensureFeatureSummaryDisclosure() {
      const grid = elements.freeSpinSummaryGrid;
      if (!grid || grid.querySelector(":scope > .feature-summary-details")) return grid?.querySelector(".feature-summary-detail-grid") || null;
      const cells = [...grid.children];
      const details = document.createElement("details");
      details.className = "feature-summary-details";
      details.append(makeDisclosureSummary("Show feature details", "Hide feature details"));
      const detailGrid = document.createElement("div");
      detailGrid.className = "feature-summary-detail-grid";
      cells.forEach(cell => detailGrid.append(cell));
      details.append(detailGrid);
      grid.replaceChildren(details);
      return detailGrid;
    }

    const baseShowFreeSpinSummary = ui.showFreeSpinSummary;
    function showFreeSpinSummary(summary, reactionModel) {
      baseShowFreeSpinSummary(summary, reactionModel);
      const detailGrid = ensureFeatureSummaryDisclosure();
      elements.freeSpinTitle.textContent = "Feature Complete";
      elements.freeSpinAward.textContent = `Total Win: ${formatNumber(summary?.accumulatedWin)}`;
      if (summary?.ally) {
        elements.freeSpinDetail.textContent = `MVP: ${summary.ally.name}`;
        detailGrid?.insertAdjacentHTML("beforeend", `<div class="ally-summary-cell"><span>Ally Bonus</span><strong>${formatNumber(summary.allyBonus)}</strong></div>`);
        const baseLabel = elements.freeSpinPanel.getAttribute("aria-label") || "Commune Free Spins complete.";
        elements.freeSpinPanel.setAttribute("aria-label", `${baseLabel} ${summary.ally.name} provided ${summary.allyBonus || 0} bonus coins.`);
      }
    }

    function previewAllySelection(allyId = "sterling") {
      qaPreviewMode = true;
      showAllySelection({ ally: { selectedId: CONFIG.allies[allyId] ? allyId : null } });
    }

    function previewFeatureHud(allyId = "cydney") {
      const selectedId = CONFIG.allies[allyId] ? allyId : "cydney";
      const session = {
        active: true,
        remainingSpins: 12,
        totalAwardedSpins: 18,
        accumulatedWin: 987654,
        referenceBet: 5000,
        ally: { selectedId, confirmed: true },
      };
      ui.updateFreeSpinsHud?.(session);
      updateAllyHud(session);
    }

    function previewFeatureSummary(allyId = "ryan") {
      const selectedId = CONFIG.allies[allyId] ? allyId : "ryan";
      const definition = CONFIG.allies[selectedId];
      showFreeSpinSummary({
        accumulatedWin: 987654,
        completedSpins: 14,
        retriggerCount: 4,
        totalAwardedSpins: 18,
        allyBonus: 123456,
        ally: { name: definition.name, abilityName: definition.abilityName },
      }, { label: definition.name, portraits: [{ characterKey: definition.characterKey }] });
    }

    function previewPayouts() {
      ensurePayoutDisclosure();
      const details = document.querySelector(".payout-disclosure");
      if (details) {
        details.open = true;
        details.scrollIntoView({ block: "nearest" });
      }
    }

    function previewStressLabels() {
      if (elements.coinsValue) elements.coinsValue.textContent = "987,654,321";
      const queue = document.getElementById("mysteryModifierQueue");
      const chips = document.getElementById("mysteryModifierChips");
      if (queue && chips) {
        queue.hidden = false;
        chips.innerHTML = [
          "Commune Chaos · Golden Payline + Sevenfold Fortune + Scatter Spark",
          "Sevenfold Fortune · Cydney",
          "Golden Payline · Bottom-to-top diagonal",
        ].map(label => `<span class="mystery-chip">${escapeHtml(label)}</span>`).join("");
      }
    }

    function previewMissingPortrait() {
      previewAllySelection("ashley");
      const image = elements.allySelectionGrid?.querySelector('[data-ally-card="ashley"] img');
      if (image) image.src = "assets/symbols/qa-missing-portrait.svg";
    }

    function clearResponsivePreview() {
      qaPreviewMode = false;
      hideAllySelection();
      ui.hideFreeSpinLayer?.();
      const queue = document.getElementById("mysteryModifierQueue");
      if (queue) queue.hidden = true;
    }

    Object.assign(ui, {
      elements,
      bindAllySelection,
      showAllySelection,
      hideAllySelection,
      showAllyCallout,
      hideAllyCallout,
      updateAllyHud,
      buildPaytable,
      buildCombinationReference,
      updateDisplay,
      showFreeSpinSummary,
    });

    app.mobileUsabilityQA = {
      previewAllySelection,
      previewFeatureHud,
      previewFeatureSummary,
      previewPayouts,
      previewStressLabels,
      previewMissingPortrait,
      clearResponsivePreview,
    };

    if (new URLSearchParams(globalThis.location?.search || "").get("qa") === "ally"
      && !document.querySelector('script[data-mobile-usability-qa]')) {
      const script = document.createElement("script");
      script.src = "js/mobile-usability-qa.js";
      script.dataset.mobileUsabilityQa = "true";
      document.head.append(script);
    }

    return ui;
  }

  app.ui = { createUI };
})();
