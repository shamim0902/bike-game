<script setup>
/**
 * The bike ride from hasanuzzaman.com, on its own.
 *
 * Lifted as-is: ProjectDrive.vue is the file from the portfolio, unchanged, so anything
 * fixed there can be brought across by diff. What the portfolio page used to hand it —
 * a scroll smoother to lock, a guide avatar to defer to, and a list of GitHub repos to
 * put on the billboards — is stubbed in useGsap, useGuide and the snapshot below.
 *
 * The billboards still show repos because that is what the track was built around.
 * Replacing them with the game's own content is the first real design decision.
 */
import { ref } from 'vue'
import { reducedMotion } from '@/composables/useGsap'
import ProjectDrive from '@/components/ProjectDrive.vue'
import snapshot from '@/data/githubSnapshot'

const canDrive = !reducedMotion() && !!window.WebGLRenderingContext
const failed = ref(false)
</script>

<template>
  <main class="game container">
    <ProjectDrive v-if="canDrive && !failed" :repos="snapshot.repos" @error="failed = true" />
    <p v-else class="game__sorry">
      This needs WebGL and full motion to run.
    </p>
  </main>
</template>

<style lang="scss" scoped>
.game { padding: 1.5rem 0 3rem; }
.game__sorry { color: $muted; padding: 4rem 0; text-align: center; }
</style>
