/**
 * Highways Dept.: the parts counter. The first scene activity: it brings its own screen
 * (ShopPanel.vue) over the town instead of playing out on the road.
 */
import ShopPanel from '@/components/ShopPanel.vue'

export default {
  id: 'yard',
  kind: 'scene',
  title: 'Parts counter',
  component: ShopPanel,
  lowerIsBetter: false,
  formatBest: () => null,

  enter(ctx) {
    ctx.setView({ stats: [{ label: 'Cash', value: `$${ctx.store.save.cash}` }], status: 'Engine, boost, horn. Three tiers each. Esc when done.' })
  },
  update() {},
  interrupt() {},
  exit(ctx) {
    ctx.setView(null)
    return null
  },
}
