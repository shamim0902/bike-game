<script setup>
/**
 * The parts counter at the Highways Dept. Three upgrades, three tiers each. Buying takes
 * effect on the bike at once (ProjectDrive watches the save's upgrades).
 */
import { computed } from 'vue'
import { UPGRADES, nextPrice } from '@/game/shop'

const props = defineProps({ store: { type: Object, required: true } })
const emit = defineEmits(['leave', 'bought'])

const rows = computed(() => Object.entries(UPGRADES).map(([key, u]) => {
  const tier = props.store.save.upgrades[key]
  const price = nextPrice(key, tier)
  return { key, ...u, tier, price, maxed: price === null, affordable: price !== null && props.store.canAfford(price),
    next: price === null ? 'Fully upgraded.' : u.tiers[tier] }
}))

function buy(row) {
  if (props.store.upgrade(row.key, row.price)) emit('bought', row.key)
}
</script>

<template>
  <section class="shop" aria-label="Parts counter">
    <header class="shop__head">
      <h2>Parts counter</h2>
      <span class="shop__cash">$<b>{{ store.save.cash }}</b></span>
    </header>
    <ul class="shop__list">
      <li v-for="r in rows" :key="r.key" class="shop__row">
        <span class="shop__pic" aria-hidden="true">{{ r.emoji }}</span>
        <span class="shop__info">
          <span class="shop__name">{{ r.name }} <i class="shop__tiers"><b v-for="n in 3" :key="n" :class="{ 'is-on': n <= r.tier }" /></i></span>
          <span class="shop__next">{{ r.next }}</span>
        </span>
        <button class="shop__buy" :disabled="r.maxed || !r.affordable" @click="buy(r)">
          {{ r.maxed ? 'Done' : `$${r.price}` }}
        </button>
      </li>
    </ul>
    <footer class="shop__foot">
      <button class="shop__leave" @click="emit('leave')"><kbd>Esc</kbd> Back to the bike</button>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.shop {
  width: min(440px, 100%); padding: 1rem 1.1rem 0.9rem; border-radius: 16px;
  background: rgba(11, 15, 20, .94); border: 1px solid rgba(255, 208, 75, .3); color: $paper;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5);
  &__head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: .6rem;
    h2 { font-size: 1.35rem; font-style: italic; } }
  &__cash { color: $accent-2; font-variant-numeric: tabular-nums; b { font-size: 1.2em; font-weight: 600; margin-left: .1em; } }
  &__list { list-style: none; margin: 0; padding: 0; display: grid; gap: .45rem; }
  &__row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .8rem;
    padding: .6rem .7rem; border-radius: 10px; background: #131a24; border: 1px solid rgba(255,255,255,.08); }
  &__pic { font-size: 1.5rem; }
  &__info { display: grid; gap: .15rem; min-width: 0; }
  &__name { font-weight: 600; display: flex; align-items: center; gap: .5rem; }
  &__tiers { display: inline-flex; gap: .2rem; b { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.14); &.is-on { background: $accent; } } }
  &__next { font-size: .8rem; color: $muted; }
  &__buy { min-width: 4.5rem; min-height: 40px; padding: .4rem .7rem; border-radius: 9px; background: $accent; color: $ink; font-weight: 600; font-variant-numeric: tabular-nums;
    &:disabled { background: rgba(255,255,255,.08); color: $muted; cursor: default; } }
  &__foot { margin-top: .8rem; display: flex; justify-content: flex-end; }
  &__leave { padding: .5rem .8rem; border-radius: 9px; border: 1px solid rgba(255,208,75,.3); color: $accent; font-size: .85rem;
    kbd { margin-right: .35rem; padding: .1rem .3rem; border: 1px solid currentColor; border-radius: 3px; font: inherit; }
    @media (pointer: coarse) { kbd { display: none; } } }
}
</style>
