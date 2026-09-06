<script setup>
/**
 * Nightlap. The game is the whole page.
 *
 * ProjectDrive.vue came from the portfolio. The scroll smoother and guide avatar it expects
 * are stubbed in useGsap and useGuide. The billboards, which used to be GitHub repos, are
 * now the game's own ads (src/data/billboards.js); the places you can go into are separate
 * buildings beside the road (src/data/places.js), scattered by src/game/town.js.
 *
 * The portfolio laid the game out as a card inside an article, with an "expand" button for
 * fullscreen. Here there is no article: the styles below make the card fill the viewport and
 * hide the expand button, so the component's own fullscreen path is never entered.
 */
import { ref } from 'vue'
import { reducedMotion } from '@/composables/useGsap'
import ProjectDrive from '@/components/ProjectDrive.vue'
import signs from '@/data/billboards'
import places from '@/data/places'

const canDrive = !reducedMotion() && !!window.WebGLRenderingContext
const failed = ref(false)
</script>

<template>
  <main class="game">
    <ProjectDrive v-if="canDrive && !failed" :signs="signs" :places="places" @error="failed = true" />
    <p v-else class="game__sorry">
      Nightlap needs WebGL and full motion to run.
    </p>
  </main>
</template>

<style lang="scss" scoped>
.game {
  height: 100dvh; box-sizing: border-box; overflow: hidden;
  display: flex; flex-direction: column;
  padding: max(.5rem, env(safe-area-inset-top)) max(.5rem, env(safe-area-inset-right))
           max(.5rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left));
  background: $ink;
}
.game__sorry { margin: auto; color: $muted; text-align: center; }

// The drive is a flex column that owns the viewport; the stage takes every pixel the
// lap stats, mode bar and project card leave over.
.game :deep(.drive) { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; margin: 0; }
.game :deep(.drive__stage) { flex: 1 0 160px; height: auto; min-height: 160px; border-radius: 12px; }
.game :deep(.drive__hud) { flex-shrink: 0; margin-top: .25rem; }
.game :deep(.drive__mode-bar) { padding: .25rem 0; }
.game :deep(.drive__race) { padding-top: .4rem; }
@media (max-height: 500px) {
  .game :deep(.drive__hud), .game :deep(.drive__hint), .game :deep(.drive__mode-bar > span) { display: none; }
  .game :deep(.drive__mode-bar) { justify-content: flex-end; }
}
</style>
