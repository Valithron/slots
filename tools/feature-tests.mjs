#!/usr/bin/env node
import assert from "node:assert/strict";
const store = new Map();
globalThis.localStorage = { getItem:k=>store.get(k)??null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k), clear:()=>store.clear() };
await import("../js/config.js");
await import("../js/reactions.js");
await import("../js/free-spins.js");
await import("../js/payouts.js");
await import("../js/game-flow.js");
await import("../js/persistence.js");
await import("../js/statistics.js");
const app=globalThis.CommuneFortune;
const {CONFIG,payouts,reactions,freeSpins,persistence,statistics}=app;
const state=(o={})=>({coins:1000,lineBetIndex:0,fortuneMeter:{value:0,charged:false},freeSpinSession:null,pendingSpin:null,lastWin:0,...o});
const flags=o=>({...CONFIG.features,...o});
const make=(stops,o={})=>payouts.createSpinResult({targetStops:stops,state:o.state||state(),id:o.id||"t",createdAt:"test",featureFlags:o.flags||flags({}),featureRolls:{expandingWild:{roll:o.roll??1}},spinType:o.spinType||"paid",referenceBet:o.referenceBet,totalAwardedSpins:o.totalAwardedSpins||0});
function find(test){for(let a=0;a<24;a++)for(let b=0;b<24;b++)for(let c=0;c<24;c++)for(let roll=0;roll<4;roll++){const r=make([a,b,c],{roll});if(test(r))return {r,stops:[a,b,c],roll};}throw Error("no outcome");}
const trigger=()=>{const f=find(r=>r.freeSpinTrigger.triggered);return make(f.stops,{roll:f.roll,id:"trigger"});};

