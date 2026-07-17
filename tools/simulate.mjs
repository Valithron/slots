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

function validateConfig() {
  if (!Number.isInteger(CONFIG.rowCount) || CONFIG.rowCount < 1) {
    throw new Error("CONFIG.rowCount must be a positive integer.");
  }
  if (!Array.isArray(CONFIG.reels) || CONFIG.reels.length < 1) {
    throw new Error("CONFIG.reels must contain at least one reel.");
  }
  CONFIG.reels.forEach((reel, reelIndex) => {
    if (!Array.isArray(reel) || reel.length < CONFIG.rowCount) {
      throw new Error(`Reel ${reelIndex + 1} is shorter than the visible row count.`);
    }
    reel.forEach(symbolKey => {
      if (!CONFIG.symbols[symbolKey]) {
        throw new Error(`Reel ${reelIndex + 1} references unknown symbol ${symbolKey}.`);
      }
    });
  });
  CONFIG.paylines.forEach((line, lineIndex) => {
    if (!Array.isArray(line) || line.length !== CONFIG.reels.length) {
      throw new Error(`Payline ${lineIndex + 1} must contain one row per reel.`);
    }
    line.forEach(row => {
      if (!Number.isInteger(row) || row < 0 || row >= CONFIG.rowCount) {
        throw new Error(`Payline ${lineIndex + 1} contains invalid row ${row}.`);
      }
    });
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
  if (reelIndex === reels.length) {
    yield prefix;
    return;
  }

  for (let stop = 0; stop < reels[reelIndex].length; stop += 1) {
    yield* enumerateStops(reels, reelIndex + 1, [...prefix, stop]);
  }
}

function createAccumulator(mode) {
  return {
    mode,
    outcomes: 0,
    totalWagered: 0,
    totalPaid: 0,
    winningOutcomes: 0,
    partialReturnOutcomes: 0,
    breakEvenOutcomes: 0,
    profitableOutcomes: 0,
    maximumPayout: 0,
    maximumStops: null,
    lineCountDistribution: new Map(),
    payoutDistribution: new Map(),
    symbolPayouts: new Map(),
  };
}

function record(accumulator, targetStops) {
  const result = payouts.createSpinResult({ targetStops, state, id: "simulation" });
  const paid = result.totalWin;
  const lineCount = result.lineWins.length;

  accumulator.outcomes += 1;
  accumulator.totalWagered += wager;
  accumulator.totalPaid += paid;
  if (paid > 0) accumulator.winningOutcomes += 1;
  if (paid > 0 && paid < wager) accumulator.partialReturnOutcomes += 1;
  if (paid === wager) accumulator.breakEvenOutcomes += 1;
  if (paid > wager) accumulator.profitableOutcomes += 1;
  if (paid > accumulator.maximumPayout) {
    accumulator.maximumPayout = paid;
    accumulator.maximumStops = [...targetStops];
  }

  accumulator.lineCountDistribution.set(
    lineCount,
    (accumulator.lineCountDistribution.get(lineCount) || 0) + 1,
  );
  accumulator.payoutDistribution.set(
    paid,
    (accumulator.payoutDistribution.get(paid) || 0) + 1,
  );

  result.lineWins.forEach(win => {
    accumulator.symbolPayouts.set(
      win.symbolKey,
      (accumulator.symbolPayouts.get(win.symbolKey) || 0) + win.payout,
    );
  });
}

function runExact() {
  const accumulator = createAccumulator("exact");
  for (const stops of enumerateStops(CONFIG.reels)) record(accumulator, stops);
  return accumulator;
}

function runMonteCarlo(spins, randomSeed) {
  if (!Number.isInteger(spins) || spins < 1) {
    throw new Error("--spins must be a positive integer.");
  }

  const accumulator = createAccumulator("monte-carlo");
  const rng = mulberry32(randomSeed);
  for (let spin = 0; spin < spins; spin += 1) {
    const stops = CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
    record(accumulator, stops);
  }
  return accumulator;
}

function mapToSortedObject(map, numericKeys = false) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => numericKeys ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0]))),
  );
}

