#!/usr/bin/env node

await import("../js/config.js");
await import("../js/payouts.js");

const app = globalThis.CommuneFortune;
const { CONFIG, payouts } = app;
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = true] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const state = { lineBetIndex: 0 };
const wager = payouts.getTotalBet(state);
const requestedSpins = args.has("spins") ? Number(args.get("spins")) : null;
const seed = args.has("seed") ? Number(args.get("seed")) : 20260717;
const outputJson = args.has("json");
const checkTarget = args.has("check");

const MODES = Object.freeze([
  { id: "base", name: "Base only", expandingWilds: false, combinationBonuses: false },
  { id: "wild", name: "Base + expanding Wild", expandingWilds: true, combinationBonuses: false },
  { id: "combinations", name: "Base + combinations", expandingWilds: false, combinationBonuses: true },
  { id: "both", name: "Base + both", expandingWilds: true, combinationBonuses: true },
]);

function validateConfig() {
  if (!Number.isInteger(CONFIG.rowCount) || CONFIG.rowCount < 1) throw new Error("CONFIG.rowCount must be a positive integer.");
  if (!Array.isArray(CONFIG.reels) || CONFIG.reels.length < 1) throw new Error("CONFIG.reels must contain at least one reel.");
  CONFIG.reels.forEach((reel, reelIndex) => {
    if (!Array.isArray(reel) || reel.length < CONFIG.rowCount) throw new Error(`Reel ${reelIndex + 1} is shorter than the visible row count.`);
    reel.forEach(symbolKey => { if (!CONFIG.symbols[symbolKey]) throw new Error(`Reel ${reelIndex + 1} references unknown symbol ${symbolKey}.`); });
  });
  CONFIG.paylines.forEach((line, lineIndex) => {
    if (!Array.isArray(line) || line.length !== CONFIG.reels.length) throw new Error(`Payline ${lineIndex + 1} must contain one row per reel.`);
    line.forEach(row => { if (!Number.isInteger(row) || row < 0 || row >= CONFIG.rowCount) throw new Error(`Payline ${lineIndex + 1} contains invalid row ${row}.`); });
  });
  if (!Number.isInteger(CONFIG.expandingWild.outcomes) || CONFIG.expandingWild.outcomes < 1) throw new Error("Expanding-Wild outcomes must be positive.");
  CONFIG.expandingWild.activatingRolls.forEach(roll => {
    if (!Number.isInteger(roll) || roll < 0 || roll >= CONFIG.expandingWild.outcomes) throw new Error(`Invalid expanding-Wild activating roll ${roll}.`);
  });
}

