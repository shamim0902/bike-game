// No render-loop dependencies: timings use a monotonic clock, not capped physics dt.
export function formatLapTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const tenths = Math.floor(ms / 100)
  return `${String(Math.floor(tenths / 600)).padStart(2, '0')}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`
}

export function readBestLap(storage, key) {
  try {
    const value = Number(storage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch { return null }
}

export function saveBestLap(storage, key, ms) {
  try { if (Number.isFinite(ms) && ms > 0) storage.setItem(key, String(ms)) } catch { /* storage is optional */ }
}

export function createLapTimer({ length, start, checkpoints = 8, maxStep = 6, best = null }) {
  const wrap = s => ((s - start) % length + length) % length
  const gateLength = length / checkpoints
  let previous = null, startedAt = null, nextGate = 1, laps = 0, last = null, valid = true
  let message = 'Cross the checkered line to start.'
  best = Number.isFinite(best) && best > 0 ? best : null

  function cancel(reason = 'Lap canceled · cross the line to retry.') {
    if (startedAt !== null) message = reason
    startedAt = null; nextGate = 1; previous = null; valid = true
  }

  function missCheckpoint() {
    if (startedAt === null) return
    valid = false
    message = 'Checkpoint missed · cross the finish line to retry.'
  }

  function update({ s, now, onRoad = true, forward = true }) {
    if (!Number.isFinite(s) || !Number.isFinite(now)) { cancel(); return null }
    if (!forward) { cancel('Wrong way · cross the line forward to retry.'); return null }
    const position = wrap(s), before = previous
    previous = { position, now, onRoad }
    if (!before) return null
    let delta = position - before.position
    if (delta < -length / 2) delta += length
    else if (delta > length / 2) delta -= length
    if (now < before.now) { cancel(); return null }
    if (Math.abs(delta) > maxStep) { missCheckpoint(); return null }
    if (delta < 0) { cancel('Wrong way · cross the line forward to retry.'); return null }
    if (!delta) return null

    const end = before.position + delta
    for (let gate = Math.floor(before.position / gateLength) + 1; gate * gateLength <= end; gate++) {
      const index = gate % checkpoints
      const crossedAt = before.now + (now - before.now) * (gate * gateLength - before.position) / delta
      // Grass does not stop the clock. Only gate crossings on the road qualify.
      if (!onRoad || !before.onRoad) { missCheckpoint(); continue }
      if (index === 0) {
        let result = null
        if (startedAt !== null && valid && nextGate === checkpoints) {
          last = crossedAt - startedAt
          laps++
          const newBest = best === null || last < best
          if (newBest) best = last
          message = `${newBest ? 'New best' : 'Lap complete'} · ${formatLapTime(last)}`
          result = { time: last, newBest }
        } else message = startedAt === null ? 'Lap started · pass each checkpoint on the road.' : 'Lap not counted · new attempt started.'
        startedAt = crossedAt; nextGate = 1; valid = true
        return result
      }
      if (startedAt !== null) {
        if (index !== nextGate) missCheckpoint()
        else nextGate++
      }
    }
    return null
  }

  function snapshot(now) {
    return { running: startedAt !== null, elapsed: startedAt === null ? 0 : Math.max(0, now - startedAt),
      laps, last, best, checkpoints: nextGate - 1, totalCheckpoints: checkpoints - 1, message }
  }
  return { update, cancel, snapshot }
}
