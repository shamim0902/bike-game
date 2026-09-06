/**
 * The narrator. The portfolio had a guide who walked the page and could take a tour that
 * borrowed the controls; the drive still checks `guide.tour.active` before it listens to
 * a key, and that is always false here.
 *
 * What it does have is a voice: `reactTo(text, _, { every, duration })` puts a line in the
 * speech bubble on the stage for `duration` seconds, and the same line is not repeated
 * within `every` milliseconds. Text only, for now.
 */
import { reactive } from 'vue'

export const guide = reactive({ tour: { active: false, step: -1 }, say: { text: '', key: 0 } })

const lastSaid = new Map()
let hide = null

export function reactTo(text, _target = null, { every = 0, duration = 2.5 } = {}) {
  if (!text) return
  const now = Date.now()
  if (every && now - (lastSaid.get(text) ?? -Infinity) < every) return
  lastSaid.set(text, now)
  guide.say.text = text
  guide.say.key++
  clearTimeout(hide)
  hide = setTimeout(() => { guide.say.text = '' }, duration * 1000)
}
