/**
 * The speed camera's place: timed laps. The lap timer that used to run all the time now
 * runs only in here. Walk in, get back on the bike, cross the checkered line, and every
 * checkpoint on the road counts. The best lap is what the door remembers.
 */
import { createLapTimer, formatLapTime } from '@/composables/useLapTimer'

const ID = 'camera'
const NEW_BEST_PAY = 40

export default {
  id: ID,
  kind: 'world',
  title: 'Time trial',
  lowerIsBetter: true,
  formatBest: (ms) => (ms ? `Best lap ${formatLapTime(ms)}` : null),

  enter(ctx) {
    this.timer = createLapTimer({ length: ctx.track.length, start: ctx.finishS, best: ctx.store.save.best[ID] ?? null })
    this.uiAt = 0; this.note = ''
    this.show(ctx, performance.now(), 'Timer armed. Get on the bike and cross the checkered line. A new best pays $40.')
  },

  // Called every frame while inside. Only a moving bike feeds the timer; on foot or mid
  // animation a running lap is cancelled, as it always was.
  update(ctx) {
    const { now } = ctx
    if (!ctx.riding) {
      if (this.timer.snapshot(now).running) { this.timer.cancel('Lap canceled · get back on and cross the line to retry.'); this.show(ctx, now) }
      return
    }
    const result = this.timer.update({ s: ctx.s, now, onRoad: ctx.onRoad, forward: ctx.forward })
    if (result?.newBest) { ctx.store.record(ID, result.time, { lowerIsBetter: true }); ctx.store.earn({ cash: NEW_BEST_PAY }); this.note = `New best pays $${NEW_BEST_PAY}.` }
    if (result || now - this.uiAt >= 100) this.show(ctx, now)
  },

  // Anything that takes the controls away (blur, tab hidden, getting off) ends the lap.
  interrupt(ctx, reason = 'Lap canceled · cross the line to retry.') {
    if (!this.timer) return
    this.timer.cancel(reason)
    this.show(ctx, performance.now())
  },

  exit(ctx) {
    const snap = this.timer?.snapshot(performance.now())
    this.timer = null
    ctx.setView(null)
    return snap ? { laps: snap.laps, best: snap.best } : null
  },

  show(ctx, now, override) {
    const s = this.timer.snapshot(now)
    this.uiAt = now
    ctx.setView({
      stats: [
        { label: 'Laps', value: String(s.laps) },
        { label: 'Time', value: formatLapTime(s.elapsed), live: true },
        { label: 'Best', value: formatLapTime(s.best) },
        ...(s.last !== null ? [{ label: 'Last', value: formatLapTime(s.last) }] : []),
      ],
      status: (override ?? s.message) + (s.running ? ` · Checks ${s.checkpoints}/${s.totalCheckpoints}` : '') + (this.note ? ` ${this.note}` : ''),
    })
  },
}
