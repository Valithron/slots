#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

await import("../js/config.js");
await import("../js/combination-clarity-config.js");
await import("../js/ally-config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/allies.js");
await import("../js/payouts.js");
await import("../js/combination-clarity-payouts.js");
await import("../js/mystery.js");
await import("../js/ally-payouts.js");

const app = globalThis.CommuneFortune;
const { CONFIG } = app;
const FS = app.freeSpins.FREE_SPIN_STATUSES;
const clone = value => structuredClone(value);
const outcomeCache = new Map();

function makeSession(allyId = "sterling", overrides = {}) {
  const ally = app.allies.createAllyState();
  ally.selectedId = allyId;
  ally.confirmed = true;
  ally.featureStarted = true;
  if (allyId === "ryan") {
    ally.ryan.selectedSpinNumber = 2;
    ally.ryan.consumed = true;
    ally.ryan.basePayout = 5;
    ally.ryan.bonus = 5;
  }
  if (allyId === "cydney") {
    ally.cydney.recordedSpinId = "first-win";
    ally.cydney.recordedAmount = 8;
    ally.cydney.echoBonus = 3;
  }
  if (allyId === "gabi") ally.gabi.used = true;
  if (allyId === "ashley") ally.ashley.used = true;
  if (allyId === "sterling") {
    ally.sterling.lossCount = 2;
    ally.sterling.insurancePot = 3;
  }
  if (allyId === "cooper") {
    ally.cooper.consecutiveLosses = 2;
    ally.cooper.currentMultiplier = 1.6;
  }
  if (allyId === "kenly") {
    ally.kenly.qualifyingWins = 2;
    ally.kenly.totalLemonBonus = 4;
  }
  return {
    active: true,
    sessionId: `session-${allyId}`,
    status: FS.READY,
    lockedLineBetIndex: 0,
    lockedLineBet: 1,
    referenceBet: 5,
    startingSpins: 4,
    remainingSpins: 2,
    completedSpins: 2,
    totalAwardedSpins: 4,
    retriggerCount: 0,
    accumulatedWin: 0,
    characterWinTotals: app.reactions.createEmptyContributionTotals(),
    triggerSpinId: `trigger-${allyId}`,
    lastSettledFreeSpinId: null,
    lastPresentedFreeSpinId: null,
    lastRetriggerSpinId: null,
    triggerTreeCells: [],
    triggerResult: null,
    presentationSpin: null,
    lastResult: null,
    ally,
    ...overrides,
  };
}

function makeState(allyId = "sterling", overrides = {}) {
  return {
    schemaVersion: CONFIG.schemaVersion,
    coins: 1000,
    lineBetIndex: 0,
    sound: true,
    lastWin: 0,
    gamePhase: "free-spins",
    pendingSpin: null,
    fortuneMeter: { value: 0, charged: false },
    freeSpinSession: makeSession(allyId, overrides),
    mystery: app.mystery.createState(),
  };
}

function findOutcome(tokenCount, { retrigger = false, positive = null } = {}) {
  const key = `${tokenCount}:${retrigger}:${positive}`;
  if (outcomeCache.has(key)) return clone(outcomeCache.get(key));
  const probe = makeState();
  for (let first = 0; first < CONFIG.reels[0].length; first += 1) {
    for (let second = 0; second < CONFIG.reels[1].length; second += 1) {
      for (let third = 0; third < CONFIG.reels[2].length; third += 1) {
        const targetStops = [first, second, third];
        const result = app.payouts.createSpinResult({
          targetStops,
          featureRolls: { expandingWild: { roll: 1 } },
          state: app.freeSpins.getLockedSpinState(probe.freeSpinSession, probe),
          id: `probe-${targetStops.join("-")}`,
          spinType: "free",
          referenceBet: probe.freeSpinSession.referenceBet,
          totalAwardedSpins: probe.freeSpinSession.totalAwardedSpins,
          mysteryModifiers: [],
          allyBypass: true,
          mysterySkipRescue: true,
          createdAt: "2000-01-01T00:00:00.000Z",
        });
        const countMatches = tokenCount >= 4 ? result.mysteryTokenCount >= 4 : result.mysteryTokenCount === tokenCount;
        const retriggerMatches = retrigger
          ? Boolean(result.freeSpinTrigger?.triggered && result.freeSpinTrigger.retrigger)
          : !result.freeSpinTrigger?.triggered;
        const payoutMatches = positive === null || (positive ? result.totalWin > 0 : result.totalWin === 0);
        if (countMatches && retriggerMatches && payoutMatches) {
          const found = { targetStops, featureRolls: { expandingWild: { roll: 1 } } };
          outcomeCache.set(key, clone(found));
          return found;
        }
      }
    }
  }
  throw new Error(`Missing deterministic ${tokenCount}-token outcome (retrigger=${retrigger}, positive=${positive}).`);
}

