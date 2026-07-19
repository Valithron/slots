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
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const failedPatterns = new Set();
const delayedPatterns = new Set();
class LoaderImage {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.complete = false;
    this.naturalWidth = 0;
    this._src = "";
  }
  set src(value) {
    this._src = value;
    const settle = () => {
      const fails = [...failedPatterns].some(pattern => value.includes(pattern));
      if (fails) this.onerror?.(new Error(`failed ${value}`));
      else {
        this.complete = true;
        this.naturalWidth = 1024;
        this.onload?.();
      }
    };
    if ([...delayedPatterns].some(pattern => value.includes(pattern))) setTimeout(settle, 8);
    else queueMicrotask(settle);
  }
  get src() { return this._src; }
  async decode() {}
}

class FakeDisplayedImage {
  constructor(src) {
    this.attrs = new Map([["src", src], ["alt", ""]]);
    this.dataset = {};
    this.currentSrc = src;
    this.isConnected = true;
    this.invalidAssignments = [];
  }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) {
    if (name === "src") {
      const next = String(value);
      if (!next || next.includes("undefined") || next.includes("null")) this.invalidAssignments.push(next);
      this.currentSrc = next;
    }
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) { this.attrs.delete(name); }
}

class FakeCell {
  constructor(stop, symbol, image, { centerTree = false } = {}) {
    this.dataset = { stop: String(stop), copy: "2", symbol };
    this.image = image;
    this.classList = { contains: name => centerTree && name === "is-center-tree" };
  }
  querySelector(selector) { return selector === "img" ? this.image : null; }
}

function createBoard(symbols = ["STR", "STR", "STR"], options = {}) {
  const cells = symbols.map((symbol, reel) => {
    const src = `assets/symbols/${symbol.toLowerCase()}.svg?v=portraits-v6`;
    return new FakeCell(0, symbol, new FakeDisplayedImage(src), options[reel]);
  });
  const strips = cells.map(cell => ({
    querySelector: selector => selector.includes('data-stop="0"') && selector.includes('data-copy="2"') ? cell : null,
  }));
  return {
    cells,
    reelController: {
      getCurrentTopStops: () => [0, 0, 0],
      getReelElements: () => strips.map(strip => ({ strip })),
    },
  };
}

const baseUi = {
  markWins() {},
  markCombination() {},
  clearWins() {},
  clearFeaturePresentation() {},
  showReaction() { return true; },
  hideReaction() {},
  elements: { reactionRoster: { querySelectorAll: () => [] } },
};

globalThis.location = { search: "" };
globalThis.document = { querySelector: () => null };
globalThis.matchMedia = () => ({ matches: true });
globalThis.Image = LoaderImage;
globalThis.CommuneFortune = {};
load("js/config.js");
load("js/reactions.js");
const app = globalThis.CommuneFortune;
app.qa = { enabled: false };
app.ui = { createUI: () => ({ ...baseUi }) };
app.reels = { createReelController: () => ({}) };
load("js/reel-reactions.js");

