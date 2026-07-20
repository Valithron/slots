#!/usr/bin/env node

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, raw = "true"] = value.replace(/^--/, "").split("=");
  return [key, raw];
}));
const cycles = Math.max(100, Math.floor(Number(args.cycles) || (args["monte-carlo"] ? 200000 : 50000)));
const allyCycles = Math.max(0, Math.floor(Number(args["ally-cycles"]) || Math.min(cycles, 50000)));
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

function blankMetrics(label) {
  return {
    label,
    cycles: 0,
    wager: 0,
    payout: 0,
    rtp: 0,
    paidCyclePayouts: [],
    maximumCoherentSpin: 0,
    maximumPaidCyclePayout: 0,
    maximumAllyFeaturePayout: 0,
    mysterySpins: 0,
    allySpins: 0,
    strongAwards: 0,
    strongAwardFrequency: 0,
    selection: Object.fromEntries((CONFIG.mystery.strongModifierPool || []).map(id => [id, 0])),
    active: {},
    loops: {
      scatterMagnetSelf: 0,
      communeChaosSelf: 0,
      scatterMagnetAnyFollowUp: 0,
      scatterSparkAnyFollowUp: 0,
      chainLengths: [],
      longest: 0,
      maximumQueuedMysterySpins: 0,
    },
    fortuneFromStrong: 0,
    featureCapFrequency: 0,
    overflowFrequency: 0,
    rescueByModifier: {},
    modifierDiagnostics: {},
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

function activeStrongIds(result) {
  return (result.strongMysteryActiveModifiers || []).map(item => item.id);
}

function ensureDiagnostic(metrics, id) {
  metrics.active[id] ||= { spins: 0, payout: 0, zeroCoin: 0, rescue: 0, awards: 0 };
  metrics.modifierDiagnostics[id] ||= {};
  return metrics.active[id];
}

function recordResult(metrics, result, beforeFortune) {
  metrics.maximumCoherentSpin = Math.max(metrics.maximumCoherentSpin, result.totalWin || 0);
  if (result.spinType === "mystery-free") metrics.mysterySpins += 1;
  if (result.spinType === "free") metrics.allySpins += 1;
  const ids = activeStrongIds(result);
  ids.forEach(id => {
    const row = ensureDiagnostic(metrics, id);
    row.spins += 1;
    row.payout += result.totalWin || 0;
    if (!(result.totalWin > 0)) row.zeroCoin += 1;
    if (result.mysteryRescue?.attemptsUsed > 0) {
      row.rescue += 1;
      metrics.rescueByModifier[id] = (metrics.rescueByModifier[id] || 0) + 1;
    }
  });

  const award = result.mysteryAward?.modifier;
  if (award?.tier === "strong" || award?.actualTier === "strong") {
    metrics.strongAwards += 1;
    metrics.selection[award.id] = (metrics.selection[award.id] || 0) + 1;
    ensureDiagnostic(metrics, award.id).awards += 1;
    if (ids.includes("scatter-magnet")) metrics.loops.scatterMagnetAnyFollowUp += 1;
    if (result.strongMysteryActiveModifiers?.some(item => item.id === "commune-chaos" && item.selectionPayload?.effects?.includes("scatter-spark"))) {
      metrics.loops.scatterSparkAnyFollowUp += 1;
    }
    if (ids.includes("scatter-magnet") && award.id === "scatter-magnet") metrics.loops.scatterMagnetSelf += 1;
    if (ids.includes("commune-chaos") && award.id === "commune-chaos") metrics.loops.communeChaosSelf += 1;
  }
  const afterPredicted = Math.max(beforeFortune, result.strongMysteryGlobal?.meterFloor || 0);
  metrics.fortuneFromStrong += Math.max(0, afterPredicted - beforeFortune);
  if (result.mysterySettlement?.allyCapReached || result.freeSpinTrigger?.capped) metrics.featureCapFrequency += 1;
  if ((result.mysterySettlement?.overflowMysterySpins || 0) > 0 || (result.mysterySettlement?.overflowMysterySpinsDeferred || 0) > 0) metrics.overflowFrequency += 1;
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

function runSimulation({ count, runSeed, allyId = null, label }) {
  const rng = rngFrom(runSeed);
  const state = createState();
  const metrics = blankMetrics(label);
  let chainLength = 0;

  for (let cycle = 0; cycle < count; cycle += 1) {
    metrics.cycles += 1;
    const wager = app.payouts.getTotalBet(state);
    metrics.wager += wager;
    let cyclePayout = 0;
    let featurePayout = 0;
    let spinGuard = 0;
    let spinType = "paid";

    while (spinGuard++ < 500) {
      if (state.freeSpinSession?.active) {
        const selectedAlly = allyId || allyIds[cycle % allyIds.length];
        initializeAlly(state, selectedAlly, rng);
        spinType = "free";
      } else if (app.mystery.hasQueuedFreeSpin(state)) spinType = "mystery-free";
      else if (spinType !== "paid") break;

      const beforeFortune = state.fortuneMeter?.value || 0;
      const resolved = createResult(state, spinType, rng, `${label}-${cycle}-${spinGuard}`);
      const activeBefore = activeStrongIds(resolved);
      const settled = settleResult(state, resolved);
      recordResult(metrics, settled, beforeFortune);
      cyclePayout += settled.totalWin || 0;
      if (spinType === "free") featurePayout += settled.totalWin || 0;

      const strongFollowUp = settled.mysteryAward?.modifier?.tier === "strong" || settled.mysteryAward?.modifier?.actualTier === "strong";
      if (strongFollowUp) chainLength = activeBefore.length ? chainLength + 1 : 1;
      else if (activeBefore.length && chainLength > 0) {
        metrics.loops.chainLengths.push(chainLength);
        metrics.loops.longest = Math.max(metrics.loops.longest, chainLength);
        chainLength = 0;
      }

      metrics.loops.maximumQueuedMysterySpins = Math.max(metrics.loops.maximumQueuedMysterySpins, state.mystery?.queuedFreeSpins || 0);
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

    if (spinGuard >= 500) metrics.loops.longest = Math.max(metrics.loops.longest, 500);
    metrics.payout += cyclePayout;
    metrics.maximumPaidCyclePayout = Math.max(metrics.maximumPaidCyclePayout, cyclePayout);
    metrics.maximumAllyFeaturePayout = Math.max(metrics.maximumAllyFeaturePayout, featurePayout);
  }

  if (chainLength > 0) {
    metrics.loops.chainLengths.push(chainLength);
    metrics.loops.longest = Math.max(metrics.loops.longest, chainLength);
  }
  metrics.rtp = metrics.wager ? metrics.payout / metrics.wager : 0;
  metrics.strongAwardFrequency = metrics.cycles ? metrics.strongAwards / metrics.cycles : 0;
  const chains = metrics.loops.chainLengths;
  metrics.loops.average = chains.length ? chains.reduce((sum, value) => sum + value, 0) / chains.length : 0;
  metrics.loops.percentTwoPlus = chains.length ? chains.filter(value => value >= 2).length / chains.length : 0;
  metrics.loops.percentThreePlus = chains.length ? chains.filter(value => value >= 3).length / chains.length : 0;
  metrics.loops.percentFivePlus = chains.length ? chains.filter(value => value >= 5).length / chains.length : 0;
  Object.values(metrics.active).forEach(row => {
    row.averagePayout = row.spins ? row.payout / row.spins : 0;
    row.zeroCoinFrequency = row.spins ? row.zeroCoin / row.spins : 0;
    row.rescueFrequency = row.spins ? row.rescue / row.spins : 0;
  });
  delete metrics.paidCyclePayouts;
  return metrics;
}

const baselineCycles = Math.min(cycles, 50000);
const baseline = runSimulation({ count: baselineCycles, runSeed: seed, label: "before-strong" });
await import("../js/strong-mystery-core.js");
await import("../js/strong-mystery-candidate.js");
await import("../js/strong-mystery-integration.js");
await import("../js/strong-mystery-presentation.js");
await import("../js/strong-mystery.js");
const after = runSimulation({ count: cycles, runSeed: seed, label: "after-strong" });
const byAlly = {};
if (allyCycles > 0) {
  const perAlly = Math.max(100, Math.floor(allyCycles / Math.max(1, allyIds.length)));
  allyIds.forEach((id, index) => {
    byAlly[id] = runSimulation({ count: perAlly, runSeed: (seed + ((index + 1) * 0x9e3779b9)) >>> 0, allyId: id, label: `ally-${id}` });
  });
}

const report = {
  seed,
  generatedAt: new Date().toISOString(),
  requestedCycles: cycles,
  baselineCycles,
  allyCyclesTotal: allyCycles,
  before: baseline,
  after,
  rtpDelta: after.rtp - baseline.rtp,
  byAlly: Object.fromEntries(Object.entries(byAlly).map(([id, row]) => [id, {
    cycles: row.cycles,
    rtp: row.rtp,
    maximumPaidCyclePayout: row.maximumPaidCyclePayout,
    maximumAllyFeaturePayout: row.maximumAllyFeaturePayout,
    strongAwardFrequency: row.strongAwardFrequency,
  }])),
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = value => `${(value * 100).toFixed(4)}%`;
  console.log("Strong Mystery production-equivalent simulation");
  console.log(`Seed: ${seed}`);
  console.log(`Before Strong RTP (${baseline.cycles.toLocaleString()} cycles): ${pct(baseline.rtp)}`);
  console.log(`After Strong RTP (${after.cycles.toLocaleString()} cycles): ${pct(after.rtp)}`);
  console.log(`RTP delta: ${pct(report.rtpDelta)}`);
  console.log(`Strong award frequency: ${pct(after.strongAwardFrequency)}`);
  console.log(`Maximum coherent spin: ${after.maximumCoherentSpin}`);
  console.log(`Maximum paid cycle: ${after.maximumPaidCyclePayout}`);
  console.log(`Maximum Ally feature: ${after.maximumAllyFeaturePayout}`);
  console.log(`Average Strong chain: ${after.loops.average.toFixed(4)}; longest ${after.loops.longest}`);
  console.log(`Chains 2+: ${pct(after.loops.percentTwoPlus)}; 3+: ${pct(after.loops.percentThreePlus)}; 5+: ${pct(after.loops.percentFivePlus)}`);
  console.log("Strong selections:");
  Object.entries(after.selection).forEach(([id, count]) => console.log(`  ${id}: ${count} (${after.strongAwards ? pct(count / after.strongAwards) : "0.0000%"})`));
  console.log("Active modifier diagnostics:");
  Object.entries(after.active).forEach(([id, row]) => console.log(`  ${id}: spins ${row.spins}, avg ${row.averagePayout.toFixed(3)}, zero ${pct(row.zeroCoinFrequency)}, Rescue ${pct(row.rescueFrequency)}`));
  if (Object.keys(byAlly).length) {
    console.log("RTP by Ally:");
    Object.entries(byAlly).forEach(([id, row]) => console.log(`  ${id}: ${pct(row.rtp)} (${row.cycles.toLocaleString()} cycles)`));
  }
}
