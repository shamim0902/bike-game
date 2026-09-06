/**
 * Which place opens onto what. A place with no entry here still stands beside the road;
 * its door reads "Coming soon" and Enter does nothing yet.
 *
 * An activity is a plain object:
 *   id             the place id it belongs to (src/data/places.js)
 *   kind           'world': runs in the town. 'scene': brings its own screen (`component`, a Vue
 *                  component given the store and emitting 'leave').
 *   title          what the HUD and the door say
 *   lowerIsBetter  how to compare results for the door's "best"
 *   formatBest(v)  the door's line for a saved best, or null for none
 *   enter(ctx) / update(ctx) / interrupt(ctx, reason) / exit(ctx)
 */
import timeTrial from './timeTrial'
import pizzaRun from './pizzaRun'
import coffeeRun from './coffeeRun'
import blackout from './blackout'
import stuntClaim from './stuntClaim'
import mattressHaul from './mattressHaul'
import prediction from './prediction'
import sockHunt from './sockHunt'
import shop from './shop'

const activities = [timeTrial, pizzaRun, coffeeRun, blackout, stuntClaim, mattressHaul, prediction, sockHunt, shop]
const byId = Object.fromEntries(activities.map((a) => [a.id, a]))

export function activityFor(placeId) {
  return byId[placeId] ?? null
}
