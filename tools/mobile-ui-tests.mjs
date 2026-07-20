import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const allyCss = read("ally-selection.css");
const allyUi = read("js/ally-ui.js");
const qaUi = read("js/mobile-usability-qa.js");
const packageJson = JSON.parse(read("package.json"));

function includesAll(source, values, label) {
  values.forEach(value => assert.ok(source.includes(value), `${label} must include ${value}`));
}

includesAll(allyCss, [
  "100dvh",
  "env(safe-area-inset-top)",
  "env(safe-area-inset-bottom)",
  "grid-template-rows: auto minmax(0, 1fr) auto",
  ".ally-selection-scroll",
  "overflow-y: auto",
  "overscroll-behavior: contain",
  ".ally-confirm-button.spin-button",
  "height: 52px",
  "@media (max-width: 359px)",
  "@media (orientation: landscape) and (max-height: 500px)",
], "responsive Ally CSS");

assert.match(allyCss, /\.ally-selection-layer[\s\S]*position:\s*fixed/);
assert.match(allyCss, /\.ally-selection-panel[\s\S]*overflow:\s*hidden/);
assert.match(allyCss, /\.ally-selection-scroll[\s\S]*overflow-y:\s*auto/);
assert.doesNotMatch(allyCss, /\.reel-strip\s*\{/);
assert.doesNotMatch(allyCss, /backdrop-filter\s*:/);
assert.doesNotMatch(allyCss, /\.symbol-cell\s+img[\s\S]*transform/);

includesAll(allyUi, [
  'role", "radiogroup"',
  'type="radio"',
  "ally-selection-detail",
  "ally-selection-footer",
  "lockBackgroundScroll",
  "unlockBackgroundScroll",
  "handleSelectionKeydown",
  "lastFocusedBeforeSelection",
  "Show symbol payouts",
  "Hide symbol payouts",
  "Show Commune combinations",
  "Hide Commune combinations",
  "details.open = false",
  "Total Awarded",
  "Show feature details",
  "Hide feature details",
  "Start with",
  "data-fallback-src",
], "responsive Ally UI");

assert.doesNotMatch(allyUi, /ally-card-copy[\s\S]{0,300}<small>/);
assert.doesNotMatch(allyUi, /Math\.random|crypto\.getRandomValues/);
assert.doesNotMatch(allyUi, /CONFIG\.(reels|lineBets|payouts)\s*=/);

includesAll(qaUi, [
  "Open Ally Sheet",
  "Large Feature HUD",
  "Feature Summary",
  "Open Payouts",
  "Stacked Labels",
  "Missing Portrait",
  "app?.mobileUsabilityQA",
], "mobile QA extension");

assert.equal(packageJson.scripts["test:mobile-ui"], "node tools/mobile-ui-tests.mjs");
assert.ok(packageJson.scripts.test.includes("mobile-ui-tests.mjs"));

try {
  const changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim().split(/\r?\n/).filter(Boolean);
  const forbidden = changed.filter(file => /^(js\/(config|payouts|game-engine-core|game-engine|strong-mystery|mystery|allies|free-spins)|tools\/simulate)/.test(file));
  assert.deepEqual(forbidden, [], `presentation PR changed math-sensitive files: ${forbidden.join(", ")}`);
} catch (error) {
  if (error instanceof assert.AssertionError) throw error;
}

console.log("Mobile UI presentation contracts passed.");
