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
    expandingWilds: false,
    scatters: false,
    freeSpins: false,
    momentumMeter: false,
    dailyRewards: false,
    advancedAudio: false,
    manualStops: false,
    riskGame: false,
    mysteryModifiers: false,
    combinationBonuses: false,
    secretEvents: false,
  });

  app.CONFIG = {
    schemaVersion: 2,
    startingCoins: 1000,
    rowCount: 3,
    rtpTargets: {
      base: { minimum: 0.82, maximum: 0.83 },
      total: { minimum: 0.96, maximum: 0.97 },
    },
    features: FEATURES,
    winTiers: {
      thresholds: {
        nice: 5,
        big: 15,
        jackpot: 40,
      },
      celebrationDurations: {
        nice: 2400,
        big: 3400,
        jackpot: 4600,
      },
      countUpDurations: {
        nice: 1500,
        big: 2400,
        jackpot: 3400,
      },
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
    anticipation: {
      delays: {
        none: 0,
        mild: 350,
        strong: 650,
      },
    },
    characterAccentColors: [
      "#d3d8e8",
      "#86a66a",
      "#a276ff",
      "#89d2ff",
      "#e0aa3e",
      "#65e6cc",
      "#ff7fba",
    ],
    paylines: [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
      [0, 1, 2],
      [2, 1, 0],
    ],
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
      // The longest path ends before copy 8; copies 8-10 remain a safety buffer.
      repeatCount: 11,
      baseCopy: 2,
      cycles: [3, 4, 5],
      durations: [1550, 1900, 2350],
      legacyDurations: [1900, 2350, 2800],
      finalApproachDuration: 105,
      stopOvershootRatio: 0.055,
      settleDuration: 150,
      impactClassDuration: 260,
      tickMinimumInterval: 58,
    },
    paytableOrder: ["KEN", "GAB", "CYD", "ASH", "COP", "RYN", "STR", "TOL"],
  };

  app.GAME_STATES = GAME_STATES;
  app.constants = {
    storageKey: "commune-fortune-v2",
    legacyStorageKeys: ["commune-fortune-v1"],
  };
})();
