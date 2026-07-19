#!/usr/bin/env node

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
const { CONFIG, payouts } = app;
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = true] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const cycles = Math.max(1, Number(args.get("cycles") || 50000));
const allyCycles = Math.max(1, Number(args.get("ally-cycles") || cycles));
const seed = Number(args.get("seed") || 1297634388) >>> 0;
const outputJson = args.has("json");
const check = args.has("check");
const wager = payouts.getTotalBet({ lineBetIndex: 0 });
const ALLY_IDS = [...CONFIG.allyOrder];
const FS = app.freeSpins.FREE_SPIN_STATUSES;

function seededRandom(initial) {
  let value = initial >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function percentage(value) {
  return `${(100 * value).toFixed(4)}%`;
}

function makeState() {
  return {
    coins: 1_000_000_000,
    lineBetIndex: 0,
    fortuneMeter: { value: 0, charged: false },
    freeSpinSession: null,
    pendingSpin: null,
    lastWin: 0,
    mystery: app.mystery.createState(),
  };
}

function createRawMetrics(allyId, mode, runCycles, runSeed) {
  return {
    allyId,
    mode,
    cycles: runCycles,
    seed: runSeed,
    totalWagered: runCycles * wager,
    totalPayout: 0,
    paidSpins: 0,
    mysteryFreeSpins: 0,
    allyFreeSpins: 0,
    features: 0,
    featurePayout: 0,
    zeroPayFeatures: 0,
    featureSpins: 0,
    mysteryAddedAllySpins: 0,
    featuresWithExtension: 0,
    featuresWithMultipleExtensions: 0,
    naturalRetriggerEvents: 0,
    mysteryExtensionEvents: 0,
    combinedRetriggerExtensionEvents: 0,
    capFeatures: 0,
    overflowFeatures: 0,
    overflowMysterySpins: 0,
    maximumFeatureLength: 0,
    maximumFeaturePayout: 0,
    maximumPaidCyclePayout: 0,
    maximumSinglePayout: 0,
    ryanBoostActivations: 0,
    rescueResults: 0,
    rescueAttemptsUsed: 0,
    rescueProtectedMeaningfulResults: 0,
    rescueProtectedTwoPlusTokenResults: 0,
    rescueProtectedTreeResults: 0,
    rescueProtectedFortuneResults: 0,
    guardTrips: 0,
  };
}

function summarize(metrics) {
  return {
    allyId: metrics.allyId,
    allyName: CONFIG.allies[metrics.allyId].name,
    abilityName: CONFIG.allies[metrics.allyId].abilityName,
    mode: metrics.mode,
    cycles: metrics.cycles,
    seed: metrics.seed,
    rtp: metrics.totalPayout / Math.max(1, metrics.totalWagered),
    totalPayout: metrics.totalPayout,
    totalWagered: metrics.totalWagered,
    paidSpins: metrics.paidSpins,
    mysteryFreeSpins: metrics.mysteryFreeSpins,
    allyFreeSpins: metrics.allyFreeSpins,
    features: metrics.features,
    averageAllySpinsPerFeature: metrics.featureSpins / Math.max(1, metrics.features),
    averageMysteryAddedAllySpinsPerFeature: metrics.mysteryAddedAllySpins / Math.max(1, metrics.features),
    featureExtensionFrequency: metrics.featuresWithExtension / Math.max(1, metrics.features),
    multipleExtensionFeatureFrequency: metrics.featuresWithMultipleExtensions / Math.max(1, metrics.features),
    averageFeaturePayout: metrics.featurePayout / Math.max(1, metrics.features),
    zeroPayFeatureFrequency: metrics.zeroPayFeatures / Math.max(1, metrics.features),
    maximumObservedFeatureLength: metrics.maximumFeatureLength,
    maximumObservedFeaturePayout: metrics.maximumFeaturePayout,
    maximumObservedPaidCyclePayout: metrics.maximumPaidCyclePayout,
    maximumObservedSinglePayout: metrics.maximumSinglePayout,
    naturalRetriggerFrequencyPerAllySpin: metrics.naturalRetriggerEvents / Math.max(1, metrics.allyFreeSpins),
    mysteryExtensionFrequencyPerAllySpin: metrics.mysteryExtensionEvents / Math.max(1, metrics.allyFreeSpins),
    combinedRetriggerExtensionFrequencyPerAllySpin: metrics.combinedRetriggerExtensionEvents / Math.max(1, metrics.allyFreeSpins),
    featureCapFrequency: metrics.capFeatures / Math.max(1, metrics.features),
    overflowMysteryFreeSpinFrequency: metrics.overflowFeatures / Math.max(1, metrics.features),
    averageOverflowMysteryFreeSpinsPerFeature: metrics.overflowMysterySpins / Math.max(1, metrics.features),
    ryanBoostActivationFrequencyPerFeature: metrics.ryanBoostActivations / Math.max(1, metrics.features),
    ryanBoostActivationFrequencyPerAllySpin: metrics.ryanBoostActivations / Math.max(1, metrics.allyFreeSpins),
    rescueResultCount: metrics.rescueResults,
    averageRescueAttemptsUsed: metrics.rescueAttemptsUsed / Math.max(1, metrics.rescueResults),
    rescueMeaningfulRewardProtectionFrequency: metrics.rescueProtectedMeaningfulResults / Math.max(1, metrics.rescueResults),
    rescueProtectedTwoPlusTokenResults: metrics.rescueProtectedTwoPlusTokenResults,
    rescueProtectedTreeResults: metrics.rescueProtectedTreeResults,
    rescueProtectedFortuneResults: metrics.rescueProtectedFortuneResults,
  };
}

function simulateAlly(allyId, { conversionEnabled, runCycles, runSeed }) {
  app.allyMysteryExtensions.conversionEnabled = conversionEnabled;
  const rng = seededRandom(runSeed);
  const state = makeState();
  const metrics = createRawMetrics(allyId, conversionEnabled ? "after" : "before", runCycles, runSeed);
  let sequence = 0;
  let activeFeature = null;
  let lastConfiguredSessionId = null;

  function configureFeature() {
    const session = state.freeSpinSession;
    if (!session?.active || session.status !== FS.INTRO || session.sessionId === lastConfiguredSessionId) return;
    let next = app.allies.setPendingSelection(session, allyId);
    next = app.allies.confirmSelection(next, allyId, rng);
    next = app.allies.beginFeature(next);
    next.status = FS.READY;
    state.freeSpinSession = next;
    lastConfiguredSessionId = next.sessionId;
    activeFeature = {
      sessionId: next.sessionId,
      payout: 0,
      spins: 0,
      extensionEvents: 0,
      extensionSpins: 0,
      naturalRetriggers: 0,
      combinedEvents: 0,
      capped: false,
      overflow: 0,
    };
  }

  function closeFeature() {
    const session = state.freeSpinSession;
    if (!activeFeature || !session || session.sessionId !== activeFeature.sessionId) return;
    const payout = Math.max(activeFeature.payout, session.accumulatedWin || 0);
    const spins = Math.max(activeFeature.spins, session.completedSpins || 0);
    metrics.features += 1;
    metrics.featurePayout += payout;
    metrics.featureSpins += spins;
    metrics.mysteryAddedAllySpins += activeFeature.extensionSpins;
    if (payout <= 0) metrics.zeroPayFeatures += 1;
    if (activeFeature.extensionEvents > 0) metrics.featuresWithExtension += 1;
    if (activeFeature.extensionEvents > 1) metrics.featuresWithMultipleExtensions += 1;
    if (activeFeature.capped) metrics.capFeatures += 1;
    if (activeFeature.overflow > 0) {
      metrics.overflowFeatures += 1;
      metrics.overflowMysterySpins += activeFeature.overflow;
    }
    metrics.maximumFeatureLength = Math.max(metrics.maximumFeatureLength, spins);
    metrics.maximumFeaturePayout = Math.max(metrics.maximumFeaturePayout, payout);
    activeFeature = null;
  }

  function runSpin(spinType, cycleStats) {
    const session = state.freeSpinSession;
    const spinState = spinType === "free" ? app.freeSpins.getLockedSpinState(session, state) : state;
    const referenceBet = spinType === "free" ? session.referenceBet : wager;
    const totalAwardedSpins = spinType === "free" ? session.totalAwardedSpins : 0;
    const activeModifiers = app.mystery.peekModifierQueue(state);
    const result = payouts.createSpinResult({
      targetStops: CONFIG.reels.map(reel => Math.floor(rng() * reel.length)),
      state: spinState,
      id: `${conversionEnabled ? "after" : "before"}-${allyId}-${sequence += 1}`,
      createdAt: "seeded-ally-mystery-extension-audit",
      spinType,
      referenceBet,
      totalAwardedSpins,
      mysteryModifiers: activeModifiers,
      rng,
    });
    if (!app.mystery.commitSpinStart(state, result)) throw new Error(`Unable to commit ${spinType} spin.`);
    payouts.consumeFortuneChargeState(state, result);
    state.coins -= result.coinCost;
    state.lastWin = 0;
    state.pendingSpin = result;
    const settled = payouts.settlePendingSpinState(state);
    if (!settled) throw new Error(`Unable to settle ${spinType} spin.`);

    const rescueResult = settled.mysteryRescue;
    if (rescueResult) {
      metrics.rescueResults += 1;
      metrics.rescueAttemptsUsed += rescueResult.attemptsUsed || 0;
      if (rescueResult.stopReason === "meaningful-non-coin-reward") {
        metrics.rescueProtectedMeaningfulResults += 1;
        const reward = rescueResult.selectedMeaningfulReward || {};
        if ((reward.tokenCount || 0) >= 2) metrics.rescueProtectedTwoPlusTokenResults += 1;
        if (reward.naturalFreeSpinAward) metrics.rescueProtectedTreeResults += 1;
        if ((reward.fortuneBurstPoints || 0) > 0) metrics.rescueProtectedFortuneResults += 1;
      }
    }

    const endBonus = settled.allyEndBonus?.amount || 0;
    const paidAmount = settled.totalWin + endBonus;
    metrics.totalPayout += paidAmount;
    metrics.maximumSinglePayout = Math.max(metrics.maximumSinglePayout, paidAmount);
    cycleStats.payout += paidAmount;

    if (spinType === "paid") metrics.paidSpins += 1;
    else if (spinType === "mystery-free") metrics.mysteryFreeSpins += 1;
    else {
      metrics.allyFreeSpins += 1;
      if (activeFeature) {
        activeFeature.payout += paidAmount;
        activeFeature.spins += 1;
        const natural = settled.freeSpinSettlement?.retriggerApplied || 0;
        const extension = settled.mysterySettlement?.allyExtension;
        if (natural > 0) {
          activeFeature.naturalRetriggers += 1;
          metrics.naturalRetriggerEvents += 1;
        }
        if (extension?.allySpinsAdded > 0) {
          activeFeature.extensionEvents += 1;
          activeFeature.extensionSpins += extension.allySpinsAdded;
          metrics.mysteryExtensionEvents += 1;
        }
        if (natural > 0 && extension?.allySpinsAdded > 0) {
          activeFeature.combinedEvents += 1;
          metrics.combinedRetriggerExtensionEvents += 1;
        }
        if (extension?.afterTotalAwardedSpins >= CONFIG.freeSpins.maximumAwardedSpins) activeFeature.capped = true;
        if ((extension?.overflowMysterySpins || 0) > 0) activeFeature.overflow += extension.overflowMysterySpins;
        if (settled.allyEffect?.allyId === "ryan" && settled.allyEffect.activated) metrics.ryanBoostActivations += 1;
      }
    }
    configureFeature();
    return settled;
  }

  for (let root = 0; root < runCycles; root += 1) {
    const cycleStats = { payout: 0 };
    runSpin("paid", cycleStats);
    let guard = 0;
    while ((state.freeSpinSession?.active || app.mystery.hasQueuedFreeSpin(state)) && guard < 4000) {
      guard += 1;
      const session = state.freeSpinSession;
      if (session?.active) {
        configureFeature();
        const current = state.freeSpinSession;
        if (current.status === FS.PRESENTING) {
          state.freeSpinSession = app.freeSpins.markFreeSpinPresented(current, current.presentationSpin?.id);
          continue;
        }
        if (current.status === FS.COMPLETE || current.remainingSpins <= 0) {
          closeFeature();
          state.freeSpinSession = null;
          lastConfiguredSessionId = null;
          continue;
        }
        if (current.status === FS.READY) {
          runSpin("free", cycleStats);
          continue;
        }
        throw new Error(`Unexpected Ally status ${current.status}.`);
      }
      runSpin("mystery-free", cycleStats);
    }
    if (guard >= 4000) {
      metrics.guardTrips += 1;
      throw new Error(`Feature-chain guard exceeded for ${allyId}.`);
    }
    metrics.maximumPaidCyclePayout = Math.max(metrics.maximumPaidCyclePayout, cycleStats.payout);
  }

  app.allyMysteryExtensions.conversionEnabled = true;
  return summarize(metrics);
}

function aggregate(rows, mode) {
  const totals = rows.reduce((acc, row) => {
    acc.totalPayout += row.totalPayout;
    acc.totalWagered += row.totalWagered;
    acc.features += row.features;
    acc.featureSpins += row.averageAllySpinsPerFeature * row.features;
    acc.extensionSpins += row.averageMysteryAddedAllySpinsPerFeature * row.features;
    acc.extensionFeatures += row.featureExtensionFrequency * row.features;
    acc.multipleExtensionFeatures += row.multipleExtensionFeatureFrequency * row.features;
    acc.featurePayout += row.averageFeaturePayout * row.features;
    acc.zeroPayFeatures += row.zeroPayFeatureFrequency * row.features;
    acc.maxLength = Math.max(acc.maxLength, row.maximumObservedFeatureLength);
    acc.maxPayout = Math.max(acc.maxPayout, row.maximumObservedFeaturePayout);
    acc.capFeatures += row.featureCapFrequency * row.features;
    acc.overflowFeatures += row.overflowMysteryFreeSpinFrequency * row.features;
    return acc;
  }, { totalPayout: 0, totalWagered: 0, features: 0, featureSpins: 0, extensionSpins: 0, extensionFeatures: 0, multipleExtensionFeatures: 0, featurePayout: 0, zeroPayFeatures: 0, maxLength: 0, maxPayout: 0, capFeatures: 0, overflowFeatures: 0 });
  return {
    mode,
    rtp: totals.totalPayout / Math.max(1, totals.totalWagered),
    features: totals.features,
    averageAllySpinsPerFeature: totals.featureSpins / Math.max(1, totals.features),
    averageMysteryAddedAllySpinsPerFeature: totals.extensionSpins / Math.max(1, totals.features),
    featureExtensionFrequency: totals.extensionFeatures / Math.max(1, totals.features),
    multipleExtensionFeatureFrequency: totals.multipleExtensionFeatures / Math.max(1, totals.features),
    averageFeaturePayout: totals.featurePayout / Math.max(1, totals.features),
    zeroPayFeatureFrequency: totals.zeroPayFeatures / Math.max(1, totals.features),
    maximumObservedFeatureLength: totals.maxLength,
    maximumObservedFeaturePayout: totals.maxPayout,
    featureCapFrequency: totals.capFeatures / Math.max(1, totals.features),
    overflowMysteryFreeSpinFrequency: totals.overflowFeatures / Math.max(1, totals.features),
  };
}

const before = {};
const after = {};
for (let index = 0; index < ALLY_IDS.length; index += 1) {
  const allyId = ALLY_IDS[index];
  const allySeed = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  before[allyId] = simulateAlly(allyId, { conversionEnabled: false, runCycles: allyCycles, runSeed: allySeed });
  after[allyId] = simulateAlly(allyId, { conversionEnabled: true, runCycles: allyCycles, runSeed: allySeed });
}

const beforeRows = ALLY_IDS.map(id => before[id]);
const afterRows = ALLY_IDS.map(id => after[id]);
const report = {
  mode: "ally-mystery-extension-before-after",
  generatedAt: new Date().toISOString(),
  cycles,
  allyCycles,
  seed,
  wager,
  note: "Before mode uses the same production math with in-feature conversion disabled, so Mystery Free Spins wait until after the Ally feature. After mode converts them into the active Ally session up to the twenty-spin cap. Both modes use the corrected Rescue rule that preserves coin wins and meaningful persistent non-coin rewards.",
  before,
  after,
  overall: {
    before: aggregate(beforeRows, "before"),
    after: aggregate(afterRows, "after"),
  },
  rtpDeltaByAlly: Object.fromEntries(ALLY_IDS.map(id => [id, after[id].rtp - before[id].rtp])),
  ryan: {
    beforeRtp: before.ryan.rtp,
    afterRtp: after.ryan.rtp,
    rtpDelta: after.ryan.rtp - before.ryan.rtp,
    beforeBoostActivationFrequency: before.ryan.ryanBoostActivationFrequencyPerFeature,
    afterBoostActivationFrequency: after.ryan.ryanBoostActivationFrequencyPerFeature,
  },
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Ally Mystery extension audit (${allyCycles.toLocaleString()} paid cycles per Ally per mode, seed ${seed})`);
  console.log("=".repeat(112));
  console.log("Ally       RTP before   RTP after    Delta       Avg spins before/after   Mystery-added   Zero-pay before/after");
  for (const allyId of ALLY_IDS) {
    const b = before[allyId];
    const a = after[allyId];
    console.log(`${b.allyName.padEnd(10)} ${percentage(b.rtp).padStart(10)}   ${percentage(a.rtp).padStart(10)}   ${percentage(a.rtp - b.rtp).padStart(9)}   ${b.averageAllySpinsPerFeature.toFixed(3).padStart(6)} / ${a.averageAllySpinsPerFeature.toFixed(3).padEnd(6)}       ${a.averageMysteryAddedAllySpinsPerFeature.toFixed(4).padStart(7)}       ${percentage(b.zeroPayFeatureFrequency).padStart(9)} / ${percentage(a.zeroPayFeatureFrequency)}`);
  }
  console.log("\nAfter-change feature metrics by Ally");
  for (const allyId of ALLY_IDS) {
    const row = after[allyId];
    console.log(`  ${row.allyName.padEnd(10)} extension ${percentage(row.featureExtensionFrequency)} | multiple ${percentage(row.multipleExtensionFeatureFrequency)} | retrigger ${percentage(row.naturalRetriggerFrequencyPerAllySpin)} | combined ${percentage(row.combinedRetriggerExtensionFrequencyPerAllySpin)} | cap ${percentage(row.featureCapFrequency)} | max ${row.maximumObservedFeatureLength} spins / ${row.maximumObservedFeaturePayout} coins`);
  }
  console.log(`\nOverall zero-pay: ${percentage(report.overall.before.zeroPayFeatureFrequency)} before → ${percentage(report.overall.after.zeroPayFeatureFrequency)} after`);
  console.log(`Overall RTP: ${percentage(report.overall.before.rtp)} before → ${percentage(report.overall.after.rtp)} after`);
  console.log(`Ryan RTP: ${percentage(report.ryan.beforeRtp)} before → ${percentage(report.ryan.afterRtp)} after; boost activation ${percentage(report.ryan.afterBoostActivationFrequency)} per feature`);
  const protectedCount = afterRows.reduce((sum, row) => sum + row.rescueProtectedTwoPlusTokenResults + row.rescueProtectedTreeResults + row.rescueProtectedFortuneResults, 0);
  console.log(`Rescue preserved meaningful non-coin outcomes across after-mode Ally runs: ${protectedCount.toLocaleString()} classified outcomes.`);
}

if (check) {
  const failures = [];
  if (ALLY_IDS.some(id => !Number.isFinite(before[id].rtp) || !Number.isFinite(after[id].rtp))) failures.push("An Ally RTP is invalid.");
  if (ALLY_IDS.some(id => after[id].averageMysteryAddedAllySpinsPerFeature <= 0)) failures.push("Every Ally must receive measurable Mystery-added Ally spins.");
  if (ALLY_IDS.some(id => after[id].maximumObservedFeatureLength > CONFIG.freeSpins.maximumAwardedSpins)) failures.push("An Ally feature exceeded the configured safety cap.");
  if (ALLY_IDS.some(id => before[id].averageMysteryAddedAllySpinsPerFeature !== 0)) failures.push("Before mode unexpectedly converted Mystery spins inside the Ally feature.");
  if (after.ryan.ryanBoostActivationFrequencyPerFeature > 1) failures.push("Ryan activated more than once per feature.");
  if (failures.length) {
    failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`));
    process.exitCode = 1;
  } else {
    console.log("\nAlly conversion, cap, overflow, RTP, and Ryan one-use checks: PASS");
  }
}
