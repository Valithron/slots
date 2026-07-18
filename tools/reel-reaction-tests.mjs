import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const load = path => vm.runInThisContext(read(path), { filename: path });

globalThis.location = { search: "" };
globalThis.document = { querySelector: () => null };
globalThis.matchMedia = () => ({ matches: false });
globalThis.CommuneFortune = {};
load("js/config.js");
load("js/reactions.js");
load("js/free-spins.js");
load("js/allies.js");
load("js/payouts.js");
load("js/combination-clarity-payouts.js");
load("js/ally-payouts.js");
const app = globalThis.CommuneFortune;
app.qa = { enabled: false };
app.ui = { createUI: () => ({ markWins() {}, clearWins() {}, clearFeaturePresentation() {} }) };
app.reels = { createReelController: () => ({}) };
load("js/reel-reactions.js");

const rr = app.reelReactions;
assert.equal(rr.BASE_MS, 450);
assert.equal(rr.REACTION_MS, 650);
assert.deepEqual(rr.fallbackLevels("small"), ["small", "base"]);
assert.deepEqual(rr.fallbackLevels("nice"), ["nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("big"), ["big", "nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("jackpot"), ["big", "nice", "small", "base"]);

const nice = rr.resolveVariantChain("STR", "nice").map(asset => asset.path);
const big = rr.resolveVariantChain("STR", "big").map(asset => asset.path);
const jackpot = rr.resolveVariantChain("STR", "jackpot").map(asset => asset.path);
const small = rr.resolveVariantChain("STR", "small").map(asset => asset.path);
assert.ok(nice[0].includes("sterling-nice.svg"), "Sterling Nice must request sterling-nice.svg");
assert.ok(big[0].includes("sterling-big.svg"), "Sterling Big must request sterling-big.svg");
assert.deepEqual(jackpot, big, "Jackpot must use the Big fallback chain");
assert.ok(small[0].includes("sterling-small.svg"), "Small must try the future Small asset first");
assert.ok(small.at(-1).includes("sterling.svg"), "Missing Small must retain base as the final fallback");

const popupNice = app.reactions.resolveReactionAsset("STR", "nice");
const popupBig = app.reactions.resolveReactionAsset("STR", "big");
assert.ok(popupNice.path.includes("sterling-nice.svg"), "Popup and reels must share convention-based Nice resolution");
assert.ok(popupBig.path.includes("sterling-big.svg"), "Popup and reels must share convention-based Big resolution");

function fakeCell(stop, symbol = "STR") {
  return {
    dataset: { stop: String(stop), symbol },
    querySelector: () => null,
  };
}
const duplicate = fakeCell(0);
const strips = [0, 1, 2].map(reel => ({
  querySelectorAll: selector => selector.includes('data-stop="0"') ? [reel === 0 ? duplicate : fakeCell(0)] : [],
}));
const reelController = {
  getCurrentTopStops: () => [0, 0, 0],
  getReelElements: () => strips.map(strip => ({ strip })),
};
const cells = rr.participatingCells([
  { symbolKey: "STR", rows: [0, 0, 0] },
  { symbolKey: "STR", rows: [0, 0, 0] },
], reelController);
assert.equal(cells.length, 3, "Overlapping paylines must deduplicate each physical cell");
assert.deepEqual(cells.map(cell => cell.reel), [0, 1, 2]);

const state = { lineBetIndex: 0, coins: 1000, fortuneMeter: { value: 0, charged: false }, freeSpinSession: null };
for (const characterKey of app.CONFIG.characterPresentation.allMembers) {
  const lineMatch = rr.findCharacterPreviewResult("nice", characterKey, state, 5, 4);
  assert.equal(rr.visibleCharacterParticipates(lineMatch.result, characterKey), true, `${characterKey} preview must contain that visible participating character`);
  const combinationMatch = rr.findCharacterPreviewResult("combination", characterKey, state, 5, 4);
  assert.equal(rr.visibleCharacterInCombination(combinationMatch.result, characterKey), true, `${characterKey} combination preview must contain that participating character`);
}

const source = read("js/reel-reactions.js");
const engine = read("js/game-engine.js");
const index = read("index.html");
assert.match(source, /characterKey = "STR"/);
assert.match(source, /id === "STR" \? " selected"/);
assert.match(source, /visibleCharacterParticipates/);
assert.match(source, /visibleCharacterInCombination/);
assert.match(source, /cell\.dataset\.symbol/, "Visible cell symbol must govern Wild behavior");
assert.match(source, /prefers-reduced-motion/);
assert.match(source, /stopAll\(\)/);
assert.match(source, /clearWinsWithReactions/);
assert.match(source, /clearFeatureWithReactions/);
assert.match(source, /JSON\.stringify\(app\.game\.getState\(\)\) !== before/);
assert.doesNotMatch(source, /\.viewport\.style|reel-strip.*animate|cabinet.*animate|reel-frame.*animate/i);
assert.ok(index.indexOf("js/reel-reactions.js") > index.indexOf("js/reactions-free-spins-ui.js"));
assert.ok(index.indexOf("js/reel-reactions.js") < index.indexOf("js/game-engine.js"));
assert.match(engine, /await spinAnimation\(result\.allyReplay\.originalResult\)[\s\S]*await spinAnimation\(result\.allyReplay\.replacementResult\)/, "Replay presentation must resolve replacement before win marking");

console.log("Reel reaction tests: PASS");