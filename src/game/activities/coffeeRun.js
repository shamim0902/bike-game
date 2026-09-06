/**
 * The diner: three cups, three marked spots, any order. Every cup has its own clock from
 * the moment you start riding, longer for the further spot. Off the road for more than
 * half a second spills a cup, and it is always the cup for the furthest spot still waiting.
 */
import { runRandom, spreadTargets, createClock, distanceAhead, formatSeconds, farthestPending, COFFEE } from '../jobs'

const ID = 'diner'

export default {
  id: ID,
  kind: 'world',
  title: 'Coffee run',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    const rng = runRandom()
    const spots = spreadTargets({ length: ctx.track.length, from: ctx.placeS, count: COFFEE.count, rng, minGap: 30, maxGap: 60, lateral: 2.8 })
    this.targets = spots.map((t) => ({ ...t, state: 'pending', clock: null }))
    ctx.markers.set(spots.map((t) => ({ ...t, emoji: '☕', color: '#c8a27a' })))
    this.delivered = 0; this.cash = 0; this.state = 'waiting'; this.offRoadSince = null; this.uiAt = 0; this.note = ''
    this.show(ctx, 'Get on the bike. Three cups, three spots, any order. Stay on the road.')
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    if (this.state === 'waiting') {
      if (!ctx.riding) return
      this.state = 'running'
      this.targets.forEach((t) => { t.clock = createClock({ start: now, limit: COFFEE.limit(distanceAhead(ctx.s, t.s, ctx.track.length)) }) })
    }
    // spills: a continuous stretch on the grass
    if (ctx.riding && !ctx.onRoad) {
      this.offRoadSince ??= now
      if (now - this.offRoadSince >= COFFEE.spillAfter) {
        this.offRoadSince = now + 1e9 // one spill per excursion
        const i = farthestPending(this.targets, ctx.s, ctx.track.length)
        if (i >= 0) { this.targets[i].state = 'spilled'; ctx.markers.done(i, false); this.note = 'Spilled a cup on the grass.' }
      }
    } else this.offRoadSince = null
    // deliveries and cold cups
    this.targets.forEach((t, i) => {
      if (t.state !== 'pending') return
      if (t.clock.expired(now)) { t.state = 'cold'; ctx.markers.done(i, false); this.note = 'A cup went cold.'; return }
      if (ctx.markers.dist(i) <= COFFEE.reach) {
        t.state = 'done'; this.delivered++; this.cash += COFFEE.pay
        ctx.store.earn({ cash: COFFEE.pay }); ctx.markers.done(i, true); this.note = `Delivered. +$${COFFEE.pay}`
      }
    })
    if (!this.targets.some((t) => t.state === 'pending')) return this.finish(ctx)
    this.point(ctx)
    if (now - this.uiAt >= 100) this.show(ctx)
  },

  // the arrow follows the nearest cup still waiting
  point(ctx) {
    let pick = null, near = Infinity
    this.targets.forEach((t, i) => { if (t.state === 'pending') { const d = ctx.markers.dist(i); if (d < near) { near = d; pick = i } } })
    ctx.arrow.target = pick
  },

  finish(ctx) {
    this.state = 'done'
    ctx.arrow.target = null
    const perfect = this.delivered === COFFEE.count
    if (perfect) ctx.store.earn({ stars: COFFEE.perfectStars })
    ctx.store.record(ID, this.cash)
    this.show(ctx, `Delivered ${this.delivered}/${COFFEE.count} for $${this.cash}${perfect ? `, plus ${COFFEE.perfectStars} stars, not a drop spilled` : ''}. Esc to leave.`)
  },

  interrupt() {},

  exit(ctx) {
    ctx.markers.clear()
    ctx.arrow.target = null
    ctx.setView(null)
    return { cash: this.cash, delivered: this.delivered }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    const pending = this.targets.filter((t) => t.state === 'pending' && t.clock)
    const soonest = pending.length ? Math.min(...pending.map((t) => t.clock.remaining(ctx.now))) : null
    ctx.setView({
      stats: [
        { label: 'Cups', value: `${this.delivered}/${COFFEE.count}` },
        { label: 'Next cold in', value: soonest === null ? '—' : formatSeconds(soonest), live: true },
        { label: 'Cash', value: `$${this.cash}` },
      ],
      status: status ?? (this.note || 'Three cups out. The arrow points to the nearest.'),
    })
  },
}
