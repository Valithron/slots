import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const allyCss = read("ally-selection.css");
const compactCss = read("ally-feature-compact.css");
const allyUi = read("js/ally-ui.js");
const compactUi = read("js/ally-feature-compact-ui.js");
const qaUi = read("js/mobile-usability-qa.js");
const engineLoader = read("js/game-engine.js");
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
], "responsive Ally selection CSS");

includesAll(compactCss, [
  ".machine.ally-feature-active",
  ".free-spins-hud[data-compact-structure=\"true\"]",
  "grid-template-columns: repeat(3, minmax(0, 1fr))",
  ".feature-label-short",
  ".fortune-meter-wrap",
  ".mystery-hud[hidden]",
  ".feature-summary-action",
  ".feature-summary-continue",
  ".machine.is-feature-summary > .controls",
  ".qa-primary-surface-open .qa-panel .qa-panel-body",
  "@media (max-height: 700px)",
  "@media (max-height: 620px)",
  "@media (orientation: landscape) and (max-height: 500px)",
], "compact Ally feature CSS");

assert.doesNotMatch(compactCss, /transform:\s*scale\([^)]*\)[^;]*;[\s\S]{0,120}\.reel/);
assert.doesNotMatch(compactCss, /\.reel-strip\s*\{/);
assert.doesNotMatch(compactCss, /backdrop-filter\s*:/);
assert.doesNotMatch(compactCss, /\.symbol-cell\s+img[\s\S]*transform/);
assert.match(compactCss, /\.machine\.ally-feature-active\s*\{[\s\S]*--cell:/);
assert.match(compactCss, /\.machine\.ally-feature-active \.controls \.spin-button[\s\S]*min-height:\s*(?:6[0-9]|7[0-9])px/);

includesAll(allyUi, [
  'role", "radiogroup"',
  'type="radio"',
  "ally-selection-detail",
  "ally-selection-footer",
  "lockBackgroundScroll",
  "unlockBackgroundScroll",
  "handleSelectionKeydown",
  "Show symbol payouts",
  "Show Commune combinations",
  "details.open = false",
  "data-fallback-src",
], "responsive Ally UI");

includesAll(compactUi, [
  "ally-feature-active",
  "Spins Left",
  "Feature Win",
  "Locked Bet",
  "#totalAwardedSpinsValue",
  "duplicate?.remove()",
  'hud.dataset.responsiveStructure = "true"',
  "normalizeAbilityStatus",
  "Mystery Spins",
  "compactMode",
  "visible = hasSpins || hasModifier",
  "summary.replaceChildren(label, chevron)",
  "Show feature details",
  "Hide feature details",
  "moveContinueIntoSummary",
  "restorePrimaryButton",
  "scrollIntoView",
  "positionedSessionId",
  "qa-primary-surface-open",
  "feature-summary-next",
  "previewActiveFeature",
  "previewCompactSummary",
  "previewExpandedFeatureDetails",
], "compact Ally feature UI");

assert.doesNotMatch(compactUi, /Math\.random|crypto\.getRandomValues/);
assert.doesNotMatch(compactUi, /commitSpinStart|queueFreeSpins|queueModifier|settlePendingSpinState/);
assert.doesNotMatch(compactUi, /CONFIG\.(reels|lineBets|paylines)\s*=/);
assert.match(compactUi, /elements\.freeSpinsHud\.hidden = true/);
assert.match(compactUi, /elements\.mysteryHud\.hidden = !visible \|\| summaryOpen/);
assert.match(compactUi, /mystery\.queuedFreeSpins > 0/);
assert.match(compactUi, /requestedTier: CONFIG\.mystery\.strongModifierPool/);

includesAll(qaUi, [
  "Active · 4 Spins",
  "Active · 12 Spins",
  "Ability Ready",
  "Ability Used",
  "Large Feature Win",
  "Large Locked Bet",
  "No Mystery Queue",
  "Modifier Only",
  "Mystery Spins Only",
  "Spins + Modifier",
  "Feature Complete",
  "Summary + Next",
  "Expanded Details",
  "Viewport Stress State",
  "Missing Portrait",
], "mobile QA extension");

assert.match(engineLoader, /js\/ally-feature-compact-ui\.js/);
assert.ok(engineLoader.indexOf("js/ally-feature-compact-ui.js") < engineLoader.indexOf("js/game-engine-core.js"));
assert.equal(packageJson.scripts["test:mobile-ui"], "node tools/mobile-ui-tests.mjs");
assert.ok(packageJson.scripts.test.includes("mobile-ui-tests.mjs"));

try {
  const changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim().split(/\r?\n/).filter(Boolean);
  const forbidden = changed.filter(file => /^(js\/(config|payouts|game-engine-core|strong-mystery-core|strong-mystery-candidate|strong-mystery-integration|strong-mystery|allies|free-spins)|tools\/simulate)/.test(file));
  assert.deepEqual(forbidden, [], `presentation PR changed math-sensitive files: ${forbidden.join(", ")}`);
} catch (error) {
  if (error instanceof assert.AssertionError) throw error;
}

console.log("Mobile UI presentation contracts passed: compact active HUD, conditional Mystery strip, summary action placement, QA collision guard, and responsive viewport contracts.");
