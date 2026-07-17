#!/usr/bin/env node
import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: key => { storage.delete(key); },
  clear: () => storage.clear(),
};

await import("../js/config.js");
await import("../js/payouts.js");
await import("../js/game-flow.js");
await import("../js/persistence.js");
const { CONFIG, constants, payouts, gameFlow, persistence } = globalThis.CommuneFortune;

const state = (overrides = {}) => ({ lineBetIndex: 0, fortuneMeter: { value: 0, charged: false }, ...overrides });
const flags = (wild = true, combinations = true, fortuneMeter = true) => ({
  ...CONFIG.features,
  expandingWilds: wild,
  combinationBonuses: combinations,
  fortuneMeter,
  spinDrama: true,
});
const matrix = rows => rows.map(row => [...row]);

function findStops(predicate, featureFlags = flags()) {
  for (let a = 0; a < CONFIG.reels[0].length; a += 1) {
    for (let b = 0; b < CONFIG.reels[1].length; b += 1) {
      for (let c = 0; c < CONFIG.reels[2].length; c += 1) {
        for (let roll = 0; roll < CONFIG.expandingWild.outcomes; roll += 1) {
          const targetStops = [a, b, c];
          const result = payouts.createSpinResult({
            targetStops,
            state: state(),
            id: "search",
            createdAt: "search",
            featureFlags,
            featureRolls: { expandingWild: { roll } },
          });
          if (predicate(result, targetStops, roll)) return { targetStops, roll, result };
        }
      }
    }
  }
  throw new Error("No matching reel stops found for deterministic test.");
}

function resultFor(targetStops, { roll = 1, meter = { value: 0, charged: false }, featureFlags = flags(), id = "test" } = {}) {
  return payouts.createSpinResult({
    targetStops,
    state: state({ fortuneMeter: meter }),
    id,
    createdAt: "test",
    featureFlags,
    featureRolls: { expandingWild: { roll } },
  });
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
  assert.equal(transformations.length, 1);
  assert.equal(payouts.evaluateWins(resolvedMatrix, state()).length, 3);
  assert.equal(payouts.evaluateLine(["TOL","TOL","TOL"]).symbolKey, "TOL");
}

function testStoredRollReproductionAndReloadSafety() {
  const { targetStops } = findStops(result => result.originalMatrix[1][1] === "TOL", flags(true, false, false));
  const first = resultFor(targetStops, { roll: 0, featureFlags: flags(true, false, false), id: "first" });
  const replay = payouts.createSpinResult({
    targetStops: first.targetStops,
    state: state(),
    id: first.id,
    createdAt: first.createdAt,
    featureFlags: flags(true, false, false),
    featureRolls: first.featureRolls,
    rng: () => { throw new Error("RNG should not be called"); },
  });
  assert.deepEqual(replay.featureRolls, first.featureRolls);
  assert.deepEqual(replay.resolvedMatrix, first.resolvedMatrix);
}

function testNamedCombinations() {
  CONFIG.combinations.definitions.forEach(definition => {
    const original = matrix([["STR","CYD","GAB"], definition.sequence, ["KEN","ASH","COP"]]);
    const wins = payouts.detectCombinationMatches(original, { enabled: true });
    assert.equal(wins.length, 1);
    assert.equal(wins[0].id, definition.id);
    const reversed = matrix([["STR","CYD","GAB"], [...definition.sequence].reverse(), ["KEN","ASH","COP"]]);
    assert.equal(payouts.detectCombinationMatches(reversed, { enabled: true }).length, 0);
  });
}

function fullCommuneMatrix() {
  return matrix([["STR","CYD","RYN"],["GAB","TOL","COP"],["KEN","ASH","STR"]]);
}

function testFullCommuneRequirementsAndPriority() {
  const full = payouts.detectCombinationMatches(fullCommuneMatrix(), { enabled: true });
  assert.equal(full.length, 1);
  assert.equal(full[0].id, "full-commune");
  const missingMember = matrix([["STR","CYD","RYN"],["GAB","TOL","COP"],["KEN","STR","STR"]]);
  assert.equal(payouts.detectCombinationMatches(missingMember, { enabled: true }).length, 0);
}

