# Nightlap: from a lap to a night town

Written 2026-09-06, revised the same day. The plan for turning the lap into a small open
world with places beside the road you can walk into. Owner's brief: "like Vice City with
different activities on it; park, press Enter, get off the bike, enter the activity", and
then: the billboards are just ads; the places are their own houses, gates and shops, scattered
beside the road, not tied to the billboards.

## The pitch

One night, one town, one bike. Funny billboards along the road, and between them, places:
a police booth, a pizza shop, a diner, houses, a highways yard. Ride up, pull into a place's
P bay, press Enter. You get off the bike, walk to the door, and the place opens as its own
activity. Finish, walk out, ride to the next one. Cash and stars earned inside unlock more
of the town.

The lap stops being the game. It becomes the road between places. Timed laps survive as one
of the places (the speed camera).

## What stays, what changes

Stays, unchanged: the circuit and its physics, the bike, the on-foot avatar with walk and run,
the parking bays and P detection, the star pickups, honk, lights, camera cycling, the
joystick, the minimap, the audio.

Changes:

- The lap timer is no longer on by default. It runs only inside the "Speed camera" activity.
- The HUD answers three questions: where am I, what is this place, what does Enter do.
- The parking bays move from the billboards to the places. A billboard is scenery.
- Places are small buildings beside the road, scattered from a seed (`src/game/town.js`)
  so the town is the same every night. Each has a bay, a lit door, and a name over it.
- Enter, when parked at a place, starts the entrance. It no longer does nothing.

Goes: nothing else. Do not rewrite ProjectDrive.vue. New code lives in `src/game/` and the
component calls into it.

## The numbers the design rests on

Measured against the real constants, headless, on 2026-09-06.

| Thing | Value |
|---|---|
| Lap length | 275.9 m |
| Signs | 12, one every 23.0 m, alternating sides |
| Parking bay | 2.3 m off the centreline, on the road |
| Door | 7.0 m off the centreline, on the verge; the building 3 m behind it |
| Sign post | 8.4 m off the centreline (road half-width 5.4 plus 3) |
| Walk from bay to door | 7.7 m round the back of the bike, 3.7 s at walking pace |
| Places | 7, at least 16 m apart, 7 m clear of any sign, seed 7 |
| Walk speed / run speed | 2.1 m/s / 4.8 m/s |
| Walking a whole lap | 131 s; running, 57 s |
| Mount reach (E works within) | 2.2 m |
| Dismount animation | 0.8 s (existing timeline) |

So an entrance, from Enter to the door opening, is about 4.5 seconds. That is long enough to
feel like arriving somewhere and short enough not to be skipped every time. If it drags in
play, the walk can be cut with any input.

## The entrance

The one flow everything hangs on. A small state machine, pure, unit tested, that
ProjectDrive.vue drives.

```
riding ──(in bay, speed < 0.8, Enter)──▶ dismounting ──▶ walking-to-door ──▶ inside
   ▲                                       (0.8 s)         (auto, ~3 s)         │
   │                                                                           │ exit
   └──(E within 2.2 m of bike)── walking ◀──── at-door ◀───────────────────────┘
```

- **riding → dismounting**: reuse the existing dismount timeline exactly. Same as pressing E.
- **walking-to-door**: input is ignored (any press cancels back to `walking`). The rider plays
  the walk clip along a straight line from the bay to the door marker. The camera eases to
  look at the sign. The billboard's glow rises.
- **inside**: the activity owns the screen. World activities keep the town rendering. Scene
  activities pause the town (the existing off-screen pause path) and show their own canvas
  or DOM.
- **at-door**: on exit, the rider stands at the door, the HUD shows the result and the reward,
  and the player walks back. Free walking; E near the bike mounts.

Touch: the HUD card is the Enter button. Escape, or a Leave button, exits an activity.
While inside, the joystick and honk/lights buttons hide unless the activity asks for them.

## The activity system

```
src/game/
  store.js            reactive save: cash, stars, best per activity, unlocked. localStorage nightlap:save:v1
  entrance.js         the state machine above, pure functions, tested
  activities/
    index.js          registry: sign id → activity module
    timeTrial.js      etc.
```

An activity module:

```js
export default {
  id: 'pizza',          // matches the sign id in src/data/billboards.js
  kind: 'world',        // 'world' runs in the town; 'scene' brings its own canvas or DOM
  title: 'Pizza run',
  door: 'Slice Lord',   // painted on the door
  enter(ctx) {},        // ctx: scene, track, bike, rider, hud, store, audio, gsap
  update(dt, ctx) {},   // world activities only, called from the render loop
  exit(ctx) {},         // returns { score, cash, stars } or null if abandoned
}
```

A sign with no activity yet still has a door. It reads "Coming soon" and Enter makes the
rider wave. Every door shows the best result on it once there is one, painted into the door
texture the same way the signs are.

## The places

Seven stand beside the road today (`src/data/places.js`). Each opens onto one activity; the
billboards' jokes carry over where they fit.

| Place | Building | Activity | Kind | What you do | Phase |
|---|---|---|---|---|---|
| Lap Police Dept. | booth | Time trial | world | The existing lap timer and checkpoints. Best lap on the door. | 1 |
| Slice Lord | shop | Pizza run | world | Houses light up around the lap. Deliver five before they go cold. Boost keeps them hot. | 2 |
| The diner | shop | Coffee run | world | Three cups, three marked spots, one timer each. Off-road spills a cup. | 2 |
| Bulb Barn | house | Blackout | world | Lights forced off. Find eight glow markers in one lap. | 2 |
| Nap City | house | Mattress haul | world | A mattress on the back. Over 40 km/h for a second and it flies off. Deliver it half a lap away. Lease $80. | 3 |
| Madame Zola | house | The prediction | world | She predicts your next lap, 3% under your best. Beat it by under a second for $100, by more for $30. Lease $120. | 3 |
| Saul-ish & Sons | shop | Stunt claim | world | Sixty seconds on the ramps. Clean landings pay by air time. Land on the grass and the claim ends the run. Lease $150. | 3 |
| The laundromat | booth | Sock hunt | world, on foot | A sock within 40 m, off the road, 90 s, a warmer/colder needle. Lease $60. | 3 |
| Highways Dept. | gate | Parts counter | scene | The shop: engine, boost, horn, three tiers each. The first scene activity. | 3 |

