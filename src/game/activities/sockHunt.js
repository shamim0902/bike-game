/**
 * The laundromat: a sock is somewhere within forty metres, off the road, in the grass or
 * the trees. Ninety seconds, on foot, with a needle that says warmer or colder. It only
 * shows itself when you are nearly standing on it.
 */
import { runRandom, createClock, formatSeconds, warmth, SOCK } from '../jobs'

const ID = 'sock'

export default {
  id: ID,
  kind: 'world',
  title: 'Sock hunt',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    const rng = runRandom()
    const L = ctx.track.length
    const s = (((ctx.placeS + (rng() * 2 - 1) * SOCK.along) % L) + L) % L
    const lat = (rng() < 0.5 ? -1 : 1) * (6 + rng() * (SOCK.lateral - 6))
    ctx.markers.set([{ s, lat, emoji: '🧦', color: '#c8a27a', reveal: SOCK.reveal }])
    this.clock = createClock({ start: ctx.now, limit: SOCK.limit })
    this.state = 'running'; this.cash = 0; this.last = null; this.trend = ''; this.uiAt = 0
    this.show(ctx, 'Ninety seconds. It is off the road, within forty metres. Walk; the needle knows.')
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    const d = ctx.markers.dist(0)
    if (this.last !== null && Math.abs(d - this.last) > 0.05) this.trend = d < this.last ? 'warmer' : 'colder'
    this.last = d
    if (ctx.onFoot && d <= SOCK.reach) {
      this.cash = SOCK.pay
      ctx.store.earn({ cash: SOCK.pay, stars: SOCK.perfectStars })
      ctx.store.record(ID, SOCK.pay)
      ctx.markers.done(0, true)
      this.state = 'done'
      return this.show(ctx, `Found it, ${formatSeconds(SOCK.limit - this.clock.remaining(now))} in. The right one is yours, and $${SOCK.pay}. Esc to leave.`)
    }
    if (this.clock.expired(now)) { this.state = 'done'; return this.show(ctx, 'Time. The sock stays lost. Esc to leave.') }
    if (now - this.uiAt >= 100) this.show(ctx)
  },

  interrupt() {},

  exit(ctx) {
    ctx.markers.clear()
    ctx.setView(null)
    return { cash: this.cash }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    const d = this.last ?? Infinity
    ctx.setView({
      stats: [
        { label: 'Time', value: formatSeconds(this.clock.remaining(ctx.now)), live: true },
        { label: 'Needle', value: `${warmth(d)}${this.trend ? ` · ${this.trend}` : ''}`, live: true },
        { label: 'Pays', value: `$${SOCK.pay}` },
      ],
      status: status ?? (ctx.onFoot ? 'Off the road. Grass, trees, the backs of things.' : 'On foot only. Get off the bike.'),
    })
  },
}
