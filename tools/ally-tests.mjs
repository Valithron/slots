#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await import("../js/config.js");
await import("../js/combination-clarity-config.js");
await import("../js/ally-config.js");
const app = globalThis.CommuneFortune;
const { CONFIG } = app;
app.WIN_TIERS = { NONE: "none", SMALL: "small", NICE: "nice", BIG: "big", JACKPOT: "jackpot" };
app.reactions = {
  createEmptyContributionTotals: () => ({}), normalizeContributionTotals: value => value || {},
  addLineContributions: value => value || {}, calculateSessionMvp: () => null,
};
app.payouts = {
  classifyWinTier(total, bet) { if (!total) return "none"; if (total / bet >= 40) return "jackpot"; if (total / bet >= 15) return "big"; if (total / bet >= 5) return "nice"; return "small"; },
};
const FS = { INTRO: "intro", READY: "ready", SPINNING: "spinning", PRESENTING: "presenting", COMPLETE: "complete", SUMMARY: "summary" };
function clone(value) { return value == null ? value : structuredClone(value); }
app.freeSpins = {
  FREE_SPIN_STATUSES: FS,
  createFreeSpinSession(trigger) {
    return { active:true, sessionId:"session", status:FS.INTRO, lockedLineBetIndex:0, lockedLineBet:1, referenceBet:5, startingSpins:4, remainingSpins:4, completedSpins:0, totalAwardedSpins:4, retriggerCount:0, accumulatedWin:0, characterWinTotals:{}, triggerSpinId:trigger.id, triggerResult:clone(trigger), triggerTreeCells:[], presentationSpin:null, lastResult:null };
  },
  cloneSession: clone,
  applyFreeSpinSettlement(session, spin) {
    const next=clone(session); if (next.lastSettledFreeSpinId===spin.id) return {session:next,applied:false,retriggerApplied:0};
    next.completedSpins += 1; next.remainingSpins -= 1; next.accumulatedWin += spin.totalWin; next.lastSettledFreeSpinId=spin.id; next.presentationSpin=clone(spin); next.lastResult=clone(spin); next.status=FS.PRESENTING;
    return {session:next,applied:true,retriggerApplied:0};
  },
  canStartFeature: session => Boolean(session?.active && session.status===FS.INTRO && session.remainingSpins>0),
  getSessionSummary: session => ({ accumulatedWin:session.accumulatedWin, completedSpins:session.completedSpins, totalAwardedSpins:session.totalAwardedSpins, retriggerCount:session.retriggerCount }),
};
await import("../js/allies.js");

function triggerResult() { return { id:"trigger", spinType:"paid", lineBetIndex:0, lineBet:1, referenceBet:5, wager:5, freeSpinTrigger:{triggered:true,awardedSpins:4,treeCells:[]} }; }
function session(id) {
  let value=app.freeSpins.createFreeSpinSession(triggerResult());
  value=app.allies.setPendingSelection(value,id);
  value=app.allies.confirmSelection(value,id,()=>0.4);
  value=app.allies.beginFeature(value);
  return value;
}
function spin(id,totalWin,extra={}) { return { id, spinType:"free", totalWin, preModifierWin:totalWin, referenceBet:5, naturalWinTier:totalWin ? "small" : "none", lineWins:[], freeSpinTrigger:{triggered:false,retrigger:false,awardedSpins:0}, ...extra }; }

const configured = CONFIG.allyOrder;
assert.deepEqual(configured, ["sterling","ryan","cooper","cydney","gabi","kenly","ashley"]);
assert.equal(new Set(configured.map(id => CONFIG.allies[id].portrait)).size, 7);
assert.ok(configured.every(id => CONFIG.allies[id].description.length > 20));

{
  let value=app.freeSpins.createFreeSpinSession(triggerResult());
  assert.equal(app.freeSpins.canStartFeature(value), false, "selection is required");
  value=app.allies.setPendingSelection(value,"sterling");
  assert.equal(value.ally.selectedId,"sterling");
  assert.equal(value.ally.confirmed,false);
  value=app.allies.confirmSelection(value);
  assert.equal(value.ally.confirmed,true);
  value=app.allies.beginFeature(value);
  const unchanged=app.allies.setPendingSelection(value,"ryan");
  assert.equal(unchanged.ally.selectedId,"sterling", "ally cannot change after start");
}

