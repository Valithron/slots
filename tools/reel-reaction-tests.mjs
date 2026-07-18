import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const load = path => vm.runInThisContext(read(path), { filename: path });
const readPrefix = (path, length = 256) => {
  const file = fs.openSync(new URL(`../${path}`, import.meta.url), "r");
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(file, buffer, 0, length, 0);
  fs.closeSync(file);
  return buffer.toString("utf8", 0, bytesRead);
};

globalThis.location = { search: "" };
globalThis.document = { querySelector: () => null };
globalThis.matchMedia = () => ({ matches: false });
globalThis.CommuneFortune = {};
load("js/config.js");
load("js/reactions.js");
const app = globalThis.CommuneFortune;
app.qa = { enabled: false };
app.ui = { createUI: () => ({ markWins() {}, clearWins() {}, clearFeaturePresentation() {} }) };
app.reels = { createReelController: () => ({}) };
load("js/reel-reactions.js");

const rr = app.reelReactions;
assert.equal(rr.BASE_MS, 450);
assert.equal(rr.REACTION_MS, 650);
assert.equal(app.CONFIG.characterPresentation.assetVersion, "portraits-v5");
assert.deepEqual(rr.fallbackLevels("small"), ["small", "base"]);
assert.deepEqual(rr.fallbackLevels("nice"), ["nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("big"), ["big", "nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("jackpot"), ["big", "nice", "small", "base"]);

for (const characterKey of app.CONFIG.characterPresentation.allMembers) {
  const character = app.CONFIG.characterPresentation.characters[characterKey];
  assert.ok(character.small, `${character.name} must explicitly map a Small Win portrait`);
  assert.ok(fs.statSync(new URL(`../${character.small}`, import.meta.url)).size > 1000, `${character.name} Small Win portrait must not be empty`);
  assert.match(readPrefix(character.small), /<svg\b/i, `${character.name} Small Win portrait must be an SVG`);
  const small = rr.resolveVariantChain(characterKey, "small").map(asset => asset.path);
  assert.ok(small[0].includes(character.small), `${character.name} Small Win must resolve its mapped portrait first`);
  assert.ok(small[0].includes("v=portraits-v5"), `${character.name} Small Win must use the refreshed asset version`);
}

const nice = rr.resolveVariantChain("STR", "nice").map(asset => asset.path);
const big = rr.resolveVariantChain("STR", "big").map(asset => asset.path);
const jackpot = rr.resolveVariantChain("STR", "jackpot").map(asset => asset.path);
assert.ok(nice[0].includes("sterling-nice.svg"));
assert.ok(big[0].includes("sterling-big.svg"));
assert.deepEqual(jackpot, big);

const combinationCells = rr.combinationWins({
  symbols: ["CYD", "STR", "TOL"],
  cells: [{ row: 1, reel: 0 }, { row: 1, reel: 1 }, { row: 1, reel: 2 }],
});
assert.deepEqual(combinationCells.map(cell => cell.symbolKey), ["CYD", "STR", "TOL"]);
assert.equal(combinationCells[0].rows[0], 1);
assert.equal(combinationCells[1].rows[1], 1);
assert.equal(combinationCells[2].rows[2], 1);

function fakeCell(stop, copy = app.CONFIG.reelAnimation.baseCopy, symbol = "STR") {
  return { dataset: { stop: String(stop), copy: String(copy), symbol }, querySelector: () => null };
}
const strips = [0, 1, 2].map(() => ({
  querySelector: selector => selector.includes('data-stop="0"') && selector.includes(`data-copy="${app.CONFIG.reelAnimation.baseCopy}"`) ? fakeCell(0) : null,
}));
const reelController = {
  getCurrentTopStops: () => [0, 0, 0],
  getReelElements: () => strips.map(strip => ({ strip })),
};
const cells = rr.participatingCells([
  { symbolKey: "STR", rows: [0, 0, 0] },
  { symbolKey: "STR", rows: [0, 0, 0] },
], reelController);
assert.equal(cells.length, 3, "Overlapping paylines must deduplicate visible physical cells");

assert.deepEqual(rr.PREVIEW_ROWS.small, [[1, 1, 1]]);
assert.equal(rr.PREVIEW_ROWS.nice.length, 2);
assert.equal(rr.PREVIEW_ROWS.big.length, 3);
assert.equal(rr.PREVIEW_ROWS.jackpot.length, 5);
assert.deepEqual(rr.PREVIEW_ROWS.combination, [[1, 1, 1]]);

const source = read("js/reel-reactions.js");
const engine = read("js/game-engine.js");
const index = read("index.html");
assert.match(source, /data-copy/);
assert.match(source, /forceMotion: true/);
assert.match(source, /spinTo\(\[0, 0, 0\]/);
assert.match(source, /PREVIEW_ROWS/);
assert.doesNotMatch(source, /findCharacterPreviewResult/);
assert.match(source, /prefers-reduced-motion/);
assert.match(source, /configuredVariantPath/);
assert.match(source, /pendingCombinationWins\.length \? "small" : tier/);
assert.match(source, /tier === "combination" \? "small" : tier/);
assert.match(source, /clearWinsWithReactions/);
assert.match(source, /clearFeatureWithReactions/);
assert.match(source, /JSON\.stringify\(app\.game\.getState\(\)\) !== before/);
assert.doesNotMatch(source, /\.viewport\.style|reel-strip.*animate|cabinet.*animate|reel-frame.*animate/i);
assert.ok(index.indexOf("js/reel-reactions.js") > index.indexOf("js/reactions-free-spins-ui.js"));
assert.ok(index.indexOf("js/reel-reactions.js") < index.indexOf("js/game-engine.js"));
assert.match(engine, /await spinAnimation\(result\.allyReplay\.originalResult\)[\s\S]*await spinAnimation\(result\.allyReplay\.replacementResult\)/);

console.log("Reel reaction tests: PASS");