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
const cache = new Map();

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

function makeState(allyId = "sterling", sessionOverrides = {}) {
  return {
    schemaVersion: CONFIG.schemaVersion,
    coins: 1000,
    lineBetIndex: 0,
    sound: true,
    lastWin: 0,
    gamePhase: "free-spins",
    pendingSpin: null,
    fortuneMeter: { value: 0, charged: false },
    freeSpinSession: makeSession(allyId, sessionOverrides),
    mystery: app.mystery.createState(),
  };
}

function findOutcome(tokenCount, { retrigger = false, positive = null } = {}) {
  const key = `${tokenCount}:${retrigger}:${positive}`;
  if (cache.has(key)) return clone(cache.get(key));
  const probe = makeState();
  for (let first = 0; first < CONFIG.reels[0].length; first += 1) {
    for (let second = 0; second < CONFIG.reels[1].length; second += 1) {
      for (let third = 0; third < CONFIG.reels[2].length; third += 1) {
        const result = app.payouts.createSpinResult({
          targetStops: [first, second, third],
          featureRolls: { expandingWild: { roll: 1 } },
          state: app.freeSpins.getLockedSpinState(probe.freeSpinSession, probe),
          id: `probe-${first}-${second}-${third}`,
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
          const match = { targetStops: [first, second, third], featureRolls: { expandingWild: { roll: 1 } } };
          cache.set(key, clone(match));
          return match;
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
    id: options.id || `extension-${tokenCount}-${Math.random()}`,
    spinType: "free",
    referenceBet: state.freeSpinSession.referenceBet,
    totalAwardedSpins: state.freeSpinSession.totalAwardedSpins,
    mysteryModifiers: app.mystery.peekModifierQueue(state),
    allyBypass: options.allyBypass === true,
    mysterySkipRescue: true,
  });
}

function settleResult(state, result) {
  assert.equal(app.mystery.commitSpinStart(state, result), true);
  state.pendingSpin = result;
  return app.payouts.settlePendingSpinState(state);
}

// 3 and 4+ Tokens extend the active Ally session, not the ordinary queue.
{
  const state = makeState();
  const originalSessionId = state.freeSpinSession.sessionId;
  const originalAlly = state.freeSpinSession.ally.selectedId;
  const originalLineBet = state.freeSpinSession.lockedLineBet;
  const originalReferenceBet = state.freeSpinSession.referenceBet;
  const settled = settleResult(state, createResult(state, 3, { id: "three-token-extension" }));
  assert.equal(settled.mysterySettlement.allySpinsAdded, 1);
  assert.equal(state.freeSpinSession.remainingSpins, 2);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 5);
  assert.equal(state.mystery.queuedFreeSpins, 0);
  assert.equal(state.freeSpinSession.sessionId, originalSessionId);
  assert.equal(state.freeSpinSession.ally.selectedId, originalAlly);
  assert.equal(state.freeSpinSession.lockedLineBet, originalLineBet);
  assert.equal(state.freeSpinSession.referenceBet, originalReferenceBet);
  assert.equal(settled.mysteryAward.allyExtension.settlementStatus, "settled");
  assert.equal(settled.mysteryAward.allyExtension.presentationStatus, "ready");
}

{
  const state = makeState();
  const settled = settleResult(state, createResult(state, 4, { id: "four-token-extension" }));
  assert.equal(settled.mysterySettlement.allySpinsAdded, 2);
  assert.equal(state.freeSpinSession.remainingSpins, 3);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 6);
  assert.equal(state.mystery.queuedFreeSpins, 0);
}

// One and two Tokens never add Ally spins. Two still queues its modifier through the existing path.
for (const tokenCount of [1, 2]) {
  const state = makeState();
  const before = state.freeSpinSession.totalAwardedSpins;
  const settled = settleResult(state, createResult(state, tokenCount, { id: `no-extension-${tokenCount}` }));
  assert.equal(state.freeSpinSession.totalAwardedSpins, before);
  assert.equal(settled.mysteryAward?.allyExtension || null, null);
  if (tokenCount === 2) assert.equal(state.mystery.modifierQueue.length, 1);
}

// Natural retrigger and Mystery extension stack independently.
{
  const state = makeState();
  const settled = settleResult(state, createResult(state, 4, { retrigger: true, id: "combined-retrigger-extension" }));
  assert.equal(settled.freeSpinSettlement.retriggerApplied, 2);
  assert.equal(settled.mysterySettlement.allySpinsAdded, 2);
  assert.equal(state.freeSpinSession.remainingSpins, 5);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 8);
  assert.equal(settled.mysteryAward.allyExtension.naturalRetriggerSpins, 2);
}

