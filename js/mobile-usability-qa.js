(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  if (!app) return;

  const api = () => app.mobileUsabilityQA || {};

  function allyOptions() {
    const config = app.CONFIG;
    return config.allyOrder.map(id => {
      const ally = config.allies[id];
      return `<option value="${id}">${ally.name} · ${ally.abilityName}</option>`;
    }).join("");
  }

  function selectedAlly(section) {
    return section.querySelector("[data-mobile-ally]")?.value || "gabi";
  }

  function mount() {
    const panelBody = document.querySelector(".qa-panel .qa-panel-body");
    if (!panelBody || panelBody.querySelector("[data-mobile-usability-section]")) return false;
    const danger = panelBody.querySelector(".qa-danger");
    const section = document.createElement("section");
    section.className = "qa-section";
    section.dataset.mobileUsabilitySection = "true";
    section.innerHTML = `
      <h3>Mobile Presentation</h3>
      <p>Production components with deterministic display-only state. No saved game values, odds, queues, or settlements are changed.</p>
      <label class="qa-field">Preview Ally
        <select data-mobile-ally>${allyOptions()}</select>
      </label>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="ally-sheet">Open Ally Sheet</button>
        <button type="button" data-mobile-action="missing-portrait">Missing Portrait</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="active-4">Active · 4 Spins</button>
        <button type="button" data-mobile-action="active-12">Active · 12 Spins</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="ability-ready">Ability Ready</button>
        <button type="button" data-mobile-action="ability-used">Ability Used</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="large-win">Large Feature Win</button>
        <button type="button" data-mobile-action="large-bet">Large Locked Bet</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="queue-none">No Mystery Queue</button>
        <button type="button" data-mobile-action="queue-modifier">Modifier Only</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="queue-spins">Mystery Spins Only</button>
        <button type="button" data-mobile-action="queue-combined">Spins + Modifier</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="feature-summary">Feature Complete</button>
        <button type="button" data-mobile-action="summary-queued">Summary + Next</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="summary-expanded">Expanded Details</button>
        <button type="button" data-mobile-action="payouts">Open Payouts</button>
      </div>
      <button type="button" data-mobile-action="viewport-stress">Viewport Stress State</button>
      <button type="button" data-mobile-action="clear">Clear Presentation Preview</button>`;
    panelBody.insertBefore(section, danger || null);

    section.addEventListener("click", event => {
      const action = event.target.closest("button[data-mobile-action]")?.dataset.mobileAction;
      if (!action) return;
      const allyId = selectedAlly(section);
      const mobile = api();
      if (action === "ally-sheet") mobile.previewAllySelection?.(allyId);
      else if (action === "missing-portrait") mobile.previewMissingPortrait?.();
      else if (action === "active-4") mobile.previewActiveFeature?.({ allyId, spins: 4, used: false });
      else if (action === "active-12") mobile.previewActiveFeature?.({ allyId, spins: 12, used: false });
      else if (action === "ability-ready") mobile.previewActiveFeature?.({ allyId, spins: 4, used: false });
      else if (action === "ability-used") mobile.previewActiveFeature?.({ allyId, spins: 4, used: true });
      else if (action === "large-win") mobile.previewActiveFeature?.({ allyId, spins: 4, featureWin: 987654321, used: true });
      else if (action === "large-bet") mobile.previewActiveFeature?.({ allyId, spins: 4, lockedBet: 500000, used: false });
      else if (action === "queue-none") mobile.previewActiveFeature?.({ allyId, spins: 4, mysterySpins: 0 });
      else if (action === "queue-modifier") mobile.previewActiveFeature?.({ allyId, spins: 4, modifierId: "center-tree", modifierName: "Center Tree" });
      else if (action === "queue-spins") mobile.previewActiveFeature?.({ allyId, spins: 4, mysterySpins: 2 });
      else if (action === "queue-combined") mobile.previewActiveFeature?.({ allyId, spins: 4, mysterySpins: 2, modifierId: "center-tree", modifierName: "Center Tree" });
      else if (action === "feature-summary") mobile.previewCompactSummary?.({ allyId, used: true });
      else if (action === "summary-queued") mobile.previewCompactSummary?.({ allyId, used: true, modifierId: "center-tree", modifierName: "Center Tree" });
      else if (action === "summary-expanded") mobile.previewExpandedFeatureDetails?.({ allyId, used: true, modifierId: "center-tree", modifierName: "Center Tree" });
      else if (action === "payouts") mobile.previewPayouts?.();
      else if (action === "viewport-stress") mobile.previewActiveFeature?.({
        allyId: "cydney",
        spins: 12,
        featureWin: 987654321,
        lockedBet: 500000,
        used: true,
        mysterySpins: 12,
        modifierId: "commune-chaos",
        modifierName: "Commune Chaos · Golden Payline + Sevenfold Fortune + Scatter Magnet",
        largeCoins: true,
      });
      else if (action === "clear") {
        mobile.clearCompactPreview?.();
        mobile.clearResponsivePreview?.();
      }
    });
    return true;
  }

  if (!mount()) {
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    globalThis.setTimeout(() => observer.disconnect(), 5000);
  }
})();
