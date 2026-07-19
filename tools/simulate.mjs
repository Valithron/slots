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
const getTotalBet = localState => payouts.getTotalBet(localState);

function createSpinResult({ targetStops, localState, roll, fortune = false, spinType = "paid", totalAwardedSpins = 4 }) {
  const simulationState = {
    ...localState,
    fortuneMeter: fortune
      ? { value: CONFIG.fortuneMeter.capacity, charged: true }
      : { value: 0, charged: false },
    freeSpinSession: null,
  };
  return payouts.createSpinResult({
    targetStops,
    state: simulationState,
    id: `exact-${targetStops.join("-")}-${roll}-${spinType}-${fortune ? "fortune" : "natural"}`,
    createdAt: "exact-simulation",
    spinType,
    referenceBet: getTotalBet(localState),
    totalAwardedSpins,
    featureRolls: { expandingWild: { roll } },
    allyBypass: true,
  });
}
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = true] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const outputJson = args.has("json");
const checkTarget = args.has("check");
const runMonteCarlo = args.has("monte-carlo");
const state = { lineBetIndex: 0, fortuneMeter: { value: 0, charged: false } };
const wager = getTotalBet(state);
const probabilityTolerance = 1e-12;

function* enumerateStops(reels, reelIndex = 0, prefix = []) {
  if (reelIndex === reels.length) { yield prefix; return; }
  for (let stop = 0; stop < reels[reelIndex].length; stop += 1) yield* enumerateStops(reels, reelIndex + 1, [...prefix, stop]);
}
function increment(map, key, amount = 1) { map.set(key, (map.get(key) || 0) + amount); }
function percentage(value) { return `${(value * 100).toFixed(4)}%`; }

function validateConfig() {
  if (CONFIG.reels.length !== 3 || CONFIG.reels.some(reel => reel.length !== 24)) throw new Error("Exact model expects three 24-stop reels.");
  if (CONFIG.freeSpins.startingAward !== 4 || CONFIG.freeSpins.retriggerAward !== 2 || CONFIG.freeSpins.maximumAwardedSpins !== 20) throw new Error("Free-spin rules changed outside the exact model.");
  if (CONFIG.allyOrder.length !== 7) throw new Error("All seven allies must be configured.");
}

function enumerateExactOutcomes() {
  const acc = {
    outcomes: 0, totalWagered: 0, baseLinePaid: 0, resolvedLinePaid: 0, combinationPaid: 0, naturalPaid: 0,
    triggerOutcomes: 0, fortuneGainCounts: new Map(), fortuneBonusPaidIfActive: 0,
    maximumFortunePayout: 0, maximumTriggerPaidPayout: 0, maximumFreeSpinPayout: 0,
    maximumBaseSpinPayout: 0, wildActivated: 0, combinationOutcomes: 0, categories: new Map(),
    mysteryTokenCounts: new Map(), mysteryFreeSpinsRequested: 0, mysteryModifierAwards: 0,
  };
  for (const targetStops of enumerateStops(CONFIG.reels)) {
    for (let roll = 0; roll < CONFIG.expandingWild.outcomes; roll += 1) {
      const natural = createSpinResult({ targetStops, localState: state, roll, spinType: "paid" });
      const fortune = createSpinResult({ targetStops, localState: state, roll, fortune: true, spinType: "paid" });
      const free = createSpinResult({ targetStops, localState: state, roll, spinType: "free", totalAwardedSpins: CONFIG.freeSpins.startingAward });
      acc.outcomes += 1;
      acc.totalWagered += wager;
      acc.baseLinePaid += natural.baseLineWinTotal;
      acc.resolvedLinePaid += natural.lineWinTotal;
      acc.combinationPaid += natural.combinationWinTotal;
      acc.naturalPaid += natural.preModifierWin;
      acc.fortuneBonusPaidIfActive += fortune.fortuneBonus;
      if (natural.freeSpinTrigger.triggered) acc.triggerOutcomes += 1;
      if (natural.featureRolls.expandingWild.activated) acc.wildActivated += 1;
      if (natural.combinationWins.length) acc.combinationOutcomes += 1;
      acc.maximumFortunePayout = Math.max(acc.maximumFortunePayout, fortune.totalWin);
      acc.maximumBaseSpinPayout = Math.max(acc.maximumBaseSpinPayout, natural.totalWin);
      if (natural.freeSpinTrigger.triggered) acc.maximumTriggerPaidPayout = Math.max(acc.maximumTriggerPaidPayout, fortune.totalWin);
      acc.maximumFreeSpinPayout = Math.max(acc.maximumFreeSpinPayout, free.totalWin);
      increment(acc.mysteryTokenCounts, natural.mysteryTokenCount >= 4 ? "4+" : String(natural.mysteryTokenCount));
      acc.mysteryFreeSpinsRequested += natural.mysteryAward.freeSpinsRequested;
      if (natural.mysteryAward.modifier) acc.mysteryModifierAwards += 1;
      const awardKey = natural.fortuneMeterAward.jackpotCharge ? "jackpot" : natural.fortuneMeterAward.totalPoints;
      increment(acc.fortuneGainCounts, awardKey);
      const key = JSON.stringify({ payout: free.totalWin, trigger: free.freeSpinTrigger.triggered, tier: free.naturalWinTier });
      increment(acc.categories, key);
    }
  }
  const categories = [...acc.categories.entries()].map(([json, count]) => ({ ...JSON.parse(json), probability: count / acc.outcomes }));
  return { ...acc, categories };
}

