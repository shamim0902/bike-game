/**
 * The signs around the lap.
 *
 * Roadside billboards, the kind you actually pass: a lawyer, a mattress sale that never ends,
 * the world's best coffee. Each is drawn onto a canvas at scene build (see billboardTexture in
 * ProjectDrive.vue), so a sign is data, not an image file: a headline, a second line, the
 * small print at the bottom, a picture (an emoji, rendered big), and a paint job.
 *
 * `stars` is how many pickups float on the run-in to the sign. Between 2 and 12; the drive
 * clamps anything outside that.

 */
export default [
  { id: 'crashed', emoji: '⚖️', headline: 'Crashed?', line: 'We sue potholes.', small: 'Saul-ish & Sons · 1-800-OW-MY-BIKE', paint: 'red', stars: 8 },
  { id: 'coffee', emoji: '☕', headline: "World's best coffee", line: 'Also the only coffee for 40 km.', small: 'Next exit. Or the one after. We are not sure either.', paint: 'cream', stars: 6 },
  { id: 'mattress', emoji: '🛏️', headline: 'Mattress sale ends soon', line: 'Since 1994.', small: 'Nap City · open till we wake up', paint: 'blue', stars: 5 },
  { id: 'honk', emoji: '📯', headline: 'Honk if you love silence', line: 'Press H. Go on.', small: 'Paid for by your neighbours', paint: 'yellow', stars: 9 },
  { id: 'lights', emoji: '💡', headline: 'Your lights are off', line: "Probably. We can't see you either.", small: 'Bulb Barn · press L, we will know', paint: 'night', stars: 7 },
  { id: 'sock', emoji: '🧦', headline: 'Missing: left sock', line: 'Reward: the right one.', small: 'Last seen near the dryer. Answers to "Sock".', paint: 'cream', stars: 4 },
  { id: 'camera', emoji: '📸', headline: 'Speed camera ahead', line: "Smile! It's not real. Neither is the fine.", small: 'Lap Police Dept. · est. this morning', paint: 'blue', stars: 12 },
  { id: 'dentist', emoji: '🦷', headline: 'Dentist', line: 'We put the OW in WOW.', small: 'Dr. Molar · walk-ins welcome, limp-outs likely', paint: 'mint', stars: 5 },
  { id: 'pizza', emoji: '🍕', headline: 'Pizza. 24 hours.', line: 'Not in a row.', small: 'Slice Lord · exit whenever, we are probably open', paint: 'red', stars: 10 },
  { id: 'psychic', emoji: '🔮', headline: 'Psychic readings', line: "You already knew we'd say that.", small: 'Madame Zola knew you would read this', paint: 'purple', stars: 6 },
  { id: 'rent', emoji: '🪧', headline: 'This space for rent', line: 'Nobody else wanted it.', small: 'Call the billboard. It gets lonely out here.', paint: 'cream', stars: 3 },
  { id: 'exit', emoji: '🔁', headline: 'Last exit before the same road', line: 'Again. And again.', small: 'Nightlap Highways Dept. · you are not lost, it is a loop', paint: 'yellow', stars: 11 },
]
