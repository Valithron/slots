#!/usr/bin/env node

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, raw = "true"] = value.replace(/^--/, "").split("=");
  return [key, raw];
}));
const cycles = Math.max(1000, Math.floor(Number(args.cycles) || 500000));
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
await import("../js/strong-mystery-core.js");
await import("../js/strong-mystery-candidate.js");
await import("../js/strong-mystery-integration.js");
await import("../js/strong-mystery-presentation.js");
await import("../js/strong-mystery.js");
await import("../js/fortune-favor-core.js");

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

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function createState() {
  const state = app.persistence.defaultState();
  state.coins = 1_000_000_000;
  state.lineBetIndex = 0;
  state.fortuneMeter = { value: 0, charged: false };
  state.fortuneFavorFailures = 0;
  state.freeSpinSession = null;
  state.pendingSpin = null;
  state.mystery = app.mystery.createState();
  return state;
}

function randomStops(rng) {
  return CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
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
    targetStops: randomStops(rng),
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

function settleResult(state, result) {
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

function blankMetrics(label) {
  return {
    label,
    paidCycles: 0,
    wager: 0,
    payout: 0,
    rtp: 0,
    paidSpins: 0,
    mysteryFreeSpins: 0,
    allySpins: 0,
    fortuneMeterCompletions: 0,
    naturalFavorFeatures: 0,
    meterFavorFeatures: 0,
    combinedFavorFeatures: 0,
    favorDroughts: [],
    paidCyclesSinceFavor: 0,
    meterRolls: 0,
    randomSuccesses: 0,
    randomFailures: 0,
    guaranteedSuccesses: 0,
    failedAttemptsBeforeMeterSuccess: [],
    pityReached: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
    naturalThreeTreesOnCharged: 0,
    skippedMeterRolls: 0,
    chargesEarnedDuringFavor: 0,
    preservedChargeConsumptions: 0,
    awaitingPreservedCharge: false,
    backToBackFavor: 0,
    meterSoonAfterNatural: 0,
    lastFavorCycle: null,
    lastNaturalCycle: null,
    featureCapFrequency: 0,
    overflowFrequency: 0,
    maximumAllyFeaturePayout: 0,
    maximumPaidCyclePayout: 0,
    maximumCoherentSpinPayout: 0,
    fortuneFloodSpins: 0,
    fullFortuneSpins: 0,
    rescueSpins: 0,
    strongModifierChains: 0,
    maximumStrongChain: 0,
    currentStrongChain: 0,
    allyFeatureStarts: Object.fromEntries(allyIds.map(id => [id, 0])),
    allySpinsByAlly: Object.fromEntries(allyIds.map(id => [id, 0])),
    finalCoinBalance: 0,
    startingCoinBalance: 1_000_000_000,
  };
}

function recordFeatureStart(metrics, source, cycle, failuresBefore) {
  metrics.combinedFavorFeatures += 1;
  metrics.favorDroughts.push(metrics.paidCyclesSinceFavor);
  if (metrics.lastFavorCycle === cycle - 1) metrics.backToBackFavor += 1;
  metrics.lastFavorCycle = cycle;
  metrics.paidCyclesSinceFavor = 0;
  if (source === "natural") {
    metrics.naturalFavorFeatures += 1;
    metrics.lastNaturalCycle = cycle;
  } else {
    metrics.meterFavorFeatures += 1;
    metrics.failedAttemptsBeforeMeterSuccess.push(failuresBefore);
    if (metrics.lastNaturalCycle != null && cycle - metrics.lastNaturalCycle <= 5) metrics.meterSoonAfterNatural += 1;
  }
}

function recordResult(metrics, state, settled, spinType, cycle, meterBefore, sessionBefore, allyId) {
  metrics.maximumCoherentSpinPayout = Math.max(metrics.maximumCoherentSpinPayout, settled.totalWin || 0);
  if (spinType === "paid") metrics.paidSpins += 1;
  if (spinType === "mystery-free") metrics.mysteryFreeSpins += 1;
  if (spinType === "free") {
    metrics.allySpins += 1;
    if (allyId) metrics.allySpinsByAlly[allyId] += 1;
  }
  if (settled.fortuneSpin?.active) metrics.fortuneMeterCompletions += 1;

  const attempt = settled.fortuneFavor;
  if (attempt?.mode === "random") {
    metrics.meterRolls += 1;
    if (attempt.outcome === "success") metrics.randomSuccesses += 1;
    else metrics.randomFailures += 1;
  } else if (attempt?.mode === "guaranteed") metrics.guaranteedSuccesses += 1;
  else if (attempt?.outcome === "skipped-natural") {
    metrics.skippedMeterRolls += 1;
    metrics.naturalThreeTreesOnCharged += 1;
  }

  const failuresAfter = Math.min(4, Math.max(0, state.fortuneFavorFailures || 0));
  metrics.pityReached[failuresAfter] += 1;

  const trigger = Boolean(settled.freeSpinTrigger?.triggered && settled.freeSpinTrigger?.awardedSpins > 0);
  if (["paid", "mystery-free"].includes(spinType) && trigger) recordFeatureStart(metrics, "natural", cycle, failuresAfter);
  else if (attempt?.awarded && attempt.awardApplied) recordFeatureStart(metrics, "meter", cycle, attempt.pityBefore);

  if (spinType === "free" && !meterBefore.charged && state.fortuneMeter?.charged) {
    metrics.chargesEarnedDuringFavor += 1;
    metrics.awaitingPreservedCharge = true;
  }
  if (["paid", "mystery-free"].includes(spinType) && settled.fortuneSpin?.active && metrics.awaitingPreservedCharge && !sessionBefore) {
    metrics.preservedChargeConsumptions += 1;
    metrics.awaitingPreservedCharge = false;
  }

  if (settled.mysterySettlement?.allyCapReached || settled.freeSpinTrigger?.capped) metrics.featureCapFrequency += 1;
  if ((settled.mysterySettlement?.overflowMysterySpins || 0) > 0 || (settled.mysterySettlement?.overflowMysterySpinsDeferred || 0) > 0) metrics.overflowFrequency += 1;
  const strongIds = (settled.strongMysteryActiveModifiers || []).map(item => item.id);
  if (strongIds.includes("fortune-flood")) metrics.fortuneFloodSpins += 1;
  if (strongIds.includes("full-fortune")) metrics.fullFortuneSpins += 1;
  if (settled.mysteryRescue?.attemptsUsed > 0) metrics.rescueSpins += 1;
  const strongFollowUp = settled.mysteryAward?.modifier?.tier === "strong" || settled.mysteryAward?.modifier?.actualTier === "strong";
  if (strongFollowUp) {
    metrics.currentStrongChain = strongIds.length ? metrics.currentStrongChain + 1 : 1;
    metrics.strongModifierChains += 1;
    metrics.maximumStrongChain = Math.max(metrics.maximumStrongChain, metrics.currentStrongChain);
  } else if (strongIds.length) {
    metrics.maximumStrongChain = Math.max(metrics.maximumStrongChain, metrics.currentStrongChain);
    metrics.currentStrongChain = 0;
  }
}

function finalizeMetrics(metrics, state) {
  metrics.rtp = metrics.wager ? metrics.payout / metrics.wager : 0;
  metrics.finalCoinBalance = state.coins;
  const favorTotal = metrics.combinedFavorFeatures || 1;
  const meterSuccesses = metrics.randomSuccesses + metrics.guaranteedSuccesses;
  const pitySamples = metrics.failedAttemptsBeforeMeterSuccess;
  const droughts = metrics.favorDroughts;
  metrics.rates = {
    fortuneMeterCompletionsPer100PaidSpins: metrics.paidSpins ? metrics.fortuneMeterCompletions / metrics.paidSpins * 100 : 0,
    meterFavorFeaturesPer100PaidSpins: metrics.paidSpins ? metrics.meterFavorFeatures / metrics.paidSpins * 100 : 0,
    naturalFavorFrequencyPer100PaidSpins: metrics.paidSpins ? metrics.naturalFavorFeatures / metrics.paidSpins * 100 : 0,
    meterFavorFrequencyPer100PaidSpins: metrics.paidSpins ? metrics.meterFavorFeatures / metrics.paidSpins * 100 : 0,
    combinedFavorFrequencyPer100PaidSpins: metrics.paidSpins ? metrics.combinedFavorFeatures / metrics.paidSpins * 100 : 0,
    naturalShare: metrics.naturalFavorFeatures / favorTotal,
    meterShare: metrics.meterFavorFeatures / favorTotal,
    allySpinsPer100PaidSpins: metrics.paidSpins ? metrics.allySpins / metrics.paidSpins * 100 : 0,
    randomRollSuccessFrequency: metrics.meterRolls ? metrics.randomSuccesses / metrics.meterRolls : 0,
    failedRollFrequency: metrics.meterRolls ? metrics.randomFailures / metrics.meterRolls : 0,
    guaranteedShareOfMeterSuccesses: meterSuccesses ? metrics.guaranteedSuccesses / meterSuccesses : 0,
    averageFailedAttemptsBeforeMeterSuccess: pitySamples.length ? pitySamples.reduce((sum, value) => sum + value, 0) / pitySamples.length : 0,
    averageCompletedMetersPerMeterFavor: metrics.meterFavorFeatures ? metrics.fortuneMeterCompletions / metrics.meterFavorFeatures : 0,
    averagePaidSpinsBetweenFavorFeatures: metrics.combinedFavorFeatures ? metrics.paidSpins / metrics.combinedFavorFeatures : 0,
  };
  metrics.drought = {
    median: percentile(droughts, .5),
    p90: percentile(droughts, .9),
    p95: percentile(droughts, .95),
    longest: droughts.length ? Math.max(...droughts) : 0,
  };
  metrics.pityDistribution = {
    reachedOneLeaf: metrics.pityReached[1],
    reachedTwoLeaves: metrics.pityReached[2],
    reachedThreeLeaves: metrics.pityReached[3],
    reachedFourLeaves: metrics.pityReached[4],
  };
  delete metrics.favorDroughts;
  delete metrics.paidCyclesSinceFavor;
  delete metrics.currentStrongChain;
  delete metrics.awaitingPreservedCharge;
  return metrics;
}

function runSimulation({ count, runSeed, enabled, allyId = null, label }) {
  app.fortuneFavor.setEnabledForSimulation(enabled);
  const rng = rngFrom(runSeed);
  const state = createState();
  const metrics = blankMetrics(label);

  for (let cycle = 0; cycle < count; cycle += 1) {
    metrics.paidCycles += 1;
    metrics.paidCyclesSinceFavor += 1;
    metrics.wager += app.payouts.getTotalBet(state);
    let cyclePayout = 0;
    let featurePayout = 0;
    let spinType = "paid";
    let spinGuard = 0;

    while (spinGuard++ < 500) {
      let selectedAlly = null;
      if (state.freeSpinSession?.active) {
        selectedAlly = allyId || allyIds[cycle % allyIds.length];
        if (!state.freeSpinSession.ally?.featureStarted) {
          initializeAlly(state, selectedAlly, rng);
          metrics.allyFeatureStarts[selectedAlly] += 1;
        } else selectedAlly = state.freeSpinSession.ally?.selectedId || selectedAlly;
        spinType = "free";
      } else if (app.mystery.hasQueuedFreeSpin(state)) spinType = "mystery-free";
      else if (spinType !== "paid") break;

      const meterBefore = { ...state.fortuneMeter };
      const sessionBefore = Boolean(state.freeSpinSession?.active);
      const settled = settleResult(state, createResult(state, spinType, rng, `${label}-${cycle}-${spinGuard}`));
      recordResult(metrics, state, settled, spinType, cycle, meterBefore, sessionBefore, selectedAlly);
      cyclePayout += settled.totalWin || 0;
      if (spinType === "free") featurePayout += settled.totalWin || 0;

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

    if (spinGuard >= 500) throw new Error(`Spin guard reached at paid cycle ${cycle}`);
    metrics.payout += cyclePayout;
    metrics.maximumPaidCyclePayout = Math.max(metrics.maximumPaidCyclePayout, cyclePayout);
    metrics.maximumAllyFeaturePayout = Math.max(metrics.maximumAllyFeaturePayout, featurePayout);
  }

  return finalizeMetrics(metrics, state);
}

const baseline = runSimulation({ count: cycles, runSeed: seed, enabled: false, label: "baseline-fortune-spin-only" });
const upgrade = runSimulation({ count: cycles, runSeed: seed, enabled: true, label: "fortune-favor-pity" });
const byAlly = {};
if (allyCycles > 0) {
  const perAlly = Math.max(1000, Math.floor(allyCycles / Math.max(1, allyIds.length)));
  for (let index = 0; index < allyIds.length; index += 1) {
    const id = allyIds[index];
    const allySeed = (seed + ((index + 1) * 0x9e3779b9)) >>> 0;
    byAlly[id] = {
      baseline: runSimulation({ count: perAlly, runSeed: allySeed, enabled: false, allyId: id, label: `baseline-${id}` }),
      upgrade: runSimulation({ count: perAlly, runSeed: allySeed, enabled: true, allyId: id, label: `upgrade-${id}` }),
    };
  }
}
app.fortuneFavor.setEnabledForSimulation(null);

const report = {
  seed,
  generatedAt: new Date().toISOString(),
  paidCycles: cycles,
  allyCyclesTotal: allyCycles,
  mechanic: {
    multiplier: CONFIG.fortuneMeter.multiplier,
    chanceAttemptsOneThroughFour: CONFIG.fortuneFavor.chance,
    guaranteedAttempt: CONFIG.fortuneFavor.guaranteedAttempt,
    naturalTriggersPreservePity: true,
  },
  baseline,
  upgrade,
  delta: {
    rtp: upgrade.rtp - baseline.rtp,
    combinedFavorFrequencyPer100PaidSpins: upgrade.rates.combinedFavorFrequencyPer100PaidSpins - baseline.rates.combinedFavorFrequencyPer100PaidSpins,
    allySpinsPer100PaidSpins: upgrade.rates.allySpinsPer100PaidSpins - baseline.rates.allySpinsPer100PaidSpins,
    finalCoinBalance: upgrade.finalCoinBalance - baseline.finalCoinBalance,
  },
  byAlly: Object.fromEntries(Object.entries(byAlly).map(([id, value]) => [id, {
    baselineRtp: value.baseline.rtp,
    upgradeRtp: value.upgrade.rtp,
    rtpDelta: value.upgrade.rtp - value.baseline.rtp,
    baselineMaximumFeaturePayout: value.baseline.maximumAllyFeaturePayout,
    upgradeMaximumFeaturePayout: value.upgrade.maximumAllyFeaturePayout,
  }])),
  balanceBoundary: {
    compensatingNerfsApplied: false,
    reelStripsChanged: false,
    naturalTriggerFrequencyChangedByConfiguration: false,
    payoutsChanged: false,
    mysteryFrequencyChanged: false,
    strongModifierStrengthChanged: false,
    fortuneMultiplierChanged: false,
  },
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Fortune Meter → Fortune’s Favor matched simulation");
  console.log(`Seed: ${seed}`);
  console.log(`Paid cycles per model: ${cycles.toLocaleString()}`);
  console.log(`Baseline RTP: ${(baseline.rtp * 100).toFixed(4)}%`);
  console.log(`Upgrade RTP: ${(upgrade.rtp * 100).toFixed(4)}%`);
  console.log(`RTP lift: ${(report.delta.rtp * 100).toFixed(4)} percentage points`);
  console.log(`Meter-awarded Favor / 100 paid spins: ${upgrade.rates.meterFavorFeaturesPer100PaidSpins.toFixed(4)}`);
  console.log(`Natural / meter share: ${(upgrade.rates.naturalShare * 100).toFixed(2)}% / ${(upgrade.rates.meterShare * 100).toFixed(2)}%`);
  console.log(`Random Favor roll success: ${(upgrade.rates.randomRollSuccessFrequency * 100).toFixed(3)}%`);
  console.log(`Guaranteed share of meter successes: ${(upgrade.rates.guaranteedShareOfMeterSuccesses * 100).toFixed(3)}%`);
  console.log(`Favor drought median / p90 / p95 / max: ${upgrade.drought.median} / ${upgrade.drought.p90} / ${upgrade.drought.p95} / ${upgrade.drought.longest}`);
  console.log(`Maximum Ally feature payout: ${upgrade.maximumAllyFeaturePayout}`);
  console.log(`Maximum complete paid-cycle payout: ${upgrade.maximumPaidCyclePayout}`);
  console.log("No compensating nerfs were applied.");
}