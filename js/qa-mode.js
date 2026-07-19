(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const query = new URLSearchParams(globalThis.location?.search || "");
  const enabled = query.get("qa") === "ally";
  const STORAGE_KEY = "commune-fortune-ally-qa-v2";
  const SCENARIOS = Object.freeze({
    "three-trees": Object.freeze({ label: "Three Trees trigger", spinType: "paid", expandingRoll: 1 }),
    loss: Object.freeze({ label: "Clean loss", spinType: "free", expandingRoll: 1 }),
    "weak-win": Object.freeze({ label: "Weak win below 3×", spinType: "free", expandingRoll: 1 }),
    "small-win": Object.freeze({ label: "Ordinary Small Win", spinType: "free", expandingRoll: 1 }),
    "nice-win": Object.freeze({ label: "Nice Win", spinType: "free", expandingRoll: 0 }),
    "big-win": Object.freeze({ label: "Big Win + Three Trees", spinType: "free", expandingRoll: 0 }),
    retrigger: Object.freeze({ label: "Three Trees retrigger", spinType: "free", expandingRoll: 1 }),
    awakening: Object.freeze({ label: "Tree Awakening", spinType: "free", expandingRoll: 0 }),
    combination: Object.freeze({ label: "Named Commune combination", spinType: "free", expandingRoll: 1 }),
    "spotlight-win": Object.freeze({ label: "Sterling line for Spotlight", spinType: "free", expandingRoll: 1 }),
    "center-open": Object.freeze({ label: "Open center cell", spinType: "free", expandingRoll: 1 }),
  });

  let controls = null;
  let panel = null;
  let statusElement = null;
  let snapshotElement = null;
  let scenarioSelect = null;
  let allySelect = null;
  let mysteryModifierSelect = null;
  let mysteryFreeSpinInput = null;
  let stepCheckbox = null;
  let waiter = null;
  let stepCredits = 0;
  let lastSnapshot = null;
  const cache = new Map();

  function readSession() {
    try {
      const parsed = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) || "null");
      return {
        stepMode: parsed?.stepMode !== false,
        queued: {
          paid: typeof parsed?.queued?.paid === "string" ? parsed.queued.paid : null,
          free: typeof parsed?.queued?.free === "string" ? parsed.queued.free : null,
          "mystery-free": typeof parsed?.queued?.["mystery-free"] === "string" ? parsed.queued["mystery-free"] : null,
        },
        forcedMysteryCount: [1, 2, 3, 4].includes(parsed?.forcedMysteryCount) ? parsed.forcedMysteryCount : null,
        forcedMysteryModifier: typeof parsed?.forcedMysteryModifier === "string" ? parsed.forcedMysteryModifier : null,
        rescueTest: parsed?.rescueTest === true,
        collapsed: Boolean(parsed?.collapsed),
      };
    } catch {
      return { stepMode: true, queued: { paid: null, free: null, "mystery-free": null }, forcedMysteryCount: null, forcedMysteryModifier: null, rescueTest: false, collapsed: false };
    }
  }

  const session = readSession();

  function persist() {
    if (!enabled) return;
    try {
      globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // QA state is disposable. The game itself still persists normally.
    }
  }

  function setStatus(message, tone = "neutral") {
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.dataset.tone = tone;
    }
  }

  function scenarioDefinition(id) {
    const definition = SCENARIOS[id];
    if (!definition) throw new Error(`Unknown QA scenario: ${id}`);
    return definition;
  }

  function matchesScenario(id, result) {
    const noTrigger = !result.freeSpinTrigger?.triggered;
    const noAwakening = !result.transformations?.length;
    const noCombination = !result.combinationWins?.length;
    if (id === "three-trees") return Boolean(result.freeSpinTrigger?.triggered && result.freeSpinTrigger.awardedSpins > 0);
    if (id === "loss") return result.totalWin === 0 && noTrigger && noAwakening && noCombination;
    if (id === "weak-win") return result.totalWin > 0
      && result.totalWin < result.referenceBet * CONFIG.allies.gabi.parameters.thresholdMultiplier
      && result.naturalWinTier === app.WIN_TIERS.SMALL
      && noTrigger && noAwakening && noCombination;
    if (id === "small-win") return result.totalWin > 0
      && result.naturalWinTier === app.WIN_TIERS.SMALL
      && noTrigger && noAwakening && noCombination;
    if (id === "nice-win") return result.finalWinTier === app.WIN_TIERS.NICE && noTrigger;
    if (id === "big-win") return [app.WIN_TIERS.BIG, app.WIN_TIERS.JACKPOT].includes(result.finalWinTier);
    if (id === "retrigger") return Boolean(result.freeSpinTrigger?.triggered
      && result.freeSpinTrigger.retrigger
      && result.freeSpinTrigger.awardedSpins > 0);
    if (id === "awakening") return result.transformations?.some(item => item.type === "expanding-wild") && noTrigger;
    if (id === "combination") return result.combinationWins?.length > 0 && noTrigger && noAwakening;
    if (id === "spotlight-win") return result.lineWins?.some(win => win.symbolKey === "STR") && noTrigger && noAwakening;
    if (id === "center-open") return ![CONFIG.expandingWild.symbolKey, CONFIG.mystery.symbolKey]
      .includes(result.originalMatrix?.[CONFIG.expandingWild.rowIndex]?.[CONFIG.expandingWild.reelIndex]) && noTrigger && noAwakening;
    return false;
  }

  function findScenario(id, {
    state,
    spinType = scenarioDefinition(id).spinType,
    referenceBet = app.payouts.getTotalBet(state),
    totalAwardedSpins = state?.freeSpinSession?.totalAwardedSpins || 0,
  } = {}) {
    const definition = scenarioDefinition(id);
    const key = [id, spinType, state?.lineBetIndex || 0, referenceBet, totalAwardedSpins].join(":");
    const cached = cache.get(key);
    if (cached) return structuredClone(cached);

    const featureRolls = { expandingWild: { roll: definition.expandingRoll } };
    for (let first = 0; first < CONFIG.reels[0].length; first += 1) {
      for (let second = 0; second < CONFIG.reels[1].length; second += 1) {
        for (let third = 0; third < CONFIG.reels[2].length; third += 1) {
          const targetStops = [first, second, third];
          const result = app.payouts.createSpinResult({
            targetStops,
            state,
            id: `qa-probe-${id}-${first}-${second}-${third}`,
            spinType,
            paidSpin: spinType === "paid",
            referenceBet,
            totalAwardedSpins,
            featureRolls,
            allyBypass: true,
            mysteryModifiers: [],
            mysterySkipRescue: true,
            createdAt: "2000-01-01T00:00:00.000Z",
          });
          if (!matchesScenario(id, result)) continue;
          const match = { id, label: definition.label, targetStops, featureRolls };
          cache.set(key, structuredClone(match));
          return match;
        }
      }
    }
    throw new Error(`No valid ${definition.label} result exists for the current feature state.`);
  }

  function findMysteryCount(count, {
    state,
    spinType = "paid",
    referenceBet = app.payouts.getTotalBet(state),
    totalAwardedSpins = state?.freeSpinSession?.totalAwardedSpins || 0,
  } = {}) {
    const requested = Math.min(4, Math.max(1, Math.floor(Number(count) || 1)));
    const key = ["mystery", requested, spinType, state?.lineBetIndex || 0, referenceBet, totalAwardedSpins].join(":");
    const cached = cache.get(key);
    if (cached) return structuredClone(cached);
    for (let first = 0; first < CONFIG.reels[0].length; first += 1) {
      for (let second = 0; second < CONFIG.reels[1].length; second += 1) {
        for (let third = 0; third < CONFIG.reels[2].length; third += 1) {
          const targetStops = [first, second, third];
          const result = app.payouts.createSpinResult({
            targetStops,
            state,
            id: `qa-probe-mystery-${requested}-${first}-${second}-${third}`,
            spinType,
            referenceBet,
            totalAwardedSpins,
            featureRolls: { expandingWild: { roll: 1 } },
            mysteryModifiers: [],
            allyBypass: true,
            createdAt: "2000-01-01T00:00:00.000Z",
          });
          const matches = requested === 4 ? result.mysteryTokenCount >= 4 : result.mysteryTokenCount === requested;
          if (!matches) continue;
          const match = { id: `mystery-${requested}`, label: requested === 4 ? "4+ Mystery Tokens" : `${requested} Mystery Token${requested === 1 ? "" : "s"}`, targetStops, featureRolls: { expandingWild: { roll: 1 } } };
          cache.set(key, structuredClone(match));
          return match;
        }
      }
    }
    throw new Error(`No valid ${requested === 4 ? "4+" : requested}-token result exists for ${spinType}.`);
  }

  function queueScenario(spinType, id) {
    if (!enabled) return false;
    const definition = scenarioDefinition(id);
    if (!["paid", "free", "mystery-free"].includes(spinType)) throw new Error(`Unknown spin type: ${spinType}`);
    session.queued[spinType] = id;
    persist();
    setStatus(`${definition.label} queued for the next ${spinType === "paid" ? "paid" : "free"} spin.`, "ready");
    updatePanel();
    return true;
  }

  function consumeSpinOverride({ spinType, state, referenceBet, totalAwardedSpins = 0 } = {}) {
    if (!enabled) return null;
    const id = session.queued[spinType];
    const forcedCount = session.forcedMysteryCount;
    const rescueTest = session.rescueTest;
    const forcedModifier = session.forcedMysteryModifier;
    if (!id && !forcedCount && !rescueTest) return null;
    session.queued[spinType] = null;
    session.forcedMysteryCount = null;
    session.forcedMysteryModifier = null;
    session.rescueTest = false;
    persist();
    try {
      let match = forcedCount
        ? findMysteryCount(forcedCount, { state, spinType, referenceBet, totalAwardedSpins })
        : id ? findScenario(id, { state, spinType, referenceBet, totalAwardedSpins }) : null;
      if (rescueTest) {
        const loss = findScenario("loss", { state, spinType, referenceBet, totalAwardedSpins });
        const win = findScenario("small-win", { state, spinType, referenceBet, totalAwardedSpins });
        match = { ...loss, id: "mystery-rescue", label: "Rescue loss → reroll", mysteryRescueStops: [win.targetStops], mysteryRescueFeatureRolls: [win.featureRolls] };
      }
      match.mysteryAwardModifier = forcedModifier;
      setStatus(`${match.label} locked into the real result generator.`, "active");
      updatePanel();
      return match;
    } catch (error) {
      setStatus(error.message, "error");
      updatePanel();
      throw error;
    }
  }

  function forceMysteryCount(count, modifierId = null) {
    if (!enabled) return false;
    const requested = Math.min(4, Math.max(1, Math.floor(Number(count) || 1)));
    session.forcedMysteryCount = requested;
    session.forcedMysteryModifier = typeof modifierId === "string" ? modifierId : null;
    persist();
    setStatus(`${requested === 4 ? "4+" : requested} Mystery Token${requested === 1 ? "" : "s"} forced for the next eligible spin.`, "ready");
    updatePanel();
    return true;
  }

  function forceRescueTest() {
    if (!enabled) return false;
    session.rescueTest = true;
    persist();
    setStatus("A loss followed by an authoritative winning Rescue reroll is queued.", "ready");
    updatePanel();
    return true;
  }

  function recordResolvedResult(result, override) {
    if (!enabled || !override || !result) return;
    const extras = [];
    if (result.freeSpinTrigger?.triggered) extras.push(result.freeSpinTrigger.retrigger ? "retrigger" : "feature trigger");
    if (result.transformations?.length) extras.push("Tree Awakening");
    if (result.combinationWins?.length) extras.push(result.combinationWins[0].name);
    if (result.mysteryTokenCount) extras.push(`${result.mysteryTokenCount} Mystery Token${result.mysteryTokenCount === 1 ? "" : "s"}`);
    const detail = extras.length ? `, ${extras.join(", ")}` : "";
    setStatus(`${override.label} resolved for ${result.totalWin} coins${detail}.`, "success");
  }

  function waitForFreeSpinStep() {
    if (!enabled || !session.stepMode) return Promise.resolve();
    if (stepCredits > 0) {
      stepCredits -= 1;
      return Promise.resolve();
    }
    if (waiter) return waiter.promise;
    let resolveWaiter;
    const promise = new Promise(resolve => { resolveWaiter = resolve; });
    waiter = { promise, resolve: resolveWaiter };
    setStatus("Paused before the next Free Spin. Queue an outcome, then run one step.", "paused");
    updatePanel();
    return promise;
  }

  function releaseNextStep() {
    if (!enabled) return false;
    if (waiter) {
      const current = waiter;
      waiter = null;
      current.resolve();
    } else {
      stepCredits = Math.min(1, stepCredits + 1);
    }
    setStatus("One Free Spin released.", "active");
    updatePanel();
    return true;
  }

  function cancelWait() {
    stepCredits = 0;
    if (!waiter) return;
    const current = waiter;
    waiter = null;
    current.resolve();
  }

  function setStepMode(value) {
    session.stepMode = Boolean(value);
    persist();
    if (!session.stepMode) cancelWait();
    setStatus(session.stepMode ? "Step mode enabled." : "Free Spins will run automatically.", "ready");
    updatePanel();
  }

  function invoke(name, ...args) {
    const handler = controls?.[name];
    if (typeof handler !== "function") {
      setStatus("The game is still initializing.", "error");
      return null;
    }
    try {
      const result = handler(...args);
      if (result?.message) setStatus(result.message, result.ok === false ? "error" : "success");
      updatePanel();
      return result;
    } catch (error) {
      setStatus(error.message, "error");
      updatePanel();
      return null;
    }
  }

  function bindGameControls(nextControls) {
    controls = nextControls;
    updatePanel();
  }

  function snapshotText(snapshot) {
    if (!snapshot) return "Game initializing…";
    const sessionState = snapshot.freeSpinSession;
    const mystery = `Mystery ${snapshot.mystery?.queuedFreeSpins || 0} FS / ${snapshot.mystery?.modifierCount || 0} mods`;
    if (!sessionState?.active) return `Phase: ${snapshot.phase} · ${mystery} · No active Ally feature`;
    const allyId = sessionState.ally?.selectedId;
    const allyName = allyId ? CONFIG.allies[allyId]?.name : "not selected";
    return `Phase: ${snapshot.phase} · ${sessionState.remainingSpins} spin${sessionState.remainingSpins === 1 ? "" : "s"} left · Ally: ${allyName} · ${mystery}`;
  }

  function updateSnapshot({ state, phase } = {}) {
    if (!enabled) return;
    lastSnapshot = {
      phase,
      coins: state?.coins || 0,
      mystery: {
        queuedFreeSpins: state?.mystery?.queuedFreeSpins || 0,
        modifierCount: state?.mystery?.modifierQueue?.length || 0,
      },
      freeSpinSession: state?.freeSpinSession ? {
        active: Boolean(state.freeSpinSession.active),
        status: state.freeSpinSession.status,
        remainingSpins: state.freeSpinSession.remainingSpins,
        completedSpins: state.freeSpinSession.completedSpins,
        ally: state.freeSpinSession.ally ? {
          selectedId: state.freeSpinSession.ally.selectedId,
          confirmed: state.freeSpinSession.ally.confirmed,
        } : null,
      } : null,
    };
    updatePanel();
  }

  function updatePanel() {
    if (!enabled || !panel) return;
    panel.classList.toggle("is-collapsed", session.collapsed);
    panel.querySelector("[data-qa-collapse]")?.setAttribute("aria-expanded", String(!session.collapsed));
    if (snapshotElement) snapshotElement.textContent = snapshotText(lastSnapshot);
    if (stepCheckbox) stepCheckbox.checked = session.stepMode;
    const queuedPaid = session.queued.paid ? SCENARIOS[session.queued.paid]?.label : "none";
    const queuedFree = session.queued.free ? SCENARIOS[session.queued.free]?.label : "none";
    const queuedMystery = session.queued["mystery-free"] ? SCENARIOS[session.queued["mystery-free"]]?.label : "none";
    const queue = panel.querySelector("[data-qa-queue]");
    if (queue) queue.textContent = `Queued: paid ${queuedPaid}; Ally ${queuedFree}; Mystery ${queuedMystery}${session.forcedMysteryCount ? `; forced ${session.forcedMysteryCount === 4 ? "4+" : session.forcedMysteryCount} tokens` : ""}`;
  }

  function mount() {
    if (!enabled || !globalThis.document?.body || panel) return;
    const wrapper = document.createElement("aside");
    wrapper.className = "qa-panel";
    wrapper.setAttribute("aria-label", "Choose Your Ally QA controls");
    wrapper.innerHTML = `
      <button class="qa-badge" type="button" data-qa-collapse aria-expanded="true">TEST MODE</button>
      <div class="qa-panel-body">
        <div class="qa-heading"><strong>Ally QA</strong><span>Client-side only</span></div>
        <p class="qa-snapshot" data-qa-snapshot>Game initializing…</p>
        <p class="qa-queue" data-qa-queue>Queued: none</p>
        <div class="qa-row qa-row-split">
          <button type="button" data-qa-action="trigger">Trigger Free Spins</button>
          <button type="button" data-qa-action="coins">+10,000 Coins</button>
        </div>
        <label class="qa-field">Ally
          <select data-qa-ally>${CONFIG.allyOrder.map(id => `<option value="${id}">${CONFIG.allies[id].name} · ${CONFIG.allies[id].abilityName}</option>`).join("")}</select>
        </label>
        <button type="button" data-qa-action="ally">Apply Ally Selection</button>
        <div class="qa-row qa-row-split">
          <button type="button" data-qa-action="ability">Force Ally Ability</button>
          <button type="button" data-qa-action="one-left">Set 1 Spin Left</button>
        </div>
        <label class="qa-field">Next Free Spin
          <select data-qa-scenario>
            ${Object.entries(SCENARIOS).filter(([, item]) => item.spinType === "free").map(([id, item]) => `<option value="${id}">${item.label}</option>`).join("")}
          </select>
        </label>
        <div class="qa-row qa-row-split">
          <button type="button" data-qa-action="queue-run">Queue & Run Next</button>
          <button type="button" data-qa-action="run">Run Random Next</button>
        </div>
        <label class="qa-check"><input type="checkbox" data-qa-step checked> Pause before each Free Spin</label>
        <section class="qa-section">
          <h3>Mystery QA</h3>
          <p>These controls use the production result, queue, persistence, and settlement paths.</p>
          <div class="qa-row qa-row-split">
            <button type="button" data-qa-action="mystery-1">Force 1 Token</button>
            <button type="button" data-qa-action="mystery-2">Force 2 Tokens</button>
          </div>
          <div class="qa-row qa-row-split">
            <button type="button" data-qa-action="mystery-3">Force 3 Tokens</button>
            <button type="button" data-qa-action="mystery-4">Force 4+ Tokens</button>
          </div>
          <label class="qa-field">Queue Modifier
            <select data-qa-mystery-modifier>${CONFIG.mystery.normalModifierPool.map(id => `<option value="${id}">${app.mystery.MODIFIER_NAMES[id]}</option>`).join("")}</select>
          </label>
          <button type="button" data-qa-action="mystery-modifier">Queue Selected Modifier</button>
          <label class="qa-field">Mystery Free Spin Count
            <input type="number" min="0" max="${CONFIG.mystery.maximumQueuedFreeSpins}" value="1" data-qa-mystery-count>
          </label>
          <div class="qa-row qa-row-split">
            <button type="button" data-qa-action="mystery-set-count">Set Count</button>
            <button type="button" data-qa-action="mystery-clear">Clear Queue</button>
          </div>
          <div class="qa-row qa-row-split">
            <button type="button" data-qa-action="mystery-rescue">Rescue Loss → Win</button>
            <button type="button" data-qa-action="mystery-ally">Mystery Spin → Ally</button>
          </div>
          <div class="qa-row qa-row-split">
            <button type="button" data-qa-action="fortune-win">Fortune Burst Win</button>
            <button type="button" data-qa-action="fortune-loss">Fortune Burst Loss</button>
          </div>
          <div class="qa-row qa-row-split">
            <button type="button" data-qa-action="test-spotlight">Test Spotlight</button>
            <button type="button" data-qa-action="test-center-tree">Test Center Tree</button>
          </div>
          <button type="button" data-qa-action="test-double-commune">Test Double Commune</button>
          <button type="button" data-qa-action="strong-fallback">Test Strong Fallback</button>
        </section>
        <button class="qa-danger" type="button" data-qa-action="reset">Reset Feature State</button>
        <p class="qa-status" data-qa-status data-tone="neutral">QA mode ready.</p>
        <p class="qa-note">Remove <code>?qa=ally</code> from the URL for normal play. “Big Win” necessarily includes Three Trees under the current reel math.</p>
      </div>`;
    document.body.append(wrapper);
    panel = wrapper;
    statusElement = wrapper.querySelector("[data-qa-status]");
    snapshotElement = wrapper.querySelector("[data-qa-snapshot]");
    scenarioSelect = wrapper.querySelector("[data-qa-scenario]");
    allySelect = wrapper.querySelector("[data-qa-ally]");
    mysteryModifierSelect = wrapper.querySelector("[data-qa-mystery-modifier]");
    mysteryFreeSpinInput = wrapper.querySelector("[data-qa-mystery-count]");
    stepCheckbox = wrapper.querySelector("[data-qa-step]");

    wrapper.querySelector("[data-qa-collapse]")?.addEventListener("click", () => {
      session.collapsed = !session.collapsed;
      persist();
      updatePanel();
    });
    stepCheckbox?.addEventListener("change", () => setStepMode(stepCheckbox.checked));
    wrapper.addEventListener("click", event => {
      const action = event.target.closest("button[data-qa-action]")?.dataset.qaAction;
      if (!action) return;
      if (action === "trigger") invoke("triggerFeature");
      else if (action === "coins") invoke("addCoins");
      else if (action === "ally") invoke("applyAlly", allySelect?.value);
      else if (action === "ability") invoke("forceAbility");
      else if (action === "one-left") invoke("setOneSpinRemaining");
      else if (action === "queue-run") {
        try {
          queueScenario("free", scenarioSelect?.value || "loss");
          releaseNextStep();
        } catch (error) {
          setStatus(error.message, "error");
        }
      } else if (action === "run") releaseNextStep();
      else if (/^mystery-[1-4]$/.test(action)) forceMysteryCount(Number(action.at(-1)));
      else if (action === "mystery-modifier") invoke("queueMysteryModifier", mysteryModifierSelect?.value);
      else if (action === "mystery-set-count") invoke("setMysteryFreeSpins", Number(mysteryFreeSpinInput?.value));
      else if (action === "mystery-clear") invoke("clearMysteryQueue");
      else if (action === "mystery-rescue") invoke("testMysteryRescue");
      else if (action === "mystery-ally") invoke("testMysteryAllyTrigger");
      else if (action === "fortune-win") invoke("testFortuneBurst", "win");
      else if (action === "fortune-loss") invoke("testFortuneBurst", "loss");
      else if (action === "test-spotlight") invoke("testMysteryModifier", "spotlight", "spotlight-win");
      else if (action === "test-center-tree") invoke("testMysteryModifier", "center-tree", "center-open");
      else if (action === "test-double-commune") invoke("testMysteryModifier", "double-commune", "combination");
      else if (action === "strong-fallback") forceMysteryCount(4);
      else if (action === "reset") invoke("resetFeature");
    });
    updatePanel();
  }

  app.qa = {
    enabled,
    scenarios: SCENARIOS,
    findScenario,
    findMysteryCount,
    queueScenario,
    forceMysteryCount,
    forceRescueTest,
    consumeSpinOverride,
    recordResolvedResult,
    waitForFreeSpinStep,
    releaseNextStep,
    cancelWait,
    setStepMode,
    bindGameControls,
    updateSnapshot,
  };

  if (enabled) mount();
})();
