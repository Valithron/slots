import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sourcePath = fs.existsSync(path.join(root, "js/fortune-favor-core.js"))
  ? path.join(root, "js/fortune-favor-core.js")
  : path.resolve("/mnt/data/fortune-favor-core.js");
const uiPath = fs.existsSync(path.join(root, "js/fortune-favor-ui.js"))
  ? path.join(root, "js/fortune-favor-ui.js")
  : path.resolve("/mnt/data/fortune-favor-ui.js");
const qaPath = fs.existsSync(path.join(root, "js/fortune-favor-qa.js"))
  ? path.join(root, "js/fortune-favor-qa.js")
  : path.resolve("/mnt/data/fortune-favor-qa.js");
const source = fs.readFileSync(sourcePath, "utf8");
const uiSource = fs.readFileSync(uiPath, "utf8");
const qaSource = fs.readFileSync(qaPath, "utf8");

function createHarness({ roll = 0.5 } = {}) {
  const storage = new Map();
  let currentRoll = roll;
  let rngCalls = 0;
  const CONFIG = {
    freeSpins: { startingAward: 4 },
    fortuneMeter: { capacity: 100, multiplier: 1.5 },
    paylines: [[0, 0, 0]],
    lineBets: [1],
  };
  const app = {
    CONFIG,
    constants: { storageKey: "test-state", legacyStorageKeys: [] },
    qa: { enabled: false },
    mystery: {
      peekModifierQueue: () => [],
      commitSpinStart: () => true,
      setQueuedFreeSpins(state, amount) { state.mystery.queuedFreeSpins = amount; },
    },
    persistence: {
      normalizePendingSpin: spin => spin ? structuredClone(spin) : null,
      defaultState: () => ({ fortuneMeter: { value: 0, charged: false }, fortuneFavorFailures: 0 }),
      loadState: () => ({ fortuneMeter: { value: 0, charged: false }, fortuneFavorFailures: 0 }),
      saveState(state) {
        storage.set("test-state", JSON.stringify(state));
        return true;
      },
    },
    freeSpins: {
      createFreeSpinSession(result) {
        if (!result?.freeSpinTrigger?.triggered) return null;
        return {
          active: true,
          triggerSpinId: result.id,
          triggerTreeCells: result.freeSpinTrigger.treeCells || [],
          triggerResult: structuredClone(result),
          startingSpins: result.freeSpinTrigger.awardedSpins,
        };
      },
    },
    payouts: {
      getTotalBet: () => 5,
      consumeFortuneChargeState(state, result) {
        if (!result?.fortuneSpin?.active) return false;
        state.fortuneMeter = { value: 0, charged: false };
        return true;
      },
      createSpinResult(options) {
        return {
          id: options.id,
          spinType: options.spinType,
          fortuneSpin: { active: options.state.fortuneMeter.charged, multiplier: 1.5, consumedCharge: options.state.fortuneMeter.charged },
          freeSpinTrigger: options.naturalTrigger
            ? { triggered: true, awardedSpins: 4, treeCells: [{ row: 0, reel: 0 }, { row: 0, reel: 1 }, { row: 0, reel: 2 }] }
            : { triggered: false, awardedSpins: 0, treeCells: [] },
          totalWin: 0,
          coinCost: options.spinType === "paid" ? 5 : 0,
          settlementStatus: "pending",
        };
      },
      settlePendingSpinState(state) {
        if (!state.pendingSpin) return null;
        const result = { ...structuredClone(state.pendingSpin), settlementStatus: "settled" };
        state.pendingSpin = null;
        if (result.freeSpinTrigger?.triggered) state.freeSpinSession = app.freeSpins.createFreeSpinSession(result);
        return result;
      },
    },
  };
  const context = vm.createContext({
    console,
    structuredClone,
    Math: Object.create(Math),
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    URLSearchParams,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    setTimeout: () => 1,
    clearTimeout() {},
    CommuneFortune: app,
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: sourcePath });
  return {
    app,
    storage,
    rng: () => { rngCalls += 1; return currentRoll; },
    setRoll(value) { currentRoll = value; },
    rngCalls: () => rngCalls,
  };
}

const harness = createHarness();
const favor = harness.app.fortuneFavor;
assert.ok(favor, "fortuneFavor API should install");
assert.deepEqual(
  Object.fromEntries(Object.entries(favor.config)),
  { enabled: true, chance: 0.1, guaranteedAttempt: 5, pityFailureCap: 4, startingSpins: 4 },
);

for (let failures = 0; failures < 4; failures += 1) {
  const callsBefore = harness.rngCalls();
  const failure = favor.resolveAttempt({ pityFailures: failures, rng: harness.rng, sourceSpinId: `failure-${failures}` });
  assert.equal(failure.mode, "random");
  assert.equal(failure.chance, 0.1);
  assert.equal(failure.outcome, "failure");
  assert.equal(failure.pityBefore, failures);
  assert.equal(failure.pityAfter, failures + 1);
  assert.equal(harness.rngCalls(), callsBefore + 1, "attempts one through four use one saved RNG draw");
}

harness.setRoll(0.099999);
const success = favor.resolveAttempt({ pityFailures: 3, rng: harness.rng, sourceSpinId: "success" });
assert.equal(success.outcome, "success");
assert.equal(success.pityAfter, 0);
assert.equal(success.guaranteed, false);

harness.setRoll(0.1);
const boundaryFailure = favor.resolveAttempt({ pityFailures: 0, rng: harness.rng });
assert.equal(boundaryFailure.outcome, "failure", "10 percent boundary is exclusive");