function summarize(accumulator) {
  const rtp = accumulator.totalPaid / accumulator.totalWagered;
  const target = CONFIG.rtpTargets.base;
  const symbolContribution = Object.fromEntries(
    [...accumulator.symbolPayouts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([symbolKey, payout]) => [symbolKey, payout / accumulator.totalWagered]),
  );

  return {
    mode: accumulator.mode,
    seed: accumulator.mode === "monte-carlo" ? seed : null,
    outcomes: accumulator.outcomes,
    wagerPerSpin: wager,
    totalWagered: accumulator.totalWagered,
    totalPaid: accumulator.totalPaid,
    rtp,
    houseEdge: 1 - rtp,
    target,
    withinTarget: rtp >= target.minimum && rtp <= target.maximum,
    hitFrequency: accumulator.winningOutcomes / accumulator.outcomes,
    partialReturnFrequency: accumulator.partialReturnOutcomes / accumulator.outcomes,
    breakEvenFrequency: accumulator.breakEvenOutcomes / accumulator.outcomes,
    profitableFrequency: accumulator.profitableOutcomes / accumulator.outcomes,
    averagePayoutPerSpin: accumulator.totalPaid / accumulator.outcomes,
    averagePayoutOnWin: accumulator.winningOutcomes
      ? accumulator.totalPaid / accumulator.winningOutcomes
      : 0,
    expectedLossPerSpin: wager - accumulator.totalPaid / accumulator.outcomes,
    maximumPayout: accumulator.maximumPayout,
    maximumPayoutMultiple: accumulator.maximumPayout / wager,
    maximumStops: accumulator.maximumStops,
    lineCountDistribution: mapToSortedObject(accumulator.lineCountDistribution, true),
    payoutDistribution: mapToSortedObject(accumulator.payoutDistribution, true),
    symbolContribution,
  };
}

function percentage(value) {
  return `${(value * 100).toFixed(4)}%`;
}

function printReport(report) {
  console.log(`Commune Fortune base-game simulation (${report.mode})`);
  console.log("=".repeat(54));
  console.log(`Outcomes:                 ${report.outcomes.toLocaleString()}`);
  console.log(`Wager per spin:           ${report.wagerPerSpin}`);
  console.log(`Base RTP:                 ${percentage(report.rtp)}`);
  console.log(`Target base RTP:          ${percentage(report.target.minimum)} to ${percentage(report.target.maximum)}`);
  console.log(`Target status:            ${report.withinTarget ? "PASS" : "OUTSIDE TARGET"}`);
  console.log(`House edge:               ${percentage(report.houseEdge)}`);
  console.log(`Any-return frequency:     ${percentage(report.hitFrequency)}`);
  console.log(`Partial-return frequency: ${percentage(report.partialReturnFrequency)}`);
  console.log(`Break-even frequency:     ${percentage(report.breakEvenFrequency)}`);
  console.log(`Profitable frequency:     ${percentage(report.profitableFrequency)}`);
  console.log(`Average payout/spin:      ${report.averagePayoutPerSpin.toFixed(6)}`);
  console.log(`Average payout/win:       ${report.averagePayoutOnWin.toFixed(6)}`);
  console.log(`Expected loss/spin:       ${report.expectedLossPerSpin.toFixed(6)}`);
  console.log(`Maximum payout:           ${report.maximumPayout} (${report.maximumPayoutMultiple.toFixed(2)}x total bet)`);
  console.log(`Maximum stops:            [${report.maximumStops.join(", ")}]`);

  console.log("\nRTP contribution by winning symbol:");
  Object.entries(report.symbolContribution).forEach(([symbolKey, contribution]) => {
    console.log(`  ${symbolKey.padEnd(4)} ${percentage(contribution)}`);
  });

  console.log("\nWinning-line count distribution:");
  Object.entries(report.lineCountDistribution).forEach(([lineCount, count]) => {
    console.log(`  ${lineCount} lines: ${Number(count).toLocaleString()} (${percentage(count / report.outcomes)})`);
  });
}

validateConfig();
const accumulator = requestedSpins ? runMonteCarlo(requestedSpins, seed) : runExact();
const report = summarize(accumulator);

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (checkTarget && !report.withinTarget) process.exitCode = 1;
