#!/usr/bin/env node

await import("../js/config.js");
await import("../js/payouts.js");

const app = globalThis.CommuneFortune;
const { CONFIG, payouts } = app;
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = true] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const state = { lineBetIndex: 0, fortuneMeter: { value: 0, charged: false } };
const wager = payouts.getTotalBet(state);
const outputJson = args.has("json");
const checkTarget = args.has("check");

const MODES = Object.freeze([
  { id: "base", name: "Base only", expandingWilds: false, combinationBonuses: false, fortuneMeter: false },
  { id: "wild", name: "Base + Tree", expandingWilds: true, combinationBonuses: false, fortuneMeter: false },
  { id: "combinations", name: "Base + combinations", expandingWilds: false, combinationBonuses: true, fortuneMeter: false },
  { id: "both", name: "Base + Tree + combinations", expandingWilds: true, combinationBonuses: true, fortuneMeter: false },
  { id: "fortune", name: "Base + Tree + combinations + Fortune Meter", expandingWilds: true, combinationBonuses: true, fortuneMeter: true },
]);

function validateConfig() {
  if (!Number.isInteger(CONFIG.rowCount) || CONFIG.rowCount < 1) throw new Error("CONFIG.rowCount must be a positive integer.");
  if (!Array.isArray(CONFIG.reels) || CONFIG.reels.length < 1) throw new Error("CONFIG.reels must contain at least one reel.");
  CONFIG.reels.forEach((reel, reelIndex) => {
    if (!Array.isArray(reel) || reel.length < CONFIG.rowCount) throw new Error(`Reel ${reelIndex + 1} is shorter than the visible row count.`);
    reel.forEach(symbolKey => { if (!CONFIG.symbols[symbolKey]) throw new Error(`Reel ${reelIndex + 1} references unknown symbol ${symbolKey}.`); });
  });
  if (!Number.isInteger(CONFIG.fortuneMeter.capacity) || CONFIG.fortuneMeter.capacity < 1) throw new Error("Fortune capacity must be a positive integer.");
  if (CONFIG.fortuneMeter.multiplier < 1) throw new Error("Fortune multiplier cannot reduce a payout.");
}

function* enumerateStops(reels, reelIndex = 0, prefix = []) {
  if (reelIndex === reels.length) { yield prefix; return; }
  for (let stop = 0; stop < reels[reelIndex].length; stop += 1) yield* enumerateStops(reels, reelIndex + 1, [...prefix, stop]);
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function mapToObject(map, denominator = null, numeric = false) {
  return Object.fromEntries([...map.entries()]
    .sort((a, b) => numeric ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0])))
    .map(([key, value]) => [key, denominator ? value / denominator : value]));
}

function createAccumulator(mode) {
  const definitions = [...CONFIG.combinations.definitions, CONFIG.combinations.fullCommune];
  return {
    mode,
    outcomes: 0,
    totalWagered: 0,
    baseLinePaid: 0,
    resolvedLinePaid: 0,
    combinationPaid: 0,
    naturalPaid: 0,
    winningOutcomes: 0,
    wildEligibleOutcomes: 0,
    wildActivatedOutcomes: 0,
    maximumNaturalPayout: 0,
    maximumStops: null,
    maximumRoll: null,
    lineCountDistribution: new Map(),
    naturalPayoutDistribution: new Map(),
    symbolPayouts: new Map(),
    tierDistribution: new Map(),
    transformationCountDistribution: new Map(),
    combinationCounts: new Map(definitions.map(definition => [definition.id, 0])),
    combinationPayouts: new Map(definitions.map(definition => [definition.id, 0])),
    fortuneGainCounts: new Map(),
    fortuneBonusPaidIfActive: 0,
    fortuneFinalPaidIfActive: 0,
    fortuneLossOutcomes: 0,
    fortuneTierDistribution: new Map(),
    maximumFortunePayout: 0,
  };
}