function manifest(){
 assert.deepEqual(reactions.CHARACTER_KEYS,["STR","CYD","RYN","GAB","COP","KEN","ASH"]);
 reactions.CHARACTER_KEYS.forEach(k=>{const a=reactions.resolveReactionAsset(k,"base");assert.equal(a.source,"base");assert.match(a.path,/\?v=/);});
 assert.equal(reactions.versionAssetUrl("a.svg?x=1#x","v 2"),"a.svg?x=1&v=v%202#x");
 assert.equal(reactions.resolveReactionAsset("STR","nice").source,"base");
 assert.equal(reactions.resolveReactionAsset("BAD","big").source,"generic");
}
function reactionSelection(){
 const unique=reactions.selectReaction({totalWin:25,winTier:"nice",lineWins:[{symbolKey:"STR",payout:25}],combinationWins:[]});assert.deepEqual(unique.characterKeys,["STR"]);
 const tie=reactions.selectReaction({totalWin:20,winTier:"small",lineWins:[{symbolKey:"STR",payout:10},{symbolKey:"RYN",payout:10}],combinationWins:[]});assert.deepEqual(tie.characterKeys,["STR","RYN"]);
 const tree=reactions.selectReaction({totalWin:60,winTier:"big",lineWins:[{symbolKey:"TOL",payout:60}],combinationWins:[]});assert.equal(tree.type,"tree");
 CONFIG.combinations.definitions.forEach(d=>{const r=reactions.selectReaction({totalWin:10,winTier:"small",lineWins:[],combinationWins:[{...d,symbols:d.sequence}]});assert.deepEqual(r.characterKeys,CONFIG.characterPresentation.combinationMembers[d.id]);});
 const full=reactions.selectReaction({totalWin:25,winTier:"nice",lineWins:[],combinationWins:[{id:"full-commune",name:"Full Commune",symbols:[...CONFIG.characterPresentation.allMembers,"TOL"]}]});assert.deepEqual(full.characterKeys,CONFIG.characterPresentation.allMembers);
 const jackpot=reactions.selectReaction({totalWin:200,winTier:"jackpot",lineWins:[{symbolKey:"STR",payout:200}],combinationWins:[]});assert.equal(jackpot.includesTree,true);assert.equal(jackpot.characterKeys.length,7);
 const compact=reactions.selectReaction({totalWin:30,winTier:"nice",lineWins:[{symbolKey:"CYD",payout:30}],combinationWins:[]},{compact:true,reducedMotion:true});assert.equal(compact.compact,true);assert.match(reactions.createReactionPresentationModel(compact).accessibleLabel,/Cydney/);
 assert.equal(reactions.selectReaction({totalWin:30,winTier:"nice",lineWins:[],combinationWins:[]},{enabled:false}),null);
}
function mvp(){
 assert.equal(reactions.calculateSessionMvp({STR:40,CYD:20},{accumulatedWin:60}).reason,"unique-mvp");
 assert.equal(reactions.calculateSessionMvp({STR:40,CYD:40},{accumulatedWin:80}).reason,"tied-mvp");
 assert.equal(reactions.calculateSessionMvp({TOL:60,STR:20},{accumulatedWin:80}).reason,"tree-mvp");
 assert.equal(reactions.calculateSessionMvp({},{accumulatedWin:0}).reason,"zero-win-summary");
}
function triggerRules(){
 const m=[["TOL","TOL","TOL"],["STR","CYD","RYN"],["GAB","COP","KEN"]];
 const t=freeSpins.createFreeSpinTrigger(m,{spinType:"paid"});assert.equal(t.awardedSpins,4);assert.deepEqual(t.treeCells,[{row:0,reel:0},{row:0,reel:1},{row:0,reel:2}]);
 assert.equal(freeSpins.createFreeSpinTrigger([["TOL","TOL","STR"],m[1],m[2]]).triggered,false);
 assert.equal(freeSpins.createFreeSpinTrigger(m,{enabled:false}).triggered,false);
 const awakened=find(r=>r.featureRolls.expandingWild.activated&&!r.freeSpinTrigger.triggered).r;assert.notDeepEqual(awakened.originalMatrix,awakened.resolvedMatrix);assert.equal(awakened.freeSpinTrigger.triggered,false);
 const paid=trigger();assert.equal(paid.freeSpinTrigger.awardedSpins,4);assert.equal(paid.scatterWins.length,0);assert.equal(paid.totalWin,paid.lineWinTotal+paid.combinationWinTotal+paid.fortuneBonus);
 const free=make(paid.targetStops,{roll:paid.featureRolls.expandingWild.roll,spinType:"free",referenceBet:paid.referenceBet,totalAwardedSpins:4});assert.equal(free.freeSpinTrigger.awardedSpins,2);assert.equal(free.freeSpinTrigger.retrigger,true);
 assert.equal(make(paid.targetStops,{roll:paid.featureRolls.expandingWild.roll,spinType:"free",referenceBet:paid.referenceBet,totalAwardedSpins:20}).freeSpinTrigger.awardedSpins,0);
}
function lockedMath(){
 const paid=trigger(), session=freeSpins.createFreeSpinSession(paid,{sessionId:"s"});
 const charged=state({lineBetIndex:3,fortuneMeter:{value:100,charged:true}}), locked=freeSpins.getLockedSpinState(session,charged);
 assert.equal(locked.lineBetIndex,paid.lineBetIndex);
 const free=make([7,4,5],{spinType:"free",state:locked,referenceBet:session.referenceBet,roll:0});
 assert.equal(free.coinCost,0);assert.equal(free.referenceBet,session.referenceBet);assert.equal(free.fortuneSpin.active,false);assert.equal(free.fortuneMeterAward.totalPoints,0);assert.equal(free.fortuneBonus,0);assert.equal(payouts.consumeFortuneChargeState(charged,free),false);assert.equal(charged.fortuneMeter.charged,true);assert.ok(free.transformations.length);
}
function exactlyOnce(){
 const paid=trigger(), s=state({coins:500,pendingSpin:structuredClone(paid)});s.coins-=paid.coinCost;const before=s.coins;assert.ok(payouts.settlePendingSpinState(s));assert.equal(s.coins,before+paid.totalWin);assert.equal(s.freeSpinSession.startingSpins,4);assert.equal(payouts.settlePendingSpinState(s),null);
 s.freeSpinSession.status=freeSpins.FREE_SPIN_STATUSES.READY;
 const free=make(paid.targetStops,{id:"free",roll:paid.featureRolls.expandingWild.roll,spinType:"free",state:freeSpins.getLockedSpinState(s.freeSpinSession,s),referenceBet:s.freeSpinSession.referenceBet,totalAwardedSpins:4});s.pendingSpin=free;const coins=s.coins,done=payouts.settlePendingSpinState(s);assert.equal(s.coins,coins+free.totalWin);assert.equal(s.freeSpinSession.accumulatedWin,free.totalWin);assert.equal(done.freeSpinSettlement.retriggerApplied,2);assert.equal(payouts.settlePendingSpinState(s),null);
 const duplicate=freeSpins.applyFreeSpinSettlement(s.freeSpinSession,free);assert.equal(duplicate.applied,false);
 const summaryCoins=s.coins;freeSpins.getSessionSummary(s.freeSpinSession);freeSpins.markSummary(s.freeSpinSession);assert.equal(s.coins,summaryCoins);
}
function capAndContributions(){
 const paid=trigger();let session=freeSpins.createFreeSpinSession(paid);session.totalAwardedSpins=19;session.remainingSpins=1;session.completedSpins=18;
 const free=make(paid.targetStops,{id:"cap",roll:paid.featureRolls.expandingWild.roll,spinType:"free",state:freeSpins.getLockedSpinState(session,state()),referenceBet:session.referenceBet,totalAwardedSpins:19});const applied=freeSpins.applyFreeSpinSettlement(session,free);assert.equal(applied.session.totalAwardedSpins,20);assert.equal(applied.retriggerApplied,1);
 session=freeSpins.createFreeSpinSession(paid);session=freeSpins.applyFreeSpinSettlement(session,{id:"c",spinType:"free",totalWin:50,lineWins:[{symbolKey:"STR",payout:25},{symbolKey:"TOL",payout:20}],combinationWins:[{id:"household",payout:5}],freeSpinTrigger:{triggered:false,retrigger:true,awardedSpins:0}}).session;assert.equal(session.characterWinTotals.STR,25);assert.equal(session.characterWinTotals.TOL,20);assert.equal(Object.values(session.characterWinTotals).reduce((a,b)=>a+b,0),45);
}
function persistenceRecovery(){
 store.clear();store.set(app.constants.legacyStorageKeys[0],JSON.stringify({coins:700,lineBetIndex:2}));assert.equal(persistence.loadState().freeSpinSession,null);
 const paid=trigger(), base=freeSpins.createFreeSpinSession(paid,{sessionId:"persist"});
 for(const status of ["intro","ready","presenting","complete","summary"]){store.clear();const staged=structuredClone(base);staged.status=status;if(status==="presenting"){staged.presentationSpin=make([0,0,0],{id:"p",spinType:"free",state:freeSpins.getLockedSpinState(staged,state()),referenceBet:staged.referenceBet});staged.lastSettledFreeSpinId="p";}if(status==="complete"||status==="summary"){staged.completedSpins=staged.totalAwardedSpins;staged.remainingSpins=0;}persistence.saveState({...state(),freeSpinSession:staged,gamePhase:freeSpins.getSessionPhase(staged)});assert.equal(persistence.loadState().freeSpinSession.status,status);}
 const session=freeSpins.createFreeSpinSession(paid,{sessionId:"recover"});session.status="spinning";const pending=make([7,4,5],{id:"pending",spinType:"free",state:freeSpins.getLockedSpinState(session,state({fortuneMeter:{value:100,charged:true}})),referenceBet:session.referenceBet,roll:0});store.clear();persistence.saveState({...state({coins:333,fortuneMeter:{value:100,charged:true}}),freeSpinSession:session,pendingSpin:pending,gamePhase:app.GAME_STATES.FREE_SPINS});const loaded=persistence.loadState(),coins=loaded.coins;payouts.settlePendingSpinState(loaded);assert.equal(loaded.coins,coins+pending.totalWin);assert.equal(loaded.fortuneMeter.charged,true);assert.equal(loaded.freeSpinSession.presentationSpin.id,"pending");assert.equal(payouts.settlePendingSpinState(loaded),null);
}
function statisticsAndFlags(){
 const stats=statistics.createStatistics();stats.recordSpin({coinCost:5,payout:10,spinType:"paid"});stats.recordSpin({coinCost:0,payout:20,spinType:"free"});const snap=stats.snapshot();assert.equal(snap.coinsWagered,5);assert.equal(snap.paidSpins,1);assert.equal(snap.freeSpins,1);
 const stops=trigger().targetStops;for(const characterReactions of [false,true])for(const freeSpinsEnabled of [false,true]){const r=make(stops,{flags:flags({characterReactions,freeSpins:freeSpinsEnabled})});assert.equal(r.freeSpinTrigger.triggered,freeSpinsEnabled);assert.equal(Boolean(reactions.selectReaction(r,{enabled:characterReactions})),characterReactions&&r.totalWin>0);}
 const off=make(stops,{flags:flags({freeSpins:false})});assert.equal(off.freeSpinTrigger.triggered,false);
}
function regressions(){
 const auto=make([7,4,5],{roll:0,flags:flags({manualStops:false,characterReactions:false,freeSpins:false})});const manual=make([7,4,5],{roll:0,flags:flags({manualStops:true,characterReactions:true,freeSpins:false})});for(const k of ["targetStops","originalMatrix","resolvedMatrix","featureRolls","lineWins","combinationWins","fortuneMeterAward","totalWin","winTier"])assert.deepEqual(manual[k],auto[k]);
 const s=state({coins:100,pendingSpin:auto}),before=s.coins;payouts.settlePendingSpinState(s);assert.equal(s.coins,before+auto.totalWin);assert.equal(payouts.settlePendingSpinState(s),null);
}
const tests=[manifest,reactionSelection,mvp,triggerRules,lockedMath,exactlyOnce,capAndContributions,persistenceRecovery,statisticsAndFlags,regressions];tests.forEach(t=>t());
console.log(`Feature tests: PASS (${tests.length} groups)`);
