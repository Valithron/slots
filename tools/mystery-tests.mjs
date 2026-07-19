#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

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

const app = globalThis.CommuneFortune;
const { CONFIG, payouts, mystery, freeSpins, persistence } = app;
const members = new Set(CONFIG.characterPresentation.allMembers);

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
  for (let first = 0; first < CONFIG.reels[0].length; first += 1) {
    for (let second = 0; second < CONFIG.reels[1].length; second += 1) {
      for (let third = 0; third < CONFIG.reels[2].length; third += 1) yield [first, second, third];
    }
  }
}

function make(targetStops, {
  spinState = state(),
  id = `mystery-test-${targetStops.join("-")}`,
  spinType = "paid",
  modifiers = [],
  roll = 1,
  referenceBet = null,
  totalAwardedSpins = 0,
  awardModifier = null,
  awardSpotlight = null,
  rescueStops = null,
  rescueRolls = null,
  featureFlags = CONFIG.features,
  allyBypass = true,
  rng = () => 0.137,
} = {}) {
  return payouts.createSpinResult({
    targetStops,
    state: spinState,
    id,
    createdAt: "2000-01-01T00:00:00.000Z",
    spinType,
    referenceBet: referenceBet ?? payouts.getTotalBet(spinState),
    totalAwardedSpins,
    featureRolls: { expandingWild: { roll } },
    mysteryModifiers: modifiers,
    mysteryAwardModifier: awardModifier,
    mysteryAwardSpotlight: awardSpotlight,
    mysteryRescueStops: rescueStops,
    mysteryRescueFeatureRolls: rescueRolls,
    featureFlags,
    allyBypass,
    rng,
  });
}

function findStops(predicate, options = {}) {
  for (const targetStops of allStops()) {
    const result = make(targetStops, { ...options, id: `probe-${targetStops.join("-")}` });
    if (predicate(result)) return { targetStops, result };
  }
  throw new Error("No deterministic reel result matched the Mystery test predicate.");
}

function tokenStops(count) {
  return findStops(result => count >= 4
    ? result.mysteryTokenCount >= 4
    : result.mysteryTokenCount === count).targetStops;
}

function settle(spinState, result, { commit = true } = {}) {
  if (commit) assert.equal(mystery.commitSpinStart(spinState, result), true, "spin start must commit its ticket and modifier queue");
  payouts.consumeFortuneChargeState(spinState, result);
  spinState.coins -= result.coinCost;
  spinState.lastWin = 0;
  spinState.pendingSpin = result;
  return payouts.settlePendingSpinState(spinState);
}

const stops = Object.fromEntries([0, 1, 2, 3, 4].map(count => [count, tokenStops(count)]));
const zeroTokenLoss = findStops(result => result.mysteryTokenCount === 0 && result.totalWin === 0).targetStops;
const zeroTokenWin = findStops(result => result.mysteryTokenCount === 0 && result.totalWin > 0).targetStops;
const twoTokenLoss = findStops(result => result.mysteryTokenCount === 2 && result.totalWin === 0).targetStops;
const triggerStops = findStops(result => result.mysteryTokenCount === 0 && result.freeSpinTrigger.triggered).targetStops;
const combinationStops = findStops(result => result.mysteryTokenCount === 0 && result.combinationWins.length > 0).targetStops;
const spotlightProbe = findStops(result => result.mysteryTokenCount === 0 && result.lineWins.some(win => members.has(win.symbolKey)));
const spotlightCharacter = spotlightProbe.result.lineWins.find(win => members.has(win.symbolKey)).symbolKey;