const callsBeforeGuarantee = harness.rngCalls();
const guaranteed = favor.resolveAttempt({ pityFailures: 4, rng: harness.rng, sourceSpinId: "guaranteed" });
assert.equal(guaranteed.outcome, "success");
assert.equal(guaranteed.mode, "guaranteed");
assert.equal(guaranteed.attemptNumber, 5);
assert.equal(guaranteed.roll, null);
assert.equal(harness.rngCalls(), callsBeforeGuarantee, "guaranteed fifth attempt consumes no RNG draw");

const skipped = favor.resolveAttempt({ pityFailures: 2, naturalTrigger: true, rng: harness.rng });
assert.equal(skipped.outcome, "skipped-natural");
assert.equal(skipped.pityBefore, 2);
assert.equal(skipped.pityAfter, 2);
assert.equal(skipped.roll, null);
assert.equal(harness.rngCalls(), callsBeforeGuarantee, "natural Three Trees consumes no Favor RNG draw");

assert.equal(favor.normalizeFailures(-9), 0);
assert.equal(favor.normalizeFailures(2.9), 2);
assert.equal(favor.normalizeFailures(99), 4);
assert.match(favor.getProgressLabel(2), /2 of 4 failed meter attempts/);
assert.match(favor.getProgressLabel(4), /guarantees Fortune’s Favor/);

function makeState(failures = 0) {
  return {
    coins: 100,
    fortuneMeter: { value: 100, charged: true },
    fortuneFavorFailures: failures,
    pendingSpin: null,
    freeSpinSession: null,
    mystery: { queuedFreeSpins: 0 },
  };
}

harness.setRoll(0.5);
const failureState = makeState(1);
const failureResult = harness.app.payouts.createSpinResult({ id: "spin-failure", spinType: "paid", state: failureState, rng: harness.rng });
assert.equal(failureResult.fortuneFavor.outcome, "failure");
failureState.pendingSpin = failureResult;
const settledFailure = harness.app.payouts.settlePendingSpinState(failureState);
assert.equal(failureState.fortuneFavorFailures, 2);
assert.equal(settledFailure.fortuneFavor.pityIncremented, true);
assert.equal(failureState.freeSpinSession, null);
assert.equal(harness.app.payouts.settlePendingSpinState(failureState), null, "settlement is exactly once");
assert.equal(failureState.fortuneFavorFailures, 2, "pity cannot increment twice");

harness.setRoll(0.01);
const successState = makeState(3);
const successResult = harness.app.payouts.createSpinResult({ id: "spin-success", spinType: "paid", state: successState, rng: harness.rng });
successState.pendingSpin = successResult;
const settledSuccess = harness.app.payouts.settlePendingSpinState(successState);
assert.equal(successState.fortuneFavorFailures, 0);
assert.equal(settledSuccess.fortuneFavor.pityReset, true);
assert.equal(settledSuccess.fortuneFavor.awardApplied, true);
assert.equal(successState.freeSpinSession?.triggerSource, "fortune-meter");
assert.equal(successState.freeSpinSession?.startingSpins, 4);
assert.equal(successState.freeSpinSession?.triggerResult?.freeSpinTrigger?.triggered, false, "meter award does not synthesize a natural Three Trees result");

const naturalState = makeState(2);
const naturalResult = harness.app.payouts.createSpinResult({ id: "spin-natural", spinType: "paid", state: naturalState, rng: harness.rng, naturalTrigger: true });
assert.equal(naturalResult.fortuneFavor.outcome, "skipped-natural");
naturalState.pendingSpin = naturalResult;
const settledNatural = harness.app.payouts.settlePendingSpinState(naturalState);
assert.equal(naturalState.fortuneFavorFailures, 2);
assert.equal(settledNatural.fortuneFavor.pityIncremented, false);
assert.equal(settledNatural.fortuneFavor.pityReset, false);
assert.equal(naturalState.freeSpinSession?.triggerSpinId, "spin-natural");

const allySpinState = makeState(4);
const allyResult = harness.app.payouts.createSpinResult({ id: "ally", spinType: "free", state: allySpinState, rng: harness.rng });
assert.equal(allyResult.fortuneFavor, undefined, "Ally Free Spins never roll meter Favor");

const probeState = makeState(0);
const probe = harness.app.payouts.createSpinResult({ id: "qa-probe-test", spinType: "paid", state: probeState, rng: harness.rng, allyBypass: true });
assert.equal(probe.fortuneFavor, undefined, "QA probes do not consume authoritative Favor RNG");

const persistenceState = makeState(4);
harness.app.persistence.saveState(persistenceState);
const stored = JSON.parse(harness.storage.get("test-state"));
assert.equal(stored.fortuneFavorFailures, 4);

for (const marker of [
  "chance: 0.10",
  "guaranteedAttempt: 5",
  "pityFailureCap: 4",
  "skipped-natural",
  "fortuneFavorFailures",
  "presentationShown",
  "featureStartTransitionCompleted",
]) assert.ok(source.includes(marker), `missing core source contract: ${marker}`);
for (const marker of ["Favor Guaranteed", "FORTUNE’S FAVOR AWARDED", "data-favor-leaf"]) assert.ok(uiSource.includes(marker), `missing UI source contract: ${marker}`);
for (const marker of ["pending-guaranteed", "Natural Three Trees · Charged", "Preview Guaranteed"]) assert.ok(qaSource.includes(marker), `missing QA source contract: ${marker}`);
assert.doesNotMatch(source, /forceTrees|replaceSymbols|syntheticThreeTrees|Math\.random\(\)\s*<\s*\(0\.1\s*\+/);

console.log("Fortune Favor deterministic contracts passed: flat 10% attempts, guaranteed fifth attempt, natural-trigger skip, reload-safe metadata, exactly-once pity, and meter-awarded feature start.");