(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  if (!app?.qa?.enabled || !app.fortuneFavor || !globalThis.document) return;
  const { CONFIG } = app;
  const { runtime, normalizeFailures } = app.fortuneFavor;
  let previewTimer = null;

  function stateOrError() {
    return runtime.currentState || null;
  }

  function save(message) {
    const state = stateOrError();
    if (!state) return { ok: false, message: "The game is still initializing." };
    app.persistence.saveState(state);
    app.fortuneFavor.updateMeterUi?.(state, null, false);
    return { ok: true, message };
  }

  function setMeter() {
    const state = stateOrError();
    if (!state) return save("");
    state.fortuneMeter = { value: CONFIG.fortuneMeter.capacity, charged: true };
    return save("Fortune Meter set to 100 through persistent game state.");
  }

  function setPity(value) {
    const state = stateOrError();
    if (!state) return save("");
    state.fortuneFavorFailures = normalizeFailures(value);
    return save(`Fortune’s Favor pity set to ${state.fortuneFavorFailures}.`);
  }

  function force(outcome) {
    runtime.forcedOutcome = outcome;
    if (outcome === "guaranteed") setPity(CONFIG.fortuneFavor.pityFailureCap);
    setMeter();
    return { ok: true, message: `${outcome === "guaranteed" ? "Guaranteed fifth" : `Forced ${outcome}`} Favor attempt armed for the next eligible Fortune Spin.` };
  }

  function naturalCharged() {
    setMeter();
    app.qa.queueScenario("paid", "three-trees");
    return { ok: true, message: "Natural Three Trees queued on a charged paid Fortune Spin." };
  }

  function chargeDuringFeature() {
    const state = stateOrError();
    if (!state?.freeSpinSession?.active) return { ok: false, message: "Start Fortune’s Favor first." };
    state.fortuneMeter = { value: CONFIG.fortuneMeter.capacity, charged: true };
    return save("A full Fortune charge was stored during the active feature.");
  }

  function chargedMystery() {
    const state = stateOrError();
    if (!state || state.freeSpinSession?.active) return { ok: false, message: "Finish the active feature first." };
    state.fortuneMeter = { value: CONFIG.fortuneMeter.capacity, charged: true };
    app.mystery.setQueuedFreeSpins(state, 1);
    return save("A charged Mystery Free Spin is ready.");
  }

  function createPending(outcome) {
    const state = stateOrError();
    if (!state || state.pendingSpin || state.freeSpinSession?.active) return { ok: false, message: "Return to idle play with no pending result first." };
    state.fortuneFavorFailures = outcome === "guaranteed" ? CONFIG.fortuneFavor.pityFailureCap : 0;
    state.fortuneMeter = { value: CONFIG.fortuneMeter.capacity, charged: true };
    const referenceBet = app.payouts.getTotalBet(state);
    if (state.coins < referenceBet) state.coins = referenceBet;
    const scenario = app.qa.findScenario("loss", { state, spinType: "paid", referenceBet });
    runtime.forcedOutcome = outcome;
    const result = app.payouts.createSpinResult({
      targetStops: scenario.targetStops,
      featureRolls: scenario.featureRolls,
      state,
      id: `qa-reload-favor-${outcome}-${Date.now()}`,
      spinType: "paid",
      referenceBet,
      mysteryModifiers: app.mystery.peekModifierQueue(state),
      createdAt: new Date().toISOString(),
    });
    if (!app.mystery.commitSpinStart(state, result)) return { ok: false, message: "The Mystery queue could not commit the pending QA result." };
    app.payouts.consumeFortuneChargeState(state, result);
    state.coins -= result.coinCost;
    state.lastWin = 0;
    state.pendingSpin = result;
    return save(`Reload-ready pending Favor ${outcome} saved through the authoritative result path.`);
  }

  function previewPity(value) {
    runtime.previewFailures = normalizeFailures(value);
    app.fortuneFavor.updateMeterUi?.(runtime.currentState, null, false);
    globalThis.clearTimeout?.(previewTimer);
    previewTimer = globalThis.setTimeout?.(() => {
      runtime.previewFailures = null;
      app.fortuneFavor.updateMeterUi?.(runtime.currentState, null, false);
    }, 2600);
    return { ok: true, message: `Previewing ${normalizeFailures(value)} lit golden leaves.` };
  }

  function previewSuccess() {
    const stage = document.querySelector(".stage");
    if (!stage) return { ok: false, message: "The game stage is unavailable." };
    let callout = stage.querySelector(".fortune-favor-qa-success");
    if (!callout) {
      callout = document.createElement("div");
      callout.className = "fortune-favor-qa-success";
      callout.innerHTML = "<span>FORTUNE SMILES</span><strong>FORTUNE’S FAVOR AWARDED</strong>";
      stage.append(callout);
    }
    callout.classList.add("is-visible");
    globalThis.setTimeout?.(() => callout.classList.remove("is-visible"), 2200);
    return { ok: true, message: "Favor success callout previewed." };
  }

  function report(result) {
    const status = document.querySelector("[data-qa-status]");
    if (!status || !result?.message) return;
    status.textContent = result.message;
    status.dataset.tone = result.ok === false ? "error" : "success";
  }

  function mount() {
    const panel = document.querySelector(".qa-panel-body");
    if (!panel || panel.querySelector("[data-fortune-favor-qa]")) return;
    const section = document.createElement("section");
    section.className = "qa-section";
    section.dataset.fortuneFavorQa = "true";
    section.innerHTML = `
      <h3>Fortune’s Favor Meter QA</h3>
      <p>These controls use persistent Fortune, authoritative result generation, settlement, and feature-start paths.</p>
      <button type="button" data-favor-qa="meter">Set Fortune Meter to 100</button>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="pity-0">Pity 0</button><button type="button" data-favor-qa="pity-1">Pity 1</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="pity-2">Pity 2</button><button type="button" data-favor-qa="pity-3">Pity 3</button></div>
      <button type="button" data-favor-qa="pity-4">Pity 4 · Guaranteed</button>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="success">Force 10% Success</button><button type="button" data-favor-qa="failure">Force 10% Failure</button></div>
      <button type="button" data-favor-qa="guaranteed">Force Guaranteed Fifth</button>
      <button type="button" data-favor-qa="natural">Natural Three Trees · Charged</button>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="during-feature">Charge During Favor</button><button type="button" data-favor-qa="mystery">Charged Mystery Spin</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="pending-success">Pending Success</button><button type="button" data-favor-qa="pending-failure">Pending Failure</button></div>
      <button type="button" data-favor-qa="pending-guaranteed">Pending Guaranteed Favor</button>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="preview-0">Preview 0 Leaves</button><button type="button" data-favor-qa="preview-1">Preview 1 Leaf</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="preview-2">Preview 2 Leaves</button><button type="button" data-favor-qa="preview-3">Preview 3 Leaves</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-favor-qa="preview-4">Preview Guaranteed</button><button type="button" data-favor-qa="preview-success">Preview Success</button></div>`;
    panel.insertBefore(section, panel.querySelector(".qa-danger") || null);
    section.addEventListener("click", event => {
      const action = event.target.closest("button[data-favor-qa]")?.dataset.favorQa;
      if (!action) return;
      if (action === "meter") report(setMeter());
      else if (/^pity-[0-4]$/.test(action)) report(setPity(Number(action.at(-1))));
      else if (["success", "failure", "guaranteed"].includes(action)) report(force(action));
      else if (action === "natural") report(naturalCharged());
      else if (action === "during-feature") report(chargeDuringFeature());
      else if (action === "mystery") report(chargedMystery());
      else if (action === "pending-success") report(createPending("success"));
      else if (action === "pending-failure") report(createPending("failure"));
      else if (action === "pending-guaranteed") report(createPending("guaranteed"));
      else if (/^preview-[0-4]$/.test(action)) report(previewPity(Number(action.at(-1))));
      else if (action === "preview-success") report(previewSuccess());
    });
  }

  app.fortuneFavor.qa = { setMeter, setPity, force, naturalCharged, chargeDuringFeature, chargedMystery, createPending, previewPity, previewSuccess };
  mount();
})();