function mulberry32(initialSeed) {
  let value = initialSeed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function* enumerateStops(reels, reelIndex = 0, prefix = []) {
  if (reelIndex === reels.length) { yield prefix; return; }
  for (let stop = 0; stop < reels[reelIndex].length; stop += 1) yield* enumerateStops(reels, reelIndex + 1, [...prefix, stop]);
}

function createAccumulator(mode) {
  const combinationDefinitions = [...CONFIG.combinations.definitions, CONFIG.combinations.fullCommune];
  return {
    mode, outcomes: 0, totalWagered: 0, baseLinePaid: 0, resolvedLinePaid: 0, combinationPaid: 0, totalPaid: 0,
    winningOutcomes: 0, partialReturnOutcomes: 0, breakEvenOutcomes: 0, profitableOutcomes: 0,
    wildEligibleOutcomes: 0, wildActivatedOutcomes: 0, expandedResolvedLinePaid: 0, expandedIncrementalLinePaid: 0,
    maximumPayout: 0, maximumStops: null, maximumRoll: null,
    lineCountDistribution: new Map(), payoutDistribution: new Map(), symbolPayouts: new Map(), tierDistribution: new Map(), transformationCountDistribution: new Map(),
    combinationCounts: new Map(combinationDefinitions.map(definition => [definition.id, 0])),
    combinationPayouts: new Map(combinationDefinitions.map(definition => [definition.id, 0])),
  };
}

function record(accumulator, targetStops, roll) {
  const result = payouts.createSpinResult({
    targetStops, state, id: "simulation", createdAt: "simulation",
    featureFlags: { ...CONFIG.features, expandingWilds: accumulator.mode.expandingWilds, combinationBonuses: accumulator.mode.combinationBonuses, spinDrama: false },
    featureRolls: { expandingWild: { roll } },
  });
  accumulator.outcomes += 1;
  accumulator.totalWagered += wager;
  accumulator.baseLinePaid += result.baseLineWinTotal;
  accumulator.resolvedLinePaid += result.lineWinTotal;
  accumulator.combinationPaid += result.combinationWinTotal;
  accumulator.totalPaid += result.totalWin;
  if (result.totalWin > 0) accumulator.winningOutcomes += 1;
  if (result.totalWin > 0 && result.totalWin < wager) accumulator.partialReturnOutcomes += 1;
  if (result.totalWin === wager) accumulator.breakEvenOutcomes += 1;
  if (result.totalWin > wager) accumulator.profitableOutcomes += 1;
  if (result.featureRolls.expandingWild.eligible) accumulator.wildEligibleOutcomes += 1;
  if (result.featureRolls.expandingWild.activated) {
    accumulator.wildActivatedOutcomes += 1;
    accumulator.expandedResolvedLinePaid += result.lineWinTotal;
    accumulator.expandedIncrementalLinePaid += result.lineWinTotal - result.baseLineWinTotal;
  }
  if (result.totalWin > accumulator.maximumPayout) {
    accumulator.maximumPayout = result.totalWin;
    accumulator.maximumStops = [...targetStops];
    accumulator.maximumRoll = roll;
  }
  accumulator.lineCountDistribution.set(result.lineWins.length, (accumulator.lineCountDistribution.get(result.lineWins.length) || 0) + 1);
  accumulator.payoutDistribution.set(result.totalWin, (accumulator.payoutDistribution.get(result.totalWin) || 0) + 1);
  result.lineWins.forEach(win => accumulator.symbolPayouts.set(win.symbolKey, (accumulator.symbolPayouts.get(win.symbolKey) || 0) + win.payout));
  accumulator.tierDistribution.set(result.winTier, (accumulator.tierDistribution.get(result.winTier) || 0) + 1);
  accumulator.transformationCountDistribution.set(result.transformations.length, (accumulator.transformationCountDistribution.get(result.transformations.length) || 0) + 1);
  result.combinationWins.forEach(win => {
    accumulator.combinationCounts.set(win.id, (accumulator.combinationCounts.get(win.id) || 0) + 1);
    accumulator.combinationPayouts.set(win.id, (accumulator.combinationPayouts.get(win.id) || 0) + win.payout);
  });
}

function runExact(mode) {
  const accumulator = createAccumulator(mode);
  for (const stops of enumerateStops(CONFIG.reels)) for (let roll = 0; roll < CONFIG.expandingWild.outcomes; roll += 1) record(accumulator, stops, roll);
  return accumulator;
}

function runMonteCarlo(mode, spins, randomSeed) {
  if (!Number.isInteger(spins) || spins < 1) throw new Error("--spins must be a positive integer.");
  const accumulator = createAccumulator(mode);
  const rng = mulberry32(randomSeed);
  for (let spin = 0; spin < spins; spin += 1) {
    const stops = CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
    const roll = Math.floor(rng() * CONFIG.expandingWild.outcomes);
    record(accumulator, stops, roll);
  }
  return accumulator;
}

function mapToObject(map, denominator = null, numeric = false) {
  return Object.fromEntries([...map.entries()].sort((a, b) => numeric ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0]))).map(([key, value]) => [key, denominator ? value / denominator : value]));
}