{
  const value=app.allies.confirmSelection(app.allies.setPendingSelection(app.freeSpins.createFreeSpinSession(triggerResult()),"ryan"),"ryan",()=>0.74);
  assert.equal(value.ally.ryan.selectedSpinNumber,3);
  assert.equal(app.allies.normalizeAllyState(value.ally).ryan.selectedSpinNumber,3);
}

{
  let value=session("sterling");
  value=app.freeSpins.applyFreeSpinSettlement(value,spin("s1",0)).session;
  assert.equal(value.ally.sterling.insurancePot,1);
  value.status=FS.READY;
  value=app.freeSpins.applyFreeSpinSettlement(value,spin("s2",0)).session;
  assert.equal(value.ally.sterling.insurancePot,3);
  value.status=FS.READY; value.remainingSpins=0;
  const state={coins:100,freeSpinSession:value};
  const paid=app.allies.finalizeSession(state);
  assert.equal(paid.amount,3); assert.equal(state.coins,103); assert.equal(state.freeSpinSession.accumulatedWin,3);
  assert.equal(app.allies.finalizeSession(state).applied,false,"insurance pays once");
}

{
  let value=session("cooper");
  value=app.freeSpins.applyFreeSpinSettlement(value,spin("c1",0)).session;
  assert.equal(value.ally.cooper.currentMultiplier,1.3);
  const modified=app.allies.applySpinModifier(spin("c2",11),value);
  assert.equal(modified.totalWin,14); assert.equal(modified.allyEffect.bonus,3);
  value.status=FS.READY;
  value=app.freeSpins.applyFreeSpinSettlement(value,modified).session;
  assert.equal(value.ally.cooper.consecutiveLosses,0);
}

{
  let value=session("cydney");
  value=app.freeSpins.applyFreeSpinSettlement(value,spin("y1",10)).session;
  assert.equal(value.ally.cydney.recordedAmount,10); assert.equal(value.ally.cydney.echoBonus,4);
  value.status=FS.READY;
  value=app.freeSpins.applyFreeSpinSettlement(value,spin("y2",50)).session;
  assert.equal(value.ally.cydney.recordedAmount,10,"later win cannot replace first");
  value.remainingSpins=0; const state={coins:0,freeSpinSession:value};
  assert.equal(app.allies.finalizeSession(state).amount,4);
  assert.equal(app.allies.finalizeSession(state).amount,0);
}

{
  const value=session("kenly");
  const modified=app.allies.applySpinModifier(spin("k1",11),value);
  assert.equal(modified.totalWin,15); assert.equal(modified.allyEffect.bonus,4);
  const nice=app.allies.applySpinModifier({...spin("k2",30),naturalWinTier:"nice"},value);
  assert.equal(nice.totalWin,30);
}

{
  const value=session("ryan"); value.ally.ryan.selectedSpinNumber=1;
  const modified=app.allies.applySpinModifier(spin("r1",12),value);
  assert.equal(modified.totalWin,24); assert.equal(modified.allyEffect.multiplier,2);
  const loss=app.allies.applySpinModifier(spin("r2",0),value);
  assert.equal(loss.totalWin,0);
}

app.payouts.createSpinResult = options => {
  const marker=options.targetStops?.[0] ?? 0;
  const payout=marker===0 ? 0 : marker===1 ? 5 : marker===2 ? 10 : 20;
  return spin(options.id,payout,{ targetStops:[marker,marker,marker], createdAt:"test", naturalWinTier:payout>=25?"nice":payout?"small":"none", originalMatrix:[],resolvedMatrix:[],featureRolls:{},transformations:[],baseLineWins:[],combinationWins:[],baseLineWinTotal:payout,lineWinTotal:payout,combinationWinTotal:0,settlementStatus:"pending" });
};
app.payouts.settlePendingSpinState = state => { const pending=state.pendingSpin; if(!pending)return null; state.coins+=pending.totalWin; state.freeSpinSession=app.freeSpins.applyFreeSpinSettlement(state.freeSpinSession,pending).session; state.pendingSpin=null; return {...pending,settlementStatus:"settled"}; };
app.mystery = {
  hasQueuedFreeSpin: () => false,
  commitSpinStart: () => true,
  queueFreeSpins: () => ({ awarded: 0, capped: false }),
  getModifierLabel: modifier => modifier?.name || modifier?.id || "Mystery Modifier",
};
await import("../js/ally-payouts.js");