function testPayoutScalingAndStacking() {
  CONFIG.combinations.definitions.forEach(definition => {
    CONFIG.lineBets.forEach((lineBet, lineBetIndex) => {
      const matches = [{ ...definition, symbols: definition.sequence, cells: definition.sequence.map((_, reel) => ({ row: 1, reel })) }];
      const [award] = payouts.calculateCombinationWins(matches, { lineBetIndex });
      assert.equal(award.payout, definition.multiplier * lineBet);
    });
  });
  const found = findStops(result => result.lineWinTotal > 0 && result.combinationWinTotal > 0, flags(false, true, false));
  assert.equal(found.result.totalWin, found.result.lineWinTotal + found.result.combinationWinTotal);
}

function testResultTotalsTierCountUpAndSettlement() {
  const found = findStops(result => result.originalMatrix[1][1] === "TOL", flags(true, true, false));
  const result = resultFor(found.targetStops, { roll: 0, featureFlags: flags(true, true, false), id: "totals" });
  assert.equal(result.lineWinTotal, result.lineWins.reduce((sum, win) => sum + win.payout, 0));
  assert.equal(result.combinationWinTotal, result.combinationWins.reduce((sum, win) => sum + win.payout, 0));
  assert.equal(result.preModifierWin, result.lineWinTotal + result.combinationWinTotal);
  assert.equal(result.totalWin, result.preModifierWin);
  assert.equal(result.winTier, payouts.classifyWinTier(result.totalWin, result.wager));
  assert.equal(gameFlow.getCountUpValue(result.totalWin, 1), result.totalWin);
  const savedState = { coins: 100, lastWin: 0, fortuneMeter: { value: 0, charged: false }, pendingSpin: structuredClone(result) };
  const settled = payouts.settlePendingSpinState(savedState);
  assert.equal(savedState.coins, 100 + result.totalWin);
  assert.equal(savedState.lastWin, result.totalWin);
  assert.equal(settled.totalWin, result.totalWin);
  assert.equal(payouts.settlePendingSpinState(savedState), null);
}

function testFeatureFlagConfigurations() {
  const wild = findStops(result => result.originalMatrix[1][1] === "TOL", flags(false, false, false));
  const combo = findStops(result => result.combinationWins.length > 0, flags(false, true, false));
  [[false,false],[true,false],[false,true],[true,true]].forEach(([wildEnabled, combinationEnabled]) => {
    const wildResult = resultFor(wild.targetStops, { roll: 0, featureFlags: flags(wildEnabled, combinationEnabled, false) });
    const comboResult = resultFor(combo.targetStops, { roll: combo.roll, featureFlags: flags(wildEnabled, combinationEnabled, false) });
    assert.equal(wildResult.featureRolls.expandingWild.activated, wildEnabled);
    assert.equal(comboResult.combinationWins.length, combinationEnabled ? 1 : 0);
  });
}

function testFortuneStateNormalizationAndMigration() {
  assert.deepEqual(persistence.normalizeFortuneMeter(null), { value: 0, charged: false });
  assert.deepEqual(persistence.normalizeFortuneMeter({ value: -20, charged: true }), { value: 0, charged: false });
  assert.deepEqual(persistence.normalizeFortuneMeter({ value: 101, charged: false }), { value: 100, charged: true });
  assert.deepEqual(persistence.normalizeFortuneMeter({ value: 100, charged: false }), { value: 100, charged: true });

  storage.clear();
  assert.deepEqual(persistence.loadState().fortuneMeter, { value: 0, charged: false });
  storage.set(constants.legacyStorageKeys[0], JSON.stringify({ coins: 500, lineBetIndex: 1, sound: true, lastWin: 0 }));
  assert.deepEqual(persistence.loadState().fortuneMeter, { value: 0, charged: false });
}

