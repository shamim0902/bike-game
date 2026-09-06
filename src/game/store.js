/**
 * The save file. One object, reactive so the HUD and the doors follow it, written to
 * localStorage whenever something worth keeping changes.
 *
 * `best` is keyed by activity id. Whether a lower or higher number is better is the
 * activity's business, so it says so when it records. `upgrades` are the bike's tiers,
 * `leased` the places that have been paid for.
 */
import { reactive } from 'vue'

export const SAVE_KEY = 'nightlap:save:v1'
export const UPGRADE_KEYS = ['speed', 'boost', 'horn']
export const MAX_TIER = 3

export function emptySave() {
  return { v: 1, cash: 0, stars: 0, best: {}, upgrades: { speed: 0, boost: 0, horn: 0 }, leased: [] }
}

// Anything unreadable, from any version, becomes a fresh save rather than a crash.
export function parseSave(text) {
  const fresh = emptySave()
  if (!text) return fresh
  try {
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object') return fresh
    const number = (n) => (Number.isFinite(n) && n >= 0 ? n : 0)
    const best = {}
    if (data.best && typeof data.best === 'object') {
      for (const [id, value] of Object.entries(data.best)) if (Number.isFinite(value) && value > 0) best[id] = value
    }
    const upgrades = { ...fresh.upgrades }
    if (data.upgrades && typeof data.upgrades === 'object') {
      for (const k of UPGRADE_KEYS) { const t = data.upgrades[k]; if (Number.isInteger(t) && t >= 0) upgrades[k] = Math.min(MAX_TIER, t) }
    }
    const leased = Array.isArray(data.leased) ? [...new Set(data.leased.filter((id) => typeof id === 'string'))] : []
    return { v: 1, cash: number(data.cash), stars: number(data.stars), best, upgrades, leased }
  } catch { return fresh }
}

export function createStore({ storage = null, key = SAVE_KEY } = {}) {
  const read = () => { try { return parseSave(storage?.getItem(key)) } catch { return emptySave() } }
  const save = reactive(read())

  function persist() {
    try { storage?.setItem(key, JSON.stringify(save)) } catch { /* private mode, full, or absent: this session still plays */ }
  }
  // Records a result. Returns true when it beat what was there.
  function record(id, value, { lowerIsBetter = false } = {}) {
    if (!Number.isFinite(value) || value <= 0) return false
    const current = save.best[id]
    const better = current === undefined || (lowerIsBetter ? value < current : value > current)
    if (better) { save.best[id] = value; persist() }
    return better
  }
  function earn({ cash = 0, stars = 0 } = {}) {
    save.cash += Math.max(0, cash)
    save.stars += Math.max(0, stars)
    if (cash || stars) persist()
  }
  const canAfford = (cost) => Number.isFinite(cost) && cost >= 0 && save.cash >= cost
  // Takes the money if it is there. Returns whether it was.
  function spend(cost) {
    if (!canAfford(cost)) return false
    save.cash -= cost
    persist()
    return true
  }
  // One tier up, if affordable and not already at the top.
  function upgrade(key, cost) {
    if (!UPGRADE_KEYS.includes(key) || save.upgrades[key] >= MAX_TIER || !spend(cost)) return false
    save.upgrades[key]++
    persist()
    return true
  }
  const isLeased = (id, cost = 0) => !cost || save.leased.includes(id)
  function lease(id, cost) {
    if (isLeased(id, cost)) return true
    if (!spend(cost)) return false
    save.leased.push(id)
    persist()
    return true
  }
  function reset() {
    Object.assign(save, emptySave())
    persist()
  }
  return { save, record, earn, canAfford, spend, upgrade, isLeased, lease, reset, persist }
}

let shared = null
// The game's one store, on the browser's storage. Tests build their own with createStore.
export function getStore() {
  if (!shared) {
    let storage = null
    try { storage = window.localStorage } catch { /* restricted */ }
    shared = createStore({ storage })
  }
  return shared
}
