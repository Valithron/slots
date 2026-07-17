#!/usr/bin/env node
import assert from "node:assert/strict";
await import("../js/config.js");
await import("../js/payouts.js");
await import("../js/game-flow.js");
await import("../js/reels.js");

const app = globalThis.CommuneFortune;
const { CONFIG, GAME_STATES, payouts, gameFlow, reels } = app;
const baseFlags = { ...CONFIG.features, expandingWilds: false, combinationBonuses: false, fortuneMeter: false, spinDrama: true };

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
    assert.equal(payouts.getTotalBet({ lineBetIndex }), totalBet);
  });
}

function testAnticipationClassification() {
  const mild = { winTier: "small", originalMatrix: [["STR","STR","GAB"],["CYD","KEN","ASH"],["RYN","COP","KEN"]] };
  const none = { winTier: "none", originalMatrix: [["STR","CYD","GAB"],["CYD","KEN","ASH"],["RYN","COP","KEN"]] };
  assert.equal(payouts.classifyAnticipation(mild), "mild");
  assert.equal(payouts.classifyAnticipation({ ...none, winTier: "nice" }), "strong");
  assert.equal(payouts.classifyAnticipation(none), "none");
  assert.equal(payouts.classifyAnticipation({ ...none, winTier: "nice" }, { enabled: false }), "none");
}

function testFeatureFlagsDisabledForPresentation() {
  assert.equal(gameFlow.getPresentationTier({ totalWin: 500, winTier: "big" }, false), "small");
  assert.equal(gameFlow.getPresentationTier({ totalWin: 0, winTier: "none" }, false), "none");
}

function testPrimaryActionRouting() {
  let spins = 0;
  let stops = 0;
  let skips = 0;
  const actions = {
    onSpin: () => { spins += 1; },
    onStop: () => { stops += 1; return true; },
    onSkip: () => { skips += 1; },
  };

  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.IDLE, manualStopsEnabled: true, ...actions }), "spun");
  assert.deepEqual({ spins, stops, skips }, { spins: 1, stops: 0, skips: 0 });
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.SPINNING, manualStopsEnabled: true, ...actions }), "stop-requested");
  assert.deepEqual({ spins, stops, skips }, { spins: 1, stops: 1, skips: 0 });
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.SPINNING, manualStopsEnabled: false, ...actions }), "ignored");
  assert.deepEqual({ spins, stops, skips }, { spins: 1, stops: 1, skips: 0 });
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.CELEBRATING, manualStopsEnabled: true, ...actions }), "skipped");
  assert.deepEqual({ spins, stops, skips }, { spins: 1, stops: 1, skips: 1 });
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.RESOLVING, manualStopsEnabled: true, ...actions }), "ignored");
  assert.deepEqual({ spins, stops, skips }, { spins: 1, stops: 1, skips: 1 });
}

function testPrimaryActionLabels() {
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.IDLE, manualStopsEnabled: true }), "spin");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.SPINNING, manualStopsEnabled: true, nextStopIndex: 0 }), "stop");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.SPINNING, manualStopsEnabled: true, nextStopIndex: null }), "stop-disabled");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.CELEBRATING, manualStopsEnabled: true }), "skip");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.RESOLVING, manualStopsEnabled: true }), "disabled");
  assert.equal(gameFlow.getStopAriaLabel(0), "Stop reel 1");
  assert.equal(gameFlow.getStopAriaLabel(1), "Stop reel 2");
  assert.equal(gameFlow.getStopAriaLabel(2), "Stop reel 3");
  assert.equal(gameFlow.getStopAriaLabel(null), "All reel stops requested");
}

function testManualStopQueueAndOrder() {
  const controller = reels.createManualStopState({ enabled: true });
  controller.begin(1000);
  const first = controller.requestNextStop(1010);
  const second = controller.requestNextStop(1020);
  const third = controller.requestNextStop(1030);
  const fourth = controller.requestNextStop(1040);
  assert.deepEqual([first.reelIndex, second.reelIndex, third.reelIndex], [0, 1, 2]);
  assert.equal(first.queued, true);
  assert.equal(second.queued, true);
  assert.equal(third.queued, true);
  assert.equal(fourth.accepted, false);
  assert.equal(controller.snapshot().requestedStops, 3);
  assert.equal(controller.snapshot().queuedStops, 3);
}

function testOneInputRequestsOnlyOneReel() {
  const controller = reels.createManualStopState({ enabled: true });
  controller.begin(0);
  const before = controller.snapshot();
  const response = controller.requestNextStop(700);
  const after = controller.snapshot();
  assert.equal(response.accepted, true);
  assert.equal(after.requestedStops - before.requestedStops, 1);
  assert.equal(after.reels.filter(reel => reel.requested).length, 1);
}