function createResult(state, tokenCount, options = {}) {
  const outcome = findOutcome(tokenCount, options);
  return app.payouts.createSpinResult({
    ...outcome,
    state: app.freeSpins.getLockedSpinState(state.freeSpinSession, state),
    id: options.id || `extension-${tokenCount}`,
    spinType: "free",
    referenceBet: state.freeSpinSession.referenceBet,
    totalAwardedSpins: state.freeSpinSession.totalAwardedSpins,
    mysteryModifiers: app.mystery.peekModifierQueue(state),
    allyBypass: options.allyBypass === true,
    mysterySkipRescue: true,
  });
}

function createCombinedQaResult(state) {
  const outcome = findOutcome(0, { retrigger: true });
  const base = app.payouts.createSpinResult({
    ...outcome,
    state: app.freeSpins.getLockedSpinState(state.freeSpinSession, state),
    id: "combined-retrigger-extension",
    spinType: "free",
    referenceBet: state.freeSpinSession.referenceBet,
    totalAwardedSpins: state.freeSpinSession.totalAwardedSpins,
    mysteryModifiers: app.mystery.peekModifierQueue(state),
    allyBypass: true,
    mysterySkipRescue: true,
  });
  const authoritative = {
    ...base,
    mysteryTokenCount: 4,
    mysteryAward: app.mystery.createAward(4, {
      id: base.id,
      queue: app.mystery.peekModifierQueue(state),
      forcedModifierId: "fortune-burst",
      rng: () => 0,
    }),
  };
  return app.allyMysteryExtensions.attachAllyExtensionPlan(authoritative, state);
}

function settle(state, result) {
  assert.equal(app.mystery.commitSpinStart(state, result), true);
  state.pendingSpin = result;
  return app.payouts.settlePendingSpinState(state);
}

{
  const state = makeState();
  const identity = {
    sessionId: state.freeSpinSession.sessionId,
    allyId: state.freeSpinSession.ally.selectedId,
    lineBet: state.freeSpinSession.lockedLineBet,
    referenceBet: state.freeSpinSession.referenceBet,
  };
  const result = settle(state, createResult(state, 3, { id: "three-token-extension" }));
  assert.equal(result.mysterySettlement.allySpinsAdded, 1);
  assert.equal(state.freeSpinSession.remainingSpins, 2);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 5);
  assert.equal(state.mystery.queuedFreeSpins, 0);
  assert.deepEqual({
    sessionId: state.freeSpinSession.sessionId,
    allyId: state.freeSpinSession.ally.selectedId,
    lineBet: state.freeSpinSession.lockedLineBet,
    referenceBet: state.freeSpinSession.referenceBet,
  }, identity);
}

{
  const state = makeState();
  const result = settle(state, createResult(state, 4, { id: "four-token-extension" }));
  assert.equal(result.mysterySettlement.allySpinsAdded, 2);
  assert.equal(state.freeSpinSession.remainingSpins, 3);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 6);
  assert.equal(state.mystery.queuedFreeSpins, 0);
}

for (const tokenCount of [1, 2]) {
  const state = makeState();
  const result = settle(state, createResult(state, tokenCount, { id: `no-extension-${tokenCount}` }));
  assert.equal(state.freeSpinSession.totalAwardedSpins, 4);
  assert.equal(result.mysteryAward?.allyExtension || null, null);
  if (tokenCount === 2) assert.equal(state.mystery.modifierQueue.length, 1);
}

{
  const state = makeState();
  const result = settle(state, createCombinedQaResult(state));
  assert.equal(result.freeSpinSettlement.retriggerApplied, 2);
  assert.equal(result.mysterySettlement.allySpinsAdded, 2);
  assert.equal(state.freeSpinSession.remainingSpins, 5);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 8);
  assert.equal(result.mysteryAward.allyExtension.naturalRetriggerSpins, 2);
}

{
  const state = makeState("sterling", { remainingSpins: 1, completedSpins: 3, totalAwardedSpins: 4 });
  const result = settle(state, createResult(state, 3, { id: "final-spin-extension" }));
  assert.equal(state.freeSpinSession.status, FS.PRESENTING);
  assert.equal(state.freeSpinSession.remainingSpins, 1);
  state.freeSpinSession = app.freeSpins.markFreeSpinPresented(state.freeSpinSession, result.id);
  assert.equal(state.freeSpinSession.status, FS.READY);
}

{
  const state = makeState();
  let expectedWin = 0;
  for (let index = 0; index < 2; index += 1) {
    const result = settle(state, createResult(state, 3, { id: `chain-${index}` }));
    expectedWin += result.totalWin;
    state.freeSpinSession = app.freeSpins.markFreeSpinPresented(state.freeSpinSession, result.id);
  }
  assert.equal(state.freeSpinSession.totalAwardedSpins, 6);
  assert.equal(state.freeSpinSession.completedSpins, 4);
  assert.equal(state.freeSpinSession.accumulatedWin, expectedWin);
}

