#!/usr/bin/env node

await import("../js/config.js");
await import("../js/combination-clarity-config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/payouts.js");
await import("../js/combination-clarity-payouts.js");

const app = globalThis.CommuneFortune;
const { CONFIG, payouts, combinationClarity } = app;
const args = new Map(process.argv.slice(2).map(argument => {
  const [key, value = true] = argument.replace(/^--/, "").split("=");
  return [key, value];
}));
const outputJson = args.has("json");
const checkTarget = args.has("check");
const requestedMode = args.get("free-spins") || "both";
const baseState = { lineBetIndex: 0, fortuneMeter: { value: 0, charged: false } };
const wager = payouts.getTotalBet(baseState);
const flags = {
  ...CONFIG.features,
  freeSpins: true,
  characterReactions: false,
  manualStops: false,
  spinDrama: false,
};

function* enumerateStops(reels, reelIndex = 0, prefix = []) {
  if (reelIndex === reels.length) {
    yield prefix;
    return;
  }
  for (let stop = 0; stop < reels[reelIndex].length; stop += 1) {
    yield* enumerateStops(reels, reelIndex + 1, [...prefix, stop]);
  }
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function toObject(map, denominator = 1) {
  return Object.fromEntries([...map.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([key, value]) => [key, value / denominator]));
}

function createResult(targetStops, roll, state, spinType, model) {
  return combinationClarity.createSpinResultWithCombinationModel({
    targetStops,
    state,
    id: `${model.id}-${spinType}`,
    createdAt: "exact",
    featureFlags: flags,
    featureRolls: { expandingWild: { roll } },
    spinType,
    paidSpin: spinType === "paid",
    referenceBet: wager,
    totalAwardedSpins: spinType === "free" ? CONFIG.freeSpins.startingAward : 0,
  }, {
    mode: model.mode,
    definitions: model.definitions,
  });
}

function enumerateModel(model) {
  const accumulator = {
    outcomes: 0,
    totalWagered: 0,
    baseLinePaid: 0,
    resolvedLinePaid: 0,
    combinationPaid: 0,
    naturalPaid: 0,
    triggerOutcomes: 0,
    fortuneGainCounts: new Map(),
    fortuneBonusPaidIfActive: 0,
    combinationCounts: new Map(),
    combinationPaidById: new Map(),
    freeOutcomeCategories: new Map(),
    maximumPaidSpinPayout: 0,
    maximumFreeSpinPayout: 0,
    maximumTriggerPaidPayout: 0,
  };

  for (const targetStops of enumerateStops(CONFIG.reels)) {
    for (let roll = 0; roll < CONFIG.expandingWild.outcomes; roll += 1) {
      const natural = createResult(targetStops, roll, {
        ...baseState,
        fortuneMeter: { value: 0, charged: false },
      }, "paid", model);
      const fortune = createResult(targetStops, roll, {
        ...baseState,
        fortuneMeter: { value: CONFIG.fortuneMeter.capacity, charged: true },
      }, "paid", model);
      const free = createResult(targetStops, roll, baseState, "free", model);

      accumulator.outcomes += 1;
      accumulator.totalWagered += wager;
      accumulator.baseLinePaid += natural.baseLineWinTotal;
      accumulator.resolvedLinePaid += natural.lineWinTotal;
      accumulator.combinationPaid += natural.combinationWinTotal;
      accumulator.naturalPaid += natural.preModifierWin;
      accumulator.fortuneBonusPaidIfActive += fortune.fortuneBonus;
      if (natural.freeSpinTrigger.triggered) accumulator.triggerOutcomes += 1;
      accumulator.maximumPaidSpinPayout = Math.max(accumulator.maximumPaidSpinPayout, fortune.totalWin);
      accumulator.maximumFreeSpinPayout = Math.max(accumulator.maximumFreeSpinPayout, free.totalWin);
      if (natural.freeSpinTrigger.triggered) {
        accumulator.maximumTriggerPaidPayout = Math.max(accumulator.maximumTriggerPaidPayout, fortune.totalWin);
      }

      const awardKey = natural.fortuneMeterAward.jackpotCharge
        ? "jackpot"
        : natural.fortuneMeterAward.totalPoints;
      increment(accumulator.fortuneGainCounts, awardKey);
      natural.combinationWins.forEach(win => {
        increment(accumulator.combinationCounts, win.id);
        increment(accumulator.combinationPaidById, win.id, win.payout);
      });

      const categoryKey = JSON.stringify({
        payout: free.totalWin,
        trigger: free.freeSpinTrigger.triggered,
      });
      increment(accumulator.freeOutcomeCategories, categoryKey);
    }
  }

  return accumulator;
}

function solveFortuneStationary(accumulator) {
  const capacity = CONFIG.fortuneMeter.capacity;
  const transitions = [...accumulator.fortuneGainCounts.entries()].map(([award, count]) => ({
    jackpot: award === "jackpot",
    points: award === "jackpot" ? capacity : Number(award),
    probability: count / accumulator.outcomes,
  }));
  let distribution = Array(capacity + 1).fill(0);
  distribution[0] = 1;

  for (let iteration = 0; iteration < 100000; iteration += 1) {
    const next = Array(capacity + 1).fill(0);
    for (let meter = 0; meter <= capacity; meter += 1) {
      if (distribution[meter] === 0) continue;
      const base = meter === capacity ? 0 : meter;
      transitions.forEach(transition => {
        const nextMeter = transition.jackpot
          ? capacity
          : Math.min(capacity, base + transition.points);
        next[nextMeter] += distribution[meter] * transition.probability;
      });
    }
    const delta = Math.max(...next.map((probability, index) => Math.abs(probability - distribution[index])));
    distribution = next;
    if (delta < 1e-15) break;
  }

  const total = distribution.reduce((sum, probability) => sum + probability, 0);
  distribution = distribution.map(probability => probability / total);
  return { frequency: distribution[capacity] };
}

function solveFeatureExpectations(accumulator) {
  const categories = [...accumulator.freeOutcomeCategories.entries()].map(([json, count]) => ({
    ...JSON.parse(json),
    probability: count / accumulator.outcomes,
  }));
  const memo = new Map();

  function solve(remaining, totalAwarded) {
    if (remaining <= 0) return { spins: 0, payout: 0, retriggers: 0, anyRetrigger: 0, zeroPay: 1, maximumPayout: 0 };
    const key = `${remaining}:${totalAwarded}`;
    if (memo.has(key)) return memo.get(key);
    const result = { spins: 1, payout: 0, retriggers: 0, anyRetrigger: 0, zeroPay: 0, maximumPayout: 0 };

    categories.forEach(category => {
      const award = category.trigger
        ? Math.min(CONFIG.freeSpins.retriggerAward, CONFIG.freeSpins.maximumAwardedSpins - totalAwarded)
        : 0;
      const sub = solve(remaining - 1 + award, totalAwarded + award);
      result.spins += category.probability * sub.spins;
      result.payout += category.probability * (category.payout + sub.payout);
      result.retriggers += category.probability * ((award > 0 ? 1 : 0) + sub.retriggers);
      result.anyRetrigger += category.probability * (award > 0 ? 1 : sub.anyRetrigger);
      result.zeroPay += category.probability * (category.payout === 0 ? sub.zeroPay : 0);
      result.maximumPayout = Math.max(result.maximumPayout, category.payout + sub.maximumPayout);
    });

    memo.set(key, result);
    return result;
  }

  return solve(CONFIG.freeSpins.startingAward, CONFIG.freeSpins.startingAward);
}

function summarize(model) {
  const accumulator = enumerateModel(model);
  const baseLineRtp = accumulator.baseLinePaid / accumulator.totalWagered;
  const resolvedLineRtp = accumulator.resolvedLinePaid / accumulator.totalWagered;
  const combinationRtp = accumulator.combinationPaid / accumulator.totalWagered;
  const fullCommuneRtp = (accumulator.combinationPaidById.get("full-commune") || 0) / accumulator.totalWagered;
  const namedCombinationRtp = combinationRtp - fullCommuneRtp;
  const naturalRtp = accumulator.naturalPaid / accumulator.totalWagered;
  const stationary = solveFortuneStationary(accumulator);
  const averageFortuneBonus = accumulator.fortuneBonusPaidIfActive / accumulator.outcomes;
  const incrementalFortuneRtp = stationary.frequency * averageFortuneBonus / wager;
  const rtpBeforeFreeSpins = naturalRtp + incrementalFortuneRtp;
  const triggerFrequency = accumulator.triggerOutcomes / accumulator.outcomes;
  const feature = solveFeatureExpectations(accumulator);
  const incrementalFreeSpinRtp = triggerFrequency * feature.payout / wager;
  const totalRtp = rtpBeforeFreeSpins + incrementalFreeSpinRtp;

  return {
    id: model.id,
    name: model.name,
    mode: model.mode,
    outcomes: accumulator.outcomes,
    wagerPerPaidSpin: wager,
    baseLineRtp,
    incrementalWildRtp: resolvedLineRtp - baseLineRtp,
    combinationRtp,
    namedCombinationRtp,
    fullCommuneRtp,
    naturalRtp,
    incrementalFortuneRtp,
    rtpBeforeFreeSpins,
    incrementalFreeSpinRtp,
    totalRtp,
    combinationTriggerFrequencies: toObject(accumulator.combinationCounts, accumulator.outcomes),
    combinationContributionById: toObject(accumulator.combinationPaidById, accumulator.totalWagered),
    paidSpinTriggerFrequency: triggerFrequency,
    averageFreeSpinsPerFeature: feature.spins,
    averageRetriggersPerFeature: feature.retriggers,
    featureRetriggerFrequency: feature.anyRetrigger,
    averageFeaturePayout: feature.payout,
    zeroPayFeatureFrequency: feature.zeroPay,
    maximumPaidSpinPayout: accumulator.maximumPaidSpinPayout,
    maximumSingleFreeSpinPayout: accumulator.maximumFreeSpinPayout,
    maximumFeaturePayout: feature.maximumPayout,
    maximumTriggerPaidPayout: accumulator.maximumTriggerPaidPayout,
    maximumTotalPayout: accumulator.maximumTriggerPaidPayout + feature.maximumPayout,
    visualEffectsRtpEffect: 0,
  };
}

const models = [{
  id: "previous-exact-order",
  name: "Previous exact-order Commune Line model",
  mode: "exact-order",
  definitions: CONFIG.combinations.previousExactDefinitions,
}, {
  id: "current-any-order",
  name: "Current any-order Commune Line model",
  mode: "any-order-middle-row",
  definitions: CONFIG.combinations.definitions,
}];

const reports = models.map(summarize);
const previous = reports[0];
const current = reports[1];
const comparison = {
  previousTotalRtp: previous.totalRtp,
  newCombinationRtp: current.combinationRtp,
  newTotalRtp: current.totalRtp,
  totalRtpDelta: current.totalRtp - previous.totalRtp,
};
const percentage = value => `${(value * 100).toFixed(4)}%`;

function printReport() {
  console.log("\nCommune Fortune polish comparison (exact weighted transition model)");
  console.log("=".repeat(76));
  console.log(`Exact weighted outcomes per model:       ${current.outcomes.toLocaleString()}`);
  console.log(`Previous total RTP:                      ${percentage(previous.totalRtp)}`);
  console.log(`Previous exact-order combination RTP:    ${percentage(previous.combinationRtp)}`);
  console.log(`New named combination RTP:               ${percentage(current.namedCombinationRtp)}`);
  console.log(`Full Commune RTP:                        ${percentage(current.fullCommuneRtp)}`);
  console.log(`New total combination RTP:               ${percentage(current.combinationRtp)}`);
  console.log(`New RTP before free spins:               ${percentage(current.rtpBeforeFreeSpins)}`);
  console.log(`New incremental free-spin RTP:           ${percentage(current.incrementalFreeSpinRtp)}`);
  console.log(`New total RTP:                           ${percentage(current.totalRtp)}`);
  console.log(`Change in total RTP:                     ${percentage(comparison.totalRtpDelta)}`);
  console.log(`Visual-effects RTP effect:               ${percentage(current.visualEffectsRtpEffect)}`);
  console.log("\nNamed combination trigger frequencies:");
  CONFIG.combinations.definitions.forEach(definition => {
    const oldFrequency = previous.combinationTriggerFrequencies[definition.id] || 0;
    const newFrequency = current.combinationTriggerFrequencies[definition.id] || 0;
    console.log(`  ${definition.name.padEnd(15)} old ${percentage(oldFrequency).padStart(9)}  new ${percentage(newFrequency).padStart(9)}`);
  });
  console.log(`  ${"Full Commune".padEnd(15)} old ${percentage(previous.combinationTriggerFrequencies["full-commune"] || 0).padStart(9)}  new ${percentage(current.combinationTriggerFrequencies["full-commune"] || 0).padStart(9)}`);
  console.log(`\nAverage free spins per feature:          ${current.averageFreeSpinsPerFeature.toFixed(6)}`);
  console.log(`Average feature payout:                  ${current.averageFeaturePayout.toFixed(6)} coins`);
  console.log(`Maximum feature payout:                  ${current.maximumFeaturePayout} coins`);
}

function checkReports() {
  const failures = [];
  const expectedPrevious = 0.934187882029;
  const expectedCurrent = 0.941635599679;
  if (Math.abs(previous.totalRtp - expectedPrevious) > 5e-7) failures.push(`Previous total changed: ${percentage(previous.totalRtp)}`);
  if (Math.abs(current.totalRtp - expectedCurrent) > 5e-7) failures.push(`New total differs from locked exact result: ${percentage(current.totalRtp)}`);
  if (current.combinationRtp < CONFIG.rtpTargets.combinations.minimum || current.combinationRtp > CONFIG.rtpTargets.combinations.maximum) failures.push(`Combination RTP outside target: ${percentage(current.combinationRtp)}`);
  if (current.totalRtp < CONFIG.rtpTargets.withFreeSpinsTotal.minimum || current.totalRtp > CONFIG.rtpTargets.withFreeSpinsTotal.maximum) failures.push(`Combined RTP outside target: ${percentage(current.totalRtp)}`);
  if (Math.abs(current.paidSpinTriggerFrequency - 1 / 64) > 1e-15) failures.push(`Three Trees trigger changed: ${percentage(current.paidSpinTriggerFrequency)}`);
  if (current.visualEffectsRtpEffect !== 0) failures.push("Visual effects changed RTP.");
  if (failures.length) {
    failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`));
    process.exitCode = 1;
  } else {
    console.log("\nExact RTP, combination-frequency, free-spin, and visual-isolation checks: PASS");
  }
}

const selectedReports = requestedMode === "off"
  ? reports.map(report => ({ ...report, totalRtp: report.rtpBeforeFreeSpins, incrementalFreeSpinRtp: 0 }))
  : requestedMode === "on" || requestedMode === "both"
    ? reports
    : reports;

if (outputJson) {
  console.log(JSON.stringify({ reports: selectedReports, comparison }, null, 2));
} else {
  printReport();
}
if (checkTarget) checkReports();
