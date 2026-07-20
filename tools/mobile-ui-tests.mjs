import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const allyCss = read("ally-selection.css");
const compactCss = read("ally-feature-compact.css");
const qaCss = read("qa-mode.css");
const helpCss = read("help-accordion.css");
const allyUi = read("js/ally-ui.js");
const allyConfig = read("js/ally-config.js");
const compactUi = read("js/ally-feature-compact-ui.js");
const qaUi = read("js/mobile-usability-qa.js");
const helpUi = read("js/help-accordion.js");
const qaAudioUi = read("js/qa-audio-positioning.js");
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
  "session.status === FS.READY",
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

includesAll(qaCss, [
  "#audioQaStatus",
  "left: max(12px, env(safe-area-inset-left)) !important",
  "right: auto !important",
  "bottom: max(12px, env(safe-area-inset-bottom)) !important",
  "transform-origin: bottom left",
  "#audioQaStatus:not([open])",
  "width: max-content !important",
  "max-width: 112px",
], "QA Audio Status positioning");

includesAll(qaAudioUi, [
  "qa=(?:ally|audio)",
  "audioQaStatus",
  ".qa-panel",
  'audioPanel.addEventListener("toggle", collapsePrimaryPanel)',
  'qaPanel.classList.add("is-collapsed")',
  "audioPanel.open = false",
  "MutationObserver",
], "QA Audio Status collision guard");

for (const width of [320, 375, 390, 430]) {
  const audioCollapsedRightEdge = 12 + 112;
  const primaryQaBadgeLeftEdge = width - 8 - 96;
  assert.ok(audioCollapsedRightEdge < primaryQaBadgeLeftEdge, `collapsed QA modules must not overlap at ${width}px`);
}

const expectedHelpSections = [
  "Quick Start",
  "Special Symbols",
  "Fortune Meter",
  "Fortune’s Favor",
  "Wins and Presentations",
  "Saving and Play Coins",
  "Commune Combos",
  "Ally Abilities",
  "Mystery Modifiers",
];
let previousSectionIndex = -1;
for (const title of expectedHelpSections) {
  const currentIndex = helpUi.indexOf(`title: "${title}"`);
  assert.ok(currentIndex > previousSectionIndex, `${title} must appear in approved accordion order`);
  previousSectionIndex = currentIndex;
}
assert.equal((helpUi.match(/\{ id: "[^"]+", title: "/g) || []).length, 9, "How to Play must contain nine accordion sections");

includesAll(helpUi, [
  'const DEFAULT_SECTION_ID = "quick-start"',
  "section.id === DEFAULT_SECTION_ID",
  "setOpenSection(DEFAULT_SECTION_ID)",
  "resetAccordion();",
  'button.type = "button"',
  'button.setAttribute("aria-expanded"',
  'button.setAttribute("aria-controls"',
  'panel.setAttribute("role", "region")',
  'panel.setAttribute("aria-labelledby"',
  'event.key === "ArrowDown"',
  'event.key === "ArrowUp"',
  'event.key === "Home"',
  'event.key === "End"',
  "trapModalFocus",
  "returnFocus",
  'visualLabel.replaceChildren(document.createTextNode("Visual Effects"))',
  "header.append(visualEffectsSetting)",
  "modal.replaceChildren(header, accordion, actions)",
  'document.body.classList.add("help-modal-open")',
  'document.body.classList.remove("help-modal-open")',
], "accessible How to Play accordion");

