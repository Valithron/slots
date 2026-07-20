(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  if (!app?.fortuneFavor || !app.ui?.createUI || !globalThis.document) return;
  const { CONFIG } = app;
  const { runtime, normalizeFailures, getProgressLabel } = app.fortuneFavor;

  function ensureStylesheet() {
    if (document.querySelector('link[data-fortune-favor]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "fortune-favor.css";
    link.dataset.fortuneFavor = "true";
    document.head.append(link);
  }

  function ensureMeterUi(elements) {
    const wrap = elements?.fortuneMeterWrap || document.getElementById("fortuneMeterWrap");
    if (!wrap || wrap.querySelector(".fortune-favor-progress")) return;
    const row = document.createElement("div");
    row.className = "fortune-favor-progress";
    row.innerHTML = `
      <span class="fortune-favor-label" data-favor-label>Favor Chance</span>
      <span class="fortune-favor-leaves" aria-hidden="true">
        ${Array.from({ length: CONFIG.fortuneFavor.pityFailureCap }, (_, index) => `<span class="fortune-favor-leaf" data-favor-leaf="${index}"><span></span></span>`).join("")}
      </span>
      <span class="sr-only" data-favor-accessible></span>`;
    wrap.append(row);
    const ready = document.createElement("div");
    ready.className = "fortune-favor-ready-copy";
    ready.hidden = true;
    ready.innerHTML = '<strong>FORTUNE SPIN READY</strong><span data-favor-ready-detail>1.5× WIN · FAVOR CHANCE</span>';
    wrap.append(ready);
  }

  function updateMeterUi(state, elements, active = false) {
    const wrap = elements?.fortuneMeterWrap || document.getElementById("fortuneMeterWrap");
    if (!wrap) return;
    ensureMeterUi(elements);
    const failures = runtime.previewFailures == null
      ? normalizeFailures(state?.fortuneFavorFailures)
      : normalizeFailures(runtime.previewFailures);
    const guaranteed = failures >= CONFIG.fortuneFavor.pityFailureCap;
    wrap.querySelectorAll("[data-favor-leaf]").forEach((leaf, index) => {
      const lit = index < failures;
      leaf.classList.toggle("is-lit", lit);
      leaf.dataset.lit = String(lit);
    });
    const label = wrap.querySelector("[data-favor-label]");
    if (label) label.textContent = guaranteed ? "Favor Guaranteed" : "Favor Chance";
    const accessible = wrap.querySelector("[data-favor-accessible]");
    if (accessible) accessible.textContent = getProgressLabel(failures);
    const ready = wrap.querySelector(".fortune-favor-ready-copy");
    if (ready) ready.hidden = !Boolean(state?.fortuneMeter?.charged && !active);
    const detail = wrap.querySelector("[data-favor-ready-detail]");
    if (detail) detail.textContent = guaranteed ? "1.5× WIN · FAVOR GUARANTEED" : "1.5× WIN · FAVOR CHANCE";
    wrap.classList.toggle("favor-guaranteed", guaranteed);
    wrap.dataset.favorFailures = String(failures);
  }

  function markPresentationShown(session) {
    const state = runtime.currentState;
    const attempt = session?.triggerResult?.fortuneFavor;
    if (!state || !attempt || attempt.presentationShown) return;
    attempt.presentationShown = true;
    if (session.fortuneFavor) session.fortuneFavor.presentationShown = true;
    app.persistence.saveState(state);
  }

  function ensureSuccessCallout(elements, session) {
    const attempt = session?.triggerResult?.fortuneFavor;
    if (!attempt?.awarded || attempt.source !== "fortune-meter") return;
    const firstPresentation = !attempt.presentationShown;
    const panel = elements?.allySelectionPanel || document.getElementById("allySelectionPanel");
    if (!panel) return;
    let callout = panel.querySelector(".fortune-favor-success-callout");
    if (!callout) {
      callout = document.createElement("div");
      callout.className = "fortune-favor-success-callout";
      callout.setAttribute("role", "status");
      callout.innerHTML = "<span>FORTUNE SMILES</span><strong>FORTUNE’S FAVOR AWARDED</strong>";
      panel.prepend(callout);
    }
    callout.hidden = false;
    if (firstPresentation) void app.audio?.play?.("free-spins.trigger");
    markPresentationShown(session);
  }

  const originalCreateUI = app.ui.createUI;
  app.ui.createUI = () => {
    ensureStylesheet();
    const ui = originalCreateUI();
    ensureMeterUi(ui.elements);

    const originalUpdateDisplay = ui.updateDisplay;
    ui.updateDisplay = options => {
      runtime.currentState = options?.state || runtime.currentState;
      originalUpdateDisplay(options);
      updateMeterUi(options?.state, ui.elements, options?.fortuneSpinActive);
    };

    const originalUpdateFortuneMeter = ui.updateFortuneMeter;
    ui.updateFortuneMeter = options => {
      originalUpdateFortuneMeter(options);
      updateMeterUi(runtime.currentState, ui.elements, options?.active);
    };

    const originalAnimateFortuneGain = ui.animateFortuneGain;
    ui.animateFortuneGain = options => {
      originalAnimateFortuneGain(options);
      updateMeterUi(runtime.currentState, ui.elements, false);
      const attempt = runtime.lastSettledResult?.fortuneFavor;
      if (options?.charged) void app.audio?.play?.("mystery.freeSpin.awarded");
      if (attempt?.outcome === "failure" && attempt.pityIncremented) {
        const cue = attempt.pityAfter >= CONFIG.fortuneFavor.pityFailureCap ? "mystery.token.fourPlus" : "mystery.token.one";
        void app.audio?.play?.(cue);
        ui.elements.fortuneMeterWrap?.classList.add("favor-leaf-earned");
        globalThis.setTimeout?.(() => ui.elements.fortuneMeterWrap?.classList.remove("favor-leaf-earned"), 520);
      }
    };

    if (ui.showAllySelection) {
      const originalShowAllySelection = ui.showAllySelection;
      ui.showAllySelection = session => {
        originalShowAllySelection(session);
        ensureSuccessCallout(ui.elements, session);
        const heading = ui.elements.allySelectionPanel?.querySelector(".ally-selection-heading");
        const subtitle = ui.elements.allySelectionPanel?.querySelector(".ally-selection-subtitle");
        if (heading) heading.textContent = "Choose Your Ally";
        if (subtitle) subtitle.textContent = "Pick one Ally for Fortune’s Favor.";
      };
    }

    if (ui.showFreeSpinIntro) {
      const originalShowFreeSpinIntro = ui.showFreeSpinIntro;
      ui.showFreeSpinIntro = session => {
        originalShowFreeSpinIntro(session);
        if (ui.elements.freeSpinTitle) ui.elements.freeSpinTitle.textContent = "Fortune’s Favor";
        if (ui.elements.freeSpinDetail) ui.elements.freeSpinDetail.textContent = session?.triggerSource === "fortune-meter"
          ? "The Fortune Meter awarded this feature. Choose an Ally and begin."
          : "Three natural Trees landed, one on each reel. Press Start.";
      };
    }

    if (ui.showFreeSpinSummary) {
      const originalShowFreeSpinSummary = ui.showFreeSpinSummary;
      ui.showFreeSpinSummary = (summary, reaction) => {
        originalShowFreeSpinSummary(summary, reaction);
        if (ui.elements.freeSpinTitle) ui.elements.freeSpinTitle.textContent = "Fortune’s Favor Complete";
      };
    }

    document.getElementById("freeSpinsHud")?.setAttribute("aria-label", "Fortune’s Favor status");
    return ui;
  };

  if (app.audio?.createAudio) {
    const originalCreateAudio = app.audio.createAudio;
    app.audio.createAudio = getSoundEnabled => {
      const audio = originalCreateAudio(getSoundEnabled);
      audio.playFortuneFavorReady = () => audio.playMysteryFreeSpinAwarded?.();
      audio.playFortuneFavorLeaf = () => audio.playMysteryToken?.(1);
      audio.playFortuneFavorGuaranteed = () => audio.playMysteryToken?.(4);
      audio.playFortuneFavorSuccess = () => audio.playFreeSpinTrigger?.();
      return audio;
    };
  }

  const meterPanel = document.querySelector('[data-help-section="fortune-meter"] .help-accordion-panel');
  const favorPanel = document.querySelector('[data-help-section="fortunes-favor"] .help-accordion-panel');
  if (meterPanel) meterPanel.innerHTML = `
    <p>Paid spins and Mystery Free Spins build Fortune. Wins and Commune Combos can add more.</p>
    <p>At 100 Fortune, the next eligible paid spin or Mystery Free Spin becomes a Fortune Spin and multiplies the complete eligible coin win by 1.5×.</p>
    <p>That Fortune Spin also has a chance to award Fortune’s Favor. Each of the first four meter attempts has the same 10% chance.</p>
    <p>Each missed meter attempt lights one golden leaf. After four lit leaves, the fifth meter attempt guarantees Fortune’s Favor.</p>
    <p>Natural Three Trees do not erase the leaves. A natural trigger on a charged Fortune Spin skips the meter roll and keeps the leaf progress unchanged.</p>
    <p>Only Fortune’s Favor awarded directly by the Fortune Meter clears the four leaves.</p>`;
  if (favorPanel) favorPanel.innerHTML = `
    <p>Fortune’s Favor begins either when a natural Tree lands on every reel or when a charged Fortune Spin receives the meter award.</p>
    <p>Before the feature begins, choose one of the seven Commune members as your Ally. Your selection remains locked for the full feature.</p>
    <ul>
      <li>spins cost no coins</li>
      <li>the triggering bet remains locked</li>
      <li>the selected Ally’s ability stays active</li>
      <li>natural Three Trees award two additional spins</li>
      <li>Mystery Token spin awards extend the same feature</li>
      <li>paylines, Wilds, Mystery Tokens, Commune Combos, reactions, and modifiers remain active</li>
    </ul>
    <p>If the Fortune Meter fills during Fortune’s Favor, its charge waits for the first eligible paid or Mystery Free Spin after the feature ends.</p>`;

  app.fortuneFavor.updateMeterUi = updateMeterUi;
})();