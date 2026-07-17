#!/usr/bin/env node

await import("../js/config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/payouts.js");

const app = globalThis.CommuneFortune;
const { CONFIG, payouts } = app;
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = true] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const outputJson = args.has("json");
const checkTarget = args.has("check");
const requestedMode = args.get("free-spins") || "both";
const state = { lineBetIndex: 0, fortuneMeter: { value: 0, charged: false } };
const wager = payouts.getTotalBet(state);

function* enumerateStops(reels, reelIndex = 0, prefix = []) {
  if (reelIndex === reels.length) { yield prefix; return; }
  for (let stop = 0; stop < reels[reelIndex].length; stop += 1) {
    yield* enumerateStops(reels, reelIndex + 1, [...prefix, stop]);
  }
}

function increment(map, key, amount = 1) { map.set(key, (map.get(key) || 0) + amount); }
function objectDistribution(map, denominator, numeric = false) {
  return Object.fromEntries([...map.entries()]
    .sort((a, b) => numeric ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0])))
    .map(([key, value]) => [key, value / denominator]));
}

function validateConfig() {
  if (CONFIG.reels.length !== 3) throw new Error("The exact Three Trees model expects three reels.");
  CONFIG.reels.forEach((reel, index) => {
    if (!Array.isArray(reel) || reel.length < CONFIG.rowCount) throw new Error(`Reel ${index + 1} is invalid.`);
    reel.forEach(key => { if (!CONFIG.symbols[key]) throw new Error(`Unknown reel symbol ${key}.`); });
  });
  if (CONFIG.freeSpins.startingAward !== 4) throw new Error("Starting free-spin award must be four for this model.");
  if (CONFIG.freeSpins.retriggerAward !== 2) throw new Error("Retrigger award must be two for this model.");
  if (CONFIG.freeSpins.maximumAwardedSpins !== 20) throw new Error("Free-spin cap must be twenty for this model.");
}

