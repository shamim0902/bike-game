import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { buildCircuit } from '../src/composables/useCircuit.js'

for (const halfWidth of [5.4, 8.3]) {
  test(`circuit ribbon faces upward at half-width ${halfWidth}`, () => {
    const track = buildCircuit()
    const geometry = track.ribbon(halfWidth)
    const material = new THREE.MeshBasicMaterial() // default front-face culling, like the road
    const mesh = new THREE.Mesh(geometry, material)
    const position = geometry.attributes.position
    const normal = geometry.attributes.normal
    const index = geometry.index
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    try {
      // Preserve the existing geometry budget: two vertices and two triangles per sample.
      assert.equal(position.count, track.count * 2)
      assert.equal(index.count, track.count * 6)
      for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.99, `normal ${i} faces down`)
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i))
        b.fromBufferAttribute(position, index.getX(i + 1))
        c.fromBufferAttribute(position, index.getX(i + 2))
        b.sub(a); c.sub(a)
        assert.ok(b.cross(c).y > 0, `triangle ${i / 3} faces down`)
      }
      const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
      for (let i = 0; i < track.count; i += 20) {
        const p = track.at(track.arc[i], halfWidth * 0.8)
        ray.ray.origin.set(p.x, 10, p.z)
        assert.ok(ray.intersectObject(mesh).length > 0, `road invisible from above at sample ${i}`)
      }
    } finally {
      geometry.dispose(); material.dispose()
    }
  })
}
