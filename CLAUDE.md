# Nightlap

The bike ride from hasanuzzaman.com, lifted out of the portfolio on 2026-09-06 to become a
game of its own. Named Nightlap on the same day (see Decisions). The folder is still
`bike-game`; renaming it is the owner's call.

## Where it came from

- Portfolio repo: `~/Desktop/portfolio` (github.com/shamim0902/hasanuzzaman.com), tagged v2.0.1
  at the time of the copy.
- The session that created this project, with the full history of how the drive was built
  and tuned: https://claude.ai/code/session_01J9TwU62sDVAUcYCqSVeT9y
- The composables ProjectDrive.vue imports are byte-identical to the portfolio's.
  ProjectDrive.vue itself diverged on 2026-09-06 (billboards, HUD, no GitHub links); the
  physics, camera, lap timer and input paths are still the portfolio's and diff cleanly.

## What is stubbed, and why

The portfolio page used to hand the game three things. Each is stubbed with the same shape so
ProjectDrive.vue did not have to change:

- `src/composables/useGsap.js`: GSAP core only. `ScrollSmoother.get()` returns null; every
  call site already tolerated that.
- `src/composables/useGuide.js`: `guide.tour.active` is always false. `reactTo()` is now the
  narrator: a throttled speech bubble on the stage, text only.
- The GitHub snapshot and `ghFormat.js` are gone. The billboards are the game's own signs,
  `src/data/billboards.js`, painted to canvas by `billboardTexture` in ProjectDrive.vue.

## Decisions made

- Name: Nightlap (2026-09-06). Picked over Lapline because it is what is on screen (dark sky,
  fog, headlights, a lights toggle) and it came back clean everywhere: nightlap.com, .io and
  .game unregistered per whois, no npm package, no GitHub repos, no game by that name found.
  Lapline had lapline.com taken and a few small GitHub repos. Nothing has been registered.
  Rejected earlier: Street Bob, Harley, Kickstart (trademarks).
- The game is the whole page. `src/App.vue` makes the drive fill the viewport with scoped
  `:deep` overrides and hides the component's expand button, so its fullscreen path (teleport,
  scroll lock, placeholder) is never entered. Done there rather than in ProjectDrive.vue to
  keep that file diffable against the portfolio.

- Billboards (2026-09-06): funny roadside signs instead of repos. Twelve in
  `src/data/billboards.js`, each a headline, a second line, small print, an emoji as the
  picture, a paint job and a star count for its pickups. Parking in a P spot shows the
  small print in the HUD; nothing opens an external link any more. Emoji were chosen over
  image files so a sign stays one data row; if real artwork is wanted later, `billboardTexture`
  is the one place to draw it.

- Phase 1 of the plan is built (2026-09-06): `src/game/store.js` (the save), `src/game/entrance.js`
  (the state machine), `src/game/town.js` (seeded placement of places along the lap),
  `src/game/activities/` (registry plus the time trial), `src/data/places.js` (the buildings),
  and the entrance flow wired into ProjectDrive.vue. The owner rejected doors under the
  billboards: billboards are ads only; places are separate buildings beside the road. Verified headlessly over the Chrome
  DevTools Protocol with the component's `window.__drive` dev hook: park, Enter, off the bike,
  walk to the door, a timed lap saved, the door repainted with the best after a reload. The
  script is not in the repo; the flow is park in a bay, Enter, then Esc to leave.
- Phase 2 is built (2026-09-06): `src/game/jobs.js` (shared job rules, tested) and three
  activities, pizza run, coffee run, blackout. The component grew a marker system
  (`markers`, `arrow`, `lights` on `activityCtx`), minimap job dots, and a wallet readout.
  Verified headless: all three jobs played to completion, cash and bests saved, lights locked
  off during blackout and restored after.
- Phase 3 is built (2026-09-06): cash has a purpose. `src/game/shop.js` (upgrade tiers and
  the multipliers the drive applies), leases on new places (`lease` in places.js, paid with
  Enter), four more activities (stunt claim, mattress haul, the prediction, sock hunt), the
  scene-activity frame (`kind: 'scene'` plus a Vue `component`, first used by the shop,
  `ShopPanel.vue`), and a text narrator in `useGuide.js`. Nine places. Verified headless.
  Not built: honk in time, your sign, ghost lap, open wide.
- What it is (2026-09-06): a night town, not a lap racer. Every billboard is a place; park
  in its P bay, press Enter, get off the bike, walk in, and the place is an activity. Timed
  laps become one activity (the speed camera). The full plan, phases, and the decisions still
  waiting on the owner are in `docs/PLAN.md`. Read it before starting any game work.

## Decisions still open

- The four at the end of `docs/PLAN.md`: currency, whether the town pauses behind scene
  activities, the shape of phase 4, and what is painted on a door.

## How the owner works

- Do not commit without asking. He reviews in the browser first; stop after build + verify.
- No em dashes in user-facing copy. Use a comma, a colon, or a full stop.
- Verify claims with numbers where possible (headless scripts against the real constants),
  and say plainly what was not verified.

## Commands

```
npm run dev     # vite, add --host to test on a phone
npm run build
npm test        # node --test, 50 tests
```