function tokenRules() {
  const one = make(stops[1], { id: "tokens-one" });
  assert.equal(one.mysteryTokenCount, 1);
  assert.equal(one.mysteryAward.fortunePoints, 0);
  assert.equal(one.mysteryAward.freeSpinsRequested, 0);
  assert.equal(one.mysteryAward.modifier, null);

  const two = make(stops[2], { id: "tokens-two", awardModifier: "center-tree" });
  assert.equal(two.mysteryTokenCount, 2);
  assert.equal(two.mysteryAward.fortunePoints, 10);
  assert.equal(two.fortuneMeterAward.mysteryTokenPoints, 10);
  assert.equal(two.mysteryAward.modifier.id, "center-tree");
  const twoState = state();
  const twoDone = settle(twoState, make(stops[2], {
    spinState: twoState,
    id: "tokens-two-settle",
    awardModifier: "center-tree",
  }));
  assert.equal(twoDone.mysterySettlement.fortunePoints, 10);
  assert.equal(twoState.fortuneMeter.value, twoDone.fortuneMeterAward.totalPoints);
  assert.equal(twoState.mystery.modifierQueue[0].id, "center-tree");

  const threeState = state();
  const threeDone = settle(threeState, make(stops[3], {
    spinState: threeState,
    id: "tokens-three",
    awardModifier: "fortune-burst",
  }));
  assert.equal(threeDone.mysteryTokenCount, 3);
  assert.equal(threeDone.mysterySettlement.freeSpinsAwarded, 1);
  assert.equal(threeState.mystery.queuedFreeSpins, 1);
  assert.equal(threeState.mystery.modifierQueue[0].id, "fortune-burst");

  const fourState = state();
  const fourDone = settle(fourState, make(stops[4], {
    spinState: fourState,
    id: "tokens-four",
    awardModifier: "double-commune",
  }));
  assert.ok(fourDone.mysteryTokenCount >= 4);
  assert.equal(fourDone.mysteryAward.requestedModifierTier, "strong");
  assert.equal(fourDone.mysteryAward.strongFallback, true);
  assert.equal(fourDone.mysteryAward.modifier.actualTier, "normal");
  assert.equal(fourDone.mysteryAward.modifier.id, "double-commune");
  assert.equal(fourDone.mysterySettlement.freeSpinsAwarded, 2);
  assert.equal(fourState.mystery.queuedFreeSpins, 2);
}

function freeSpinRules() {
  const buildState = state();
  mystery.setQueuedFreeSpins(buildState, 1);
  const buildResult = make(zeroTokenWin, {
    spinState: buildState,
    id: "mystery-builds-fortune",
    spinType: "mystery-free",
  });
  const coinsBefore = buildState.coins;
  assert.equal(buildResult.coinCost, 0);
  assert.ok(buildResult.fortuneMeterAward.totalPoints > 0, "Mystery Free Spins must build Fortune");
  const buildDone = settle(buildState, buildResult);
  assert.equal(buildState.coins, coinsBefore + buildDone.totalWin);
  assert.equal(buildState.mystery.queuedFreeSpins, 0);
  assert.equal(buildState.fortuneMeter.value, buildDone.fortuneMeterAward.totalPoints);

  const chargedState = state({ fortuneMeter: { value: CONFIG.fortuneMeter.capacity, charged: true } });
  mystery.setQueuedFreeSpins(chargedState, 1);
  const charged = make(zeroTokenWin, {
    spinState: chargedState,
    id: "mystery-consumes-fortune",
    spinType: "mystery-free",
  });
  assert.equal(charged.fortuneSpin.active, true);
  assert.equal(charged.totalWin, Math.floor(charged.preModifierWin * CONFIG.fortuneMeter.multiplier));
  const chargedDone = settle(chargedState, charged);
  assert.equal(chargedState.fortuneMeter.value, chargedDone.fortuneMeterAward.totalPoints, "the charge is consumed before the new meter award");

  const triggerState = state();
  mystery.setQueuedFreeSpins(triggerState, 2);
  const trigger = make(triggerStops, {
    spinState: triggerState,
    id: "mystery-triggers-ally",
    spinType: "mystery-free",
  });
  assert.equal(trigger.freeSpinTrigger.triggered, true);
  assert.equal(trigger.freeSpinTrigger.retrigger, false);
  assert.equal(trigger.freeSpinTrigger.awardedSpins, CONFIG.freeSpins.startingAward);
  settle(triggerState, trigger);
  assert.equal(triggerState.freeSpinSession.active, true);
  assert.equal(triggerState.freeSpinSession.triggerResult.spinType, "mystery-free");
  assert.equal(triggerState.mystery.queuedFreeSpins, 1, "remaining Mystery tickets pause while the Ally feature is active");
}

