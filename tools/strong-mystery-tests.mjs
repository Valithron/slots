#!/usr/bin/env node

import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};

await import("../js/config.js");
await import("../js/combination-clarity-config.js");
await import("../js/ally-config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/allies.js");
await import("../js/persistence.js");
await import("../js/ally-persistence.js");
await import("../js/statistics.js");
await import("../js/payouts.js");
await import("../js/combination-clarity-payouts.js");
await import("../js/mystery.js");
await import("../js/ally-payouts.js");
await import("../js/strong-mystery-core.js");
await import("../js/strong-mystery-candidate.js");
await import("../js/strong-mystery-integration.js");
await import("../js/strong-mystery-presentation.js");
await import("../js/strong-mystery.js");

const app = globalThis.CommuneFortune;
const { CONFIG, payouts, mystery, persistence } = app;
const STRONG = [
  "golden-payline",
  "fortune-flood",
  "scatter-magnet",
  "commune-gathering",
  "sevenfold-fortune",
  "full-fortune",
  "commune-chaos",
];

function state(overrides = {}) {
  const base = persistence.defaultState();
  return {
    ...base,
    coins: 1000,
    lineBetIndex: 0,
    fortuneMeter: { value: 0, charged: false },
    mystery: mystery.createState(),
    ...overrides,
  };
}

function* allStops() {
  for (let a = 0; a < CONFIG.reels[0].length; a += 1) {
    for (let b = 0; b < CONFIG.reels[1].length; b += 1) {
      for (let c = 0; c < CONFIG.reels[2].length; c += 1) yield [a, b, c];
    }
  }
}

function result(targetStops, {
  spinState = state(),
  id = `strong-${targetStops.join("-")}`,
  spinType = "paid",
  modifiers = [],
  awardModifier = null,
  awardSelection = null,
  rescueStops = null,
  rng = () => 0.173,
  roll = 1,
  totalAwardedSpins = 0,
} = {}) {
  return payouts.createSpinResult({
    targetStops,
    state: spinState,
    id,
    createdAt: "2000-01-01T00:00:00.000Z",
    spinType,
    referenceBet: payouts.getTotalBet(spinState),
    totalAwardedSpins,
    featureRolls: { expandingWild: { roll } },
    mysteryModifiers: modifiers,
    mysteryAwardModifier: awardModifier,
    strongMysteryAwardSelection: awardSelection,
    mysteryRescueStops: rescueStops,
    mysteryRescueFeatureRolls: rescueStops?.map(() => ({ expandingWild: { roll: 1 } })),
    allyBypass: true,
    rng,
  });
}

function find(predicate, options = {}) {
  for (const stops of allStops()) {
    const probe = result(stops, { ...options, id: `probe-${stops.join("-")}` });
    if (predicate(probe)) return { stops, result: probe };
  }
  throw new Error("No deterministic result matched the Strong Mystery predicate.");
}

function withStrong(spinState, id, payload = {}, source = `qa-${id}`) {
  const instance = mystery.createStrongInstance({ id, selectionPayload: payload }, source, () => 0.1, payload);
  mystery.queueStrongModifier(spinState, instance);
  return instance;
}

function settle(spinState, spinResult) {
  assert.equal(mystery.commitSpinStart(spinState, spinResult), true);
  payouts.consumeFortuneChargeState(spinState, spinResult);
  spinState.coins -= spinResult.coinCost;
  spinState.pendingSpin = spinResult;
  return payouts.settlePendingSpinState(spinState);
}

