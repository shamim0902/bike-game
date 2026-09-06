<script setup>
/**
 * Nightlap: a night-time lap on a bike, with billboards to read on the way round.
 * A Harley-Davidson Street Bob (Sketchfab, CC-BY-4.0, by "everhard") on a Kenney CC0
 * tiled road; billboards along the sides, and places (small buildings, src/data/places.js)
 * scattered beside the road by src/game/town.js, each with a parking bay and a door; ¾
 * chase camera, and the avatar rides pillion-less up front. W/↑ drives, S/↓ reverses; pull
 * into a place's P bay and press Enter to get off, walk to its door and go in
 * (src/game/entrance.js). What is inside is an activity (src/game/activities).
 * A thumb/mouse joystick supports proportional driving and steering. Rendering pauses
 * off-screen; App.vue falls back to a message without WebGL or with reduced motion.
 *
 * This file began as the portfolio's ProjectDrive.vue (hasanuzzaman.com, v2.0.1), where the
 * billboards were GitHub repos. It diverged on 2026-09-06 when the signs became the game's own.
 */
import { onMounted, onBeforeUnmount, ref, shallowRef, computed, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { avatarInstance } from '@/composables/useAvatarModel'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { gsap, ScrollSmoother } from '@/composables/useGsap'
import { lockGameScroll, recoverGameScrollOnOutside } from '@/composables/useGameScrollLock'
import { guide, reactTo } from '@/composables/useGuide'
import { buildCircuit } from '@/composables/useCircuit'
import { createDriveInput } from '@/composables/useDriveInput'
import { getStore } from '@/game/store'
import { createEntrance, canEnter, doorPath, advanceAlong, headingTo } from '@/game/entrance'
import { activityFor } from '@/game/activities'
import { layoutPlaces } from '@/game/town'
import { tuning } from '@/game/shop'
import DriveJoystick from './DriveJoystick.vue'

const props = defineProps({ signs: { type: Array, required: true }, places: { type: Array, required: true } })
const emit = defineEmits(['error', 'ready'])

const host = ref(null)
const gameRoot = ref(null), expanded = ref(false), gameSpace = ref(0)
const store = getStore()
const entrance = createEntrance()
const phase = ref('idle')                 // entrance.phase, mirrored for the template
const placeTitle = ref('')                // the activity the rider is inside
const activityView = shallowRef(null)     // what that activity wants the HUD to show
const sceneComponent = shallowRef(null)   // a scene activity's own screen, over the stage
let activity = null, doorWalk = null, doorMats = []
// The bike as bought: multipliers on DRIVE and BOOST from the save's upgrade tiers.
let tune = tuning(store.save.upgrades)
watch(() => ({ ...store.save.upgrades }), (u) => { tune = tuning(u) })
let finishLine = null, fullscreenChanging = false
let focusBefore = null, releaseFullscreenScroll = null, fullscreenRestore = null
let stopOutsideScrollRecovery = null, fullscreenOverflow = ''
const gameInputActive = ref(true)
const activeIdx = ref(-1)
const driven = ref(false)          // first input hides the hint chips
const failed = ref(false)
const active = computed(() => props.places[activeIdx.value] ?? null)

/**
 * The tarmac, drawn rather than modelled: dashes down the middle, solid lines at the
 * edges, and enough noise that it doesn't read as flat colour. 128x512 repeating every
 * 8 metres — a quarter of a megabyte, against the sixteen cloned road-tile models it
 * replaces. It is also why a longer lap is nearly free: more track is more triangles on
 * one mesh, not more models.
 */
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512
  const x = c.getContext('2d')
  x.fillStyle = '#20242c'; x.fillRect(0, 0, 128, 512)
  for (let i = 0; i < 5000; i++) {                    // aggregate, so it isn't flat grey
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
    x.fillRect(Math.random() * 128, Math.random() * 512, 1.5, 1.5)
  }
  // The outer edge of each line is the mesh edge (±ROAD_HALF), exactly where
  // the off-road slowdown starts. Paint inside it, with no unmarked asphalt beyond.
  x.fillStyle = '#fff5df'
  x.fillRect(0, 0, 4, 512); x.fillRect(124, 0, 4, 512)
  x.fillStyle = '#ffd04b'
  for (let y = 0; y < 512; y += 128) x.fillRect(62, y, 4, 74)  // centre dashes
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// --- world layout (metres) ---
// A closed circuit rather than a straight road. The old one was 142m of tarmac with a
// dead end at each end: eleven seconds at full throttle, then a three-point turn. A lap
// has no ends, so the ride never stops and the signs are laid out around it — one lap
// passes every one. Steering also finally means something; on a straight road inside
// two walls there was nothing to steer around.
const track = buildCircuit({ radius: 42, wobble: 0.18 })
// Wide enough to get a corner wrong on. 4.2 was a straight road's width carried onto a
// circuit, and at 72km/h you ran onto the grass often enough that the speed seemed to
// drop for no reason — the road, not the rider, was the problem.
const ROAD_HALF = 5.4                    // tarmac either side of the centreline
const VERGE = 6.9                        // grass/boundary layout reference; slowdown starts at ROAD_HALF
const START_S = 6                        // where the bike sits at the start of the lap
const finishPoint = track.at(START_S + 5)
const FINISH_S = track.arc[finishPoint.i]
// Signs spaced evenly around the lap, alternating sides so you're not always looking one
// way. `s` is distance along the centreline; the world position comes off the curve.
// They are ads and nothing more: the places you can go into are laid out further down.
const STOP_GAP = track.length / Math.max(props.signs.length, 1)
const stops = props.signs.map((r, i) => {
  const side = i % 2 === 0 ? 1 : -1
  const s = START_S + 18 + i * STOP_GAP
  const mid = track.at(s, 0)
  const sign = track.at(s, side * (ROAD_HALF + 3))
  return { sign: r, s, side, signX: sign.x, signZ: sign.z, tx: mid.tx, tz: mid.tz }
})
const BAY_HALF_W = 1.2, BAY_HALF_L = 2.6 // capture box: across the road, and along it
const ROAD_LEN = track.length
// how far apart two points are along the lap, the short way round
const along = (a, b) => { const d = Math.abs(a - b) % track.length; return Math.min(d, track.length - d) }

let renderer, scene, camera, timer, raf, car, bike, wheels = [], frontWheels = [], roadY = 0.36
let headlights = [], lamps = [], brakeLight = null, audioCtx = null, engine = null
let rider = null, riderMixer = null, riderBones = {}, riderClips = {}, stride = 1.4, runStride = 4
let runClipLoad = null
const riderMix = { walk: 0, run: 0, greet: 0 } // walk is total locomotion weight; run blends within it
const riderPose = { sit: 0, wave: 0 }    // procedural layers on top of the clips
let mountTl = null, exhaust = null
const mounted = ref(false)               // he's aboard and the controls are live
const riderReady = ref(false)
const rideMode = ref('riding') // riding | dismounting | walking | mounting
const onFoot = computed(() => rideMode.value === 'walking')
const switchingRide = computed(() => rideMode.value === 'mounting' || rideMode.value === 'dismounting')
const canLeaveBike = ref(false), nearBike = ref(false)
const interactionDisabled = computed(() => !riderReady.value || !mounted.value || switchingRide.value || phase.value === 'toDoor' || (onFoot.value ? !nearBike.value : !canLeaveBike.value))
const interactionLabel = computed(() => switchingRide.value ? (rideMode.value === 'mounting' ? 'Getting on…' : 'Getting off…')
  : onFoot.value ? (nearBike.value ? 'Ride bike' : 'Move closer to bike') : canLeaveBike.value ? 'Get off bike' : 'Stop on level ground')
let changeRideTl = null
const foot = { x: 0, z: 0, h: 0, v: 0, y: 0, air: 0, boost: 0, held: 0 }
const FOOT = { walk: 2.1, run: 4.8, reverse: 1.3, runAfter: 1.2, ramp: 0.6 }
const footNear = {}, parkedMap = ref(null)
const MOUNT_REACH = 2.2
const muted = ref(false)
let frames = {}, stopGroups = [], bayGlows = []   // active-glow frame / group / parking-bay glow per stop index
let paused = false, disposed = false, ro, io
const controls = createDriveInput(), input = controls.input
const controlsReset = ref(0)
const state = { z: 0, v: 0, x: 0, steer: 0, h: 0, y: 0, vy: 0, air: 0, boost: 0, held: 0, squash: 0 }
const near = {}                          // scratch for the nearest point on the centreline
const offRoad = ref(false)
const lightsOn = ref(true)
const camMode = ref(0) // 0 ¾-chase · 1 overhead · 2 hood · 3 trackside
function cycleCam() { camMode.value = (camMode.value + 1) % 4; driven.value = true }
// mouse orbit: drag on the scene to swing the camera around the car; eases home after release
// Boost: how long the throttle has to be held before it engages, how fast it comes and
// goes, and what it's worth. `fall` well above `rise` is deliberate — earned slowly,
// lost the moment you lift off or put a wheel on the grass.
// Where the bike settles is accel/drag, so these are chosen as a pair: 22/1.25 is about
// 63 km/h on the throttle alone, and 38/1.25 about 109 with the boost in. `top` and
// BOOST.top sit just above each so the clamp never bites in normal riding.
const DRIVE = { accel: 22, drag: 1.25, top: 18, brake: 26 }
const BOOST = { after: 1.2, rise: 1.6, fall: 5, accel: 16, top: 13 }
// Ramps, as stretches of the lap rather than objects in the world: `s` metres along it,
// `len` long, rising to `h`. Placed midway between two signs, never near one — a jump
// that lands you past the sign you were reading is a jump in the wrong place. Narrower
// than the road on purpose, so the rider who doesn't want to jump can go round it.
const RAMP_HALF = 2.1
// Sited so the landing still falls short of the next sign at full boost — the whole ramp
// sits in the first half of the gap between two projects, not straddling the middle of it.
const RAMPS = (stops.length >= 4 && STOP_GAP > 26 ? [1, Math.max(2, Math.round(stops.length * 0.6))] : [])
  .map((i) => ({ len: 9, h: 1.15, s: stops[i].s - STOP_GAP / 2 - 9 }))

// The places: scattered along the lap from a seed, clear of the signs, the ramps and the
// finish line, on a random side each. A bay on the road, a door on the verge in front of
// the building, and the building itself further back.
const spots = layoutPlaces({ length: track.length, count: props.places.length, gap: 15, seed: 7,
  avoid: [...stops.map((st) => ({ s: st.s, r: 6 })), ...RAMPS.map((r) => ({ s: r.s + r.len / 2, r: r.len + 3 })), { s: FINISH_S, r: 8 }] })
const places = spots.map((sp, i) => {
  const { s, side } = sp
  const bay = track.at(s, side * 2.3)
  const door = track.at(s, side * (ROAD_HALF + 1.6))
  const site = track.at(s, side * (ROAD_HALF + 4.6))
  return { place: props.places[i], s, side, bayX: side * 2.3, x: bay.x, z: bay.z, doorX: door.x, doorZ: door.z, siteX: site.x, siteZ: site.z, tx: bay.tx, tz: bay.tz }
})

// --- the place the rider is inside, and what it needs from the town every frame ---
// One object, mutated, so an activity that reads it sixty times a second allocates nothing.
const activityCtx = { track, finishS: FINISH_S, store, setView: (v) => { activityView.value = v },
  now: 0, s: 0, onRoad: true, forward: true, riding: false, onFoot: false, air: false, kmh: 0, x: 0, z: 0, side: 0, v: 0, boosting: false, placeS: 0,
  markers: null, arrow: null, lights: null, // filled in below, once the job helpers exist
  say: (text, duration = 3) => reactTo(text, null, { duration }),
  attachToBike: (obj) => car?.add(obj),
  // keeps its place in the world unless `remove`, in which case it is gone
  detachFromBike: (obj, remove = false) => { if (!obj) return; if (remove) obj.parent?.remove(obj); else scene?.attach(obj) } }
function updateActivity(now) {
  if (!activity) return
  activityCtx.now = now
  activityCtx.riding = mounted.value && rideMode.value === 'riding' && inView.value && !guide.tour.active
  activityCtx.s = near.s
  activityCtx.x = state.x; activityCtx.z = state.z; activityCtx.side = near.side; activityCtx.v = state.v
  activityCtx.boosting = state.boost > 0.45
  activityCtx.onFoot = onFoot.value; activityCtx.air = !!state.air; activityCtx.kmh = Math.abs(state.v) * 3.6
  activityCtx.onRoad = !offRoad.value
  activityCtx.forward = state.v >= -0.05 && Math.sin(state.h) * near.tx - Math.cos(state.h) * near.tz > 0
  activity.update(activityCtx)
}

function restoreGameLayout() {
  if (fullscreenRestore) return fullscreenRestore
  if (!expanded.value) return
  fullscreenChanging = true
  expanded.value = false
  if (!disposed) {
    stopOutsideScrollRecovery?.()
    stopOutsideScrollRecovery = recoverGameScrollOnOutside({
      document, game: gameRoot.value, getSmoother: () => ScrollSmoother.get(), overflow: fullscreenOverflow,
      isBlocked: () => expanded.value || !!document.fullscreenElement || guide.tour.active || !!document.querySelector('.gallery'),
      onRelease: () => { gameInputActive.value = false; releaseControls() }
    })
  }
  const release = releaseFullscreenScroll
  releaseFullscreenScroll = null
  fullscreenRestore = (async () => {
    try {
      await release?.()
      if (!disposed) { resize(); focusBefore?.focus?.({ preventScroll: true }) }
    } finally { fullscreenChanging = false; fullscreenRestore = null }
  })()
  return fullscreenRestore
}

async function toggleFullscreen() {
  if (fullscreenChanging) return
  fullscreenChanging = true
  clearInput()
  try {
    if (expanded.value) {
      if (document.fullscreenElement === gameRoot.value) await document.exitFullscreen()
      await restoreGameLayout()
    } else {
      stopOutsideScrollRecovery?.(); stopOutsideScrollRecovery = null
      gameInputActive.value = true
      focusBefore = document.activeElement
      fullscreenOverflow = document.body.style.overflow
      releaseFullscreenScroll = lockGameScroll({ body: document.body, smoother: ScrollSmoother.get(), afterLayout: nextTick })
      const styles = getComputedStyle(gameRoot.value)
      gameSpace.value = gameRoot.value.getBoundingClientRect().height + parseFloat(styles.marginTop) + parseFloat(styles.marginBottom)
      expanded.value = true
      await nextTick() // teleport outside the smooth-scroll transform before entering the top layer
      try { await gameRoot.value?.requestFullscreen?.() } catch { /* full-window fallback stays usable */ }
      gameRoot.value?.querySelector('.drive__fullscreen')?.focus({ preventScroll: true })
    }
  } finally { fullscreenChanging = false; nextTick(resize) }
}

function onFullscreenChange() {
  if (!document.fullscreenElement) restoreGameLayout()
}

/**
 * How high the ground is under a point on the lap. Zero everywhere except on a ramp,
 * where it climbs as the square of the distance up it — a straight wedge launches you
 * off a corner, a curved one rolls you off the lip.
 */
function rampHeight(s, side) {
  if (Math.abs(side) > RAMP_HALF) return 0
  for (const r of RAMPS) {
    let d = s - r.s
    if (d < 0) d += track.length
    if (d <= r.len) return r.h * Math.pow(d / r.len, 1.6)
  }
  return 0
}

/**
 * The ramp as geometry: a climbing strip, two sides and the drop-off at the top.
 * Every triangle is wound anticlockwise seen from outside. Get that backwards and the
 * whole ramp renders inside-out — front faces are all that's drawn, so it reads as a
 * hole in the road rather than a thing on it.
 */
function rampMesh(r) {
  const N = 14, pos = [], idx = []
  const a = {}, b = {}
  for (let k = 0; k <= N; k++) {
    const f = k / N, y = r.h * Math.pow(f, 1.6)
    track.at(r.s + f * r.len, -RAMP_HALF, a); track.at(r.s + f * r.len, RAMP_HALF, b)
    pos.push(a.x, y, a.z, b.x, y, b.z, a.x, 0, a.z, b.x, 0, b.z)   // top pair, then floor pair
    if (k) {
      const p = (k - 1) * 4, q = k * 4
      idx.push(p, p + 1, q, p + 1, q + 1, q)                       // the surface you ride
      idx.push(p, q, p + 2, q, q + 2, p + 2)                       // left flank
      idx.push(p + 1, p + 3, q + 1, p + 3, q + 3, q + 1)           // right flank
    }
  }
  const e = N * 4
  idx.push(e, e + 1, e + 2, e + 1, e + 3, e + 2)                   // the face at the lip
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
/**
 * Stars: each sign says how many float on its run-in (`stars` in billboards.js), up to a
 * dozen. Riding through them counts them.
 *
 * All of them live in one InstancedMesh: ninety-odd pickups for a single draw call and
 * one geometry, which is what keeps an arcade layer from costing anything to speak of.
 */
const STAR = { cap: 12, y: 1.35, spread: 3.4, reach: 1.5 }
const starCount = (n) => Math.max(2, Math.min(STAR.cap, n))
const totalStars = props.signs.reduce((t, r) => t + starCount(r.stars), 0)
const gotStars = ref(0)
let starMesh = null, starAt = [], starGone = null
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _s3 = new THREE.Vector3(1, 1, 1)
const _e3 = new THREE.Euler()

// The minimap. The loop is already sampled, so the map is that path projected flat —
// no extra geometry, no second render, an SVG that answers the question the section is
// actually for: how many projects are there, and where am I among them.
const mapPath = track.svgPath()
const mapStops = places.map((st) => { const [x, y] = mapPath.map(st.x, st.z); return { x, y } })
const mapBike = ref(null)
// Readouts. `state` is a plain object on purpose — it's written every frame and making
// it reactive would put Vue through the render pipeline sixty times a second. These two
// are the only parts of it anyone reads, and they're only written when they change.
const speed = ref(0)
const boosting = ref(false)
const visited = ref(places.map(() => false))
const _mp = {}

const orbit = { yaw: 0, pitch: 0, on: false }
let drag = null, orbitHome = null, suppressClick = false
function returnOrbit(delay = 2) {
  orbitHome?.kill()
  orbitHome = gsap.to(orbit, { yaw: 0, pitch: 0, duration: 1.1, delay, ease: 'power2.inOut', onComplete: () => (orbit.on = false) })
}
const _camDir = new THREE.Vector3(), _toStop = new THREE.Vector3(), _v3 = new THREE.Vector3()
// A roadside billboard, painted at build time. The look is the real thing: a flat block
// of colour, a picture on one side, a headline you can read at speed, a line under it
// you read because you slowed down, and small print you only get by parking.
const PAINT = {
  red:    { bg: '#c8362b', ink: '#fff4e6', sub: '#ffd7c9', strip: '#8f2419', stripInk: '#ffd7c9' },
  cream:  { bg: '#f3e9d2', ink: '#1c1a17', sub: '#4a4237', strip: '#1c1a17', stripInk: '#f3e9d2' },
  blue:   { bg: '#2b63b8', ink: '#ffffff', sub: '#d6e6ff', strip: '#173f7d', stripInk: '#d6e6ff' },
  yellow: { bg: '#ffd04b', ink: '#1c1a17', sub: '#4a3a0c', strip: '#1c1a17', stripInk: '#ffd04b' },
  night:  { bg: '#131a24', ink: '#ffd04b', sub: '#cfd6e0', strip: '#ffd04b', stripInk: '#131a24' },
  mint:   { bg: '#7fd8c0', ink: '#0f2f26', sub: '#1f4d40', strip: '#0f2f26', stripInk: '#bff0e2' },
  purple: { bg: '#5b3a9e', ink: '#ffe9a8', sub: '#e3d6ff', strip: '#2f1c58', stripInk: '#e3d6ff' },
}
// Word-wrap onto at most `max` lines, shrinking the font until it fits; the last line
// keeps whatever is left so a headline is never silently cut.
function fitLines(x, text, width, max, font, size, min) {
  for (let px = size; px >= min; px -= 2) {
    x.font = font.replace('SIZE', px)
    const lines = [], words = text.split(' ')
    let line = ''
    for (const w of words) {
      const t = line ? `${line} ${w}` : w
      if (x.measureText(t).width > width && line) { lines.push(line); line = w } else line = t
    }
    lines.push(line)
    if (lines.length <= max && lines.every((l) => x.measureText(l).width <= width)) return { lines, px }
    if (px - 2 < min) return { lines: lines.slice(0, max), px }
  }
}
function billboardTexture(sign) {
  const p = PAINT[sign.paint] || PAINT.cream
  const c = document.createElement('canvas'); c.width = 512; c.height = 320
  const x = c.getContext('2d')
  // the board: a dark rim, then the paint
  x.fillStyle = '#0d0f12'; x.beginPath(); x.roundRect(0, 0, 512, 320, 10); x.fill()
  x.fillStyle = p.bg; x.beginPath(); x.roundRect(8, 8, 496, 304, 6); x.fill()
  // a touch of print grain so it doesn't read as a UI card
  x.fillStyle = 'rgba(0,0,0,.06)'
  for (let i = 0; i < 90; i++) x.fillRect(8 + Math.random() * 496, 8 + Math.random() * 304, 2, 2)
  // the picture, big, on the side away from the road edge. Colour emoji ignore fillStyle;
  // a font without colour glyphs draws a silhouette in it, so make that the sign's ink.
  x.fillStyle = p.ink
  x.font = '128px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(sign.emoji, 412, 132)
  // headline and the line under it share the space above the strip: wrap the headline as
  // big as fits, then shrink it until both fit in the height
  x.textAlign = 'left'; x.textBaseline = 'alphabetic'
  const TOP = 36, BOTTOM = 250
  let size = 60, head, line, height
  do {
    head = fitLines(x, sign.headline.toUpperCase(), 300, 3, '700 SIZEpx Inter, sans-serif', size, 30)
    line = fitLines(x, sign.line, 300, 2, 'italic 500 SIZEpx Fraunces, Georgia, serif', 30, 22)
    // from the top of the block to the italic line's descender, first-baseline offset included
    height = head.px * 0.92 + head.lines.length * head.px * 1.02 + 8 + line.lines.length * line.px * 1.15
    size = head.px - 2
  } while (height > BOTTOM - TOP && size >= 30)
  let y = TOP + head.px * 0.92 + Math.max(0, BOTTOM - TOP - height) / 2
  x.fillStyle = p.ink; x.font = `700 ${head.px}px Inter, sans-serif`
  head.lines.forEach((l) => { x.fillText(l, 30, y); y += head.px * 1.02 })
  x.fillStyle = p.sub; x.font = `italic 500 ${line.px}px Fraunces, Georgia, serif`
  y += 8
  line.lines.forEach((l) => { x.fillText(l, 30, y); y += line.px * 1.15 })
  // the strip along the bottom: who paid for it
  x.fillStyle = p.strip; x.fillRect(8, 264, 496, 48)
  x.fillStyle = p.stripInk; x.font = '500 19px Inter, sans-serif'; x.textBaseline = 'middle'
  const small = fitLines(x, sign.small, 470, 1, '500 SIZEpx Inter, sans-serif', 19, 14)
  x.font = `500 ${small.px}px Inter, sans-serif`
  x.fillText(small.lines[0], 22, 289)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

// A place's door: a dark frame, lit glass, the name over it, and what the place remembers
// about you along the bottom. Repainted when a record changes.
function doorTexture(place) {
  const act = activityFor(place.id)
  const leased = store.isLeased(place.id, place.lease || 0)
  const open = !!act && leased
  const best = open ? act.formatBest(store.save.best[place.id]) : null
  const c = document.createElement('canvas'); c.width = 256; c.height = 384
  const x = c.getContext('2d')
  x.fillStyle = '#17120e'; x.fillRect(0, 0, 256, 384)                     // the frame
  x.fillStyle = open ? '#3a2716' : '#241c15'; x.fillRect(18, 62, 220, 322) // the slab
  const glow = x.createLinearGradient(0, 100, 0, 300)                      // the lit glass
  glow.addColorStop(0, open ? '#fff1c9' : '#4a4034'); glow.addColorStop(1, open ? '#ffc76a' : '#2e2721')
  x.fillStyle = glow; x.beginPath(); x.roundRect(48, 96, 160, 200, [80, 80, 6, 6]); x.fill()
  x.fillStyle = '#17120e'; x.fillRect(126, 96, 4, 200); x.fillRect(48, 196, 160, 4) // glazing bars
  x.fillStyle = '#ffd04b'; x.beginPath(); x.arc(212, 240, 6, 0, 7); x.fill()          // the handle
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillStyle = '#f6f1e7'; x.font = '600 21px Inter, sans-serif'
  x.fillText(place.name.toUpperCase(), 128, 34, 228)                         // the name over the door
  x.font = 'italic 500 19px Fraunces, Georgia, serif'
  x.fillStyle = open ? '#ffd04b' : '#8a93a3'
  x.fillText(!act ? 'Coming soon' : !leased ? `For lease · $${place.lease}` : (best ?? act.title), 128, 340, 210)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
function paintDoor(i) {
  const mat = doorMats[i]
  if (!mat) return
  mat.map?.dispose()
  mat.map = doorTexture(places[i].place)
  mat.needsUpdate = true
}

// The buildings, from boxes: enough to tell a booth from a house from a shop from a gate
// at riding speed, and nothing to download. Each faces +z, with its door on the front.
function buildPlace(kind, doorMat) {
  const g = new THREE.Group()
  const wall = (w, h, d, color, x = 0, y = h / 2, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))
    m.position.set(x, y, z); g.add(m); return m
  }
  const lit = (w, h, x, y, z, color = '#ffe6a8') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }))
    m.position.set(x, y, z); g.add(m); return m
  }
  const door = (x, z, h = 2.2) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, h), doorMat); m.position.set(x, h / 2, z); g.add(m) }
  if (kind === 'booth') {
    wall(2.6, 2.7, 2.4, '#26324a'); wall(3.0, 0.18, 2.8, '#151a24', 0, 2.79)
    lit(1.0, 0.7, -0.65, 1.9, 1.21); door(0.55, 1.21)
  } else if (kind === 'house') {
    wall(4.2, 2.8, 3.6, '#5a4636')
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 4), new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.95 }))
    roof.position.y = 3.55; roof.rotation.y = Math.PI / 4; g.add(roof)
    lit(0.8, 0.8, -1.3, 1.6, 1.81); lit(0.8, 0.8, 1.3, 1.6, 1.81); door(0, 1.81)
  } else if (kind === 'shop') {
    wall(4.8, 3.0, 3.2, '#3b3f52'); lit(2.2, 1.4, -1.0, 1.5, 1.61, '#fff1c9')
    const awning = wall(5.0, 0.12, 1.3, '#c8362b', 0, 2.4, 2.1); awning.rotation.x = 0.35
    door(1.5, 1.61)
  } else { // gate: two pillars, a lintel with a lamp, a stretch of fence either side
    wall(0.7, 3.4, 0.7, '#4a4a55', -1.5); wall(0.7, 3.4, 0.7, '#4a4a55', 1.5)
    wall(3.7, 0.4, 0.8, '#4a4a55', 0, 3.4); lit(0.5, 0.3, 0, 3.4, 0.41, '#ffd04b')
    wall(2.6, 1.2, 0.15, '#3a3a44', -3.1, 0.6); wall(2.6, 1.2, 0.15, '#3a3a44', 3.1, 0.6)
    door(0, 0.05, 2.6)
  }
  return g
}