function testFortuneGainRules() {
  const loss = findStops(result => result.preModifierWin === 0 && result.combinationWins.length === 0);
  assert.deepEqual(loss.result.fortuneMeterAward, { paidSpinPoints: 2, tierPoints: 0, combinationPoints: 0, jackpotCharge: false, totalPoints: 2 });

  const small = findStops(result => result.naturalWinTier === "small" && result.combinationWins.length === 0);
  assert.equal(small.result.fortuneMeterAward.totalPoints, 3);
  const nice = findStops(result => result.naturalWinTier === "nice" && result.combinationWins.length === 0);
  assert.equal(nice.result.fortuneMeterAward.totalPoints, 5);
  const big = findStops(result => result.naturalWinTier === "big" && result.combinationWins.length === 0);
  assert.equal(big.result.fortuneMeterAward.totalPoints, 10);

  const standardCombo = findStops(result => result.combinationWins[0] && result.combinationWins[0].id !== "full-commune");
  assert.equal(standardCombo.result.fortuneMeterAward.combinationPoints, 3);
  assert.equal(standardCombo.result.fortuneMeterAward.totalPoints,
    standardCombo.result.fortuneMeterAward.paidSpinPoints + standardCombo.result.fortuneMeterAward.tierPoints + 3);

  const full = resultFor([4,14,10], { roll: 1 });
  assert.equal(full.combinationWins[0].id, "full-commune");
  assert.equal(full.fortuneMeterAward.combinationPoints, 10);
  assert.equal(full.fortuneMeterAward.totalPoints, 15);

  const jackpot = payouts.createFortuneMeterAward({ naturalWinTier: "jackpot", combinationWins: [], enabled: true });
  assert.equal(jackpot.jackpotCharge, true);
  const jackpotState = state({ fortuneMeter: { value: 1, charged: false } });
  payouts.applyFortuneMeterAward(jackpotState, jackpot);
  assert.deepEqual(jackpotState.fortuneMeter, { value: 100, charged: true });
}

function testFortuneMeterCapAndPersistence() {
  const meterState = state({ fortuneMeter: { value: 99, charged: false } });
  payouts.applyFortuneMeterAward(meterState, { totalPoints: 15, jackpotCharge: false });
  assert.deepEqual(meterState.fortuneMeter, { value: 100, charged: true });
  assert.equal(meterState.fortuneMeter.value, 100);

  storage.clear();
  persistence.saveState({ ...persistence.defaultState(), fortuneMeter: { value: 100, charged: true } });
  assert.deepEqual(persistence.loadState().fortuneMeter, { value: 100, charged: true });
}

function testFortuneSpinConsumptionAndMultiplier() {
  const loss = findStops(result => result.preModifierWin === 0, flags(true, true, false));
  const chargedState = state({ coins: 1000, lastWin: 0, fortuneMeter: { value: 100, charged: true } });
  const losingFortune = payouts.createSpinResult({
    targetStops: loss.targetStops,
    state: chargedState,
    id: "losing-fortune",
    createdAt: "test",
    featureFlags: flags(true, true, true),
    featureRolls: { expandingWild: { roll: loss.roll } },
  });
  assert.equal(losingFortune.fortuneSpin.active, true);
  assert.equal(losingFortune.totalWin, 0);
  assert.equal(payouts.consumeFortuneChargeState(chargedState, losingFortune), true);
  assert.deepEqual(chargedState.fortuneMeter, { value: 0, charged: false });
  chargedState.pendingSpin = losingFortune;
  payouts.settlePendingSpinState(chargedState);
  assert.deepEqual(chargedState.fortuneMeter, { value: 2, charged: false });

  const odd = findStops(result => result.preModifierWin > 0 && result.preModifierWin % 2 === 1, flags(true, true, false));
  const active = resultFor(odd.targetStops, { roll: odd.roll, meter: { value: 100, charged: true }, id: "active" });
  assert.equal(active.totalWin, Math.floor(active.preModifierWin * 1.5));
  assert.equal(active.fortuneBonus, active.totalWin - active.preModifierWin);
  assert.equal(active.modifiers.length, 1);
  assert.deepEqual(active.modifiers[0], {
    id: "fortune-spin",
    name: "Fortune Spin",
    multiplier: 1.5,
    baseWin: active.preModifierWin,
    bonusWin: active.fortuneBonus,
    finalWin: active.totalWin,
  });
}

function testFinalTierAndNaturalMeterTierSeparation() {
  const elevated = findStops(result => {
    const active = resultFor(result.targetStops, { roll: result.featureRolls.expandingWild.roll, meter: { value: 100, charged: true } });
    return active.naturalWinTier !== active.winTier;
  }, flags(true, true, false));
  const active = resultFor(elevated.targetStops, { roll: elevated.roll, meter: { value: 100, charged: true } });
  assert.notEqual(active.naturalWinTier, active.winTier);
  assert.equal(active.finalWinTier, active.winTier);
  assert.equal(active.fortuneMeterAward.tierPoints, payouts.getTierFortunePoints(active.naturalWinTier));
  assert.notEqual(active.fortuneMeterAward.tierPoints, payouts.getTierFortunePoints(active.winTier));
}