// An extension on the final scheduled spin prevents premature completion and summary.
{
  const state = makeState("sterling", { remainingSpins: 1, completedSpins: 3, totalAwardedSpins: 4 });
  const settled = settleResult(state, createResult(state, 3, { id: "final-spin-extension" }));
  assert.equal(state.freeSpinSession.remainingSpins, 1);
  assert.equal(state.freeSpinSession.status, FS.PRESENTING);
  state.freeSpinSession = app.freeSpins.markFreeSpinPresented(state.freeSpinSession, settled.id);
  assert.equal(state.freeSpinSession.status, FS.READY);
  assert.equal(state.freeSpinSession.lastResult.mysteryAward.allyExtension.presentationStatus, "presented");
}

// Repeated extensions chain and every added spin counts toward completed spins and Feature Win.
{
  const state = makeState();
  let expectedWin = 0;
  for (let index = 0; index < 2; index += 1) {
    const settled = settleResult(state, createResult(state, 3, { id: `chain-${index}` }));
    expectedWin += settled.totalWin;
    state.freeSpinSession = app.freeSpins.markFreeSpinPresented(state.freeSpinSession, settled.id);
  }
  assert.equal(state.freeSpinSession.totalAwardedSpins, 6);
  assert.equal(state.freeSpinSession.completedSpins, 4);
  assert.equal(state.freeSpinSession.accumulatedWin, expectedWin);
  assert.equal(state.freeSpinSession.remainingSpins, 2);
}

// The next eligible Ally spin consumes the modifier exactly once.
{
  const state = makeState();
  settleResult(state, createResult(state, 3, { id: "modifier-extension" }));
  assert.equal(state.mystery.modifierQueue.length, 1);
  const next = createResult(state, 0, { id: "modifier-consumer" });
  assert.equal(next.mysteryActiveModifiers.length, 1);
  assert.equal(app.mystery.commitSpinStart(state, next), true);
  assert.equal(state.mystery.modifierQueue.length, 0);
}

// Capacity is applied to the Ally session first; overflow is preserved as an ordinary Mystery spin.
{
  const state = makeState("sterling", { remainingSpins: 1, completedSpins: 18, totalAwardedSpins: 19 });
  const settled = settleResult(state, createResult(state, 4, { id: "cap-overflow" }));
  assert.equal(settled.mysterySettlement.allySpinsAdded, 1);
  assert.equal(settled.mysterySettlement.overflowMysterySpins, 1);
  assert.equal(settled.mysterySettlement.overflowMysterySpinsQueued, 1);
  assert.equal(state.freeSpinSession.totalAwardedSpins, 20);
  assert.equal(state.freeSpinSession.remainingSpins, 1);
  assert.equal(state.mystery.queuedFreeSpins, 1);
}