Still to add: the neighbours' street (honk in time, a rhythm game), Dr. Molar (open wide),
the ghost lap at the Highways yard, and "Your sign" on the rent-a-space billboard.

Order of building: time trial first, because it already exists and proves the framework.
Then the three delivery-style jobs, which share one helper: targets placed around the lap,
with arrows, minimap dots and a timer. Phase 3 is personality and can be reordered by taste.

## Phases

Each phase ends with a build the owner reviews in the browser. Nothing is committed without
asking.

### Phase 1: the first door (built 2026-09-06, awaiting the owner's browser review)

- `src/game/store.js` and `src/game/entrance.js`, with tests.
- Places scattered along the lap (`src/game/town.js`, tested), each a building from boxes
  with a lit door face, a bay on the road and a door marker on the verge.
- The entrance flow wired into ProjectDrive.vue, using the existing dismount timeline.
- Time trial moved into `activities/timeTrial.js`. The lap HUD shows only inside it.
- The HUD card rewritten: place name, best result, "Enter to go in".
- Done when: park at the police booth, press Enter, get off, walk in, run a timed lap, walk
  out, and the best lap is painted on the door after a reload. Verified 2026-09-06, headless.

### Phase 2: three jobs (built 2026-09-06, awaiting the owner's browser review)

- The targets helper: markers on the road, an arrow on the bike, minimap dots, a timer.
- Pizza run, coffee run, blackout.
- Cash and stars as rewards. A wallet in the HUD. Doors show earnings.
- Done when: all three jobs can be played end to end on a phone with the joystick. Played
  end to end headless on 2026-09-06 (desktop size); the phone run is the owner's to do.
- Rules live in `src/game/jobs.js` (tested): pizza pays $20 plus up to $15 for heat, cups
  $15 each, glows $5 each plus $40 for all eight; a perfect run adds stars. Star pickups on
  the road now also bank one star each in the save.

### Phase 3: money and personality (built 2026-09-06, awaiting the owner's browser review)

Spending was pulled forward from phase 4: a currency you cannot spend is a score with a
dollar sign on it.

- The parts counter at the Highways Dept.: engine, boost and horn, three tiers each
  (`src/game/shop.js`, tested). Tiers multiply the drive's own constants, so the stock bike
  is tier zero of everything. Prices: 120/240/480, 100/200/400, 40/80/160.
- Leases: the four new places cost cash to open the first time (`lease` in places.js).
  Enter at a place you have not leased pays for it if you can, or says what it wants.
- A new best at the police booth pays $40, so the free places earn too.
- Stunt claim, mattress haul, the prediction, sock hunt.
- The scene-activity frame: an activity with `kind: 'scene'` brings a Vue component that
  is shown over the stage; the joystick hides and only Escape reaches the town. The shop
  is the first.
- The narrator. `useGuide.js` now has a voice: `reactTo` puts a line in a speech bubble on
  the stage, throttled per line. Places speak when you park; activities speak through
  `ctx.say`. Text only.
- Not built yet: honk in time and your sign, which need a rhythm and a text-entry scene.
- Done when: nine places, eight of them open to something. Verified headless 2026-09-06.

### Phase 4: a town, not a loop

- Side streets. `useCircuit.js` builds one loop; this phase adds spurs off it (cul-de-sacs
  with houses for the delivery jobs) before any second loop. A road graph is the last resort.
- Real buildings from a CC0 kit (Kenney city kit) in place of the box ones, and more of them.
- A few NPC cars on a fixed lane, for something to overtake.
- Ghost lap, open wide, honk in time, your sign. More things to buy: a paint job, a second bike.
- Done when: the minimap shows more than a circle.

### Phase 5: ship

- Title screen with the name. Controls screen. Credits screen: the bike model is CC-BY 4.0
  and must be credited on screen.
- Mobile performance budget: 60 fps on a mid-range phone with all doors and buildings.
- Register the domain, deploy, and decide whether to also put it on itch.io.

## Technical notes

- Splitting the monolith: keep ProjectDrive.vue as the world. Add `src/game/` and pull
  pieces out only when an activity needs them. Extraction on demand, never a rewrite.
- Tests are `node --test` over pure modules: the store, the entrance machine, scoring rules.
  No three.js in tests. Anything with a scene is verified in the browser.
- Verify with numbers: every distance or time in a proposal comes from a headless script
  against the real constants, as in the table above.
- Assets: Kenney assets are CC0. Any Sketchfab model needs its licence checked and credited.
- Copy: no em dashes. A comma, a colon, or a full stop.

## Decisions for the owner

1. **Currency.** Decided: cash from jobs, stars stay pickups with a collected count. Cash
   buys upgrades and leases; stars are a score for now.
2. **Behind scene activities, does the town keep running?** Recommended: paused. Cheaper, and
   the bike is where you left it.
3. **Phase 4 shape.** Recommended: side streets off the existing loop. Alternative: a second
   loop joined by a bridge, more road, more work in the circuit code.
4. **Name on the door.** Recommended: the sign's brand ("Slice Lord"), so the joke carries
   through. Alternative: the activity name.
