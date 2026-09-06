# Nightlap

A night-time bike town in the browser. Ride the loop, read the billboards, park at a
place and go in: timed laps at the police booth, pizza runs, a blackout, a mattress that
flies off over 40 km/h, a psychic who predicts your lap, a sock lost in the trees. Earn
cash, spend it on the bike, lease more of the town.

It runs on Vue 3, three.js and GSAP, built with Vite. No game engine, no backend, no
build step you cannot read. It started as the bike ride on
[hasanuzzaman.com](https://hasanuzzaman.com) and grew into a game of its own.

```
npm install
npm run dev      # http://localhost:5173, add --host to play on a phone
npm test         # node --test, the pure game rules
npm run build    # dist/
```

## How to play

| Do | Keyboard | Phone |
|---|---|---|
| Drive, brake, steer | W / S, A / D, arrows | Joystick |
| Boost | Hold W | Hold the joystick fully up |
| Get off the bike, get back on | Enter (or E) | The button in the mode bar |
| Go into a place | Park in its P bay, Enter | Park, tap the card |
| Leave a place | Esc | The Leave button |
| Honk, lights, camera | H, L, C | The round buttons |

The white P bays on the road belong to the places. The card at the bottom names the place
you are parked at, what it costs if it is not yours yet, and your best there.

## What it is made of

```
src/
  App.vue                     the page: the game and nothing else
  components/
    ProjectDrive.vue          the town: scene, road, bike, rider, camera, physics, HUD
    DriveJoystick.vue         the touch joystick
    ShopPanel.vue             the parts counter (a scene activity's screen)
  composables/
    useCircuit.js             the loop: a wobbly circle sampled into a road, with nearest-point and at(s, lateral) queries
    useLapTimer.js            lap timing with ordered checkpoints, pure
    useDriveInput.js          keyboard and joystick merged into one input object
    useGsap.js                GSAP setup (ScrollSmoother is stubbed: the portfolio had one, the game does not)
    useGuide.js               the narrator: a throttled speech bubble
    useAvatarModel.js         the rider model, parsed once
  game/
    store.js                  the save: cash, stars, bests, upgrades, leases (localStorage)
    entrance.js               going into a place, as a state machine
    town.js                   where the places stand: seeded, clear of signs and ramps
    jobs.js                   what the jobs share: targets, clocks, lap progress, pay tables
    shop.js                   the upgrades and the multipliers they apply to the bike
    activities/               one module per place (see below)
  data/
    billboards.js             the twelve signs: headline, line, small print, picture, paint
    places.js                 the nine places: name, building, blurb, lease
tests/                        node --test, no three.js: rules, state machines, layout, save
docs/PLAN.md                  the design plan and what is built
```

Three libraries do the work:

- **three.js** draws the town. The road is one mesh extruded along the loop with a
  painted canvas texture. Billboards, doors and markers are canvas textures too, painted at
  build time from data, so a new sign is a line in a file, not an image to make.
- **GSAP** does the choreography. Everything that has a beginning, a middle and an end is a
  GSAP timeline: the rider walking up and swinging a leg over the bike, getting off and
  standing beside it, the bay glow rising when you park, the marker collapsing when you
  hit it, the camera easing home after a drag. Physics runs per frame in the render loop;
  GSAP runs the moments that need to feel authored. That split is the whole trick of
  building a web game this way: tweens and timelines for anything a person should *watch*,
  plain arithmetic for anything they *control*.
- **Vue** owns the HUD. The render loop writes plain objects sixty times a second and
  touches a reactive ref only when a number on screen changes, so Vue never re-renders for
  a frame it does not need.

## How the town works

**The loop.** `buildCircuit` samples a circle with a little wobble into a few hundred
points, each with a tangent. Everything is placed by distance along it (`s`) and offset
across it (`lateral`), never by raw x/z, so the road can change shape and every sign, bay
and marker moves with it.

**Places.** `town.js` scatters the places from a fixed seed, keeping them clear of the
billboards, the ramps, the finish line and each other. Same seed, same town every night.
Each place gets a bay on the road, a door on the verge, and a building made of boxes.

**Going in.** `entrance.js` is a tiny state machine: idle, dismounting, walking to the
door, inside. The component drives it: Enter in a bay starts the dismount timeline, then
an automatic walk round the back of the bike to the door, then the activity's `enter`.
Any input during the walk cancels it.

**Activities.** A place opens onto an activity: a plain object with `enter`, `update`,
`interrupt` and `exit`, given a context each frame (position, speed, whether on the road,
the save, and helpers for markers, an arrow, the lights, a speech bubble). `kind: 'world'`
plays out on the road. `kind: 'scene'` brings a Vue component shown over the town; the
shop is one.

**Money.** Jobs pay cash into the save. Cash buys upgrades at the Highways Dept. (tiers
multiply the drive's own constants) and leases on places. Stars are pickups on the road
and bonuses for perfect runs.

## Make it your own

**A new billboard.** Add a row to `src/data/billboards.js`: headline, second line, small
print, an emoji for the picture, a paint job, and how many stars float before it. It is
painted onto a canvas at load and stood beside the road.

**A new place.** Add a row to `src/data/places.js` with a `building` (`booth`, `house`,
`shop`, `gate`), a blurb, and a `lease` price or none. It appears on the next load, with a
bay and a door reading "Coming soon". The layout code finds room for it.

**A new activity.** Copy the shortest one, `src/game/activities/sockHunt.js`, give it the
place's `id`, and register it in `activities/index.js`. Put its rules (pay, limits, target
placement) in `src/game/jobs.js` so they can be tested without a browser; the tests in
`tests/jobs.test.js` show how. For a screen of your own, set `kind: 'scene'` and point
`component` at a Vue component; it receives the store and emits `leave`.

**A new building shape.** `buildPlace` in `ProjectDrive.vue` makes each kind from boxes
and lit planes. Add a kind there. Real models can replace it later; the door face is a
material you can hang on anything.

**A new upgrade.** Add it to `src/game/shop.js` with prices and tier text, extend
`tuning` with the multiplier it produces, and apply that multiplier where the drive uses
the constant. `UPGRADE_KEYS` in `store.js` lists what the save keeps.

**Tuning the feel.** The numbers are named and commented where they live: `DRIVE` and
`BOOST` for the bike, `FOOT` for walking and running, `STAR` for pickups, `MOUNT` for the
choreography, the ramps as stretches of the lap. Every distance in the plan was measured
against these with a small script rather than guessed; do the same and the town stays
consistent.

## Building a web game with GSAP: what carried over

If you want to build something like this yourself, the parts worth stealing:

1. **One render loop, many timelines.** `requestAnimationFrame` integrates the physics
   and moves the camera. GSAP timelines own the set pieces: `gsap.timeline()` with
   positioned tweens on the rider's position, rotation and pose weights, and `.call()`
   for the moments that need code (starting the engine, marking the bike as ready). A
   timeline is scrubbable and killable, so "any input skips the intro" is one `kill()`.
2. **Tween the things people notice, not the things they steer.** Glows, scales,
   opacity, the camera easing back after a drag: `gsap.to` with `overwrite: true`. The
   bike's speed and heading: arithmetic in the loop. Mixing the two the other way round
   feels floaty.
3. **Paint UI into textures.** A billboard, a door, a marker icon: `document.createElement('canvas')`,
   draw with fonts and emoji, wrap in a `CanvasTexture`. Data becomes scenery with no
   asset pipeline.
4. **Keep the rules pure.** Everything with a number in it that matters (pay, limits,
   timers, layout, the save) lives in modules with no three.js in them and is tested with
   `node --test`. The browser only has to be right about drawing.
5. **Verify with a script, not a feeling.** Headless Chrome with the DevTools protocol
   can drive the real page: teleport the bike, press keys, read the HUD. The dev build
   exposes `window.__drive` for exactly that.

## Credits

- Bike: 2017 Harley-Davidson FXDB Street Bob by "everhard" on Sketchfab, CC BY 4.0,
  decimated and compressed for the web.
- Trees and bushes: `public/drive/decoration-forest.glb`, carried over from the portfolio.
  Believed to be a Kenney set (CC0); confirm the source before shipping.
- Fonts: Inter and Fraunces, self-hosted latin subsets.
- Everything else: painted in code.