function allyTokenRules() {
  const paidTrigger = make(triggerStops, { id: "ally-token-trigger" });
  const spinState = state({ freeSpinSession: freeSpins.createFreeSpinSession(paidTrigger, { sessionId: "ally-token-session" }) });
  spinState.freeSpinSession.status = freeSpins.FREE_SPIN_STATUSES.READY;
  spinState.freeSpinSession.ally = app.allies.createAllyState();
  spinState.freeSpinSession.ally.selectedId = "sterling";
  spinState.freeSpinSession.ally.confirmed = true;
  spinState.freeSpinSession.ally.featureStarted = true;
  const locked = freeSpins.getLockedSpinState(spinState.freeSpinSession, spinState);
  const tokenResult = make(stops[3], {
    spinState: locked,
    id: "ally-three-tokens",
    spinType: "free",
    referenceBet: spinState.freeSpinSession.referenceBet,
    totalAwardedSpins: spinState.freeSpinSession.totalAwardedSpins,
    awardModifier: "spotlight",
    awardSpotlight: spotlightCharacter,
  });
  const tokenDone = settle(spinState, tokenResult);
  assert.equal(tokenDone.spinType, "free");
  assert.equal(tokenDone.mysterySettlement.freeSpinsAwarded, 1);
  assert.equal(tokenDone.mysterySettlement.allySpinsAdded, 1);
  assert.equal(tokenDone.mysterySettlement.ordinaryFreeSpinsAwarded, 0);
  assert.equal(spinState.mystery.queuedFreeSpins, 0, "Mystery awards earned in Ally Free Spins extend the active feature");
  assert.equal(spinState.freeSpinSession.remainingSpins, 4);
  assert.equal(spinState.freeSpinSession.totalAwardedSpins, 5);
  assert.equal(spinState.mystery.modifierQueue[0].id, "spotlight");
  assert.equal(spinState.freeSpinSession.presentationSpin.mysterySettlement.applied, true);
  assert.equal(spinState.freeSpinSession.presentationSpin.mysteryAward.allyExtension.applied, true);

  spinState.freeSpinSession = freeSpins.markFreeSpinPresented(spinState.freeSpinSession, tokenDone.id);
  const nextLocked = freeSpins.getLockedSpinState(spinState.freeSpinSession, spinState);
  const nextResult = make(zeroTokenLoss, {
    spinState: nextLocked,
    id: "ally-consumes-earned-modifier",
    spinType: "free",
    referenceBet: spinState.freeSpinSession.referenceBet,
    totalAwardedSpins: spinState.freeSpinSession.totalAwardedSpins,
    modifiers: mystery.peekModifierQueue(spinState),
  });
  assert.equal(nextResult.mysteryActiveModifiers[0].id, "spotlight");
  assert.equal(mystery.commitSpinStart(spinState, nextResult), true);
  assert.equal(spinState.mystery.modifierQueue.length, 0, "the next Ally spin consumes modifiers earned inside the feature");
  assert.equal(spinState.mystery.queuedFreeSpins, 0, "Ally extension spins do not create or consume ordinary Mystery tickets");
}

function spotlightRules() {
  const base = make(spotlightProbe.targetStops, { id: "spotlight-base" });
  const doubled = make(spotlightProbe.targetStops, {
    id: "spotlight-double",
    modifiers: [{ id: "spotlight", characterKey: spotlightCharacter, stacks: 1 }],
  });
  const quadrupled = make(spotlightProbe.targetStops, {
    id: "spotlight-quadruple",
    modifiers: [{ id: "spotlight", characterKey: spotlightCharacter, stacks: 9 }],
  });
  for (const win of doubled.lineWins.filter(item => item.symbolKey === spotlightCharacter)) {
    const original = base.lineWins.find(item => item.lineIndex === win.lineIndex);
    assert.equal(win.payout, original.payout * 2);
    assert.equal(win.mysteryMultiplier, 2);
  }
  for (const win of quadrupled.lineWins.filter(item => item.symbolKey === spotlightCharacter)) {
    const original = base.lineWins.find(item => item.lineIndex === win.lineIndex);
    assert.equal(win.payout, original.payout * 4);
  }
  assert.equal(quadrupled.mysteryActiveModifiers[0].stacks, 3);
}

