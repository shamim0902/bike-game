/**
 * Slice Lord: five pizzas, one at a time, each to a customer somewhere ahead on the lap.
 * A pizza has a clock from the moment it leaves the shop; boost keeps it hot (the clock
 * runs at half speed). Deliver hot for the full tip, cold for the base, late for nothing.
 * The clock does not stop when you get off the bike. The best is the most cash from one run.
 */
import { runRandom, spreadTargets, createClock, distanceAhead, formatSeconds, PIZZA } from '../jobs'

const ID = 'pizza'

export default {
  id: ID,
  kind: 'world',
  title: 'Pizza run',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    const rng = runRandom()
    this.targets = spreadTargets({ length: ctx.track.length, from: ctx.placeS, count: PIZZA.count, rng, minGap: 28, maxGap: 55, lateral: 2.8 })
    ctx.markers.set(this.targets.map((t) => ({ ...t, emoji: '🍕', color: '#ffb347', hidden: true })))
    this.i = -1; this.delivered = 0; this.cash = 0; this.clock = null; this.state = 'waiting'; this.uiAt = 0
    this.show(ctx, 'Get on the bike. Five pizzas, one at a time, before they go cold.')
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    if (this.state === 'waiting') { if (!ctx.riding) return; this.next(ctx) }
    const remaining = this.clock.tick(now, ctx.riding && ctx.boosting)
    if (remaining <= 0) {
      ctx.markers.done(this.i, false)
      this.note = `Pizza ${this.i + 1} went cold.`
      this.next(ctx)
    } else if (ctx.markers.dist(this.i) <= PIZZA.reach) {
      const pay = PIZZA.pay(remaining, this.clock.limit)
      this.delivered++; this.cash += pay
      ctx.store.earn({ cash: pay })
      ctx.markers.done(this.i, true)
      this.note = `Delivered${remaining > this.clock.limit * 0.5 ? ', still hot' : ''}. +$${pay}`
      this.next(ctx)
    }
    if (this.state !== 'done' && now - this.uiAt >= 100) this.show(ctx)
  },

  next(ctx) {
    this.i++
    if (this.i >= PIZZA.count) return this.finish(ctx)
    this.state = 'running'
    ctx.markers.show(this.i)
    ctx.arrow.target = this.i
    const distance = distanceAhead(ctx.s, this.targets[this.i].s, ctx.track.length)
    this.clock = createClock({ start: ctx.now, limit: PIZZA.limit(distance) })
    this.show(ctx)
  },

  finish(ctx) {
    this.state = 'done'
    ctx.arrow.target = null
    const perfect = this.delivered === PIZZA.count
    if (perfect) ctx.store.earn({ stars: PIZZA.perfectStars })
    ctx.store.record(ID, this.cash)
    this.show(ctx, `Delivered ${this.delivered}/${PIZZA.count} for $${this.cash}${perfect ? `, plus ${PIZZA.perfectStars} stars for a perfect run` : ''}. Esc to leave.`)
  },

  interrupt() { /* the pizza keeps cooling whatever you do */ },

  exit(ctx) {
    ctx.markers.clear()
    ctx.arrow.target = null
    ctx.setView(null)
    return { cash: this.cash, delivered: this.delivered }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    const running = this.state === 'running'
    ctx.setView({
      stats: [
        { label: 'Pizzas', value: `${this.delivered}/${PIZZA.count}` },
        { label: 'Heat', value: running ? formatSeconds(this.clock.remaining(ctx.now)) : '—', live: true },
        { label: 'Cash', value: `$${this.cash}` },
      ],
      status: status ?? (this.note ? `${this.note} Next: pizza ${this.i + 1}.` : `Pizza ${this.i + 1}: follow the arrow. Boost keeps it hot.`),
    })
  },
}
