(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const originalCreateUI = app.ui.createUI;

  function createUI() {
    const ui = originalCreateUI();
    const visualEffectsMode = document.getElementById("visualEffectsMode");
    ui.elements.visualEffectsMode = visualEffectsMode;

    ui.buildCombinationReference = () => {
      const container = ui.elements.combinationReference;
      if (!container) return;
      const entries = CONFIG.combinations.definitions.map(definition => {
        const symbols = definition.members
          .map(key => `<img src="${CONFIG.symbols[key].image}" alt="${CONFIG.symbols[key].name}">`)
          .join('<span class="combination-plus" aria-hidden="true">+</span>');
        return `<div class="combination-reference-row"><div class="combination-reference-name"><strong>${definition.name}</strong><small>Any order · ${definition.multiplier}× line bet</small></div><div class="combination-reference-symbols" aria-label="Required symbols, any order">${symbols}</div></div>`;
      });
      const full = CONFIG.combinations.fullCommune;
      entries.push(`<div class="combination-reference-row full"><div class="combination-reference-name"><strong>${full.name}</strong><small>${full.multiplier}× total bet</small></div><div class="combination-reference-description">All seven members visible, with the Tree in the center cell</div></div>`);
      container.innerHTML = entries.join("");
    };

    const applyCurrentMotionClasses = () => app.effects.applyMotionClasses(ui.elements.machine, ui.elements.reelFrame);
    applyCurrentMotionClasses();

    const originalUpdateDisplay = ui.updateDisplay;
    ui.updateDisplay = options => {
      originalUpdateDisplay(options);
      if (visualEffectsMode) visualEffectsMode.value = app.visualEffectsSettings.getMode();
      applyCurrentMotionClasses();
    };

    visualEffectsMode?.addEventListener("change", event => {
      const mode = app.effects.setVisualEffectsMode(event.currentTarget.value);
      event.currentTarget.value = mode;
      applyCurrentMotionClasses();
    });

    return ui;
  }

  app.ui.createUI = createUI;
})();