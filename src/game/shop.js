/**
 * What cash buys. Three upgrades, three tiers each, sold at the Highways Dept. gate.
 * `tuning` turns the save's tiers into the multipliers the drive applies to its own
 * constants (DRIVE and BOOST in ProjectDrive.vue), so the base bike is tier zero of
 * everything and nothing about it changes until something is bought.
 */
export const UPGRADES = {
  speed: {
    name: 'Engine', emoji: '🔧',
    prices: [120, 240, 480],
    tiers: ['A bigger carb: +10% top speed.', 'A freer exhaust: +20% top speed.', 'The full rebuild: +30% top speed.'],
  },
  boost: {
    name: 'Boost', emoji: '🔥',
    prices: [100, 200, 400],
    tiers: ['Kicks in sooner and pushes 15% harder.', 'Sooner again, 30% harder.', 'Almost instant, 45% harder.'],
  },
  horn: {
    name: 'Horn', emoji: '📯',
    prices: [40, 80, 160],
    tiers: ['Louder.', 'Louder, and it honks twice.', 'A foghorn. Twice.'],
  },
}

export function nextPrice(key, tier) {
  return UPGRADES[key]?.prices[tier] ?? null
}

export function tuning(upgrades = {}) {
  const s = upgrades.speed || 0, b = upgrades.boost || 0, h = upgrades.horn || 0
  return {
    top: 1 + 0.1 * s,          // multiplies DRIVE.top
    accel: 1 + 0.12 * s,       // multiplies DRIVE.accel, so the faster bike also gets there
    boostTop: 1 + 0.15 * b,    // multiplies BOOST.top
    boostAccel: 1 + 0.15 * b,  // multiplies BOOST.accel
    boostAfter: 1.2 - 0.2 * b, // seconds of held throttle before boost engages (BOOST.after)
    hornGain: 0.85 + 0.25 * h,
    hornRate: 1 - 0.08 * h,    // playback rate: lower is deeper
    honks: h >= 2 ? 2 : 1,
  }
}
