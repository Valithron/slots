import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const help = read("js/help-accordion.js");
const inlineGuard = read("js/help-combo-inline.js");
const loader = read("js/game-engine.js");

assert.match(help, /"commune-combos"[\s\S]*?<div class="combination-reference" id="combinationReference"><\/div>/);
assert.doesNotMatch(help, /"commune-combos"[\s\S]*?<details[\s>]/);
assert.match(inlineGuard, /\[data-help-section="commune-combos"\]/);
assert.match(inlineGuard, /querySelectorAll\("\.combination-disclosure"\)/);
assert.match(inlineGuard, /disclosure\.replaceWith\(reference\)/);
assert.match(inlineGuard, /reference\.hidden = false/);
assert.ok(loader.indexOf("js/help-combo-inline.js") > loader.indexOf("js/game-engine-core.js"));

console.log("Commune Combo help contracts passed: the full reference is visible directly inside its accordion panel with no nested disclosure.");
