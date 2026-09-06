import assert from 'node:assert/strict'
import test from 'node:test'
import { createStore, parseSave, emptySave, SAVE_KEY } from '../src/game/store.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    dump: () => data,
  }
}

test('a missing or broken save starts fresh', () => {
  assert.deepEqual(parseSave(null), emptySave())
  assert.deepEqual(parseSave('not json'), emptySave())
  assert.deepEqual(parseSave('[1,2]'), emptySave())
  assert.deepEqual(parseSave('{"cash":-5,"stars":"x","best":{"camera":0,"pizza":-1,"ok":41300}}'),
    { v: 1, cash: 0, stars: 0, best: { ok: 41300 }, upgrades: { speed: 0, boost: 0, horn: 0 }, leased: [] })
})

test('records a best only when it is better, by the direction the activity says', () => {
  const storage = memoryStorage()
  const store = createStore({ storage })
  assert.equal(store.record('camera', 45000, { lowerIsBetter: true }), true)
  assert.equal(store.record('camera', 46000, { lowerIsBetter: true }), false)
  assert.equal(store.record('camera', 44000, { lowerIsBetter: true }), true)
  assert.equal(store.record('pizza', 300), true)
  assert.equal(store.record('pizza', 200), false)
  assert.equal(store.record('pizza', NaN), false)
  assert.equal(store.record('pizza', 0), false)
  assert.deepEqual(JSON.parse(storage.dump()[SAVE_KEY]).best, { camera: 44000, pizza: 300 })
})

test('a store reads back what an earlier one wrote', () => {
  const storage = memoryStorage()
  const first = createStore({ storage })
  first.record('camera', 41300, { lowerIsBetter: true })
  first.earn({ cash: 120, stars: 3 })
  const second = createStore({ storage })
  assert.equal(second.save.best.camera, 41300)
  assert.equal(second.save.cash, 120)
  assert.equal(second.save.stars, 3)
  second.reset()
  assert.deepEqual(createStore({ storage }).save, emptySave())
})

test('works with no storage at all', () => {
  const store = createStore({ storage: null })
  assert.equal(store.record('camera', 100, { lowerIsBetter: true }), true)
  store.earn({ cash: 5 })
  assert.equal(store.save.cash, 5)
  const throwing = { getItem() { throw new Error('nope') }, setItem() { throw new Error('nope') } }
  const store2 = createStore({ storage: throwing })
  assert.deepEqual(store2.save, emptySave())
  assert.equal(store2.record('camera', 100, { lowerIsBetter: true }), true)
})

test('cash buys upgrades one tier at a time, never past the top, never on credit', () => {
  const store = createStore({ storage: memoryStorage() })
  store.earn({ cash: 300 })
  assert.equal(store.upgrade('speed', 120), true)
  assert.equal(store.save.cash, 180)
  assert.equal(store.upgrade('speed', 240), false, 'cannot afford')
  assert.equal(store.save.upgrades.speed, 1)
  store.earn({ cash: 2000 })
  assert.equal(store.upgrade('speed', 240), true)
  assert.equal(store.upgrade('speed', 480), true)
  assert.equal(store.upgrade('speed', 1), false, 'already at the top')
  assert.equal(store.save.upgrades.speed, 3)
  assert.equal(store.upgrade('wings', 1), false)
})

test('leases: free places are always open, paid ones once', () => {
  const storage = memoryStorage()
  const store = createStore({ storage })
  assert.equal(store.isLeased('camera', 0), true)
  assert.equal(store.isLeased('saul', 150), false)
  assert.equal(store.lease('saul', 150), false, 'no cash yet')
  store.earn({ cash: 200 })
  assert.equal(store.lease('saul', 150), true)
  assert.equal(store.save.cash, 50)
  assert.equal(store.lease('saul', 150), true, 'already leased, no second charge')
  assert.equal(store.save.cash, 50)
  assert.deepEqual(createStore({ storage }).save.leased, ['saul'])
  assert.deepEqual(parseSave('{"upgrades":{"speed":9,"horn":-1},"leased":["a","a",3]}').upgrades, { speed: 3, boost: 0, horn: 0 })
  assert.deepEqual(parseSave('{"leased":["a","a",3]}').leased, ['a'])
})
