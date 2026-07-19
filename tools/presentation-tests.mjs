#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

await import("../js/config.js");
await import("../js/combination-clarity-config.js");
await import("../js/ally-config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/payouts.js");
await import("../js/combination-clarity-payouts.js");
await import("../js/mystery.js");
await import("../js/game-flow.js");
await import("../js/reels.js");

const app = globalThis.CommuneFortune;
const { CONFIG, GAME_STATES, gameFlow, reels, payouts } = app;
const FS = app.freeSpins.FREE_SPIN_STATUSES;

function tiers() {
  CONFIG.lineBets.forEach((_, index) => {
    const bet = payouts.getTotalBet({ lineBetIndex: index });
    assert.equal(payouts.classifyWinTier(0, bet), "none");
    assert.equal(payouts.classifyWinTier(bet * 5, bet), "nice");
    assert.equal(payouts.classifyWinTier(bet * 15, bet), "big");
    assert.equal(payouts.classifyWinTier(bet * 40, bet), "jackpot");
  });
}

function routes() {
  let spin = 0;
  let stop = 0;
  let skip = 0;
  let start = 0;
  let cont = 0;
  const actions = {
    onSpin: () => spin += 1,
    onStop: () => { stop += 1; return true; },
    onSkip: () => skip += 1,
    onStart: () => start += 1,
    onContinue: () => cont += 1,
  };
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.IDLE, ...actions }), "spun");
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.SPINNING, manualStopsEnabled: true, ...actions }), "stop-requested");
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.CELEBRATING, ...actions }), "skipped");
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.BONUS, freeSpinStatus: FS.INTRO, ...actions }), "started");
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.BONUS, freeSpinStatus: FS.SUMMARY, ...actions }), "continued");
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.FREE_SPINS, freeSpinStatus: FS.SPINNING, reelsMoving: true, manualStopsEnabled: true, ...actions }), "stop-requested");
  assert.equal(gameFlow.routePrimaryAction({ phase: GAME_STATES.FREE_SPINS, freeSpinStatus: FS.PRESENTING, reelsMoving: false, ...actions }), "skipped");
  assert.deepEqual({ spin, stop, skip, start, cont }, { spin: 1, stop: 2, skip: 2, start: 1, cont: 1 });
}

function modes() {
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.IDLE }), "spin");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.BONUS, freeSpinStatus: FS.INTRO }), "start");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.BONUS, freeSpinStatus: FS.SUMMARY }), "continue");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.FREE_SPINS, freeSpinStatus: FS.PRESENTING }), "skip");
  assert.equal(gameFlow.getPrimaryActionMode({ phase: GAME_STATES.FREE_SPINS, freeSpinStatus: FS.SPINNING, reelsMoving: true, manualStopsEnabled: true, nextStopIndex: 1 }), "stop");
  assert.equal(gameFlow.getStopAriaLabel(1), "Stop reel 2");
}

function queue() {
  const controller = reels.createManualStopState({ enabled: true });
  controller.begin(0);
  assert.deepEqual([
    controller.requestNextStop(1).reelIndex,
    controller.requestNextStop(2).reelIndex,
    controller.requestNextStop(3).reelIndex,
  ], [0, 1, 2]);
  assert.equal(controller.requestNextStop(4).accepted, false);
  assert.equal(controller.snapshot().requestedStops, 3);
}

function manualIsolation() {
  const common = {
    targetStops: [7, 4, 5],
    state: { lineBetIndex: 0, fortuneMeter: { value: 100, charged: true } },
    id: "m",
    createdAt: "t",
    featureRolls: { expandingWild: { roll: 0 } },
  };
  const withoutStops = payouts.createSpinResult({
    ...common,
    featureFlags: { ...CONFIG.features, manualStops: false, freeSpins: false },
  });
  const withStops = payouts.createSpinResult({
    ...common,
    featureFlags: { ...CONFIG.features, manualStops: true, freeSpins: false },
  });
  for (const key of ["originalMatrix", "resolvedMatrix", "featureRolls", "transformations", "lineWins", "combinationWins", "fortuneMeterAward", "totalWin", "winTier"]) {
    assert.deepEqual(withoutStops[key], withStops[key]);
  }
}

function reduced() {
  assert.ok(gameFlow.getCelebrationDuration("nice", { reducedMotion: true }) < gameFlow.getCelebrationDuration("nice"));
  assert.ok(gameFlow.getCelebrationDuration("nice", { compact: true }) < gameFlow.getCelebrationDuration("nice"));
  const reaction = app.reactions.selectReaction({
    totalWin: 30,
    winTier: "nice",
    lineWins: [{ symbolKey: "STR", payout: 30 }],
    combinationWins: [],
  }, { compact: true, reducedMotion: true });
  assert.equal(reaction.compact, true);
  assert.equal(reaction.reducedMotion, true);
}

function reactionAssets() {
  const nice = app.reactions.resolveReactionAsset("STR", "nice");
  const big = app.reactions.resolveReactionAsset("STR", "big");
  assert.equal(nice.source, "nice");
  assert.equal(big.source, "big");
  assert.match(nice.path, /assets\/symbols\/sterling-nice\.svg\?v=portraits-v5/);
  assert.match(big.path, /assets\/symbols\/sterling-big\.svg\?v=portraits-v5/);

  for (const filename of ["sterling-nice.svg", "sterling-big.svg"]) {
    const svg = fs.readFileSync(new URL(`../assets/symbols/${filename}`, import.meta.url), "utf8");
    assert.match(svg, /<svg[\s>]/, `${filename} must contain an SVG root`);
    assert.match(svg, /data:image\/png;base64|<image[\s>]/, `${filename} must contain rendered image artwork`);
  }

  const source = fs.readFileSync(new URL("../js/ally-config.js", import.meta.url), "utf8");
  assert.match(source, /model\.portraits\[index\]\?\.asset/);
  assert.match(source, /data-qa-reaction-preview/);
  assert.match(source, /Small Win · coin burst only/);
  assert.match(source, /Commune Jackpot/);
}

[tiers, routes, modes, queue, manualIsolation, reduced, reactionAssets].forEach(test => test());
console.log("Presentation tests: PASS (7 groups)");