const cleanLoss = find(r => r.totalWin === 0 && r.mysteryTokenCount === 0 && !r.freeSpinTrigger.triggered).stops;
const anyWin = find(r => r.totalWin > 0 && r.lineWins.length > 0 && r.mysteryTokenCount === 0).stops;
const twoTokens = find(r => r.mysteryTokenCount === 2).stops;
const threeTokens = find(r => r.mysteryTokenCount === 3).stops;
const fourTokens = find(r => r.mysteryTokenCount >= 4).stops;
const combination = find(r => r.combinationWins.length > 0).stops;
const assisted = find(r => r.lineWins.some(win => win.keys.includes("TOL") && win.symbolKey !== "TOL")).result;
const naturalTrio = find(r => r.lineWins.some(win => win.keys.every(key => key === win.symbolKey) && CONFIG.characterPresentation.allMembers.includes(win.symbolKey))).result;

function poolAndAtomicTests() {
  assert.deepEqual(CONFIG.mystery.strongModifierPool, STRONG);
  STRONG.forEach((id, index) => {
    const chosen = mystery.chooseModifier({ tier: "strong", rng: () => (index + 0.01) / STRONG.length });
    assert.equal(chosen.id, id);
    assert.equal(chosen.actualTier, "strong");
    assert.equal(chosen.fallbackFromStrong, false);
  });
  const repeatA = mystery.chooseModifier({ tier: "strong", rng: () => 0.001 });
  const repeatB = mystery.chooseModifier({ tier: "strong", rng: () => 0.001 });
  assert.equal(repeatA.id, repeatB.id);

  const spinState = state();
  withStrong(spinState, "golden-payline", { lineIndex: 0, lineName: "Top Horizontal" }, "atomic-a");
  withStrong(spinState, "golden-payline", { lineIndex: 4, lineName: "Upward Diagonal" }, "atomic-b");
  assert.equal(mystery.getStrongQueue(spinState).length, 2);
  assert.notEqual(mystery.getStrongQueue(spinState)[0].instanceId, mystery.getStrongQueue(spinState)[1].instanceId);
  const saved = mystery.normalizeState(structuredClone(spinState.mystery));
  assert.equal(saved.strongModifierQueue.length, 2);
  assert.equal(saved.strongModifierQueue[1].selectionPayload.lineIndex, 4);
}

function goldenPaylineTests() {
  const base = result(anyWin, { id: "golden-base" });
  const selected = base.lineWins[0].lineIndex;
  const spinState = state();
  withStrong(spinState, "golden-payline", { lineIndex: selected, lineName: "Selected" });
  const boosted = result(anyWin, { spinState, id: "golden-hit" });
  const baseLine = base.lineWins.find(win => win.lineIndex === selected);
  const boostedLine = boosted.lineWins.find(win => win.lineIndex === selected);
  assert.equal(boostedLine.payout, baseLine.payout * CONFIG.mystery.strong.goldenPaylineMultiplier);
  boosted.lineWins.filter(win => win.lineIndex !== selected).forEach(win => {
    const original = base.lineWins.find(item => item.lineIndex === win.lineIndex);
    assert.equal(win.payout, original.payout);
  });

  const comboState = state();
  withStrong(comboState, "golden-payline", { lineIndex: 1, lineName: "Middle Horizontal" });
  const combo = result(combination, { spinState: comboState, id: "golden-combo" });
  combo.combinationWins.forEach(win => assert.equal(win.payout, win.basePayout));
}

function floodTests() {
  const baseWin = result(anyWin, { id: "flood-base" });
  const winState = state();
  withStrong(winState, "fortune-flood");
  const flooded = result(anyWin, { spinState: winState, id: "flood-win" });
  assert.equal(flooded.totalWin, baseWin.totalWin * 2);

  const lowState = state({ fortuneMeter: { value: 20, charged: false } });
  withStrong(lowState, "fortune-flood");
  const low = result(cleanLoss, { spinState: lowState, id: "flood-low" });
  assert.ok(low.strongMysteryGlobal.floodPersistentGain > 0);
  assert.equal(app.strongMystery.isTrulyBlankResult(low), false);
  settle(lowState, low);
  assert.equal(lowState.fortuneMeter.value, 50);

  const highState = state({ fortuneMeter: { value: 72, charged: false } });
  withStrong(highState, "fortune-flood");
  const high = result(cleanLoss, { spinState: highState, id: "flood-high" });
  assert.equal(high.strongMysteryGlobal.floodPersistentGain, 0);
  assert.equal(app.strongMystery.isTrulyBlankResult(high), true);
}

