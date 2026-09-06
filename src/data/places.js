/**
 * The places in town. Buildings beside the road, each with its own parking bay and a door
 * the rider walks to. Where they stand is decided by src/game/town.js from a seed, not by
 * this list; the billboards are just ads and have nothing to do with them.
 *
 *   building  what to build: 'booth' | 'house' | 'shop' | 'gate' (see buildPlace in ProjectDrive.vue)
 *   emoji     the picture on the HUD card
 *   blurb     one line on the card
 *
 *   lease     what it costs to open the place the first time; 0 means it is always open
 *
 * Which place opens onto what is src/game/activities/index.js, keyed by id. A place
 * without an activity still stands there; its door says "Coming soon".
 */
export default [
  { id: 'camera', name: 'Lap Police Dept.', emoji: '📸', building: 'booth', blurb: 'One camera, no film, strong opinions about your lap.' },
  { id: 'pizza', name: 'Slice Lord', emoji: '🍕', building: 'shop', blurb: 'Open 24 hours. Not in a row.' },
  { id: 'diner', name: 'The diner', emoji: '☕', building: 'shop', blurb: "World's best coffee, by a margin of one." },
  { id: 'bulb', name: 'Bulb Barn', emoji: '💡', building: 'house', blurb: 'They will know if your lights are off.' },
  { id: 'nap', name: 'Nap City', emoji: '🛏️', building: 'house', blurb: 'The sale has been ending since 1994.', lease: 80 },
  { id: 'zola', name: 'Madame Zola', emoji: '🔮', building: 'house', blurb: 'She already knows your next lap time.', lease: 120 },
  { id: 'yard', name: 'Highways Dept.', emoji: '🚧', building: 'gate', blurb: 'The people who made the road a loop. They also sell parts.' },
  { id: 'saul', name: 'Saul-ish & Sons', emoji: '⚖️', building: 'shop', blurb: 'We sue potholes. Ramps are a grey area.', lease: 150 },
  { id: 'sock', name: 'The laundromat', emoji: '🧦', building: 'booth', blurb: 'Lost: one left sock. Reward: the right one, and cash.', lease: 60 },
]
