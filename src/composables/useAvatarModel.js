/**
 * One avatar, three scenes.
 *
 * The walk, the drive and the desk each used to load `me.glb` themselves. Three loads
 * means three parses, and a parse builds its own textures — about 20 MB of them — so the
 * same man was costing sixty on the GPU. This parses him once and hands out rigged
 * copies: SkeletonUtils.clone rebuilds the node hierarchy and the skeleton (which every
 * scene poses differently) while reusing the geometry buffers and the materials, so the
 * textures are uploaded exactly once however many scenes are alive.
 *
 * `ownMaterials` is for a scene that writes to a material rather than just reading it —
 * the desk fades him out on his way through the door, and without this that would fade
 * him out of the walk as well. Cloning a material copies the reference to its textures,
 * not the textures, so it buys independence for a few hundred bytes.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js'
import { avatarBytes } from './useAvatarBytes'

const SRC = '/avatar/me.glb'
let parsed = null

/**
 * The parsed gltf, loaded at most once however many callers ask.
 *
 * If the eager half of the bundle started the download before this module existed — see
 * useAvatarBytes, which is why it imports nothing — the bytes are already on their way
 * and we parse those instead of asking for the file a second time. Otherwise this
 * fetches it itself, exactly as it always did.
 */
export function avatarSource() {
  if (parsed) return parsed
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const early = avatarBytes()
  parsed = early
    ? early.then((buf) => (buf ? loader.parseAsync(buf, '') : loader.loadAsync(SRC)))
    : loader.loadAsync(SRC)
  return parsed
}

/**
 * A rigged copy, sharing geometry and textures with every other copy.
 * Nobody gets the original — a scene that hid a mesh or swapped an outfit on it would
 * otherwise hand that state to whichever scene cloned next.
 */
export async function avatarInstance({ ownMaterials = false } = {}) {
  const gltf = await avatarSource()
  const root = cloneRigged(gltf.scene)
  if (ownMaterials) root.traverse((o) => { if (o.isMesh) o.material = o.material.clone() })
  return root
}
