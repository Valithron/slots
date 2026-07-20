#!/usr/bin/env node

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, raw = "true"] = value.replace(/^--/, "").split("=");
  return [key, raw];
}));
const cycles = Math.max(100, Math.floor(Number(args.cycles) || 500000));
const allyCycles = Math.max(0, Math.floor(Number(args["ally-cycles"]) || 100000));
const seed = (Number(args.seed) || 1297634388) >>> 0;
const json = args.json === "true";

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
const { CONFIG } = app;
const allyIds = CONFIG.allyOrder || Object.keys(CONFIG.allies || {});

function rngFrom(initial) {
  let value = initial >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function createState() {
  const state = app.persistence.defaultState();
  state.coins = 1_000_000_000;
  state.lineBetIndex = 0;
  state.fortuneMeter = { value: 0, charged: false };
  state.freeSpinSession = null;
  state.pendingSpin = null;
  state.mystery = app.mystery.createState();
  return state;
}

function initializeAlly(state, allyId, rng) {
  if (!state.freeSpinSession?.active || state.freeSpinSession.ally?.featureStarted) return;
  state.freeSpinSession = app.allies.setPendingSelection(state.freeSpinSession, allyId);
  state.freeSpinSession = app.allies.confirmSelection(state.freeSpinSession, allyId, rng);
  state.freeSpinSession = app.allies.beginFeature(state.freeSpinSession);
  state.freeSpinSession.status = app.freeSpins.FREE_SPIN_STATUSES.READY;
}

function createResult(state, spinType, rng, id) {
  const session = state.freeSpinSession;
  const spinState = spinType === "free" ? app.freeSpins.getLockedSpinState(session, state) : state;
  return app.payouts.createSpinResult({
    targetStops: CONFIG.reels.map(reel => Math.floor(rng() * reel.length)),
    state: spinState,
    id,
    spinType,
    referenceBet: spinType === "free" ? session.referenceBet : app.payouts.getTotalBet(state),
    totalAwardedSpins: session?.totalAwardedSpins || 0,
    featureRolls: { expandingWild: { roll: Math.floor(rng() * CONFIG.expandingWild.outcomes) } },
    mysteryModifiers: app.mystery.peekModifierQueue(spinState),
    rng,
  });
}

function settle(state, result) {
  if (!app.mystery.commitSpinStart(state, result)) throw new Error(`Failed to commit ${result.id}`);
  app.payouts.consumeFortuneChargeState(state, result);
  state.coins -= result.coinCost;
  state.pendingSpin = result;
  return app.payouts.settlePendingSpinState(state);
}

function finishFeature(state) {
  if (!state.freeSpinSession?.active || state.freeSpinSession.remainingSpins > 0) return 0;
  const before = state.coins;
  app.allies.finalizeSession(state);
  const bonus = state.coins - before;
  state.freeSpinSession = null;
  return bonus;
}

function run({ count, runSeed, allyId = null, label }) {
  const rng = rngFrom(runSeed);
  const state = createState();
  const metrics = {
    label,
    cycles: 0,
    wager: 0,
    payout: 0,
    rtp: 0,
    mysterySpins: 0,
    allySpins: 0,
    strongAwards: 0,
    maximumCoherentSpin: 0,
    maximumPaidCyclePayout: 0,
    maximumAllyFeaturePayout: 0,
    guardTrips: 0,
  };

  for (let cycle = 0; cycle < count; cycle += 1) {
    metrics.cycles += 1;
    metrics.wager += app.payouts.getTotalBet(state);
    let cyclePayout = 0;
    let featurePayout = 0;
    let spinType = "paid";
    let spinGuard = 0;

    while (spinGuard++ < 500) {
      if (state.freeSpinSession?.active) {
        initializeAlly(state, allyId || allyIds[cycle % allyIds.length], rng);
        spinType = "free";
      } else if (app.mystery.hasQueuedFreeSpin(state)) {
        spinType = "mystery-free";
      } else if (spinType !== "paid") {
        break;
      }

      const result = createResult(state, spinType, rng, `${label}-${cycle}-${spinGuard}`);
      const settled = settle(state, result);
      const payout = settled.totalWin || 0;
      cyclePayout += payout;
      metrics.maximumCoherentSpin = Math.max(metrics.maximumCoherentSpin, payout);
      if (spinType === "mystery-free") metrics.mysterySpins += 1;
      if (spinType === "free") {
        metrics.allySpins += 1;
        featurePayout += payout;
      }
      const award = settled.mysteryAward?.modifier;
      if (award?.tier === "strong" || award?.actualTier === "strong") metrics.strongAwards += 1;

      if (spinType === "free") {
        state.freeSpinSession = app.freeSpins.markFreeSpinPresented(state.freeSpinSession, settled.id);
        if (state.freeSpinSession.remainingSpins <= 0) {
          const bonus = finishFeature(state);
          cyclePayout += bonus;
          featurePayout += bonus;
        }
      }
      if (spinType === "paid") spinType = "drain";
    }

    if (spinGuard >= 500) metrics.guardTrips += 1;
    metrics.payout += cyclePayout;
    metrics.maximumPaidCyclePayout = Math.max(metrics.maximumPaidCyclePayout, cyclePayout);
    metrics.maximumAllyFeaturePayout = Math.max(metrics.maximumAllyFeaturePayout, featurePayout);
  }

  metrics.rtp = metrics.wager ? metrics.payout / metrics.wager : 0;
  metrics.strongAwardFrequency = metrics.cycles ? metrics.strongAwards / metrics.cycles : 0;
  return metrics;
}

function runByAlly(total, phaseSeed, label) {
  const perAlly = total > 0 ? Math.max(100, Math.floor(total / Math.max(1, allyIds.length))) : 0;
  const rows = {};
  if (!perAlly) return { requestedCycles: total, actualCycles: 0, rows };
  allyIds.forEach((allyId, index) => {
    rows[allyId] = run({
      count: perAlly,
      runSeed: (phaseSeed + ((index + 1) * 0x9e3779b9)) >>> 0,
      allyId,
      label: `${label}-${allyId}`,
    });
  });
  return { requestedCycles: total, actualCycles: perAlly * allyIds.length, rows };
}

const before = run({ count: cycles, runSeed: seed, label: "before-strong" });
const beforeAllies = runByAlly(allyCycles, seed, "before-strong-ally");

await import("../js/strong-mystery-core.js");
await import("../js/strong-mystery-candidate.js");
await import("../js/strong-mystery-integration.js");
await import("../js/strong-mystery-presentation.js");
await import("../js/strong-mystery.js");

const after = run({ count: cycles, runSeed: seed, label: "after-strong" });
const afterAllies = runByAlly(allyCycles, seed, "after-strong-ally");

const byAlly = Object.fromEntries(allyIds.map(id => {
  const beforeRow = beforeAllies.rows[id];
  const afterRow = afterAllies.rows[id];
  return [id, {
    cyclesBefore: beforeRow?.cycles || 0,
    cyclesAfter: afterRow?.cycles || 0,
    rtpBefore: beforeRow?.rtp || 0,
    rtpAfter: afterRow?.rtp || 0,
    rtpDelta: (afterRow?.rtp || 0) - (beforeRow?.rtp || 0),
    maximumPaidCyclePayoutBefore: beforeRow?.maximumPaidCyclePayout || 0,
    maximumPaidCyclePayoutAfter: afterRow?.maximumPaidCyclePayout || 0,
    maximumAllyFeaturePayoutBefore: beforeRow?.maximumAllyFeaturePayout || 0,
    maximumAllyFeaturePayoutAfter: afterRow?.maximumAllyFeaturePayout || 0,
    strongAwardFrequency: afterRow?.strongAwardFrequency || 0,
  }];
}));

const report = {
  seed,
  generatedAt: new Date().toISOString(),
  paidCyclesPerMode: cycles,
  allyCyclesRequestedPerMode: allyCycles,
  allyCyclesActualPerMode: afterAllies.actualCycles,
  before,
  after,
  rtpDelta: after.rtp - before.rtp,
  byAlly,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = value => `${(value * 100).toFixed(4)}%`;
  console.log("Strong Mystery matched before/after audit");
  console.log(`Seed: ${seed}`);
  console.log(`Paid cycles per mode: ${cycles.toLocaleString()}`);
  console.log(`Before RTP: ${pct(before.rtp)}`);
  console.log(`After RTP: ${pct(after.rtp)}`);
  console.log(`RTP delta: ${pct(report.rtpDelta)}`);
  console.log(`Ally cycles per mode: ${afterAllies.actualCycles.toLocalString()}`);
  Object.entries(byAlly).forEach(([id, row]) => {
    console.log(`  ${id}: ${pct(row.rtpBefore)} -> ${pct(row.rtpAfter)} (${pct(row.rtpDelta)})`);
  });
}
