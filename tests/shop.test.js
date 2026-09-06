import assert from 'node:assert/strict'
import test from 'node:test'
import { UPGRADES, nextPrice, tuning } from '../src/game/shop.js'

test('tier zero is the stock bike', () => {
  const t = tuning({ speed: 0, boost: 0, horn: 0 })
  assert.deepEqual(t, { top: 1, accel: 1, boostTop: 1, boostAccel: 1, boostAfter: 1.2, hornGain: 0.85, hornRate: 1, honks: 1 })
  assert.deepEqual(tuning(), t, 'a missing upgrades object is stock too')
})

test('the full rebuild', () => {
  const t = tuning({ speed: 3, boost: 3, horn: 3 })
  assert.ok(Math.abs(t.top - 1.3) < 1e-9)
  assert.ok(Math.abs(t.boostAfter - 0.6) < 1e-9)
  assert.equal(t.honks, 2)
  assert.equal(nextPrice('speed', 0), 120)
  assert.equal(nextPrice('speed', 3), null)
  assert.equal(nextPrice('wings', 0), null)
  for (const k of Object.keys(UPGRADES)) assert.equal(UPGRADES[k].prices.length, 3)
})
