(() => {
  "use strict";

  const app = globalThis.CommuneFortune = globalThis.CommuneFortune || {};

  const GAME_STATES = Object.freeze({
    IDLE: "idle",
    SPINNING: "spinning",
    STOPPING: "stopping",
    RESOLVING: "resolving",
    CELEBRATING: "celebrating",
    BONUS: "bonus",
    FREE_SPINS: "free-spins",
    RISK_GAME: "risk-game",
  });

  const FEATURES = Object.freeze({
    spinDrama: true,
    winTiers: true,
    characterAnimations: false,
    expandingWilds: true,
    scatters: false,
    freeSpins: false,
    momentumMeter: false,
    dailyRewards: false,
    advancedAudio: false,
    manualStops: false,
    riskGame: false,
    mysteryModifiers: false,
    combinationBonuses: true,
    secretEvents: false,
  });

  const combinationDefinitions = Object.freeze([
    { id: "kps", name: "KPs", sequence: ["STR", "CYD", "TOL"], payoutType: "lineBet", multiplier: 8 },
    { id: "walls", name: "Walls", sequence: ["RYN", "GAB", "TOL"], payoutType: "lineBet", multiplier: 8 },
    { id: "jaaps", name: "Jaaps", sequence: ["KEN", "COP", "TOL"], payoutType: "lineBet", multiplier: 8 },
    { id: "brotherhood", name: "Brotherhood", sequence: ["COP", "STR", "RYN"], payoutType: "lineBet", multiplier: 12 },
    { id: "wives-circle", name: "Wives’ Circle", sequence: ["KEN", "GAB", "CYD"], payoutType: "lineBet", multiplier: 5 },
    { id: "household", name: "Household", sequence: ["ASH", "STR", "CYD"], payoutType: "lineBet", multiplier: 8 },
  ]);

  const fullCommuneDefinition = Object.freeze({
    id: "full-commune",
    name: "Full Commune",
    payoutType: "totalBet",
    multiplier: 5,
    requiredCharacters: ["STR", "CYD", "RYN", "GAB", "COP", "KEN", "ASH"],
  });

  app.CONFIG = {
    schemaVersion: 3,
    startingCoins: 1000,
    rowCount: 3,
    rtpTargets: {
      base: { minimum: 0.82, maximum: 0.83 },
      expandingWildIncrement: { minimum: 0.025, maximum: 0.035 },
      combinations: { minimum: 0.0175, maximum: 0.0235 },
      featurePassTotal: { minimum: 0.86, maximum: 0.875 },
      total: { minimum: 0.96, maximum: 0.97 },
    },
    features: FEATURES,
    expandingWild: {
      symbolKey: "TOL",
      reelIndex: 1,
      rowIndex: 1,
      outcomes: 4,
      activatingRolls: [0],
      presentation: {
        pulseDuration: 260,
        growthDuration: 460,
        lockDuration: 220,
        reducedMotionDuration: 180,
      },
    },
    combinations: {
      communeRow: 1,
      definitions: combinationDefinitions,
      fullCommune: fullCommuneDefinition,
      presentationDuration: 900,
      fullCommunePresentationDuration: 1250,
      reducedMotionDuration: 360,
    },
    winTiers: {
      thresholds: { nice: 5, big: 15, jackpot: 40 },
      celebrationDurations: { nice: 2400, big: 3400, jackpot: 4600 },
      countUpDurations: { nice: 1500, big: 2400, jackpot: 3400 },
      countUpMinimum: 650,
      countUpMaximum: 3600,
    },
    reducedMotion: {
      reelDurationScale: 0.62,
      anticipationDelayScale: 0.18,
      celebrationDurationScale: 0.46,
      countUpDurationScale: 0.34,
      settleDistanceScale: 0.35,
    },
    anticipation: { delays: { none: 0, mild: 350, strong: 650 } },
    characterAccentColors: ["#d3d8e8", "#86a66a", "#a276ff", "#89d2ff", "#e0aa3e", "#65e6cc", "#ff7fba"],
    characterAccentColorMap: {
      STR: "#d3d8e8", CYD: "#86a66a", RYN: "#a276ff", GAB: "#89d2ff",
      COP: "#e0aa3e", KEN: "#65e6cc", ASH: "#ff7fba", TOL: "#f1d98a",
    },
    paylines: [[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]],
    lineBets: [1, 2, 5, 10],
    symbols: {
      CYD: { name: "Cydney", payout: 11, image: "assets/symbols/cydney.svg" },
      GAB: { name: "Gabi", payout: 8, image: "assets/symbols/gabi.svg" },
      KEN: { name: "Kenly", payout: 8, image: "assets/symbols/kenly.svg" },
      ASH: { name: "Ashley", payout: 12, image: "assets/symbols/ashley.svg" },
      COP: { name: "Cooper", payout: 12, image: "assets/symbols/cooper.svg" },
      RYN: { name: "Ryan", payout: 18, image: "assets/symbols/ryan.svg" },
      STR: { name: "Sterling", payout: 25, image: "assets/symbols/sterling.svg" },
      TOL: { name: "Tree of Life Wild", payout: 60, image: "assets/symbols/tree-of-life.svg", wild: true },
    },
    reels: [
      ["CYD","GAB","KEN","ASH","COP","CYD","STR","GAB","KEN","TOL","ASH","COP","RYN","CYD","GAB","KEN","ASH","COP","CYD","TOL","STR","GAB","KEN","RYN"],
      ["GAB","ASH","CYD","KEN","COP","TOL","GAB","STR","CYD","ASH","RYN","COP","GAB","KEN","CYD","TOL","ASH","COP","STR","GAB","CYD","KEN","ASH","RYN"],
      ["KEN","CYD","COP","GAB","ASH","TOL","KEN","STR","CYD","COP","RYN","GAB","KEN","ASH","CYD","COP","TOL","GAB","STR","KEN","CYD","ASH","COP","RYN"],
    ],
    reelAnimation: {
      repeatCount: 11, baseCopy: 2, cycles: [3,4,5], durations: [1550,1900,2350], legacyDurations: [1900,2350,2800],
      finalApproachDuration: 105, stopOvershootRatio: 0.055, settleDuration: 150, impactClassDuration: 260, tickMinimumInterval: 58,
    },
    paytableOrder: ["KEN", "GAB", "CYD", "ASH", "COP", "RYN", "STR", "TOL"],
  };

  app.GAME_STATES = GAME_STATES;
  app.constants = { storageKey: "commune-fortune-v3", legacyStorageKeys: ["commune-fortune-v2", "commune-fortune-v1"] };
})();
