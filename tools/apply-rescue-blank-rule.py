from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected {label} block.")
    return text.replace(old, new, 1)


mystery_path = Path("js/mystery.js")
mystery = mystery_path.read_text()
rescue_block = '''  function inspectPersistentReward(result) {
    const tokenCount = countTokens(result?.originalMatrix).count;
    const mysteryAward = result?.mysteryAward;
    const mysteryMechanicalReward = tokenCount >= 2
      || floor(mysteryAward?.fortunePoints) > 0
      || floor(mysteryAward?.freeSpinsRequested) > 0
      || Boolean(mysteryAward?.modifier);
    const naturalFreeSpinAward = Boolean(result?.freeSpinTrigger?.triggered
      && floor(result.freeSpinTrigger.awardedSpins) > 0);
    const fortuneBurstPoints = floor(result?.fortuneBurstPoints);
    const explicitPersistentAward = Boolean(
      result?.persistentFeatureAward
      || result?.persistentAward
      || result?.featureAward?.persistent === true
      || (Array.isArray(result?.persistentFeatureAwards) && result.persistentFeatureAwards.length > 0)
      || (Array.isArray(result?.featureAwards) && result.featureAwards.some(award => award?.persistent !== false))
    );
    return {
      tokenCount,
      mysteryMechanicalReward,
      naturalFreeSpinAward,
      fortuneBurstPoints,
      explicitPersistentAward,
      meaningful: mysteryMechanicalReward || naturalFreeSpinAward || fortuneBurstPoints > 0 || explicitPersistentAward,
    };
  }

  function isTrulyBlankResult(result) {
    return floor(result?.totalWin) <= 0 && !inspectPersistentReward(result).meaningful;
  }

  function coherentRescueResult(original, replacements, selected) {
    const chosen = selected === "original" ? original : replacements.at(-1);
    const originalReward = inspectPersistentReward(original);
    const replacementRewards = replacements.map(inspectPersistentReward);
    const selectedReward = inspectPersistentReward(chosen);
    const stoppedOnMeaningfulReward = floor(chosen.totalWin) <= 0 && selectedReward.meaningful;
    return {
      ...clone(chosen),
      id: original.id,
      createdAt: original.createdAt,
      mysteryRescue: {
        attemptsAllowed: Math.min(2, original.mysteryActiveModifiers.find(item => item.id === "rescue-spin")?.stacks || 0),
        attemptsUsed: replacements.length,
        originalResult: clone(original),
        replacementResults: clone(replacements),
        selected,
        selectedResultId: chosen.id,
        rescued: isTrulyBlankResult(original) && !isTrulyBlankResult(chosen),
        expiredUnused: replacements.length === 0 && !isTrulyBlankResult(original),
        stopReason: floor(chosen.totalWin) > 0
          ? "coin-win"
          : stoppedOnMeaningfulReward
            ? "meaningful-non-coin-reward"
            : replacements.length > 0 ? "attempts-exhausted" : "original-kept",
        originalBlank: isTrulyBlankResult(original),
        selectedMeaningfulReward: clone(selectedReward),
        candidateRewards: {
          original: clone(originalReward),
          replacements: clone(replacementRewards),
        },
      },
      settlementStatus: "pending",
    };
  }

  function attachAward'''
pattern = re.compile(r"  function coherentRescueResult\(original, replacements, selected\) \{.*?\n  function attachAward", re.S)
mystery, count = pattern.subn(rescue_block, mystery, count=1)
if count != 1:
    raise SystemExit("Could not replace Rescue result block.")
mystery = replace_once(
    mystery,
    "for (let attempt = 0; attempt < attemptsAllowed && current.totalWin === 0; attempt += 1) {",
    "for (let attempt = 0; attempt < attemptsAllowed && isTrulyBlankResult(current); attempt += 1) {",
    "Rescue loop condition",
)
mystery = replace_once(
    mystery,
    "    countTokens,\n    chooseModifier,",
    "    countTokens,\n    inspectPersistentReward,\n    isTrulyBlankResult,\n    chooseModifier,",
    "Mystery exports",
)
mystery_path.write_text(mystery)