function solveFortuneStationary(acc) {
  const capacity = CONFIG.fortuneMeter.capacity;
  const transitions = [...acc.fortuneGainCounts.entries()].map(([award, count]) => ({
    points: award === "jackpot" ? capacity : Number(award), probability: count / acc.outcomes,
  }));
  let distribution = Array(capacity + 1).fill(0); distribution[0] = 1;
  for (let iteration = 0; iteration < 100000; iteration += 1) {
    const next = Array(capacity + 1).fill(0);
    for (let meter = 0; meter <= capacity; meter += 1) {
      if (!distribution[meter]) continue;
      const base = meter === capacity ? 0 : meter;
      for (const transition of transitions) next[Math.min(capacity, base + transition.points)] += distribution[meter] * transition.probability;
    }
    const delta = Math.max(...next.map((p, index) => Math.abs(p - distribution[index])));
    distribution = next;
    if (delta < 1e-15) break;
  }
  const total = distribution.reduce((sum, p) => sum + p, 0);
  distribution = distribution.map(p => p / total);
  return distribution[capacity];
}

const FINAL_PARAMETERS = Object.freeze({
  sterling: { perLoss: CONFIG.allies.sterling.parameters.insurancePerLossMultiplier, cap: CONFIG.allies.sterling.parameters.insuranceCapMultiplier },
  ryan: { multiplier: CONFIG.allies.ryan.parameters.winMultiplier },
  cooper: { ladder: [...CONFIG.allies.cooper.parameters.multiplierLadder] },
  cydney: { echo: CONFIG.allies.cydney.parameters.echoMultiplier },
  gabi: { threshold: CONFIG.allies.gabi.parameters.thresholdMultiplier, replayPool: "positive" },
  kenly: { bonus: CONFIG.allies.kenly.parameters.lemonadeMultiplier },
  ashley: {},
});
const INITIAL_PARAMETERS = Object.freeze({
  sterling: { perLoss: 0.5, cap: 3 },
  ryan: { multiplier: 5 },
  cooper: { ladder: [1, 1.5, 2, 3] },
  cydney: { echo: 0.5 },
  gabi: { threshold: 1, replayPool: "all" },
  kenly: { bonus: 0.5 },
  ashley: {},
});

function emptyResult(end = {}) {
  const payout = end.payout || 0;
  const bonus = end.bonus || 0;
  return {
    mean: payout, second: payout * payout, max: payout, maxBonus: bonus, zero: payout === 0 ? 1 : 0,
    bonusMean: bonus, activation: end.activation ? 1 : 0, value: bonus > 0 ? 1 : 0,
    spins: 0, retriggers: 0, anyRetrigger: 0, cap: end.cap ? 1 : 0,
    metrics: { ...(end.metrics || {}) },
  };
}
function metric(result, key) { return result.metrics[key] || 0; }
function addBranch(target, probability, event, sub) {
  const immediate = event.payout || 0;
  const immediateBonus = event.bonus || 0;
  target.mean += probability * (immediate + sub.mean);
  target.second += probability * (immediate * immediate + 2 * immediate * sub.mean + sub.second);
  target.max = Math.max(target.max, immediate + sub.max);
  target.maxBonus = Math.max(target.maxBonus, immediateBonus + sub.maxBonus);
  target.zero += probability * (immediate === 0 ? sub.zero : 0);
  target.bonusMean += probability * (immediateBonus + sub.bonusMean);
  target.activation += probability * (event.activation ? 1 : sub.activation);
  target.value += probability * (immediateBonus > 0 ? 1 : sub.value);
  target.spins += probability * (1 + sub.spins);
  target.retriggers += probability * ((event.award || 0) > 0 ? 1 : 0) + probability * sub.retriggers;
  target.anyRetrigger += probability * ((event.award || 0) > 0 ? 1 : sub.anyRetrigger);
  target.cap += probability * sub.cap;
  const keys = new Set([...Object.keys(event.metrics || {}), ...Object.keys(sub.metrics || {})]);
  for (const key of keys) target.metrics[key] = (target.metrics[key] || 0) + probability * ((event.metrics?.[key] || 0) + metric(sub, key));
}
function accumulatorResult() {
  return { mean: 0, second: 0, max: Number.NEGATIVE_INFINITY, maxBonus: 0, zero: 0, bonusMean: 0, activation: 0, value: 0, spins: 0, retriggers: 0, anyRetrigger: 0, cap: 0, metrics: {} };
}

