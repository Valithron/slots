#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const store = new Map();
let systemReduced = false;
let coarsePointer = false;
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
};
globalThis.matchMedia = query => ({
  matches: query.includes("prefers-reduced-motion") ? systemReduced : query.includes("pointer: coarse") ? coarsePointer : false,
});
globalThis.document = { getElementById: () => null, documentElement: null };

await import("../js/config.js");
await import("../js/combination-clarity-config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/persistence.js");
await import("../js/visual-effects-settings.js");
await import("../js/payouts.js");
await import("../js/combination-clarity-payouts.js");
await import("../js/game-flow.js");
await import("../js/effects.js");
await import("../js/mobile-effects.js");

const mobileCss = await readFile(new URL("../mobile-effects.css", import.meta.url), "utf8");
const mobileJs = await readFile(new URL("../js/mobile-effects.js", import.meta.url), "utf8");
const app = globalThis.CommuneFortune;
const { CONFIG, payouts, persistence, effects, combinationClarity } = app;
const state = overrides => ({
  coins: 1000,
  lineBetIndex: 0,
  sound: true,
  lastWin: 0,
  gamePhase: app.GAME_STATES.IDLE,
  pendingSpin: null,
  fortuneMeter: { value: 0, charged: false },
  freeSpinSession: null,
  visualEffectsMode: "auto",
  ...overrides,
});

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, itemIndex) => itemIndex !== index))
    .map(rest => [value, ...rest]));
}

function matrixWithMiddle(row) {
  return [
    ["ASH", "ASH", "ASH"],
    [...row],
    ["GAB", "GAB", "GAB"],
  ];
}

function visualEffectsModes() {
  assert.equal(effects.getMotionMode({ visualEffectsMode: "auto" }, true), "reduced");
  assert.equal(effects.getMotionMode({ visualEffectsMode: "auto" }, false), "full");
  assert.equal(effects.getMotionMode({ visualEffectsMode: "full" }, true), "full");
  assert.equal(effects.getMotionMode({ visualEffectsMode: "reduced" }, false), "reduced");
  assert.equal(app.visualEffectsSettings.normalizeVisualEffectsMode("invalid"), "auto");

  store.clear();
  effects.setVisualEffectsMode("full");
  const saved = persistence.defaultState();
  persistence.saveState(saved);
  assert.equal(persistence.loadState().visualEffectsMode, "full");
  assert.equal(JSON.parse(store.get(app.constants.storageKey)).visualEffectsMode, "full");

  assert.equal(effects.isMobileTuningActive({ width: 768, coarsePointer: false }), true);
  assert.equal(effects.isMobileTuningActive({ width: 1200, coarsePointer: true }), true);
  assert.equal(effects.isMobileTuningActive({ width: 1200, coarsePointer: false }), false);

  const reducedProfile = effects.getTactileProfile({ visualEffectsMode: "reduced" }, { width: 390, coarsePointer: true, systemReduced: false });
  assert.equal(reducedProfile.visibleImpact, true);
  assert.equal(reducedProfile.cabinetMotion, false);
  assert.equal(reducedProfile.localizedMotion, false);
  assert.equal(reducedProfile.repeatedPulse, false);

  const fullMobileProfile = effects.getTactileProfile({ visualEffectsMode: "full" }, { width: 390, coarsePointer: true, systemReduced: true });
  assert.equal(fullMobileProfile.mode, "full");
  assert.equal(fullMobileProfile.visibleImpact, true);
  assert.equal(fullMobileProfile.cabinetMotion, false);
  assert.equal(fullMobileProfile.localizedMotion, false);
  assert.equal(fullMobileProfile.repeatedPulse, false);
}

function mobileCompositingSafety() {
  assert.match(mobileCss, /\.mobile-stable-rendering \.reel\.is-stop-impact[\s\S]*?animation: none !important;[\s\S]*?transform: none !important;[\s\S]*?filter: none !important;/);
  assert.match(mobileCss, /\.mobile-stable-rendering \.machine\.reel-impact[\s\S]*?animation: none !important;[\s\S]*?transform: none !important;/);
  assert.match(mobileCss, /@media \(max-width: 768px\), \(pointer: coarse\)/);
  assert.match(mobileCss, /\.celebration-layer::before[\s\S]*?backdrop-filter: none !important;/);
  assert.match(mobileCss, /\.commune-confetti,[\s\S]*?\.screen-flash,[\s\S]*?display: none !important;/);
  assert.match(mobileCss, /\.reel-strip[\s\S]*?will-change: auto !important;/);
  assert.doesNotMatch(mobileJs, /Element\.prototype\.animate\s*=/);
  assert.doesNotMatch(mobileJs, /function mobileReelAnimation/);
  assert.doesNotMatch(mobileJs, /requestAnimationFrame\(step\)/);
  assert.match(mobileJs, /originalStartTierEffects\(\{ \.\.\.options, reducedMotion: true \}\)/);
  assert.match(mobileJs, /originalPresentCombination\(\{ \.\.\.options, reducedMotion: true \}\)/);
  assert.doesNotMatch(mobileCss, /@keyframes mobileLocalizedReelImpact/);
  assert.doesNotMatch(mobileCss, /@keyframes mobileFrameImpact/);
  assert.doesNotMatch(mobileCss, /@keyframes mobileCabinetImpact/);
}