// --- what a job puts in the town: markers on the road, an arrow that points at one, dots
// on the minimap, and a hold on the lights. Activities reach these through activityCtx. ---
let markerPool = [], arrowMesh = null, ringGeo = null
const markerDots = shallowRef([])
const arrow = { target: null }
const lightsLocked = ref(false)
function emojiTexture(emoji) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128
  const x = c.getContext('2d')
  x.font = '92px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'
  x.fillText(emoji, 64, 70)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
function refreshDots() {
  markerDots.value = markerPool.map((m) => { const [x, y] = mapPath.map(m.x, m.z); return { x, y, done: m.done, hidden: m.hidden } })
}
const markers = {
  // list of { s, lat, emoji, color, hidden?, reveal? }: a ring on the ground and a picture above it
  set(list) {
    this.clear()
    ringGeo ??= new THREE.TorusGeometry(1.5, 0.1, 8, 40)
    list.forEach((m) => {
      const p = track.at(m.s, m.lat)
      const g = new THREE.Group()
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.85 }))
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(m.emoji), transparent: true }))
      icon.scale.set(1.3, 1.3, 1); icon.position.y = 1.5
      g.add(ring, icon)
      g.position.set(p.x, roadY + rampHeight(m.s, m.lat), p.z)
      g.visible = !m.hidden
      scene.add(g)
      markerPool.push({ group: g, ring, icon, x: p.x, z: p.z, s: m.s, done: false, hidden: !!m.hidden, reveal: m.reveal || 0 })
    })
    refreshDots()
  },
  clear() {
    markerPool.forEach((m) => { scene.remove(m.group); m.icon.material.map.dispose(); m.icon.material.dispose(); m.ring.material.dispose() })
    markerPool = []
    refreshDots()
  },
  show(i) { const m = markerPool[i]; if (m && m.hidden) { m.hidden = false; m.group.visible = true; refreshDots() } },
  isDone(i) { return !!markerPool[i]?.done },
  // from whoever is moving, bike or rider
  dist(i) {
    const m = markerPool[i]
    if (!m || m.done || m.hidden) return Infinity
    const a = onFoot.value ? foot : state
    return Math.hypot(a.x - m.x, a.z - m.z)
  },
  done(i, success) {
    const m = markerPool[i]
    if (!m || m.done) return
    m.done = true
    gsap.to(m.group.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.4, ease: 'back.in(2)', onComplete: () => { m.group.visible = false } })
    if (success) ping(gotStars.value + 6)
    refreshDots()
  },
}
const lights = {
  lock() { lightsLocked.value = true; if (lightsOn.value) toggleLights(true) },
  unlock() { lightsLocked.value = false; if (!lightsOn.value) toggleLights(true) },
}
activityCtx.markers = markers; activityCtx.arrow = arrow; activityCtx.lights = lights
// per frame: bob, spin, reveal by distance, and keep the arrow over the actor pointing at its target
function updateMarkers(actor, t) {
  for (const m of markerPool) {
    if (m.done || m.hidden) continue
    m.icon.position.y = 1.5 + Math.sin(t * 2.2 + m.s) * 0.12
    m.ring.rotation.z = t * 0.8
    if (m.reveal) {
      const d = Math.hypot(actor.x - m.x, actor.z - m.z)
      const o = THREE.MathUtils.clamp(1 - (d - 4) / (m.reveal - 4), 0, 1)
      m.group.visible = o > 0.02
      m.ring.material.opacity = o * 0.85; m.icon.material.opacity = o
    }
  }
  if (!arrowMesh) return
  const m = arrow.target !== null ? markerPool[arrow.target] : null
  arrowMesh.visible = !!m && !m.done
  if (arrowMesh.visible) {
    arrowMesh.position.set(actor.x, roadY + (actor.y || 0) + 2.35 + Math.sin(t * 3) * 0.06, actor.z)
    arrowMesh.lookAt(m.x, arrowMesh.position.y, m.z)
  }
}