{
  const state = makeState();
  settle(state, createResult(state, 3, { id: "modifier-extension" }));
  assert.equal(state.mystery.modifierQueue.length, 1);
  const next = createResult(state, 0, { id: "modifier-consumer" });
  assert.equal(next.mysteryActiveModifiers.length, 1);
  assert.equal(app.mystery.commitSpinStart(state, next), true);
  assert.equal(state.mystery.modifierQueue.length, 0);
}

{
  const state = makeState("sterling", { remainingSpins: 1, completedSpins: 18, totalAwardedSpins: 19 });
  const result = settle(state, createResult(state, 4, { id: "cap-overflow" }));
  assert.equal(result.mysterySettlement.allySpinsAdded, 1);
  assert.equal(result.mysterySettlement.overflowMysterySpins, 1);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 20);
  assert.equal(state.mystery.queuedFreeSpins, 1);
}

{
  const state = makeState("sterling", { remainingSpins: 1, completedSpins: 19, totalAwardedSpins: 20 });
  state.mystery.queuedFreeSpins = CONFIG.mystery.maximumQueuedFreeSpins;
  const result = settle(state, createResult(state, 4, { id: "deferred-overflow" }));
  assert.equal(result.mysterySettlement.allySpinsAdded, 0);
  assert.equal(result.mysterySettlement.overflowMysterySpinsDeferred, 2);
  assert.equal(app.allyMysteryExtensions.deferredOverflow(state), 2);
}

for (const allyId of CONFIG.allyOrder) {
  const state = makeState(allyId);
  const before = clone(state.freeSpinSession.ally);
  const plan = {
    awardId: `state-${allyId}`,
    sessionId: state.freeSpinSession.sessionId,
    allyId,
    tokenCount: 3,
    requestedSpins: 1,
    modifier: { id: "fortune-burst", name: "Fortune Burst", stacks: 1 },
    applied: false,
  };
  app.allyMysteryExtensions.applyAllyMysteryExtension(state, {
    id: `state-${allyId}`,
    spinType: "free",
    mysteryAward: { id: `state-${allyId}`, allyExtension: plan },
    mysterySettlement: { applied: true, modifier: plan.modifier, freeSpinsAwarded: 1 },
  }, 0, 0);
  assert.deepEqual(state.freeSpinSession.ally, before, `${allyId} state changed while adding spins`);
}

{
  const original = makeState();
  const result = createResult(original, 3, { id: "reload-extension" });
  assert.equal(app.mystery.commitSpinStart(original, result), true);
  original.pendingSpin = result;
  const reloaded = clone(original);
  const coinsBefore = reloaded.coins;
  const settled = app.payouts.settlePendingSpinState(reloaded);
  assert.equal(settled.mysterySettlement.allySpinsAdded, 1);
  assert.equal(app.payouts.settlePendingSpinState(reloaded), null);
  assert.equal(reloaded.coins, coinsBefore + settled.totalWin);
  assert.equal(reloaded.freeSpinSession.totalAwardedSpins, 5);
}

for (const spinType of ["paid", "mystery-free"]) {
  const state = makeState();
  state.freeSpinSession = null;
  if (spinType === "mystery-free") state.mystery.queuedFreeSpins = 1;
  const result = app.payouts.createSpinResult({
    ...findOutcome(3),
    state,
    id: `outside-${spinType}`,
    spinType,
    referenceBet: 5,
    totalAwardedSpins: 0,
    mysteryModifiers: [],
  });
  settle(state, result);
  assert.equal(state.mystery.queuedFreeSpins, 1);
  assert.equal(result.mysteryAward.allyExtension || null, null);
}

{
  const css = fs.readFileSync(new URL("../ally-selection.css", import.meta.url), "utf8");
  const engine = fs.readFileSync(new URL("../js/ally-payouts.js", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.ally-hud-copy[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /grid-template-columns:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /white-space:\s*normal/);
  assert.match(css, /text-overflow:\s*clip/);
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/);
  assert.deepEqual(CONFIG.allyOrder.map(id => CONFIG.allies[id].abilityName),
    ["No Whammys", "Big Win", "Rage-Bait", "I’m Listening", "Eww", "Big Lemons", "Fastball"]);
  for (const action of ["three", "four", "stack", "final", "chain", "cap", "reload"]) {
    assert.match(engine, new RegExp(`data-extension-qa=\\"${action}\\"`));
  }
  assert.match(engine, /Total Awarded/);
  assert.match(engine, /ALLY SPIN/);
}

console.log("Ally Mystery extension tests: PASS (extension math, persistence, Ally state, cap overflow, synthetic stacked QA, and mobile HUD)");