function testMinimumTimesAndGaps() {
  const controller = reels.createManualStopState({
    enabled: true,
    minimumStopTimes: [650, 900, 1150],
    minimumGapBetweenStops: 180,
  });
  controller.begin(1000);
  assert.equal(controller.getEarliestStopTime(0), 1650);
  assert.equal(controller.getEarliestStopTime(1), Number.POSITIVE_INFINITY);
  controller.markCompleted(0, 1700);
  assert.equal(controller.getEarliestStopTime(1), 1900);
  controller.markCompleted(1, 2010);
  assert.equal(controller.getEarliestStopTime(2), 2190);
}

function testAutomaticStopSkipsResolvedReel() {
  const controller = reels.createManualStopState({ enabled: true });
  controller.begin(0);
  controller.markStatus(0, "approaching");
  controller.markCompleted(0, 1600);
  const request = controller.requestNextStop(1700);
  assert.equal(request.accepted, true);
  assert.equal(request.reelIndex, 1);
}

function testDisabledManualStops() {
  const controller = reels.createManualStopState({ enabled: false });
  controller.begin(0);
  assert.deepEqual(controller.requestNextStop(1000), { accepted: false, reelIndex: null, reason: "disabled" });
  assert.equal(controller.snapshot().requestedStops, 0);
}

function testManualStopsCannotAffectMath() {
  const targetStops = [7, 4, 5];
  const state = { lineBetIndex: 0, fortuneMeter: { value: 100, charged: true } };
  const common = {
    targetStops,
    state,
    id: "manual-invariance",
    createdAt: "simulation",
    featureRolls: { expandingWild: { roll: 0 } },
  };
  const automatic = payouts.createSpinResult({ ...common, featureFlags: { ...CONFIG.features, manualStops: false } });
  const manual = payouts.createSpinResult({ ...common, featureFlags: { ...CONFIG.features, manualStops: true } });
  assert.deepEqual(manual.targetStops, automatic.targetStops);
  assert.deepEqual(manual.originalMatrix, automatic.originalMatrix);
  assert.deepEqual(manual.resolvedMatrix, automatic.resolvedMatrix);
  assert.deepEqual(manual.featureRolls, automatic.featureRolls);
  assert.deepEqual(manual.transformations, automatic.transformations);
  assert.deepEqual(manual.lineWins, automatic.lineWins);
  assert.deepEqual(manual.combinationWins, automatic.combinationWins);
  assert.deepEqual(manual.fortuneMeterAward, automatic.fortuneMeterAward);
  assert.equal(manual.totalWin, automatic.totalWin);
  assert.equal(manual.winTier, automatic.winTier);
}

function testAnticipationMinimumHolds() {
  const normal = CONFIG.manualStops.anticipationMinimumHold;
  const reduced = CONFIG.manualStops.reducedMotionAnticipationHold;
  assert.ok(normal.mild > 0);
  assert.ok(normal.strong > normal.mild);
  assert.ok(reduced.mild > 0);
  assert.ok(reduced.strong > reduced.mild);
  assert.ok(reduced.mild < normal.mild);
  assert.ok(reduced.strong < normal.strong);
}

function testTransformParser() {
  assert.equal(reels.parseTranslateY("translate3d(0, -123.5px, 0)"), -123.5);
  assert.equal(reels.parseTranslateY("matrix(1, 0, 0, 1, 0, -88)"), -88);
  assert.equal(reels.parseTranslateY("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,-77,0,1)"), -77);
  assert.equal(reels.parseTranslateY("none", -5), -5);
}

function testCountUpFinalAmount() {
  const result = payouts.createSpinResult({ targetStops: [6,7,7], state: { lineBetIndex: 3 }, id: "count-up-test", featureFlags: baseFlags });
  assert.equal(gameFlow.getCountUpValue(result.totalWin, 1), result.totalWin);
  assert.equal(gameFlow.getCountUpValue(result.totalWin, 1.5), result.totalWin);
}

function testAuthoritativeResultStoresPresentationData() {
  CONFIG.lineBets.forEach((_, lineBetIndex) => {
    const result = payouts.createSpinResult({ targetStops: [0,0,0], state: { lineBetIndex }, id: `tier-${lineBetIndex}`, featureFlags: baseFlags });
    assert.ok(["none","small","nice","big","jackpot"].includes(result.winTier));
    assert.ok(["none","mild","strong"].includes(result.anticipation));
    assert.equal(result.wager, payouts.getTotalBet({ lineBetIndex }));
  });
}

const tests = [
  testWinTierBoundaries,
  testAnticipationClassification,
  testFeatureFlagsDisabledForPresentation,
  testPrimaryActionRouting,
  testPrimaryActionLabels,
  testManualStopQueueAndOrder,
  testOneInputRequestsOnlyOneReel,
  testMinimumTimesAndGaps,
  testAutomaticStopSkipsResolvedReel,
  testDisabledManualStops,
  testManualStopsCannotAffectMath,
  testAnticipationMinimumHolds,
  testTransformParser,
  testCountUpFinalAmount,
  testAuthoritativeResultStoresPresentationData,
];
tests.forEach(test => test());
console.log(`Presentation tests: PASS (${tests.length} groups)`);