function scatterMagnetTests() {
  const zeroState = state();
  withStrong(zeroState, "scatter-magnet");
  const zero = result(cleanLoss, { spinState: zeroState, id: "magnet-zero" });
  assert.equal(zero.mysteryTokenCount, 2);
  assert.equal(zero.mysteryOverlayCells.length, 2);
  assert.deepEqual(zero.originalMatrix, result(cleanLoss, { id: "magnet-underlying" }).originalMatrix);
  assert.equal(app.strongMystery.isTrulyBlankResult(zero), false);

  const twoState = state();
  withStrong(twoState, "scatter-magnet");
  const loop = result(twoTokens, {
    spinState: twoState,
    id: "magnet-loop",
    awardModifier: "scatter-magnet",
  });
  assert.ok(loop.mysteryTokenCount >= 4);
  assert.equal(loop.mysteryAward.modifier.id, "scatter-magnet");
  assert.equal(loop.mysteryAward.modifier.tier, "strong");
}

function gatheringTests() {
  const selected = CONFIG.combinations.definitions.find(item => item.id === "brotherhood");
  const spinState = state();
  withStrong(spinState, "commune-gathering", { combinationId: selected.id, combinationName: selected.name });
  const gathered = result(cleanLoss, { spinState, id: "gathering" });
  const bonus = gathered.combinationWins.find(win => win.gathering);
  assert.equal(bonus.payout, selected.multiplier * payouts.getLineBet(spinState) * 3);
  assert.ok(gathered.totalWin > 0);
  assert.equal(app.strongMystery.isTrulyBlankResult(gathered), false);

  const doubleState = state();
  withStrong(doubleState, "commune-gathering", { combinationId: selected.id, combinationName: selected.name });
  const doubled = result(cleanLoss, { spinState: doubleState, id: "gathering-double", modifiers: [{ id: "double-commune", stacks: 1 }] });
  assert.equal(doubled.combinationWins.find(win => win.gathering).payout, bonus.payout * 2);
}

function sevenfoldTests() {
  const naturalWin = naturalTrio.lineWins.find(win => win.keys.every(key => key === win.symbolKey) && CONFIG.characterPresentation.allMembers.includes(win.symbolKey));
  const naturalState = state();
  withStrong(naturalState, "sevenfold-fortune", { characterKey: naturalWin.symbolKey, characterName: CONFIG.symbols[naturalWin.symbolKey].name });
  const natural = result(naturalTrio.targetStops, { spinState: naturalState, id: "seven-natural" });
  const seven = natural.lineWins.find(win => win.lineIndex === naturalWin.lineIndex);
  assert.equal(seven.payout, naturalWin.payout * 7);
  assert.equal(seven.strongFactors.some(factor => factor.naturalTrio), true);

  const assistedWin = assisted.lineWins.find(win => win.keys.includes("TOL") && win.symbolKey !== "TOL");
  const assistedState = state();
  withStrong(assistedState, "sevenfold-fortune", { characterKey: assistedWin.symbolKey, characterName: CONFIG.symbols[assistedWin.symbolKey].name });
  const three = result(assisted.targetStops, { spinState: assistedState, id: "seven-assisted" }).lineWins.find(win => win.lineIndex === assistedWin.lineIndex);
  assert.equal(three.payout, assistedWin.payout * 3);
}