function centerTreeRules() {
  const open = findStops(result => {
    const center = result.originalMatrix[CONFIG.expandingWild.rowIndex][CONFIG.expandingWild.reelIndex];
    return ![CONFIG.mystery.symbolKey, CONFIG.expandingWild.symbolKey].includes(center);
  });
  const base = make(open.targetStops, { id: "center-base" });
  const centered = make(open.targetStops, {
    id: "center-created",
    modifiers: [{ id: "center-tree", stacks: 1 }],
  });
  assert.equal(centered.originalMatrix[1][1], base.originalMatrix[1][1]);
  assert.equal(centered.resolvedMatrix[1][1], CONFIG.expandingWild.symbolKey);
  assert.equal(centered.centerTree.created, true);
  assert.equal(centered.freeSpinTrigger.triggered, base.freeSpinTrigger.triggered, "created Trees remain distinct from natural trigger Trees");

  const blockedStops = findStops(result => result.originalMatrix[1][1] === CONFIG.mystery.symbolKey).targetStops;
  const blocked = make(blockedStops, {
    id: "center-scatter-blocked",
    modifiers: [{ id: "center-tree", stacks: 1 }],
  });
  assert.equal(blocked.resolvedMatrix[1][1], CONFIG.mystery.symbolKey);
  assert.equal(blocked.centerTree.created, false);
  assert.equal(blocked.centerTree.blockedBy, CONFIG.mystery.symbolKey);
}

function communeRules() {
  const base = make(combinationStops, { id: "commune-base" });
  const doubled = make(combinationStops, {
    id: "commune-double",
    modifiers: [{ id: "double-commune", stacks: 1 }],
  });
  const quadrupled = make(combinationStops, {
    id: "commune-quadruple",
    modifiers: [{ id: "double-commune", stacks: 8 }],
  });
  assert.ok(base.combinationWins.length > 0);
  assert.equal(doubled.combinationWinTotal, base.combinationWinTotal * 2);
  assert.equal(doubled.combinationWins[0].mysteryMultiplier, 2);
  assert.match(doubled.combinationWins[0].name, /Double Commune/);
  assert.equal(quadrupled.combinationWinTotal, base.combinationWinTotal * 4);
  assert.equal(quadrupled.lineWinTotal, base.lineWinTotal, "Double Commune must not change ordinary line wins");
}