function summarize(accumulator) {
  const totalRtp = accumulator.totalPaid / accumulator.totalWagered;
  const baseLineRtp = accumulator.baseLinePaid / accumulator.totalWagered;
  const resolvedLineRtp = accumulator.resolvedLinePaid / accumulator.totalWagered;
  const incrementalWildRtp = (accumulator.resolvedLinePaid - accumulator.baseLinePaid) / accumulator.totalWagered;
  const combinationRtp = accumulator.combinationPaid / accumulator.totalWagered;
  const symbolContribution = Object.fromEntries([...accumulator.symbolPayouts.entries()].sort((a, b) => b[1] - a[1]).map(([symbolKey, payout]) => [symbolKey, payout / accumulator.totalWagered]));
  return {
    id: accumulator.mode.id, name: accumulator.mode.name, mode: requestedSpins ? "monte-carlo" : "exact", seed: requestedSpins ? seed : null,
    featureFlags: { expandingWilds: accumulator.mode.expandingWilds, combinationBonuses: accumulator.mode.combinationBonuses },
    outcomes: accumulator.outcomes, wagerPerSpin: wager, totalWagered: accumulator.totalWagered, totalPaid: accumulator.totalPaid,
    baseLineRtp, resolvedLineRtp, incrementalWildRtp, combinationRtp, totalRtp, houseEdge: 1 - totalRtp,
    anyReturnFrequency: accumulator.winningOutcomes / accumulator.outcomes,
    partialReturnFrequency: accumulator.partialReturnOutcomes / accumulator.outcomes,
    breakEvenFrequency: accumulator.breakEvenOutcomes / accumulator.outcomes,
    netProfitableFrequency: accumulator.profitableOutcomes / accumulator.outcomes,
    averagePayoutPerSpin: accumulator.totalPaid / accumulator.outcomes,
    averagePayoutOnWin: accumulator.winningOutcomes ? accumulator.totalPaid / accumulator.winningOutcomes : 0,
    expectedLossPerSpin: wager - accumulator.totalPaid / accumulator.outcomes,
    wildEligibilityFrequency: accumulator.wildEligibleOutcomes / accumulator.outcomes,
    wildActivationFrequency: accumulator.wildActivatedOutcomes / accumulator.outcomes,
    expandedResolvedLineRtp: accumulator.expandedResolvedLinePaid / accumulator.totalWagered,
    expandedIncrementalLineRtp: accumulator.expandedIncrementalLinePaid / accumulator.totalWagered,
    combinationTriggerFrequency: mapToObject(accumulator.combinationCounts, accumulator.outcomes),
    combinationRtpContribution: mapToObject(accumulator.combinationPayouts, accumulator.totalWagered),
    fullCommuneFrequency: (accumulator.combinationCounts.get("full-commune") || 0) / accumulator.outcomes,
    maximumPayout: accumulator.maximumPayout, maximumPayoutMultiple: accumulator.maximumPayout / wager, maximumStops: accumulator.maximumStops, maximumRoll: accumulator.maximumRoll,
    lineCountDistribution: mapToObject(accumulator.lineCountDistribution, accumulator.outcomes, true),
    payoutDistribution: mapToObject(accumulator.payoutDistribution, accumulator.outcomes, true),
    symbolContribution,
    winTierDistribution: mapToObject(accumulator.tierDistribution, accumulator.outcomes),
    transformationCountDistribution: mapToObject(accumulator.transformationCountDistribution, accumulator.outcomes, true),
  };
}

const percentage = value => `${(value * 100).toFixed(4)}%`;

