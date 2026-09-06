import assert from 'node:assert/strict'
import test from 'node:test'
import { step, canEnter, createEntrance, doorPath, headingTo, advanceAlong } from '../src/game/entrance.js'

test('the phases follow the one path in, and cancel only before the door', () => {
  const e = createEntrance()
  assert.equal(e.phase, 'idle')
  assert.equal(e.send('dismounted'), null, 'events out of order do nothing')
  assert.equal(e.send('enter', 6), 'dismounting')
  assert.equal(e.stop, 6)
  assert.equal(e.send('dismounted'), 'toDoor')
  assert.equal(e.send('arrived'), 'inside')
  assert.equal(e.send('cancel'), null, 'inside cannot be cancelled, only left')
  assert.equal(e.send('leave'), 'idle')
  assert.equal(e.stop, -1)
})

test('any input during the walk cancels it back to idle', () => {
  const e = createEntrance()
  e.send('enter', 2); e.send('dismounted')
  assert.equal(e.send('cancel'), 'idle')
  assert.equal(step('dismounting', 'cancel'), 'idle')
  assert.equal(step('idle', 'cancel'), null)
})

test('entering needs a parked, grounded bike in a bay with somewhere to go', () => {
  const ok = { phase: 'idle', rideMode: 'riding', stop: 3, speed: 0.4, air: 0, height: 0, riderReady: true, mounted: true, hasActivity: true }
  assert.equal(canEnter(ok), true)
  assert.equal(canEnter({ ...ok, speed: -0.5 }), true, 'a slow roll backward still counts as stopped')
  assert.equal(canEnter({ ...ok, speed: 1.2 }), false)
  assert.equal(canEnter({ ...ok, stop: -1 }), false)
  assert.equal(canEnter({ ...ok, hasActivity: false }), false)
  assert.equal(canEnter({ ...ok, rideMode: 'walking' }), false)
  assert.equal(canEnter({ ...ok, air: 1 }), false)
  assert.equal(canEnter({ ...ok, height: 0.3 }), false)
  assert.equal(canEnter({ ...ok, phase: 'inside' }), false)
  assert.equal(canEnter({ ...ok, riderReady: false }), false)
})

test('the walk goes behind the bike first, then to the door', () => {
  const path = doorPath({ bike: { x: 0, z: 0 }, forward: { x: 0, z: -1 }, door: { x: 5, z: 1 } })
  assert.deepEqual(path, [{ x: 0, z: 2.6 }, { x: 5, z: 1 }])
})

test('heading follows the game convention: x grows with sin(h), z shrinks with cos(h)', () => {
  assert.ok(Math.abs(headingTo({ x: 0, z: 0 }, { x: 0, z: -1 })) < 1e-9, 'straight ahead is 0')
  assert.ok(Math.abs(headingTo({ x: 0, z: 0 }, { x: 1, z: 0 }) - Math.PI / 2) < 1e-9, '+x is a right turn')
})

test('advancing walks the path at the given speed and reports arrival once', () => {
  const foot = { x: 0, z: 0, h: 0, v: 0 }
  const path = [{ x: 0, z: -2 }, { x: 3, z: -2 }]
  let done = false, frames = 0
  while (!done && frames < 200) { done = advanceAlong(foot, path, 2, 0.05); frames++ }
  assert.equal(done, true)
  assert.ok(Math.abs(foot.x - 3) < 0.15 && Math.abs(foot.z + 2) < 0.15, `ends at the door, got ${foot.x},${foot.z}`)
  assert.equal(foot.v, 0)
  // 5 m at 2 m/s is 2.5 s; at 20 fps that is 50 frames, give or take the reach radius
  assert.ok(frames >= 45 && frames <= 52, `took ${frames} frames`)
  assert.equal(advanceAlong(foot, path, 2, 0.05), true, 'an empty path is already done')
})