// A full ordinary queue preserves additional overflow in the deferred exactly-once lane.
{
  const state = makeState("sterling", { remainingSpins: 1, completedSpins: 19, totalAwardedSpins: 20 });
  state.mystery.queuedFreeSpins = CONFIG.mystery.maximumQueuedFreeSpins;
  const settled = settleResult(state, createResult(state, 4, { id: "deferred-overflow" }));
  assert.equal(settled.mysterySettlement.allySpinsAdded, 0);
  assert.equal(settled.mysterySettlement.overflowMysterySpinsDeferred, 2);
  assert.equal(app.allyMysteryExtensions.deferredOverflow(state), 2);
  assert.equal(app.mystery.hasQueuedFreeSpin(state), true);
}

// Extension application does not reset any Ally-specific state.
for (const allyId of CONFIG.allyOrder) {
  const state = makeState(allyId);
  const before = clone(state.freeSpinSession.ally);
  const plan = {
    awardId: `pure-${allyId}`,
    sessionId: state.freeSpinSession.sessionId,
    allyId,
    tokenCount: 3,
    requestedSpins: 1,
    allySpinsAdded: 1,
    overflowMysterySpins: 0,
    modifier: { id: "fortune-burst", name: "Fortune Burst", stacks: 1 },
    applied: false,
  };
  const settled = {
    id: `pure-${allyId}`,
    spinType: "free",
    mysteryAward: { id: `pure-${allyId}`, allyExtension: plan },
    mysterySettlement: { applied: true, modifier: plan.modifier, freeSpinsAwarded: 1 },
  };
  app.allyMysteryExtensions.applyAllyMysteryExtension(state, settled, 0, 0);
  assert.deepEqual(state.freeSpinSession.ally, before, `${allyId} state changed while adding spins`);
}

// Ryan's selected boost remains consumed and is not moved onto an extension spin.
{
  const state = makeState("ryan", { completedSpins: 4, remainingSpins: 1, totalAwardedSpins: 5 });
  const result = createResult(state, 3, { id: "ryan-extension" });
  assert.equal(result.allyEffect?.allyId === "ryan", false);
  settleResult(state, result);
  assert.equal(state.freeSpinSession.ally.ryan.selectedSpinNumber, 2);
  assert.equal(state.freeSpinSession.ally.ryan.consumed, true);
}

// Reload before settlement applies once; reload after settlement cannot apply again.
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

// Paid and ordinary Mystery Free Spin behavior remains ordinary queue behavior.
for (const spinType of ["paid", "mystery-free"]) {
  const state = makeState();
  state.freeSpinSession = null;
  if (spinType === "mystery-free") state.mystery.queuedFreeSpins = 1;
  const outcome = findOutcome(3);
  const result = app.payouts.createSpinResult({
    ...outcome,
    state,
    id: `outside-${spinType}`,
    spinType,
    referenceBet: 5,
    totalAwardedSpins: 0,
    mysteryModifiers: [],
  });
  settleResult(state, result);
  assert.equal(state.mystery.queuedFreeSpins, 1);
  assert.equal(result.mysteryAward.allyExtension || null, null);
}

// Source and layout contracts.
{
  const css = fs.readFileSync(new URL("../ally-selection.css", import.meta.url), "utf8");
  const engine = fs.readFileSync(new URL("../js/ally-payouts.js", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.ally-hud-copy[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /grid-template-columns:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /\.ally-hud-copy[\s\S]*width:\s*100%/);
  assert.match(css, /white-space:\s*normal/);
  assert.match(css, /text-overflow:\s*clip/);
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/);
  assert.deepEqual(
    CONFIG.allyOrder.map(id => CONFIG.allies[id].abilityName),
    ["No Whammys", "Big Win", "Rage-Bait", "I’m Listening", "Eww", "Big Lemons", "Fastball"],
  );
  for (const action of ["three", "four", "stack", "final", "chain", "cap", "reload"]) {
    assert.match(engine, new RegExp(`data-extension-qa=\\"${action}\\"`));
  }
  assert.match(engine, /Total Awarded/);
  assert.match(engine, /ALLY SPIN/);
}

console.log("Ally Mystery extension tests: PASS (extension math, persistence, Ally state, cap overflow, QA, and mobile HUD)");