function solveFeature(categories, allyId = null, parameters = {}, selectedRyanSpin = null) {
  const positiveProbability = categories.filter(c => c.payout > 0).reduce((sum, c) => sum + c.probability, 0);
  const replacementPool = parameters.replayPool === "positive"
    ? categories.filter(c => c.payout > 0).map(c => ({ ...c, probability: c.probability / positiveProbability }))
    : categories;
  const memo = new Map();

  function stateKey(remaining, total, completed, state) {
    return `${remaining}|${total}|${completed}|${JSON.stringify(state)}`;
  }
  function terminal(total, state) {
    let payout = 0; let bonus = 0; let activation = false; const metrics = {};
    if (allyId === "sterling") {
      const cap = Math.floor(parameters.cap * wager);
      payout = Math.min(cap, Math.floor((state.losses || 0) * parameters.perLoss * wager));
      bonus = payout; activation = (state.losses || 0) > 0;
      metrics.insuredLosses = state.losses || 0;
      metrics.insuranceCapReached = payout >= cap ? 1 : 0;
      metrics.rescuedZeroPay = state.allNaturalZero && payout > 0 ? 1 : 0;
      metrics.insurancePot = payout;
    } else if (allyId === "cydney") {
      payout = Math.floor((state.recorded || 0) * parameters.echo);
      bonus = payout; activation = (state.recorded || 0) > 0;
      metrics.recordedAmount = state.recorded || 0;
      metrics.echoBonus = payout;
    } else if (allyId === "cooper") {
      const maxIndex = state.maxLosses || 0;
      metrics.maximumRage = parameters.ladder[maxIndex];
      metrics.unusedRage = (state.losses || 0) > 0 ? 1 : 0;
    }
    return emptyResult({ payout, bonus, activation, cap: total >= CONFIG.freeSpins.maximumAwardedSpins, metrics });
  }

  function initialAllyState() {
    if (allyId === "sterling") return { losses: 0, allNaturalZero: true };
    if (allyId === "cooper") return { losses: 0, maxLosses: 0 };
    if (allyId === "cydney") return { recorded: 0 };
    if (allyId === "gabi") return { used: false };
    if (allyId === "ashley") return { used: false, allNaturalZero: true, replayPositive: false };
    return {};
  }

  function transition(category, state, completed) {
    const events = [];
    const base = category.payout;
    if (!allyId) events.push({ probability: 1, category, payout: base, bonus: 0, activation: false, state: { ...state }, metrics: {} });
    else if (allyId === "sterling") {
      events.push({ probability: 1, category, payout: base, bonus: 0, activation: base === 0, state: { losses: state.losses + (base === 0 ? 1 : 0), allNaturalZero: state.allNaturalZero && base === 0 }, metrics: {} });
    } else if (allyId === "ryan") {
      const selected = completed + 1 === selectedRyanSpin;
      const payout = selected ? Math.floor(base * parameters.multiplier) : base;
      events.push({ probability: 1, category, payout, bonus: payout - base, activation: selected, state: { ...state }, metrics: selected ? { selectedBasePayout: base, selectedSpinHit: base > 0 ? 1 : 0 } : {} });
    } else if (allyId === "cooper") {
      if (base > 0) {
        const multiplier = parameters.ladder[Math.min(state.losses, parameters.ladder.length - 1)];
        const payout = Math.floor(base * multiplier);
        const metrics = {};
        if (multiplier > 1) metrics[`rageWin${multiplier}`] = 1;
        events.push({ probability: 1, category, payout, bonus: payout - base, activation: multiplier > 1, state: { losses: 0, maxLosses: state.maxLosses }, metrics });
      } else {
        const losses = Math.min(parameters.ladder.length - 1, state.losses + 1);
        events.push({ probability: 1, category, payout: 0, bonus: 0, activation: false, state: { losses, maxLosses: Math.max(state.maxLosses, losses) }, metrics: {} });
      }
    } else if (allyId === "cydney") {
      const recorded = state.recorded || (base > 0 ? base : 0);
      events.push({ probability: 1, category, payout: base, bonus: 0, activation: !state.recorded && base > 0, state: { recorded }, metrics: {} });
    } else if (allyId === "gabi" && !state.used && base > 0 && base < Math.floor(parameters.threshold * wager)) {
      for (const replacement of replacementPool) {
        const useReplacement = replacement.payout > base;
        const selected = useReplacement ? replacement : category;
        events.push({
          probability: replacement.probability, category: selected, payout: selected.payout, bonus: Math.max(0, selected.payout - base), activation: true,
          state: { used: true }, metrics: {
            originalTinyWin: base, replayPayout: replacement.payout,
            replayImproved: useReplacement ? 1 : 0, replayTie: replacement.payout === base ? 1 : 0,
          },
        });
      }
    } else if (allyId === "gabi") {
      events.push({ probability: 1, category, payout: base, bonus: 0, activation: false, state: { ...state }, metrics: {} });
    } else if (allyId === "kenly") {
      const qualifies = category.tier === "small" && base > 0;
      const bonus = qualifies ? Math.floor(base * parameters.bonus) : 0;
      events.push({ probability: 1, category, payout: base + bonus, bonus, activation: qualifies && bonus > 0, state: { ...state }, metrics: qualifies ? { qualifyingSmallWins: 1 } : {} });
    } else if (allyId === "ashley" && !state.used && base === 0) {
      for (const replacement of categories) {
        events.push({
          probability: replacement.probability, category: replacement, payout: replacement.payout, bonus: replacement.payout, activation: true,
          state: { used: true, allNaturalZero: state.allNaturalZero, replayPositive: replacement.payout > 0 },
          metrics: { replayWin: replacement.payout > 0 ? 1 : 0, replayRetrigger: replacement.trigger ? 1 : 0 },
        });
      }
    } else if (allyId === "ashley") {
      events.push({
        probability: 1, category, payout: base, bonus: 0, activation: false,
        state: { ...state, allNaturalZero: state.allNaturalZero && base === 0 }, metrics: {},
      });
    }
    return events;
  }

  function solve(remaining, total, completed, allyState) {
    if (remaining <= 0) {
      const result = terminal(total, allyState);
      if (allyId === "ashley") result.metrics.rescuedZeroPay = allyState.allNaturalZero && allyState.replayPositive ? 1 : 0;
      return result;
    }
    const key = stateKey(remaining, total, completed, allyState);
    if (memo.has(key)) return memo.get(key);
    const result = accumulatorResult();
    for (const category of categories) {
      for (const event of transition(category, allyState, completed)) {
        const award = event.category.trigger ? Math.min(CONFIG.freeSpins.retriggerAward, CONFIG.freeSpins.maximumAwardedSpins - total) : 0;
        event.award = award;
        const sub = solve(remaining - 1 + award, total + award, completed + 1, event.state);
        addBranch(result, category.probability * event.probability, event, sub);
      }
    }
    memo.set(key, result);
    return result;
  }

  return solve(CONFIG.freeSpins.startingAward, CONFIG.freeSpins.startingAward, 0, initialAllyState());
}

