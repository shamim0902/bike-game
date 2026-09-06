import assert from 'node:assert/strict'
import test from 'node:test'
import { createLapTimer, formatLapTime, readBestLap, saveBestLap } from '../src/composables/useLapTimer.js'

function driver(best = null) {
  const timer = createLapTimer({ length: 80, start: 10, best })
  let now = 0
  const move = (s, options = {}) => timer.update({ s, now: now += 100, ...options })
  return { timer, move, snapshot: () => timer.snapshot(now) }
}

test('waits for a forward start-line crossing, then counts an ordered full lap', () => {
  const d = driver()
  d.move(8)
  assert.equal(d.snapshot().running, false)
  d.move(10)
  assert.equal(d.snapshot().running, true)
  for (let s = 12; s < 90; s += 2) d.move(s)
  assert.equal(d.snapshot().checkpoints, 7)
  const result = d.move(90)
  assert.deepEqual(result, { time: 4000, newBest: true })
  assert.equal(d.snapshot().laps, 1)
  assert.equal(d.snapshot().last, 4000)
  assert.equal(d.snapshot().best, 4000)
  assert.equal(d.snapshot().running, true, 'next lap should start automatically')
  assert.equal(d.snapshot().checkpoints, 0)
  for (let s = 92; s <= 170; s += 2) d.move(s)
  assert.equal(d.snapshot().laps, 2)
})

test('uses monotonic elapsed time and interpolates the start-line crossing', () => {
  const timer = createLapTimer({ length: 80, start: 10 })
  timer.update({ s: 9, now: 1000 })
  timer.update({ s: 11, now: 1200 })
  assert.equal(timer.snapshot(5100).elapsed, 4000)
})

test('cannot record laps by oscillating across the finish line or driving backward', () => {
  const d = driver()
  for (let i = 0; i < 10; i++) { d.move(8); d.move(12) }
  assert.equal(d.snapshot().laps, 0)
  d.move(11, { forward: false })
  assert.equal(d.snapshot().running, false)
})

test('off-road excursions keep the clock running and still allow a valid lap', () => {
  const d = driver()
  d.move(8); d.move(10)
  d.move(12, { onRoad: false }); d.move(14, { onRoad: false })
  assert.equal(d.snapshot().running, true)
  assert.equal(d.snapshot().elapsed, 200)
  for (let s = 16; s <= 90; s += 2) d.move(s)
  assert.equal(d.snapshot().laps, 1)
})

test('missing a checkpoint off road preserves elapsed time but cannot record a lap', () => {
  const d = driver()
  d.move(8); d.move(10)
  for (let s = 12; s <= 24; s += 2) d.move(s, { onRoad: false })
  assert.equal(d.snapshot().running, true)
  assert.equal(d.snapshot().elapsed, 700)
  for (let s = 26; s <= 90; s += 2) d.move(s)
  assert.equal(d.snapshot().laps, 0)
  assert.equal(d.snapshot().best, null)
  assert.equal(d.snapshot().running, true, 'on-road finish crossing starts a new attempt')
})

test('jumping past checkpoints cannot record a lap', () => {
  const d = driver()
  d.move(8); d.move(10); d.move(40)
  for (let s = 42; s <= 90; s += 2) d.move(s)
  assert.equal(d.snapshot().laps, 0)
  assert.equal(d.snapshot().best, null)
})

test('explicit cancellation ends timing without saving a record', () => {
  const d = driver()
  d.move(8); d.move(10); d.timer.cancel('Dismounted')
  assert.equal(d.snapshot().running, false)
  assert.equal(d.snapshot().elapsed, 0)
  assert.equal(d.snapshot().best, null)
})

test('a canceled lap cannot resume at a checkpoint and keeps the previous best', () => {
  const d = driver(3500)
  d.move(8); d.move(10); d.timer.cancel()
  for (let s = 12; s <= 90; s += 2) d.move(s)
  assert.equal(d.snapshot().laps, 0)
  assert.equal(d.snapshot().running, true, 'finish crossing begins a fresh attempt')
  for (let s = 92; s <= 170; s += 2) d.move(s)
  assert.equal(d.snapshot().laps, 1)
  assert.equal(d.snapshot().best, 3500)
})

test('storage is optional and malformed/nonpositive records are ignored', () => {
  for (const value of [null, '', 'NaN', 'Infinity', '-1', '0', 'garbage']) {
    assert.equal(readBestLap({ getItem: () => value }, 'key'), null)
  }
  const memory = new Map()
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) }
  saveBestLap(storage, 'key', 12345)
  assert.equal(readBestLap(storage, 'key'), 12345)
  const blocked = { getItem() { throw Error('blocked') }, setItem() { throw Error('quota') } }
  assert.equal(readBestLap(blocked, 'key'), null)
  assert.doesNotThrow(() => saveBestLap(blocked, 'key', 12345))
})

test('formats minutes, seconds, and tenths without rounding across a minute', () => {
  assert.equal(formatLapTime(null), '—')
  assert.equal(formatLapTime(0), '00:00.0')
  assert.equal(formatLapTime(59999), '00:59.9')
  assert.equal(formatLapTime(61234), '01:01.2')
})