function printReport(report) {
  console.log(`\n${report.name} (${report.mode})`);
  console.log("=".repeat(64));
  console.log(`Weighted outcomes:                ${report.outcomes.toLocaleString()}`);
  console.log(`Wager per spin:                   ${report.wagerPerSpin}`);
  console.log(`Base line RTP:                    ${percentage(report.baseLineRtp)}`);
  console.log(`Incremental expanding-Wild RTP:   ${percentage(report.incrementalWildRtp)}`);
  console.log(`Combination RTP:                  ${percentage(report.combinationRtp)}`);
  console.log(`Combined total RTP:               ${percentage(report.totalRtp)}`);
  console.log(`House edge:                       ${percentage(report.houseEdge)}`);
  console.log(`Any-return frequency:             ${percentage(report.anyReturnFrequency)}`);
  console.log(`Partial-return frequency:         ${percentage(report.partialReturnFrequency)}`);
  console.log(`Break-even frequency:             ${percentage(report.breakEvenFrequency)}`);
  console.log(`Net-profitable frequency:         ${percentage(report.netProfitableFrequency)}`);
  console.log(`Average payout per spin:          ${report.averagePayoutPerSpin.toFixed(6)}`);
  console.log(`Average payout on a win:          ${report.averagePayoutOnWin.toFixed(6)}`);
  console.log(`Expected loss per spin:           ${report.expectedLossPerSpin.toFixed(6)}`);
  console.log(`Wild eligibility frequency:       ${percentage(report.wildEligibilityFrequency)}`);
  console.log(`Wild activation frequency:        ${percentage(report.wildActivationFrequency)}`);
  console.log(`Resolved line RTP on activations: ${percentage(report.expandedResolvedLineRtp)}`);
  console.log(`Incremental RTP on activations:   ${percentage(report.expandedIncrementalLineRtp)}`);
  console.log(`Maximum payout:                   ${report.maximumPayout} (${report.maximumPayoutMultiple.toFixed(2)}x total bet)`);
  console.log(`Maximum stops / roll:             [${report.maximumStops.join(", ")}] / ${report.maximumRoll}`);
  console.log("\nCombination triggers and RTP:");
  for (const definition of [...CONFIG.combinations.definitions, CONFIG.combinations.fullCommune]) {
    const trigger = percentage(report.combinationTriggerFrequency[definition.id] || 0).padEnd(10);
    const contribution = percentage(report.combinationRtpContribution[definition.id] || 0);
    console.log(`  ${definition.name.padEnd(15)} ${trigger} ${contribution}`);
  }
  console.log("\nRTP contribution by resolved winning symbol:");
  Object.entries(report.symbolContribution).forEach(([symbolKey, contribution]) => console.log(`  ${symbolKey.padEnd(4)} ${percentage(contribution)}`));
  console.log("\nWinning-line count distribution:");
  Object.entries(report.lineCountDistribution).forEach(([lineCount, frequency]) => console.log(`  ${lineCount} line(s): ${percentage(frequency)}`));
  console.log("Win-tier distribution:");
  Object.entries(report.winTierDistribution).forEach(([tier, frequency]) => console.log(`  ${tier.padEnd(10)} ${percentage(frequency)}`));
  console.log("Transformation count distribution:");
  Object.entries(report.transformationCountDistribution).forEach(([count, frequency]) => console.log(`  ${count} transformation(s): ${percentage(frequency)}`));
}

function checkReports(reports) {
  const byId = Object.fromEntries(reports.map(report => [report.id, report]));
  const expectedBase = 0.8200231481481481;
  const failures = [];
  if (Math.abs(byId.base.totalRtp - expectedBase) > 1e-12) failures.push(`Base RTP changed: ${percentage(byId.base.totalRtp)}`);
  if (byId.wild.incrementalWildRtp < CONFIG.rtpTargets.expandingWildIncrement.minimum || byId.wild.incrementalWildRtp > CONFIG.rtpTargets.expandingWildIncrement.maximum) failures.push(`Wild contribution outside target: ${percentage(byId.wild.incrementalWildRtp)}`);
  if (byId.combinations.combinationRtp < CONFIG.rtpTargets.combinations.minimum || byId.combinations.combinationRtp > CONFIG.rtpTargets.combinations.maximum) failures.push(`Combination contribution outside target: ${percentage(byId.combinations.combinationRtp)}`);
  if (byId.both.totalRtp < CONFIG.rtpTargets.featurePassTotal.minimum || byId.both.totalRtp > CONFIG.rtpTargets.featurePassTotal.maximum) failures.push(`Combined RTP outside target: ${percentage(byId.both.totalRtp)}`);
  if (failures.length) { failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`)); process.exitCode = 1; }
  else console.log("\nExact feature math check: PASS");
}

validateConfig();
const reports = MODES.map(mode => summarize(requestedSpins ? runMonteCarlo(mode, requestedSpins, seed) : runExact(mode)));
if (outputJson) console.log(JSON.stringify(reports, null, 2));
else reports.forEach(printReport);
if (checkTarget) checkReports(reports);