const rr = app.reelReactions;
const ui = app.ui.createUI();
assert.equal(rr.BASE_MS, 450);
assert.equal(rr.REACTION_MS, 650);
assert.equal(app.CONFIG.characterPresentation.assetVersion, "portraits-v6");
assert.deepEqual(rr.fallbackLevels("small"), ["small", "base"]);
assert.deepEqual(rr.fallbackLevels("nice"), ["nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("big"), ["big", "nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("jackpot"), ["big", "nice", "small", "base"]);
assert.deepEqual(rr.fallbackLevels("combination"), ["nice", "small", "base"]);

for (const characterKey of app.CONFIG.characterPresentation.allMembers) {
  const character = app.CONFIG.characterPresentation.characters[characterKey];
  assert.ok(character.small, `${character.name} must explicitly map a Small Win portrait`);
  assert.ok(fs.statSync(new URL(`../${character.small}`, import.meta.url)).size > 1000, `${character.name} Small Win portrait must not be empty`);
  assert.match(readPrefix(character.small), /<svg\b/i, `${character.name} Small Win portrait must be an SVG`);
}

const cydneyNice = rr.resolveVariantChain("CYD", "nice").map(asset => asset.path);
const cydneyBig = rr.resolveVariantChain("CYD", "big").map(asset => asset.path);
assert.ok(cydneyNice[0].includes("cydney-nice.svg"));
assert.ok(cydneyBig[0].includes("cydney-big.svg"));
assert.ok(cydneyNice.every(path => path.includes("v=portraits-v6")));
assert.ok(fs.statSync(new URL("../assets/symbols/cydney-nice.svg", import.meta.url)).size > 1000);
assert.ok(fs.statSync(new URL("../assets/symbols/cydney-big.svg", import.meta.url)).size > 1000);

const ryanNice = rr.resolveVariantChain("RYN", "nice").map(asset => asset.path);
const ryanBig = rr.resolveVariantChain("RYN", "big").map(asset => asset.path);
assert.match(ryanNice[0], /ryan-nice\.svg/);
assert.match(ryanNice[1], /ryan-small\.svg/);
assert.match(ryanNice.at(-1), /ryan\.svg/);
assert.match(ryanBig[0], /ryan-big\.svg/);
assert.match(ryanBig[1], /ryan-nice\.svg/);
assert.match(ryanBig[2], /ryan-small\.svg/);
assert.match(ryanBig.at(-1), /ryan\.svg/);

failedPatterns.add("ryan-big.svg");
failedPatterns.add("ryan-nice.svg");
assert.match(await rr.resolveLoadedReactionAsset("RYN", "big"), /ryan-small\.svg/);
failedPatterns.add("gabi-big.svg");
failedPatterns.add("gabi-nice.svg");
failedPatterns.add("gabi-small.svg");
assert.match(await rr.resolveLoadedReactionAsset("GAB", "big"), /gabi\.svg/);

const combinationCells = rr.combinationWins({
  symbols: ["CYD", "STR", "TOL"],
  cells: [{ row: 1, reel: 0 }, { row: 1, reel: 1 }, { row: 1, reel: 2 }],
});
assert.deepEqual(combinationCells.map(cell => cell.symbolKey), ["CYD", "STR", "TOL"]);
assert.equal(combinationCells[0].rows[0], 1);
assert.equal(combinationCells[1].rows[1], 1);
assert.equal(combinationCells[2].rows[2], 1);

const duplicateBoard = createBoard();
const deduplicated = rr.participatingCells([
  { symbolKey: "STR", rows: [0, 0, 0] },
  { symbolKey: "STR", rows: [0, 0, 0] },
], duplicateBoard.reelController);
assert.equal(deduplicated.length, 3, "Overlapping paylines must deduplicate visible physical cells");

const filteredBoard = createBoard(["TOL", "MYS", "CYD"], { 2: { centerTree: true } });
assert.equal(rr.participatingCells([
  { symbolKey: "TOL", rows: [0, null, null] },
  { symbolKey: "MYS", rows: [null, 0, null] },
  { symbolKey: "CYD", rows: [null, null, 0] },
], filteredBoard.reelController).length, 0, "Tree, Scatter, and Center Tree cells must not enter the portrait reaction path");

const cydneyBoard = createBoard(["CYD", "CYD", "CYD"]);
rr.start([{ symbolKey: "CYD", rows: [0, 0, 0] }], cydneyBoard.reelController, "big");
await flush();
assert.equal(rr.activeCount(), 3);
for (const cell of cydneyBoard.cells) {
  assert.match(cell.image.getAttribute("src"), /cydney-big\.svg/);
  assert.deepEqual(cell.image.invalidAssignments, []);
}

ui.hideReaction();
assert.equal(rr.activeCount(), 3, "Closing the popup must not clear persistent reel reactions");
ui.clearWins();
assert.equal(rr.activeCount(), 0, "The next reel reset must clear persistent reactions");
for (const cell of cydneyBoard.cells) assert.match(cell.image.getAttribute("src"), /cyd\.svg|cydney\.svg/i);

const mixedBoard = createBoard(["RYN", "CYD", "CYD"]);
rr.resolvedAssetCache.delete("RYN:big");
rr.start([
  { symbolKey: "RYN", rows: [0, null, null] },
  { symbolKey: "CYD", rows: [null, 0, 0] },
], mixedBoard.reelController, "big");
await flush();
assert.match(mixedBoard.cells[0].image.getAttribute("src"), /ryn\.svg|ryan-small\.svg|ryan\.svg/i, "A failed variant must resolve to a known-good visible source");
assert.match(mixedBoard.cells[1].image.getAttribute("src"), /cydney-big\.svg/);
assert.match(mixedBoard.cells[2].image.getAttribute("src"), /cydney-big\.svg/);
assert.deepEqual(mixedBoard.cells.flatMap(cell => cell.image.invalidAssignments), []);
rr.stopAll();

const staleBoard = createBoard(["CYD", "CYD", "CYD"]);
delayedPatterns.add("cydney-nice.svg");
rr.resolvedAssetCache.delete("CYD:nice");
rr.start([{ symbolKey: "CYD", rows: [0, 0, 0] }], staleBoard.reelController, "nice");
rr.stopAll();
await new Promise(resolve => setTimeout(resolve, 15));
for (const cell of staleBoard.cells) assert.doesNotMatch(cell.image.getAttribute("src"), /cydney-nice\.svg/, "A stale async load must not overwrite the next-spin reset");
delayedPatterns.delete("cydney-nice.svg");

for (let cycle = 0; cycle < 125; cycle += 1) {
  const board = createBoard(cycle % 2 ? ["CYD", "RYN", "STR"] : ["STR", "CYD", "RYN"]);
  rr.start([{ symbolKey: "STR", rows: [0, 0, 0] }], board.reelController, cycle % 3 === 0 ? "big" : cycle % 3 === 1 ? "nice" : "small");
  rr.stopAll();
  for (const cell of board.cells) {
    const src = cell.image.getAttribute("src");
    assert.ok(src && !src.includes("undefined") && !src.includes("null"));
    assert.deepEqual(cell.image.invalidAssignments, []);
  }
}

assert.deepEqual(rr.PREVIEW_ROWS.small, [[1, 1, 1]]);
assert.equal(rr.PREVIEW_ROWS.nice.length, 2);
assert.equal(rr.PREVIEW_ROWS.big.length, 3);
assert.equal(rr.PREVIEW_ROWS.jackpot.length, 5);
assert.deepEqual(rr.PREVIEW_ROWS.combination, [[1, 1, 1]]);

const source = read("js/reel-reactions.js");
const engine = read("js/game-engine.js");
const index = read("index.html");
assert.match(source, /resolveLoadedReactionAsset/);
assert.match(source, /failedAssetUrls/);
assert.match(source, /generation !== localGeneration/);
assert.match(source, /pendingCombinationWins\.length \? "nice" : tier|combination\.length \? "nice" : tier/);
assert.match(source, /tier === "combination" \? "nice" : tier/);
assert.doesNotMatch(source, /clearFeatureWithReactions/);
assert.match(source, /JSON\.stringify\(app\.game\.getState\(\)\) !== before/);
assert.doesNotMatch(source, /\.viewport\.style|reel-strip.*animate|cabinet.*animate|reel-frame.*animate/i);
assert.ok(index.indexOf("js/reel-reactions.js") > index.indexOf("js/reactions-free-spins-ui.js"));
assert.ok(index.indexOf("js/reel-reactions.js") < index.indexOf("js/game-engine.js"));
assert.match(engine, /const done = settle\(\);[\s\S]*await presentMysteryCallouts\(done\); await presentResult\(done\)/);
assert.doesNotMatch(engine, /markWins\(rescue\.originalResult|presentResult\(rescue\.originalResult/);

console.log("Reel reaction tests: PASS");
