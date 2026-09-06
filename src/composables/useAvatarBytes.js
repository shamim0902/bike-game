/**
 * Start downloading the avatar before anything that can parse it exists.
 *
 * The chain to the real walker is: the main bundle parses, Avatar mounts, the Walker3D
 * chunk arrives, three.js arrives — 162KB gzipped — and only once THAT has downloaded
 * and parsed does anything ask for me.glb, which is another 606KB. The two biggest
 * pieces were queued one behind the other for no reason other than the order the code
 * happens to run in. On a slow connection that is the whole reason the flat stand-in is
 * on screen long enough to notice.
 *
 * This module deliberately imports nothing. It can therefore be called from the eager
 * part of the bundle without dragging three.js in with it, which is the one constraint
 * that makes the fix possible at all: the bytes start moving immediately, in parallel
 * with the library that will eventually read them.
 *
 * It hands back the ArrayBuffer rather than warming the HTTP cache and hoping the
 * loader's own request matches it. A cache warm depends on the two requests agreeing
 * about mode, credentials and cacheability; get any of them wrong and the file is
 * fetched twice, which on the connections this is meant to help is worse than doing
 * nothing. Passing the buffer to GLTFLoader.parse is exactly one request, always.
 */
const SRC = '/avatar/me.glb'
let bytes = null

/** Begin the download. Safe to call repeatedly — only the first call fetches. */
export function prefetchAvatar() {
  // `priority: 'high'` puts it ahead of the images and the rest of the page's traffic.
  // Ignored by browsers that don't implement fetch priority, which costs nothing.
  bytes ??= fetch(SRC, { priority: 'high' })
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`avatar ${r.status}`))))
    .catch(() => { bytes = null; return null })   // let the loader fall back to its own fetch
  return bytes
}

/** The in-flight or finished download, or null if nobody asked for it. */
export function avatarBytes() { return bytes }
