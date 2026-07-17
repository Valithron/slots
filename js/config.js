(() => {
  "use strict";

  const app = window.CommuneFortune = window.CommuneFortune || {};

  app.CONFIG = {
    startingCoins: 1000,
    paylines: [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
      [0, 1, 2],
      [2, 1, 0],
    ],
    lineBets: [1, 2, 5, 10],
    symbols: {
      CYD: { name: "Cydney", payout: 10, image: "assets/symbols/cydney.svg" },
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
      repeatCount: 7,
      baseCopy: 2,
      durations: [1900, 2350, 2800],
    },
    paytableOrder: ["KEN", "GAB", "CYD", "ASH", "COP", "RYN", "STR", "TOL"],
  };

  app.constants = {
    storageKey: "commune-fortune-v1",
  };
})();
