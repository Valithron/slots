(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

  const STRONG_IDS = Object.freeze([
    "golden-payline",
    "fortune-flood",
    "scatter-magnet",
    "commune-gathering",
    "sevenfold-fortune",
    "full-fortune",
    "commune-chaos",
  ]);
  const STRONG_NAMES = Object.freeze({
    "golden-payline": "Golden Payline",
    "fortune-flood": "Fortune Flood",
    "scatter-magnet": "Scatter Magnet",
    "commune-gathering": "Commune Gathering",
    "sevenfold-fortune": "Sevenfold Fortune",
    "full-fortune": "Full Fortune",
    "commune-chaos": "Commune Chaos",
  });
  const CHAOS_EFFECTS = Object.freeze([
    "chaos-spotlight",
    "chaos-center-tree",
    "chaos-double-commune",
    "chaos-rescue",
    "lucky-line",
    "wild-spark",
    "scatter-spark",
  ]);
  const PAYLINE_NAMES = Object.freeze([
    "Top Horizontal",
    "Middle Horizontal",
    "Bottom Horizontal",
    "Downward Diagonal",
    "Upward Diagonal",
  ]);

  CONFIG.mystery.strong = Object.freeze({
    goldenPaylineMultiplier: 4,
    fortuneFloodMultiplier: 2,
    fortuneFloodFloor: 50,
    scatterMagnetOverlays: 2,
    communeGatheringMultiplier: 3,
    sevenfoldAssistedMultiplier: 3,
    sevenfoldNaturalMultiplier: 7,
    fullFortuneMultiplier: 2,
    communeChaosEffectCount: 3,
    chaosSpotlightMultiplier: 2,
    chaosDoubleCommuneMultiplier: 2,
    luckyLineMultiplier: 2,
    chaosRescueAttempts: 1,
    scatterSparkOverlays: 1,
  });

  const clone = value => value == null ? value : structuredClone(value);
  const floor = value => Math.max(0, Math.floor(Number(value) || 0));
  const isStrongId = id => STRONG_IDS.includes(id);
  const randomIndex = (length, rng = Math.random) => Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
  const cellKey = cell => `${cell.row}:${cell.reel}`;
  let instanceSequence = 0;

  function chooseDistinct(pool, count, rng) {
    const available = [...pool];
    const chosen = [];
    while (available.length && chosen.length < count) chosen.push(available.splice(randomIndex(available.length, rng), 1)[0]);
    return chosen;
  }

  function createSelectionPayload(id, rng = Math.random, forced = {}) {
    if (id === "golden-payline") {
      const lineIndex = Number.isInteger(forced.lineIndex) ? forced.lineIndex : randomIndex(CONFIG.paylines.length, rng);
      return { lineIndex, lineName: PAYLINE_NAMES[lineIndex] };
    }
    if (id === "commune-gathering") {
      const pool = CONFIG.combinations.definitions;
      const selected = pool.find(item => item.id === forced.combinationId) || pool[randomIndex(pool.length, rng)];
      return { combinationId: selected.id, combinationName: selected.name };
    }
    if (id === "sevenfold-fortune") {
      const characterKey = CONFIG.characterPresentation.allMembers.includes(forced.characterKey)
        ? forced.characterKey
        : CONFIG.characterPresentation.allMembers[randomIndex(CONFIG.characterPresentation.allMembers.length, rng)];
      return { characterKey, characterName: CONFIG.symbols[characterKey].name };
    }
    if (id === "commune-chaos") {
      const forcedEffects = Array.isArray(forced.effects) ? forced.effects : [];
      const effects = forcedEffects.length === CONFIG.mystery.strong.communeChaosEffectCount
        && new Set(forcedEffects).size === CONFIG.mystery.strong.communeChaosEffectCount
        && forcedEffects.every(effect => CHAOS_EFFECTS.includes(effect))
        ? [...forcedEffects]
        : chooseDistinct(CHAOS_EFFECTS, CONFIG.mystery.strong.communeChaosEffectCount, rng);
      const payload = { effects };
      if (effects.includes("chaos-spotlight")) {
        payload.spotlightCharacterKey = CONFIG.characterPresentation.allMembers.includes(forced.spotlightCharacterKey)
          ? forced.spotlightCharacterKey
          : CONFIG.characterPresentation.allMembers[randomIndex(CONFIG.characterPresentation.allMembers.length, rng)];
        payload.spotlightCharacterName = CONFIG.symbols[payload.spotlightCharacterKey].name;
      }
      if (effects.includes("lucky-line")) {
        payload.luckyLineIndex = Number.isInteger(forced.luckyLineIndex) ? forced.luckyLineIndex : randomIndex(CONFIG.paylines.length, rng);
        payload.luckyLineName = PAYLINE_NAMES[payload.luckyLineIndex];
      }
      return payload;
    }
    return {};
  }

  function normalizeStrongInstance(value, fallbackSource = "recovered") {
    if (!value || !isStrongId(value.id)) return null;
    const instanceId = typeof value.instanceId === "string" && value.instanceId
      ? value.instanceId
      : `${fallbackSource}:${value.id}:${Math.random().toString(36).slice(2, 10)}`;
    return {
      instanceId,
      id: value.id,
      name: STRONG_NAMES[value.id],
      tier: "strong",
      requestedTier: "strong",
      actualTier: "strong",
      selectionPayload: value.selectionPayload && typeof value.selectionPayload === "object" ? clone(value.selectionPayload) : {},
      awardSourceSpinId: typeof value.awardSourceSpinId === "string" ? value.awardSourceSpinId : fallbackSource,
      applicationStatus: value.applicationStatus === "applied" ? "applied" : "queued",
      consumptionStatus: value.consumptionStatus === "consumed" ? "consumed" : "pending",
      presentationStatus: ["pending", "revealed", "presented"].includes(value.presentationStatus) ? value.presentationStatus : "pending",
    };
  }

  function createStrongInstance(modifier, spinId, rng = Math.random, forced = {}) {
    if (!modifier || !isStrongId(modifier.id)) return null;
    const instanceId = modifier.instanceId || `${spinId}:strong:${modifier.id}:${++instanceSequence}`;
    return normalizeStrongInstance({
      ...modifier,
      instanceId,
      selectionPayload: modifier.selectionPayload || createSelectionPayload(modifier.id, rng, forced),
      awardSourceSpinId: spinId,
      applicationStatus: "queued",
      consumptionStatus: "pending",
      presentationStatus: "pending",
    }, spinId);
  }

  function normalizeStrongQueue(queue) {
    const seen = new Set();
    return (Array.isArray(queue) ? queue : []).map((item, index) => normalizeStrongInstance(item, `recovered-${index}`)).filter(item => {
      if (!item || seen.has(item.instanceId)) return false;
      seen.add(item.instanceId);
      return true;
    });
  }

  function migrateStrongQueue(state) {
    if (!state?.mystery) return [];
    const migrated = [];
    state.mystery.modifierQueue = (Array.isArray(state.mystery.modifierQueue) ? state.mystery.modifierQueue : []).filter(item => {
      if (!isStrongId(item?.id)) return true;
      migrated.push(createStrongInstance(item, item.awardSourceSpinId || "legacy-queue"));
      return false;
    });
    state.mystery.strongModifierQueue = normalizeStrongQueue([...(state.mystery.strongModifierQueue || []), ...migrated]);
    return state.mystery.strongModifierQueue;
  }

  function strongLabel(instance) {
    const payload = instance.selectionPayload || {};
    if (instance.id === "golden-payline") return `Golden Payline: ${payload.lineName || PAYLINE_NAMES[payload.lineIndex] || "Selected Line"} · 4×`;
    if (instance.id === "fortune-flood") return "Fortune Flood: 2× · Fortune 50+";
    if (instance.id === "scatter-magnet") return "Scatter Magnet: +2 Tokens";
    if (instance.id === "commune-gathering") return `Gathering: ${payload.combinationName || "Commune Group"} · 3×`;
    if (instance.id === "sevenfold-fortune") return `Sevenfold Fortune: ${payload.characterName || "Commune Member"} · 3× / 7×`;
    if (instance.id === "full-fortune") return "Full Fortune: 2× All Rewards";
    if (instance.id === "commune-chaos") return `Commune Chaos: ${(payload.effects || []).map(effect => effect.replaceAll("-", " ")).join(" + ")}`;
    return STRONG_NAMES[instance.id] || "Strong Mystery";
  }

  function availableOverlayCells(matrix, protectedCells = [], excludedSymbols = [CONFIG.mystery.symbolKey]) {
    const blocked = new Set(protectedCells.map(cellKey));
    const excluded = new Set(excludedSymbols);
    const cells = [];
    for (let row = 0; row < CONFIG.rowCount; row += 1) {
      for (let reel = 0; reel < CONFIG.reels.length; reel += 1) {
        if (excluded.has(matrix?.[row]?.[reel]) || blocked.has(`${row}:${reel}`)) continue;
        cells.push({ row, reel });
      }
    }
    return cells;
  }

  function chooseCells(matrix, count, rng, protectedCells = [], excludedSymbols) {
    const pool = availableOverlayCells(matrix, protectedCells, excludedSymbols);
    const cells = [];
    while (pool.length && cells.length < count) cells.push(pool.splice(randomIndex(pool.length, rng), 1)[0]);
    return cells;
  }

  function originalLineIsNaturalTrio(result, win, selectedCharacter) {
    return win.rows.every((row, reel) => result.originalMatrix?.[row]?.[reel] === selectedCharacter);
  }

  function baseCombinationWin(win) {
    return {
      ...clone(win),
      name: win.baseName || win.name,
      baseName: win.baseName || win.name,
      payout: floor(win.basePayout ?? win.payout),
      basePayout: floor(win.basePayout ?? win.payout),
      mysteryMultiplier: 1,
    };
  }


  const runtime = { qaQueuedSelection: null, qaForcedAwardSelection: null, qaQueueHandler: null };
  app.strongMysteryCore = {
    STRONG_IDS, STRONG_NAMES, CHAOS_EFFECTS, PAYLINE_NAMES, runtime,
    clone, floor, isStrongId, randomIndex, cellKey, chooseDistinct,
    createSelectionPayload, normalizeStrongInstance, createStrongInstance,
    normalizeStrongQueue, migrateStrongQueue, strongLabel, availableOverlayCells,
    chooseCells, originalLineIsNaturalTrio, baseCombinationWin,
  };
})();
