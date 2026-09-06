import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutPlaces, ringDistance, mulberry32 } from '../src/game/town.js'

test('ring distance takes the short way round', () => {
  assert.equal(ringDistance(5, 95, 100), 10)
  assert.equal(ringDistance(10, 40, 100), 30)
  assert.equal(ringDistance(250, 20, 276), 46)
})

test('the same seed gives the same town, a different seed a different one', () => {
  const a = layoutPlaces({ length: 276, count: 7, seed: 7 })
  const b = layoutPlaces({ length: 276, count: 7, seed: 7 })
  const c = layoutPlaces({ length: 276, count: 7, seed: 8 })
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
  assert.equal(mulberry32(1)(), mulberry32(1)())
})

test('places keep clear of the signs, the ramps and each other, and come back sorted', () => {
  const length = 275.9
  const signs = Array.from({ length: 12 }, (_, i) => ({ s: 24 + i * length / 12, r: 7 }))
  const ramps = [{ s: 30, r: 9 }, { s: 150, r: 9 }]
  const places = layoutPlaces({ length, count: 7, avoid: [...signs, ...ramps], gap: 16, seed: 7 })
  assert.equal(places.length, 7)
  for (let i = 0; i < places.length; i++) {
    const p = places[i]
    assert.ok(p.s >= 0 && p.s < length)
    assert.ok([1, -1].includes(p.side))
    for (const a of [...signs, ...ramps]) assert.ok(ringDistance(p.s, a.s, length) >= a.r, `place ${i} at ${p.s.toFixed(1)} too near ${a.s}`)
    for (let j = 0; j < i; j++) assert.ok(ringDistance(p.s, places[j].s, length) >= 16, `places ${i} and ${j} too close`)
    if (i) assert.ok(places[i - 1].s <= p.s)
  }
})

test('a lap with no room returns fewer places rather than overlapping ones', () => {
  const places = layoutPlaces({ length: 50, count: 10, gap: 20, seed: 3 })
  assert.ok(places.length >= 1 && places.length <= 2)
  for (let i = 1; i < places.length; i++) assert.ok(ringDistance(places[i].s, places[0].s, 50) >= 20)
})
