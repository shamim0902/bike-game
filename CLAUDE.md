# bike-game

Working title. This is the bike ride from hasanuzzaman.com, lifted out of the portfolio on
2026-09-06 to become a game of its own.

## Where it came from

- Portfolio repo: `~/Desktop/portfolio` (github.com/shamim0902/hasanuzzaman.com), tagged v2.0.1
  at the time of the copy.
- The session that created this project, with the full history of how the drive was built
  and tuned: https://claude.ai/code/session_01J9TwU62sDVAUcYCqSVeT9y
- `src/components/ProjectDrive.vue` and every composable it imports are byte-identical to the
  portfolio's. Keep them diffable for as long as that is useful; once the game diverges on
  purpose, stop worrying about it.

## What is stubbed, and why

The portfolio page used to hand the game three things. Each is stubbed with the same shape so
ProjectDrive.vue did not have to change:

- `src/composables/useGsap.js`: GSAP core only. `ScrollSmoother.get()` returns null; every
  call site already tolerated that.
- `src/composables/useGuide.js`: `guide.tour.active` is always false, `reactTo()` says nothing.
  If the game grows a narrator, it plugs in here.
- `src/data/githubSnapshot.js`: the billboards still show GitHub repos, because the track was
  built around them. Replacing them with the game's own content is the first real design
  decision.

## Decisions still open

- The name. Shortlist from the naming session: Lapline (recommended if it stays an arcade lap
  racer), Oito! (if it should carry the owner's voice; Bangla for "that's it!"), Overlap,
  Cholen, Nightlap, Lap Zero, Backroad, Jhor. Nothing checked for domain availability.
  Avoid Street Bob, Harley, Kickstart (trademarks).
- Whether it is an arcade lap racer (time trials, boost, ghosts) or a world to ride around
  (exploration, places). The name should follow that answer.
- The billboards (see above).

## How the owner works

- Do not commit without asking. He reviews in the browser first; stop after build + verify.
- No em dashes in user-facing copy. Use a comma, a colon, or a full stop.
- Verify claims with numbers where possible (headless scripts against the real constants),
  and say plainly what was not verified.

## Commands

```
npm run dev     # vite, add --host to test on a phone
npm run build
npm test        # node --test, 23 tests
```
