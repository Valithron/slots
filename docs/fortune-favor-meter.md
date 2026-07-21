# Fortune Meter and Fortune’s Favor

## Player rules

The Fortune Meter still reaches 100 and arms the next eligible paid spin or Mystery Free Spin as a Fortune Spin.

A Fortune Spin:

- multiplies the complete eligible coin payout by **1.5×**
- consumes the charge whether the spin wins or loses
- receives a Fortune’s Favor attempt unless natural Three Trees already start the feature

The meter Favor progression is fixed:

| Completed-meter attempt | Fortune’s Favor result |
| --- | --- |
| 1 | 10% chance |
| 2 | 10% chance |
| 3 | 10% chance |
| 4 | 10% chance |
| 5 | Guaranteed |

The percentage does not rise. Each failed random attempt lights one of four golden leaves. Four lit leaves mean the next Fortune Spin guarantees Fortune’s Favor.

## Pity behavior

`fortuneFavorFailures` stores zero through four consecutive failed meter attempts.

- A failed random meter attempt increments the value once, capped at four.
- A meter-awarded Fortune’s Favor resets it to zero.
- A natural Three Trees trigger does not increment or reset it.
- Natural Three Trees on a charged Fortune Spin skip the meter roll, preserve pity, retain the 1.5× payout treatment, and start only one feature.

Only the final coherent result can contain a meter attempt. Rescue candidates and Ally replay candidates are resolved before `fortune-favor-core.js` adds the authoritative saved Favor outcome.

## Eligible spins

Eligible:

- paid Fortune Spins
- Mystery Free Fortune Spins outside Fortune’s Favor

Not eligible:

- Ally Free Spins
- extension spins inside Fortune’s Favor
- abandoned Rescue, Gabi, or Ashley candidates
- QA probe results
- spins while an active Fortune’s Favor session is running

A Fortune charge earned during Fortune’s Favor remains armed and persistent until the first eligible paid or Mystery Free Spin after the feature ends.

## Authoritative result and settlement order

1. Generate the natural reel result.
2. Resolve normal and Strong Mystery transformations, Rescue, and Ally replay selection.
3. Evaluate paylines, combinations, Mystery Tokens, natural Three Trees, and the 1.5× Fortune multiplier.
4. If natural Three Trees already trigger Fortune’s Favor, save a `skipped-natural` meter outcome without drawing Favor RNG.
5. Otherwise save either the flat 10% roll or deterministic guaranteed-fifth result.
6. Save the complete pending result.
7. Settle the result once.
8. Increment or reset pity once.
9. Preserve every same-spin reward and begin Fortune’s Favor through the existing feature-session path after normal result presentation.

The guaranteed fifth attempt consumes no unnecessary RNG draw.

## Persistence

Saved Favor metadata includes:

- source spin ID
- pity before and after
- attempt number
- random or guaranteed mode
- saved roll when random
- success, failure, or natural-trigger skip
- pity increment/reset flags
- award-applied flag
- presentation-shown flag
- feature-start transition flag

Reload cannot reroll the attempt, change its outcome, duplicate pity changes, consume the Fortune charge twice, duplicate the 1.5× payout, or start a second feature.

## Presentation and accessibility

The Fortune Meter displays exactly four leaf indicators.

- `Favor Chance` appears below four failures.
- `Favor Guaranteed` appears at four failures.
- The ready state says `FORTUNE SPIN READY` and shows either `1.5× WIN · FAVOR CHANCE` or `1.5× WIN · FAVOR GUARANTEED`.
- Meter success presents `FORTUNE SMILES` and `FORTUNE’S FAVOR AWARDED`.

The leaves use shape, outline, fill, and accessible text rather than color alone. Reduced-motion mode removes the leaf animation. The compact layout is designed to remain within the existing meter at 320 pixels.

## QA mode

Open `?qa=ally` and use **Fortune’s Favor Meter QA**.

Controls include:

- set the Fortune Meter to 100
- set pity from zero through four
- force random success or failure
- force the guaranteed fifth attempt
- force natural Three Trees on a charged Fortune Spin
- charge the meter during an active feature
- prepare a charged Mystery Free Spin
- save reload-ready pending success, failure, or guaranteed results
- preview zero through four leaves and the success callout

The controls write production persistence state and call the production result, Mystery commitment, Fortune charge, settlement, and feature-start paths.

## Validation

Run:

```bash
npm test
npm run test:fortune-favor
npm run simulate
npm run simulate:json
npm run simulate:monte-carlo
npm run simulate:fortune-favor
npm run simulate:fortune-favor:json
npm run simulate:fortune-favor:deep
```

No reel strips, natural trigger frequency, payouts, Ally abilities, Mystery frequency, Strong Modifier strength, Fortune gains, or the 1.5× multiplier are reduced by this feature.