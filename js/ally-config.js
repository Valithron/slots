(() => {
  "use strict";

  const app = globalThis.CommuneFortune;
  const { CONFIG } = app;

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
})();
