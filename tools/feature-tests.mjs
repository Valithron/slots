#!/usr/bin/env node
import assert from "node:assert/strict";
await import("../js/config.js");
await import("../js/payouts.js");
await import("../js/game-flow.js");
await import("../js/persistence.js");
const { CONFIG, payouts, gameFlow, persistence } = globalThis.CommuneFortune;

const state = { lineBetIndex: 0 };
const flags = (wild, combinations) => ({ ...CONFIG.features, expandingWilds: wild, combinationBonuses: combinations, spinDrama: true });
const matrix = rows => rows.map(row => [...row]);

function findStops(predicate) {
  for (let a = 0; a < CONFIG.reels[0].length; a += 1) for (let b = 0; b < CONFIG.reels[1].length; b += 1) for (let c = 0; c < CONFIG.reels[2].length; c += 1) {
    const stops = [a,b,c];
    if (predicate(payouts.matrixFromStops(stops), stops)) return stops;
  }
  throw new Error("No matching reel stops found for deterministic test.");
}

function testTreeEligibilityAndRolls() {
  const noncenter = matrix([["TOL","STR","CYD"],["GAB","KEN","ASH"],["COP","RYN","STR"]]);
  const center = matrix([["STR","CYD","GAB"],["ASH","TOL","KEN"],["COP","RYN","STR"]]);
  assert.equal(payouts.isExpandingWildEligible(noncenter), false);
  assert.equal(payouts.isExpandingWildEligible(center), true);
  assert.equal(payouts.createExpandingWildRoll(center, { storedRoll: 0 }).activated, true);
  [1,2,3].forEach(roll => assert.equal(payouts.createExpandingWildRoll(center, { storedRoll: roll }).activated, false));
  assert.equal(payouts.createExpandingWildRoll(center, { enabled: false, storedRoll: 0 }).activated, false);
}

function testTreeTransformationAndPaylines() {
  const original = matrix([["STR","CYD","STR"],["GAB","TOL","GAB"],["KEN","ASH","KEN"]]);
  const snapshot = JSON.stringify(original);
  const roll = payouts.createExpandingWildRoll(original, { storedRoll: 0 });
  const { resolvedMatrix, transformations } = payouts.applyExpandingWild(original, roll);
  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(resolvedMatrix, [["STR","TOL","STR"],["GAB","TOL","GAB"],["KEN","TOL","KEN"]]);
  assert.deepEqual(resolvedMatrix.map(row => row[0]), original.map(row => row[0]));
  assert.deepEqual(resolvedMatrix.map(row => row[2]), original.map(row => row[2]));
  assert.equal(transformations.length, 1);
  const wins = payouts.evaluateWins(resolvedMatrix, state);
  assert.equal(wins.length, 3);
  assert.deepEqual(wins.map(win => win.symbolKey).sort(), ["GAB","KEN","STR"]);
  assert.equal(payouts.evaluateLine(["TOL","TOL","TOL"]).symbolKey, "TOL");
}

function testStoredRollReproductionAndReloadSafety() {
  const stops = findStops(grid => grid[1][1] === "TOL");
  const first = payouts.createSpinResult({ targetStops: stops, state, id: "first", featureFlags: flags(true, false), featureRolls: { expandingWild: { roll: 0 } } });
  const replay = payouts.createSpinResult({ targetStops: first.targetStops, state, id: first.id, createdAt: first.createdAt, featureFlags: flags(true, false), featureRolls: first.featureRolls, rng: () => { throw new Error("RNG should not be called"); } });
  assert.deepEqual(replay.featureRolls, first.featureRolls);
  assert.deepEqual(replay.resolvedMatrix, first.resolvedMatrix);
  const saved = JSON.parse(JSON.stringify(first));
  assert.equal(saved.featureRolls.expandingWild.activated, true);
  assert.deepEqual(saved.originalMatrix, first.originalMatrix);
}

