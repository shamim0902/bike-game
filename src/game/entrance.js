/**
 * Going into a place. The flow the whole town hangs on, as a state machine with no
 * three.js in it, so it can be tested and so the component only has to ask "what now".
 *
 *   idle ──enter──▶ dismounting ──dismounted──▶ toDoor ──arrived──▶ inside ──leave──▶ idle
 *                        │                         │
 *                        └────────cancel───────────┴──▶ idle
 *
 * `dismounting` is the existing get-off-the-bike animation. `toDoor` is the automatic walk
 * from beside the bike to the door under the sign; any input cancels it and leaves the
 * rider on foot where he is. `inside` is the activity's time. A scene activity will grow an
 * `atDoor` phase after `inside`; a world activity goes straight back to idle.
 */
const TRANSITIONS = {
  idle: { enter: 'dismounting' },
  dismounting: { dismounted: 'toDoor', cancel: 'idle' },
  toDoor: { arrived: 'inside', cancel: 'idle' },
  inside: { leave: 'idle' },
}

export const PHASES = Object.keys(TRANSITIONS)

// The next phase for an event, or null when the event means nothing in this phase.
export function step(phase, event) {
  return TRANSITIONS[phase]?.[event] ?? null
}

// Can the rider go in from here? Parked in a bay, on the bike, stopped, on the ground,
// and the place has something to go into.
export function canEnter({ phase, rideMode, stop, speed, air, height, riderReady, mounted, hasActivity }) {
  return phase === 'idle' && rideMode === 'riding' && stop >= 0 && !!hasActivity && !!riderReady && !!mounted
    && Math.abs(speed) <= 0.8 && !air && height <= 0.05
}

export function createEntrance() {
  let phase = 'idle', stop = -1
  return {
    get phase() { return phase },
    get stop() { return stop },
    // Applies an event. Returns the new phase, or null if the event did not apply.
    send(event, at = -1) {
      const next = step(phase, event)
      if (!next) return null
      if (event === 'enter') stop = at
      phase = next
      if (next === 'idle') stop = -1
      return next
    },
  }
}

/**
 * The walk to the door as waypoints, so the rider goes round the bike rather than
 * through it: first to a point behind the bike, then straight to the door.
 * Positions are {x, z}; `forward` is the bike's unit heading vector.
 */
export function doorPath({ bike, forward, door, clearance = 2.6 }) {
  const behind = { x: bike.x - forward.x * clearance, z: bike.z - forward.z * clearance }
  return [behind, door]
}

// Heading (the game's convention: x += sin(h), z -= cos(h)) from one point toward another.
export function headingTo(from, to) {
  return Math.atan2(to.x - from.x, -(to.z - from.z))
}

// Moves `foot` toward the next waypoint at `speed`. Returns true when the whole path is done.
export function advanceAlong(foot, path, speed, dt, reach = 0.12) {
  while (path.length) {
    const target = path[0]
    const dx = target.x - foot.x, dz = target.z - foot.z
    const dist = Math.hypot(dx, dz)
    if (dist <= reach) { path.shift(); continue }
    const stepLen = Math.min(dist, speed * dt)
    foot.x += (dx / dist) * stepLen
    foot.z += (dz / dist) * stepLen
    foot.h = headingTo({ x: foot.x - dx, z: foot.z - dz }, target)
    foot.v = speed
    return false
  }
  foot.v = 0
  return true
}
