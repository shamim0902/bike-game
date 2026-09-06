/**
 * Madame Zola: she predicts your next lap, a touch under your best at the police booth.
 * Ride one lap. Beat her by less than a second and she pays out big; beat her by a lot and
 * she pays a little, since she was clearly wrong; come in slower and you pay her nothing
 * but she keeps the satisfaction.
 */
import { createLapTimer, formatLapTime } from '@/composables/useLapTimer'
import { predictLap, predictionPay, PREDICTION } from '../jobs'

const ID = 'zola'

export default {
  id: ID,
  kind: 'world',
  title: 'The prediction',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    this.predicted = predictLap(ctx.store.save.best.camera)
    this.timer = createLapTimer({ length: ctx.track.length, start: ctx.finishS })
    this.state = 'running'; this.cash = 0; this.uiAt = 0
    this.show(ctx, `"${formatLapTime(this.predicted)}," she says. Get on the bike, cross the checkered line, and prove her wrong by a whisker.`)
    ctx.say(`Madame Zola: ${formatLapTime(this.predicted)}. I have seen it.`)
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    if (!ctx.riding) {
      if (this.timer.snapshot(now).running) { this.timer.cancel('Lap canceled · get back on and cross the line to retry.'); this.show(ctx) }
      return
    }
    const result = this.timer.update({ s: ctx.s, now, onRoad: ctx.onRoad, forward: ctx.forward })
    if (result) {
      const pay = predictionPay(this.predicted, result.time)
      this.cash = pay
      if (pay) { ctx.store.earn({ cash: pay }); ctx.store.record(ID, pay) }
      this.state = 'done'
      const margin = this.predicted - result.time
      const verdict = margin < 0 ? 'She was right. Slower. Nothing.'
        : margin < PREDICTION.closeMs ? `Beat her by ${(margin / 1000).toFixed(1)} s. She is furious. $${pay}.`
        : `Beat her by ${(margin / 1000).toFixed(1)} s. "A fluke," she says, and pays $${pay}.`
      return this.show(ctx, `${formatLapTime(result.time)} against ${formatLapTime(this.predicted)}. ${verdict} Esc to leave.`)
    }
    if (now - this.uiAt >= 100) this.show(ctx)
  },

  interrupt(ctx, reason = 'Lap canceled · cross the line to retry.') {
    if (this.state !== 'done') { this.timer.cancel(reason); this.show(ctx) }
  },

  exit(ctx) {
    ctx.setView(null)
    return { cash: this.cash }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    const s = this.timer.snapshot(ctx.now)
    ctx.setView({
      stats: [
        { label: 'Predicted', value: formatLapTime(this.predicted) },
        { label: 'Time', value: formatLapTime(s.elapsed), live: true },
        { label: 'Checks', value: `${s.checkpoints}/${s.totalCheckpoints}` },
      ],
      status: status ?? s.message,
    })
  },
}
