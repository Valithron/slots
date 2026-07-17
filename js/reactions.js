(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;
  const PRESENTATION = CONFIG.characterPresentation;
  const CHARACTER_KEYS = Object.freeze([...PRESENTATION.allMembers]);
  const CONTRIBUTION_KEYS = Object.freeze([...CHARACTER_KEYS, "TOL"]);

  function versionAssetUrl(path, version = PRESENTATION.assetVersion) {
    if (typeof path !== "string" || path.trim() === "") return null;
    if (typeof version !== "string" || version.trim() === "") return path;
    const hashIndex = path.indexOf("#");
    const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
    const base = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}v=${encodeURIComponent(version)}${hash}`;
  }

  function getCharacterConfig(characterKey) {
    return PRESENTATION.characters[characterKey] || null;
  }

  function resolveReactionAsset(characterKey, requestedLevel = "base") {
    const character = getCharacterConfig(characterKey);
    const genericPath = PRESENTATION.genericAsset || CONFIG.symbols.TOL?.image || null;
    if (!character) {
      return {
        characterKey,
        requestedLevel,
        source: "generic",
        path: versionAssetUrl(genericPath),
        fallbackPath: versionAssetUrl(genericPath),
      };
    }
    const requestedPath = typeof character[requestedLevel] === "string" && character[requestedLevel]
      ? character[requestedLevel]
      : null;
    const basePath = typeof character.base === "string" && character.base
      ? character.base
      : null;
    const selectedPath = requestedPath || basePath || genericPath;
    return {
      characterKey,
      requestedLevel,
      source: requestedPath ? requestedLevel : basePath ? "base" : "generic",
      path: versionAssetUrl(selectedPath),
      fallbackPath: versionAssetUrl(basePath || genericPath),
      genericPath: versionAssetUrl(genericPath),
    };
  }

  function createEmptyContributionTotals() {
    return Object.fromEntries(CONTRIBUTION_KEYS.map(key => [key, 0]));
  }

  function normalizeContributionTotals(totals) {
    const normalized = createEmptyContributionTotals();
    CONTRIBUTION_KEYS.forEach(key => {
      const value = Number(totals?.[key]);
      normalized[key] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    });
    return normalized;
  }

  function calculateLineContributions(lineWins = []) {
    const totals = createEmptyContributionTotals();
    if (!Array.isArray(lineWins)) return totals;
    lineWins.forEach(win => {
      if (!CONTRIBUTION_KEYS.includes(win?.symbolKey)) return;
      const payout = Number.isFinite(win.payout) ? Math.max(0, Math.floor(win.payout)) : 0;
      totals[win.symbolKey] += payout;
    });
    return totals;
  }

  function addLineContributions(existingTotals, lineWins = []) {
    const next = normalizeContributionTotals(existingTotals);
    const addition = calculateLineContributions(lineWins);
    CONTRIBUTION_KEYS.forEach(key => { next[key] += addition[key]; });
    return next;
  }

  function reactionLevelForResult(result, { compact = false } = {}) {
    const tier = result?.winTier || result?.finalWinTier || "none";
    if (tier === "jackpot") return "jackpot";
    if (tier === "big") return "big";
    if (tier === "nice") return "nice";
    if (result?.totalWin > 0) return compact ? "small" : "small";
    return "none";
  }

  function selectReaction(result, {
    enabled = CONFIG.features.characterReactions,
    compact = false,
    reducedMotion = false,
  } = {}) {
    if (!enabled || !result || !Number.isFinite(result.totalWin) || result.totalWin <= 0) return null;

    const combination = Array.isArray(result.combinationWins) ? result.combinationWins[0] : null;
    const level = reactionLevelForResult(result, { compact });
    const common = {
      level,
      compact: Boolean(compact),
      reducedMotion: Boolean(reducedMotion),
      payout: Math.floor(result.totalWin),
    };

    if (combination?.id === "full-commune") {
      return {
        ...common,
        type: "group",
        characterKeys: [...PRESENTATION.allMembers],
        includesTree: true,
        level: result.winTier === "jackpot" ? "jackpot" : "combination",
        reason: "full-commune",
        label: "Full Commune",
      };
    }

    if (combination && PRESENTATION.combinationMembers[combination.id]) {
      return {
        ...common,
        type: "group",
        characterKeys: [...PRESENTATION.combinationMembers[combination.id]],
        includesTree: Array.isArray(combination.symbols) && combination.symbols.includes("TOL"),
        level: "combination",
        reason: combination.id,
        label: combination.name,
      };
    }

    if (level === "jackpot") {
      return {
        ...common,
        type: "group",
        characterKeys: [...PRESENTATION.allMembers],
        includesTree: true,
        level: "jackpot",
        reason: "commune-jackpot",
        label: "Commune Jackpot",
      };
    }

    const contributions = calculateLineContributions(result.lineWins);
    const positiveEntries = Object.entries(contributions).filter(([, payout]) => payout > 0);
    if (positiveEntries.length === 0) return null;
    const highest = Math.max(...positiveEntries.map(([, payout]) => payout));
    const leaders = positiveEntries.filter(([, payout]) => payout === highest).map(([key]) => key);
    const characterLeaders = leaders.filter(key => key !== "TOL");

    if (characterLeaders.length === 1 && leaders.length === 1) {
      return {
        ...common,
        type: "character",
        characterKeys: characterLeaders,
        includesTree: false,
        reason: "dominant-line-win",
        label: PRESENTATION.characters[characterLeaders[0]]?.name || "Commune",
        contributions,
      };
    }

    if (characterLeaders.length > 0) {
      return {
        ...common,
        type: "group",
        characterKeys: characterLeaders,
        includesTree: leaders.includes("TOL"),
        reason: "tied-dominant-line-win",
        label: "Commune Win",
        contributions,
      };
    }

    return {
      ...common,
      type: "tree",
      characterKeys: [],
      includesTree: true,
      reason: "tree-only-win",
      label: "Tree of Life",
      contributions,
    };
  }

  function requestedAssetLevel(reaction) {
    if (!reaction) return "base";
    if (reaction.level === "big" || reaction.level === "jackpot") return "big";
    if (reaction.level === "nice" || reaction.level === "combination") return "nice";
    return "base";
  }

  function createReactionPresentationModel(reaction) {
    if (!reaction) return null;
    const assetLevel = requestedAssetLevel(reaction);
    const portraits = reaction.characterKeys.map(characterKey => {
      const character = getCharacterConfig(characterKey);
      const asset = resolveReactionAsset(characterKey, assetLevel);
      return {
        characterKey,
        name: character?.name || CONFIG.symbols[characterKey]?.name || "Commune member",
        accent: character?.accent || CONFIG.characterAccentColorMap[characterKey] || "#f1d98a",
        asset,
      };
    });
    const treeAsset = reaction.includesTree ? resolveReactionAsset("TOL", assetLevel) : null;
    const names = portraits.map(portrait => portrait.name);
    const accessibleLabel = reaction.type === "character"
      ? `${names[0]} reacts to a ${reaction.level} win of ${reaction.payout} coins.`
      : reaction.type === "tree"
        ? `Tree of Life win of ${reaction.payout} coins.`
        : `${reaction.label || "Commune group"}: ${names.join(", ")}${reaction.includesTree ? ", and the Tree of Life" : ""}. Win ${reaction.payout} coins.`;
    return {
      ...reaction,
      portraits,
      treeAsset,
      accent: portraits[0]?.accent || CONFIG.characterAccentColorMap.TOL,
      accessibleLabel,
    };
  }

  function calculateSessionMvp(characterWinTotals, {
    accumulatedWin = 0,
  } = {}) {
    const totals = normalizeContributionTotals(characterWinTotals);
    if (!Number.isFinite(accumulatedWin) || accumulatedWin <= 0) {
      return {
        type: "group",
        characterKeys: [...PRESENTATION.allMembers],
        includesTree: true,
        reason: "zero-win-summary",
        label: "The Commune",
        amount: 0,
        totals,
      };
    }

    const highest = Math.max(...Object.values(totals));
    if (highest <= 0) {
      return {
        type: "group",
        characterKeys: [...PRESENTATION.allMembers],
        includesTree: true,
        reason: "combination-only-summary",
        label: "Commune Result",
        amount: 0,
        totals,
      };
    }

    const leaders = Object.entries(totals).filter(([, value]) => value === highest).map(([key]) => key);
    if (leaders.length === 1 && leaders[0] === "TOL") {
      return {
        type: "tree",
        characterKeys: [],
        includesTree: true,
        reason: "tree-mvp",
        label: "Tree of Life MVP",
        amount: highest,
        totals,
      };
    }
    if (leaders.length === 1) {
      const key = leaders[0];
      return {
        type: "character",
        characterKeys: [key],
        includesTree: false,
        reason: "unique-mvp",
        label: `${PRESENTATION.characters[key]?.name || "Commune"} MVP`,
        amount: highest,
        totals,
      };
    }

    const characterKeys = leaders.filter(key => key !== "TOL");
    return {
      type: "group",
      characterKeys: characterKeys.length ? characterKeys : [...PRESENTATION.allMembers],
      includesTree: leaders.includes("TOL"),
      reason: "tied-mvp",
      label: "Commune MVPs",
      amount: highest,
      totals,
    };
  }

  function createSummaryReaction(session) {
    const mvp = calculateSessionMvp(session?.characterWinTotals, { accumulatedWin: session?.accumulatedWin || 0 });
    return createReactionPresentationModel({
      ...mvp,
      level: "summary",
      compact: false,
      reducedMotion: false,
      payout: Math.max(0, Math.floor(session?.accumulatedWin || 0)),
    });
  }

  app.reactions = {
    CHARACTER_KEYS,
    CONTRIBUTION_KEYS,
    versionAssetUrl,
    getCharacterConfig,
    resolveReactionAsset,
    createEmptyContributionTotals,
    normalizeContributionTotals,
    calculateLineContributions,
    addLineContributions,
    reactionLevelForResult,
    selectReaction,
    createReactionPresentationModel,
    calculateSessionMvp,
    createSummaryReaction,
  };
})();
