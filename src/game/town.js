/**
 * Where the places go. Scattered along the lap rather than laid out evenly, so the town
 * feels found rather than planned, but from a fixed seed, so it is the same town every
 * night and a saved best still belongs to the place it was set at.
 *
 * Distances are metres along the centreline; `length` is the lap, so everything wraps.
 */

// A small deterministic PRNG (mulberry32). Same seed, same town.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// How far apart two points are along the lap, the short way round.
export function ringDistance(a, b, length) {
  const d = Math.abs(a - b) % length
  return Math.min(d, length - d)
}

/**
 * Picks `count` spots along the lap, each at least `gap` from the others and clear of
 * every `avoid` entry ({ s, r }: keep this far from s). Sides alternate at random.
 * Returns fewer than `count` only if the lap really has no room; sorted by `s`.
 */
export function layoutPlaces({ length, count, avoid = [], gap = 16, seed = 7, tries = 600 }) {
  const rnd = mulberry32(seed)
  const out = []
  const room = (s) => Math.min(
    ...avoid.map((a) => ringDistance(s, a.s, length) - a.r),
    ...out.map((o) => ringDistance(s, o.s, length) - gap),
    Infinity,
  )
  for (let i = 0; i < count; i++) {
    let best = null, bestRoom = -Infinity
    for (let t = 0; t < tries; t++) {
      const s = rnd() * length
      const r = room(s)
      if (r > bestRoom) { best = s; bestRoom = r }
      if (r >= 0) break
    }
    if (bestRoom < 0) break
    out.push({ s: best, side: rnd() < 0.5 ? 1 : -1 })
  }
  return out.sort((a, b) => a.s - b.s)
}