// painted parking spot: white outline open toward the road, amber "P"
function bayTexture(mirror) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 480
  const x = c.getContext('2d')
  if (mirror) { x.translate(256, 0); x.scale(-1, 1) } // open edge flips to face the road on left-side bays
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 16; x.lineCap = 'round'
  x.beginPath(); x.moveTo(24, 20); x.lineTo(240, 20); x.lineTo(240, 460); x.lineTo(24, 460); x.stroke()
  x.setTransform(1, 0, 0, 1, 0, 0) // the P itself is never mirrored
  x.fillStyle = 'rgba(255, 208, 75, .95)'; x.font = '700 130px Inter, sans-serif'
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', 128, 240)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

// The bike: a 2017 Harley-Davidson FXDB Street Bob (Sketchfab, CC-BY-4.0, by "everhard"),
// decimated and recompressed into public/drive/bike.glb (15.8 MB → 1.8 MB).
// Every number below is in the model's own metres, measured off the mesh, with the
// download already turned to face +Z (the convention the physics code drives) and
// lifted so the tyres rest on y = 0.
const BIKE = {
  scale: 1,
  lift: 0.249,                                // the download hangs this far below its own origin
  axleY: 0.354,
  axleZ: { front: 0.855, rear: -0.925 },
  wheelR: 0.355,
  headlamp: [0, 1.034, 0.575],                // centre of the headlight lens
  taillamp: [0, 0.644, -1.14],
  seat: [0, 0.77, -0.52],                     // the dish of the saddle, where the weight goes
  grip: [0.32, 1.39, 0.06],                   // handlebar grips
  peg: [0.3, 0.4, -0.05]                      // mid-mount footpegs, at boot height
}
const WHEEL_RADIUS = BIKE.wheelR * BIKE.scale // turns road speed into wheel spin
// With the sit pose below applied, the underside of the rider's pelvis lands this far
// above the avatar's own origin — measured off the posed mesh, so he settles into the
// saddle rather than perching on it.
const RIDER_SCALE = 1, RIDER_SEAT = 0.849, RIDER_SINK = 0.015

// The download is one merged blob per material — no wheel nodes to spin — so the wheels
// are carved out of it here. A triangle is a candidate when it fits inside an axle's
// cylinder, every vertex of it, so nothing that merely straddles the tyre edge gets
// dragged round. Material is too coarse to decide by, though: the same chrome covers
// the rim and the fork legs that pass through the same cylinder. So the candidates are
// unioned into connected parts, and a part joins the wheel if it goes all the way round
// the axle by itself, as a rim, tyre or disc does. Small details that don't — a tread
// block, a disc bolt — join it only when they stay inside the cylinder AND the other
// details at their radius, taken together, do go round: wheel trim repeats evenly, a
// brake pad doesn't. A fork leg or a caliper covers a wedge and carries on outside the
// wheel, so it stays bolted to the bike.
const CARVE = { halfWidth: 0.13, slack: 0.02, bins: 36, gap: 10, band: 0.03 }
function carveWheels(geo) {
  const pos = geo.attributes.position, index = geo.index
  const vert = (i) => (index ? index.getX(i) : i)
  const tris = (index ? index.count : pos.count) / 3
  const tag = new Uint8Array(tris)          // 0 body · 1 front wheel · 2 rear wheel
  const angle = new Float32Array(tris)      // where it sits around that axle
  const radius = new Float32Array(tris)     // and how far out
  const X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0]
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const i = vert(t * 3 + e)
      X[e] = pos.getX(i); Y[e] = pos.getY(i); Z[e] = pos.getZ(i)
    }
    if (Math.abs((X[0] + X[1] + X[2]) / 3) > CARVE.halfWidth) continue
    for (const [w, cz] of [[1, BIKE.axleZ.front], [2, BIKE.axleZ.rear]]) {
      let out = false, dy = 0, dz = 0
      for (let e = 0; e < 3; e++) {
        dy += (Y[e] - BIKE.axleY) / 3; dz += (Z[e] - cz) / 3
        if (Math.hypot(Y[e] - BIKE.axleY, Z[e] - cz) > BIKE.wheelR + CARVE.slack) out = true
      }
      if (out) continue
      tag[t] = w
      angle[t] = Math.atan2(dy, dz)
      radius[t] = Math.hypot(dy, dz)
      break
    }
  }

  // union the triangles into connected parts, joined wherever they share a vertex
  const parent = new Int32Array(tris)
  for (let t = 0; t < tris; t++) parent[t] = t
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a }
  const owner = new Int32Array(pos.count).fill(-1)
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const v = vert(t * 3 + e)
      if (owner[v] < 0) { owner[v] = t; continue }
      const a = find(owner[v]), b = find(t)
      if (a !== b) parent[a] = b
    }
  }

  const arc = (a) => Math.floor(((a + Math.PI) / (Math.PI * 2)) * CARVE.bins)
  // How far round the axle a set of arcs reaches, measured by the widest gap it leaves.
  // A rim or a tyre leaves none; five disc bolts leave five even gaps and still read as
  // going round; a caliper or a fork leg leaves most of the circle empty.
  const goesRound = (bins) => {
    const b = [...bins].sort((x, y) => x - y)
    let gap = b[0] + CARVE.bins - b[b.length - 1]
    for (let i = 1; i < b.length; i++) gap = Math.max(gap, b[i] - b[i - 1])
    return gap <= CARVE.gap
  }
  const swept = new Map()             // part + wheel → the arc it covers, and its mean radius
  const loose = new Int32Array(tris)  // per part: triangles that fell outside every cylinder
  for (let t = 0; t < tris; t++) {
    const part = find(t)
    if (!tag[t]) { loose[part]++; continue }
    const key = part * 4 + tag[t]
    let p = swept.get(key)
    if (!p) swept.set(key, p = { bins: new Set(), r: 0, n: 0 })
    p.bins.add(arc(angle[t]))
    p.r += radius[t]; p.n++
  }

  // parts too small to sweep the circle alone pool with their neighbours at the same
  // radius, and ride only if the pool sweeps it between them
  const pools = new Map()
  for (const [key, p] of swept) {
    if (goesRound(p.bins) || loose[(key - (key % 4)) / 4] !== 0) continue
    p.pool = (key % 4) * 4096 + Math.round(p.r / p.n / CARVE.band)
    let bins = pools.get(p.pool)
    if (!bins) pools.set(p.pool, bins = new Set())
    for (const b of p.bins) bins.add(b)
  }
  const rides = (key) => {
    const p = swept.get(key)
    if (!p) return false
    if (goesRound(p.bins)) return true
    return p.pool !== undefined && goesRound(pools.get(p.pool))
  }

  const out = { front: [], rear: [], body: [] }
  for (let t = 0; t < tris; t++) {
    const w = tag[t] && rides(find(t) * 4 + tag[t]) ? tag[t] : 0
    const bucket = w === 1 ? out.front : w === 2 ? out.rear : out.body
    bucket.push(vert(t * 3), vert(t * 3 + 1), vert(t * 3 + 2))
  }
  return out
}

// Flatten a loaded mesh into plain float geometry in bike space: the download is
// meshopt-quantized and sits under the loader's own node transforms, and the carve
// above needs to read positions as metres.
function bakeToBike(mesh) {
  const src = mesh.geometry, n = src.attributes.position.count
  const geo = new THREE.BufferGeometry()
  const v = new THREE.Vector3()
  const P = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(src.attributes.position, i).applyMatrix4(mesh.matrixWorld)
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z
  }
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3))
  if (src.attributes.normal) {
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    const N = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(src.attributes.normal, i).applyMatrix3(nm).normalize()
      N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  }
  for (const key of ['uv', 'uv1']) if (src.attributes[key]) geo.setAttribute(key, src.attributes[key].clone())
  if (src.index) geo.setIndex(src.index.clone())
  return geo
}

// Loads the bike and hangs the two carved wheels on their own axle pivots.
// Fills the module vars: wheels (spin), frontWheels (nothing to steer — the download
// has no separable fork, so the lean carries the turn on its own).
async function loadBike(loader) {
  const src = (await loader.loadAsync('bike.glb')).scene
  src.rotation.y = Math.PI       // the download faces -Z; everything here drives +Z
  src.position.y = BIKE.lift
  src.updateMatrixWorld(true)

  const g = new THREE.Group()
  const front = new THREE.Group(); front.position.set(0, BIKE.axleY, BIKE.axleZ.front)
  const rear = new THREE.Group(); rear.position.set(0, BIKE.axleY, BIKE.axleZ.rear)
  g.add(front, rear)

  const meshes = []
  src.traverse((o) => { if (o.isMesh) meshes.push(o) })
  for (const mesh of meshes) {
    const geo = bakeToBike(mesh)
    const parts = carveWheels(geo)
    // the three parts share one set of attributes and differ only in their index,
    // so carving costs an index buffer rather than a copy of the mesh
    const add = (list, parent) => {
      if (!list.length) return
      const sub = new THREE.BufferGeometry()
      for (const key in geo.attributes) sub.setAttribute(key, geo.attributes[key])
      sub.setIndex(list)
      const m = new THREE.Mesh(sub, mesh.material)
      m.position.copy(parent.position).negate() // undo the pivot; the geometry is already in bike space
      parent.add(m)
    }
    add(parts.body, g)
    add(parts.front, front)
    add(parts.rear, rear)
  }
  g.scale.setScalar(BIKE.scale)
  wheels = [front, rear]
  frontWheels = []
  return g
}

// headlamp beam, lamp face and brake light, parented to the car rather than the scaled
// bike so the spotlight's throw stays in metres
function fitLights(car) {
  const S = BIKE.scale
  const [hx, hy, hz] = BIKE.headlamp
  const sp = new THREE.SpotLight('#ffe9b8', 70, 34, 0.5, 0.55, 1.5)
  sp.position.set(hx * S, hy * S, hz * S)
  const tgt = new THREE.Object3D(); tgt.position.set(0, 0.1, 16)
  car.add(sp, tgt); sp.target = tgt
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.075 * S, 20), new THREE.MeshBasicMaterial({ color: '#fff3cf' }))
  face.position.set(hx * S, hy * S, hz * S + 0.012)
  const [tx, ty, tz] = BIKE.taillamp
  brakeLight = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * S, 0.06 * S), new THREE.MeshBasicMaterial({ color: '#ff2e1f', transparent: true, opacity: 0 }))
  brakeLight.position.set(tx * S, ty * S, tz * S - 0.015); brakeLight.rotation.y = Math.PI
  car.add(face, brakeLight)
  headlights = [sp]
  lamps = [face]
}

