(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const helpModal = document.getElementById("helpModal");
  const modal = helpModal?.querySelector(".modal");
  if (!helpModal || !modal || !app.ui?.createUI) return;

  const DEFAULT_SECTION_ID = "quick-start";
  const HELP_SECTIONS = Object.freeze([
    { id: "quick-start", title: "Quick Start" },
    { id: "special-symbols", title: "Special Symbols" },
    { id: "fortune-meter", title: "Fortune Meter" },
    { id: "fortunes-favor", title: "Fortune’s Favor" },
    { id: "wins-presentations", title: "Wins and Presentations" },
    { id: "saving-play-coins", title: "Saving and Play Coins" },
    { id: "commune-combos", title: "Commune Combos" },
    { id: "ally-abilities", title: "Ally Abilities" },
    { id: "mystery-modifiers", title: "Mystery Modifiers" },
  ]);

  const SECTION_COPY = Object.freeze({
    "quick-start": `
      <p>Commune Fortune is a five-line slot game played with fake coins.</p>
      <p>Every spin plays all five paylines:</p>
      <ul>
        <li>the top row</li>
        <li>the middle row</li>
        <li>the bottom row</li>
        <li>both diagonals</li>
      </ul>
      <p>Your Total Bet is five times your selected Line Bet.</p>
      <p>Three matching portraits on an active payline award a win. The silver Tree of Life is Wild and can substitute for any portrait.</p>
      <p>Press Spin to play. While the reels are moving, press Stop to stop the next reel sooner. Reels always stop from left to right.</p>
      <p>Stopping the reels early changes only the timing. It cannot change the result, payout, features, or odds.</p>
      <p>Character values are available under Show Symbol Payouts below the game.</p>`,
    "special-symbols": `
      <h3>Tree of Life Wild</h3>
      <p>The Tree of Life substitutes for any Commune member when completing a winning line.</p>
      <p>A Tree that naturally lands in the exact center may awaken and fill the middle reel with Wilds.</p>
      <p>Landing at least one natural Tree on each reel triggers Fortune’s Favor.</p>
      <h3>Mystery Tokens</h3>
      <p>Mystery Tokens count anywhere on the visible grid. They do not need to land on a payline.</p>
      <ul>
        <li><strong>1 Token:</strong> Shimmers, but gives no mechanical reward.</li>
        <li><strong>2 Tokens:</strong> Awards 10 Fortune and a Mystery Modifier.</li>
        <li><strong>3 Tokens:</strong> Awards one free spin and a Mystery Modifier.</li>
        <li><strong>4 or more Tokens:</strong> Awards two free spins and a Strong Mystery Modifier.</li>
      </ul>
      <p>Outside Fortune’s Favor, these become Mystery Free Spins.</p>
      <p>During Fortune’s Favor, awarded spins extend the current feature and keep the selected Ally active.</p>`,
    "fortune-meter": `
      <p>Paid spins add Fortune. Wins and Commune Combos can add more.</p>
      <p>When the meter reaches 100, the next paid spin or Mystery Free Spin becomes a Fortune Spin.</p>
      <p>A Fortune Spin multiplies the complete coin win from that spin by 1.5×.</p>
      <p>A losing Fortune Spin still uses the charge, and the meter begins building again.</p>`,
    "fortunes-favor": `
      <p>Landing a natural Tree on each of the three reels awards four Fortune’s Favor Free Spins.</p>
      <p>Before the feature begins, choose one of the seven Commune members as your Ally. Your selection is locked for the entire feature.</p>
      <p>During Fortune’s Favor:</p>
      <ul>
        <li>spins cost no coins</li>
        <li>the triggering bet remains locked</li>
        <li>the selected Ally’s ability stays active</li>
        <li>another natural Tree on every reel awards two additional spins</li>
        <li>Mystery Token spin awards extend the same feature</li>
        <li>paylines, Wilds, Mystery Tokens, Commune Combos, reactions, and modifiers remain active</li>
      </ul>
      <p>Mystery extensions do not reset the Ally or restore an ability that has already been used.</p>
      <p>The feature may award up to twenty Ally spins before the existing overflow rules apply.</p>`,
    "wins-presentations": `
      <p>Winning portraits may react directly on the reels.</p>
      <p>Larger win presentations can be skipped with:</p>
      <ul><li>Spin</li><li>Enter</li><li>Space</li></ul>
      <p>Skipping a presentation does not change the result or award.</p>`,
    "saving-play-coins": `
      <p>The coin balance, Fortune Meter, queued spins and modifiers, active feature, Ally selection, and settings save automatically in this browser.</p>
      <p>Commune Fortune uses fake play coins only.</p>
      <p>There are:</p>
      <ul><li>no purchases</li><li>no cash prizes</li><li>no withdrawals</li><li>no external accounts</li></ul>`,
    "commune-combos": `
      <p>Named Commune Combos use the middle row only. The required three symbols may appear in any order.</p>
      <p>The top row, bottom row, diagonals, and vertical columns do not award named Commune Combos.</p>
      <div class="combination-reference" id="combinationReference"></div>
      <p><strong>Full Commune:</strong> Land all seven Commune members somewhere on the grid with the Tree of Life in the exact center.</p>
      <p>Tree Awakening and other payout-only Wild transformations cannot create a natural Commune Combo or Full Commune.</p>`,
    "ally-abilities": `
      <div class="ally-ability-reference" id="allyAbilityReference"></div>
      <p>Mystery extensions add spins to the same Ally session. They do not reset the Ally ability or grant another use of a one-use effect.</p>`,
    "mystery-modifiers": `
      <p>Mystery Modifiers apply to the next eligible spin. More than one effect may apply together, and some Mystery results can create additional modifiers or free spins.</p>
      <h3>Normal Mystery Modifiers</h3>
      <div class="modifier-reference" id="normalModifierReference"></div>
      <h3>Strong Mystery Modifiers</h3>
      <div class="modifier-reference" id="strongModifierReference"></div>
      <p>Mystery Modifiers may combine, repeat, and create additional Mystery awards.</p>`,
  });

  const NORMAL_MODIFIER_COPY = Object.freeze({
    spotlight: "Boosts line wins involving one selected Commune member.",
    "center-tree": "Turns the center cell into a payout Wild unless a Tree or Mystery Token already occupies it.",
    "double-commune": "Boosts named Commune Combo awards.",
    "rescue-spin": "Rerolls a truly blank result. It never throws away a coin win, two or more Mystery Tokens, Free Spins, a natural Tree trigger, or another meaningful reward.",
    "fortune-burst": "Adds extra Fortune after the spin.",
  });

  const STRONG_MODIFIER_COPY = Object.freeze({
    "golden-payline": values => `One selected payline pays ${values.goldenPaylineMultiplier || 4}× on the next spin.`,
    "fortune-flood": values => `The next spin’s coin award pays ${values.fortuneFloodMultiplier || 2}×, and the Fortune Meter cannot finish below ${values.fortuneFloodFloor || 50}.`,
    "scatter-magnet": values => `Pulls ${values.scatterMagnetOverlays || 2} additional Mystery Tokens onto the next result without replacing the symbols underneath them.`,
    "commune-gathering": values => `Awards a guaranteed ${values.communeGatheringMultiplier || 3}× bonus for one selected named Commune group.`,
    "sevenfold-fortune": values => `One selected Commune member pays ${values.sevenfoldAssistedMultiplier || 3}×. Three natural copies of that member on a line pay ${values.sevenfoldNaturalMultiplier || 7}× instead.`,
    "full-fortune": values => `Doubles the next spin’s supported rewards, including coins, Fortune, and awarded spins.`,
    "commune-chaos": values => `Combines ${values.communeChaosEffectCount || 3} different chaotic effects on the next spin.`,
  });

  const FALLBACK_STRONG_IDS = Object.freeze([
    "golden-payline",
    "fortune-flood",
    "scatter-magnet",
    "commune-gathering",
    "sevenfold-fortune",
    "full-fortune",
    "commune-chaos",
  ]);

  const FALLBACK_STRONG_NAMES = Object.freeze({
    "golden-payline": "Golden Payline",
    "fortune-flood": "Fortune Flood",
    "scatter-magnet": "Scatter Magnet",
    "commune-gathering": "Commune Gathering",
    "sevenfold-fortune": "Sevenfold Fortune",
    "full-fortune": "Full Fortune",
    "commune-chaos": "Commune Chaos",
  });

  function ensureStylesheet() {
    if (document.querySelector('link[data-help-accordion]')) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "help-accordion.css";
    stylesheet.dataset.helpAccordion = "true";
    document.head.append(stylesheet);
  }

  function createAccordionSection(definition, isOpen) {
    const item = document.createElement("section");
    item.className = "help-accordion-item";
    item.dataset.helpSection = definition.id;

    const button = document.createElement("button");
    const panel = document.createElement("div");
    const buttonId = `help-accordion-button-${definition.id}`;
    const panelId = `help-accordion-panel-${definition.id}`;

    button.type = "button";
    button.id = buttonId;
    button.className = "help-accordion-button";
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-controls", panelId);
    button.innerHTML = `<span>${definition.title}</span><span class="help-accordion-chevron" aria-hidden="true"></span>`;

    panel.id = panelId;
    panel.className = "help-accordion-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", buttonId);
    panel.hidden = !isOpen;
    panel.innerHTML = SECTION_COPY[definition.id];

    item.append(button, panel);
    return item;
  }

  function rebuildModal() {
    ensureStylesheet();
    const visualEffectsSetting = modal.querySelector(".visual-effects-setting");
    const closeButton = document.getElementById("closeHelp");
    const visualLabel = visualEffectsSetting?.querySelector("label");
    if (visualLabel) visualLabel.replaceChildren(document.createTextNode("Visual Effects"));

    const header = document.createElement("div");
    header.className = "help-reference-header";
    const title = document.createElement("h2");
    title.id = "helpTitle";
    title.textContent = "How to Play";
    header.append(title);
    if (visualEffectsSetting) header.append(visualEffectsSetting);

    const accordion = document.createElement("div");
    accordion.className = "help-accordion";
    accordion.setAttribute("data-help-accordion", "");
    HELP_SECTIONS.forEach(section => accordion.append(createAccordionSection(section, section.id === DEFAULT_SECTION_ID)));

    const actions = document.createElement("div");
    actions.className = "modal-actions help-reference-actions";
    if (closeButton) actions.append(closeButton);

    modal.classList.add("help-reference-modal");
    modal.replaceChildren(header, accordion, actions);
    return accordion;
  }

  const accordion = rebuildModal();
  const accordionButtons = () => [...accordion.querySelectorAll(".help-accordion-button")];

  function setOpenSection(sectionId, { focus = false } = {}) {
    accordion.querySelectorAll(".help-accordion-item").forEach(item => {
      const open = item.dataset.helpSection === sectionId;
      const button = item.querySelector(".help-accordion-button");
      const panel = item.querySelector(".help-accordion-panel");
      button?.setAttribute("aria-expanded", String(open));
      if (panel) panel.hidden = !open;
      if (open && focus) button?.focus();
    });
  }

  function resetAccordion() {
    setOpenSection(DEFAULT_SECTION_ID);
    modal.scrollTop = 0;
  }

  function handleAccordionKeydown(event) {
    const buttons = accordionButtons();
    const index = buttons.indexOf(event.currentTarget);
    let target = null;
    if (event.key === "ArrowDown") target = buttons[(index + 1) % buttons.length];
    if (event.key === "ArrowUp") target = buttons[(index - 1 + buttons.length) % buttons.length];
    if (event.key === "Home") target = buttons[0];
    if (event.key === "End") target = buttons.at(-1);
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  accordionButtons().forEach(button => {
    button.addEventListener("click", () => {
      const item = button.closest(".help-accordion-item");
      setOpenSection(item?.dataset.helpSection || DEFAULT_SECTION_ID);
    });
    // Native button semantics provide Enter and Space activation.
    button.addEventListener("keydown", handleAccordionKeydown);
  });

  const numberWord = value => ({ 1: "one", 2: "two", 3: "three", 4: "four", 7: "seven", 20: "twenty" }[value] || String(value));
  const percent = value => `${Math.round((Number(value) || 0) * 100)}%`;
  const multiplier = value => `${Number(value) || 1}×`;

  function addEquationSymbols(container, keys) {
    keys.forEach((key, index) => {
      if (index) {
        const operator = document.createElement("span");
        operator.className = "combination-reference-operator";
        operator.setAttribute("aria-hidden", "true");
        operator.textContent = "+";
        container.append(operator);
      }
      const symbol = CONFIG.symbols[key];
      const image = document.createElement("img");
      image.src = symbol.image;
      image.alt = symbol.name;
      container.append(image);
    });
  }

  function combinationPayout(definition) {
    return definition.payoutType === "totalBet"
      ? `${definition.multiplier}× total bet`
      : `${definition.multiplier}× line bet`;
  }

  function buildCombinationReference() {
    const reference = document.getElementById("combinationReference");
    if (!reference) return;
    reference.replaceChildren();

    CONFIG.combinations.definitions.forEach(definition => {
      const row = document.createElement("div");
      row.className = "combination-reference-row";
      const identity = document.createElement("div");
      identity.className = "combination-reference-name";
      identity.innerHTML = `<strong>${definition.name}</strong><small>${combinationPayout(definition)}</small>`;
      const symbols = document.createElement("div");
      symbols.className = "combination-reference-symbols";
      addEquationSymbols(symbols, definition.sequence);
      row.append(identity, symbols);
      reference.append(row);
    });

    const full = CONFIG.combinations.fullCommune;
    const fullRow = document.createElement("div");
    fullRow.className = "combination-reference-row full";
    const identity = document.createElement("div");
    identity.className = "combination-reference-name";
    identity.innerHTML = `<strong>${full.name}</strong><small>${combinationPayout(full)}</small>`;
    const content = document.createElement("div");
    content.className = "combination-reference-full-content";
    const symbols = document.createElement("div");
    symbols.className = "combination-reference-symbols combination-reference-symbols-full";
    addEquationSymbols(symbols, [...full.requiredCharacters, "TOL"]);
    const description = document.createElement("p");
    description.textContent = "Land all seven Commune members somewhere on the grid with the Tree of Life in the exact center.";
    content.append(symbols, description);
    fullRow.append(identity, content);
    reference.append(fullRow);
  }

  function allyDescription(id, definition) {
    const parameters = definition.parameters || {};
    const descriptions = {
      sterling: "Each losing spin builds an Insurance Pot. Sterling pays the accumulated Insurance when Fortune’s Favor ends.",
      cydney: `Cydney remembers the first winning spin and pays an Echo worth ${percent(parameters.echoMultiplier)} of that win when the feature ends.`,
      ryan: `One of the first ${numberWord(parameters.selectedInitialSpinCount)} Free Spins is secretly selected. If that spin wins coins, its payout is doubled.`,
      gabi: `Gabi replays the first weak win below ${multiplier(parameters.thresholdMultiplier)} the Total Bet and keeps the better-paying result.`,
      cooper: `Consecutive losses build Rage. The next win receives a growing multiplier, up to ${multiplier(Math.max(...(parameters.multiplierLadder || [2])))}.`,
      kenly: `Every natural Small Win receives a ${percent(parameters.lemonadeMultiplier)} Lemonade Bonus.`,
      ashley: "Ashley replays the first losing spin once. The replay becomes the result of that spin.",
    };
    return descriptions[id] || definition.description;
  }

  function buildAllyReference() {
    const reference = document.getElementById("allyAbilityReference");
    if (!reference) return;
    reference.replaceChildren();
    CONFIG.allyOrder.forEach(id => {
      const definition = CONFIG.allies[id];
      if (!definition) return;
      const card = document.createElement("article");
      card.className = "ally-ability-card";
      const image = document.createElement("img");
      image.src = definition.portrait;
      image.alt = `${definition.name} portrait`;
      const copy = document.createElement("div");
      copy.innerHTML = `<h4>${definition.name}</h4><strong>${definition.abilityName}</strong><p>${allyDescription(id, definition)}</p>`;
      card.append(image, copy);
      reference.append(card);
    });
  }

  function addModifierEntry(container, name, description) {
    const entry = document.createElement("article");
    entry.className = "modifier-reference-entry";
    entry.innerHTML = `<h4>${name}</h4><p>${description}</p>`;
    container.append(entry);
  }

  function buildModifierReferences() {
    const normal = document.getElementById("normalModifierReference");
    const strong = document.getElementById("strongModifierReference");
    if (normal) {
      normal.replaceChildren();
      CONFIG.mystery.normalModifierPool.forEach(id => {
        addModifierEntry(normal, app.mystery?.MODIFIER_NAMES?.[id] || id, NORMAL_MODIFIER_COPY[id] || "Applies to the next eligible spin.");
      });
    }
    if (strong) {
      strong.replaceChildren();
      const values = CONFIG.mystery.strong || {};
      const ids = app.strongMystery?.ids || FALLBACK_STRONG_IDS;
      const names = app.strongMystery?.names || FALLBACK_STRONG_NAMES;
      ids.forEach(id => addModifierEntry(strong, names[id] || FALLBACK_STRONG_NAMES[id], STRONG_MODIFIER_COPY[id](values)));
    }
  }

  function buildReferenceContent() {
    buildCombinationReference();
    buildAllyReference();
    buildModifierReferences();
  }

  function focusableElements() {
    return [...modal.querySelectorAll('button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.closest("[hidden]"));
  }

  function trapModalFocus(event) {
    if (event.key !== "Tab" || !helpModal.classList.contains("open")) return;
    const focusable = focusableElements();
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

  helpModal.addEventListener("keydown", trapModalFocus);
  buildReferenceContent();

  const createUI = app.ui.createUI;
  app.ui.createUI = function createHelpReferenceUI(...args) {
    const ui = createUI(...args);
    const openHelp = ui.openHelp;
    const closeHelp = ui.closeHelp;
    let returnFocus = null;

    ui.buildCombinationReference = buildReferenceContent;
    ui.openHelp = () => {
      returnFocus = document.activeElement;
      resetAccordion();
      buildReferenceContent();
      openHelp();
      document.body.classList.add("help-modal-open");
      requestAnimationFrame(() => accordionButtons()[0]?.focus());
    };
    ui.closeHelp = () => {
      closeHelp();
      document.body.classList.remove("help-modal-open");
      const target = returnFocus?.isConnected ? returnFocus : ui.elements.helpButton;
      returnFocus = null;
      requestAnimationFrame(() => target?.focus());
    };
    return ui;
  };

  app.helpReference = Object.freeze({
    DEFAULT_SECTION_ID,
    HELP_SECTIONS,
    resetAccordion,
    setOpenSection,
    buildReferenceContent,
  });
})();