function testNamedCombinations() {
  CONFIG.combinations.definitions.forEach(definition => {
    const original = matrix([["STR","CYD","GAB"], definition.sequence, ["KEN","ASH","COP"]]);
    const wins = payouts.detectCombinationMatches(original, { enabled: true });
    assert.equal(wins.length, 1);
    assert.equal(wins[0].id, definition.id);
    const reversed = matrix([["STR","CYD","GAB"], [...definition.sequence].reverse(), ["KEN","ASH","COP"]]);
    assert.equal(payouts.detectCombinationMatches(reversed, { enabled: true }).length, 0);
    const top = matrix([definition.sequence, ["STR","CYD","GAB"], ["KEN","ASH","COP"]]);
    assert.equal(payouts.detectCombinationMatches(top, { enabled: true }).length, 0);
    const bottom = matrix([["STR","CYD","GAB"], ["KEN","ASH","COP"], definition.sequence]);
    assert.equal(payouts.detectCombinationMatches(bottom, { enabled: true }).length, 0);
  });
  const diagonal = matrix([["STR","ASH","KEN"],["COP","CYD","GAB"],["RYN","KEN","TOL"]]);
  assert.equal(payouts.detectCombinationMatches(diagonal, { enabled: true }).length, 0);
}

function testTransformedTreesDoNotCreateCombination() {
  const original = matrix([["STR","CYD","ASH"],["STR","TOL","CYD"],["GAB","KEN","COP"]]);
  const resolved = payouts.applyExpandingWild(original, payouts.createExpandingWildRoll(original, { storedRoll: 0 })).resolvedMatrix;
  assert.equal(resolved[0][1], "TOL");
  assert.equal(payouts.detectCombinationMatches(original, { enabled: true }).length, 0);
}

function fullCommuneMatrix() {
  return matrix([["STR","CYD","RYN"],["GAB","TOL","COP"],["KEN","ASH","STR"]]);
}

function testFullCommuneRequirementsAndPriority() {
  const full = fullCommuneMatrix();
  const win = payouts.detectCombinationMatches(full, { enabled: true });
  assert.equal(win.length, 1); assert.equal(win[0].id, "full-commune");
  const missingMember = matrix([["STR","CYD","RYN"],["GAB","TOL","COP"],["KEN","STR","STR"]]);
  assert.equal(payouts.detectCombinationMatches(missingMember, { enabled: true }).length, 0);
  const missingTree = matrix([["STR","CYD","RYN"],["GAB","ASH","COP"],["KEN","ASH","STR"]]);
  assert.equal(payouts.detectCombinationMatches(missingTree, { enabled: true }).length, 0);
  const offCenterTree = matrix([["TOL","CYD","RYN"],["GAB","STR","COP"],["KEN","ASH","STR"]]);
  assert.equal(payouts.detectCombinationMatches(offCenterTree, { enabled: true }).length, 0);
  const overlappingLesser = matrix([["RYN","GAB","STR"],["STR","CYD","TOL"],["KEN","ASH","COP"]]);
  assert.equal(payouts.detectCombinationMatches(overlappingLesser, { enabled: true })[0].id, "kps");
  assert.equal(win.some(item => item.id === "kps"), false);
}

function testPayoutScalingAndStacking() {
  CONFIG.combinations.definitions.forEach(definition => {
    CONFIG.lineBets.forEach((lineBet, lineBetIndex) => {
      const matches = [{ ...definition, symbols: definition.sequence, cells: definition.sequence.map((_, reel) => ({ row: 1, reel })) }];
      const [award] = payouts.calculateCombinationWins(matches, { lineBetIndex });
      assert.equal(award.payout, definition.multiplier * lineBet);
    });
  });
  CONFIG.lineBets.forEach((lineBet, lineBetIndex) => {
    const full = CONFIG.combinations.fullCommune;
    const [award] = payouts.calculateCombinationWins([{ ...full, symbols: [], cells: [] }], { lineBetIndex });
    assert.equal(award.payout, full.multiplier * lineBet * CONFIG.paylines.length);
  });

  const comboStops = findStops(grid => CONFIG.combinations.definitions.some(def => def.sequence.every((key, index) => grid[1][index] === key)) && payouts.evaluateWins(grid, state).length > 0);
  const result = payouts.createSpinResult({ targetStops: comboStops, state, id: "stack", featureFlags: flags(false, true) });
  assert.ok(result.lineWinTotal > 0);
  assert.ok(result.combinationWinTotal > 0);
  assert.equal(result.totalWin, result.lineWinTotal + result.combinationWinTotal);
}

