/**
 * The portfolio has a guide: an avatar that walks the page, comments on things, and can
 * take a visitor on a tour that borrows the controls. The game checks `guide.tour.active`
 * before it listens to a key and calls `reactTo` to have him say things.
 *
 * There is no guide here yet. This keeps the same shape so ProjectDrive.vue is unchanged;
 * if the game grows a narrator, this is where it plugs in.
 */
import { reactive } from 'vue'

export const guide = reactive({ tour: { active: false, step: -1 } })
export function reactTo() {}
