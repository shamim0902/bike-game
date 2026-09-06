import assert from 'node:assert/strict'
import test from 'node:test'
import { createDriveInput, joystickPosition } from '../src/composables/useDriveInput.js'

test('joystick center/dead zone are neutral and full travel reaches full throttle', () => {
  assert.deepEqual(joystickPosition(0, 0, 44), { x: 0, y: 0, dx: 0, dy: 0 })
  assert.equal(joystickPosition(2, -2, 44).y, 0)
  assert.equal(joystickPosition(0, -44, 44).y, -1)
  assert.equal(joystickPosition(0, 88, 44).y, 1)
  assert.equal(joystickPosition(22, 0, 44).x, (.5 - .12) / .88)
})

test('diagonals steer and accelerate together, clamped inside the circular pad', () => {
  const position = joystickPosition(90, -90, 44)
  assert.ok(Math.abs(Math.hypot(position.dx, position.dy) - 44) < 1e-8)
  assert.ok(Math.abs(Math.hypot(position.x, position.y) - 1) < 1e-8)
  const controls = createDriveInput()
  controls.joystick(position)
  assert.ok(controls.input.right > .7 && controls.input.fwd > .7)
  assert.equal(controls.input.left, 0)
  assert.equal(controls.input.back, 0)
})

test('keyboard and thumb releases do not cancel each other', () => {
  const controls = createDriveInput()
  controls.joystick({ x: .4, y: -.6 })
  controls.button('key:w', 'fwd', true)
  controls.button('key:ArrowUp', 'fwd', true)
  controls.button('key:w', 'fwd', false)
  assert.equal(controls.input.fwd, 1)
  controls.button('key:ArrowUp', 'fwd', false)
  assert.equal(controls.input.fwd, .6)
  controls.button('key:d', 'right', true)
  controls.joystick({ x: 0, y: 0 })
  assert.equal(controls.input.right, 1)
  assert.equal(controls.input.fwd, 0)
  controls.button('key:d', 'right', false)
  assert.equal(controls.input.right, 0)
})

test('clearing controls releases every source and keeps the shared input object', () => {
  const controls = createDriveInput(), input = controls.input
  controls.button('key:s', 'back', true)
  controls.joystick({ x: -1, y: 0 })
  controls.clear()
  assert.equal(controls.input, input)
  assert.deepEqual(input, { fwd: 0, back: 0, left: 0, right: 0 })
  controls.button('key:d', 'right', true)
  assert.equal(input.back, 0)
  assert.equal(input.left, 0)
})