{
  const value=session("ashley");
  const result=app.payouts.createSpinResult({id:"a",targetStops:[0,0,0],state:{freeSpinSession:value},spinType:"free",rng:()=>0.1});
  assert.equal(result.allyReplay.type,"ashley"); assert.equal(result.totalWin,10); assert.equal(result.id,"a");
  assert.equal(result.allyReplay.originalResult.totalWin,0); assert.equal(result.allyReplay.replacementResult.totalWin,10);
}
{
  const value=session("gabi");
  const result=app.payouts.createSpinResult({id:"g",targetStops:[1,1,1],state:{freeSpinSession:value},spinType:"free",rng:()=>0.1});
  assert.equal(result.allyReplay.type,"gabi"); assert.equal(result.totalWin,10); assert.equal(result.allyReplay.selected,"replacement");
}

const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
app.persistence={
  normalizePendingSpin:value=>value||null, normalizeFortuneMeter:value=>value||{value:0,charged:false},
  normalizeFreeSpinSession:value=>value?{...value}:null,
  defaultState:()=>({schemaVersion:5,coins:1000,lineBetIndex:0,sound:true,lastWin:0,gamePhase:"idle",pendingSpin:null,fortuneMeter:{value:0,charged:false},freeSpinSession:null}),
  loadState(){ const raw=JSON.parse(storage.get(app.constants.storageKey)||"null"); return raw||this.defaultState(); },
  saveState(){ return true; },
};
await import("../js/ally-persistence.js");
{
  const value=session("gabi"); value.ally.gabi.used=true;
  const saved={schemaVersion:CONFIG.schemaVersion,coins:88,lineBetIndex:0,sound:true,lastWin:0,gamePhase:"bonus",pendingSpin:null,fortuneMeter:{value:0,charged:false},freeSpinSession:value};
  assert.equal(app.persistence.saveState(saved),true);
  const loaded=app.persistence.loadState();
  assert.equal(loaded.freeSpinSession.ally.selectedId,"gabi"); assert.equal(loaded.freeSpinSession.ally.gabi.used,true);
}
{
  const legacy=session("ashley"); delete legacy.ally;
  storage.set(app.constants.storageKey,JSON.stringify({coins:10,lineBetIndex:0,sound:true,lastWin:0,gamePhase:"free-spins",pendingSpin:null,fortuneMeter:{value:0,charged:false},freeSpinSession:legacy}));
  const loaded=app.persistence.loadState();
  assert.equal(loaded.freeSpinSession.ally.legacyNoAlly,true); assert.equal(loaded.freeSpinSession.ally.selectedId,null);
}

const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"ally-selection.css"),"utf8");
const engine=fs.readFileSync(path.join(root,"js/game-engine.js"),"utf8");
for (const id of ["allySelectionLayer","allyConfirmButton","allyHud","allyCalloutLayer"]) assert.ok(index.includes(id));
assert.ok(index.indexOf("js/ally-config.js") < index.indexOf("js/allies.js"));
assert.ok(index.indexOf("js/ally-payouts.js") < index.indexOf("js/game-engine.js"));
assert.ok(css.includes("prefers-reduced-motion"));
assert.ok(!/\.machine[^}]*transform\s*:/s.test(css),"ally CSS must not move cabinet");
assert.ok(engine.includes("state.pendingSpin = result; currentResult = result; save(); render(); await animateAuthoritativeFreeResult(result)"),"authoritative result must save before replay animation");
assert.ok(engine.includes("app.allies.confirmSelection"));
assert.ok(engine.includes("app.allies.beginFeature"));
assert.ok(engine.includes('event.target?.closest?.("button, input, select, textarea, a[href]")'), "native keyboard controls must not be intercepted");
assert.ok(engine.includes("preSpin: true"), "Ryan reveal must not expose the predetermined payout");

console.log("Choose Your Ally deterministic tests: PASS (selection, seven abilities, replay coherence, persistence, recovery contracts, and mobile-safe source guards)");