function testResultTotalsTierCountUpAndSettlement() {
  const stops = findStops(grid => grid[1][1] === "TOL");
  const result = payouts.createSpinResult({ targetStops: stops, state, id: "totals", featureFlags: flags(true, true), featureRolls: { expandingWild: { roll: 0 } } });
  assert.equal(result.lineWinTotal, result.lineWins.reduce((sum, win) => sum + win.payout, 0));
  assert.equal(result.combinationWinTotal, result.combinationWins.reduce((sum, win) => sum + win.payout, 0));
  assert.equal(result.totalWin, result.lineWinTotal + result.combinationWinTotal);
  assert.equal(result.winTier, payouts.classifyWinTier(result.totalWin, result.wager));
  assert.equal(gameFlow.getCountUpValue(result.totalWin, 1), result.totalWin);
  const savedState = { coins: 100, lastWin: 0, pendingSpin: JSON.parse(JSON.stringify(result)) };
  const settled = payouts.settlePendingSpinState(savedState);
  assert.equal(savedState.coins, 100 + result.totalWin);
  assert.equal(savedState.lastWin, result.totalWin);
  assert.equal(settled.totalWin, result.totalWin);
  assert.equal(payouts.settlePendingSpinState(savedState), null);
  assert.equal(savedState.coins, 100 + result.totalWin);
}

function testFeatureFlagConfigurations() {
  const wildStops = findStops(grid => grid[1][1] === "TOL");
  const comboStops = findStops(grid => CONFIG.combinations.definitions.some(definition => definition.sequence.every((key, index) => grid[1][index] === key)));
  const configurations = [[false,false],[true,false],[false,true],[true,true]];
  configurations.forEach(([wild, combinations]) => {
    const wildResult = payouts.createSpinResult({ targetStops: wildStops, state, id: `wild-${wild}-${combinations}`, featureFlags: flags(wild, combinations), featureRolls: { expandingWild: { roll: 0 } } });
    const comboResult = payouts.createSpinResult({ targetStops: comboStops, state, id: `combo-${wild}-${combinations}`, featureFlags: flags(wild, combinations), featureRolls: { expandingWild: { roll: 1 } } });
    assert.equal(wildResult.featureRolls.expandingWild.activated, wild);
    assert.equal(comboResult.combinationWins.length, combinations ? 1 : 0);
  });
}

function testCombinationCanElevateTierAndAnticipation() {
  const base = payouts.createSpinResult({ targetStops: [4,14,10], state, id: "full-base", featureFlags: flags(false, false), featureRolls: { expandingWild: { roll: 1 } } });
  const combined = payouts.createSpinResult({ targetStops: [4,14,10], state, id: "full-combined", featureFlags: flags(false, true), featureRolls: { expandingWild: { roll: 1 } } });
  assert.equal(base.winTier, "none");
  assert.equal(combined.combinationWins[0].id, "full-commune");
  assert.equal(combined.totalWin, 25);
  assert.equal(combined.winTier, "nice");
  assert.equal(combined.anticipation, "strong");
}

function testPersistencePreservesAuthoritativeFeatureData() {
  const result = payouts.createSpinResult({ targetStops: [4,14,10], state, id: "persisted-feature", featureFlags: flags(true, true), featureRolls: { expandingWild: { roll: 0 } } });
  const normalized = persistence.normalizePendingSpin(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(normalized.featureRolls, result.featureRolls);
  assert.deepEqual(normalized.originalMatrix, result.originalMatrix);
  assert.deepEqual(normalized.resolvedMatrix, result.resolvedMatrix);
  assert.deepEqual(normalized.transformations, result.transformations);
  assert.deepEqual(normalized.combinationWins, result.combinationWins);
  assert.equal(normalized.settlementStatus, "pending");
  assert.equal(persistence.normalizePendingSpin({ ...result, settlementStatus: "settled" }), null);
}

testTreeEligibilityAndRolls();
testTreeTransformationAndPaylines();
testStoredRollReproductionAndReloadSafety();
testNamedCombinations();
testTransformedTreesDoNotCreateCombination();
testFullCommuneRequirementsAndPriority();
testPayoutScalingAndStacking();
testResultTotalsTierCountUpAndSettlement();
testFeatureFlagConfigurations();
testCombinationCanElevateTierAndAnticipation();
testPersistencePreservesAuthoritativeFeatureData();
console.log("Feature tests: PASS");
