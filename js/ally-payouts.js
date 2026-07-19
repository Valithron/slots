(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const createBaseResult = app.payouts.createSpinResult;
  const settleBase = app.payouts.settlePendingSpinState;
  const markFreeSpinPresentedBase = app.freeSpins.markFreeSpinPresented;
  const clone = value => value == null ? value : structuredClone(value);
  const floor = value => Math.max(0, Math.floor(Number(value) || 0));

  function randomStops(rng = Math.random) {
    return CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
  }

  function isActiveAllySession(state, sessionId = null) {
    const session = state?.freeSpinSession;
    return Boolean(session?.active
      && (!sessionId || session.sessionId === sessionId)
      && session.ally?.confirmed
      && session.ally?.featureStarted
      && session.ally?.selectedId
      && !session.ally?.legacyNoAlly);
  }

  function createAllyExtensionPlan(result, state) {
    if (app.allyMysteryExtensions?.conversionEnabled === false) return null;
    const award = result?.mysteryAward;
    const requestedSpins = floor(award?.freeSpinsRequested);
    const session = state?.freeSpinSession;
    if (result?.spinType !== "free" || requestedSpins <= 0 || !isActiveAllySession(state)) return null;

    const naturalRetriggerSpins = result.freeSpinTrigger?.triggered && result.freeSpinTrigger?.retrigger
      ? floor(result.freeSpinTrigger.awardedSpins)
      : 0;
    const beforeTotalAwardedSpins = Math.min(
      CONFIG.freeSpins.maximumAwardedSpins,
      floor(session.totalAwardedSpins) + naturalRetriggerSpins,
    );
    const beforeRemainingSpins = Math.max(0, floor(session.remainingSpins) - 1) + naturalRetriggerSpins;
    const capacity = Math.max(0, CONFIG.freeSpins.maximumAwardedSpins - beforeTotalAwardedSpins);
    const allySpinsAdded = Math.min(requestedSpins, capacity);
    const overflowMysterySpins = requestedSpins - allySpinsAdded;

    return {
      awardId: award.id,
      sessionId: session.sessionId,
      allyId: session.ally.selectedId,
      tokenCount: floor(award.tokenCount),
      requestedSpins,
      allySpinsAdded,
      overflowMysterySpins,
      modifier: clone(award.modifier),
      strongFallback: award.strongFallback === true,
      naturalRetriggerSpins,
      beforeRemainingSpins,
      afterRemainingSpins: beforeRemainingSpins + allySpinsAdded,
      beforeTotalAwardedSpins,
      afterTotalAwardedSpins: beforeTotalAwardedSpins + allySpinsAdded,
      applied: false,
      presentationStatus: "pending",
      settlementStatus: "pending",
    };
  }

  function attachAllyExtensionPlan(result, state) {
    const plan = createAllyExtensionPlan(result, state);
    if (!plan) return result;
    return {
      ...result,
      mysteryAward: {
        ...clone(result.mysteryAward),
        destination: "active-ally-session",
        allyExtension: plan,
      },
    };
  }

  function createUnmodifiedResult(options, suffix, overrides = {}) {
    return attachAllyExtensionPlan(createBaseResult({
      ...options,
      ...overrides,
      id: `${options.id}-${suffix}`,
      targetStops: overrides.targetStops || randomStops(options.rng || Math.random),
      allyBypass: true,
      mysterySkipRescue: true,
    }), options.state);
  }

  function createWinningReplay(options) {
    const definition = CONFIG.allies.gabi;
    const maximum = definition.parameters.maximumReplayDraws;
    for (let attempt = 1; attempt <= maximum; attempt += 1) {
      const replay = createUnmodifiedResult(options, `eww-${attempt}`);
      if (replay.totalWin > 0) return { replay, attempts: attempt, fallback: false };
    }
    const replay = createUnmodifiedResult(options, "eww-fallback", {
      targetStops: [0, 1, 3],
      featureRolls: { expandingWild: { roll: 0 } },
    });
    return { replay, attempts: maximum, fallback: true };
  }

  function coherentSelectedResult(original, replacement, selected, type, metadata = {}) {
    const chosen = selected === "replacement" ? replacement : original;
    return {
      ...clone(chosen),
      id: original.id,
      createdAt: original.createdAt,
      allyReplay: {
        type,
        originalResult: clone(original),
        replacementResult: clone(replacement),
        selected,
        selectedResultId: chosen.id,
        netImprovement: Math.max(0, chosen.totalWin - original.totalWin),
        ...metadata,
      },
      settlementStatus: "pending",
    };
  }

  function createSpinResult(options) {
    const base = attachAllyExtensionPlan(createBaseResult(options), options.state);
    if (options.allyBypass || base.spinType !== "free" || !CONFIG.features.allyAbilities) return base;
    const session = options.state?.freeSpinSession;
    const ally = app.allies.normalizeAllyState(session?.ally);
    const definition = app.allies.getDefinition({ ally });
    if (!definition || !ally.confirmed || ally.legacyNoAlly) return base;

    if (definition.id === "ashley" && !ally.ashley.used && base.totalWin === 0) {
      const replacement = createUnmodifiedResult(options, "fastball");
      return coherentSelectedResult(base, replacement, "replacement", "ashley");
    }

    if (definition.id === "gabi" && !ally.gabi.used) {
      const threshold = Math.floor(session.referenceBet * definition.parameters.thresholdMultiplier);
      if (base.totalWin > 0 && base.totalWin < threshold) {
        const generated = createWinningReplay(options);
        const replacement = generated.replay;
        const selected = replacement.totalWin > base.totalWin ? "replacement" : "original";
        return coherentSelectedResult(base, replacement, selected, "gabi", {
          attempts: generated.attempts,
          fallback: generated.fallback,
          threshold,
        });
      }
    }

    return app.allies.applySpinModifier(base, session);
  }

  function deferredOverflow(state) {
    return floor(state?.mystery?.lastAward?.deferredOverflowFreeSpins);
  }

  function preserveDeferredOverflow(state, amount) {
    if (!state?.mystery || amount <= 0) return;
    const lastAward = state.mystery.lastAward && typeof state.mystery.lastAward === "object"
      ? state.mystery.lastAward
      : {};
    state.mystery.lastAward = {
      ...lastAward,
      deferredOverflowFreeSpins: floor(amount),
    };
  }

  function applyAllyMysteryExtension(state, settled, queuedBefore, deferredBefore = 0) {
    const plan = settled?.mysteryAward?.allyExtension;
    if (!plan || plan.applied || settled?.mysterySettlement?.applied !== true) {
      preserveDeferredOverflow(state, deferredBefore);
      return settled;
    }
    if (!isActiveAllySession(state, plan.sessionId)) {
      preserveDeferredOverflow(state, deferredBefore);
      return settled;
    }

    const session = state.freeSpinSession;
    const requestedSpins = floor(plan.requestedSpins);
    const beforeRemainingSpins = floor(session.remainingSpins);
    const beforeTotalAwardedSpins = floor(session.totalAwardedSpins);
    const capacity = Math.max(0, CONFIG.freeSpins.maximumAwardedSpins - beforeTotalAwardedSpins);
    const allySpinsAdded = Math.min(requestedSpins, capacity);
    const overflowMysterySpins = requestedSpins - allySpinsAdded;

    state.mystery.queuedFreeSpins = Math.min(CONFIG.mystery.maximumQueuedFreeSpins, floor(queuedBefore));
    session.remainingSpins += allySpinsAdded;
    session.totalAwardedSpins += allySpinsAdded;

    const overflowResult = app.mystery.queueFreeSpins(state, overflowMysterySpins);
    const deferredAdded = Math.max(0, overflowMysterySpins - overflowResult.awarded);
    const deferredTotal = deferredBefore + deferredAdded;

    const extension = {
      ...clone(plan),
      requestedSpins,
      allySpinsAdded,
      overflowMysterySpins,
      overflowMysterySpinsQueued: overflowResult.awarded,
      overflowMysterySpinsDeferred: deferredAdded,
      beforeRemainingSpins,
      afterRemainingSpins: session.remainingSpins,
      beforeTotalAwardedSpins,
      afterTotalAwardedSpins: session.totalAwardedSpins,
      applied: true,
      presentationStatus: "ready",
      settlementStatus: "settled",
    };
    const mysterySettlement = {
      ...clone(settled.mysterySettlement),
      freeSpinsRequested: requestedSpins,
      freeSpinsAwarded: requestedSpins,
      ordinaryFreeSpinsAwarded: overflowResult.awarded,
      allySpinsRequested: requestedSpins,
      allySpinsAdded,
      overflowMysterySpins,
      overflowMysterySpinsQueued: overflowResult.awarded,
      overflowMysterySpinsDeferred: deferredAdded,
      queuedFreeSpins: state.mystery.queuedFreeSpins,
      capped: false,
      allyExtension: extension,
    };
    const finalSettled = {
      ...settled,
      mysteryAward: {
        ...clone(settled.mysteryAward),
        destination: "active-ally-session",
        allyExtension: extension,
      },
      mysterySettlement,
    };

    state.mystery.lastAward = {
      ...clone(mysterySettlement),
      spinId: settled.id,
      awardId: plan.awardId,
      deferredOverflowFreeSpins: deferredTotal,
    };
    if (session.presentationSpin?.id === settled.id) session.presentationSpin = { ...clone(finalSettled), settlementStatus: "settled" };
    if (session.lastResult?.id === settled.id) session.lastResult = { ...clone(finalSettled), settlementStatus: "settled" };
    app.allyMysteryExtensions.lastSettlement = clone(extension);
    return finalSettled;
  }

  function settlePendingSpinState(state) {
    app.allyMysteryExtensions.lastSettlement = null;
    const queuedBefore = floor(state?.mystery?.queuedFreeSpins);
    const deferredBefore = deferredOverflow(state);
    const settled = settleBase(state);
    if (!settled) return null;
    const extended = applyAllyMysteryExtension(state, settled, queuedBefore, deferredBefore);
    const finalization = app.allies.finalizeSession(state);
    if (!finalization.applied) return extended;
    return { ...extended, allyEndBonus: finalization };
  }

  function markFreeSpinPresented(session, spinId) {
    const next = markFreeSpinPresentedBase(session, spinId);
    if (!next?.lastResult || next.lastResult.id !== spinId) return next;
    const extension = next.lastResult.mysteryAward?.allyExtension;
    if (!extension?.applied) return next;
    const presented = { ...clone(extension), presentationStatus: "presented" };
    next.lastResult.mysteryAward.allyExtension = presented;
    if (next.lastResult.mysterySettlement?.allyExtension) next.lastResult.mysterySettlement.allyExtension = clone(presented);
    return next;
  }

  const originalHasQueuedFreeSpin = app.mystery.hasQueuedFreeSpin;
  app.mystery.hasQueuedFreeSpin = state => originalHasQueuedFreeSpin(state) || deferredOverflow(state) > 0;

  const originalCommitSpinStart = app.mystery.commitSpinStart;
  app.mystery.commitSpinStart = (state, spinResult) => {
    if (spinResult?.spinType === "mystery-free" && floor(state?.mystery?.queuedFreeSpins) <= 0 && deferredOverflow(state) > 0) {
      const remaining = deferredOverflow(state) - 1;
      state.mystery.queuedFreeSpins = 1;
      preserveDeferredOverflow(state, remaining);
    }
    return originalCommitSpinStart(state, spinResult);
  };

  function forceCompleteAbilityLabel() {
    const hudName = document.getElementById("allyHudName");
    const hudValue = document.getElementById("allyHudValue");
    if (!hudName || !hudValue) return;
    const definition = Object.values(CONFIG.allies || {}).find(item => item.name === hudName.textContent);
    if (!definition) return;
    if (hudValue.textContent !== definition.abilityName) {
      hudValue.dataset.allyStatus = hudValue.textContent;
      hudValue.title = hudValue.textContent;
      hudValue.textContent = definition.abilityName;
    }
  }

  function updateTotalAwardedHud() {
    const hud = document.getElementById("freeSpinsHud");
    if (!hud || !app.game?.getState) return;
    let cell = document.getElementById("totalAwardedCell");
    if (!cell) {
      cell = document.createElement("div");
      cell.id = "totalAwardedCell";
      cell.innerHTML = '<span>Total Awarded</span><strong id="totalAwardedValue">0</strong>';
      hud.insertBefore(cell, document.getElementById("allyHud"));
    }
    const session = app.game.getState().freeSpinSession;
    const value = document.getElementById("totalAwardedValue");
    if (value) {
      const nextValue = String(session?.totalAwardedSpins || 0);
      if (value.textContent !== nextValue) value.textContent = nextValue;
    }
  }

  function rewriteAllyMysteryCallout() {
    const extension = app.allyMysteryExtensions.lastSettlement;
    const kicker = document.getElementById("mysteryCalloutKicker");
    const title = document.getElementById("mysteryCalloutTitle");
    const detail = document.getElementById("mysteryCalloutDetail");
    if (!extension?.applied || !kicker || !title || !detail || !/Mystery Tokens/i.test(kicker.textContent)) return;
    const ally = CONFIG.allies?.[extension.allyId];
    const modifier = extension.modifier ? app.mystery.getModifierLabel(extension.modifier) : "Mystery Modifier";
    let nextTitle;
    let nextDetail;
    if (extension.allySpinsAdded > 0) {
      nextTitle = `+${extension.allySpinsAdded} ALLY SPIN${extension.allySpinsAdded === 1 ? "" : "S"}`;
      const overflow = extension.overflowMysterySpins > 0
        ? ` ${extension.overflowMysterySpins} overflow Mystery Free Spin${extension.overflowMysterySpins === 1 ? " is" : "s are"} preserved for afterward.`
        : "";
      nextDetail = `Stays with ${ally?.name || "the selected Ally"}. ${modifier} applies to the next eligible Ally spin.${overflow}`;
    } else {
      nextTitle = "ALLY SPIN CAP REACHED";
      nextDetail = `${extension.overflowMysterySpins} Mystery Free Spin${extension.overflowMysterySpins === 1 ? " is" : "s are"} preserved for afterward. ${modifier} remains queued.`;
    }
    if (title.textContent !== nextTitle) title.textContent = nextTitle;
    if (detail.textContent !== nextDetail) detail.textContent = nextDetail;
  }

  function updateHelpText() {
    const list = document.querySelector("#helpModal ul");
    if (!list) return;
    const tokenItem = [...list.children].find(item => item.textContent.startsWith("Mystery Tokens count"));
    if (tokenItem) tokenItem.textContent = "Mystery Tokens count anywhere on the visible grid. During an active Ally feature, three Tokens add one Ally Spin and four or more add two Ally Spins, preserving the selected Ally, locked bet, modifiers, and accumulated feature state.";
    const retriggerItem = [...list.children].find(item => item.textContent.startsWith("The same natural Three Trees"));
    if (retriggerItem && !document.getElementById("allyMysteryHelpRule")) {
      const item = document.createElement("li");
      item.id = "allyMysteryHelpRule";
      item.textContent = "Natural Three Trees retriggers and Mystery Ally Spin extensions stack. Only overflow beyond the twenty-spin Ally cap waits as ordinary Mystery Free Spins for afterward.";
      retriggerItem.after(item);
    }
  }

  function findQaMysteryResult({ state, tokenCount, requireRetrigger = false }) {
    const session = state.freeSpinSession;
    const spinState = app.freeSpins.getLockedSpinState(session, state);
    for (let first = 0; first < CONFIG.reels[0].length; first += 1) {
      for (let second = 0; second < CONFIG.reels[1].length; second += 1) {
        for (let third = 0; third < CONFIG.reels[2].length; third += 1) {
          const targetStops = [first, second, third];
          const result = app.payouts.createSpinResult({
            targetStops,
            state: spinState,
            id: `qa-ally-extension-probe-${first}-${second}-${third}`,
            spinType: "free",
            referenceBet: session.referenceBet,
            totalAwardedSpins: session.totalAwardedSpins,
            featureRolls: { expandingWild: { roll: 1 } },
            mysteryModifiers: [],
            allyBypass: true,
            mysterySkipRescue: true,
            createdAt: "2000-01-01T00:00:00.000Z",
          });
          const countMatches = tokenCount >= 4 ? result.mysteryTokenCount >= 4 : result.mysteryTokenCount === tokenCount;
          const retriggerMatches = !requireRetrigger || Boolean(result.freeSpinTrigger?.triggered && result.freeSpinTrigger.retrigger);
          if (countMatches && retriggerMatches) return { targetStops, featureRolls: { expandingWild: { roll: 1 } } };
        }
      }
    }
    throw new Error("No deterministic Ally extension result exists for this reel configuration.");
  }

  function installQaExtensions() {
    if (!app.qa?.enabled) return;
    const key = "commune-fortune-ally-extension-qa-v1";
    const read = () => {
      try { return JSON.parse(sessionStorage.getItem(key) || "{}") || {}; } catch { return {}; }
    };
    const write = value => sessionStorage.setItem(key, JSON.stringify(value));
    const originalConsume = app.qa.consumeSpinOverride;
    app.qa.consumeSpinOverride = options => {
      const flags = read();
      if (options?.spinType === "free" && (flags.chainRemaining > 0 || flags.retriggerFour || flags.capOverflow)) {
        if (flags.capOverflow && options.state?.freeSpinSession) {
          const maximum = CONFIG.freeSpins.maximumAwardedSpins;
          options.state.freeSpinSession.completedSpins = maximum - 2;
          options.state.freeSpinSession.totalAwardedSpins = maximum - 1;
          options.state.freeSpinSession.remainingSpins = 1;
          options.totalAwardedSpins = maximum - 1;
        }
        const tokenCount = flags.retriggerFour || flags.capOverflow ? 4 : 3;
        const match = findQaMysteryResult({ state: options.state, tokenCount, requireRetrigger: flags.retriggerFour === true });
        flags.chainRemaining = Math.max(0, floor(flags.chainRemaining) - 1);
        flags.retriggerFour = false;
        flags.capOverflow = false;
        write(flags);
        return { ...match, label: tokenCount >= 4 ? "4+ Mystery Tokens on Ally spin" : "3 Mystery Tokens on Ally spin" };
      }
      return originalConsume(options);
    };

    const firstSection = document.querySelector(".qa-panel .qa-section");
    if (!firstSection || document.getElementById("allyExtensionQaSection")) return;
    const section = document.createElement("section");
    section.className = "qa-section";
    section.id = "allyExtensionQaSection";
    section.innerHTML = `
      <h3>Ally Mystery Extensions</h3>
      <p>Production result, persistence, settlement, and automatic feature-loop paths.</p>
      <div class="qa-row qa-row-split"><button type="button" data-extension-qa="three">3 Tokens → +1 Ally</button><button type="button" data-extension-qa="four">4+ Tokens → +2 Ally</button></div>
      <button type="button" data-extension-qa="stack">Natural Retrigger + 4 Tokens</button>
      <div class="qa-row qa-row-split"><button type="button" data-extension-qa="final">Extension on Final Spin</button><button type="button" data-extension-qa="chain">Repeated Extension Chain</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-extension-qa="cap">Safety-Cap Overflow</button><button type="button" data-extension-qa="reload">Reload-Ready Pending Extension</button></div>
      <label class="qa-field">Ally HUD Preview<select data-extension-hud>${CONFIG.allyOrder.map(id => `<option value="${id}">${CONFIG.allies[id].name}</option>`).join("")}</select></label>
      <div class="ally-hud qa-ally-hud-preview" data-extension-hud-preview style="--ally-accent:${CONFIG.allies[CONFIG.allyOrder[0]].accent}"><img src="${CONFIG.allies[CONFIG.allyOrder[0]].portrait}" alt=""><span class="ally-hud-copy"><span>${CONFIG.allies[CONFIG.allyOrder[0]].name}</span><strong>${CONFIG.allies[CONFIG.allyOrder[0]].abilityName}</strong></span></div>`;
    firstSection.before(section);

    const status = document.querySelector("[data-qa-status]");
    const setStatus = message => { if (status) status.textContent = message; };
    const run = count => { app.qa.forceMysteryCount(count); app.qa.releaseNextStep(); };
    section.addEventListener("click", event => {
      const action = event.target.closest("button[data-extension-qa]")?.dataset.extensionQa;
      if (!action) return;
      if (action === "three") run(3);
      else if (action === "four") run(4);
      else if (action === "final") {
        document.querySelector('[data-qa-action="one-left"]')?.click();
        run(3);
      } else if (action === "chain") {
        write({ ...read(), chainRemaining: 3 });
        app.qa.releaseNextStep();
        setStatus("Three consecutive 3-Token Ally extensions are armed.");
      } else if (action === "stack") {
        write({ ...read(), retriggerFour: true });
        app.qa.releaseNextStep();
        setStatus("Natural retrigger plus 4 Mystery Tokens is armed.");
      } else if (action === "cap") {
        write({ ...read(), capOverflow: true });
        app.qa.releaseNextStep();
        setStatus("One Ally-spin capacity remains; a 4-Token award is armed.");
      } else if (action === "reload") {
        const state = app.persistence.loadState();
        if (!isActiveAllySession(state) || state.freeSpinSession.status !== app.freeSpins.FREE_SPIN_STATUSES.READY) {
          setStatus("Pause between active Ally spins before preparing reload recovery.");
          return;
        }
        const match = findQaMysteryResult({ state, tokenCount: 3 });
        const spinState = app.freeSpins.getLockedSpinState(state.freeSpinSession, state);
        const result = app.payouts.createSpinResult({
          ...match,
          state: spinState,
          id: `qa-reload-extension-${Date.now()}`,
          spinType: "free",
          referenceBet: state.freeSpinSession.referenceBet,
          totalAwardedSpins: state.freeSpinSession.totalAwardedSpins,
          mysteryModifiers: app.mystery.peekModifierQueue(state),
        });
        if (!app.mystery.commitSpinStart(state, result)) throw new Error("Unable to commit pending QA extension.");
        state.pendingSpin = result;
        state.freeSpinSession.status = app.freeSpins.FREE_SPIN_STATUSES.SPINNING;
        app.persistence.saveState(state);
        location.reload();
      }
    });
    const select = section.querySelector("[data-extension-hud]");
    const preview = section.querySelector("[data-extension-hud-preview]");
    select?.addEventListener("change", () => {
      const definition = CONFIG.allies[select.value];
      preview.style.setProperty("--ally-accent", definition.accent);
      preview.querySelector("img").src = definition.portrait;
      preview.querySelector("img").alt = definition.name;
      preview.querySelector("span span").textContent = definition.name;
      preview.querySelector("strong").textContent = definition.abilityName;
    });
  }

  app.allyMysteryExtensions = {
    isActiveAllySession,
    createAllyExtensionPlan,
    attachAllyExtensionPlan,
    applyAllyMysteryExtension,
    deferredOverflow,
    lastSettlement: null,
    conversionEnabled: true,
  };
  app.freeSpins.markFreeSpinPresented = markFreeSpinPresented;
  app.payouts.createSpinResult = createSpinResult;
  app.payouts.settlePendingSpinState = settlePendingSpinState;

  globalThis.document?.addEventListener?.("DOMContentLoaded", () => {
    updateHelpText();
    installQaExtensions();
    forceCompleteAbilityLabel();
    updateTotalAwardedHud();
    const hud = document.getElementById("freeSpinsHud");
    const allyValue = document.getElementById("allyHudValue");
    const callout = document.getElementById("mysteryCalloutLayer");
    if (hud) new MutationObserver(() => { forceCompleteAbilityLabel(); updateTotalAwardedHud(); }).observe(hud, { childList: true, subtree: true, characterData: true, attributes: true });
    if (allyValue) new MutationObserver(forceCompleteAbilityLabel).observe(allyValue, { childList: true, characterData: true });
    if (callout) new MutationObserver(rewriteAllyMysteryCallout).observe(callout, { childList: true, subtree: true, characterData: true, attributes: true });
  }, { once: true });
})();
