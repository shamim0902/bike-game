// Each input source owns its state: releasing a key must not cancel a held thumb.
export function createDriveInput() {
  const input = { fwd: 0, back: 0, left: 0, right: 0 }
  const buttons = new Map()
  let stick = { x: 0, y: 0 }
  function update() {
    Object.assign(input, {
      fwd: Math.max(0, -stick.y), back: Math.max(0, stick.y),
      left: Math.max(0, -stick.x), right: Math.max(0, stick.x)
    })
    for (const direction of buttons.values()) input[direction] = 1
  }
  return {
    input,
    button(source, direction, held) {
      if (!(direction in input)) return
      if (held) buttons.set(source, direction)
      else buttons.delete(source)
      update()
    },
    joystick(value) { stick = value; update() },
    clear() { buttons.clear(); stick = { x: 0, y: 0 }; update() }
  }
}

export function joystickPosition(dx, dy, radius, deadZone = 0.12) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return { x: 0, y: 0, dx: 0, dy: 0 }
  const distance = Math.hypot(dx, dy)
  if (!distance) return { x: 0, y: 0, dx: 0, dy: 0 }
  const extent = Math.min(distance, radius)
  const magnitude = Math.max(0, (extent / radius - deadZone) / (1 - deadZone))
  return { x: magnitude ? dx / distance * magnitude : 0, y: magnitude ? dy / distance * magnitude : 0, dx: dx / distance * extent, dy: dy / distance * extent }
}
