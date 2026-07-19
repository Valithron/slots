(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const BASE_MS = 450;
  const REACTION_MS = 650;
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const VISIBLE_COPY = CONFIG.reelAnimation.baseCopy;
  const CHARACTER_KEYS = new Set(CONFIG.characterPresentation.allMembers);

  const active = new Map();
  const previewOverrides = new Map();
  const resolvedAssetCache = new Map();
  const preloadPromises = new Map();
  const failedAssetUrls = new Set();
  let capturedUI = null;
  let capturedReels = null;
  let previewTimer = null;
  let pendingCombinationWins = [];
  let generation = 0;

  const normalizeTier = tier => tier === "jackpot" || tier === "big"
    ? "big"
    : tier === "combination" || tier === "nice"
      ? "nice"
      : tier === "small"
        ? "small"
        : "base";

  function fallbackLevels(tier) {
    const level = normalizeTier(tier);
    if (level === "big") return ["big", "nice", "small", "base"];
    if (level === "nice") return ["nice", "small", "base"];
    if (level === "small") return ["small", "base"];
    return ["base"];
  }

  function stripVersion(path) {
    return typeof path === "string" ? path.split("?")[0].split("#")[0] : path;
  }

  function variantPath(basePath, level) {
    const clean = stripVersion(basePath);
    if (!clean || level === "base" || !/\.svg$/i.test(clean)) return clean;
    return clean.replace(/\.svg$/i, `-${level}.svg`);
  }

  function isUsableUrl(value) {
    return typeof value === "string"
      && value.trim() !== ""
      && !value.includes("undefined")
      && !value.includes("null");
  }

  function baseAsset(symbolKey) {
    const character = CONFIG.characterPresentation.characters[symbolKey];
    const configured = character?.base || CONFIG.symbols[symbolKey]?.image || CONFIG.characterPresentation.genericAsset;
    const path = app.reactions.versionAssetUrl(configured);
    return {
      characterKey: symbolKey,
      requestedLevel: "base",
      source: character?.base ? "base" : "generic",
      path,
      fallbackPath: path,
      genericPath: app.reactions.versionAssetUrl(CONFIG.characterPresentation.genericAsset),
      fallbackPaths: isUsableUrl(path) ? [path] : [],
    };
  }

  function configuredVariantPath(characterKey, level, basePath) {
    const configured = CONFIG.characterPresentation.characters[characterKey]?.[level];
    return typeof configured === "string" && configured.trim()
      ? configured
      : variantPath(basePath, level);
  }

  function resolveVariantChain(symbolKey, tier) {
    if (!CHARACTER_KEYS.has(symbolKey)) return [];
    const base = baseAsset(symbolKey);
    const seen = new Set();
    return fallbackLevels(tier).map(level => {
      const configured = configuredVariantPath(symbolKey, level, base.path);
      return {
        ...base,
        requestedLevel: level,
        source: level,
        path: app.reactions.versionAssetUrl(configured),
      };
    }).filter(asset => {
      if (!isUsableUrl(asset.path) || seen.has(asset.path)) return false;
      seen.add(asset.path);
      return true;
    });
  }

  function resolveConventionAsset(characterKey, requestedLevel = "base") {
    if (!CHARACTER_KEYS.has(characterKey)) return baseAsset(characterKey);
    const chain = resolveVariantChain(characterKey, requestedLevel);
    const base = baseAsset(characterKey);
    return {
      characterKey,
      requestedLevel,
      source: normalizeTier(requestedLevel),
      path: chain[0]?.path || base.path,
      fallbackPath: chain[1]?.path || base.path,
      genericPath: chain[2]?.path || chain[1]?.path || base.genericPath || base.path,
      fallbackPaths: chain.map(asset => asset.path),
    };
  }

  app.reactions.resolveReactionAsset = resolveConventionAsset;

  function preloadAsset(src) {
    if (!isUsableUrl(src)) return Promise.reject(new Error("Reaction asset URL is empty or invalid."));
    if (failedAssetUrls.has(src)) return Promise.reject(new Error(`Reaction asset previously failed: ${src}`));
    if (preloadPromises.has(src)) return preloadPromises.get(src);
    if (typeof globalThis.Image !== "function") return Promise.resolve(src);

    const promise = new Promise((resolve, reject) => {
      const image = new globalThis.Image();
      let settled = false;
      const succeed = async () => {
        if (settled) return;
        settled = true;
        try {
          if (typeof image.decode === "function") await image.decode();
        } catch {
          // onload is authoritative; decode failures are not treated as broken assets.
        }
        resolve(src);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        failedAssetUrls.add(src);
        reject(new Error(`Unable to load reaction asset: ${src}`));
      };
      image.onload = succeed;
      image.onerror = fail;
      image.src = src;
      if (image.complete && Number(image.naturalWidth) > 0) void succeed();
    });

    preloadPromises.set(src, promise);
    promise.catch(() => preloadPromises.delete(src));
    return promise;
  }

  async function resolveLoadedReactionAsset(symbolKey, tier, currentSrc = "") {
    const cacheKey = `${symbolKey}:${normalizeTier(tier)}`;
    if (resolvedAssetCache.has(cacheKey)) return resolvedAssetCache.get(cacheKey);
    const promise = (async () => {
      const candidates = resolveVariantChain(symbolKey, tier);
      for (const asset of candidates) {
        if (asset.path === currentSrc && isUsableUrl(currentSrc)) return currentSrc;
        try {
          return await preloadAsset(asset.path);
        } catch {
          // Continue through the complete fallback chain.
        }
      }
      return isUsableUrl(currentSrc) ? currentSrc : null;
    })();
    resolvedAssetCache.set(cacheKey, promise);
    return promise;
  }

  function visibleCell(reelController, reel, row) {
    const topStops = reelController?.getCurrentTopStops?.() || [];
    const strip = reelController?.getReelElements?.()?.[reel]?.strip;
    const reelLength = CONFIG.reels[reel]?.length || 0;
    if (!strip || !reelLength || !Number.isInteger(row) || !Number.isInteger(topStops[reel])) return null;
    const stop = (topStops[reel] + row) % reelLength;
    return strip.querySelector(`.symbol-cell[data-stop="${stop}"][data-copy="${VISIBLE_COPY}"]`);
  }

  function participatingCells(wins, reelController) {
    const found = new Map();
    (wins || []).forEach(win => (win?.rows || []).forEach((row, reel) => {
      if (!Number.isInteger(row)) return;
      const cell = visibleCell(reelController, reel, row);
      if (!cell) return;
      const symbolKey = cell.dataset.symbol || win.symbolKey;
      if (!CHARACTER_KEYS.has(symbolKey) || cell.classList?.contains?.("is-center-tree")) return;
      const key = `${reel}:${row}`;
      if (!found.has(key)) found.set(key, { key, cell, reel, row, symbolKey });
    }));
    return [...found.values()];
  }

  function clearTimer(entry) {
    if (entry?.timer) globalThis.clearTimeout(entry.timer);
    if (entry) entry.timer = null;
  }

  function safeSetSrc(entry, src) {
    if (!entry?.image || !isUsableUrl(src) || !entry.image.isConnected || !active.has(entry.key)) return false;
    entry.image.setAttribute("src", src);
    return true;
  }

  function restoreEntry(entry) {
    clearTimer(entry);
    if (!entry?.image) return;
    if (isUsableUrl(entry.baseSrc)) entry.image.setAttribute("src", entry.baseSrc);
    entry.image.removeAttribute("data-reel-reaction-active");
    entry.image.removeAttribute("data-reel-reaction-tier");
  }

  function stopAll() {
    generation += 1;
    if (previewTimer) globalThis.clearTimeout(previewTimer);
    previewTimer = null;
    active.forEach(restoreEntry);
    active.clear();
  }

  function schedule(entry, showingReaction, localGeneration) {
    clearTimer(entry);
    entry.timer = globalThis.setTimeout(() => {
      if (generation !== localGeneration || !active.has(entry.key) || !entry.image?.isConnected) return;
      const nextReaction = !showingReaction;
      const nextSrc = nextReaction ? entry.reactionSrc : entry.baseSrc;
      if (!safeSetSrc(entry, nextSrc)) return;
      schedule(entry, nextReaction, localGeneration);
    }, showingReaction ? REACTION_MS : BASE_MS);
  }

  function start(wins, reelController, tier = "small", { forceMotion = false } = {}) {
    stopAll();
    const localGeneration = generation;
    const cells = participatingCells(wins, reelController);
    const reducedMotion = !forceMotion && globalThis.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true;

    cells.forEach(item => {
      const image = item.cell?.querySelector?.("img");
      if (!image) return;
      const currentSrc = image.getAttribute("src") || image.currentSrc || "";
      const configuredBase = baseAsset(item.symbolKey)?.path;
      const baseSrc = isUsableUrl(currentSrc) ? currentSrc : configuredBase;
      if (!isUsableUrl(baseSrc)) return;
      const entry = { ...item, image, baseSrc, reactionSrc: baseSrc, timer: null };
      active.set(item.key, entry);
      image.dataset.reelReactionActive = "true";
      image.dataset.reelReactionTier = normalizeTier(tier);

      void resolveLoadedReactionAsset(item.symbolKey, tier, baseSrc).then(reactionSrc => {
        if (generation !== localGeneration || !active.has(item.key) || !isUsableUrl(reactionSrc)) return;
        entry.reactionSrc = reactionSrc;
        if (reactionSrc === baseSrc) return;
        if (reducedMotion) safeSetSrc(entry, reactionSrc);
        else schedule(entry, false, localGeneration);
      });
    });
    return cells;
  }

  function combinationWins(combinationWin) {
    return (combinationWin?.cells || []).map(({ row, reel }, index) => {
      const rows = Array(CONFIG.reels.length);
      rows[reel] = row;
      return { symbolKey: combinationWin?.symbols?.[index] || null, rows };
    });
  }

  function patchReactionRoster(ui, model, tier) {
    const roster = ui?.elements?.reactionRoster;
    if (!roster || !Array.isArray(model?.portraits)) return;
    const images = [...roster.querySelectorAll("img")];
    images.forEach((image, index) => {
      const portrait = model.portraits[index];
      if (!portrait?.characterKey) return;
      const currentSrc = image.getAttribute("src") || image.currentSrc || "";
      void resolveLoadedReactionAsset(portrait.characterKey, tier || model.level, currentSrc).then(src => {
        if (!image.isConnected || !isUsableUrl(src)) return;
        image.setAttribute("src", src);
      });
    });
  }

  function restorePreviewBoard() {
    previewOverrides.forEach((original, cell) => {
      cell.dataset.symbol = original.symbol;
      const image = cell.querySelector("img");
      if (image) {
        if (isUsableUrl(original.src)) image.setAttribute("src", original.src);
        image.setAttribute("alt", original.alt);
      }
    });
    previewOverrides.clear();
  }

  function setPreviewCell(reel, row, symbolKey) {
    const cell = visibleCell(capturedReels, reel, row);
    if (!cell) return;
    const image = cell.querySelector("img");
    if (!previewOverrides.has(cell)) previewOverrides.set(cell, {
      symbol: cell.dataset.symbol,
      src: image?.getAttribute("src") || "",
      alt: image?.getAttribute("alt") || "",
    });
    cell.dataset.symbol = symbolKey;
    if (image) {
      image.setAttribute("src", CONFIG.symbols[symbolKey].image);
      image.setAttribute("alt", CONFIG.symbols[symbolKey].name);
    }
  }

  const PREVIEW_ROWS = Object.freeze({
    small: Object.freeze([[1, 1, 1]]),
    nice: Object.freeze([[0, 1, 2], [2, 1, 0]]),
    big: Object.freeze([[0, 0, 0], [1, 1, 1], [2, 2, 2]]),
    jackpot: Object.freeze([[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]]),
    combination: Object.freeze([[1, 1, 1]]),
  });

  function previewWins(tier, characterKey) {
    const rows = PREVIEW_ROWS[tier] || PREVIEW_ROWS.small;
    rows.forEach(line => line.forEach((row, reel) => setPreviewCell(reel, row, characterKey)));
    return rows.map((line, lineIndex) => ({ symbolKey: characterKey, rows: [...line], lineIndex, payout: 10 }));
  }

  function patchFactories() {
    const baseCreateUI = app.ui.createUI;
    app.ui.createUI = function createUIWithReliableReactions(...args) {
      const ui = baseCreateUI(...args);
      capturedUI = ui;
      const baseMarkWins = ui.markWins.bind(ui);
      const baseMarkCombination = ui.markCombination?.bind(ui);
      const baseClearWins = ui.clearWins.bind(ui);
      const baseShowReaction = ui.showReaction?.bind(ui);

      if (baseMarkCombination) ui.markCombination = function markCombinationWithReliableReactions(combinationWin, result, reelController) {
        pendingCombinationWins = combinationWins(combinationWin);
        return baseMarkCombination(combinationWin, result, reelController);
      };

      ui.markWins = function markWinsWithReliableReactions(wins, reelController, tier, options = {}) {
        const combination = pendingCombinationWins;
        pendingCombinationWins = [];
        const result = baseMarkWins(wins, reelController, tier, { ...options, reaction: false });
        if (options.reaction) {
          const reactionTier = combination.length ? "nice" : tier;
          start([...(wins || []), ...combination], reelController, reactionTier, { forceMotion: options.forceMotion === true });
        }
        return result;
      };

      ui.clearWins = function clearWinsWithReliableReactions(...clearArgs) {
        pendingCombinationWins = [];
        stopAll();
        restorePreviewBoard();
        return baseClearWins(...clearArgs);
      };

      if (baseShowReaction) ui.showReaction = function showReactionWithResolvedPortraits(model, options = {}) {
        const result = baseShowReaction(model, options);
        patchReactionRoster(ui, model, options.tier || model?.level);
        return result;
      };

      ui.stopReelReactions = () => {
        pendingCombinationWins = [];
        stopAll();
        restorePreviewBoard();
      };
      return ui;
    };

    const baseCreateReels = app.reels.createReelController;
    app.reels.createReelController = function createCapturedReels(...args) {
      capturedReels = baseCreateReels(...args);
      return capturedReels;
    };
  }

  async function preview(tier, characterKey = "STR") {
    if (!app.qa?.enabled || !capturedUI || !capturedReels || !app.game) return { ok: false, message: "The game is still initializing." };
    if (!CONFIG.characterPresentation.allMembers.includes(characterKey)) throw new Error("Choose a valid Commune member.");

    const before = JSON.stringify(app.game.getState());
    capturedUI.clearWins();
    capturedUI.hideReaction?.();
    await capturedReels.spinTo([0, 0, 0], { anticipation: "none", reducedMotion: true, dramaEnabled: false, manualStopsEnabled: false });

    const wins = previewWins(tier, characterKey);
    const reelTier = tier === "jackpot" ? "jackpot" : tier === "combination" ? "nice" : tier;
    capturedUI.markWins(wins, capturedReels, reelTier, { reaction: true, forceMotion: true });

    const name = CONFIG.characterPresentation.characters[characterKey]?.name || characterKey;
    const level = tier === "combination" ? "combination" : reelTier;
    const reaction = {
      type: "character",
      characterKeys: [characterKey],
      includesTree: false,
      level,
      compact: false,
      reducedMotion: false,
      payout: tier === "small" ? 10 : tier === "nice" ? 50 : tier === "big" ? 150 : tier === "jackpot" ? 500 : 80,
      reason: "qa-hardcoded-preview",
      label: name,
    };
    const model = app.reactions.createReactionPresentationModel(reaction);
    if (model) {
      capturedUI.showReaction(model, { tier: level });
      previewTimer = globalThis.setTimeout(() => capturedUI.hideReaction(), 1800);
    }

    if (JSON.stringify(app.game.getState()) !== before) throw new Error("QA reel preview changed persistent game state.");
    return { ok: true, message: `${tier === "combination" ? "Commune Combination" : `${tier[0].toUpperCase()}${tier.slice(1)} Win`} fixed preview running for ${name}.` };
  }

  function mountQA() {
    if (!app.qa?.enabled) return;
    const body = document.querySelector(".qa-panel-body");
    if (!body || body.querySelector("[data-reel-reaction-preview]")) return;
    const section = document.createElement("section");
    section.className = "qa-reaction-preview";
    section.dataset.reelReactionPreview = "true";
    section.innerHTML = `<div class="qa-heading"><strong>Reel Reaction Preview</strong><span>Fixed boards, no payout or saved progress</span></div>
      <label class="qa-field">Character<select data-reaction-character>${CONFIG.characterPresentation.allMembers.map(id => `<option value="${id}"${id === "STR" ? " selected" : ""}>${CONFIG.characterPresentation.characters[id]?.name || id}</option>`).join("")}</select></label>
      <div class="qa-row qa-row-split"><button type="button" data-reaction-tier="small">Small Win</button><button type="button" data-reaction-tier="nice">Nice Win</button></div>
      <div class="qa-row qa-row-split"><button type="button" data-reaction-tier="big">Big Win</button><button type="button" data-reaction-tier="jackpot">Jackpot</button></div>
      <button type="button" data-reaction-tier="combination">Commune Combination</button>
      <button class="qa-danger" type="button" data-reaction-clear>Clear Reel Reactions</button>`;
    body.insertBefore(section, body.querySelector(".qa-status"));
    const status = body.querySelector("[data-qa-status]");
    section.addEventListener("click", async event => {
      const tier = event.target.closest("button[data-reaction-tier]")?.dataset.reactionTier;
      if (event.target.closest("button[data-reaction-clear]")) {
        pendingCombinationWins = [];
        stopAll();
        restorePreviewBoard();
        capturedUI?.hideReaction?.();
        if (status) status.textContent = "Reel reactions cleared.";
        return;
      }
      if (!tier) return;
      const character = section.querySelector("[data-reaction-character]")?.value || "STR";
      try {
        const outcome = await preview(tier, character);
        if (status) status.textContent = outcome.message;
      } catch (error) {
        console.error(error);
        if (status) status.textContent = error.message;
      }
    });
  }

  patchFactories();
  app.reelReactions = {
    BASE_MS,
    REACTION_MS,
    normalizeTier,
    fallbackLevels,
    variantPath,
    configuredVariantPath,
    resolveConventionAsset,
    resolveVariantChain,
    preloadAsset,
    resolveLoadedReactionAsset,
    participatingCells,
    combinationWins,
    start,
    stopAll,
    activeCount: () => active.size,
    failedAssetUrls,
    resolvedAssetCache,
    preview,
    previewWins,
    PREVIEW_ROWS,
  };
  if (app.qa?.enabled) globalThis.setTimeout(mountQA, 0);
})();