async function init() {
  const el = host.value
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  // Capped at 1.5, not the display's own ratio. A canvas costs its pixel count twice over
  // — colour and depth — and antialiasing multiplies that again, so at DPR 2 this one
  // buffer was the largest allocation on the page: 253 MB at 1080p, 450 at 1440p. 1.5
  // still resolves well above CSS pixels and takes 44% of it back.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  el.prepend(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#0b111b')
  scene.fog = new THREE.Fog('#0b111b', 30, 95)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.45
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight('#8fb3d9', '#1d2a1f', 0.9))
  const key = new THREE.DirectionalLight('#ffe3b0', 1.6); key.position.set(6, 10, 4); scene.add(key)

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  resize()

  // big dark ground under everything
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#0e1520', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0); scene.add(ground)

  const loader = new GLTFLoader().setPath('/drive/').setMeshoptDecoder(MeshoptDecoder)
  const [forest] = await Promise.all(['decoration-forest.glb'].map((f) => loader.loadAsync(f)))
  if (disposed) return

  // The road: one ribbon of triangles along the centreline, and a wider green one just
  // under it for the verge, so the tarmac has an edge to it rather than floating on the
  // ground plane. Two meshes for the entire circuit.
  roadY = 0.02
  const road = new THREE.Group()
  const surface = new THREE.Mesh(track.ribbon(ROAD_HALF, 8),
    new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.92 }))
  surface.position.y = roadY
  const verge = new THREE.Mesh(track.ribbon(VERGE + 1.4, 8),
    new THREE.MeshStandardMaterial({ color: '#365c32', roughness: 1 }))
  verge.position.y = roadY - 0.015
  road.add(verge, surface)
  // One tiny generated checker texture; no model or image download for the finish line.
  const checkers = document.createElement('canvas'); checkers.width = 128; checkers.height = 16
  const checkerContext = checkers.getContext('2d')
  for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
    checkerContext.fillStyle = (row + col) % 2 ? '#20242c' : '#fff5df'
    checkerContext.fillRect(col * 8, row * 8, 8, 8)
  }
  const checkerTexture = new THREE.CanvasTexture(checkers)
  checkerTexture.colorSpace = THREE.SRGBColorSpace
  finishLine = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.35),
    new THREE.MeshBasicMaterial({ map: checkerTexture, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
  finishLine.rotation.set(-Math.PI / 2, 0, -Math.atan2(finishPoint.tx, -finishPoint.tz))
  finishLine.position.set(finishPoint.x, roadY + 0.005, finishPoint.z)
  road.add(finishLine)
  // trees around the outside of the lap, set back off the verge
  for (let i = 0; i < track.count; i += 90) {
    const f = forest.scene.clone()
    const p = track.at(track.arc[i], (i % 180 === 0 ? 1 : -1) * (VERGE + 7))
    f.position.set(p.x, 0, p.z)
    f.rotation.y = Math.atan2(p.tx, -p.tz)
    road.add(f)
  }
  const rampMat = new THREE.MeshStandardMaterial({ color: '#3b4250', roughness: 0.8, metalness: 0.1 })
  for (const r of RAMPS) { const m = new THREE.Mesh(rampMesh(r), rampMat); m.position.y = roadY + 0.001; road.add(m) }
  scene.add(road)

  // billboards. The sign text is painted with the page's web fonts, which may still be
  // in flight this early; wait for them or the first paint falls back to system fonts.
  try { await Promise.all([document.fonts.load('700 60px Inter'), document.fonts.load('italic 500 30px Fraunces')]) } catch { /* draw with fallbacks */ }
  stops.forEach((s, i) => {
    const g = new THREE.Group()
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.85), new THREE.MeshBasicMaterial({ map: billboardTexture(s.sign) }))
    panel.position.y = 3.3
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.25), new THREE.MeshBasicMaterial({ color: '#ffd04b', transparent: true, opacity: 0 }))
    glow.position.set(0, 3.3, -0.02)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9), new THREE.MeshStandardMaterial({ color: '#4a3117', roughness: 0.9 }))
    post.position.y = 0.95
    // A board on the back as well. A plane has one face, so a sign only exists from in
    // front of it — fine on a road with one direction of travel, wrong on a lap you can
    // ride either way round and blank the moment you reverse. Turned to face the other
    // way rather than made double-sided, which would mirror every word on it. Shares the
    // panel's geometry, texture and the glow's material, so it costs a draw call and
    // nothing else — and the glow still animates for both from the one material.
    const back = new THREE.Mesh(panel.geometry, panel.material)
    back.position.y = 3.3; back.rotation.y = Math.PI
    const backGlow = new THREE.Mesh(glow.geometry, glow.material)
    backGlow.position.set(0, 3.3, 0.02); backGlow.rotation.y = Math.PI
    g.add(glow, panel, backGlow, back, post)
    g.position.set(s.signX, roadY, s.signZ)
    // Facing back up the road at whoever is riding toward it, turned 0.22 in toward the
    // tarmac — the same convention the straight road used, which on a lap has to be
    // built from the tangent rather than assumed. Getting the sign of this wrong points
    // every sign the other way, and a single-sided plane seen from behind is invisible.
    g.rotation.y = Math.atan2(-s.tx, -s.tz) - s.side * 0.22
    frames[i] = glow
    stopGroups[i] = g
    scene.add(g)
  })

  // the job arrow: a cone over the bike, tip along +z so lookAt aims it
  arrowMesh = new THREE.Group()
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 16),
    new THREE.MeshStandardMaterial({ color: '#ffd04b', emissive: '#ffb01f', emissiveIntensity: 1.2, roughness: 0.4 }))
  cone.rotation.x = Math.PI / 2
  arrowMesh.add(cone); arrowMesh.visible = false
  scene.add(arrowMesh)

  // the stars, laid out along the run-in to each sign
  if (totalStars) {
    const geo = new THREE.OctahedronGeometry(0.22, 0)
    const mat = new THREE.MeshStandardMaterial({ color: '#ffd04b', emissive: '#ffb01f', emissiveIntensity: 1.5, roughness: 0.35, metalness: 0.2 })
    starMesh = new THREE.InstancedMesh(geo, mat, totalStars)
    starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    starMesh.frustumCulled = false
    starGone = new Uint8Array(totalStars)
    let k = 0
    const p = {}
    stops.forEach((st) => {
      const n = starCount(st.sign.stars)
      for (let j = 0; j < n; j++) {
        // strung along the road toward the sign, weaving across it so collecting them
        // is a line you ride rather than a spot you park on
        const d = st.s - STAR.spread * (n - j) - 2
        const lat = Math.sin(j * 1.9) * 1.7 + st.side * 0.6
        track.at(d, lat, p)
        starAt.push(p.x, STAR.y, p.z)
        k++
      }
    })
    scene.add(starMesh)
  }

  // the places: a building set back from the road, its door on the verge, a P bay on the
  // road in front. Door faces are unlit so they glow at night; repainted when a record changes.
  doorMats = places.map(() => new THREE.MeshBasicMaterial())
  places.forEach((s, i) => {
    const g = buildPlace(s.place.building, doorMats[i])
    g.position.set(s.siteX, roadY, s.siteZ)
    g.rotation.y = Math.atan2(s.x - s.siteX, s.z - s.siteZ) // the front looks at the bay
    scene.add(g)
    paintDoor(i)
  })
  watch(() => places.map((s) => store.save.best[s.place.id]), (now, before) => {
    now.forEach((v, i) => { if (v !== before[i]) paintDoor(i) })
  })
  watch(() => store.save.leased.length, () => places.forEach((_, i) => paintDoor(i)))
  const bayGeo = new THREE.PlaneGeometry(2.3, 4.4)
  const bayTex = { 1: bayTexture(false), '-1': bayTexture(true) }
  places.forEach((s, i) => {
    const bay = new THREE.Mesh(bayGeo, new THREE.MeshBasicMaterial({ map: bayTex[s.side], transparent: true, opacity: 0.8, depthWrite: false }))
    bay.rotation.x = -Math.PI / 2
    bay.position.set(s.x, roadY + 0.02, s.z)
    bay.rotation.z = -Math.atan2(s.tx, -s.tz)
    const glow = new THREE.Mesh(bayGeo, new THREE.MeshBasicMaterial({ color: '#ffd04b', transparent: true, opacity: 0, depthWrite: false }))
    glow.rotation.x = -Math.PI / 2
    glow.position.set(s.x, roadY + 0.015, s.z)
    glow.rotation.z = -Math.atan2(s.tx, -s.tz)
    bayGlows[i] = glow
    scene.add(bay, glow)
  })

  // car
  car = new THREE.Group()
  bike = await loadBike(loader)
  car.add(bike)
  fitLights(car)
  if (disposed) return
  const s0 = track.at(START_S)
  state.x = s0.x; state.z = s0.z
  state.h = Math.atan2(s0.tx, -s0.tz)   // heading whose forward vector is the tangent
  car.rotation.y = Math.PI - state.h
  car.position.set(state.x, roadY + 0.02, state.z)
  scene.add(car)

  // exhaust puff for the moment it catches — parented to the car so it doesn't lean
  exhaust = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#c9d3de', transparent: true, opacity: 0, depthWrite: false })
  )
  exhaust.position.set(0.28 * BIKE.scale, 0.32 * BIKE.scale, -0.62)
  exhaust.visible = false
  car.add(exhaust)

  timer = new THREE.Timer()
  tick()
  loadRider().catch(() => (mounted.value = true)) // the avatar riding along — optional, never blocks the scene
  if (import.meta.env.DEV) window.__drive = { state, stops, places, activeIdx, lightsOn, camMode, honk, engine: () => engine, muted, store, entrance, enterPlace, leavePlace, foot, track, mounted, riderReady, rideMode, phase, activityView, inView, doorMats: () => doorMats, doorTexture, activityCtx, markers: () => markerPool, tune: () => tune, sceneOpen: () => !!sceneComponent.value,
    probe: () => { // bike-local positions of the rider's hands, for pose tuning
      const out = {}
      for (const n of ['RightHand', 'LeftHand']) {
        const b = riderBones[n]; if (!b) continue
        const v = new THREE.Vector3(); b.getWorldPosition(v); car.worldToLocal(v)
        out[n] = { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }
      }
      return out
    } }
}

// --- the avatar walks up, swings a leg over and starts the bike ---
// He is parented to the car the whole time, so the choreography is written in bike-local
// metres: +Z is the front wheel, and he arrives from -X because that is the side the
// chase camera watches from — he stays in frame the whole way.
const SADDLE = [0, 0, 0]                 // filled in from BIKE.seat once the rider loads
const MOUNT = { stand: [-1.25, -0.02, -1.4], beside: [-0.62, -0.02, -0.55], facing: -2.9 }

// Drop tracks for bones this rig doesn't have, and zero the hips' x/z so the clip
// treads on the spot — we drive him along the ground ourselves.
function prepClip(clip, names) {
  clip.tracks = clip.tracks
    .filter((t) => names.has(t.name.split('.')[0]))
    .map((t) => {
      if (t.name !== 'Hips.position') return t
      const v = t.values.slice()
      for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0 } // keep the y bob
      return new THREE.VectorKeyframeTrack(t.name, t.times, v)
    })
  return clip
}
// How fast the walk clip's own root travels, so tweening him at that speed keeps his
// feet planted instead of skating.
function clipSpeed(clip) {
  const t = clip.tracks.find((k) => k.name === 'Hips.position')
  if (!t || !clip.duration) return 1.4
  const last = t.values.length - 3
  return Math.hypot(t.values[last] - t.values[0], t.values[last + 2] - t.values[2]) / clip.duration || 1.4
}

async function loadRider() {
  const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder) // fresh loader — the shared one is rooted at /drive/
  const [me, idle, walk, greet] = await Promise.all([
    avatarInstance(),  // shared parse; this scene only reads his materials
    ...['/avatar/idle.glb', '/avatar/walk.glb', '/avatar/gestures/wave.glb'].map((f) => l.loadAsync(f))
  ])
  if (disposed || !car) return
  rider = me
  const names = new Set()
  rider.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false
    if (o.isBone) { names.add(o.name); riderBones[o.name] = o }
  })
  rider.scale.setScalar(RIDER_SCALE)
  car.add(rider)
  riderMixer = new THREE.AnimationMixer(rider)

  stride = clipSpeed(walk.animations[0]) // measured before prepClip strips the travel
  const action = (clip, once) => {
    const a = riderMixer.clipAction(prepClip(clip, names))
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true }
    a.play().setEffectiveWeight(0)
    return a
  }
  riderClips.idle = action(idle.animations[0])
  riderClips.walk = action(walk.animations[0])
  riderClips.greet = action(greet.animations[0], true)
  riderClips.idle.setEffectiveWeight(1)

  SADDLE[0] = 0
  SADDLE[1] = (BIKE.seat[1] - RIDER_SINK) * BIKE.scale - RIDER_SEAT * RIDER_SCALE
  SADDLE[2] = BIKE.seat[2] * BIKE.scale
  rider.position.set(...MOUNT.stand)
  rider.rotation.y = MOUNT.facing
  riderReady.value = true
  if (mounted.value) {
    // Input may have skipped the intro while the shared avatar was still loading.
    rider.position.set(...SADDLE); rider.rotation.y = 0; riderPose.sit = 1
  } else if (inView.value) playMount()
}

// Only load the existing running animation once the visitor explores on foot.
function ensureRunClip() {
  if (runClipLoad) return
  runClipLoad = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/avatar/run.glb')
    .then(({ animations }) => {
      if (disposed || !riderMixer) return
      runStride = clipSpeed(animations[0])
      riderClips.run = riderMixer.clipAction(prepClip(animations[0], new Set(Object.keys(riderBones))))
      riderClips.run.play().setEffectiveWeight(0)
    }).catch(() => { /* keep the speed-matched walk clip if the optional run clip fails */ })
}