function namedCombinationPermutations() {
  for (const definition of CONFIG.combinations.definitions) {
    const rows = permutations(definition.members);
    assert.equal(rows.length, 6);
    for (const row of rows) {
      const matches = combinationClarity.detectCombinationMatches(matrixWithMiddle(row));
      assert.equal(matches.length, 1, `${definition.name} should match ${row.join("/")}`);
      assert.equal(matches[0].id, definition.id);
      assert.deepEqual(matches[0].symbols, row);
    }
  }
}

function boundaryRules() {
  const kps = ["STR", "CYD", "TOL"];
  assert.equal(combinationClarity.detectCombinationMatches([kps, ["GAB", "ASH", "KEN"], ["RYN", "COP", "GAB"]]).length, 0);
  assert.equal(combinationClarity.detectCombinationMatches([["GAB", "ASH", "KEN"], ["RYN", "COP", "GAB"], kps]).length, 0);
  assert.equal(combinationClarity.detectCombinationMatches([["STR", "GAB", "ASH"], ["KEN", "CYD", "RYN"], ["COP", "GAB", "TOL"]]).length, 0);
  assert.equal(combinationClarity.detectCombinationMatches([["STR", "GAB", "ASH"], ["CYD", "KEN", "RYN"], ["TOL", "COP", "GAB"]]).length, 0);

  const original = [
    ["STR", "GAB", "CYD"],
    ["ASH", "TOL", "RYN"],
    ["ASH", "COP", "GAB"],
  ];
  const awakened = original.map(row => [...row]);
  awakened[0][1] = "TOL";
  awakened[2][1] = "TOL";
  assert.equal(combinationClarity.detectCombinationMatches(original).length, 0);
  assert.equal(combinationClarity.detectCombinationMatches(awakened).length, 0);
}

function fullCommuneRules() {
  const matrix = [
    ["RYN", "GAB", "COP"],
    ["STR", "TOL", "CYD"],
    ["KEN", "ASH", "STR"],
  ];
  const matches = combinationClarity.detectCombinationMatches(matrix);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "full-commune");
  assert.equal(matches.some(match => match.id === "kps"), false);
}

function payoutScalingAndMath() {
  for (let lineBetIndex = 0; lineBetIndex < CONFIG.lineBets.length; lineBetIndex += 1) {
    const testState = state({ lineBetIndex });
    for (const definition of CONFIG.combinations.definitions) {
      const match = combinationClarity.detectCombinationMatches(matrixWithMiddle(definition.members))[0];
      const win = payouts.calculateCombinationWins([match], testState)[0];
      assert.equal(win.payout, definition.multiplier * CONFIG.lineBets[lineBetIndex]);
    }
  }

  const common = {
    targetStops: [7, 4, 5],
    state: state({ fortuneMeter: { value: 100, charged: true } }),
    id: "isolation",
    createdAt: "test",
    featureRolls: { expandingWild: { roll: 0 } },
  };
  const auto = payouts.createSpinResult(common);
  effects.setVisualEffectsMode("reduced");
  const reduced = payouts.createSpinResult({ ...common, state: state({ fortuneMeter: { value: 100, charged: true }, visualEffectsMode: "reduced" }) });
  for (const key of ["originalMatrix", "resolvedMatrix", "featureRolls", "lineWins", "combinationWins", "fortuneMeterAward", "totalWin", "winTier"]) {
    assert.deepEqual(reduced[key], auto[key]);
  }
  assert.equal(auto.totalWin, auto.preModifierWin + auto.fortuneBonus);
  assert.equal(auto.preModifierWin, auto.lineWinTotal + auto.combinationWinTotal);
}

const tests = [visualEffectsModes, mobileCompositingSafety, namedCombinationPermutations, boundaryRules, fullCommuneRules, payoutScalingAndMath];
tests.forEach(test => test());
console.log(`Polish tests: PASS (${tests.length} groups)`);