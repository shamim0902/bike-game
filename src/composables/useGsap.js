/**
 * GSAP, and a stand-in for the one plugin the game never needed.
 *
 * In the portfolio the drive sat inside a ScrollSmoother-driven page and had to lock and
 * release that scroller around fullscreen. Here the page is the game, there is no
 * smoother, and every call site already tolerates `ScrollSmoother.get()` being null —
 * so that is what it returns.
 */
import gsap from 'gsap'

let registered = false
export function registerGsap() {
  if (registered) return gsap
  gsap.defaults({ ease: 'power2.out' })
  // a stalled frame (a texture upload, a decode) otherwise advances every tween by the
  // whole lag at once, which reads as the scene blinking past
  gsap.ticker.lagSmoothing(320, 24)
  registered = true
  return gsap
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const ScrollSmoother = { get: () => null }
export { gsap }