function clearInput() {
  controls.clear()
  controlsReset.value++
  foot.v = foot.held = riderMix.run = 0
}

function toggleRideMode() {
  if (interactionDisabled.value || guide.tour.active) return
  clearInput()
  driven.value = true
  orbitHome?.kill(); orbit.on = false; orbit.yaw = orbit.pitch = 0
  if (onFoot.value) {
    // Recheck distance at action time, not only the last rendered button state.
    if (Math.hypot(foot.x - state.x, foot.z - state.z) > MOUNT_REACH) return
    rideMode.value = 'mounting'
    car.attach(rider) // preserve his world pose when entering bike-local space
    // attach() decomposes the matrix into XYZ Euler angles. Relative yaw beyond
    // 90 degrees can become X=PI / Z=PI; tweening only Y then seats him backwards.
    // Both actors are upright here, so express their relative heading as pure yaw.
    const relativeHeading = state.h - foot.h
    rider.rotation.set(0, Math.atan2(Math.sin(relativeHeading), Math.cos(relativeHeading)), 0)
    const approach = Math.max(0.2, Math.hypot(rider.position.x - MOUNT.beside[0], rider.position.z - MOUNT.beside[2]) / stride)
    const heading = Math.atan2(MOUNT.beside[0] - rider.position.x, MOUNT.beside[2] - rider.position.z)
    changeRideTl = gsap.timeline({ onComplete: () => {
      rider.rotation.set(0, 0, 0)
      rider.position.set(...SADDLE)
      rideMode.value = 'riding'; changeRideTl = null; clearInput(); kickstart()
    } })
      .to(rider.rotation, { y: heading, duration: 0.2 }, 0)
      .to(riderMix, { walk: 1, duration: 0.15 }, 0)
      .to(rider.position, { x: MOUNT.beside[0], y: MOUNT.beside[1], z: MOUNT.beside[2], duration: approach, ease: 'none' }, 0)
      .to(riderMix, { walk: 0, duration: 0.2 }, approach)
      .to(rider.rotation, { y: 0, duration: 0.65 }, approach)
      .to(rider.position, { x: SADDLE[0], z: SADDLE[2], duration: 0.65 }, approach)
      .to(rider.position, { y: SADDLE[1] + 0.2, duration: 0.32 }, approach)
      .to(rider.position, { y: SADDLE[1], duration: 0.33 }, approach + 0.32)
      .to(riderPose, { sit: 1, duration: 0.65 }, approach)
  } else dismount()
}

// Getting off. `onDone` runs once he is standing beside the bike. Returns false if the
// bike is not stopped on level ground.
function dismount(onDone) {
    if (Math.abs(state.v) > 0.8 || state.air || state.y > 0.05) return false
    rideMode.value = 'dismounting'
    activity?.interrupt(activityCtx, 'Lap canceled · explore on foot, or cross the line to retry.')
    ensureRunClip()
    state.v = state.boost = state.held = state.steer = state.squash = 0
    car.rotation.set(0, Math.PI - state.h, 0)
    car.position.y = roadY + 0.02
    frontWheels.forEach(w => { w.rotation.y = 0 })
    riderMix.walk = riderMix.greet = riderPose.wave = 0
    updateEngine()
    changeRideTl = gsap.timeline({ onComplete: () => {
      scene.attach(rider)
      foot.x = rider.position.x; foot.z = rider.position.z; foot.h = state.h; foot.v = 0
      rideMode.value = 'walking'; changeRideTl = null
      onDone?.()
    } })
      .to(rider.position, { y: SADDLE[1] + 0.25, duration: 0.3 }, 0)
      .to(riderPose, { sit: 0, duration: 0.65 }, 0)
      .to(rider.position, { x: -1.25, z: MOUNT.beside[2], duration: 0.7 }, 0.1)
      .to(rider.position, { y: -0.02, duration: 0.4 }, 0.4)
    return true
}

// --- going into a place: park in the bay, Enter, off the bike, walk to the door ---
const activeActivity = computed(() => (active.value ? activityFor(active.value.id) : null))
const activeLeased = computed(() => !!active.value && store.isLeased(active.value.id, active.value.lease || 0))
const doorLine = computed(() => {
  if (!active.value) return ''
  const act = activeActivity.value
  if (!act) return 'Coming soon'
  if (!activeLeased.value) return `For lease · $${active.value.lease}`
  return `${act.title} · ${act.formatBest(store.save.best[active.value.id]) ?? 'No record yet'}`
})
const enterLine = computed(() => !canGoIn.value ? '' : activeLeased.value ? 'Enter to go in ↵'
  : store.canAfford(active.value.lease) ? `Enter to lease ↵` : 'Not enough cash')
// The button's state. canLeaveBike is the same stopped-on-level-ground test, kept reactive.
const canGoIn = computed(() => phase.value === 'idle' && rideMode.value === 'riding' && !!activeActivity.value
  && riderReady.value && mounted.value && canLeaveBike.value)
function setPhase(next) { if (next) phase.value = next; return next }

function enterPlace() {
  if (guide.tour.active) return
  const idx = activeIdx.value
  const ok = canEnter({ phase: entrance.phase, rideMode: rideMode.value, stop: idx, speed: state.v, air: state.air, height: state.y,
    riderReady: riderReady.value, mounted: mounted.value, hasActivity: !!activityFor(props.places[idx]?.id) })
  if (!ok) return false
  const place = props.places[idx]
  if (!store.isLeased(place.id, place.lease || 0)) {
    if (!store.lease(place.id, place.lease)) { reactTo(`${place.name} wants $${place.lease}. You have $${store.save.cash}.`, null, { duration: 3 }); return true }
    reactTo(`${place.name} is yours.`, null, { duration: 3 })
  }
  clearInput(); driven.value = true
  orbitHome?.kill(); orbit.on = false; orbit.yaw = orbit.pitch = 0
  setPhase(entrance.send('enter', idx))
  const started = dismount(() => {
    if (entrance.phase !== 'dismounting') return // cancelled mid-animation: he just gets off
    setPhase(entrance.send('dismounted'))
    const st = places[entrance.stop]
    doorWalk = doorPath({ bike: { x: state.x, z: state.z }, forward: { x: Math.sin(state.h), z: -Math.cos(state.h) },
      door: { x: st.doorX, z: st.doorZ } })
  })
  if (!started) cancelEntrance()
  return started
}
// The automatic walk. Any input cancels it (see onKey and moveJoystick) and leaves him standing.
function walkToDoor(dt) {
  if (!doorWalk) return
  if (advanceAlong(foot, doorWalk, FOOT.walk, dt)) {
    doorWalk = null
    const st = places[entrance.stop]
    foot.h = headingTo({ x: foot.x, z: foot.z }, { x: st.siteX, z: st.siteZ })
    activity = activityFor(st.place.id)
    placeTitle.value = activity.title
    activityCtx.placeS = st.s
    setPhase(entrance.send('arrived'))
    if (activity.kind === 'scene') { clearInput(); sceneComponent.value = activity.component }
    activity.enter(activityCtx)
    reactTo(`${st.place.name}. ${activity.title}.`, null, { every: 3000, duration: 2.5 })
  }
  placeFoot(dt)
}
function cancelEntrance() {
  doorWalk = null
  setPhase(entrance.send('cancel'))
}
function leavePlace() {
  if (entrance.phase !== 'inside') return
  activity?.exit(activityCtx)
  activity = null
  placeTitle.value = ''
  activityView.value = null
  sceneComponent.value = null
  setPhase(entrance.send('leave'))
}

function walkOnFoot(dt) {
  foot.h += (input.right - input.left) * 2.4 * dt
  foot.held = input.fwd >= 0.85 && !input.back ? Math.min(foot.held + dt, FOOT.runAfter + FOOT.ramp) : 0
  const runAmount = THREE.MathUtils.clamp((foot.held - FOOT.runAfter) / FOOT.ramp, 0, 1)
  const targetSpeed = input.fwd ? input.fwd * THREE.MathUtils.lerp(FOOT.walk, FOOT.run, runAmount) : -input.back * FOOT.reverse
  foot.v = THREE.MathUtils.damp(foot.v, targetSpeed, 10, dt)
  const previousX = foot.x, previousZ = foot.z
  foot.x += Math.sin(foot.h) * foot.v * dt
  foot.z -= Math.cos(foot.h) * foot.v * dt
  // A small footprint keeps him from walking through the parked bike.
  const dx = foot.x - state.x, dz = foot.z - state.z
  const across = dx * Math.cos(state.h) + dz * Math.sin(state.h)
  const forward = dx * Math.sin(state.h) - dz * Math.cos(state.h)
  if ((across / 0.65) ** 2 + (forward / 1.55) ** 2 < 1) {
    foot.x = previousX; foot.z = previousZ; foot.v = foot.held = 0
  }
  placeFoot(dt)
}

// Where `foot` says he is, made true: clamped to the town, lifted by the ramps, and the
// clips blended for how fast he is going.
function placeFoot(dt) {
  track.nearest(foot.x, foot.z, footNear)
  const limit = VERGE + 9
  if (footNear.dist > limit) {
    foot.x = footNear.x + (foot.x - footNear.x) * limit / footNear.dist
    foot.z = footNear.z + (foot.z - footNear.z) * limit / footNear.dist
    track.nearest(foot.x, foot.z, footNear)
  }
  foot.y = rampHeight(footNear.s, footNear.side)
  rider.position.set(foot.x, roadY + foot.y, foot.z)
  rider.rotation.set(0, Math.PI - foot.h, 0)
  riderMix.walk = THREE.MathUtils.damp(riderMix.walk, Math.abs(foot.v) > 0.05 ? 1 : 0, 12, dt)
  const runWeight = riderClips.run ? THREE.MathUtils.clamp((foot.v - FOOT.walk) / (FOOT.run - FOOT.walk), 0, 1) : 0
  riderMix.run = THREE.MathUtils.damp(riderMix.run, runWeight, 12, dt)
  riderClips.walk.timeScale = foot.v / (stride * RIDER_SCALE)
  if (riderClips.run) riderClips.run.timeScale = Math.max(0, foot.v) / (runStride * RIDER_SCALE)
  nearBike.value = Math.hypot(foot.x - state.x, foot.z - state.z) <= MOUNT_REACH && Math.abs(foot.y - state.y) < 0.2
}

// The whole arrival, as one scrubbable timeline. Any input skips to the end.
function playMount() {
  if (!rider || mountTl || mounted.value) return
  const step = Math.hypot(MOUNT.beside[0] - MOUNT.stand[0], MOUNT.beside[2] - MOUNT.stand[2])
  const walkFor = step / stride
  const heading = Math.atan2(MOUNT.beside[0] - MOUNT.stand[0], MOUNT.beside[2] - MOUNT.stand[2])
  const swing = 2.1 + walkFor // when he starts getting on

  mountTl = gsap.timeline({ onComplete: () => { mounted.value = true } })
  // he spots you and waves before he sets off
  mountTl.call(() => riderClips.greet.reset().play(), null, 0.3)
  mountTl.to(riderMix, { greet: 1, duration: 0.25 }, 0.3)
  mountTl.to(riderMix, { greet: 0, duration: 0.35 }, 1.65)
  // turns for the bike and walks up to its left
  mountTl.to(rider.rotation, { y: heading, duration: 0.45, ease: 'power2.inOut' }, 1.7)
  mountTl.to(riderMix, { walk: 1, duration: 0.25 }, 1.95)
  mountTl.to(rider.position, { x: MOUNT.beside[0], z: MOUNT.beside[2], duration: walkFor, ease: 'none' }, 2.1)
  // swings a leg over: rises off the ground, turns down the road, settles into the saddle
  mountTl.to(riderMix, { walk: 0, duration: 0.3 }, swing)
  mountTl.to(rider.rotation, { y: 0, duration: 0.75, ease: 'power2.inOut' }, swing)
  mountTl.to(rider.position, { x: SADDLE[0], z: SADDLE[2], duration: 0.75, ease: 'power2.inOut' }, swing)
  mountTl.to(rider.position, { y: SADDLE[1] + 0.22, duration: 0.38, ease: 'power2.out' }, swing)
  mountTl.to(rider.position, { y: SADDLE[1], duration: 0.42, ease: 'power2.in' }, swing + 0.38)
  mountTl.to(riderPose, { sit: 1, duration: 0.8, ease: 'power2.inOut' }, swing + 0.05)
  // thumbs the starter, then waves you along
  mountTl.call(kickstart, null, swing + 0.95)
  mountTl.to(riderPose, { wave: 1, duration: 0.3, ease: 'power2.out' }, swing + 1.5)
  mountTl.to(riderPose, { wave: 0, duration: 0.35, ease: 'power2.in' }, swing + 2.5)
}
// Called on the first input, and when the section scrolls away mid-sequence.
function skipMount() {
  if (mounted.value) return
  mountTl?.kill(); mountTl = null
  if (rider) { rider.position.set(...SADDLE); rider.rotation.y = 0 }
  riderMix.walk = riderMix.greet = 0
  riderPose.sit = 1; riderPose.wave = 0
  mounted.value = true
}
// The engine catching: a shove through the frame and a puff out of the pipe. The start
// sample only plays if the visitor has already unlocked audio — an intro can't do it.
function kickstart() {
  if (bike) gsap.fromTo(bike.rotation, { z: 0.05 }, { z: 0, duration: 1, ease: 'elastic.out(1.5, 0.32)', overwrite: true })
  if (exhaust) {
    exhaust.visible = true
    gsap.fromTo(exhaust.scale, { x: 0.15, y: 0.15, z: 0.15 }, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'power2.out', overwrite: true })
    gsap.fromTo(exhaust.position, { z: -0.62 }, { z: -1.05, duration: 1.1, ease: 'power1.out', overwrite: true })
    gsap.fromTo(exhaust.material, { opacity: 0.42 }, { opacity: 0, duration: 1.1, ease: 'power2.out', overwrite: true,
      onComplete: () => (exhaust.visible = false) })
  }
  if (audioCtx?.state === 'running') ensureEngine()
}
// `w` ramps the whole posture on as he settles into the saddle: every angle is simply
// scaled, so w=0 leaves the walk clip untouched and w=1 is the full riding pose.
function applyRiderSit(w) {
  if (w <= 0 && riderPose.wave <= 0) return
  const B = riderBones
  const x = (bone, a) => bone?.rotateX(a * w)
  const z = (bone, a) => bone?.rotateZ(a * w)
  // Riding posture, reapplied over the idle each frame. The Street Bob is a cruiser:
  // sat upright, feet forward on the mid-mount pegs, arms out to chest-high bars — not
  // the crouch a sportbike would ask for. Left and right differ because the idle clip
  // it lands on is itself asymmetric; these cancel that out, so the boots end up level
  // on the pegs and the elbows hang below the shoulder-to-wrist line rather than
  // folding back through it.
  x(B.LeftUpLeg, 1.32); x(B.RightUpLeg, 1.47)   // thighs forward to the pegs
  z(B.LeftUpLeg, 0.09); z(B.RightUpLeg, -0.37)  // knees out around the tank
  x(B.LeftLeg, -1.01); x(B.RightLeg, -1.07)
  x(B.LeftFoot, 0.62); x(B.RightFoot, 0.62)
  x(B.Spine, 0.28)
  x(B.Neck, -0.1)
  x(B.RightArm, -1.01); z(B.RightArm, -0.85); x(B.RightForeArm, -0.96)
  x(B.LeftArm, -0.93); z(B.LeftArm, 1.37); x(B.LeftForeArm, -0.5)
  // Seated wave, laid over the top: the throttle hand comes up beside his head and
  // swings. It's the right hand because that's the one facing the chase camera.
  const v = riderPose.wave
  if (v > 0) {
    B.RightArm?.rotateX(-0.95 * v); B.RightArm?.rotateY(-0.06 * v); B.RightArm?.rotateZ(0.43 * v)
    B.RightForeArm?.rotateX(-0.7 * v)
    B.RightForeArm?.rotateZ((0.09 + Math.sin(performance.now() / 1000 * 8) * 0.42) * v)
  }
}