function enumerateExactOutcomes() {
  const accumulator = {
    outcomes: 0,
    totalWagered: 0,
    baseLinePaid: 0,
    resolvedLinePaid: 0,
    combinationPaid: 0,
    naturalPaid: 0,
    winningOutcomes: 0,
    triggerOutcomes: 0,
    maximumNaturalPayout: 0,
    maximumFortunePayout: 0,
    maximumTriggerPaidPayout: 0,
    maximumFreeSpinPayout: 0,
    wildEligible: 0,
    wildActivated: 0,
    combinationOutcomes: 0,
    fortuneGainCounts: new Map(),
    fortuneBonusPaidIfActive: 0,
    freeTierCounts: new Map(),
    combinationCounts: new Map(),
    freeOutcomeCategories: new Map(),
  };
  const flags = { ...CONFIG.features, freeSpins: true, characterReactions: false, manualStops: false, spinDrama: false };

  for (const targetStops of enumerateStops(CONFIG.reels)) {
    for (let roll = 0; roll < CONFIG.expandingWild.outcomes; roll += 1) {
      const featureRolls = { expandingWild: { roll } };
      const natural = payouts.createSpinResult({
        targetStops,
        state: { ...state, fortuneMeter: { value: 0, charged: false } },
        id: "exact",
        createdAt: "exact",
        featureFlags: flags,
        featureRolls,
        spinType: "paid",
      });
      const fortune = payouts.createSpinResult({
        targetStops,
        state: { ...state, fortuneMeter: { value: CONFIG.fortuneMeter.capacity, charged: true } },
        id: "exact-fortune",
        createdAt: "exact",
        featureFlags: flags,
        featureRolls,
        spinType: "paid",
      });
      const free = payouts.createSpinResult({
        targetStops,
        state,
        id: "exact-free",
        createdAt: "exact",
        featureFlags: flags,
        featureRolls,
        spinType: "free",
        paidSpin: false,
        referenceBet: wager,
        totalAwardedSpins: CONFIG.freeSpins.startingAward,
      });

      accumulator.outcomes += 1;
      accumulator.totalWagered += wager;
      accumulator.baseLinePaid += natural.baseLineWinTotal;
      accumulator.resolvedLinePaid += natural.lineWinTotal;
      accumulator.combinationPaid += natural.combinationWinTotal;
      accumulator.naturalPaid += natural.preModifierWin;
      accumulator.fortuneBonusPaidIfActive += fortune.fortuneBonus;
      if (natural.preModifierWin > 0) accumulator.winningOutcomes += 1;
      if (natural.freeSpinTrigger.triggered) accumulator.triggerOutcomes += 1;
      if (natural.featureRolls.expandingWild.eligible) accumulator.wildEligible += 1;
      if (natural.featureRolls.expandingWild.activated) accumulator.wildActivated += 1;
      if (natural.combinationWins.length) accumulator.combinationOutcomes += 1;
      accumulator.maximumNaturalPayout = Math.max(accumulator.maximumNaturalPayout, natural.preModifierWin);
      accumulator.maximumFortunePayout = Math.max(accumulator.maximumFortunePayout, fortune.totalWin);
      if (natural.freeSpinTrigger.triggered) accumulator.maximumTriggerPaidPayout = Math.max(accumulator.maximumTriggerPaidPayout, fortune.totalWin);
      accumulator.maximumFreeSpinPayout = Math.max(accumulator.maximumFreeSpinPayout, free.totalWin);

      const awardKey = natural.fortuneMeterAward.jackpotCharge ? "jackpot" : natural.fortuneMeterAward.totalPoints;
      increment(accumulator.fortuneGainCounts, awardKey);
      increment(accumulator.freeTierCounts, free.winTier);
      free.combinationWins.forEach(win => increment(accumulator.combinationCounts, win.id));
      const categoryKey = JSON.stringify({
        payout: free.totalWin,
        trigger: free.freeSpinTrigger.triggered,
        tier: free.winTier,
        wild: free.featureRolls.expandingWild.activated,
        combination: free.combinationWins[0]?.id || null,
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
  let iterations = 0;
  for (; iterations < 100000; iterations += 1) {
    const next = Array(capacity + 1).fill(0);
    for (let meter = 0; meter <= capacity; meter += 1) {
      if (distribution[meter] === 0) continue;
      const base = meter === capacity ? 0 : meter;
      transitions.forEach(transition => {
        const nextMeter = transition.jackpot ? capacity : Math.min(capacity, base + transition.points);
        next[nextMeter] += distribution[meter] * transition.probability;
      });
    }
    const delta = Math.max(...next.map((probability, index) => Math.abs(probability - distribution[index])));
    distribution = next;
    if (delta < 1e-15) break;
  }
  const total = distribution.reduce((sum, probability) => sum + probability, 0);
  distribution = distribution.map(probability => probability / total);
  return { distribution, iterations, frequency: distribution[capacity] };
}

function compressFeatureCategories(accumulator) {
  return [...accumulator.freeOutcomeCategories.entries()].map(([json, count]) => ({ ...JSON.parse(json), probability: count / accumulator.outcomes }));
}

function solveFeatureExpectations(categories) {
  const memo = new Map();
  function solve(remaining, totalAwarded) {
    if (remaining <= 0) return { spins: 0, payout: 0, retriggers: 0, anyRetrigger: 0, zeroPay: 1, maximumPayout: 0 };
    const key = `${remaining}:${totalAwarded}`;
    if (memo.has(key)) return memo.get(key);
    let payout = 0;
    let spins = 1;
    let retriggers = 0;
    let anyRetrigger = 0;
    let zeroPay = 0;
    let maximumPayout = Number.NEGATIVE_INFINITY;
    categories.forEach(category => {
      const award = category.trigger ? Math.min(CONFIG.freeSpins.retriggerAward, CONFIG.freeSpins.maximumAwardedSpins - totalAwarded) : 0;
      const sub = solve(remaining - 1 + award, totalAwarded + award);
      payout += category.probability * (category.payout + sub.payout);
      spins += category.probability * sub.spins;
      retriggers += category.probability * ((award > 0 ? 1 : 0) + sub.retriggers);
      anyRetrigger += category.probability * (award > 0 ? 1 : sub.anyRetrigger);
      zeroPay += category.probability * (category.payout === 0 ? sub.zeroPay : 0);
      maximumPayout = Math.max(maximumPayout, category.payout + sub.maximumPayout);
    });
    const result = { spins, payout, retriggers, anyRetrigger, zeroPay, maximumPayout };
    memo.set(key, result);
    return result;
  }
  return solve(CONFIG.freeSpins.startingAward, CONFIG.freeSpins.startingAward);
}

function solveSessionLengthDistribution(triggerProbability) {
  let active = new Map([[`${CONFIG.freeSpins.startingAward}:${CONFIG.freeSpins.startingAward}:0:0`, 1]]);
  const lengths = new Map();
  const retriggers = new Map();
  while (active.size) {
    const next = new Map();
    for (const [key, probability] of active) {
      const [remaining, totalAwarded, completed, retriggerCount] = key.split(":").map(Number);
      const branches = [{ trigger: false, probability: 1 - triggerProbability }, { trigger: true, probability: triggerProbability }];
      branches.forEach(branch => {
        const award = branch.trigger ? Math.min(CONFIG.freeSpins.retriggerAward, CONFIG.freeSpins.maximumAwardedSpins - totalAwarded) : 0;
        const nextRemaining = remaining - 1 + award;
        const nextTotal = totalAwarded + award;
        const nextCompleted = completed + 1;
        const nextRetriggers = retriggerCount + (award > 0 ? 1 : 0);
        const mass = probability * branch.probability;
        if (nextRemaining <= 0) {
          increment(lengths, nextCompleted, mass);
          increment(retriggers, nextRetriggers, mass);
        } else increment(next, `${nextRemaining}:${nextTotal}:${nextCompleted}:${nextRetriggers}`, mass);
      });
    }
    active = next;
  }
  return { lengths, retriggers };
}

function summarize(accumulator) {
  const baseLineRtp = accumulator.baseLinePaid / accumulator.totalWagered;
  const resolvedLineRtp = accumulator.resolvedLinePaid / accumulator.totalWagered;
  const incrementalWildRtp = (accumulator.resolvedLinePaid - accumulator.baseLinePaid) / accumulator.totalWagered;
  const combinationRtp = accumulator.combinationPaid / accumulator.totalWagered;
  const naturalRtp = accumulator.naturalPaid / accumulator.totalWagered;
  const stationary = solveFortuneStationary(accumulator);
  const averageFortuneBonus = accumulator.fortuneBonusPaidIfActive / accumulator.outcomes;
  const incrementalFortuneRtp = stationary.frequency * averageFortuneBonus / wager;
  const currentRtp = naturalRtp + incrementalFortuneRtp;
  const triggerFrequency = accumulator.triggerOutcomes / accumulator.outcomes;
  const feature = solveFeatureExpectations(compressFeatureCategories(accumulator));
  const sessionDistribution = solveSessionLengthDistribution(triggerFrequency);
  const incrementalFreeSpinRtp = triggerFrequency * feature.payout / wager;
  const combinedRtp = currentRtp + incrementalFreeSpinRtp;
  const common = {
    mode: "exact-weighted-transition",
    outcomes: accumulator.outcomes,
    wagerPerPaidSpin: wager,
    baseLineRtp,
    resolvedLineRtp,
    incrementalWildRtp,
    combinationRtp,
    naturalRtp,
    incrementalFortuneRtp,
    rtpBeforeFreeSpins: currentRtp,
    paidSpinTriggerFrequency: triggerFrequency,
    averagePaidSpinsBetweenTriggers: 1 / triggerFrequency,
    exactTriggerOdds: `1 in ${Math.round(1 / triggerFrequency)}`,
    reactionFrameworkRtpEffect: 0,
    maximumPaidSpinPayout: accumulator.maximumFortunePayout,
  };
  return [{
    id: "current-without-free-spins",
    name: "Current game without free spins",
    ...common,
    incrementalFreeSpinRtp: 0,
    totalRtp: currentRtp,
  }, {
    id: "current-with-free-spins",
    name: "Current game with Commune Free Spins",
    ...common,
    incrementalFreeSpinRtp,
    totalRtp: combinedRtp,
    averageFreeSpinsPerFeature: feature.spins,
    retriggerFrequencyPerFreeSpin: triggerFrequency,
    featureRetriggerFrequency: feature.anyRetrigger,
    averageRetriggersPerFeature: feature.retriggers,
    averageFeaturePayout: feature.payout,
    averageFeaturePayoutMultiple: feature.payout / wager,
    zeroPayFeatureFrequency: feature.zeroPay,
    maximumSingleFreeSpinPayout: accumulator.maximumFreeSpinPayout,
    maximumFeaturePayout: feature.maximumPayout,
    maximumFeaturePayoutMultiple: feature.maximumPayout / wager,
    maximumTriggerPaidPayout: accumulator.maximumTriggerPaidPayout,
    maximumTotalPayout: accumulator.maximumTriggerPaidPayout + feature.maximumPayout,
    maximumTotalPayoutMultiple: (accumulator.maximumTriggerPaidPayout + feature.maximumPayout) / wager,
    freeSpinWinTierDistribution: objectDistribution(accumulator.freeTierCounts, accumulator.outcomes),
    freeSpinTreeAwakeningFrequency: accumulator.wildActivated / accumulator.outcomes,
    freeSpinCombinationFrequency: accumulator.combinationOutcomes / accumulator.outcomes,
    freeSpinNamedCombinationFrequency: objectDistribution(accumulator.combinationCounts, accumulator.outcomes),
    sessionLengthDistribution: objectDistribution(sessionDistribution.lengths, 1, true),
    retriggerCountDistribution: objectDistribution(sessionDistribution.retriggers, 1, true),
    safetyCap: CONFIG.freeSpins.maximumAwardedSpins,
  }];
}

const percentage = value => `${(value * 100).toFixed(4)}%`;
function printReport(report) {
  console.log(`\n${report.name} (${report.mode})`);
  console.log("=".repeat(76));
  console.log(`Exact weighted outcomes:                 ${report.outcomes.toLocaleString()}`);
  console.log(`Base line RTP:                           ${percentage(report.baseLineRtp)}`);
  console.log(`Incremental Tree RTP:                    ${percentage(report.incrementalWildRtp)}`);
  console.log(`Combination RTP:                         ${percentage(report.combinationRtp)}`);
  console.log(`Incremental Fortune RTP:                 ${percentage(report.incrementalFortuneRtp)}`);
  console.log(`RTP before free spins:                   ${percentage(report.rtpBeforeFreeSpins)}`);
  console.log(`Paid Three Trees trigger frequency:      ${percentage(report.paidSpinTriggerFrequency)} (${report.exactTriggerOdds})`);
  console.log(`Average paid spins between triggers:     ${report.averagePaidSpinsBetweenTriggers.toFixed(6)}`);
  console.log(`Reaction framework RTP effect:           ${percentage(report.reactionFrameworkRtpEffect)}`);
  if (report.id === "current-with-free-spins") {
    console.log(`Incremental free-spin RTP:               ${percentage(report.incrementalFreeSpinRtp)}`);
    console.log(`Final combined RTP:                      ${percentage(report.totalRtp)}`);
    console.log(`Average free spins per feature:          ${report.averageFreeSpinsPerFeature.toFixed(6)}`);
    console.log(`Retrigger frequency per free spin:       ${percentage(report.retriggerFrequencyPerFreeSpin)}`);
    console.log(`Features with at least one retrigger:    ${percentage(report.featureRetriggerFrequency)}`);
    console.log(`Average retriggers per feature:          ${report.averageRetriggersPerFeature.toFixed(6)}`);
    console.log(`Average feature payout:                  ${report.averageFeaturePayout.toFixed(6)} (${report.averageFeaturePayoutMultiple.toFixed(6)}x)`);
    console.log(`Zero-pay feature frequency:              ${percentage(report.zeroPayFeatureFrequency)}`);
    console.log(`Tree Awakening frequency in free spins:  ${percentage(report.freeSpinTreeAwakeningFrequency)}`);
    console.log(`Combination frequency in free spins:     ${percentage(report.freeSpinCombinationFrequency)}`);
    console.log(`Maximum feature payout:                  ${report.maximumFeaturePayout} (${report.maximumFeaturePayoutMultiple.toFixed(2)}x)`);
    console.log(`Maximum total payout:                    ${report.maximumTotalPayout} (${report.maximumTotalPayoutMultiple.toFixed(2)}x)`);
    console.log("Session-length distribution:");
    Object.entries(report.sessionLengthDistribution).forEach(([length, probability]) => console.log(`  ${length.padStart(2)} spins: ${percentage(probability)}`));
  } else console.log(`Final combined RTP:                      ${percentage(report.totalRtp)}`);
}

function checkReports(reports) {
  const without = reports.find(report => report.id === "current-without-free-spins");
  const withFeature = reports.find(report => report.id === "current-with-free-spins");
  const failures = [];
  const expectedCurrent = 0.8781882718877958;
  if (Math.abs(without.totalRtp - expectedCurrent) > 5e-7) failures.push(`Current RTP changed: ${percentage(without.totalRtp)}`);
  if (Math.abs(withFeature.paidSpinTriggerFrequency - 1 / 64) > 1e-15) failures.push(`Trigger frequency changed: ${percentage(withFeature.paidSpinTriggerFrequency)}`);
  if (withFeature.incrementalFreeSpinRtp < CONFIG.rtpTargets.freeSpinIncrement.minimum || withFeature.incrementalFreeSpinRtp > CONFIG.rtpTargets.freeSpinIncrement.maximum) failures.push(`Free-spin increment outside target: ${percentage(withFeature.incrementalFreeSpinRtp)}`);
  if (withFeature.totalRtp < CONFIG.rtpTargets.withFreeSpinsTotal.minimum || withFeature.totalRtp > CONFIG.rtpTargets.withFreeSpinsTotal.maximum) failures.push(`Combined RTP outside target: ${percentage(withFeature.totalRtp)}`);
  if (withFeature.reactionFrameworkRtpEffect !== 0) failures.push("Reaction framework changed RTP.");
  if (withFeature.averageFreeSpinsPerFeature < 4 || withFeature.averageFreeSpinsPerFeature > CONFIG.freeSpins.maximumAwardedSpins) failures.push("Average feature length is invalid.");
  if (failures.length) {
    failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`));
    process.exitCode = 1;
  } else console.log("\nExact free-spin, Fortune, trigger-frequency, and reaction-isolation checks: PASS");
}

validateConfig();
const reports = summarize(enumerateExactOutcomes());
const selected = requestedMode === "off" ? reports.filter(report => report.id === "current-without-free-spins")
  : requestedMode === "on" ? reports.filter(report => report.id === "current-with-free-spins")
    : reports;
if (outputJson) console.log(JSON.stringify(selected, null, 2));
else selected.forEach(printReport);
if (checkTarget) checkReports(reports);
