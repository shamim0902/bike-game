import assert from 'node:assert/strict'
import test from 'node:test'
import { wrapDelta, distanceAhead, spreadTargets, createProgress, createClock, PIZZA, COFFEE, BLACKOUT, farthestPending, formatSeconds, stuntPay, predictLap, predictionPay, warmth } from '../src/game/jobs.js'
import { mulberry32 } from '../src/game/town.js'

test('lap arithmetic wraps the right way', () => {
  assert.equal(wrapDelta(270, 10, 276), 16)
  assert.equal(wrapDelta(10, 270, 276), -16)
  assert.equal(distanceAhead(270, 10, 276), 16)
  assert.equal(distanceAhead(10, 270, 276), 260)
})

test('targets are strung ahead within the gaps, across the road within the lateral, and wrapped', () => {
  const rng = mulberry32(3)
  const t = spreadTargets({ length: 276, from: 250, count: 5, rng, minGap: 28, maxGap: 55, lateral: 3 })
  assert.equal(t.length, 5)
  let prev = 250
  for (const x of t) {
    assert.ok(x.s >= 0 && x.s < 276, `wrapped: ${x.s}`)
    const gap = distanceAhead(prev, x.s, 276)
    assert.ok(gap >= 28 && gap <= 55, `gap ${gap}`)
    assert.ok(Math.abs(x.lat) <= 3)
    prev = x.s
  }
})

test('progress counts only forward travel and survives the lap wrapping', () => {
  const p = createProgress(276)
  p.add(270); p.add(274); p.add(2); p.add(0); p.add(10)
  assert.ok(Math.abs(p.total - 18) < 1e-9, `got ${p.total}`)
})

test('a clock drains at full speed, and at half speed while slowed', () => {
  const c = createClock({ start: 1000, limit: 10000 })
  assert.equal(c.remaining(1000), 10000)
  assert.equal(c.tick(3000), 8000)
  assert.equal(c.tick(5000, true), 7000, 'two seconds slowed cost one')
  assert.equal(c.expired(11999), false)
  assert.equal(c.expired(12000), true)
  assert.equal(c.fraction(7000), 0.5)
})

test('pay rules', () => {
  assert.equal(PIZZA.limit(100), 30000)
  assert.equal(PIZZA.pay(30000, 30000), 35)
  assert.equal(PIZZA.pay(0, 30000), 20)
  assert.equal(PIZZA.pay(-500, 30000), 20)
  assert.equal(COFFEE.limit(80), 25000)
  assert.equal(BLACKOUT.each * BLACKOUT.count + BLACKOUT.all, 80)
  assert.equal(formatSeconds(12345), '12.3s')
  assert.equal(formatSeconds(-3), '0.0s')
})

test('the cup that spills is the one for the furthest pending spot', () => {
  const targets = [{ s: 30, state: 'pending' }, { s: 90, state: 'done' }, { s: 150, state: 'pending' }]
  assert.equal(farthestPending(targets, 10, 276), 2)
  assert.equal(farthestPending(targets, 100, 276), 0, 'from 100, the spot at 30 is the long way round')
  assert.equal(farthestPending([{ s: 1, state: 'done' }], 0, 276), -1)
})

test('stunts pay by air time, and only for real jumps', () => {
  assert.equal(stuntPay(100), 0)
  assert.equal(stuntPay(250), 10 + 3 * 4)
  assert.equal(stuntPay(1000), 10 + 10 * 4)
  assert.equal(stuntPay(NaN), 0)
})

test('the psychic predicts a touch under your best, and pays most for a near miss', () => {
  assert.equal(predictLap(null), 45000)
  assert.equal(predictLap(40000), 38800)
  assert.equal(predictionPay(38800, 39000), 0, 'slower than predicted')
  assert.equal(predictionPay(38800, 38000), 100, 'beat it by 0.8 s')
  assert.equal(predictionPay(38800, 30000), 30, 'beat it by miles: she was wrong')
})

test('the sock needle', () => {
  assert.equal(warmth(3), 'Hot!'); assert.equal(warmth(8), 'Warm'); assert.equal(warmth(20), 'Cool'); assert.equal(warmth(60), 'Cold')
})