function updateBike(dt) {

  // arcade bike physics: steering turns the heading, the bike drives where it points.
  // None of this changed when the road became a loop — it was always a heading and a
  // position in two dimensions. What changed is what keeps it on the road, below.

  // Boost. Holding the throttle pulls into a top gear after a moment rather than the
  // instant you touch it, so ordinary riding is unchanged and the extra speed is
  // something you commit to. It bleeds away far faster than it builds: lifting off, or
  // running onto the grass, drops you straight back out of it.
  state.held = input.fwd >= 0.85 && !offRoad.value ? state.held + dt : 0
  const want = state.held > tune.boostAfter ? 1 : 0
  state.boost = THREE.MathUtils.damp(state.boost, want, want ? BOOST.rise : BOOST.fall, dt)

  // S brakes when you're going forwards and reverses when you've stopped — one key, but
  // hauling a bike down from a hundred is not the same thing as backing it up.
  const braking = input.back && state.v > 0.5
  const accel = input.fwd ? input.fwd * (DRIVE.accel * tune.accel + BOOST.accel * tune.boostAccel * state.boost) : braking ? -DRIVE.brake * input.back : -11 * input.back
  state.v += accel * dt
  // Rolling friction, and it — not the clamp below — is what actually sets the top speed:
  // a bike settles where the throttle and the drag cancel, at accel/friction. That pair
  // used to work out at 41 km/h however high the ceiling was set, which is why the ceiling
  // looked broken. The clamp is now only a backstop above where the bike naturally sits.
  state.v *= Math.exp(-(offRoad.value ? 3.6 : DRIVE.drag) * dt)
  const top = DRIVE.top * tune.top + BOOST.top * tune.boostTop * state.boost
  // The grass caps you rather than braking you — and gently enough that clipping a verge
  // costs you the boost, not the whole lap.
  state.v = THREE.MathUtils.clamp(state.v, -8, offRoad.value ? 14 : top)

  const steerIn = input.right - input.left
  state.steer = THREE.MathUtils.damp(state.steer, steerIn, 7, dt)
  // turn rate grows with speed (a parked bike only turns its wheels); flips in reverse
  state.h += state.steer * Math.min(Math.abs(state.v) * 0.3, 1.5) * dt * (state.v < -0.5 ? -1 : 1)
  if (state.h > Math.PI) state.h -= Math.PI * 2; else if (state.h < -Math.PI) state.h += Math.PI * 2
  const fx = Math.sin(state.h), fz = -Math.cos(state.h) // heading forward vector

  state.x += fx * state.v * dt
  state.z += fz * state.v * dt

  // --- where am I on the lap, and how far off the middle of it ---
  // This replaces the pair of walls the straight road used. Past the tarmac is grass,
  // which drags rather than stops — being shoved by an invisible box felt like a bug,
  // and riding off onto the verge and back on is the sort of thing you do on a bike.
  // The hard limit is a long way out and only exists so nobody drives to the horizon.
  track.nearest(state.x, state.z, near)
  const off = Math.abs(near.side) > ROAD_HALF
  if (off !== offRoad.value) offRoad.value = off
  const OUTER = VERGE + 9
  if (near.dist > OUTER) {                       // shepherd back rather than snap
    const k = OUTER / near.dist
    state.x = near.x + (state.x - near.x) * k
    state.z = near.z + (state.z - near.z) * k
  }

  // --- ramps and air ---
  // The bike had no vertical axis at all. `y` is its height over the road, `vy` how fast
  // that's changing; a ramp is a stretch of the lap that lifts the ground under you, and
  // running off the end of one launches you at whatever rate you were climbing.
  const groundY = rampHeight(near.s, near.side)
  if (state.air > 0) {
    state.vy -= 30 * dt                          // heavier than gravity: arcade air, not a moon
    state.y += state.vy * dt
    if (state.y <= groundY) {                    // landed
      state.squash = Math.min(1, -state.vy * 0.09)
      state.y = groundY; state.vy = 0; state.air = 0
      state.v *= 0.94                            // a landing scrubs a little speed
    }
  } else if (groundY < state.y - 0.02) {
    // the ground went out from under you — off the lip, or off the side of the ramp.
    // One rule for both: at speed you launch, and creeping off the edge you just drop.
    // The speed term is small and capped on purpose: at 109 km/h an honest ballistic
    // arc would sail clean over the next sign, which is the one thing a jump must not do.
    state.air = 1
    state.vy = state.v > 5 ? Math.min(state.y * 3.2 + state.v * 0.15, 7.5) : 0
  } else {
    // Rising ground can only lift you so fast. Hit the lip of a ramp from the wrong side
    // and the height under you jumps a metre in one frame; without this the bike teleports
    // up the face of it instead of being stopped by it.
    state.y = Math.min(groundY, state.y + 12 * dt)
  }
  state.squash = THREE.MathUtils.damp(state.squash, 0, 7, dt)

  car.position.z = state.z
  car.position.x = state.x
  car.position.y = roadY + 0.02 + state.y - state.squash * 0.12
  // on the ground the nose dips under braking; in the air it follows the arc — up off
  // the ramp, down as it comes back — which is what sells a jump more than the height
  const pitchT = state.air ? THREE.MathUtils.clamp(-state.vy * 0.055, -0.34, 0.34)
    : THREE.MathUtils.clamp(accel * -0.006, -0.09, 0.09)
  car.rotation.x = THREE.MathUtils.damp(car.rotation.x, pitchT, state.air ? 9 : 6, dt)
  car.rotation.y = Math.PI - state.h - state.steer * 0.12
  // a bike banks into the turn — lean scales with steer and a bit with speed
  car.rotation.z = THREE.MathUtils.damp(car.rotation.z, state.steer * (0.22 + Math.min(Math.abs(state.v) * 0.02, 0.16)), 6, dt)
  frontWheels.forEach((w) => (w.rotation.y = state.steer * 0.45))
  wheels.forEach((w) => (w.rotation.x += (state.v * dt) / WHEEL_RADIUS))
  brakeLight.material.opacity = THREE.MathUtils.damp(brakeLight.material.opacity, input.back ? 0.95 : 0, 8, dt)
}

function tick() {
  raf = requestAnimationFrame(tick)
  if (paused || !car || document.hidden) return
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  if (rideMode.value === 'riding') updateBike(dt)
  else {
    brakeLight.material.opacity = 0
    if (onFoot.value) { if (entrance.phase === 'toDoor') walkToDoor(dt); else walkOnFoot(dt) }
  }
  updateActivity(performance.now())
  const actor = onFoot.value ? foot : state
  const actorNear = onFoot.value ? footNear : near
  const fx = Math.sin(actor.h), fz = -Math.cos(actor.h)
  canLeaveBike.value = mounted.value && Math.abs(state.v) <= 0.8 && !state.air && state.y <= 0.05
  if (riderMixer) {
    if (!onFoot.value) riderClips.walk.timeScale = 1
    riderClips.walk.setEffectiveWeight(riderMix.walk * (1 - riderMix.run))
    riderClips.run?.setEffectiveWeight(riderMix.walk * riderMix.run)
    riderClips.greet.setEffectiveWeight(riderMix.greet)
    riderClips.idle.setEffectiveWeight(Math.max(0, 1 - riderMix.walk - riderMix.greet))
    riderMixer.update(dt)
    applyRiderSit(riderPose.sit)
  }
  updateEngine()

  // camera — four angles, all following the car's heading (right vector = (-fz, 0, fx))
  // Framing: bike + rider stand ~1.7 m from the tarmac to the top of his head, so a
  // 5 m chase at 50° fov draws them around 360 px tall on the stage — the bike, not
  // the road, is the subject.
  // the lens opens with speed, but only up to a point — unclamped, a hundred km/h put
  // the chase camera at a 71 degree fisheye and the hood camera past 80
  const vFov = Math.min(Math.abs(actor.v), 18)
  let px, py, pz, lookX, lookY, lookZ, spd = 4.5, fovT = 50 + vFov * 0.7
  if (camMode.value === 0) {        // ¾ chase, behind and off the shoulder
    px = actor.x - fx * 4.5 - fz * 1.75; py = 2.25; pz = actor.z - fz * 4.5 + fx * 1.75
    lookX = actor.x + fx * 3; lookY = 1; lookZ = actor.z + fz * 3
  } else if (camMode.value === 1) { // overhead
    px = actor.x; py = 8.7; pz = actor.z + 2.1
    lookX = actor.x + fx * 1.4; lookY = 0; lookZ = actor.z + fz * 1.4; fovT = 50
  } else if (camMode.value === 2) { // hood / first person (over the handlebars)
    px = actor.x + fx * 0.55; py = 1.55; pz = actor.z + fz * 0.55
    lookX = actor.x + fx * 12; lookY = 1.0; lookZ = actor.z + fz * 12
    spd = 9; fovT = 58 + vFov * 0.8
  } else {                          // trackside cinematic
    px = actor.x - fz * 5 - fx * 0.9; py = 1.75; pz = actor.z + fx * 5 - fz * 0.9
    lookX = actor.x; lookY = 1; lookZ = actor.z; fovT = 46
  }
  // mouse orbit overrides the mode while engaged: spherical around the car,
  // measured from "behind the car" so releasing eases back to the chase view
  if (orbit.on || Math.abs(orbit.yaw) > 0.002 || Math.abs(orbit.pitch) > 0.002) {
    const r = 5, a = actor.h + Math.PI + orbit.yaw, el = 0.34 + orbit.pitch
    px = actor.x + Math.sin(a) * Math.cos(el) * r
    pz = actor.z - Math.cos(a) * Math.cos(el) * r
    py = 0.95 + Math.sin(el) * r
    lookX = actor.x; lookY = 1; lookZ = actor.z
    spd = 9; fovT = 50
  }
  if (onFoot.value) { py += foot.y; lookY += foot.y }
  camera.position.set(
    THREE.MathUtils.damp(camera.position.x, px, spd, dt),
    THREE.MathUtils.damp(camera.position.y, py, spd, dt),
    THREE.MathUtils.damp(camera.position.z, pz, spd + 0.5, dt)
  )
  camera.lookAt(lookX, lookY, lookZ)
  camera.fov = THREE.MathUtils.damp(camera.fov, fovT, 4, dt)
  camera.updateProjectionMatrix()

  // hide billboards once they pass close to the camera (a panel grazing the lens looks broken)
  camera.getWorldDirection(_camDir)
  stopGroups.forEach((g, i) => {
    _toStop.set(stops[i].signX, 3.3, stops[i].signZ).sub(camera.position)
    g.visible = _toStop.dot(_camDir) > (camMode.value === 0 ? 2.8 : 1.5)
  })

  // active place = the parking bay the car is inside
  let best = -1
  for (let i = 0; i < places.length; i++) {
    const s = places[i]
    // measured on the track rather than in the world: how far across the road you are,
    // and how far round the lap — which is the same test it always was, in the one
    // coordinate system that still means something now the road bends
    if (!actor.air && Math.abs(actorNear.side - s.bayX) < BAY_HALF_W && along(actorNear.s, s.s) < BAY_HALF_L) { best = i; break }
  }
  if (best !== activeIdx.value) {
    if (activeIdx.value >= 0) gsap.to(bayGlows[activeIdx.value].material, { opacity: 0, duration: 0.3 })
    if (best >= 0) {
      if (!visited.value[best]) { const v = visited.value.slice(); v[best] = true; visited.value = v }
      gsap.to(bayGlows[best].material, { opacity: 0.35, duration: 0.3 })
      reactTo(`${places[best].place.name}. ${places[best].place.blurb}`, null, { every: 3000, duration: 2.5 })
    }
    activeIdx.value = best
  }

  // stars: spin and bob where they stand, and vanish when ridden through. The distance
  // test is flat — height is ignored — so clearing a jump doesn't sail over the pickups.
  if (starMesh) {
    const t = timer.getElapsed()
    for (let i = 0; i < totalStars; i++) {
      if (starGone[i]) continue
      const x = starAt[i * 3], y = starAt[i * 3 + 1], z = starAt[i * 3 + 2]
      if ((actor.x - x) ** 2 + (actor.z - z) ** 2 < STAR.reach ** 2) {
        starGone[i] = 1
        gotStars.value++
        store.earn({ stars: 1 })
        _m4.makeScale(0, 0, 0).setPosition(x, y, z)
        starMesh.setMatrixAt(i, _m4)
        ping(gotStars.value)
        continue
      }
      _e3.set(0, t * 1.7 + i, 0.3)
      _m4.compose(_v3.set(x, y + Math.sin(t * 2 + i) * 0.11, z), _q4.setFromEuler(_e3), _s3)
      starMesh.setMatrixAt(i, _m4)
    }
    starMesh.instanceMatrix.needsUpdate = true
  }

  // the marker is written straight to the element: a ref set every frame would put Vue
  // through a full re-render sixty times a second for two numbers and an angle
  const kmh = Math.round(Math.abs(actor.v) * 3.6)
  if (kmh !== speed.value) speed.value = kmh
  const bst = !onFoot.value && state.boost > 0.45
  if (bst !== boosting.value) boosting.value = bst

  if (mapBike.value) {
    const [mx, my] = mapPath.map(actor.x, actor.z)
    mapBike.value.setAttribute('transform', `translate(${mx.toFixed(2)} ${my.toFixed(2)}) rotate(${(actor.h * 180 / Math.PI).toFixed(1)})`)
  }
  if (parkedMap.value && onFoot.value) {
    const [mx, my] = mapPath.map(state.x, state.z)
    parkedMap.value.setAttribute('transform', `translate(${mx.toFixed(2)} ${my.toFixed(2)})`)
  }

  if (markerPool.length || arrowMesh?.visible) updateMarkers(actor, timer.getElapsed())
  renderer.render(scene, camera)
}