function fullFortuneTests() {
  const base = result(anyWin, { id: "full-base" });
  const winState = state();
  withStrong(winState, "full-fortune");
  const doubled = result(anyWin, { spinState: winState, id: "full-win" });
  assert.equal(doubled.totalWin, base.totalWin * 2);

  const twoState = state();
  withStrong(twoState, "full-fortune");
  const two = result(twoTokens, { spinState: twoState, id: "full-two" });
  assert.equal(two.mysteryAward.fortunePoints, 20);
  assert.equal(two.mysteryTokenCount, 2);

  const threeState = state();
  withStrong(threeState, "full-fortune");
  const three = result(threeTokens, { spinState: threeState, id: "full-three" });
  assert.equal(three.mysteryAward.freeSpinsRequested, 2);

  const fourState = state();
  withStrong(fourState, "full-fortune");
  const four = result(fourTokens, { spinState: fourState, id: "full-four", awardModifier: "golden-payline" });
  assert.equal(four.mysteryAward.freeSpinsRequested, 4);
  assert.equal(four.mysteryAward.modifier.id, "golden-payline");
}

function chaosTests() {
  const payload = {
    effects: ["chaos-spotlight", "lucky-line", "scatter-spark"],
    spotlightCharacterKey: "STR",
    spotlightCharacterName: "Sterling",
    luckyLineIndex: 0,
    luckyLineName: "Top Horizontal",
  };
  const spinState = state();
  withStrong(spinState, "commune-chaos", payload);
  const chaos = result(cleanLoss, { spinState, id: "chaos" });
  assert.equal(new Set(chaos.strongMysteryActiveModifiers[0].selectionPayload.effects).size, 3);
  assert.equal(chaos.mysteryOverlayCells.length, 1);
  assert.equal(chaos.strongMysteryActiveModifiers[0].selectionPayload.spotlightCharacterKey, "STR");
  assert.equal(chaos.strongMysteryActiveModifiers[0].selectionPayload.luckyLineIndex, 0);

  const sparkState = state();
  withStrong(sparkState, "commune-chaos", {
    effects: ["scatter-spark", "chaos-rescue", "wild-spark"],
  });
  const spark = result(threeTokens, { spinState: sparkState, id: "chaos-loop", awardModifier: "commune-chaos" });
  assert.ok(spark.mysteryTokenCount >= 4);
  assert.equal(spark.mysteryAward.modifier.id, "commune-chaos");
  assert.ok(spark.transformations.some(item => item.type === "wild-spark"));
}

function rescueAndSettlementTests() {
  const winProbe = result(anyWin, { id: "rescue-win-probe" });
  const selectedLine = winProbe.lineWins[0].lineIndex;
  const spinState = state();
  withStrong(spinState, "golden-payline", { lineIndex: selectedLine, lineName: "Fixed" });
  const rescued = result(cleanLoss, {
    spinState,
    id: "strong-rescue",
    modifiers: [{ id: "rescue-spin", stacks: 1 }],
    rescueStops: [anyWin],
  });
  assert.equal(rescued.mysteryRescue.attemptsUsed, 1);
  assert.equal(rescued.strongMysteryActiveModifiers[0].selectionPayload.lineIndex, selectedLine);
  assert.equal(rescued.mysteryRescue.originalResult.strongMysteryActiveModifiers[0].selectionPayload.lineIndex, selectedLine);

  const awardState = state();
  const award = result(fourTokens, { spinState: awardState, id: "exactly-once", awardModifier: "fortune-flood" });
  const settled = settle(awardState, award);
  assert.equal(settled.strongMysterySettlement.awarded.id, "fortune-flood");
  assert.equal(mystery.getStrongQueue(awardState).length, 1);
  assert.equal(payouts.settlePendingSpinState(awardState), null);
  assert.equal(mystery.getStrongQueue(awardState).length, 1);
}

poolAndAtomicTests();
goldenPaylineTests();
floodTests();
scatterMagnetTests();
gatheringTests();
sevenfoldTests();
fullFortuneTests();
chaosTests();
rescueAndSettlementTests();

console.log("Strong Mystery Modifier tests passed.");
