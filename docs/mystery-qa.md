# Mystery Token QA guide

Open the game with the exact query `?qa=ally`. All controls are client-side and use the production reel generator, pending-result save, modifier queue, settlement, and recovery paths. Removing the query disables every override.

## Token awards

Use **Force 1 Token**, **Force 2 Tokens**, **Force 3 Tokens**, or **Force 4+ Tokens**, then run the next eligible spin.

- While idle, the override targets the next paid or queued Mystery spin.
- During a paused Ally feature, it targets the next Ally Free Spin.
- One token should shimmer without a reward banner.
- Two tokens should add +10 Fortune and a modifier chip.
- Three tokens should add one Mystery Free Spin and a modifier chip.
- Four-plus should add two spins and cleanly reveal a normal fallback while the strong pool is empty.

## Queue and ticket controls

- **Queue Selected Modifier** appends the chosen production modifier. Repeating a stackable modifier verifies its cap.
- **Set Count** sets the persisted Mystery Free Spin queue from 0 through 20.
- **Clear Queue** clears both tickets and queued modifiers.
- With a ticket available and no Ally feature active, the main button must read **Free Spin** and the bet display must read **Free**.
- **Mystery Spin → Ally** queues a zero-cost Mystery spin with natural Three Trees. Remaining tickets must survive the Ally intro, spins, and summary.

## Modifier cases

- **Test Spotlight** queues Sterling Spotlight and a stored Sterling line win. Verify the line payout multiplier and Sterling-colored winning-cell outline.
- **Test Center Tree** queues an open center cell. Verify the visual swap, pre-payout line evaluation, and unchanged natural trigger state.
- **Test Double Commune** queues a named Commune result. Verify only the combination payout doubles.
- **Rescue Loss → Win** stores an initial loss and one winning replacement. Verify both reel presentations but only the replacement payout, tokens, Fortune, and trigger data.
- **Fortune Burst Win/Loss** verifies +20 or +10 Fortune for one stack. Queue extra stacks manually to verify the +60/+30 cap.
- **Test Strong Fallback** forces four-plus tokens while the strong pool is empty. It must award a normal modifier and never show an error or empty chip.

## Reload recovery

Useful interruption points:

1. Reload after pressing Free Spin while the reels are moving. The consumed ticket must remain consumed and the stored result must settle once.
2. Reload between the Rescue loss and replacement presentation. The stored replacement must be reused.
3. Reload during an Ally feature after tokens award a ticket. The Ally feature resumes and the ticket remains paused.
4. Reload with stacked Spotlight chips. Character identity and stack count must remain unchanged.

`npm run test:mystery` covers the same contracts without presentation timing. `node tools/simulate.mjs --check` covers exact reel frequencies and seeded chain behavior.
