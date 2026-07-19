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
const seed = Number(args.get("seed") || 0x4d595354) >>> 0;
const outputJson = args.has("json");
const check = args.has("check");
const wager = payouts.getTotalBet({ lineBetIndex: 0 });
const originalRewards = { ...CONFIG.mystery.rewards };
const modifierIds = [...CONFIG.mystery.normalModifierPool];
const ALLY_IDS = [...CONFIG.allyOrder];

function seededRandom(initial) {
  let value = initial >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function tokenKey(count) {
  return count >= 4 ? "4+" : String(count);
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

function configureRewards(mode) {
  CONFIG.mystery.rewards.twoTokenFortune = mode.fortune ? originalRewards.twoTokenFortune : 0;
  CONFIG.mystery.rewards.threeTokenFreeSpins = mode.tickets ? originalRewards.threeTokenFreeSpins : 0;
  CONFIG.mystery.rewards.fourPlusFreeSpins = mode.tickets ? originalRewards.fourPlusFreeSpins : 0;
}

function restoreRewards() {
  Object.assign(CONFIG.mystery.rewards, originalRewards);
}

function createMetrics(mode, runCycles, runSeed) {
  return {
    id: mode.id,
    label: mode.label,
    description: mode.description,
    cycles: runCycles,
    seed: runSeed,
    allyId: mode.allyId || null,
    totalPayout: 0,
    totalWagered: runCycles * wager,
    paidSpins: 0,
    mysteryFreeSpins: 0,
    allyFreeSpins: 0,
    totalSpins: 0,
    tokens: { "0": 0, "1": 0, "2": 0, "3": 0, "4+": 0 },
    paidTokens: { "0": 0, "1": 0, "2": 0, "3": 0, "4+": 0 },
    tokenTotal: 0,
    paidTokenTotal: 0,
    modifierAwards: Object.fromEntries(modifierIds.map(id => [id, 0])),
    modifierApplications: Object.fromEntries(modifierIds.map(id => [id, 0])),
    spinsWithAnyQueuedModifier: 0,
    spinsWithMultipleQueuedModifiers: 0,
    mysteryFreeSpinsAwarded: 0,
    mysteryChainStarts: 0,
    mysteryChainSpins: 0,
    maximumMysteryChainLength: 0,
    paidAllyTriggers: 0,
    mysteryAllyTriggers: 0,
    paidTriggeredAllyFreeSpins: 0,
    mysteryTriggeredAllyFreeSpins: 0,
    allySpinsWithMysteryTokens: 0,
    allyMysteryTokenTotal: 0,
    fortuneEligibleSpins: 0,
    fortuneChargesConsumed: 0,
    maximumSingleSpinPayout: 0,
    maximumPaidCyclePayout: 0,
    maximumQueuedFreeSpins: 0,
    queueCapHits: 0,
    guardTrips: 0,
    topChains: [],
  };
}

function insertTopChain(topChains, entry) {
  topChains.push(entry);
  topChains.sort((a, b) => b.payout - a.payout || b.totalFeatureSpins - a.totalFeatureSpins || b.mysteryFreeSpins - a.mysteryFreeSpins);
  if (topChains.length > 10) topChains.length = 10;
}

function simulateMode(mode, runCycles, runSeed, { collectTopChains = true } = {}) {
  configureRewards(mode);
  const rng = seededRandom(runSeed);
  const state = makeState();
  const metrics = createMetrics(mode, runCycles, runSeed);
  const featureFlags = { ...CONFIG.features, scatters: true, mysteryModifiers: mode.modifiers };
  let sequence = 0;

  function configureFeature() {
    const session = state.freeSpinSession;
    if (!session?.active || session.status !== app.freeSpins.FREE_SPIN_STATUSES.INTRO) return;
    if (!mode.allyId) {
      const ally = app.allies.createAllyState();
      ally.confirmed = true;
      ally.featureStarted = true;
      ally.legacyNoAlly = true;
      session.ally = ally;
      session.status = app.freeSpins.FREE_SPIN_STATUSES.READY;
      return;
    }
    let next = app.allies.setPendingSelection(session, mode.allyId);
    next = app.allies.confirmSelection(next, mode.allyId, rng);
    next = app.allies.beginFeature(next);
    next.status = app.freeSpins.FREE_SPIN_STATUSES.READY;
    state.freeSpinSession = next;
  }

  function runSpin(spinType, cycleStats) {
    const session = state.freeSpinSession;
    const spinState = spinType === "free" ? app.freeSpins.getLockedSpinState(session, state) : state;
    const referenceBet = spinType === "free" ? session.referenceBet : wager;
    const totalAwardedSpins = spinType === "free" ? session.totalAwardedSpins : 0;
    const activeModifiers = mode.modifiers ? app.mystery.peekModifierQueue(state) : [];
    for (const modifier of activeModifiers) metrics.modifierApplications[modifier.id] += 1;
    const targetStops = CONFIG.reels.map(reel => Math.floor(rng() * reel.length));
    const result = payouts.createSpinResult({
      targetStops,
      state: spinState,
      id: `${mode.id}-${sequence += 1}`,
      createdAt: "seeded-mystery-audit",
      spinType,
      referenceBet,
      totalAwardedSpins,
      mysteryModifiers: activeModifiers,
      featureFlags,
      allyBypass: !mode.allyId,
      rng,
    });

    if (!app.mystery.commitSpinStart(state, result)) throw new Error(`Unable to commit ${spinType} spin in ${mode.id}.`);
    if (spinType !== "free") {
      metrics.fortuneEligibleSpins += 1;
      if (result.fortuneSpin?.consumedCharge) metrics.fortuneChargesConsumed += 1;
    }
    payouts.consumeFortuneChargeState(state, result);
    state.coins -= result.coinCost;
    state.lastWin = 0;
    state.pendingSpin = result;
    const settled = payouts.settlePendingSpinState(state);
    if (!settled) throw new Error(`Unable to settle ${spinType} spin in ${mode.id}.`);

    const endBonus = settled.allyEndBonus?.amount || 0;
    const paidAmount = settled.totalWin + endBonus;
    metrics.totalPayout += paidAmount;
    metrics.maximumSingleSpinPayout = Math.max(metrics.maximumSingleSpinPayout, paidAmount);
    cycleStats.payout += paidAmount;
    cycleStats.tokens += settled.mysteryTokenCount || 0;
    metrics.totalSpins += 1;
    metrics.tokenTotal += settled.mysteryTokenCount || 0;
    metrics.tokens[tokenKey(settled.mysteryTokenCount || 0)] += 1;

    if (spinType === "paid") {
      metrics.paidSpins += 1;
      metrics.paidTokenTotal += settled.mysteryTokenCount || 0;
      metrics.paidTokens[tokenKey(settled.mysteryTokenCount || 0)] += 1;
      if (settled.freeSpinTrigger?.triggered) metrics.paidAllyTriggers += 1;
    } else if (spinType === "mystery-free") {
      metrics.mysteryFreeSpins += 1;
      cycleStats.mysteryFreeSpins += 1;
      if (settled.freeSpinTrigger?.triggered) metrics.mysteryAllyTriggers += 1;
    } else {
      metrics.allyFreeSpins += 1;
      cycleStats.allyFreeSpins += 1;
      const origin = session?.triggerResult?.spinType;
      if (origin === "mystery-free") metrics.mysteryTriggeredAllyFreeSpins += 1;
      else metrics.paidTriggeredAllyFreeSpins += 1;
      if ((settled.mysteryTokenCount || 0) > 0) metrics.allySpinsWithMysteryTokens += 1;
      metrics.allyMysteryTokenTotal += settled.mysteryTokenCount || 0;
    }

    const mysterySettlement = settled.mysterySettlement || {};
    metrics.mysteryFreeSpinsAwarded += mysterySettlement.freeSpinsAwarded || 0;
    if (mysterySettlement.capped) metrics.queueCapHits += 1;
    if (mysterySettlement.modifier?.id) {
      metrics.modifierAwards[mysterySettlement.modifier.id] += 1;
      cycleStats.modifierAwards[mysterySettlement.modifier.id] = (cycleStats.modifierAwards[mysterySettlement.modifier.id] || 0) + 1;
    }
    const queued = app.mystery.normalizeState(state.mystery).modifierQueue;
    if (queued.length > 0) metrics.spinsWithAnyQueuedModifier += 1;
    if (queued.length > 1) metrics.spinsWithMultipleQueuedModifiers += 1;
    metrics.maximumQueuedFreeSpins = Math.max(metrics.maximumQueuedFreeSpins, state.mystery.queuedFreeSpins);
    configureFeature();
    return settled;
  }

  try {
    for (let root = 0; root < runCycles; root += 1) {
      const cycleStats = {
        root: root + 1,
        payout: 0,
        mysteryFreeSpins: 0,
        allyFreeSpins: 0,
        tokens: 0,
        modifierAwards: {},
      };
      runSpin("paid", cycleStats);
      let guard = 0;
      while ((state.freeSpinSession?.active || state.mystery.queuedFreeSpins > 0) && guard < 2000) {
        guard += 1;
        const session = state.freeSpinSession;
        if (session?.active) {
          configureFeature();
          const current = state.freeSpinSession;
          if (current.status === app.freeSpins.FREE_SPIN_STATUSES.PRESENTING) {
            state.freeSpinSession = app.freeSpins.markFreeSpinPresented(current, current.presentationSpin?.id);
            continue;
          }
          if (current.status === app.freeSpins.FREE_SPIN_STATUSES.COMPLETE || current.remainingSpins <= 0) {
            state.freeSpinSession = null;
            continue;
          }
          if (current.status === app.freeSpins.FREE_SPIN_STATUSES.READY) {
            runSpin("free", cycleStats);
            continue;
          }
          throw new Error(`Unexpected Ally status ${current.status} in ${mode.id}.`);
        }
        runSpin("mystery-free", cycleStats);
      }
      if (guard >= 2000) {
        metrics.guardTrips += 1;
        throw new Error(`Mystery chain guard exceeded in ${mode.id}.`);
      }
      if (cycleStats.mysteryFreeSpins > 0) {
        metrics.mysteryChainStarts += 1;
        metrics.mysteryChainSpins += cycleStats.mysteryFreeSpins;
        metrics.maximumMysteryChainLength = Math.max(metrics.maximumMysteryChainLength, cycleStats.mysteryFreeSpins);
      }
      metrics.maximumPaidCyclePayout = Math.max(metrics.maximumPaidCyclePayout, cycleStats.payout);
      if (collectTopChains) insertTopChain(metrics.topChains, {
        root: cycleStats.root,
        payout: cycleStats.payout,
        mysteryFreeSpins: cycleStats.mysteryFreeSpins,
        allyFreeSpins: cycleStats.allyFreeSpins,
        totalFeatureSpins: cycleStats.mysteryFreeSpins + cycleStats.allyFreeSpins,
        tokens: cycleStats.tokens,
        modifierAwards: cycleStats.modifierAwards,
      });
    }
  } finally {
    restoreRewards();
  }

  const allFrequency = Object.fromEntries(Object.entries(metrics.tokens).map(([key, count]) => [key, count / Math.max(1, metrics.totalSpins)]));
  const paidFrequency = Object.fromEntries(Object.entries(metrics.paidTokens).map(([key, count]) => [key, count / Math.max(1, metrics.paidSpins)]));
  return {
    id: metrics.id,
    label: metrics.label,
    description: metrics.description,
    cycles: runCycles,
    seed: runSeed,
    allyId: metrics.allyId,
    totalRtp: metrics.totalPayout / metrics.totalWagered,
    averagePaidCyclePayout: metrics.totalPayout / runCycles,
    averagePayoutPerSettledSpin: metrics.totalPayout / Math.max(1, metrics.totalSpins),
    paidSpins: metrics.paidSpins,
    mysteryFreeSpins: metrics.mysteryFreeSpins,
    allyFreeSpins: metrics.allyFreeSpins,
    totalSpins: metrics.totalSpins,
    tokenFrequencyPaidSpins: paidFrequency,
    tokenFrequencyAllSpins: allFrequency,
    twoPlusTokenFrequencyPaidSpins: paidFrequency["2"] + paidFrequency["3"] + paidFrequency["4+"],
    averageTokensPerPaidSpin: metrics.paidTokenTotal / Math.max(1, metrics.paidSpins),
    averageTokensPerSettledSpin: metrics.tokenTotal / Math.max(1, metrics.totalSpins),
    modifierAwardFrequencyPerPaidSpin: Object.values(metrics.modifierAwards).reduce((sum, value) => sum + value, 0) / Math.max(1, metrics.paidSpins),
    specificModifierAwardsPerPaidSpin: Object.fromEntries(Object.entries(metrics.modifierAwards).map(([id, count]) => [id, count / Math.max(1, metrics.paidSpins)])),
    specificModifierApplicationsPerSettledSpin: Object.fromEntries(Object.entries(metrics.modifierApplications).map(([id, count]) => [id, count / Math.max(1, metrics.totalSpins)])),
    queuedModifierFrequencyPerSettledSpin: metrics.spinsWithAnyQueuedModifier / Math.max(1, metrics.totalSpins),
    multipleQueuedModifierFrequencyPerSettledSpin: metrics.spinsWithMultipleQueuedModifiers / Math.max(1, metrics.totalSpins),
    averageMysteryFreeSpinsAwardedPerPaidSpin: metrics.mysteryFreeSpinsAwarded / Math.max(1, metrics.paidSpins),
    averageMysteryFreeSpinsPlayedPerPaidSpin: metrics.mysteryFreeSpins / Math.max(1, metrics.paidSpins),
    mysteryChainStartFrequency: metrics.mysteryChainStarts / Math.max(1, metrics.paidSpins),
    averageConditionalMysteryChainLength: metrics.mysteryChainSpins / Math.max(1, metrics.mysteryChainStarts),
    maximumMysteryChainLength: metrics.maximumMysteryChainLength,
    paidSpinAllyTriggerFrequency: metrics.paidAllyTriggers / Math.max(1, metrics.paidSpins),
    mysterySpinAllyTriggerFrequency: metrics.mysteryAllyTriggers / Math.max(1, metrics.mysteryFreeSpins),
    paidTriggeredAllyFreeSpins: metrics.paidTriggeredAllyFreeSpins,
    mysteryTriggeredAllyFreeSpins: metrics.mysteryTriggeredAllyFreeSpins,
    mysteryTokenFrequencyInsideAllyFreeSpins: metrics.allySpinsWithMysteryTokens / Math.max(1, metrics.allyFreeSpins),
    averageMysteryTokensInsideAllyFreeSpins: metrics.allyMysteryTokenTotal / Math.max(1, metrics.allyFreeSpins),
    fortuneChargeConsumptionFrequency: metrics.fortuneChargesConsumed / Math.max(1, metrics.fortuneEligibleSpins),
    maximumSingleSpinPayout: metrics.maximumSingleSpinPayout,
    maximumPaidCyclePayout: metrics.maximumPaidCyclePayout,
    maximumQueuedFreeSpins: metrics.maximumQueuedFreeSpins,
    queueCapHitFrequencyPerSettledSpin: metrics.queueCapHits / Math.max(1, metrics.totalSpins),
    topChains: metrics.topChains,
  };
}

const modes = [
  { id: "A", label: "Pre-award baseline", description: "Current reel strips and ordinary game features with Mystery Token awards disabled.", fortune: false, tickets: false, modifiers: false },
  { id: "C", label: "Fortune only", description: "Two-token Fortune award enabled; Mystery modifiers and Mystery Free Spin tickets disabled.", fortune: true, tickets: false, modifiers: false },
  { id: "D", label: "Modifiers, no tickets", description: "Fortune and Mystery modifiers enabled; Mystery Free Spin tickets disabled.", fortune: true, tickets: false, modifiers: true },
  { id: "E", label: "Tickets, no modifiers", description: "Fortune and Mystery Free Spin tickets enabled; Mystery modifiers disabled.", fortune: true, tickets: true, modifiers: false },
  { id: "F", label: "Full Mystery system", description: "Fortune, Mystery modifiers, and Mystery Free Spin tickets enabled without an ally ability.", fortune: true, tickets: true, modifiers: true },
];

const layers = {};
for (const mode of modes) layers[mode.id] = simulateMode(mode, cycles, seed);
layers.B = {
  ...layers.A,
  id: "B",
  label: "Tokens counted, no awards",
  description: "Observation layer on the same current strips. Payout behavior is intentionally identical to Layer A.",
  observationOnly: true,
};

const allies = {};
for (const allyId of ALLY_IDS) {
  allies[allyId] = simulateMode({
    id: `G-${allyId}`,
    label: `Full Mystery + ${CONFIG.allies[allyId].name}`,
    description: `Full Mystery system with ${CONFIG.allies[allyId].abilityName}.`,
    fortune: true,
    tickets: true,
    modifiers: true,
    allyId,
  }, allyCycles, seed, { collectTopChains: false });
}

function recommendation(full) {
  const twoPlus = full.twoPlusTokenFrequencyPaidSpins;
  const fourPlus = full.tokenFrequencyPaidSpins["4+"];
  const rtp = full.totalRtp;
  const chain = full.averageConditionalMysteryChainLength;
  if (rtp >= 0.98 && rtp <= 1.01 && chain < 2.5 && full.queueCapHitFrequencyPerSettledSpin < 0.001) {
    return { path: "A", title: "Keep current tuning", reason: "The full return is inside the target review band, Mystery chains stay short, and queue-cap pressure is negligible." };
  }
  if (fourPlus > 0.008 && twoPlus < 0.30) {
    return { path: "D", title: "Reduce 4+ clustering only", reason: "Ordinary token activity is acceptable, but four-plus outcomes are above the preferred rarity band." };
  }
  if (rtp > 1.01 && twoPlus < 0.30) {
    return { path: "C", title: "Keep frequency, reduce awards", reason: "Visual frequency is not extreme, but Mystery awards push return above the review band." };
  }
  if (twoPlus >= 0.30 || chain >= 2.5) {
    return { path: "B", title: "Lightly reduce scatter appearance", reason: "Two-plus outcomes or chain interruptions are frequent enough to dominate ordinary play." };
  }
  return { path: "A", title: "Keep current tuning with monitoring", reason: "No single measured pressure justifies a production nerf." };
}

const report = {
  mode: "mystery-scatter-layered-monte-carlo",
  generatedAt: new Date().toISOString(),
  cycles,
  allyCycles,
  seed,
  wager,
  baselineNote: "The current branch no longer contains the historical pre-Mystery reel strips. Layer A therefore measures the current strips with all Mystery awards disabled; Layer B is the identical token-observation layer.",
  layers,
  allies,
  fortuneChargeFrequencyBeforeMysteryAwards: layers.A.fortuneChargeConsumptionFrequency,
  fortuneChargeFrequencyFullMystery: layers.F.fortuneChargeConsumptionFrequency,
  fullMysteryIncrementalRtp: layers.F.totalRtp - layers.A.totalRtp,
  recommendation: recommendation(layers.F),
};

function printLayer(layer) {
  console.log(`\n${layer.id}. ${layer.label}`);
  console.log(`  RTP: ${percentage(layer.totalRtp)} | average paid cycle: ${layer.averagePaidCyclePayout.toFixed(4)} coins`);
  console.log(`  Paid token frequency: 1 ${percentage(layer.tokenFrequencyPaidSpins["1"])} | 2 ${percentage(layer.tokenFrequencyPaidSpins["2"])} | 3 ${percentage(layer.tokenFrequencyPaidSpins["3"])} | 4+ ${percentage(layer.tokenFrequencyPaidSpins["4+"])}`);
  console.log(`  2+ tokens: ${percentage(layer.twoPlusTokenFrequencyPaidSpins)} | tokens/spin: ${layer.averageTokensPerPaidSpin.toFixed(6)}`);
  console.log(`  Mystery tickets awarded/paid: ${layer.averageMysteryFreeSpinsAwardedPerPaidSpin.toFixed(6)} | played/paid: ${layer.averageMysteryFreeSpinsPlayedPerPaidSpin.toFixed(6)}`);
  console.log(`  Chain start / conditional length / max: ${percentage(layer.mysteryChainStartFrequency)} / ${layer.averageConditionalMysteryChainLength.toFixed(4)} / ${layer.maximumMysteryChainLength}`);
  console.log(`  Modifier queue any / multiple: ${percentage(layer.queuedModifierFrequencyPerSettledSpin)} / ${percentage(layer.multipleQueuedModifierFrequencyPerSettledSpin)}`);
  console.log(`  Fortune charge consumption: ${percentage(layer.fortuneChargeConsumptionFrequency)}`);
  console.log(`  Ally triggers paid / Mystery: ${percentage(layer.paidSpinAllyTriggerFrequency)} / ${percentage(layer.mysterySpinAllyTriggerFrequency)}`);
  console.log(`  Maximum spin / paid cycle: ${layer.maximumSingleSpinPayout.toLocaleString()} / ${layer.maximumPaidCyclePayout.toLocaleString()}`);
}

if (outputJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Mystery Scatter layered audit (${cycles.toLocaleString()} paid cycles per layer, seed 0x${seed.toString(16)})`);
  console.log("=".repeat(96));
  console.log(report.baselineNote);
  for (const id of ["A", "B", "C", "D", "E", "F"]) printLayer(layers[id]);
  console.log("\nG. Full Mystery system by ally");
  for (const allyId of ALLY_IDS) {
    const row = allies[allyId];
    console.log(`  ${CONFIG.allies[allyId].name.padEnd(9)} ${percentage(row.totalRtp)} | avg cycle ${row.averagePaidCyclePayout.toFixed(4)} | Mystery-origin Ally spins ${row.mysteryTriggeredAllyFreeSpins.toLocaleString()}`);
  }
  console.log("\nModifier awards per paid spin (full system)");
  for (const id of modifierIds) console.log(`  ${id.padEnd(16)} ${layers.F.specificModifierAwardsPerPaidSpin[id].toFixed(6)}`);
  console.log("\nTop 10 paid-cycle outcomes (full system)");
  for (const row of layers.F.topChains) console.log(`  #${String(row.root).padEnd(8)} payout ${String(row.payout).padStart(7)} | Mystery ${row.mysteryFreeSpins} | Ally ${row.allyFreeSpins} | tokens ${row.tokens}`);
  console.log(`\nRecommendation: Path ${report.recommendation.path} — ${report.recommendation.title}`);
  console.log(`  ${report.recommendation.reason}`);
}

if (check) {
  const failures = [];
  const sum = Object.values(layers.F.tokenFrequencyPaidSpins).reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-9) failures.push(`Paid token frequencies sum to ${sum}.`);
  if (!Number.isFinite(layers.F.totalRtp) || layers.F.totalRtp <= 0) failures.push("Full Mystery RTP is invalid.");
  if (layers.F.maximumQueuedFreeSpins > CONFIG.mystery.maximumQueuedFreeSpins) failures.push("Mystery Free Spin queue exceeded its configured cap.");
  if (layers.F.tokenFrequencyPaidSpins["3"] <= 0 || layers.F.tokenFrequencyPaidSpins["4+"] <= 0) failures.push("Three-token and four-plus outcomes must remain possible.");
  if (Object.values(allies).some(row => !Number.isFinite(row.totalRtp))) failures.push("At least one ally RTP is invalid.");
  if (failures.length) {
    failures.forEach(failure => console.error(`CHECK FAILED: ${failure}`));
    process.exitCode = 1;
  } else console.log("\nLayer reconciliation, token frequency, queue cap, and ally audit checks: PASS");
}
