import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const load = path => vm.runInThisContext(read(path), { filename: path });

globalThis.CommuneFortune = {};
[
  "js/config.js",
  "js/combination-clarity-config.js",
  "js/ally-config.js",
  "js/reactions.js",
  "js/free-spins.js",
  "js/allies.js",
  "js/payouts.js",
  "js/combination-clarity-payouts.js",
  "js/mystery.js",
  "js/ally-payouts.js",
  "js/qa-mode.js",
].forEach(load);

const app = globalThis.CommuneFortune;
const state = {
  lineBetIndex: 0,
  coins: 1000,
  fortuneMeter: { value: 0, charged: false },
  freeSpinSession: null,
};

assert.equal(app.qa.enabled, false, "QA must remain disabled without the exact query parameter");
assert.equal(app.qa.queueScenario("paid", "three-trees"), false, "disabled QA must not queue overrides");

const contexts = {
  "three-trees": { spinType: "paid", totalAwardedSpins: 0 },
  loss: { spinType: "free", totalAwardedSpins: 4 },
  "weak-win": { spinType: "free", totalAwardedSpins: 4 },
  "small-win": { spinType: "free", totalAwardedSpins: 4 },
  "nice-win": { spinType: "free", totalAwardedSpins: 4 },
  "big-win": { spinType: "free", totalAwardedSpins: 4 },
  retrigger: { spinType: "free", totalAwardedSpins: 4 },
  awakening: { spinType: "free", totalAwardedSpins: 4 },
  combination: { spinType: "free", totalAwardedSpins: 4 },
  "spotlight-win": { spinType: "free", totalAwardedSpins: 4 },
  "center-open": { spinType: "free", totalAwardedSpins: 4 },
};

const results = {};
for (const [scenario, context] of Object.entries(contexts)) {
  const forced = app.qa.findScenario(scenario, {
    state,
    spinType: context.spinType,
    referenceBet: 5,
    totalAwardedSpins: context.totalAwardedSpins,
  });
  assert.equal(forced.targetStops.length, 3, `${scenario} must provide one stop per reel`);
  results[scenario] = app.payouts.createSpinResult({
    targetStops: forced.targetStops,
    featureRolls: forced.featureRolls,
    state,
    id: `qa-verify-${scenario}`,
    spinType: context.spinType,
    referenceBet: 5,
    totalAwardedSpins: context.totalAwardedSpins,
    allyBypass: true,
  });
}

assert.equal(results["three-trees"].freeSpinTrigger.triggered, true);
assert.ok(results["three-trees"].freeSpinTrigger.awardedSpins > 0);
assert.equal(results.loss.totalWin, 0);
assert.ok(results["weak-win"].totalWin > 0 && results["weak-win"].totalWin < 15);
assert.equal(results["small-win"].naturalWinTier, app.WIN_TIERS.SMALL);
assert.equal(results["nice-win"].finalWinTier, app.WIN_TIERS.NICE);
assert.ok([app.WIN_TIERS.BIG, app.WIN_TIERS.JACKPOT].includes(results["big-win"].finalWinTier));
assert.equal(results["big-win"].freeSpinTrigger.triggered, true, "current math requires Three Trees for the forced Big Win");
assert.equal(results.retrigger.freeSpinTrigger.retrigger, true);
assert.ok(results.retrigger.freeSpinTrigger.awardedSpins > 0);
assert.ok(results.awakening.transformations.some(item => item.type === "expanding-wild"));
assert.ok(results.combination.combinationWins.length > 0);
assert.ok(results["spotlight-win"].lineWins.some(win => win.symbolKey === "STR"));
assert.ok(![app.CONFIG.expandingWild.symbolKey, app.CONFIG.mystery.symbolKey]
  .includes(results["center-open"].originalMatrix[app.CONFIG.expandingWild.rowIndex][app.CONFIG.expandingWild.reelIndex]));

const qaSource = read("js/qa-mode.js");
const engineSource = read("js/game-engine.js");
const indexSource = read("index.html");
const cssSource = read("qa-mode.css");
const readmeSource = read("README.md");

assert.match(qaSource, /query\.get\("qa"\) === "ally"/);
assert.match(qaSource, /sessionStorage/);
assert.doesNotMatch(qaSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
assert.match(engineSource, /consumeSpinOverride/);
assert.match(engineSource, /waitForFreeSpinStep/);
assert.match(engineSource, /bindGameControls/);
assert.match(engineSource, /testMysteryModifier/);
assert.match(qaSource, /Test Spotlight/);
assert.match(qaSource, /Test Center Tree/);
assert.match(qaSource, /Test Double Commune/);
assert.match(indexSource, /qa-mode\.css/);
assert.match(indexSource, /js\/qa-mode\.js/);
assert.ok(indexSource.indexOf("js/qa-mode.js") < indexSource.indexOf("js/game-engine.js"), "QA module must load before the engine");
assert.doesNotMatch(cssSource, /\.machine|\.reel-grid|\.reel-track|\.cabinet/);
assert.match(readmeSource, /\?qa=ally/);
assert.match(readmeSource, /no standalone non-trigger Big Win/i);

console.log("QA mode tests: PASS");