function rescueRules() {
  const rescue = [{ id: "rescue-spin", stacks: 2 }];
  const rescueRolls = [
    { expandingWild: { roll: 1 } },
    { expandingWild: { roll: 1 } },
  ];

  const originalTwo = make(twoTokenLoss, {
    id: "rescue-keeps-original-two-tokens",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
    awardModifier: "center-tree",
  });
  assert.equal(originalTwo.totalWin, 0);
  assert.equal(originalTwo.mysteryRescue.attemptsUsed, 0);
  assert.equal(originalTwo.mysteryRescue.selected, "original");
  assert.equal(originalTwo.mysteryRescue.stopReason, "meaningful-non-coin-reward");
  assert.equal(originalTwo.mysteryTokenCount, 2);
  assert.equal(originalTwo.mysteryAward.fortunePoints, CONFIG.mystery.rewards.twoTokenFortune);
  assert.equal(originalTwo.mysteryAward.modifier.id, "center-tree");

  const replacementTwo = make(zeroTokenLoss, {
    id: "rescue-stops-on-replacement-two-tokens",
    modifiers: rescue,
    rescueStops: [twoTokenLoss, zeroTokenWin],
    rescueRolls,
    awardModifier: "center-tree",
  });
  assert.equal(replacementTwo.mysteryRescue.attemptsUsed, 1);
  assert.equal(replacementTwo.mysteryRescue.replacementResults.length, 1);
  assert.equal(replacementTwo.mysteryRescue.selected, "replacement");
  assert.equal(replacementTwo.mysteryRescue.stopReason, "meaningful-non-coin-reward");
  assert.equal(replacementTwo.mysteryTokenCount, 2);
  assert.equal(replacementTwo.targetStops.join(","), twoTokenLoss.join(","));

  const three = make(stops[3], {
    id: "rescue-keeps-three-token-award",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(three.mysteryRescue.attemptsUsed, 0);
  assert.equal(three.mysteryTokenCount, 3);
  assert.equal(three.mysteryAward.freeSpinsRequested, CONFIG.mystery.rewards.threeTokenFreeSpins);

  const four = make(stops[4], {
    id: "rescue-keeps-four-token-award",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(four.mysteryRescue.attemptsUsed, 0);
  assert.ok(four.mysteryTokenCount >= 4);
  assert.equal(four.mysteryAward.freeSpinsRequested, CONFIG.mystery.rewards.fourPlusFreeSpins);

  const zeroWinTriggerStops = findStops(result => result.totalWin === 0
    && result.mysteryTokenCount === 0
    && result.freeSpinTrigger?.triggered
    && result.freeSpinTrigger.awardedSpins > 0).targetStops;
  const trigger = make(zeroWinTriggerStops, {
    id: "rescue-keeps-natural-three-trees",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(trigger.totalWin, 0);
  assert.equal(trigger.mysteryRescue.attemptsUsed, 0);
  assert.equal(trigger.mysteryRescue.stopReason, "meaningful-non-coin-reward");
  assert.equal(trigger.freeSpinTrigger.triggered, true);

  const blank = make(zeroTokenLoss, {
    id: "rescue-rerolls-truly-blank-results",
    modifiers: rescue,
    rescueStops: [zeroTokenLoss, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(blank.mysteryRescue.attemptsUsed, 2);
  assert.equal(blank.mysteryRescue.selected, "replacement");
  assert.equal(blank.mysteryRescue.stopReason, "coin-win");
  assert.equal(blank.mysteryRescue.rescued, true);
  assert.equal(blank.targetStops.join(","), zeroTokenWin.join(","));

  const oneTokenLoss = findStops(result => result.totalWin === 0
    && result.mysteryTokenCount === 1
    && !result.freeSpinTrigger?.triggered).targetStops;
  const one = make(oneTokenLoss, {
    id: "rescue-may-reroll-one-token-shimmer",
    modifiers: rescue,
    rescueStops: [zeroTokenWin],
    rescueRolls,
  });
  assert.equal(one.mysteryRescue.attemptsUsed, 1);
  assert.equal(one.totalWin > 0, true);

  storage.clear();
  const reloadState = state();
  mystery.queueModifier(reloadState, { id: "rescue-spin", stacks: 2 });
  const reloadResult = make(zeroTokenLoss, {
    spinState: reloadState,
    id: "rescue-reload-exactly-once",
    modifiers: mystery.peekModifierQueue(reloadState),
    rescueStops: [twoTokenLoss, zeroTokenWin],
    rescueRolls,
    awardModifier: "center-tree",
  });
  assert.equal(mystery.commitSpinStart(reloadState, reloadResult), true);
  reloadState.coins -= reloadResult.coinCost;
  reloadState.lastWin = 0;
  reloadState.pendingSpin = reloadResult;
  assert.equal(persistence.saveState(reloadState), true);
  const restored = persistence.loadState();
  const done = payouts.settlePendingSpinState(restored);
  assert.equal(done.mysteryTokenCount, 2);
  assert.equal(done.mysterySettlement.fortunePoints, CONFIG.mystery.rewards.twoTokenFortune);
  assert.equal(restored.mystery.modifierQueue[0].id, "center-tree");
  assert.equal(restored.fortuneMeter.value, done.fortuneMeterAward.totalPoints);
  assert.equal(payouts.settlePendingSpinState(restored), null, "Recovered Rescue result settles once");
  assert.equal(mystery.applyMysterySettlement(restored, done).duplicate, true, "Recovered reward cannot duplicate");
}

function fortuneBurstRules() {
  const loss = make(zeroTokenLoss, {
    id: "burst-loss",
    spinType: "free",
    modifiers: [{ id: "fortune-burst", stacks: 1 }],
  });
  assert.equal(loss.totalWin, 0);
  assert.equal(loss.fortuneBurstPoints, CONFIG.mystery.fortuneBurst.loss);
  assert.equal(loss.fortuneMeterAward.totalPoints, CONFIG.mystery.fortuneBurst.loss, "Fortune Burst remains active inside Ally Free Spins");

  const win = make(zeroTokenWin, {
    id: "burst-win",
    modifiers: [{ id: "fortune-burst", stacks: 1 }],
  });
  assert.equal(win.fortuneBurstPoints, CONFIG.mystery.fortuneBurst.win);
  const stackedWin = make(zeroTokenWin, {
    id: "burst-win-stacked",
    modifiers: [{ id: "fortune-burst", stacks: 7 }],
  });
  const stackedLoss = make(zeroTokenLoss, {
    id: "burst-loss-stacked",
    modifiers: [{ id: "fortune-burst", stacks: 7 }],
  });
  assert.equal(stackedWin.fortuneBurstPoints, CONFIG.mystery.fortuneBurst.win * 3);
  assert.equal(stackedLoss.fortuneBurstPoints, CONFIG.mystery.fortuneBurst.loss * 3);
}

function stackingAndCapRules() {
  const spinState = state();
  for (let index = 0; index < 5; index += 1) {
    mystery.queueModifier(spinState, { id: "spotlight", characterKey: spotlightCharacter, stacks: 1 });
    mystery.queueModifier(spinState, { id: "double-commune", stacks: 1 });
    mystery.queueModifier(spinState, { id: "rescue-spin", stacks: 1 });
    mystery.queueModifier(spinState, { id: "fortune-burst", stacks: 1 });
    mystery.queueModifier(spinState, { id: "center-tree", stacks: 1 });
  }
  mystery.queueModifier(spinState, { id: "spotlight", characterKey: "STR", stacks: 1 });
  const byKey = new Map(spinState.mystery.modifierQueue.map(item => [`${item.id}:${item.characterKey || ""}`, item]));
  assert.equal(byKey.get(`spotlight:${spotlightCharacter}`).stacks, 3);
  assert.equal(byKey.get("double-commune:").stacks, 3);
  assert.equal(byKey.get("rescue-spin:").stacks, 2);
  assert.equal(byKey.get("fortune-burst:").stacks, 3);
  assert.equal(byKey.get("center-tree:").stacks, 1);
  if (spotlightCharacter !== "STR") assert.ok(byKey.has("spotlight:STR"), "different Spotlight characters queue independently");

  const nearlyFull = [
    ...CONFIG.characterPresentation.allMembers.map(characterKey => ({ id: "spotlight", characterKey, stacks: 3 })),
    { id: "center-tree", stacks: 1 },
    { id: "double-commune", stacks: 3 },
    { id: "rescue-spin", stacks: 1 },
    { id: "fortune-burst", stacks: 3 },
  ];
  assert.equal(mystery.chooseModifier({ queue: nearlyFull, rng: () => 0 }).id, "rescue-spin", "normal awards avoid capped no-op duplicates when an alternative exists");

  const cappedState = state();
  mystery.setQueuedFreeSpins(cappedState, CONFIG.mystery.maximumQueuedFreeSpins);
  const capped = settle(cappedState, make(stops[4], {
    spinState: cappedState,
    id: "mystery-cap",
    awardModifier: "center-tree",
  }));
  assert.equal(capped.mysterySettlement.freeSpinsAwarded, 0);
  assert.equal(capped.mysterySettlement.capped, true);
  assert.equal(cappedState.mystery.queuedFreeSpins, CONFIG.mystery.maximumQueuedFreeSpins);
}

function persistenceRules() {
  storage.clear();
  const queued = state();
  mystery.setQueuedFreeSpins(queued, 3);
  mystery.queueModifier(queued, { id: "spotlight", characterKey: "CYD", stacks: 2 });
  mystery.queueModifier(queued, { id: "fortune-burst", stacks: 3 });
  assert.equal(persistence.saveState(queued), true);
  const restored = persistence.loadState();
  assert.equal(restored.mystery.queuedFreeSpins, 3);
  assert.deepEqual(restored.mystery.modifierQueue.map(item => [item.id, item.characterKey, item.stacks]), [
    ["spotlight", "CYD", 2],
    ["fortune-burst", undefined, 3],
  ]);

  storage.clear();
  const pendingState = state();
  mystery.setQueuedFreeSpins(pendingState, 2);
  mystery.queueModifier(pendingState, { id: "rescue-spin", stacks: 2 });
  const pending = make(twoTokenLoss, {
    spinState: pendingState,
    id: "persisted-rescue",
    spinType: "mystery-free",
    modifiers: mystery.peekModifierQueue(pendingState),
    rescueStops: [zeroTokenWin],
    rescueRolls: [{ expandingWild: { roll: 1 } }],
  });
  assert.equal(mystery.commitSpinStart(pendingState, pending), true);
  payouts.consumeFortuneChargeState(pendingState, pending);
  pendingState.pendingSpin = pending;
  assert.equal(persistence.saveState(pendingState), true);
  const recovered = persistence.loadState();
  assert.equal(recovered.pendingSpin.mysteryRescue.selected, "original");
  assert.equal(recovered.pendingSpin.mysteryRescue.attemptsUsed, 0);
  assert.equal(recovered.pendingSpin.mysteryTokenCount, 2);
  assert.equal(recovered.pendingSpin.mysteryConsumption.ticketConsumed, true);
  assert.equal(recovered.mystery.queuedFreeSpins, 1);
  assert.equal(recovered.mystery.modifierQueue.length, 0);
  const before = recovered.coins;
  const done = payouts.settlePendingSpinState(recovered);
  assert.equal(recovered.coins, before + done.totalWin);
  assert.equal(done.totalWin, 0);
  assert.equal(done.mysteryTokenCount, 2);
  assert.equal(done.mysterySettlement.fortunePoints, CONFIG.mystery.rewards.twoTokenFortune);
  assert.equal(recovered.mystery.modifierQueue.length, 1);
  const settledCoins = recovered.coins;
  assert.equal(persistence.saveState(recovered), true);
  const settledReload = persistence.loadState();
  assert.equal(settledReload.pendingSpin, null);
  assert.equal(settledReload.coins, settledCoins);
  assert.equal(payouts.settlePendingSpinState(settledReload), null);
}

function integrationSurfaceRules() {
  assert.equal(CONFIG.symbols.MYS.scatter, true);
  assert.equal(CONFIG.symbols.MYS.paysLine, false);
  assert.match(CONFIG.symbols.MYS.image, /assets\/symbols\/scatter\.svg\?v=mystery-v1/);
  assert.ok(fs.statSync(new URL("../assets/symbols/scatter.svg", import.meta.url)).size > 1000);
  assert.equal(payouts.evaluateLine(["MYS", "MYS", "MYS"]), null);
  assert.equal(CONFIG.mystery.strongModifierPool.length, 0);
  assert.ok(stops[4], "the real reel strips must produce 4+ visible Mystery Tokens");
  const disabled = make(stops[4], {
    id: "mystery-flags-off",
    modifiers: [{ id: "fortune-burst", stacks: 1 }],
    featureFlags: { ...CONFIG.features, scatters: false, mysteryModifiers: false },
  });
  assert.equal(disabled.mysteryTokenCount, 0);
  assert.equal(disabled.mysteryActiveModifiers.length, 0);
  const disabledState = state();
  mystery.queueModifier(disabledState, { id: "fortune-burst", stacks: 1 });
  assert.equal(mystery.commitSpinStart(disabledState, disabled), true);
  assert.equal(disabledState.mystery.modifierQueue.length, 1, "disabled modifiers remain queued for a later eligible spin");
  mystery.setQueuedFreeSpins(disabledState, 2);
  mystery.clearQueue(disabledState);
  assert.equal(disabledState.mystery.queuedFreeSpins, 0);
  assert.equal(disabledState.mystery.modifierQueue.length, 0);

  const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../mystery.css", import.meta.url), "utf8");
  assert.ok(index.indexOf("js/combination-clarity-payouts.js") < index.indexOf("js/mystery.js"));
  assert.ok(index.indexOf("js/mystery.js") < index.indexOf("js/ally-payouts.js"));
  assert.ok(index.indexOf("js/mystery-ui.js") < index.indexOf("js/game-engine.js"));
  assert.match(index, /Mystery Tokens count anywhere/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /prefers-reduced-motion/);
}

const tests = [
  tokenRules,
  freeSpinRules,
  allyTokenRules,
  spotlightRules,
  centerTreeRules,
  communeRules,
  rescueRules,
  fortuneBurstRules,
  stackingAndCapRules,
  persistenceRules,
  integrationSurfaceRules,
];

for (const test of tests) test();
console.log(`Mystery Token tests: PASS (${tests.length} groups)`);
