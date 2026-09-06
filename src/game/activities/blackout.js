/**
 * Bulb Barn: the lights go off and stay off. Eight glow markers are hidden round the lap,
 * some on the road, some on the verge, and each only shows once you are close. You have
 * one lap, counted from the barn, to find them.
 */
import { runRandom, spreadTargets, createProgress, BLACKOUT } from '../jobs'

const ID = 'bulb'

export default {
  id: ID,
  kind: 'world',
  title: 'Blackout',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    const rng = runRandom()
    const length = ctx.track.length
    const gap = (length - 40) / BLACKOUT.count
    const spots = spreadTargets({ length, from: ctx.placeS, count: BLACKOUT.count, rng, minGap: gap * 0.7, maxGap: gap * 1.1, lateral: 7 })
    ctx.markers.set(spots.map((t) => ({ ...t, emoji: '✨', color: '#12d4db', reveal: BLACKOUT.reveal })))
    ctx.lights.lock()
    this.found = 0; this.cash = 0; this.state = 'waiting'; this.progress = null; this.uiAt = 0
    this.show(ctx, 'Lights out. Get on the bike: eight glows are hidden round the lap. One lap to find them.')
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    if (this.state === 'waiting') {
      if (!ctx.riding) return
      this.state = 'running'; this.progress = createProgress(ctx.track.length)
    }
    if (ctx.riding) {
      for (let i = 0; i < BLACKOUT.count; i++) {
        if (!ctx.markers.isDone(i) && ctx.markers.dist(i) <= BLACKOUT.reach) {
          this.found++; this.cash += BLACKOUT.each
          ctx.store.earn({ cash: BLACKOUT.each }); ctx.markers.done(i, true)
        }
      }
      if (this.found === BLACKOUT.count || this.progress.add(ctx.s) >= ctx.track.length) return this.finish(ctx)
    }
    if (now - this.uiAt >= 100) this.show(ctx)
  },

  finish(ctx) {
    this.state = 'done'
    const all = this.found === BLACKOUT.count
    if (all) { this.cash += BLACKOUT.all; ctx.store.earn({ cash: BLACKOUT.all, stars: BLACKOUT.perfectStars }) }
    ctx.store.record(ID, this.cash)
    ctx.lights.unlock()
    this.show(ctx, all ? `All ${BLACKOUT.count} found: $${this.cash} and ${BLACKOUT.perfectStars} stars. Esc to leave.` : `Lap over. Found ${this.found}/${BLACKOUT.count} for $${this.cash}. Esc to leave.`)
  },

  interrupt() {},

  exit(ctx) {
    ctx.markers.clear()
    ctx.lights.unlock()
    ctx.setView(null)
    return { cash: this.cash, found: this.found }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    const left = this.progress ? Math.max(0, ctx.track.length - this.progress.total) : ctx.track.length
    ctx.setView({
      stats: [
        { label: 'Found', value: `${this.found}/${BLACKOUT.count}` },
        { label: 'Lap left', value: `${Math.round(left)} m`, live: true },
        { label: 'Cash', value: `$${this.cash}` },
      ],
      status: status ?? 'Glows show up when you are close. Some are off the road.',
    })
  },
}
