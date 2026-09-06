/**
 * Nap City: a mattress strapped to the back of the bike and a customer half a lap away.
 * The wind gets under it; over 40 km/h for a second and it is gone. Slow is the whole job.
 */
import * as THREE from 'three'
import { runRandom, spreadTargets, formatSeconds, MATTRESS } from '../jobs'

const ID = 'nap'

export default {
  id: ID,
  kind: 'world',
  title: 'Mattress haul',
  lowerIsBetter: false,
  formatBest: (v) => (v ? `Best $${v}` : null),

  enter(ctx) {
    const rng = runRandom()
    const L = ctx.track.length
    const [spot] = spreadTargets({ length: L, from: ctx.placeS, count: 1, rng, minGap: L * 0.42, maxGap: L * 0.55, lateral: 2.4 })
    ctx.markers.set([{ ...spot, emoji: '🛏️', color: '#9ec1ff' }])
    ctx.arrow.target = 0
    // the mattress: a soft box on the pillion, striped so it reads as one
    const g = new THREE.Group()
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 1.9), new THREE.MeshStandardMaterial({ color: '#efe4cf', roughness: 0.95 }))
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 1.91), new THREE.MeshStandardMaterial({ color: '#7fa6d9', roughness: 0.9 }))
    g.add(slab, stripe)
    g.position.set(0, 1.08, -0.55)
    ctx.attachToBike(g)
    this.mattress = g
    this.state = 'waiting'; this.overSince = null; this.cash = 0; this.startAt = 0; this.uiAt = 0
    this.show(ctx, 'Get on the bike. Keep it under 40 km/h or the mattress leaves without you.')
  },

  update(ctx) {
    const { now } = ctx
    if (this.state === 'done') return
    if (this.state === 'waiting') { if (!ctx.riding) return; this.state = 'running'; this.startAt = now }
    // the wind: the mattress lifts and wags with speed
    const strain = Math.min(1.4, ctx.kmh / MATTRESS.limitKmh)
    this.mattress.rotation.z = Math.sin(now / 160) * 0.07 * strain
    this.mattress.rotation.x = -0.12 * strain
    this.mattress.position.y = 1.08 + 0.12 * strain
    if (ctx.riding && ctx.kmh > MATTRESS.limitKmh) {
      this.overSince ??= now
      if (now - this.overSince >= MATTRESS.tumbleAfter) return this.tumble(ctx)
    } else this.overSince = null
    if (ctx.markers.dist(0) <= MATTRESS.reach) {
      this.cash = MATTRESS.pay
      ctx.store.earn({ cash: MATTRESS.pay, stars: MATTRESS.perfectStars })
      ctx.markers.done(0, true)
      return this.finish(ctx, `Delivered in ${formatSeconds(now - this.startAt)}. $${MATTRESS.pay} and ${MATTRESS.perfectStars} stars. Esc to leave.`)
    }
    if (now - this.uiAt >= 100) this.show(ctx)
  },

  // it leaves the bike where it is and lands on the verge
  tumble(ctx) {
    const m = this.mattress
    ctx.detachFromBike(m)
    m.position.x += (Math.random() < 0.5 ? -1 : 1) * 4.5; m.position.y = 0.4
    m.rotation.set(0.4, Math.random() * 3, 0.9)
    ctx.markers.done(0, false)
    this.finish(ctx, 'The mattress took off. Nap City sends its regards, and no money. Esc to leave.')
  },

  finish(ctx, status) {
    this.state = 'done'
    ctx.arrow.target = null
    if (this.cash) ctx.store.record(ID, this.cash)
    this.show(ctx, status)
  },

  interrupt() {},

  exit(ctx) {
    ctx.detachFromBike(this.mattress, true)
    ctx.markers.clear()
    ctx.arrow.target = null
    ctx.setView(null)
    return { cash: this.cash }
  },

  show(ctx, status) {
    this.uiAt = ctx.now
    const over = ctx.kmh > MATTRESS.limitKmh
    ctx.setView({
      stats: [
        { label: 'Speed', value: `${Math.round(ctx.kmh)} / ${MATTRESS.limitKmh} km/h`, live: true },
        { label: 'Time', value: this.startAt ? formatSeconds(ctx.now - this.startAt) : '—', live: true },
        { label: 'Pays', value: `$${MATTRESS.pay}` },
      ],
      status: status ?? (over ? 'Too fast! It is lifting.' : 'Follow the arrow. Gently.'),
    })
  },
}
