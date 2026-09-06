/**
 * Saul-ish & Sons: sixty seconds on the ramps. Every clean landing on the road pays by
 * how long you were in the air. Land on the grass and that is a crash: the firm files a
 * claim, which is to say the run is over and you keep what you made.
 */
import { createClock, formatSeconds, stuntPay, STUNT } from '../jobs'

const ID = 'saul'

export default {
  id: ID,
  kind: 'world',
  title: 'Stunt claim',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    this.state = 'waiting'; this.clock = null; this.wasAir = false; this.airStart = 0
    this.jumps = 0; this.cash = 0; this.note = ''; this.uiAt = 0
    this.show(ctx, 'Get on the bike. Sixty seconds, two ramps, land on the road. The grass is a claim.')
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    if (this.state === 'waiting') {
      if (!ctx.riding) return
      this.state = 'running'; this.clock = createClock({ start: now, limit: STUNT.duration })
      ctx.say('The clock is running. Hit a ramp.')
    }
    if (ctx.air && !this.wasAir) this.airStart = now
    if (!ctx.air && this.wasAir) {
      const airMs = now - this.airStart
      if (!ctx.onRoad && airMs >= STUNT.minAir) { this.note = 'Landed on the grass.'; return this.finish(ctx, true) }
      const pay = stuntPay(airMs)
      if (pay) { this.jumps++; this.cash += pay; ctx.store.earn({ cash: pay }); this.note = `${formatSeconds(airMs)} in the air. +$${pay}` }
    }
    this.wasAir = ctx.air
    if (this.clock.expired(now)) return this.finish(ctx, false)
    if (now - this.uiAt >= 100) this.show(ctx)
  },

  finish(ctx, claim) {
    this.state = 'done'
    if (!claim && this.jumps > 0) ctx.store.earn({ stars: STUNT.perfectStars })
    ctx.store.record(ID, this.cash)
    this.show(ctx, claim
      ? `Claim filed. ${this.jumps} clean ${this.jumps === 1 ? 'jump' : 'jumps'} for $${this.cash}. Esc to leave.`
      : `Time. ${this.jumps} clean ${this.jumps === 1 ? 'jump' : 'jumps'} for $${this.cash}${this.jumps ? `, plus ${STUNT.perfectStars} stars for walking away` : ''}. Esc to leave.`)
  },

  interrupt() {},

  exit(ctx) {
    ctx.setView(null)
    return { cash: this.cash, jumps: this.jumps }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    ctx.setView({
      stats: [
        { label: 'Time', value: this.clock ? formatSeconds(this.clock.remaining(ctx.now)) : '60.0s', live: true },
        { label: 'Jumps', value: String(this.jumps) },
        { label: 'Cash', value: `$${this.cash}` },
      ],
      status: status ?? (this.note || 'The ramps are on the road between the signs. Boost into them.'),
    })
  },
}