// Real recordings (public/drive/audio): the bike start-up plays once on the first
// throttle, then a seamless engine loop is pitch-shifted by speed; the horn is a
// one-shot sample. Buffers are fetched lazily on the first user gesture.
const SOUNDS = { start: '/drive/audio/bike-start.mp3', loop: '/drive/audio/bike-loop.mp3', horn: '/drive/audio/horn.mp3' }
const buffers = {}
let started = false
async function loadSound(key) {
  if (buffers[key] !== undefined) return buffers[key]
  buffers[key] = null // in-flight marker — never fetch the same clip twice
  try {
    const res = await fetch(SOUNDS[key])
    buffers[key] = await audioCtx.decodeAudioData(await res.arrayBuffer())
  } catch { buffers[key] = null }
  return buffers[key]
}
function ensureEngine() {
  if (rideMode.value !== 'riding' || disposed) return
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    if (engine) return
    const gain = audioCtx.createGain(); gain.gain.value = 0
    // tone shaping: rolls the top off at low revs, opens up under throttle
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1400; filter.Q.value = 0.7
    filter.connect(gain); gain.connect(audioCtx.destination)
    engine = { gain, filter, src: null }
    // start-up sample once, then hand over to the loop
    loadSound('start').then((buf) => {
      if (!buf || !engine || disposed || rideMode.value !== 'riding') return
      const s = audioCtx.createBufferSource(); s.buffer = buf
      const g = audioCtx.createGain(); g.gain.value = muted.value ? 0 : 0.9
      s.connect(g); g.connect(audioCtx.destination); s.start()
      started = true
    })
    loadSound('loop').then((buf) => {
      if (!buf || !engine || disposed) return
      const s = audioCtx.createBufferSource()
      s.buffer = buf; s.loop = true
      s.connect(filter); s.start()
      engine.src = s
    })
  } catch { /* no audio available */ }
}
function updateEngine() {
  if (!engine || !audioCtx) return
  const t = audioCtx.currentTime, sp = Math.abs(state.v)
  const throttle = Math.max(input.fwd, input.back)
  const running = sp > 0.25 || throttle
  // playback rate = revs: the recorded loop sits at ~1.0, climbing with speed
  // Retuned for the higher top speed: the old coefficients were built around 11 m/s and
  // at three times that they pitched the loop into a chainsaw.
  if (engine.src) engine.src.playbackRate.setTargetAtTime(0.72 + sp * 0.028 + throttle * 0.1, t, 0.12)
  engine.filter.frequency.setTargetAtTime(900 + sp * 150 + throttle * 500, t, 0.16)
  // silent when parked; the start-up clip covers the first second or so
  const vol = muted.value || paused || document.hidden || rideMode.value !== 'riding' || !running ? 0 : (started ? 0.5 : 0.28) + Math.min(sp, 18) * 0.012
  engine.gain.gain.setTargetAtTime(vol, t, running ? 0.09 : 0.3)
}
function toggleMute() { muted.value = !muted.value }

// The pickup blip: two oscillators and an envelope, climbing a semitone per star so a
// run of them arpeggiates. Synthesised rather than sampled — it costs no download and
// no decoded buffer, which a fifty-millisecond ding does not deserve.
function ping(n) {
  if (muted.value || !audioCtx) return
  const t = audioCtx.currentTime
  const g = audioCtx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
  g.connect(audioCtx.destination)
  for (const [mul, type] of [[1, 'triangle'], [2, 'sine']]) {
    const o = audioCtx.createOscillator()
    o.type = type
    o.frequency.value = 660 * Math.pow(2, ((n - 1) % 8) / 12) * mul
    o.connect(g); o.start(t); o.stop(t + 0.24)
  }
}

// horn: the real recording, fired as a one-shot
function honk() {
  if (rideMode.value !== 'riding') return
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    loadSound('horn').then((buf) => {
      if (!buf || muted.value) return
      const g = audioCtx.createGain(); g.gain.value = tune.hornGain; g.connect(audioCtx.destination)
      for (let i = 0; i < tune.honks; i++) {
        const s = audioCtx.createBufferSource(); s.buffer = buf; s.playbackRate.value = tune.hornRate
        s.connect(g); s.start(audioCtx.currentTime + i * buf.duration * 0.7)
      }
    })
  } catch { /* no audio available */ }
  if (car) gsap.fromTo(car.scale, { y: 0.94 }, { y: 1, duration: 0.35, ease: 'elastic.out(1.4, 0.4)', overwrite: true })
  driven.value = true
}
function toggleLights(force = false) {
  if (lightsLocked.value && force !== true) return // a job has them (blackout)
  lightsOn.value = !lightsOn.value
  headlights.forEach((l) => (l.visible = lightsOn.value))
  lamps.forEach((m) => m.material.color.set(lightsOn.value ? '#fff3cf' : '#5a5548'))
}

// --- input ---
const inView = ref(false)
const movementKeys = { w: 'fwd', ArrowUp: 'fwd', s: 'back', ArrowDown: 'back', a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right' }
function onKey(e, down) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (down && k === 'Escape' && entrance.phase === 'inside') { e.preventDefault(); leavePlace(); return }
  if (sceneComponent.value) return // a scene has the screen; only Escape reaches the town
  if (down && k === 'Escape' && expanded.value && !document.fullscreenElement) { e.preventDefault(); toggleFullscreen(); return }
  const direction = movementKeys[k]
  if (!down) {
    if (direction) controls.button(`key:${k}`, direction, false)
    if (direction === 'fwd' && !input.fwd) foot.held = 0
    return
  }
  if (!gameInputActive.value || !inView.value || guide.tour.active || document.querySelector('.gallery') || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
  if (direction) {
    e.preventDefault()
    if (switchingRide.value) return
    if (entrance.phase === 'toDoor') cancelEntrance()
    skipMount(); controls.button(`key:${k}`, direction, true); driven.value = true
    if (!onFoot.value) ensureEngine()
  }
  else if (k === 'e' && !e.repeat) { e.preventDefault(); if (entrance.phase === 'toDoor') cancelEntrance(); else toggleRideMode() }
  // Enter is the one key for the bike and the places: go in when parked at one, otherwise get off or back on.
  else if (k === 'Enter' && !e.repeat && !e.target.closest?.('button, a')) {
    e.preventDefault()
    if (entrance.phase === 'toDoor') cancelEntrance()
    else if (!enterPlace()) toggleRideMode()
  }
  else if (k === 'h' && !e.repeat && !onFoot.value) honk()
  else if ((k === 'l' || k === 'L') && down && !e.repeat) toggleLights()
  else if ((k === 'm' || k === 'M') && down && !e.repeat) toggleMute()
  else if ((k === 'c' || k === 'C') && down && !e.repeat) cycleCam()
}
const keydown = (e) => onKey(e, true)
const keyup = (e) => onKey(e, false)
function moveJoystick(value) {
  if (!value.x && !value.y) { controls.joystick(value); return }
  if (switchingRide.value || guide.tour.active || !inView.value || sceneComponent.value) return
  if (entrance.phase === 'toDoor') cancelEntrance()
  gameInputActive.value = true
  skipMount(); controls.joystick(value); driven.value = true
  if (!onFoot.value) ensureEngine()
}
function releaseControls() {
  clearInput(); updateEngine()
  if (entrance.phase === 'toDoor') cancelEntrance()
  if (!fullscreenChanging) activity?.interrupt(activityCtx)
}
function onVisibility() { if (document.hidden) releaseControls() }
watch(() => guide.tour.active, on => { if (on) releaseControls() })

// drag-to-orbit (mouse only — touch keeps scrolling the page)
function onStageDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button, a, .drive__ctl')) return
  drag = { x: e.clientX, y: e.clientY, moved: false }
}
function onWinMove(e) {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 6) return
  drag.moved = true
  orbitHome?.kill()
  orbit.on = true
  orbit.yaw -= dx * 0.006
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.004, -0.22, 0.85)
  drag.x = e.clientX; drag.y = e.clientY
  driven.value = true
}
function onWinUp() {
  if (!drag) return
  suppressClick = drag.moved
  if (drag.moved) returnOrbit()
  drag = null
}

function onCanvasClick(e) {
  if (!renderer) return
  if (suppressClick) { suppressClick = false; return } // that was an orbit drag, not a click
}