function record(accumulator, targetStops, roll) {
  const flags = {
    ...CONFIG.features,
    expandingWilds: accumulator.mode.expandingWilds,
    combinationBonuses: accumulator.mode.combinationBonuses,
    fortuneMeter: accumulator.mode.fortuneMeter,
    manualStops: false,
    spinDrama: false,
  };
  const naturalState = { ...state, fortuneMeter: { value: 0, charged: false } };
  const result = payouts.createSpinResult({
    targetStops,
    state: naturalState,
    id: "simulation",
    createdAt: "simulation",
    featureFlags: flags,
    featureRolls: { expandingWild: { roll } },
  });

  accumulator.outcomes += 1;
  accumulator.totalWagered += wager;
  accumulator.baseLinePaid += result.baseLineWinTotal;
  accumulator.resolvedLinePaid += result.lineWinTotal;
  accumulator.combinationPaid += result.combinationWinTotal;
  accumulator.naturalPaid += result.preModifierWin;
  if (result.preModifierWin > 0) accumulator.winningOutcomes += 1;
  if (result.featureRolls.expandingWild.eligible) accumulator.wildEligibleOutcomes += 1;
  if (result.featureRolls.expandingWild.activated) accumulator.wildActivatedOutcomes += 1;
  if (result.preModifierWin > accumulator.maximumNaturalPayout) {
    accumulator.maximumNaturalPayout = result.preModifierWin;
    accumulator.maximumStops = [...targetStops];
    accumulator.maximumRoll = roll;
  }
  increment(accumulator.lineCountDistribution, result.lineWins.length);
  increment(accumulator.naturalPayoutDistribution, result.preModifierWin);
  result.lineWins.forEach(win => increment(accumulator.symbolPayouts, win.symbolKey, win.payout));
  increment(accumulator.tierDistribution, result.naturalWinTier);
  increment(accumulator.transformationCountDistribution, result.transformations.length);
  result.combinationWins.forEach(win => {
    increment(accumulator.combinationCounts, win.id);
    increment(accumulator.combinationPayouts, win.id, win.payout);
  });

  if (accumulator.mode.fortuneMeter) {
    const awardKey = result.fortuneMeterAward.jackpotCharge ? "jackpot" : result.fortuneMeterAward.totalPoints;
    increment(accumulator.fortuneGainCounts, awardKey);
    const activeState = { ...state, fortuneMeter: { value: CONFIG.fortuneMeter.capacity, charged: true } };
    const active = payouts.createSpinResult({
      targetStops,
      state: activeState,
      id: "simulation-fortune",
      createdAt: "simulation",
      featureFlags: flags,
      featureRolls: { expandingWild: { roll } },
    });
    accumulator.fortuneBonusPaidIfActive += active.fortuneBonus;
    accumulator.fortuneFinalPaidIfActive += active.totalWin;
    if (active.totalWin === 0) accumulator.fortuneLossOutcomes += 1;
    increment(accumulator.fortuneTierDistribution, active.winTier);
    accumulator.maximumFortunePayout = Math.max(accumulator.maximumFortunePayout, active.totalWin);
  }
}

