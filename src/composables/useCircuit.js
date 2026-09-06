/**
 * The circuit the drive section runs on: a closed loop, the road surface built along it,
 * and the two queries the rest of the scene needs — "where on the track am I" and "how
 * far off the middle of it".
 *
 * It lives outside the component because none of it is scene-specific. The bike already
 * drove in two dimensions — an x, a z and a heading — so nothing here changes how it
 * moves; it only replaces the straight corridor it moved *inside*. What used to be
 * `z` clamped between 0 and -142, and `x` clamped to ±3.1, becomes a position measured
 * against a curve instead of against a pair of walls.
 *
 * Shape: a circle with a slow wobble in its radius. Control points are laid out at a
 * radius that varies with the angle, which is what gives the lap its fast sides and its
 * tight corners — and, because the radius is always positive and single-valued, the
 * track can never cross itself however the numbers are tuned. Hand-placed control points
 * make a prettier circuit and one bad edit turns it into a figure of eight.
 */
import * as THREE from 'three'

/**
 * @param radius  the circuit's mean radius, in metres
 * @param wobble  how much the radius varies — 0 is a plain circle, 0.3 is a hairpin
 * @param points  control points around the loop; the curve smooths between them
 */
export function buildCircuit({ radius = 42, wobble = 0.18, points = 12, samples = 600 } = {}) {
  const ctrl = []
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    // two harmonics: the first gives the loop its long side and its tight end, the
    // second stops the result being symmetrical enough to feel like a running track
    const r = radius * (1 + wobble * Math.sin(a * 2) + wobble * 0.55 * Math.sin(a * 3 + 0.8))
    ctrl.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal')

  // Resampled at even spacing rather than even curve parameter: a Catmull-Rom runs fast
  // through tight corners and slow down straights, and every distance measured below
  // assumes one sample is much like the next.
  const pts = curve.getSpacedPoints(samples)
  pts.pop()                                     // getSpacedPoints repeats the first point
  const n = pts.length
  const xs = new Float32Array(n), zs = new Float32Array(n)
  const tx = new Float32Array(n), tz = new Float32Array(n)
  const arc = new Float32Array(n)
  for (let i = 0; i < n; i++) { xs[i] = pts[i].x; zs[i] = pts[i].z }
  let total = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, k = (i - 1 + n) % n
    // central difference, so a sample's heading isn't biased toward the segment ahead
    let dx = xs[j] - xs[k], dz = zs[j] - zs[k]
    const m = Math.hypot(dx, dz) || 1
    tx[i] = dx / m; tz[i] = dz / m
    arc[i] = total
    total += Math.hypot(xs[j] - xs[i], zs[j] - zs[i])
  }

  /**
   * The closest point on the centreline to (x, z).
   *
   * A straight scan of every sample — 600 distance tests, which is nothing next to a
   * frame of rendering, and unlike a windowed search around the last answer it cannot
   * be fooled by a bike that has been lifted, spun or driven across the middle of the
   * loop. `hint` only shortens the scan; the result is the same either way.
   *
   * `side` is signed: positive is to the right of the direction of travel, so it doubles
   * as which side of the road you're on.
   */
  function nearest(x, z, out = {}) {
    let bi = 0, bd = Infinity
    for (let i = 0; i < n; i++) {
      const dx = x - xs[i], dz = z - zs[i]
      const d = dx * dx + dz * dz
      if (d < bd) { bd = d; bi = i }
    }
    // right of travel is forward x up, which in the ground plane is (-tz, tx)
    const dx = x - xs[bi], dz = z - zs[bi]
    out.i = bi
    out.s = arc[bi]
    out.side = dx * -tz[bi] + dz * tx[bi]
    out.dist = Math.hypot(dx, dz)
    out.x = xs[bi]; out.z = zs[bi]
    out.tx = tx[bi]; out.tz = tz[bi]
    return out
  }

  /** A world position `lateral` metres to the right of the centreline, `s` metres along it. */
  function at(s, lateral = 0, out = {}) {
    const i = Math.round(((s % total) + total) % total / total * n) % n
    out.x = xs[i] + -tz[i] * lateral
    out.z = zs[i] + tx[i] * lateral
    out.tx = tx[i]; out.tz = tz[i]
    out.i = i
    return out
  }

  /**
   * The road surface: one ribbon of triangles laid along the centreline.
   *
   * This is the whole road in a single draw call, where the straight version cloned a
   * tile model sixteen times. It is also the reason the loop costs nothing — a hundred
   * metres more track is a few hundred more vertices, not another sixteen models.
   */
  function ribbon(halfWidth, repeatEvery = 8) {
    const pos = new Float32Array(n * 2 * 3)
    const uv = new Float32Array(n * 2 * 2)
    const idx = new Uint32Array(n * 6)
    for (let i = 0; i < n; i++) {
      const rx = -tz[i] * halfWidth, rz = tx[i] * halfWidth
      pos[i * 6] = xs[i] - rx; pos[i * 6 + 1] = 0; pos[i * 6 + 2] = zs[i] - rz
      pos[i * 6 + 3] = xs[i] + rx; pos[i * 6 + 4] = 0; pos[i * 6 + 5] = zs[i] + rz
      const v = arc[i] / repeatEvery
      uv[i * 4] = 0; uv[i * 4 + 1] = v
      uv[i * 4 + 2] = 1; uv[i * 4 + 3] = v
      const a = i * 2, b = a + 1, c = ((i + 1) % n) * 2, d = c + 1
      // Front faces must point up; downward winding hides both road and verge from the camera.
      idx.set([a, b, c, b, d, c], i * 6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.computeVertexNormals()
    return g
  }

  /** The loop as an SVG path, normalised into a 0–100 box — the minimap draws this. */
  function svgPath(pad = 8) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < n; i++) {
      if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i]
      if (zs[i] < minZ) minZ = zs[i]; if (zs[i] > maxZ) maxZ = zs[i]
    }
    const span = Math.max(maxX - minX, maxZ - minZ) || 1
    const k = (100 - pad * 2) / span
    const map = (x, z) => [pad + (x - minX) * k, pad + (z - minZ) * k]
    let d = ''
    for (let i = 0; i < n; i += 4) {
      const [px, py] = map(xs[i], zs[i])
      d += `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`
    }
    return { d: d + 'Z', map }
  }

  return { curve, length: total, count: n, xs, zs, tx, tz, arc, nearest, at, ribbon, svgPath }
}