function resize() {
  if (!renderer || !host.value) return
  const w = host.value.clientWidth, h = host.value.clientHeight
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(async () => {
  try {
    await init()
  } catch (e) {
    console.warn('[ProjectDrive] falling back to the grid:', e.message)
    failed.value = true
    emit('error', e)
    return
  }
  ro = new ResizeObserver(resize); ro.observe(host.value)
  // entries batch on re-layout — always act on the LATEST one, or a stale
  // "not intersecting" first entry leaves the scene paused while visible
  io = new IntersectionObserver((entries) => {
    const en = entries[entries.length - 1]
    paused = !en.isIntersecting && !expanded.value; inView.value = expanded.value || en.intersectionRatio > 0.55
    if (!inView.value) releaseControls()
    // An idle drawing buffer still costs its full size in GPU memory — at devicePixelRatio
    // 2 with antialiasing that's on the order of a hundred MB sitting behind a section
    // nobody is looking at. Hand it back while we're off screen and take it again on the
    // way in; the observer fires on the first pixel, well before anything renders.
    if (paused) renderer.setSize(1, 1, false)
    else resize()
    if (inView.value) playMount()
    else if (mountTl) skipMount() // scrolled away mid-arrival — don't replay it later
  }, { threshold: [0, 0.55] })
  io.observe(host.value)
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', releaseControls)
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  host.value.addEventListener('pointerdown', onStageDown)
  window.addEventListener('pointermove', onWinMove)
  window.addEventListener('pointerup', onWinUp)
  emit('ready')
})
onBeforeUnmount(() => {
  disposed = true
  mountTl?.kill(); mountTl = null
  changeRideTl?.kill(); orbitHome?.kill()
  cancelAnimationFrame(raf)
  ro?.disconnect(); io?.disconnect()
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('keyup', keyup)
  window.removeEventListener('blur', releaseControls)
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  stopOutsideScrollRecovery?.(); stopOutsideScrollRecovery = null
  if (document.fullscreenElement === gameRoot.value) document.exitFullscreen().catch(() => {})
  restoreGameLayout()
  window.removeEventListener('pointermove', onWinMove)
  window.removeEventListener('pointerup', onWinUp)
  renderer?.dispose()
  finishLine?.geometry.dispose(); finishLine?.material.map.dispose(); finishLine?.material.dispose()
  engine?.src?.stop(); audioCtx?.close(); engine = null
})
</script>

<template>
  <div v-if="expanded" :style="{ height: `${gameSpace}px` }" aria-hidden="true" />
  <Teleport to="body" :disabled="!expanded">
  <div v-if="!failed" ref="gameRoot" class="drive" :class="{ 'is-expanded': expanded }" :data-mode="rideMode" @pointerdown="gameInputActive = true" @focusin="gameInputActive = true">
    <div ref="host" class="drive__stage" :data-cursor="onFoot ? 'walk' : 'drive'" @click="onCanvasClick">
      <div v-show="mounted" class="drive__hint" :class="{ 'is-dim': driven }">
        <span class="drive__hint-keys"><span><b>W/S</b> {{ onFoot ? 'walk' : 'drive' }}</span><span><b>A/D</b> {{ onFoot ? 'turn' : 'steer' }}</span><span><b>↵</b> {{ onFoot ? 'ride nearby bike' : 'get off, or go in at a P spot' }}</span><span><b>C</b> camera</span><span>hold <b>W/↑</b> to {{ onFoot ? 'run' : 'boost' }}</span><span><b>drag</b> look</span></span>
        <span class="drive__hint-touch"><span><b>Joystick</b> {{ onFoot ? 'walk & turn' : 'drive & steer' }}</span><span>pull back to {{ onFoot ? 'step back' : 'brake' }}</span><span>hold fully up to {{ onFoot ? 'run' : 'boost' }}</span><span><b>🎥</b> view</span></span>
      </div>
      <!-- the lap, the places on it, and where the bike is -->
      <svg v-show="mounted" class="drive__map" viewBox="0 0 100 100" aria-hidden="true">
        <path :d="mapPath.d" class="drive__map-road" />
        <circle v-for="(m, i) in mapStops" :key="i" :cx="m.x" :cy="m.y" r="2.6"
                class="drive__map-stop" :class="{ 'is-seen': visited[i], 'is-on': i === activeIdx }" />
        <template v-for="(m, i) in markerDots" :key="'job' + i">
          <circle v-if="!m.hidden" :cx="m.x" :cy="m.y" r="2.2" class="drive__map-job" :class="{ 'is-done': m.done }" />
        </template>
        <g ref="mapBike" class="drive__map-bike"><path d="M0 -4 L3 3.4 L0 1.6 L-3 3.4 Z" /></g>
        <g v-show="onFoot" ref="parkedMap" class="drive__map-parked"><circle r="3.5" /><title>Parked bike</title></g>
      </svg>

      <div v-show="mounted" class="drive__read">
        <span class="drive__read-speed" :class="{ 'is-boost': boosting, 'is-off': !onFoot && offRoad }"><b>{{ speed }}</b>{{ onFoot ? 'on foot' : offRoad ? 'off road' : 'km/h' }}</span>
        <span v-if="totalStars" class="drive__read-stars">★ {{ gotStars }}<i>/{{ totalStars }}</i></span>
        <span class="drive__read-cash">$<b>{{ store.save.cash }}</b></span>
      </div>
      <div class="drive__rush" :class="{ 'is-on': boosting }" aria-hidden="true" />

      <div v-if="guide.say.text" :key="guide.say.key" class="drive__say" role="status">{{ guide.say.text }}</div>
      <div v-if="sceneComponent" class="drive__scene" @click.stop>
        <component :is="sceneComponent" :store="store" @leave="leavePlace" />
      </div>
      <div v-show="!sceneComponent" class="drive__ctl" @click.stop>
        <div class="drive__aux">
          <button aria-label="Toggle lights" class="drive__emoji" :class="{ 'is-on': lightsOn }" :disabled="lightsLocked" @pointerdown.prevent="toggleLights()">💡</button>
          <button aria-label="Honk" class="drive__emoji" :disabled="rideMode !== 'riding'" @pointerdown.prevent="honk">📯</button>
          <button aria-label="Camera view" class="drive__emoji" @pointerdown.prevent="cycleCam">🎥</button>
        </div>
        <DriveJoystick class="drive__joystick" :disabled="switchingRide || guide.tour.active || !inView" :reset-key="controlsReset" :on-foot="onFoot" @move="moveJoystick" />
      </div>
    </div>
    <div v-if="phase === 'inside' && activityView" class="drive__race">
      <div class="drive__lap-stats">
        <span v-for="st in activityView.stats" :key="st.label">{{ st.label }} <b :role="st.live ? 'timer' : undefined" aria-live="off">{{ st.value }}</b></span>
      </div>
      <div class="drive__race-actions">
        <button class="drive__leave" @click="leavePlace"><kbd>Esc</kbd> Leave</button>
      </div>
      <p class="drive__lap-status" role="status">{{ activityView.status }}</p>
    </div>
    <div v-if="riderReady && mounted" class="drive__mode-bar">
      <span role="status">{{ phase === 'toDoor' ? 'Walking to the door. Any key stops.' : phase === 'inside' ? `Inside: ${placeTitle}. Esc to leave.` : onFoot ? 'On foot · hold forward to run. Gold map marker = your bike.' : switchingRide ? 'Switching…' : 'Riding · park in a P spot to go in.' }}</span>
      <button :disabled="interactionDisabled" :aria-label="interactionLabel" @click="toggleRideMode"><kbd>↵</kbd> {{ interactionLabel }}</button>
    </div>
    <Transition name="fade" mode="out-in">
      <component :is="canGoIn ? 'button' : 'div'" v-if="active" :key="active.id" class="drive__hud" :class="{ 'is-open': canGoIn }" @click="canGoIn && enterPlace()">
        <span class="drive__hud-name">{{ active.emoji }} {{ active.name }}</span>
        <span class="drive__hud-desc">{{ active.blurb }}</span>
        <span class="drive__hud-meta">{{ doorLine }}<em v-if="enterLine">{{ enterLine }}</em></span>
      </component>
      <p v-else-if="phase === 'inside'" class="drive__hud drive__hud--idle">Inside <b>{{ placeTitle }}</b>. Press <b>Esc</b> or Leave to walk out.</p>
      <p v-else class="drive__hud drive__hud--idle">{{ places.length }} places around this lap. Pull into a <b>P</b> spot and press <b>Enter</b> to go in.</p>
    </Transition>
  </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.drive {
  margin-top: 1.2rem;
  &.is-expanded {
    position: fixed; inset: 0; z-index: 2000; box-sizing: border-box;
    width: 100%; height: 100dvh; margin: 0; padding: max(.5rem, env(safe-area-inset-top)) max(.5rem, env(safe-area-inset-right)) max(.5rem, env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left));
    display: flex; flex-direction: column; background: $ink; overflow: auto;
    .drive__stage { flex: 1 0 160px; height: auto; min-height: 160px; }
    .drive__hud { flex-shrink: 0; margin-top: .25rem; }
    .drive__mode-bar { padding: .25rem 0; }
    @media (max-height: 500px) {
      .drive__hud, .drive__hint, .drive__mode-bar > span { display: none; }
      .drive__mode-bar { justify-content: flex-end; }
    }
  }
  &__race { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .4rem .7rem; padding-top: .7rem; }
  &__lap-stats { display: flex; flex-wrap: wrap; gap: .35rem 1rem; font-size: .72rem; color: $muted; }
  &__lap-stats b { color: $paper; font-variant-numeric: tabular-nums; margin-left: .25rem; }
  &__lap-status { flex-basis: 100%; margin: 0; font-size: .72rem; color: $muted; }
  &__race-actions { display: flex; align-items: center; gap: .6rem; margin-left: auto; }
  &__leave {
    flex-shrink: 0; min-height: 34px; padding: .35rem .7rem; font-size: .75rem;
    border: 1px solid rgba(255,208,75,.25); border-radius: 9px; background: rgba(255,208,75,.07); color: $accent; cursor: pointer;
    transition: background .2s, border-color .2s;
    &:hover { background: rgba(255,208,75,.16); border-color: $accent; }
    &:focus-visible { outline: 2px solid $accent; outline-offset: 3px; }
    kbd { margin-right: .35rem; padding: .1rem .3rem; border: 1px solid currentColor; border-radius: 3px; font: inherit; }
    @media (pointer: coarse) { min-height: 44px; kbd { display: none; } }
  }
  &__mode-bar {
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .7rem;
    padding: .75rem 0; color: $muted; font-size: .8rem;
    button { min-height: 44px; padding: .6rem .9rem; border-radius: 9px; background: $accent; color: $ink; cursor: pointer; border: 0; }
    button:disabled { opacity: .5; cursor: default; }
    kbd { margin-right: .4rem; padding: .1rem .3rem; border: 1px solid currentColor; border-radius: 3px; }
    @media (pointer: coarse) { kbd { display: none; } }
  }
  &__stage {
    position: relative; height: 62vh; min-height: 380px; border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .09); background: #0b111b;
    :deep(canvas) { display: block; width: 100% !important; height: 100% !important; }
  }
  // The lap, drawn from the same samples the physics uses — so it cannot disagree with
  // the road, which a hand-drawn map eventually would.
  &__map {
    position: absolute; top: .9rem; left: .9rem; width: 106px; height: 106px; z-index: 2;
    pointer-events: none; overflow: visible;
    @media (max-width: 600px) { width: 74px; height: 74px; top: .6rem; left: .6rem; }
    &-road { fill: none; stroke: rgba(255, 255, 255, .3); stroke-width: 4.5; stroke-linejoin: round; }
    &-stop {
      fill: rgba(255, 255, 255, .28); transition: fill .3s, r .3s;
      &.is-seen { fill: rgba(255, 208, 75, .75); }        // one you've already pulled into
      &.is-on { fill: $accent; r: 3.6; }
    }
    &-job { fill: $accent-2; stroke: $ink; stroke-width: .8; &.is-done { fill: rgba(255,255,255,.25); } }
    &-bike path { fill: #fff; stroke: rgba(0, 0, 0, .55); stroke-width: .8; }
    &-parked circle { fill: $accent; stroke: $ink; stroke-width: 1; }
  }
  // speed and the star tally, out of the way of the sign and the controls
  &__read {
    position: absolute; left: .9rem; bottom: .9rem; z-index: 2; display: flex; gap: .55rem;
    pointer-events: none; font-size: .68rem; letter-spacing: .12em; text-transform: uppercase;
    @media (max-width: 600px) { left: .6rem; bottom: .6rem; font-size: .6rem; }
    span {
      padding: .3rem .55rem; border-radius: 999px; color: rgba(255,255,255,.72);
      background: rgba(8, 10, 16, .68); border: 1px solid rgba(255,255,255,.12);
    }
    b { color: #fff; font-size: 1.15em; font-weight: 600; margin-right: .15em; }
    i { font-style: normal; opacity: .5; }
    &-speed {
      transition: color .25s, border-color .25s;
      &.is-boost { color: $accent; border-color: rgba(255, 208, 75, .5); }
      // the grass caps your speed, so it has to say that rather than let it read as a bug
      &.is-off { color: #ff9b6a; border-color: rgba(255, 155, 106, .45); }
    }
    &-stars { color: rgba(255, 208, 75, .85) !important; }
    &-cash { color: rgba(18, 212, 219, .9) !important; b { color: inherit; margin-left: .1em; } }
  }
  // the edges close in when the top gear engages — the whole of the boost's visual cost
  &__say {
    position: absolute; left: 50%; bottom: 3.4rem; transform: translateX(-50%); z-index: 3; max-width: min(70%, 520px);
    padding: .5rem .9rem; border-radius: 12px; background: rgba(8, 10, 16, .78); border: 1px solid rgba(255,208,75,.35);
    color: $paper; font-family: $font-display; font-style: italic; font-size: .95rem; text-align: center; pointer-events: none;
    animation: say-in .25s $ease-out;
    @media (max-width: 600px) { bottom: 5.2rem; font-size: .85rem; max-width: 86%; }
  }
  @keyframes say-in { from { opacity: 0; transform: translate(-50%, 6px); } }
  &__scene {
    position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; padding: 1rem;
    background: rgba(6, 9, 14, .5); overflow: auto;
  }
  &__rush {
    position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0;
    transition: opacity .45s ease;
    background: radial-gradient(ellipse 62% 58% at 50% 52%, transparent 42%, rgba(6, 9, 14, .62) 100%);
    &.is-on { opacity: 1; }
  }
  &__hint {
    position: absolute; top: 1rem; left: 50%; transform: translateX(-50%); max-width: calc(100% - 2rem);
    padding: .55rem 1rem; border-radius: 999px; background: rgba(8, 10, 16, .72); border: 1px solid rgba(255,255,255,.14);
    font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.8); pointer-events: none;
    transition: opacity .5s; white-space: nowrap;
    &.is-dim { opacity: .55; }
    b { color: $accent; font-weight: 600; }
    &-keys, &-touch { display: flex; gap: .9rem; }
    &-touch { display: none; }
    // On a phone the touch hints are four items on one line inside a pill that can only
    // be as wide as the stage — around 368px of content against 328px of room on a 360px
    // screen, and `nowrap` clips rather than shrinks. Let it wrap instead.
    @media (pointer: coarse) {
      &-keys { display: none; }
      &-touch { display: flex; flex-wrap: wrap; justify-content: center; gap: .3rem .8rem; }
      width: calc(100% - 2rem); border-radius: 14px;
      font-size: .62rem; white-space: normal; text-align: center;
    }
  }
  &__ctl {
    position: absolute; right: 1rem; bottom: 1rem; z-index: 3; display: flex; align-items: flex-end; gap: .7rem;
    button {
      width: 50px; height: 50px; border-radius: 50%; font-size: 1.05rem; color: #fff; cursor: pointer;
      display: grid; place-items: center; line-height: 1;
      background: rgba(8,10,16,.72); border: 1px solid rgba(255,255,255,.2); touch-action: none; user-select: none;
      &:active, &.is-on { background: $accent; color: $ink; }
      &:disabled { opacity: .4; cursor: default; }
    }
    // Keep the controls quiet until the desktop scene is hovered.
    @media (hover: hover) and (pointer: fine) {
      opacity: .45; transition: opacity .3s;
      button { width: 38px; height: 38px; font-size: .85rem;
        &:hover { border-color: rgba(255, 208, 75, .6); } }
      .drive__emoji { font-size: .85rem; }
    }
  }
  &__aux { display: flex; flex-direction: column; gap: .5rem; }
  &__stage:hover .drive__ctl { opacity: 1; }
  &__hud {
    display: grid; gap: .3rem; width: 100%; text-align: left; margin-top: .9rem; padding: 1rem 1.2rem;
    background: #111721; border: 1px solid rgba(255,255,255,.09); border-radius: 14px; color: $paper;
    transition: border-color .25s;
    &.is-open { cursor: pointer; border-color: rgba(255, 208, 75, .35); &:hover { border-color: $accent; } }
    &-name { font-weight: 600; font-size: 1.05rem; }
    &-desc { font-family: $font-display; font-style: italic; color: $paper; font-size: .95rem; }
    &-meta { display: flex; align-items: center; gap: .45rem; font-size: .75rem; color: $muted;
      em { margin-left: auto; font-style: normal; color: $accent; letter-spacing: .12em; text-transform: uppercase; font-size: .68rem; } }
    &--idle { display: block; color: $muted; font-size: .85rem; cursor: default; text-align: center; b { color: $accent; } }
  }
  .fade-enter-active, .fade-leave-active { transition: opacity .25s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
}
</style>
