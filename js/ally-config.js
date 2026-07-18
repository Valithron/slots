(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

  const presentation = CONFIG.characterPresentation;
  CONFIG.characterPresentation = Object.freeze({
    ...presentation,
    assetVersion: "portraits-v4",
    characters: Object.freeze({
      ...presentation.characters,
      STR: Object.freeze({
        ...presentation.characters.STR,
        nice: "assets/symbols/sterling-nice.svg",
        big: "assets/symbols/sterling-big.svg",
      }),
    }),
  });

  CONFIG.schemaVersion = Math.max(6, Number(CONFIG.schemaVersion) || 0);
  CONFIG.features = Object.freeze({
    ...CONFIG.features,
    chooseYourAlly: true,
    allyAbilities: true,
  });

  const ally = (id, characterKey, abilityName, description, parameters) => Object.freeze({
    id,
    characterKey,
    name: CONFIG.characterPresentation.characters[characterKey].name,
    abilityName,
    portrait: CONFIG.characterPresentation.characters[characterKey].base,
    accent: CONFIG.characterPresentation.characters[characterKey].accent,
    description,
    enabled: true,
    parameters: Object.freeze({ ...parameters }),
  });

  CONFIG.allies = Object.freeze({
    sterling: ally(
      "sterling",
      "STR",
      "No Whammys",
      "Losing Free Spins build an Insurance Pot. Sterling pays it at the end of the feature.",
      { insurancePerLossMultiplier: 0.35, insuranceCapMultiplier: 1.5 },
    ),
    ryan: ally(
      "ryan",
      "RYN",
      "Big Win",
      "One of the first four Free Spins is secretly chosen. Any win on it pays 2×.",
      { selectedInitialSpinCount: 4, winMultiplier: 2 },
    ),
    cooper: ally(
      "cooper",
      "COP",
      "Rage-Bait",
      "Every consecutive loss makes Cooper angrier. His next win grows up to 2×, then Rage resets.",
      { multiplierLadder: Object.freeze([1, 1.3, 1.6, 2]) },
    ),
    cydney: ally(
      "cydney",
      "CYD",
      "I’m Listening",
      "Cydney listens to the first winning Free Spin and echoes 45% of it at the end.",
      { echoMultiplier: 0.45 },
    ),
    gabi: ally(
      "gabi",
      "GAB",
      "Eww",
      "The first weak win is replayed from a win-only judgment pool. Gabi keeps the better result.",
      { thresholdMultiplier: 3, replayRequiresWin: true, maximumReplayDraws: 512 },
    ),
    kenly: ally(
      "kenly",
      "KEN",
      "Big Lemons",
      "Kenly turns every natural Small Win into something bigger with a 37% Lemonade Bonus.",
      { lemonadeMultiplier: 0.37 },
    ),
    ashley: ally(
      "ashley",
      "ASH",
      "Fastball",
      "Ashley replays the first losing Free Spin. The replay does not consume another spin.",
      { replayCount: 1 },
    ),
  });

  CONFIG.allyOrder = Object.freeze(["sterling", "ryan", "cooper", "cydney", "gabi", "kenly", "ashley"]);
  CONFIG.rtpTargets.withAllyTotal = Object.freeze({ minimum: 0.952, maximum: 0.958 });
  CONFIG.rtpTargets.allyParitySpread = 0.001;

  app.constants.legacyStorageKeys = Array.from(new Set([
    ...(app.constants.legacyStorageKeys || []),
    app.constants.storageKey,
  ]));
  app.constants.storageKey = "commune-fortune-v6";

  const previewTierMultipliers = Object.freeze({
    small: 2,
    nice: CONFIG.winTiers.thresholds.nice,
    big: CONFIG.winTiers.thresholds.big,
    jackpot: CONFIG.winTiers.thresholds.jackpot,
    combination: 8,
  });
  let previewUi = null;
  let previewAudio = null;
  let previewRunning = false;

  function setQaStatus(message, tone = "neutral") {
    const status = globalThis.document?.querySelector?.("[data-qa-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function reactionSubjectOptions() {
    const characters = CONFIG.characterPresentation.characters;
    const keys = [...CONFIG.characterPresentation.allMembers, "TOL"];
    return [
      ...keys.map(key => `<option value="${key}"${key === "STR" ? " selected" : ""}>${characters[key].name}</option>`),
      '<option value="COMMUNE">The Commune group</option>',
    ].join("");
  }

  function mountReactionPreviewControls() {
    if (!app.qa?.enabled || !globalThis.document?.querySelector) return;
    const body = document.querySelector(".qa-panel-body");
    if (!body || body.querySelector("[data-qa-reaction-preview]")) return;
    const section = document.createElement("section");
    section.className = "qa-section";
    section.setAttribute("data-qa-reaction-preview", "");
    section.innerHTML = `
      <h3>Win Animation Preview</h3>
      <p>Presentation only. No coins, spins, odds, or saved progress are changed.</p>
      <label class="qa-field">Reaction subject
        <select data-qa-reaction-subject>${reactionSubjectOptions()}</select>
      </label>
      <label class="qa-field">Win type
        <select data-qa-reaction-tier>
          <option value="small">Small Win · coin burst only</option>
          <option value="nice" selected>Nice Win</option>
          <option value="big">Big Win</option>
          <option value="jackpot">Commune Jackpot</option>
          <option value="combination">Commune Combination</option>
        </select>
      </label>
      <button type="button" data-qa-preview-win>Preview Win Animation</button>`;
    const status = body.querySelector("[data-qa-status]");
    body.insertBefore(section, status || null);
    section.querySelector("[data-qa-preview-win]")?.addEventListener("click", () => {
      const subject = section.querySelector("[data-qa-reaction-subject]")?.value || "STR";
      const tier = section.querySelector("[data-qa-reaction-tier]")?.value || "nice";
      void previewWinAnimation(subject, tier);
    });
  }

  function createPreviewModel(subject, tier, payout, reducedMotion) {
    const isCommune = subject === "COMMUNE";
    const isTree = subject === "TOL";
    const character = CONFIG.characterPresentation.characters[subject];
    return app.reactions.createReactionPresentationModel({
      type: isCommune ? "group" : isTree ? "tree" : "character",
      characterKeys: isCommune ? [...CONFIG.characterPresentation.allMembers] : isTree ? [] : [subject],
      includesTree: isCommune || isTree,
      level: tier,
      compact: false,
      reducedMotion,
      payout,
      reason: "qa-presentation-preview",
      label: isCommune ? "The Commune" : character?.name || "Commune Win",
    });
  }

  function getPreviewAudio() {
    if (!previewAudio && typeof app.audio?.createAudio === "function") {
      previewAudio = app.audio.createAudio(() => app.game?.getState?.().sound !== false);
    }
    return previewAudio;
  }

  function blockPreviewKeys(event) {
    const interactive = event.target?.closest?.("button, input, select, textarea, a[href]");
    if (interactive) return;
    if (["Space", "Enter", "ArrowLeft", "ArrowRight"].includes(event.code)
      || ["Enter", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  async function previewWinAnimation(subject, tier) {
    if (previewRunning) {
      setQaStatus("A win animation preview is already running.", "error");
      return;
    }
    if (!previewUi || typeof app.game?.getPhase !== "function") {
      setQaStatus("The game is still initializing.", "error");
      return;
    }
    const state = app.game.getState();
    if (app.game.getPhase() !== app.GAME_STATES.IDLE || state.freeSpinSession?.active) {
      setQaStatus("Finish or reset the active game presentation before previewing a win.", "error");
      return;
    }
    if (!previewTierMultipliers[tier]) {
      setQaStatus("Choose a valid win type.", "error");
      return;
    }
    if (subject !== "COMMUNE" && !CONFIG.characterPresentation.characters[subject]) {
      setQaStatus("Choose a valid reaction subject.", "error");
      return;
    }

    previewRunning = true;
    const reducedMotion = app.effects.prefersReducedMotion();
    const referenceBet = app.payouts.getTotalBet(state);
    const payout = Math.max(1, Math.floor(referenceBet * previewTierMultipliers[tier]));
    const controls = [
      previewUi.elements?.spinButton,
      previewUi.elements?.betDown,
      previewUi.elements?.betUp,
      previewUi.elements?.refillButton,
      document.querySelector("[data-qa-preview-win]"),
    ].filter(Boolean);
    const disabledStates = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    document.addEventListener("keydown", blockPreviewKeys, true);
    let cleanup = null;

    try {
      previewUi.clearWins?.();
      previewUi.clearFeaturePresentation?.();
      setQaStatus(`Previewing ${tier === "combination" ? "Commune Combination" : `${tier[0].toUpperCase()}${tier.slice(1)} Win`} animation.`, "active");
      const audio = getPreviewAudio();

      if (tier === "small") {
        previewUi.setWinDisplay?.(payout);
        previewUi.showMessage?.(`QA Small Win preview: ${payout.toLocaleString()} coins.`, true);
        audio?.playTierSound?.("small");
        app.effects.burstCoins(16, previewUi.elements.reelFrame, { reducedMotion, spread: 0.72 });
        await app.effects.wait(reducedMotion ? 180 : 650);
      } else {
        const model = createPreviewModel(subject, tier, payout, reducedMotion);
        const shownTier = tier === "combination" ? "nice" : tier;
        previewUi.showReaction(model, { tier, compact: false });
        previewUi.updateReactionAmount(0);
        model.type === "character" ? audio?.playCharacterReaction?.(shownTier) : audio?.playGroupReaction?.();
        audio?.playTierSound?.(shownTier);
        cleanup = app.effects.startTierEffects({ tier: shownTier, elements: previewUi.elements, reducedMotion });
        await Promise.all([
          app.effects.countUp({
            totalWin: payout,
            duration: app.gameFlow.getCountUpDuration(shownTier, { reducedMotion, compact: false }),
            onUpdate: previewUi.updateReactionAmount,
          }),
          app.effects.wait(app.gameFlow.getCelebrationDuration(shownTier, { reducedMotion, compact: false })),
        ]);
        previewUi.updateReactionAmount(payout);
      }
      setQaStatus("Win animation preview complete. No coins were awarded.", "success");
    } catch (error) {
      console.error(error);
      setQaStatus(`Preview failed: ${error.message}`, "error");
    } finally {
      cleanup?.();
      previewUi.hideReaction?.();
      previewUi.setWinDisplay?.(state.lastWin || 0);
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
      document.removeEventListener("keydown", blockPreviewKeys, true);
      previewRunning = false;
    }
  }

  function installResolvedReactionAssets(ui) {
    if (!ui || ui.__resolvedReactionAssets || typeof ui.showReaction !== "function") return;
    const showReaction = ui.showReaction;
    ui.showReaction = (model, options) => {
      const shown = showReaction(model, options);
      if (!shown || !Array.isArray(model?.portraits)) return shown;
      const images = ui.elements?.reactionRoster?.querySelectorAll?.(".reaction-portrait") || [];
      images.forEach((image, index) => {
        const asset = model.portraits[index]?.asset;
        if (!asset?.path) return;
        image.src = asset.path;
        image.dataset.fallbackSrc = asset.fallbackPath || asset.genericPath || "";
        image.dataset.genericSrc = asset.genericPath || "";
      });
      ui.installImageFallbacks?.(ui.elements?.reactionRoster);
      return shown;
    };
    Object.defineProperty(ui, "__resolvedReactionAssets", { value: true });
  }

  function wrapUiModule(module) {
    if (!module || typeof module.createUI !== "function" || module.__reactionAssetWrapper) return module;
    const createUI = module.createUI;
    return {
      ...module,
      __reactionAssetWrapper: true,
      createUI(...args) {
        const ui = createUI(...args);
        previewUi = ui;
        installResolvedReactionAssets(ui);
        mountReactionPreviewControls();
        return ui;
      },
    };
  }

  let uiModule = app.ui;
  Object.defineProperty(app, "ui", {
    configurable: true,
    enumerable: true,
    get() { return uiModule; },
    set(value) { uiModule = wrapUiModule(value); },
  });
  if (uiModule) uiModule = wrapUiModule(uiModule);
})();
