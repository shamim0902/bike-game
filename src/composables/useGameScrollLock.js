// Fullscreen temporarily owns the page scroller. Do not resurrect an earlier scene's
// paused flag on exit: that scene may have completed and released its hold meanwhile.
export function lockGameScroll({ body, smoother, afterLayout = () => Promise.resolve() }) {
  const overflow = body.style.overflow
  const scrollTop = smoother?.scrollTop()
  smoother?.paused(true)
  body.style.overflow = 'hidden'
  let releasePromise

  return function release() {
    return releasePromise ??= (async () => {
      body.style.overflow = overflow
      try {
        // The placeholder preserves page height, so restore position while still locked.
        if (scrollTop !== undefined) smoother.scrollTop(scrollTop)
      } finally {
        // Remove wheel/touch blockers synchronously; layout work must not delay input.
        smoother?.paused(false)
      }
      // Measure once Vue returns the game, but don't overwrite any new user scrolling.
      await afterLayout()
      smoother?.refresh()
    })()
  }
}

// A one-shot fallback for browsers/scenes that reapply a pause during fullscreen exit.
// Capture pointerdown so touch scrolling is enabled before the following gesture.
export function recoverGameScrollOnOutside({ document, game, getSmoother, overflow, isBlocked = () => false, onRelease = () => {} }) {
  const stop = () => document.removeEventListener('pointerdown', onPointerDown, true)
  function onPointerDown(event) {
    if (isBlocked() || game.contains(event.target)) return
    stop()
    document.body.style.overflow = overflow
    getSmoother()?.paused(false)
    onRelease()
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  return stop
}