assert.ok(helpUi.indexOf("header.append(visualEffectsSetting)") < helpUi.indexOf("modal.replaceChildren(header, accordion, actions)"), "Visual Effects selector must remain above the accordion");
assert.doesNotMatch(helpUi, /Auto follows your device setting|Full uses the strongest stable effects/);
assert.doesNotMatch(helpUi, /<details|<\/details>/);
assert.doesNotMatch(helpUi, /help-accordion-button[^`]{0,180}(?:Show|Hide)/);

includesAll(helpCss, [
  "max-height: min(88dvh, 820px)",
  "overflow-y: auto",
  "overflow-x: hidden",
  ".help-accordion-panel",
  "overflow: visible",
  "min-height: 44px",
  '.help-accordion-button[aria-expanded="true"] .help-accordion-chevron',
  "position: sticky",
  "@media (max-width: 430px)",
  "overflow-wrap: anywhere",
], "How to Play presentation CSS");
assert.doesNotMatch(helpCss, /\.help-accordion-panel\s*\{[^}]*overflow(?:-y)?:\s*(?:auto|scroll)/s);
assert.doesNotMatch(helpCss, /\.help-accordion-panel\s*\{[^}]*max-height:/s);

for (const width of [320, 375, 390, 430]) {
  const horizontalBackdropPadding = 16;
  const availableModalWidth = width - horizontalBackdropPadding;
  assert.ok(availableModalWidth > 0 && availableModalWidth <= width, `Help modal must remain within ${width}px viewport`);
}

includesAll(helpUi, [
  "CONFIG.combinations.definitions",
  "definition.sequence",
  "definition.multiplier",
  "full.requiredCharacters",
  '[...full.requiredCharacters, "TOL"]',
  "CONFIG.allyOrder",
  "CONFIG.allies[id]",
  "definition.portrait",
  "definition.abilityName",
  "CONFIG.mystery.normalModifierPool",
  "app.mystery?.MODIFIER_NAMES",
  "app.strongMystery?.ids",
  "app.strongMystery?.names",
  "CONFIG.mystery.strong",
], "configuration-backed Help content");

includesAll(allyConfig, [
  '"No Whammys"',
  '"I’m Listening"',
  '"Big Win"',
  '"Eww"',
  '"Rage-Bait"',
  '"Big Lemons"',
  '"Fastball"',
], "central Ally configuration");

includesAll(helpUi, [
  'sterling: "Each losing spin builds an Insurance Pot.',
  'cydney: `Cydney remembers the first winning spin',
  'ryan: `One of the first ${numberWord',
  'gabi: `Gabi replays the first weak win below',
  'cooper: `Consecutive losses build Rage.',
  'kenly: `Every natural Small Win receives',
  'ashley: "Ashley replays the first losing spin once.',
  'spotlight: "Boosts line wins',
  '"center-tree": "Turns the center cell',
  '"double-commune": "Boosts named Commune Combo awards.',
  '"rescue-spin": "Rerolls a truly blank result.',
  '"fortune-burst": "Adds extra Fortune after the spin.',
  '"golden-payline": values =>',
  '"fortune-flood": values =>',
  '"scatter-magnet": values =>',
  '"commune-gathering": values =>',
  '"sevenfold-fortune": values =>',
  '"full-fortune": values =>',
  '"commune-chaos": values =>',
], "approved Ally and Mystery reference copy");

assert.doesNotMatch(helpUi, /commitSpinStart|consumeSpinOverride|settlePendingSpinState|queueFreeSpins|Math\.random|crypto\.getRandomValues/);
assert.doesNotMatch(helpUi, /CONFIG\.(reels|lineBets|paylines|fortuneMeter|allies|mystery)\s*=/);

assert.match(engineLoader, /js\/ally-feature-compact-ui\.js/);
assert.match(engineLoader, /js\/help-accordion\.js/);
assert.match(engineLoader, /js\/qa-audio-positioning\.js/);
assert.ok(engineLoader.indexOf("js/ally-feature-compact-ui.js") < engineLoader.indexOf("js/help-accordion.js"));
assert.ok(engineLoader.indexOf("js/help-accordion.js") < engineLoader.indexOf("js/game-engine-core.js"));
assert.ok(engineLoader.indexOf("js/qa-audio-positioning.js") < engineLoader.indexOf("js/game-engine-core.js"));
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

console.log("Mobile UI presentation contracts passed: compact Ally HUD, left-edge QA audio guard, accessible Help accordion, configuration-backed references, and responsive viewport contracts.");