function averageRyan(categories, parameters) {
  const reports = [1, 2, 3, 4].map(selected => solveFeature(categories, "ryan", parameters, selected));
  const averaged = accumulatorResult(); averaged.max = Math.max(...reports.map(r => r.max)); averaged.maxBonus = Math.max(...reports.map(r => r.maxBonus));
  const fields = ["mean", "second", "zero", "bonusMean", "activation", "value", "spins", "retriggers", "anyRetrigger", "cap"];
  for (const field of fields) averaged[field] = reports.reduce((sum, r) => sum + r[field], 0) / reports.length;
  const keys = new Set(reports.flatMap(r => Object.keys(r.metrics)));
  for (const key of keys) averaged.metrics[key] = reports.reduce((sum, r) => sum + metric(r, key), 0) / reports.length;
  return averaged;
}

function solveAllies(categories, parameterSet) {
  return Object.fromEntries(CONFIG.allyOrder.map(id => [id, id === "ryan"
    ? averageRyan(categories, parameterSet[id])
    : solveFeature(categories, id, parameterSet[id])
  ]));
}

function summarize(acc) {
  const baseLineRtp = acc.baseLinePaid / acc.totalWagered;
  const wildRtp = (acc.resolvedLinePaid - acc.baseLinePaid) / acc.totalWagered;
  const combinationRtp = acc.combinationPaid / acc.totalWagered;
  const naturalRtp = acc.naturalPaid / acc.totalWagered;
  const fortuneFrequency = solveFortuneStationary(acc);
  const fortuneRtp = fortuneFrequency * (acc.fortuneBonusPaidIfActive / acc.outcomes) / wager;
  const beforeFree = naturalRtp + fortuneRtp;
  const triggerFrequency = acc.triggerOutcomes / acc.outcomes;
  const baseFeature = solveFeature(acc.categories);
  const baselineTotal = beforeFree + triggerFrequency * baseFeature.mean / wager;
  const final = solveAllies(acc.categories, FINAL_PARAMETERS);
  const initial = solveAllies(acc.categories, INITIAL_PARAMETERS);

  function allyReport(id, result) {
    const incremental = triggerFrequency * (result.mean - baseFeature.mean) / wager;
    const variance = Math.max(0, result.second - result.mean * result.mean);
    const definition = CONFIG.allies[id];
    const common = {
      id, name: definition.name, abilityName: definition.abilityName,
      incrementalRtp: incremental, totalRtp: baselineTotal + incremental,
      averageFeaturePayout: result.mean, featureZeroPayFrequency: result.zero,
      activationProbability: result.activation, averageAllyBonus: result.bonusMean,
      maximumFeaturePayout: result.max, maximumTriggerPlusFeaturePayout: acc.maximumTriggerPaidPayout + result.max,
      standardDeviation: Math.sqrt(variance), averageFreeSpinsPerFeature: result.spins,
      retriggerFrequency: result.anyRetrigger, capFrequency: result.cap,
      zeroValueProbability: id === "cydney" ? 1 - result.activation : 1 - result.value, maximumAllyBonus: result.maxBonus,
    };
    if (id === "sterling") Object.assign(common, {
      averageInsurancePot: metric(result, "insurancePot"), insuranceCapFrequency: metric(result, "insuranceCapReached"),
      averageInsuredLosses: metric(result, "insuredLosses"), zeroPayRescueFrequency: metric(result, "rescuedZeroPay"),
    });
    if (id === "ryan") Object.assign(common, {
      bigWinSpinHitRate: metric(result, "selectedSpinHit"), averageMultipliedBasePayout: metric(result, "selectedBasePayout"),
      zeroValueActivationRate: 1 - result.value,
    });
    if (id === "cooper") Object.assign(common, {
      averageMaximumRage: metric(result, "maximumRage"), unusedRageFrequency: metric(result, "unusedRage"),
      rageWinFrequency13: metric(result, "rageWin1.3"), rageWinFrequency16: metric(result, "rageWin1.6"), rageWinFrequency2: metric(result, "rageWin2"),
      averageRageBonus: result.bonusMean,
    });
    if (id === "cydney") Object.assign(common, {
      qualifyingFirstWinFrequency: result.activation, averageRecordedAmount: metric(result, "recordedAmount"),
      averageEchoBonus: metric(result, "echoBonus"), noEchoFrequency: 1 - result.activation,
    });
    if (id === "gabi") Object.assign(common, {
      averageOriginalWeakWin: metric(result, "originalTinyWin"), averageReplayPayout: metric(result, "replayPayout"),
      replayImprovementFrequency: metric(result, "replayImproved"), replayTieFrequency: metric(result, "replayTie"),
      averageNetImprovement: result.bonusMean,
    });
    if (id === "kenly") Object.assign(common, {
      averageQualifyingSmallWins: metric(result, "qualifyingSmallWins"), averageLemonadeBonus: result.bonusMean,
      noLemonadeFrequency: 1 - result.value, averageBonusPerQualifyingSpin: result.bonusMean / Math.max(metric(result, "qualifyingSmallWins"), Number.EPSILON),
    });
    if (id === "ashley") Object.assign(common, {
      fastballActivationFrequency: result.activation,
      replayWinFrequency: metric(result, "replayWin") / Math.max(result.activation, Number.EPSILON),
      replayRetriggerFrequency: metric(result, "replayRetrigger") / Math.max(result.activation, Number.EPSILON),
      zeroPayRescueFrequency: metric(result, "rescuedZeroPay"), averageFastballImprovement: result.bonusMean,
    });
    return common;
  }

  const allies = CONFIG.allyOrder.map(id => allyReport(id, final[id]));
  const initialResults = CONFIG.allyOrder.map(id => {
    const incremental = triggerFrequency * (initial[id].mean - baseFeature.mean) / wager;
    return { id, incrementalRtp: incremental, totalRtp: baselineTotal + incremental, averageAllyBonus: initial[id].bonusMean };
  });
  const totals = allies.map(item => item.totalRtp);
  const mysteryTokenFrequency = Object.fromEntries(["0", "1", "2", "3", "4+"].map(key => [
    key,
    (acc.mysteryTokenCounts.get(key) || 0) / acc.outcomes,
  ]));
  return {
    mode: "exact-production-transition",
    exactOutcomes: acc.outcomes,
    wager,
    baseline: {
      baseLineRtp, wildRtp, combinationRtp, fortuneRtp, rtpBeforeFreeSpins: beforeFree,
      freeSpinIncrement: triggerFrequency * baseFeature.mean / wager, totalRtp: baselineTotal,
      triggerFrequency, averageFeaturePayout: baseFeature.mean, zeroPayFeatureFrequency: baseFeature.zero,
      maximumFeaturePayout: baseFeature.max, maximumTriggerPlusFeaturePayout: acc.maximumTriggerPaidPayout + baseFeature.max,
      averageFreeSpinsPerFeature: baseFeature.spins, retriggerFrequency: baseFeature.anyRetrigger, capFrequency: baseFeature.cap,
    },
    initialUntuned: initialResults,
    allies,
    mysteryExact: {
      tokenFrequency: mysteryTokenFrequency,
      averageFreeSpinsRequestedPerPaidSpin: acc.mysteryFreeSpinsRequested / acc.outcomes,
      modifierAwardFrequencyPerPaidSpin: acc.mysteryModifierAwards / acc.outcomes,
      maximumBaseSpinPayout: acc.maximumBaseSpinPayout,
    },
    paritySpread: Math.max(...totals) - Math.min(...totals),
    lowestAllyTotalRtp: Math.min(...totals),
    highestAllyTotalRtp: Math.max(...totals),
    medianSupported: false,
    medianNote: "The exact solver reports mean, zero-pay probability, variance, and maxima. Median is intentionally omitted because retaining full payout distributions across replay state would materially increase solver memory without affecting balancing decisions.",
  };
}