function runExact(mode) {
  const accumulator = createAccumulator(mode);
  for (const stops of enumerateStops(CONFIG.reels)) {
    for (let roll = 0; roll < CONFIG.expandingWild.outcomes; roll += 1) record(accumulator, stops, roll);
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
  return { distribution, iterations, fortuneSpinFrequency: distribution[capacity] };
}

function summarize(accumulator) {
  const naturalRtp = accumulator.naturalPaid / accumulator.totalWagered;
  const baseLineRtp = accumulator.baseLinePaid / accumulator.totalWagered;
  const resolvedLineRtp = accumulator.resolvedLinePaid / accumulator.totalWagered;
  const incrementalWildRtp = (accumulator.resolvedLinePaid - accumulator.baseLinePaid) / accumulator.totalWagered;
  const combinationRtp = accumulator.combinationPaid / accumulator.totalWagered;
  const common = {
    id: accumulator.mode.id,
    name: accumulator.mode.name,
    mode: "exact-state-transition",
    featureFlags: {
      expandingWilds: accumulator.mode.expandingWilds,
      combinationBonuses: accumulator.mode.combinationBonuses,
      fortuneMeter: accumulator.mode.fortuneMeter,
      manualStops: false,
    },
    outcomes: accumulator.outcomes,
    wagerPerSpin: wager,
    totalWagered: accumulator.totalWagered,
    baseLineRtp,
    resolvedLineRtp,
    incrementalWildRtp,
    combinationRtp,
    naturalRtp,
    totalRtp: naturalRtp,
    anyReturnFrequency: accumulator.winningOutcomes / accumulator.outcomes,
    wildEligibilityFrequency: accumulator.wildEligibleOutcomes / accumulator.outcomes,
    wildActivationFrequency: accumulator.wildActivatedOutcomes / accumulator.outcomes,
    maximumPayout: accumulator.maximumNaturalPayout,
    maximumPayoutMultiple: accumulator.maximumNaturalPayout / wager,
    maximumStops: accumulator.maximumStops,
    maximumRoll: accumulator.maximumRoll,
    lineCountDistribution: mapToObject(accumulator.lineCountDistribution, accumulator.outcomes, true),
    payoutDistribution: mapToObject(accumulator.naturalPayoutDistribution, accumulator.outcomes, true),
    symbolContribution: mapToObject(accumulator.symbolPayouts, accumulator.totalWagered),
    winTierDistribution: mapToObject(accumulator.tierDistribution, accumulator.outcomes),
    transformationCountDistribution: mapToObject(accumulator.transformationCountDistribution, accumulator.outcomes, true),
    combinationTriggerFrequency: mapToObject(accumulator.combinationCounts, accumulator.outcomes),
    combinationRtpContribution: mapToObject(accumulator.combinationPayouts, accumulator.totalWagered),
  };
  if (!accumulator.mode.fortuneMeter) return common;

  const stationary = solveFortuneStationary(accumulator);
  const fortuneSpinFrequency = stationary.fortuneSpinFrequency;
  const averageNaturalWinOnFortuneSpin = accumulator.naturalPaid / accumulator.outcomes;
  const averageFinalWinOnFortuneSpin = accumulator.fortuneFinalPaidIfActive / accumulator.outcomes;
  const averageFortuneBonus = accumulator.fortuneBonusPaidIfActive / accumulator.outcomes;
  const incrementalFortuneRtp = fortuneSpinFrequency * averageFortuneBonus / wager;
  return {
    ...common,
    rtpBeforeFortune: naturalRtp,
    incrementalFortuneRtp,
    totalRtp: naturalRtp + incrementalFortuneRtp,
    fortuneSpinFrequency,
    averageSpinsBetweenFortuneSpins: 1 / fortuneSpinFrequency,
    averageMeterCycleLength: 1 / fortuneSpinFrequency,
    averageMeterPointsPerPaidSpin: [...accumulator.fortuneGainCounts.entries()].reduce((sum, [award, count]) => {
      return sum + (award === "jackpot" ? CONFIG.fortuneMeter.capacity : Number(award)) * count;
    }, 0) / accumulator.outcomes,
    averageNaturalWinOnFortuneSpin,
    averageFinalWinOnFortuneSpin,
    averageFortuneBonus,
    fortuneSpinLossFrequency: accumulator.fortuneLossOutcomes / accumulator.outcomes,
    fortuneSpinTierDistribution: mapToObject(accumulator.fortuneTierDistribution, accumulator.outcomes),
    fortuneGainDistribution: mapToObject(accumulator.fortuneGainCounts, accumulator.outcomes, true),
    maximumPayout: accumulator.maximumFortunePayout,
    maximumPayoutMultiple: accumulator.maximumFortunePayout / wager,
    maximumNaturalPayout: accumulator.maximumNaturalPayout,
    maximumNaturalPayoutMultiple: accumulator.maximumNaturalPayout / wager,
    meterStateIterations: stationary.iterations,
    meterStateDistribution: Object.fromEntries(stationary.distribution.map((probability, meter) => [meter, probability])),
  };
}

const percentage = value => `${(value * 100).toFixed(4)}%`;

function printReport(report) {
  console.log(`\n${report.name} (${report.mode})`);
  console.log("=".repeat(72));
  console.log(`Weighted outcomes:                    ${report.outcomes.toLocaleString()}`);
  console.log(`Base line RTP:                        ${percentage(report.baseLineRtp)}`);
  console.log(`Incremental Tree RTP:                 ${percentage(report.incrementalWildRtp)}`);
  console.log(`Combination RTP:                      ${percentage(report.combinationRtp)}`);
  if (report.id === "fortune") {
    console.log(`RTP before Fortune:                   ${percentage(report.rtpBeforeFortune)}`);
    console.log(`Incremental Fortune RTP:              ${percentage(report.incrementalFortuneRtp)}`);
    console.log(`Final combined RTP:                   ${percentage(report.totalRtp)}`);
    console.log(`Fortune Spin frequency:               ${percentage(report.fortuneSpinFrequency)}`);
    console.log(`Average spins between Fortune Spins:  ${report.averageSpinsBetweenFortuneSpins.toFixed(4)}`);
    console.log(`Average natural Fortune-spin win:     ${report.averageNaturalWinOnFortuneSpin.toFixed(6)}`);
    console.log(`Average final Fortune-spin win:       ${report.averageFinalWinOnFortuneSpin.toFixed(6)}`);
    console.log(`Average Fortune bonus:                ${report.averageFortuneBonus.toFixed(6)}`);
    console.log(`Fortune Spin zero-pay frequency:      ${percentage(report.fortuneSpinLossFrequency)}`);
    console.log(`Average meter gain per paid spin:     ${report.averageMeterPointsPerPaidSpin.toFixed(6)}`);
    console.log(`Average meter cycle length:           ${report.averageMeterCycleLength.toFixed(4)}`);
    console.log(`Maximum Fortune payout:               ${report.maximumPayout} (${report.maximumPayoutMultiple.toFixed(2)}x total bet)`);
    console.log("Fortune Spin tier distribution:");
    Object.entries(report.fortuneSpinTierDistribution).forEach(([tier, frequency]) => console.log(`  ${tier.padEnd(10)} ${percentage(frequency)}`));
    console.log("Long-run meter-state distribution (nonzero states):");
    Object.entries(report.meterStateDistribution)
      .filter(([, probability]) => probability > 1e-8)
      .forEach(([meter, probability]) => console.log(`  ${meter.padStart(3)}: ${percentage(probability)}`));
  } else {
    console.log(`Combined total RTP:                   ${percentage(report.totalRtp)}`);
    console.log(`Maximum payout:                       ${report.maximumPayout} (${report.maximumPayoutMultiple.toFixed(2)}x total bet)`);
  }
}

function assertManualStopIsolation() {
  const targetStops = [7, 4, 5];
  const base = {
    targetStops,
    state: { lineBetIndex: 0, fortuneMeter: { value: 100, charged: true } },
    id: "manual-stop-isolation",
    createdAt: "simulation",
    featureRolls: { expandingWild: { roll: 0 } },
  };
  const off = payouts.createSpinResult({ ...base, featureFlags: { ...CONFIG.features, manualStops: false } });
  const on = payouts.createSpinResult({ ...base, featureFlags: { ...CONFIG.features, manualStops: true } });
  const mathFields = ["targetStops", "originalMatrix", "resolvedMatrix", "featureRolls", "transformations", "lineWins", "combinationWins", "preModifierWin", "fortuneMeterAward", "totalWin", "winTier"];
  mathFields.forEach(field => {
    if (JSON.stringify(off[field]) !== JSON.stringify(on[field])) throw new Error(`Manual-stop isolation failed for ${field}.`);
  });
}

function checkReports(reports) {
  const byId = Object.fromEntries(reports.map(report => [report.id, report]));
  const expectedBase = 0.8200231481481481;
  const expectedBoth = 0.8679976851851852;
  const failures = [];
  if (Math.abs(byId.base.totalRtp - expectedBase) > 1e-12) failures.push(`Base RTP changed: ${percentage(byId.base.totalRtp)}`);
  if (byId.wild.incrementalWildRtp < CONFIG.rtpTargets.expandingWildIncrement.minimum || byId.wild.incrementalWildRtp > CONFIG.rtpTargets.expandingWildIncrement.maximum) failures.push(`Tree contribution outside target: ${percentage(byId.wild.incrementalWildRtp)}`);
  if (byId.combinations.combinationRtp < CONFIG.rtpTargets.combinations.minimum || byId.combinations.combinationRtp > CONFIG.rtpTargets.combinations.maximum) failures.push(`Combination contribution outside target: ${percentage(byId.combinations.combinationRtp)}`);
  if (Math.abs(byId.both.totalRtp - expectedBoth) > 1e-12) failures.push(`Pre-Fortune combined RTP changed: ${percentage(byId.both.totalRtp)}`);
  if (byId.fortune.incrementalFortuneRtp < CONFIG.rtpTargets.fortuneIncrement.minimum || byId.fortune.incrementalFortuneRtp > CONFIG.rtpTargets.fortuneIncrement.maximum) failures.push(`Fortune contribution outside target: ${percentage(byId.fortune.incrementalFortuneRtp)}`);
  if (byId.fortune.totalRtp < CONFIG.rtpTargets.fortuneTotal.minimum || byId.fortune.totalRtp > CONFIG.rtpTargets.fortuneTotal.maximum) failures.push(`Fortune total outside target: ${percentage(byId.fortune.totalRtp)}`);
  try { assertManualStopIsolation(); } catch (error) { failures.push(error.message); }
  if (failures.length) {
    failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`));
    process.exitCode = 1;
  } else {
    console.log("\nExact feature math and manual-stop isolation check: PASS");
  }
}

validateConfig();
const reports = MODES.map(mode => summarize(runExact(mode)));
if (outputJson) console.log(JSON.stringify(reports, null, 2));
else reports.forEach(printReport);
if (checkTarget) checkReports(reports);
