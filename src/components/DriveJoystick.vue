<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { joystickPosition } from '@/composables/useDriveInput'

const props = defineProps({ disabled: Boolean, resetKey: Number, onFoot: Boolean })
const emit = defineEmits(['move'])
const base = ref(null), knob = ref(null), active = ref(false)
const offset = ref({ dx: 0, dy: 0 })
let pointerId = null, bounds = null, radius = 1

function move(event) {
  if (event.pointerId !== pointerId) return
  const position = joystickPosition(event.clientX - bounds.x, event.clientY - bounds.y, radius)
  offset.value = position
  emit('move', { x: position.x, y: position.y })
}
function start(event) {
  if (props.disabled || pointerId !== null || event.button !== 0) return
  const rect = base.value.getBoundingClientRect()
  bounds = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  radius = Math.max(1, (rect.width - knob.value.offsetWidth) / 2)
  pointerId = event.pointerId
  base.value.setPointerCapture(pointerId)
  active.value = true
  move(event)
}
function reset() {
  const id = pointerId
  pointerId = null
  active.value = false
  offset.value = { dx: 0, dy: 0 }
  if (id !== null && base.value?.hasPointerCapture(id)) base.value.releasePointerCapture(id)
  emit('move', { x: 0, y: 0 })
}
function end(event) { if (event.pointerId === pointerId) reset() }
watch(() => [props.disabled, props.resetKey], reset)
onBeforeUnmount(reset)
</script>

<template>
  <div ref="base" class="joystick" :class="{ 'is-active': active, 'is-disabled': disabled }"
       role="group" :tabindex="disabled ? -1 : 0" :aria-label="onFoot ? 'Walking joystick' : 'Bike joystick'" :aria-disabled="disabled"
       title="Drag up to move, down to brake or reverse, and sideways to steer. Arrow keys also work."
       @pointerdown.prevent="start" @pointermove.prevent="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @contextmenu.prevent
       @touchstart.stop @touchmove.stop @touchend.stop @touchcancel.stop>
    <span class="joystick__axis joystick__axis--vertical" aria-hidden="true" />
    <span class="joystick__axis joystick__axis--horizontal" aria-hidden="true" />
    <span class="joystick__label" aria-hidden="true">{{ onFoot ? 'WALK / RUN' : 'DRIVE' }}</span>
    <span ref="knob" class="joystick__knob" :style="{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }" aria-hidden="true"><i /></span>
  </div>
</template>

<style lang="scss" scoped>
.joystick {
  position: relative; width: 140px; height: 140px; flex: 0 0 140px; border-radius: 50%;
  display: grid; place-items: center; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab;
  background: radial-gradient(circle, rgba(255,208,75,.07), rgba(8,10,16,.78) 72%);
  border: 1px solid rgba(255,255,255,.24); box-shadow: inset 0 0 0 12px rgba(255,255,255,.025), 0 6px 20px rgba(0,0,0,.22);
  &:focus-visible { outline: 2px solid $accent; outline-offset: 4px; }
  &.is-disabled { opacity: .4; cursor: default; }
  &.is-active { cursor: grabbing; border-color: rgba(255,208,75,.7); }
  &__axis { position: absolute; background: rgba(255,255,255,.1); pointer-events: none;
    &--vertical { width: 1px; height: 72%; } &--horizontal { height: 1px; width: 72%; }
  }
  &__label { position: absolute; bottom: 11px; font-size: .5rem; font-weight: 600; letter-spacing: .12em; color: rgba(255,255,255,.65); pointer-events: none; }
  &__knob {
    width: 52px; height: 52px; display: grid; place-items: center; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle at 35% 25%, #fff1b8, $accent 75%); border: 1px solid rgba(255,255,255,.6);
    box-shadow: 0 5px 12px rgba(0,0,0,.4); transition: transform .15s ease-out;
    i { width: 15px; height: 15px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); }
  }
  &.is-active &__knob { transition: none; }
  @media (prefers-reduced-motion: reduce) { &__knob { transition: none; } }
}
</style>