tests_path = Path("tools/mystery-tests.mjs")
tests = tests_path.read_text()
rescue_tests = '''function rescueRules() {
  const rescue = [{ id: "rescue-spin", stacks: 2 }];
  const rescueRolls = [
    { expandingWild: { roll: 1 } },
    { expandingWild: { roll: 1 } },
  ];

  const originalTwo = make(twoTokenLoss, {
    id: "rescue-keeps-original-two-tokens",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
    awardModifier: "center-tree",
  });
  assert.equal(originalTwo.totalWin, 0);
  assert.equal(originalTwo.mysteryRescue.attemptsUsed, 0);
  assert.equal(originalTwo.mysteryRescue.selected, "original");
  assert.equal(originalTwo.mysteryRescue.stopReason, "meaningful-non-coin-reward");
  assert.equal(originalTwo.mysteryTokenCount, 2);
  assert.equal(originalTwo.mysteryAward.fortunePoints, CONFIG.mystery.rewards.twoTokenFortune);
  assert.equal(originalTwo.mysteryAward.modifier.id, "center-tree");

  const replacementTwo = make(zeroTokenLoss, {
    id: "rescue-stops-on-replacement-two-tokens",
    modifiers: rescue,
    rescueStops: [twoTokenLoss, zeroTokenWin],
    rescueRolls,
    awardModifier: "center-tree",
  });
  assert.equal(replacementTwo.mysteryRescue.attemptsUsed, 1);
  assert.equal(replacementTwo.mysteryRescue.replacementResults.length, 1);
  assert.equal(replacementTwo.mysteryRescue.selected, "replacement");
  assert.equal(replacementTwo.mysteryRescue.stopReason, "meaningful-non-coin-reward");
  assert.equal(replacementTwo.mysteryTokenCount, 2);
  assert.equal(replacementTwo.targetStops.join(","), twoTokenLoss.join(","));

  const three = make(stops[3], {
    id: "rescue-keeps-three-token-award",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(three.mysteryRescue.attemptsUsed, 0);
  assert.equal(three.mysteryTokenCount, 3);
  assert.equal(three.mysteryAward.freeSpinsRequested, CONFIG.mystery.rewards.threeTokenFreeSpins);

  const four = make(stops[4], {
    id: "rescue-keeps-four-token-award",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(four.mysteryRescue.attemptsUsed, 0);
  assert.ok(four.mysteryTokenCount >= 4);
  assert.equal(four.mysteryAward.freeSpinsRequested, CONFIG.mystery.rewards.fourPlusFreeSpins);

  const zeroWinTriggerStops = findStops(result => result.totalWin === 0
    && result.mysteryTokenCount === 0
    && result.freeSpinTrigger?.triggered
    && result.freeSpinTrigger.awardedSpins > 0).targetStops;
  const trigger = make(zeroWinTriggerStops, {
    id: "rescue-keeps-natural-three-trees",
    modifiers: rescue,
    rescueStops: [zeroTokenWin, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(trigger.totalWin, 0);
  assert.equal(trigger.mysteryRescue.attemptsUsed, 0);
  assert.equal(trigger.mysteryRescue.stopReason, "meaningful-non-coin-reward");
  assert.equal(trigger.freeSpinTrigger.triggered, true);

  const blank = make(zeroTokenLoss, {
    id: "rescue-rerolls-truly-blank-results",
    modifiers: rescue,
    rescueStops: [zeroTokenLoss, zeroTokenWin],
    rescueRolls,
  });
  assert.equal(blank.mysteryRescue.attemptsUsed, 2);
  assert.equal(blank.mysteryRescue.selected, "replacement");
  assert.equal(blank.mysteryRescue.stopReason, "coin-win");
  assert.equal(blank.mysteryRescue.rescued, true);
  assert.equal(blank.targetStops.join(","), zeroTokenWin.join(","));

  const oneTokenLoss = findStops(result => result.totalWin === 0
    && result.mysteryTokenCount === 1
    && !result.freeSpinTrigger?.triggered).targetStops;
  const one = make(oneTokenLoss, {
    id: "rescue-may-reroll-one-token-shimmer",
    modifiers: rescue,
    rescueStops: [zeroTokenWin],
    rescueRolls,
  });
  assert.equal(one.mysteryRescue.attemptsUsed, 1);
  assert.equal(one.totalWin > 0, true);

  storage.clear();
  const reloadState = state();
  mystery.queueModifier(reloadState, { id: "rescue-spin", stacks: 2 });
  const reloadResult = make(zeroTokenLoss, {
    spinState: reloadState,
    id: "rescue-reload-exactly-once",
    modifiers: mystery.peekModifierQueue(reloadState),
    rescueStops: [twoTokenLoss, zeroTokenWin],
    rescueRolls,
    awardModifier: "center-tree",
  });
  assert.equal(mystery.commitSpinStart(reloadState, reloadResult), true);
  reloadState.coins -= reloadResult.coinCost;
  reloadState.lastWin = 0;
  reloadState.pendingSpin = reloadResult;
  assert.equal(persistence.saveState(reloadState), true);
  const restored = persistence.loadState();
  const done = payouts.settlePendingSpinState(restored);
  assert.equal(done.mysteryTokenCount, 2);
  assert.equal(done.mysterySettlement.fortunePoints, CONFIG.mystery.rewards.twoTokenFortune);
  assert.equal(restored.mystery.modifierQueue[0].id, "center-tree");
  assert.equal(restored.fortuneMeter.value, done.fortuneMeterAward.totalPoints);
  assert.equal(payouts.settlePendingSpinState(restored), null, "Recovered Rescue result settles once");
  assert.equal(mystery.applyMysterySettlement(restored, done).duplicate, true, "Recovered reward cannot duplicate");
}

function fortuneBurstRules() {'''
tests, count = re.subn(r"function rescueRules\(\) \{.*?\nfunction fortuneBurstRules\(\) \{", rescue_tests, tests, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Could not replace Rescue tests.")
tests_path.write_text(tests)


sim_path = Path("tools/simulate-mystery-scatter.mjs")
sim = sim_path.read_text()
sim = replace_once(
    sim,
    "    ryanBoostActivations: 0,\n    guardTrips: 0,",
    "    ryanBoostActivations: 0,\n    rescueResults: 0,\n    rescueAttemptsUsed: 0,\n    rescueProtectedMeaningfulResults: 0,\n    rescueProtectedTwoPlusTokenResults: 0,\n    rescueProtectedTreeResults: 0,\n    rescueProtectedFortuneResults: 0,\n    guardTrips: 0,",
    "simulation Rescue counters",
)
sim = replace_once(
    sim,
    "    ryanBoostActivationFrequencyPerAllySpin: metrics.ryanBoostActivations / Math.max(1, metrics.allyFreeSpins),\n  };",
    "    ryanBoostActivationFrequencyPerAllySpin: metrics.ryanBoostActivations / Math.max(1, metrics.allyFreeSpins),\n    rescueResultCount: metrics.rescueResults,\n    averageRescueAttemptsUsed: metrics.rescueAttemptsUsed / Math.max(1, metrics.rescueResults),\n    rescueMeaningfulRewardProtectionFrequency: metrics.rescueProtectedMeaningfulResults / Math.max(1, metrics.rescueResults),\n    rescueProtectedTwoPlusTokenResults: metrics.rescueProtectedTwoPlusTokenResults,\n    rescueProtectedTreeResults: metrics.rescueProtectedTreeResults,\n    rescueProtectedFortuneResults: metrics.rescueProtectedFortuneResults,\n  };",
    "simulation Rescue summary",
)
sim = replace_once(
    sim,
    "    const endBonus = settled.allyEndBonus?.amount || 0;",
    '''    const rescueResult = settled.mysteryRescue;
    if (rescueResult) {
      metrics.rescueResults += 1;
      metrics.rescueAttemptsUsed += rescueResult.attemptsUsed || 0;
      if (rescueResult.stopReason === "meaningful-non-coin-reward") {
        metrics.rescueProtectedMeaningfulResults += 1;
        const reward = rescueResult.selectedMeaningfulReward || {};
        if ((reward.tokenCount || 0) >= 2) metrics.rescueProtectedTwoPlusTokenResults += 1;
        if (reward.naturalFreeSpinAward) metrics.rescueProtectedTreeResults += 1;
        if ((reward.fortuneBurstPoints || 0) > 0) metrics.rescueProtectedFortuneResults += 1;
      }
    }

    const endBonus = settled.allyEndBonus?.amount || 0;''',
    "simulation Rescue collection",
)
sim = replace_once(
    sim,
    '  note: "Before mode uses the same production math with in-feature conversion disabled, so Mystery Free Spins wait until after the Ally feature. After mode converts them into the active Ally session up to the twenty-spin cap.",',
    '  note: "Before mode uses the same production math with in-feature conversion disabled, so Mystery Free Spins wait until after the Ally feature. After mode converts them into the active Ally session up to the twenty-spin cap. Both modes use the corrected Rescue rule that preserves coin wins and meaningful persistent non-coin rewards.",',
    "simulation report note",
)
sim = replace_once(
    sim,
    '  console.log(`Ryan RTP: ${percentage(report.ryan.beforeRtp)} before → ${percentage(report.ryan.afterRtp)} after; boost activation ${percentage(report.ryan.afterBoostActivationFrequency)} per feature`);',
    '''  console.log(`Ryan RTP: ${percentage(report.ryan.beforeRtp)} before → ${percentage(report.ryan.afterRtp)} after; boost activation ${percentage(report.ryan.afterBoostActivationFrequency)} per feature`);
  const protectedCount = afterRows.reduce((sum, row) => sum + row.rescueProtectedTwoPlusTokenResults + row.rescueProtectedTreeResults + row.rescueProtectedFortuneResults, 0);
  console.log(`Rescue preserved meaningful non-coin outcomes across after-mode Ally runs: ${protectedCount.toLocaleString()} classified outcomes.`);''',
    "simulation console report",
)
sim_path.write_text(sim)


readme_path = Path("README.md")
readme = readme_path.read_text()
readme = replace_once(
    readme,
    "| Rescue Spin | A total loss rerolls once, or twice when stacked. Only the final coherent result settles. |",
    "| Rescue Spin | Rerolls only a truly blank zero-coin result. It stops on a coin win, 2+ Mystery Tokens, natural Three Trees, Fortune Burst, or another persistent mechanical award. One-token shimmer may still reroll. |",
    "README Rescue row",
)
anchor = "Mystery Free Spins are ordinary base-game spins with a zero coin cost."
note = "Rescue Spin defines **blank** as zero coins and no persistent mechanical reward. A result with 2+ Mystery Tokens, Mystery Fortune, a queued modifier award, Mystery or Ally spins, a natural trigger or retrigger, Fortune Burst, or another persistent feature award is kept and settled. Stacked Rescue attempts stop at the first candidate with either coins or a meaningful non-coin reward. One Mystery Token remains presentation-only and may still be rerolled.\n\n"
if note not in readme:
    readme = replace_once(readme, anchor, note + anchor, "README Mystery section")
readme_path.write_text(readme)


math_path = Path("docs/math-model.md")
math = math_path.read_text()
math = replace_once(
    math,
    "Rerolls stop as soon as a replacement wins. If the original wins, Rescue expires unused. Settlement sees only the selected coherent result, so abandoned losses cannot award coins, Fortune, tokens, combinations, or Three Trees.",
    "Rescue rerolls only a truly blank result: zero coins and no persistent mechanical award. It stops immediately on a coin win, 2+ Mystery Tokens, natural Three Trees trigger or retrigger, Fortune Burst, or another persistent feature award. One Mystery Token is presentation-only and may still count as blank. Stacked attempts inspect each authoritative candidate in order and stop at the first nonblank candidate. Settlement still sees one coherent selected result, and reload cannot duplicate its coins, Fortune, modifier, Mystery/Ally spins, or trigger.",
    "math model Rescue paragraph",
)
math_path.write_text(math)


extension_path = Path("docs/ally-mystery-extensions.md")
extension = extension_path.read_text()
rescue_note = "\n## Rescue Spin blank-result boundary\n\nRescue Spin now rerolls only a truly blank zero-coin result. Two or more Mystery Tokens, a natural Three Trees trigger or retrigger, Fortune Burst, and any other persistent mechanical feature award make the candidate nonblank and preserve it. One Mystery Token remains presentation-only and may still reroll. Stacked Rescue attempts stop on the first coin win or meaningful non-coin reward, and the selected coherent result remains reload-safe and exactly-once.\n"
if "## Rescue Spin blank-result boundary" not in extension:
    extension += rescue_note
extension_path.write_text(extension)

for temporary in [
    Path(".github/workflows/apply-rescue-blank-rule.yml"),
    Path(".github/workflows/apply-rescue-pr.yml"),
    Path("tools/apply-rescue-blank-rule.py"),
]:
    if temporary.exists():
        temporary.unlink()
