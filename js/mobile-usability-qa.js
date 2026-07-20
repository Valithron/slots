(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const api = app?.mobileUsabilityQA;
  if (!api) return;

  function mount() {
    const panelBody = document.querySelector(".qa-panel .qa-panel-body");
    if (!panelBody || panelBody.querySelector("[data-mobile-usability-section]")) return false;
    const danger = panelBody.querySelector(".qa-danger");
    const section = document.createElement("section");
    section.className = "qa-section";
    section.dataset.mobileUsabilitySection = "true";
    section.innerHTML = `
      <h3>Mobile Presentation</h3>
      <p>These controls render the production Ally, HUD, summary, payout, and message components with deterministic stress content.</p>
      <label class="qa-field">Preview Ally
        <select data-mobile-ally>
          ${CONFIG_OPTIONS()}
        </select>
      </label>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="ally-sheet">Open Ally Sheet</button>
        <button type="button" data-mobile-action="missing-portrait">Missing Portrait</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="feature-hud">Large Feature HUD</button>
        <button type="button" data-mobile-action="feature-summary">Feature Summary</button>
      </div>
      <div class="qa-row qa-row-split">
        <button type="button" data-mobile-action="payouts">Open Payouts</button>
        <button type="button" data-mobile-action="stress-labels">Stacked Labels</button>
      </div>
      <button type="button" data-mobile-action="clear">Clear Presentation Preview</button>`;
    panelBody.insertBefore(section, danger || null);

    section.addEventListener("click", event => {
      const action = event.target.closest("button[data-mobile-action]")?.dataset.mobileAction;
      if (!action) return;
      const allyId = section.querySelector("[data-mobile-ally]")?.value || "sterling";
      if (action === "ally-sheet") api.previewAllySelection(allyId);
      else if (action === "missing-portrait") api.previewMissingPortrait();
      else if (action === "feature-hud") api.previewFeatureHud(allyId);
      else if (action === "feature-summary") api.previewFeatureSummary(allyId);
      else if (action === "payouts") api.previewPayouts();
      else if (action === "stress-labels") api.previewStressLabels();
      else if (action === "clear") api.clearResponsivePreview();
    });
    return true;
  }

  function CONFIG_OPTIONS() {
    const config = app.CONFIG;
    return config.allyOrder.map(id => {
      const ally = config.allies[id];
      return `<option value="${id}">${ally.name} · ${ally.abilityName}</option>`;
    }).join("");
  }

  if (!mount()) {
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    globalThis.setTimeout(() => observer.disconnect(), 5000);
  }
})();