function printReport(report) {
  console.log("\nChoose Your Ally exact production simulator");
  console.log("=".repeat(90));
  console.log(`Exact weighted outcomes: ${report.exactOutcomes.toLocaleString()}`);
  console.log(`Current main baseline RTP: ${percentage(report.baseline.totalRtp)}`);
  console.log(`Baseline feature payout: ${report.baseline.averageFeaturePayout.toFixed(6)} coins`);
  console.log(`Baseline zero-pay features: ${percentage(report.baseline.zeroPayFeatureFrequency)}`);
  console.log("\nInitial untuned values:");
  for (const row of report.initialUntuned) console.log(`  ${row.id.padEnd(9)} +${percentage(row.incrementalRtp).padStart(9)} -> ${percentage(row.totalRtp)}`);
  console.log("\nFinal tuned values:");
  for (const row of report.allies) {
    console.log(`  ${row.name.padEnd(9)} ${row.abilityName.padEnd(15)} +${percentage(row.incrementalRtp).padStart(9)} -> ${percentage(row.totalRtp)} | avg ${row.averageFeaturePayout.toFixed(4)} | zero ${percentage(row.featureZeroPayFrequency)} | SD ${row.standardDeviation.toFixed(4)}`);
  }
  console.log(`\nParity spread: ${percentage(report.paritySpread)}`);
  console.log(`Range: ${percentage(report.lowestAllyTotalRtp)} to ${percentage(report.highestAllyTotalRtp)}`);
  console.log(report.medianNote);
  console.log("\nMystery Token exact visible-grid frequencies:");
  for (const key of ["0", "1", "2", "3", "4+"]) {
    console.log(`  ${key.padStart(2)} token${key === "1" ? " " : "s"}  ${percentage(report.mysteryExact.tokenFrequency[key])}`);
  }
  console.log(`  Free Spins requested per paid spin: ${report.mysteryExact.averageFreeSpinsRequestedPerPaidSpin.toFixed(6)}`);
  console.log(`  Modifier award frequency: ${percentage(report.mysteryExact.modifierAwardFrequencyPerPaidSpin)}`);
  if (report.mystery) {
    const mystery = report.mystery;
    console.log(`\nSeeded Mystery chain simulation (${mystery.sessions.toLocaleString()} paid-spin cycles, seed 0x${mystery.seed.toString(16)}):`);
    console.log(`  Baseline without Mystery rewards: ${percentage(mystery.baselineRtp)}`);
    console.log(`  Mystery Token/free/Fortune increment: +${percentage(mystery.incrementalRtpFromMysteryTokens)}`);
    console.log(`  Mystery Modifier increment: +${percentage(mystery.incrementalRtpFromModifiers)}`);
    console.log(`  New total RTP: ${percentage(mystery.totalRtp)}`);
    console.log(`  Mystery Free Spins awarded per paid spin: ${mystery.averageMysteryFreeSpinsAwardedPerPaidSpin.toFixed(6)}`);
    console.log(`  Mystery Free Spins played per paid spin: ${mystery.averageMysteryFreeSpinsPerPaidSpin.toFixed(6)}`);
    console.log(`  Chain start / conditional length / maximum: ${percentage(mystery.mysteryChainStartFrequency)} / ${mystery.averageConditionalChainLength.toFixed(4)} / ${mystery.maximumChainLength}`);
    console.log(`  Fortune charge consumption: ${percentage(mystery.fortuneChargeFrequency)}`);
    console.log(`  Ally triggers, paid / Mystery: ${percentage(mystery.paidAllyTriggerFrequency)} / ${percentage(mystery.mysteryAllyTriggerFrequency)}`);
    console.log(`  Maximum coherent spin / paid cycle: ${mystery.maximumSingleSpinPayout.toLocaleString()} / ${mystery.maximumPaidCyclePayout.toLocaleString()} coins`);
    console.log("  Modifier awards per paid spin:");
    for (const id of CONFIG.mystery.normalModifierPool) console.log(`    ${id.padEnd(16)} ${mystery.modifierAwardsPerPaidSpin[id].toFixed(6)}`);
  }
}

