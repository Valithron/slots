#!/usr/bin/env node

import assert from "node:assert/strict";

await import("../js/config.js");
await import("../js/payouts.js");
await import("../js/game-flow.js");

const app = globalThis.CommuneFortune;
const { CONFIG, GAME_STATES, payouts, gameFlow } = app;

function testWinTierBoundaries() {
  CONFIG.lineBets.forEach((lineBet, lineBetIndex) => {
    const totalBet = lineBet * CONFIG.paylines.length;
    assert.equal(payouts.classifyWinTier(0, totalBet), "none");
    assert.equal(payouts.classifyWinTier(1, totalBet), "small");
    assert.equal(payouts.classifyWinTier(totalBet * 5 - 1, totalBet), "small");
    assert.equal(payouts.classifyWinTier(totalBet * 5, totalBet), "nice");
    assert.equal(payouts.classifyWinTier(totalBet * 15 - 1, totalBet), "nice");
    assert.equal(payouts.classifyWinTier(totalBet * 15, totalBet), "big");
    assert.equal(payouts.classifyWinTier(totalBet * 40 - 1, totalBet), "big");
    assert.equal(payouts.classifyWinTier(totalBet * 40, totalBet), "jackpot");

    const state = { lineBetIndex };
    assert.equal(payouts.getTotalBet(state), totalBet);
  });
}

function testAnticipationClassification() {
  const mild = {
    winTier: "small",
    originalMatrix: [
      ["STR", "STR", "GAB"],
      ["CYD", "KEN", "ASH"],
      ["RYN", "COP", "KEN"],
    ],
  };
  const none = {
    winTier: "none",
    originalMatrix: [
      ["STR", "CYD", "GAB"],
      ["CYD", "KEN", "ASH"],
      ["RYN", "COP", "KEN"],
    ],
  };
  const strong = { ...none, winTier: "nice" };

  assert.equal(payouts.classifyAnticipation(mild), "mild");
  assert.equal(payouts.classifyAnticipation(strong), "strong");
  assert.equal(payouts.classifyAnticipation(none), "none");
  assert.equal(payouts.classifyAnticipation(strong, { enabled: false }), "none");
}

function testFeatureFlagsDisabled() {
  const result = { totalWin: 500, winTier: "big" };
  assert.equal(gameFlow.getPresentationTier(result, false), "small");
  assert.equal(gameFlow.getPresentationTier({ totalWin: 0, winTier: "none" }, false), "none");
}

function testSkipDoesNotSpin() {
  let spins = 0;
  let skips = 0;
  const action = gameFlow.routePrimaryAction({
    phase: GAME_STATES.CELEBRATING,
    onSpin: () => { spins += 1; },
    onSkip: () => { skips += 1; },
  });

  assert.equal(action, "skipped");
  assert.equal(skips, 1);
  assert.equal(spins, 0);

  assert.equal(gameFlow.routePrimaryAction({
    phase: GAME_STATES.SPINNING,
    onSpin: () => { spins += 1; },
    onSkip: () => { skips += 1; },
  }), "ignored");
  assert.equal(spins, 0);
  assert.equal(skips, 1);
}

function testCountUpFinalAmount() {
  const state = { lineBetIndex: 3 };
  const result = payouts.createSpinResult({ targetStops: [6, 7, 7], state, id: "count-up-test" });
  assert.equal(gameFlow.getCountUpValue(result.totalWin, 1), result.totalWin);
  assert.equal(gameFlow.getCountUpValue(result.totalWin, 1.5), result.totalWin);
}

function testAuthoritativeResultStoresPresentationData() {
  CONFIG.lineBets.forEach((_, lineBetIndex) => {
    const result = payouts.createSpinResult({
      targetStops: [0, 0, 0],
      state: { lineBetIndex },
      id: `tier-${lineBetIndex}`,
    });
    assert.ok(["none", "small", "nice", "big", "jackpot"].includes(result.winTier));
    assert.ok(["none", "mild", "strong"].includes(result.anticipation));
    assert.equal(result.wager, payouts.getTotalBet({ lineBetIndex }));
  });
}

testWinTierBoundaries();
testAnticipationClassification();
testFeatureFlagsDisabled();
testSkipDoesNotSpin();
testCountUpFinalAmount();
testAuthoritativeResultStoresPresentationData();

console.log("Presentation tests: PASS");
