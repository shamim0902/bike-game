/**
 * What the jobs share: where their targets go, how a clock runs, how progress round the
 * lap is counted, and what each one pays. Pure, so the rules are testable without a
 * scene. The activities in ./activities/ turn these into play.
 */
import { mulberry32 } from './town.js'

// A fresh random source for one run of a job. Same job, different night, different spots.
export function runRandom() {
  return mulberry32(Math.floor(Math.random() * 4294967296))
}

// Signed distance along the lap from one point to another, the short way round.
export function wrapDelta(from, to, length) {
  let d = (to - from) % length
  if (d < -length / 2) d += length
  else if (d > length / 2) d -= length
  return d
}

// Distance forward along the lap, the long way if that is the way the road goes.
export function distanceAhead(from, to, length) {
  return ((to - from) % length + length) % length
}

/**
 * Targets strung out ahead along the lap: the first at least `minGap` on, each next one
 * between `minGap` and `maxGap` further, at a random offset across the road within
 * `lateral`. Positions wrap; `s` is always within one lap.
 */
export function spreadTargets({ length, from, count, rng, minGap, maxGap, lateral = 3 }) {
  const out = []
  let s = from + minGap + rng() * (maxGap - minGap)
  for (let i = 0; i < count; i++) {
    out.push({ s: ((s % length) + length) % length, lat: (rng() * 2 - 1) * lateral })
    s += minGap + rng() * (maxGap - minGap)
  }
  return out
}

// Forward distance covered round the lap, from wherever it starts counting.
export function createProgress(length) {
  let total = 0, last = null
  return {
    add(s) {
      if (last !== null) total += Math.max(0, wrapDelta(last, s, length))
      last = s
      return total
    },
    get total() { return total },
  }
}

// A countdown that can be slowed: while `slow` is on, time drains at `slowRate`.
export function createClock({ start, limit, slowRate = 0.5 }) {
  let deadline = start + limit, last = start
  return {
    tick(now, slow = false) {
      if (slow) deadline += (now - last) * (1 - slowRate)
      last = now
      return deadline - now
    },
    remaining: (now) => deadline - now,
    expired: (now) => now >= deadline,
    fraction: (now) => Math.max(0, Math.min(1, (deadline - now) / limit)),
    limit,
  }
}

export function formatSeconds(ms) {
  return `${Math.max(0, ms / 1000).toFixed(1)}s`
}

// --- what each job pays ---
export const PIZZA = {
  count: 5,
  reach: 3.6,
  // twenty seconds plus one for every ten metres the customer is away
  limit: (distance) => 20000 + (distance / 10) * 1000,
  // twenty dollars, up to fifteen more for a hot one
  pay: (remaining, limit) => 20 + Math.round(15 * Math.max(0, Math.min(1, remaining / limit))),
  perfectStars: 3,
}

export const COFFEE = {
  count: 3,
  reach: 3.6,
  pay: 15,
  // fifteen seconds plus one for every eight metres; cups are timed from the moment you ride
  limit: (distance) => 15000 + (distance / 8) * 1000,
  spillAfter: 600, // ms continuously off the road before a cup goes
  perfectStars: 2,
}

export const BLACKOUT = {
  count: 8,
  reach: 3.2,
  reveal: 16, // metres: a marker only shows once you are this close
  each: 5,
  all: 40,
  perfectStars: 3,
}

// Which cup spills: the one for the spot furthest ahead, so the near ones stay deliverable.
export function farthestPending(targets, from, length) {
  let pick = -1, far = -1
  targets.forEach((t, i) => {
    if (t.state !== 'pending') return
    const d = distanceAhead(from, t.s, length)
    if (d > far) { far = d; pick = i }
  })
  return pick
}

// --- phase 3: the personality places ---
export const STUNT = {
  duration: 60000,
  minAir: 250,   // ms in the air before a jump counts
  base: 10,
  perTenth: 4,   // dollars per tenth of a second airborne
  perfectStars: 2, // for a run that ends on the clock rather than in a claim
}
// What a landing pays. A clean landing on the road, by how long you flew.
export function stuntPay(airMs) {
  if (!Number.isFinite(airMs) || airMs < STUNT.minAir) return 0
  return STUNT.base + Math.round(airMs / 100) * STUNT.perTenth
}

export const MATTRESS = {
  limitKmh: 40,
  tumbleAfter: 1000, // ms continuously over the limit before it flies off
  reach: 3.6,
  pay: 70,
  perfectStars: 2,
}

export const PREDICTION = {
  fallbackMs: 45000,
  factor: 0.97,   // she predicts a little better than your best
  closeMs: 1000,  // beat it by less than this for the big prize
  big: 100,
  small: 30,
}
export function predictLap(bestMs) {
  return Number.isFinite(bestMs) && bestMs > 0 ? Math.round(bestMs * PREDICTION.factor) : PREDICTION.fallbackMs
}
// Pay for an actual lap against the prediction: nothing if slower, the big prize if you
// only just beat it, the small one if you beat it by a lot (she was clearly wrong).
export function predictionPay(predictedMs, actualMs) {
  const margin = predictedMs - actualMs
  if (margin < 0) return 0
  return margin < PREDICTION.closeMs ? PREDICTION.big : PREDICTION.small
}

export const SOCK = {
  limit: 90000,
  along: 40,    // metres either way along the road it may hide
  lateral: 10,  // metres off the centreline, so on the verge or in the trees
  reveal: 5,
  reach: 1.6,
  pay: 40,
  perfectStars: 2,
}
// The needle: how the distance reads.
export function warmth(distance) {
  if (distance < 5) return 'Hot!'
  if (distance < 12) return 'Warm'
  if (distance < 25) return 'Cool'
  return 'Cold'
}