function testFortuneSettlementExactlyOnceAndReloadSafety() {
  const found = findStops(result => result.preModifierWin > 0);
  const originalState = state({ coins: 500, lastWin: 0, fortuneMeter: { value: 100, charged: true } });
  const result = resultFor(found.targetStops, { roll: found.roll, meter: originalState.fortuneMeter, id: "reload-fortune" });
  payouts.consumeFortuneChargeState(originalState, result);
  originalState.coins -= result.wager;
  originalState.pendingSpin = result;

  const serialized = JSON.parse(JSON.stringify(originalState));
  serialized.pendingSpin = persistence.normalizePendingSpin(serialized.pendingSpin);
  const beforeSettlement = serialized.coins;
  const settled = payouts.settlePendingSpinState(serialized);
  assert.equal(serialized.coins, beforeSettlement + result.totalWin);
  assert.equal(serialized.fortuneMeter.value, result.fortuneMeterAward.totalPoints);
  assert.equal(settled.modifiers.filter(modifier => modifier.id === "fortune-spin").length, 1);
  assert.equal(payouts.settlePendingSpinState(serialized), null);
  assert.equal(serialized.coins, beforeSettlement + result.totalWin);
  assert.equal(serialized.fortuneMeter.value, result.fortuneMeterAward.totalPoints);
}

function testFortuneDisabledPreservesBehavior() {
  const targetStops = [7,4,5];
  const disabled = resultFor(targetStops, { roll: 0, meter: { value: 100, charged: true }, featureFlags: flags(true, true, false) });
  const baseline = resultFor(targetStops, { roll: 0, meter: { value: 0, charged: false }, featureFlags: flags(true, true, false) });
  assert.equal(disabled.totalWin, baseline.totalWin);
  assert.equal(disabled.preModifierWin, baseline.preModifierWin);
  assert.equal(disabled.fortuneSpin.active, false);
  assert.equal(disabled.modifiers.length, 0);
  assert.equal(disabled.fortuneMeterAward.totalPoints, 0);
}

function testPersistencePreservesAuthoritativeFeatureData() {
  const result = resultFor([4,14,10], { roll: 0, meter: { value: 100, charged: true }, id: "persisted-feature" });
  const normalized = persistence.normalizePendingSpin(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(normalized.featureRolls, result.featureRolls);
  assert.deepEqual(normalized.originalMatrix, result.originalMatrix);
  assert.deepEqual(normalized.resolvedMatrix, result.resolvedMatrix);
  assert.deepEqual(normalized.transformations, result.transformations);
  assert.deepEqual(normalized.combinationWins, result.combinationWins);
  assert.deepEqual(normalized.fortuneSpin, result.fortuneSpin);
  assert.deepEqual(normalized.fortuneMeterAward, result.fortuneMeterAward);
  assert.equal(normalized.settlementStatus, "pending");
  assert.equal(persistence.normalizePendingSpin({ ...result, settlementStatus: "settled" }), null);
}

const tests = [
  testTreeEligibilityAndRolls,
  testTreeTransformationAndPaylines,
  testStoredRollReproductionAndReloadSafety,
  testNamedCombinations,
  testFullCommuneRequirementsAndPriority,
  testPayoutScalingAndStacking,
  testResultTotalsTierCountUpAndSettlement,
  testFeatureFlagConfigurations,
  testFortuneStateNormalizationAndMigration,
  testFortuneGainRules,
  testFortuneMeterCapAndPersistence,
  testFortuneSpinConsumptionAndMultiplier,
  testFinalTierAndNaturalMeterTierSeparation,
  testFortuneSettlementExactlyOnceAndReloadSafety,
  testFortuneDisabledPreservesBehavior,
  testPersistencePreservesAuthoritativeFeatureData,
];

tests.forEach(test => test());
console.log(`Feature tests: PASS (${tests.length} groups)`);