function checkReport(report) {
  const failures = [];
  if (Math.abs(report.baseline.triggerFrequency - 1 / 64) > probabilityTolerance) failures.push(`Trigger frequency changed: ${percentage(report.baseline.triggerFrequency)}`);
  const scatterTotal = Object.values(report.mysteryExact.tokenFrequency).reduce((sum, probability) => sum + probability, 0);
  if (Math.abs(scatterTotal - 1) > probabilityTolerance) failures.push(`Mystery Token probabilities do not sum to one: ${scatterTotal}`);
  if (report.mysteryExact.tokenFrequency["2"] < 0.05) failures.push(`Two-token results are too rare: ${percentage(report.mysteryExact.tokenFrequency["2"])}`);
  if (report.mysteryExact.tokenFrequency["3"] <= 0 || report.mysteryExact.tokenFrequency["3"] >= 0.15) failures.push(`Three-token frequency is outside the intended occasional range: ${percentage(report.mysteryExact.tokenFrequency["3"])}`);
  if (report.mysteryExact.tokenFrequency["4+"] <= 0 || report.mysteryExact.tokenFrequency["4+"] >= 0.05) failures.push(`Four-plus-token results must remain rare but possible: ${percentage(report.mysteryExact.tokenFrequency["4+"])}`);
  for (const ally of report.allies) {
    if (ally.averageFreeSpinsPerFeature < 4 || ally.averageFreeSpinsPerFeature > 20) failures.push(`${ally.name} feature length invalid.`);
    if (ally.featureZeroPayFrequency < 0 || ally.featureZeroPayFrequency > 1) failures.push(`${ally.name} zero-pay frequency invalid.`);
  }
  if (!report.mystery || !Number.isFinite(report.mystery.totalRtp)) failures.push("Seeded Mystery chain report is missing or invalid.");
  else {
    if (report.mystery.totalRtp <= report.mystery.baselineRtp) failures.push(`Mystery system did not add return: ${percentage(report.mystery.totalRtp)}`);
    if (Math.abs(report.mystery.totalMysteryIncrementalRtp
      - report.mystery.incrementalRtpFromMysteryTokens
      - report.mystery.incrementalRtpFromModifiers) > probabilityTolerance) failures.push("Mystery RTP components do not reconcile.");
    if (report.mystery.maximumQueuedFreeSpins > CONFIG.mystery.maximumQueuedFreeSpins) failures.push("Mystery Free Spin queue exceeded its configured cap.");
    if (report.mystery.paidAllyTriggerFrequency <= 0 || report.mystery.mysteryAllyTriggerFrequency <= 0) failures.push("Both paid and Mystery Free Spins must be able to trigger Ally Free Spins.");
  }
  if (failures.length) {
    failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`));
    process.exitCode = 1;
  } else console.log("\nExact token frequencies, deterministic chains, queue cap, trigger, and probability checks: PASS");
}

function seededRandom(seed = 0x5f3759df) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 0x100000000; };
}
function sampleCategory(categories, rng) {
  let roll = rng();
  for (const category of categories) { roll -= category.probability; if (roll <= 0) return category; }
  return categories.at(-1);
}

function simulateMysteryMode({ sessions, modifiersEnabled, seed = 0x4d595354 }) {
  const rng = seededRandom(seed);
  const simState = {
    coins: 1_000_000,
    lineBetIndex: 0,
    fortuneMeter: { value: 0, charged: false },
    freeSpinSession: null,
    pendingSpin: null,
    mystery: app.mystery.createState(),
  };
  const modifierAwards = Object.fromEntries(CONFIG.mystery.normalModifierPool.map(id => [id, 0]));
  const modifierApplications = Object.fromEntries(CONFIG.mystery.normalModifierPool.map(id => [id, 0]));
  const tokenCounts = { "0": 0, "1": 0, "2": 0, "3": 0, "4+": 0 };
  let spinSequence = 0;
  let totalPayout = 0;
  let paidSpins = 0;
  let mysteryFreeSpins = 0;
  let allyFreeSpins = 0;
  let awardedMysteryFreeSpins = 0;
  let paidAllyTriggers = 0;
  let mysteryAllyTriggers = 0;
  let fortuneChargesConsumed = 0;
  let eligibleFortuneSpins = 0;
  let modifierDirectPayout = 0;
  let rootsWithMysteryChain = 0;
  let totalConditionalChainLength = 0;
  let maximumChainLength = 0;
  let maximumSingleSpinPayout = 0;
  let maximumPaidCyclePayout = 0;
  let maximumQueuedFreeSpins = 0;
  let queueCapHits = 0;
  let strongFallbackAwards = 0;

  function configureAllyFeature() {
    const session = simState.freeSpinSession;
    if (!session?.active || session.status !== app.freeSpins.FREE_SPIN_STATUSES.INTRO) return;
    const ally = app.allies.createAllyState();
    ally.confirmed = true;
    ally.featureStarted = true;
    ally.legacyNoAlly = true;
    session.ally = ally;
    session.status = app.freeSpins.FREE_SPIN_STATUSES.READY;
  }

  function runSpin(spinType) {
    const session = simState.freeSpinSession;
    const spinState = spinType === "free"
      ? app.freeSpins.getLockedSpinState(session, simState)
      : simState;
    const referenceBet = spinType === "free" ? session.referenceBet : wager;
    const totalAwardedSpins = spinType === "free" ? session.totalAwardedSpins : 0;
    const activeModifiers = modifiersEnabled ? app.mystery.peekModifierQueue(simState) : [];
    for (const modifier of activeModifiers) modifierApplications[modifier.id] += 1;
    const targetStops = CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
    const result = payouts.createSpinResult({
      targetStops,
      state: spinState,
      id: `mystery-mc-${modifiersEnabled ? "full" : "tokens"}-${spinSequence += 1}`,
      createdAt: "seeded-mystery-simulation",
      spinType,
      referenceBet,
      totalAwardedSpins,
      mysteryModifiers: activeModifiers,
      allyBypass: true,
      rng,
    });

    const baselineSource = result.mysteryRescue?.originalResult || result;
    const withoutModifiers = payouts.createSpinResult({
      targetStops: baselineSource.targetStops,
      state: spinState,
      id: `${result.id}-direct-baseline`,
      createdAt: "seeded-mystery-simulation",
      spinType,
      referenceBet,
      totalAwardedSpins,
      featureRolls: baselineSource.featureRolls,
      mysteryModifiers: [],
      mysterySkipRescue: true,
      allyBypass: true,
      rng: () => 0.5,
    });
    modifierDirectPayout += result.totalWin - withoutModifiers.totalWin;

    if (!app.mystery.commitSpinStart(simState, result)) throw new Error(`Unable to commit simulated ${spinType} spin.`);
    if (["paid", "mystery-free"].includes(spinType)) {
      eligibleFortuneSpins += 1;
      if (result.fortuneSpin.consumedCharge) fortuneChargesConsumed += 1;
    }
    payouts.consumeFortuneChargeState(simState, result);
    simState.coins -= result.coinCost;
    simState.pendingSpin = result;
    const settled = payouts.settlePendingSpinState(simState);
    if (!settled) throw new Error(`Unable to settle simulated ${spinType} spin.`);
    totalPayout += settled.totalWin;
    maximumSingleSpinPayout = Math.max(maximumSingleSpinPayout, settled.totalWin);
    const tokenKey = settled.mysteryTokenCount >= 4 ? "4+" : String(settled.mysteryTokenCount);
    tokenCounts[tokenKey] += 1;
    const mysterySettlement = settled.mysterySettlement;
    awardedMysteryFreeSpins += mysterySettlement.freeSpinsAwarded;
    if (mysterySettlement.capped) queueCapHits += 1;
    if (mysterySettlement.strongFallback) strongFallbackAwards += 1;
    if (mysterySettlement.modifier) modifierAwards[mysterySettlement.modifier.id] += 1;
    maximumQueuedFreeSpins = Math.max(maximumQueuedFreeSpins, simState.mystery.queuedFreeSpins);
    if (!modifiersEnabled) simState.mystery.modifierQueue = [];

    if (spinType === "paid") {
      paidSpins += 1;
      if (settled.freeSpinTrigger.triggered) paidAllyTriggers += 1;
    } else if (spinType === "mystery-free") {
      mysteryFreeSpins += 1;
      if (settled.freeSpinTrigger.triggered) mysteryAllyTriggers += 1;
    } else allyFreeSpins += 1;
    configureAllyFeature();
    return settled;
  }

  for (let root = 0; root < sessions; root += 1) {
    const payoutBeforeRoot = totalPayout;
    let mysterySpinsThisRoot = 0;
    runSpin("paid");
    let guard = 0;
    while ((simState.freeSpinSession?.active || simState.mystery.queuedFreeSpins > 0) && guard < 1000) {
      guard += 1;
      const session = simState.freeSpinSession;
      if (session?.active) {
        configureAllyFeature();
        if (session.status === app.freeSpins.FREE_SPIN_STATUSES.PRESENTING) {
          simState.freeSpinSession = app.freeSpins.markFreeSpinPresented(session, session.presentationSpin?.id);
          continue;
        }
        if (session.status === app.freeSpins.FREE_SPIN_STATUSES.COMPLETE || session.remainingSpins <= 0) {
          simState.freeSpinSession = null;
          continue;
        }
        if (session.status === app.freeSpins.FREE_SPIN_STATUSES.READY) {
          runSpin("free");
          continue;
        }
        throw new Error(`Unexpected simulated Ally status: ${session.status}`);
      }
      runSpin("mystery-free");
      mysterySpinsThisRoot += 1;
    }
    if (guard >= 1000) throw new Error("Mystery simulation exceeded its deterministic chain guard.");
    if (mysterySpinsThisRoot > 0) {
      rootsWithMysteryChain += 1;
      totalConditionalChainLength += mysterySpinsThisRoot;
      maximumChainLength = Math.max(maximumChainLength, mysterySpinsThisRoot);
    }
    maximumPaidCyclePayout = Math.max(maximumPaidCyclePayout, totalPayout - payoutBeforeRoot);
  }

  const totalSpins = paidSpins + mysteryFreeSpins + allyFreeSpins;
  const totalWagered = paidSpins * wager;
  return {
    sessions,
    seed,
    totalPayout,
    totalWagered,
    totalRtp: totalPayout / totalWagered,
    paidSpins,
    mysteryFreeSpins,
    allyFreeSpins,
    averageMysteryFreeSpinsAwardedPerPaidSpin: awardedMysteryFreeSpins / paidSpins,
    averageMysteryFreeSpinsPerPaidSpin: mysteryFreeSpins / paidSpins,
    mysteryChainStartFrequency: rootsWithMysteryChain / paidSpins,
    averageConditionalChainLength: totalConditionalChainLength / Math.max(1, rootsWithMysteryChain),
    maximumChainLength,
    modifierAwardsPerPaidSpin: Object.fromEntries(Object.entries(modifierAwards).map(([id, count]) => [id, count / paidSpins])),
    modifierApplicationsPerSpin: Object.fromEntries(Object.entries(modifierApplications).map(([id, count]) => [id, count / totalSpins])),
    tokenFrequencyAllSpins: Object.fromEntries(Object.entries(tokenCounts).map(([key, count]) => [key, count / totalSpins])),
    fortuneChargeFrequency: fortuneChargesConsumed / Math.max(1, eligibleFortuneSpins),
    paidAllyTriggerFrequency: paidAllyTriggers / paidSpins,
    mysteryAllyTriggerFrequency: mysteryAllyTriggers / Math.max(1, mysteryFreeSpins),
    maximumSingleSpinPayout,
    maximumPaidCyclePayout,
    maximumQueuedFreeSpins,
    queueCapHitFrequency: queueCapHits / totalSpins,
    strongFallbackAwardsPerPaidSpin: strongFallbackAwards / paidSpins,
    directModifierPayoutRtp: modifierDirectPayout / totalWagered,
  };
}

function simulateMysteryChains(report, sessions) {
  const full = simulateMysteryMode({ sessions, modifiersEnabled: true });
  const tokensOnly = simulateMysteryMode({ sessions, modifiersEnabled: false });
  const baselineRtp = report.baseline.totalRtp;
  return {
    mode: "seeded-production-chain-monte-carlo",
    ...full,
    baselineRtp,
    tokensOnlyRtp: tokensOnly.totalRtp,
    incrementalRtpFromMysteryTokens: tokensOnly.totalRtp - baselineRtp,
    incrementalRtpFromModifiers: full.totalRtp - tokensOnly.totalRtp,
    totalMysteryIncrementalRtp: full.totalRtp - baselineRtp,
    tokensOnlyDiagnostics: {
      mysteryFreeSpins: tokensOnly.mysteryFreeSpins,
      fortuneChargeFrequency: tokensOnly.fortuneChargeFrequency,
      maximumPaidCyclePayout: tokensOnly.maximumPaidCyclePayout,
    },
  };
}

function monteCarlo(report, categories, sessions = 200000) {
  const rng = seededRandom();
  console.log(`\nSeeded Monte Carlo verification (${sessions.toLocaleString()} features per ally)`);
  console.log("-".repeat(90));
  for (const ally of report.allies) {
    let total = 0;
    for (let run = 0; run < sessions; run += 1) {
      let remaining = 4; let awarded = 4; let completed = 0; let payout = 0;
      let sterlingLosses = 0; let cooperLosses = 0; let record = 0; let used = false; const selectedRyan = Math.floor(rng() * 4) + 1;
      while (remaining > 0) {
        let category = sampleCategory(categories, rng); let spin = category.payout; let bonus = 0;
        if (ally.id === "sterling" && spin === 0) sterlingLosses += 1;
        else if (ally.id === "ryan" && completed + 1 === selectedRyan) { const final = Math.floor(spin * FINAL_PARAMETERS.ryan.multiplier); bonus = final - spin; spin = final; }
        else if (ally.id === "cooper") { if (spin > 0) { const final = Math.floor(spin * FINAL_PARAMETERS.cooper.ladder[Math.min(cooperLosses, 3)]); bonus = final - spin; spin = final; cooperLosses = 0; } else cooperLosses = Math.min(3, cooperLosses + 1); }
        else if (ally.id === "cydney" && !record && spin > 0) record = spin;
        else if (ally.id === "gabi" && !used && spin > 0 && spin < Math.floor(FINAL_PARAMETERS.gabi.threshold * wager)) { let replacement; do replacement = sampleCategory(categories, rng); while (replacement.payout <= 0); used = true; if (replacement.payout > spin) { bonus = replacement.payout - spin; spin = replacement.payout; category = replacement; } }
        else if (ally.id === "kenly" && category.tier === "small" && spin > 0) { bonus = Math.floor(spin * FINAL_PARAMETERS.kenly.bonus); spin += bonus; }
        else if (ally.id === "ashley" && !used && spin === 0) { category = sampleCategory(categories, rng); spin = category.payout; bonus = spin; used = true; }
        payout += spin; remaining -= 1; completed += 1;
        if (category.trigger) { const award = Math.min(2, 20 - awarded); remaining += award; awarded += award; }
      }
      if (ally.id === "sterling") payout += Math.min(Math.floor(FINAL_PARAMETERS.sterling.cap * wager), Math.floor(sterlingLosses * FINAL_PARAMETERS.sterling.perLoss * wager));
      if (ally.id === "cydney") payout += Math.floor(record * FINAL_PARAMETERS.cydney.echo);
      total += payout;
    }
    const mean = total / sessions;
    console.log(`  ${ally.name.padEnd(9)} exact ${ally.averageFeaturePayout.toFixed(4)} | Monte Carlo ${mean.toFixed(4)} | delta ${(mean - ally.averageFeaturePayout).toFixed(4)}`);
  }
}

validateConfig();
const accumulator = enumerateExactOutcomes();
const report = summarize(accumulator);
report.mystery = simulateMysteryChains(report, Number(args.get("mystery-sessions") || 50000));
if (outputJson) console.log(JSON.stringify(report, null, 2)); else printReport(report);
if (checkTarget) checkReport(report);
if (runMonteCarlo) monteCarlo(report, accumulator.categories, Number(args.get("sessions") || 200000));
