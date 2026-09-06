import assert from 'node:assert/strict'
import test from 'node:test'
import { lockGameScroll, recoverGameScrollOnOutside } from '../src/composables/useGameScrollLock.js'

function fixture(initiallyPaused = false) {
  let paused = initiallyPaused, top = 720
  const calls = [], body = { style: { overflow: 'auto' } }
  const smoother = {
    paused(value) { if (arguments.length) { paused = value; calls.push(['paused', value]) } return paused },
    scrollTop(value) { if (arguments.length) { top = value; calls.push(['scrollTop', value]) } return top },
    refresh() { calls.push(['refresh']) }
  }
  return { body, smoother, calls }
}

test('fullscreen exit never reinstates an expired scene pause', async () => {
  const f = fixture(true)
  const release = lockGameScroll(f)
  f.smoother.paused(false) // AboutDesk finishes while the game is expanded.
  await release()
  assert.equal(f.smoother.paused(), false)
  assert.equal(f.body.style.overflow, 'auto')
})

test('unlocks synchronously without waiting for layout or refresh', async () => {
  const f = fixture()
  let finishLayout
  const layout = new Promise(resolve => { finishLayout = resolve })
  const release = lockGameScroll({ ...f, afterLayout: () => layout })
  assert.equal(f.body.style.overflow, 'hidden')
  f.smoother.scrollTop(0)
  f.calls.length = 0
  const pending = release()
  assert.equal(f.smoother.paused(), false)
  assert.equal(f.body.style.overflow, 'auto')
  assert.deepEqual(f.calls, [['scrollTop', 720], ['paused', false]])
  // Input arriving during layout restoration must not be undone by later cleanup.
  f.smoother.scrollTop(800)
  finishLayout(); await pending
  assert.equal(f.smoother.scrollTop(), 800)
  assert.deepEqual(f.calls, [['scrollTop', 720], ['paused', false], ['scrollTop', 800], ['refresh']])
  assert.equal(release(), pending, 'exit button and fullscreenchange must share one cleanup')
})

test('unlocks wheel/touch input even if layout refresh fails', async () => {
  const f = fixture()
  f.smoother.refresh = () => { throw Error('refresh failed') }
  const release = lockGameScroll(f)
  await assert.rejects(release, /refresh failed/)
  assert.equal(f.smoother.paused(), false)
  assert.equal(f.body.style.overflow, 'auto')
})

test('works without ScrollSmoother in the full-window fallback', async () => {
  const body = { style: { overflow: '' } }
  const release = lockGameScroll({ body })
  assert.equal(body.style.overflow, 'hidden')
  await release()
  assert.equal(body.style.overflow, '')
})

function recoveryFixture() {
  const f = fixture(true), listeners = new Set(), inside = {}
  const document = {
    body: f.body,
    addEventListener(type, listener, capture) { assert.equal(type, 'pointerdown'); assert.equal(capture, true); listeners.add(listener) },
    removeEventListener(type, listener, capture) { assert.equal(type, 'pointerdown'); assert.equal(capture, true); listeners.delete(listener) }
  }
  return { ...f, document, inside, listeners, game: { contains: target => target === inside },
    pointer(target) { for (const listener of listeners) listener({ target }) } }
}

test('outside pointer releases a lingering lock once without changing scroll position', () => {
  const f = recoveryFixture()
  let releases = 0
  f.body.style.overflow = 'hidden'
  recoverGameScrollOnOutside({ ...f, getSmoother: () => f.smoother, overflow: 'auto', onRelease: () => releases++ })
  f.pointer(f.inside)
  assert.equal(f.smoother.paused(), true, 'inside clicks must keep game control')
  f.pointer({})
  assert.equal(f.smoother.paused(), false)
  assert.equal(f.body.style.overflow, 'auto')
  assert.deepEqual(f.calls, [['paused', false]], 'do not restore an old position or refresh')
  assert.equal(releases, 1)
  assert.equal(f.listeners.size, 0)
  f.smoother.paused(true)
  f.pointer({})
  assert.equal(f.smoother.paused(), true, 'later unrelated locks are not ours to release')
})

test('outside recovery respects another fullscreen/modal and can be canceled on re-entry or unmount', () => {
  const f = recoveryFixture()
  const stop = recoverGameScrollOnOutside({ ...f, getSmoother: () => f.smoother, overflow: 'auto', isBlocked: () => true })
  f.pointer({})
  assert.equal(f.smoother.paused(), true)
  assert.equal(f.listeners.size, 1)
  stop(); stop()
  assert.equal(f.listeners.size, 0)
})

test('outside recovery also restores native scrolling without a smoother', () => {
  const f = recoveryFixture()
  f.body.style.overflow = 'hidden'
  recoverGameScrollOnOutside({ ...f, getSmoother: () => undefined, overflow: '' })
  f.pointer({})
  assert.equal(f.body.style.overflow, '')
})
