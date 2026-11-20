// The puppet3d workshop (`/puppet3d?game=<game>&kind=<kind>` of the workshop's server): where a game's
// animals are made to move. Pick an animal, set it standing or going at one of its paces, pick one of its
// motions (its walk, a roar, a wag, a graze), and shape it on the animal itself: each body part the motion
// moves is a dot, and the part picked has three rings, one for each way it turns (up and down, side to
// side, roll), dragged round to turn it there, and three rows of numbers, where it is held and how far
// and how often it sways, in degrees and seconds. When the motion plays in the game is said and set in
// the same words: all the time, every so many seconds for so long, while standing, while moving. Save
// writes it all into the game's files; Revert reads them again.
//
// Under the words: a kind is one a scene of the game lists in `world.puppet3d.kinds`
// (`/api/puppet3d/<game>`), its definition read from that scene's definitions file. Its motions are its
// layouts' drivers; a motion's parts are the bones its cue sheet names, and its timing its `weight`. A
// part's angle held is the angle's cue of one key, its sway its swung cue, in the cue sheet the driver
// plays (`<name>.cues.json`); an angle shaped by many keys (a walk written from a clip) keeps them, and
// what is held here is laid on top. A solver motion (the walk the `pureQuadrupedDriver` stands) carries
// its numbers, its block of the body's sheet, under its parts. The body is a row the page moves itself
// over flat ground, one step of the scene's `dt` at a time, at the speed of the pace picked, as the game's
// paddock moves it (a pace of the sheet's `gait.paces`, or of the definition's `speeds`, its `stride`
// going round once every `stride` metres), stood, stepped, sensed and posed by the plugin's own `stand`,
// `stepped`, `sensed` and `stood`, and skinned by its `skinned`: what the game draws for the same row.
// The motion picked is shown at full weight unless "as in the game" is ticked.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  cued, posed, sensed, sheetsOf, skinned, solvers, stand, stepped, stood,
  type Behaviors, type Bone, type BoneCues, type Cue, type Def, type Driver, type Ridden, type Skeleton, type Skinned, type Solved, type Solver, type Standing, type Turn,
} from '../../plugins/puppet3d/puppet3d.plugin.ts'

type Scene = { name: string; file: string; kinds: string[]; defs: string; defsUrl: string; assets: Record<string, { url: string }>; sheets: Record<string, string>; behaviors: string[]; dt: number }
type Axis = 'bend' | 'swing' | 'twist'
type Path = (string | number)[]
type Keyed = Extract<Cue, { keys: number[][] }>
type Swung = Extract<Cue, { swing: number }>
const AXES: Axis[] = ['bend', 'swing', 'twist']
const SAID: Record<Axis, string> = { bend: 'Up and down', swing: 'Side to side', twist: 'Roll' }
const COLOUR: Record<Axis, string> = { bend: '#e0573a', swing: '#5bbf7a', twist: '#4fc3ff' }
// The row's fields a sense may read, by its source, as the plugin reads them.
const FIELDS: Record<string, string> = { rowSpeed: 'speed', rowStride: 'stride', rowFlight: 'flight', rowJump: 'jump', rowUpright: 'upright' }
const deg = (r: number) => r * 180 / Math.PI
const rad = (d: number) => Math.round(d * Math.PI / 180 * 1e5) / 1e5
const round = (v: number, n = 3) => Math.round(v * 10 ** n) / 10 ** n

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const view = $('#view')
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `${url}: ${r.status}`)
  return j
}
function fail(e: unknown) {
  console.error(e)
  const box = $('#error')
  box.textContent = String((e as Error)?.message ?? e)
  box.style.display = 'block'
}
const clearFail = () => { $('#error').style.display = 'none' }
function say(text: string, how: '' | 'ok' | 'bad' | 'dirty' = '') {
  const s = $('#state')
  s.textContent = text
  s.className = how
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}
// A number field: shown rounded, its value handed on when it is a finite number.
function field(value: number, step: number, put: (v: number) => void, title = ''): HTMLInputElement {
  const input = el('input', { type: 'number', step: String(step), value: String(round(value, step < 1 ? 2 : 0)), title })
  input.onfocus = () => input.select()
  input.onchange = () => {
    const v = Number(input.value)
    if (input.value.trim() === '' || !Number.isFinite(v)) { input.value = String(round(value, 2)); return }
    put(v)
  }
  return input
}

// ---------------------------------------------------------------- the stage

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(devicePixelRatio)
renderer.toneMapping = THREE.NeutralToneMapping
view.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1b1d21')
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
const sun = new THREE.DirectionalLight('#ffffff', 1.8)
sun.position.set(3, 6, 2)
scene.add(sun, new THREE.HemisphereLight('#cfd8ff', '#3a3228', 0.7))
// The ground: a grid kept under the body, moved a whole cell at a time so its lines stand still.
const grid = new THREE.GridHelper(40, 160, '#3d4048', '#2a2c31')
scene.add(grid)
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 300)
const orbit = new OrbitControls(camera, renderer.domElement)

function resize() {
  const { clientWidth: w, clientHeight: h } = view
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

// The camera looks at the body from a side, the front, the back or above, as far off as the body is big.
let middle = new THREE.Vector3(0, 1, 0), reach = 3
const VIEWS: Record<string, [number, number, number]> = { side: [1, 0.25, 0], front: [0, 0.25, 1], back: [0, 0.25, -1], above: [0.001, 1, 0] }
function look(name: string) {
  const d = VIEWS[name], c = new THREE.Vector3(row.pos[0], 0, row.pos[2]).add(middle)
  const turned = new THREE.Vector3(d[0], d[1], d[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), row.yaw)
  orbit.target.copy(c)
  camera.position.copy(c).addScaledVector(turned, reach)
  orbit.update()
}
for (const name of Object.keys(VIEWS)) $('#views').append(el('button', { textContent: name, onclick: () => look(name) }))

// ---------------------------------------------------------------- the row

// The row the page moves: where it is, which way it faces, how fast it goes, and its fields.
const row: Ridden & { data: Record<string, number> } = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], data: {} }
let speed = 0, turning = 0, clock = 0, playing = true, owed = 0, span = 10
const flat = () => 0

// ---------------------------------------------------------------- the animal

const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
let game = ''
let scenes: Scene[] = []
let library: Record<string, string[]> = {} // the library's cue sheets, by name, each the bones it names
let place: Scene | undefined // the scene the kind is read from
let table: Record<string, Solver> = {}
// Each file as it stands here, edits and all, and as it was read: the definitions file and each sheet.
let files: Record<string, any> = {}
let saved: Record<string, any> = {}
let kind = ''
let d0: Def
let drivers: Solved[] = []
let blocks: Record<string, unknown> = {}
let body: Standing | undefined
let rests: Skeleton[] = []
let layouts: { name: string; skin: Skinned; dots: THREE.Mesh[] }[] = []
let senses: Record<string, number> = {}
let bones: Record<string, Bone[]> = {} // each layout's bones as last posed, in the world
const off = new Set<string>() // motions left out, `<layout>:<index>`
let asGame = false // the motion picked played by its own timing, not held at full

const defs = () => files[place!.defs] as Record<string, Def & Record<string, any>>
const def = () => defs()[kind]
const url = (entry: string) => {
  const a = place!.assets[entry]
  if (!a) throw new Error(`${kind}: ${place!.name}'s catalogue has no entry ${entry}`)
  return a.url
}
const sheet = (gait: string) => {
  const f = place!.sheets[gait]
  if (!f) throw new Error(`${kind} moves by the sheet ${gait}, which the server found no file for`)
  return files[f] as Record<string, any>
}
const cueFile = (x: Driver) => place!.sheets[x.cues]
const sheetOf = (x: Driver) => files[cueFile(x)] as BoneCues
const cueSheets = () => Object.fromEntries(sheetsOf(d0).map(e => [e, files[place!.sheets[e]] as BoneCues]))
const restOf = (layout: string) => rests[Object.keys(d0.layouts).indexOf(layout)]
// The parts a motion moves: a solver's, every bone it stands and every bone its sheet names; a sheet's,
// the bones it names that the layout has.
const partsOf = (layout: string, x: Driver) => {
  const all = restOf(layout)?.bones.map(b => b.name) ?? []
  return new Set(all.filter(n => n in sheetOf(x)))
}
// The part a bone is listed under: a bone whose name starts with the part its parent is listed under (a
// Mixamo hand's `LeftHandThumb1` and `LeftHandThumb2` under `LeftHand`, `Spine2` under `Spine`) is a finer
// part of it, shown only when that part is picked; any other bone is a part of its own. Worked out once
// a layout, when its animal is opened, parents before their children.
let tops: Record<string, Map<string, string>> = {}
function topOf(layout: string, name: string): string {
  let map = tops[layout]
  if (!map) {
    map = tops[layout] = new Map()
    for (const b of restOf(layout)?.bones ?? []) {
      const up = b.parent === null ? undefined : map.get(b.parent)
      map.set(b.name, up !== undefined && b.name.startsWith(up) ? up : b.name)
    }
  }
  return map.get(name) ?? name
}
// The sense read off the clock, and the one read off the row's speed; the senses a row's field gives.
const senseBy = (source: string) => Object.keys(d0.senses).find(s => d0.senses[s] === source)
const clockSense = () => senseBy('clock') ?? Object.keys(d0.senses)[0]

function clear() {
  for (const d of layouts) {
    for (const j of d.skin.joints) scene.remove(j)
    for (const o of d.dots) scene.remove(o)
    scene.remove(d.skin.body)
    d.skin.geometry.dispose()
  }
  layouts = []
  body = undefined
  bones = {}
}

// The scene's files read: its definitions file, and each sheet its drivers read.
async function readFiles() {
  const all = [[place!.defs, place!.defsUrl], ...Object.entries(place!.sheets).map(([e, f]) => [f, url(e)])]
  saved = Object.fromEntries(await Promise.all(all.map(async ([f, u]) => [f, await api(u)])))
  files = structuredClone(saved)
}

// The solvers the scene's mods deliver, laid over each other in its order.
async function readTable() {
  const mods = await Promise.all(place!.behaviors.map(u => import(u) as Promise<{ behaviors: Behaviors }>))
  table = Object.assign({}, ...mods.map(m => m.behaviors()))
}

const dotGeo = new THREE.SphereGeometry(1, 12, 10)
const dotMoves = new THREE.MeshBasicMaterial({ color: '#e0a33a', depthTest: false, transparent: true, opacity: 0.85 })
const dotStill = new THREE.MeshBasicMaterial({ color: '#8a8f98', depthTest: false, transparent: true, opacity: 0.35 })
const dotOn = new THREE.MeshBasicMaterial({ color: '#4fc3ff', depthTest: false })
let size = 1 // how big the animal is, for its dots and rings

async function loadKind(k: string) {
  clearFail()
  clear()
  kind = k
  off.clear()
  pick = undefined
  part = undefined
  d0 = def()
  if (!d0) throw new Error(`${place!.defs} has no definition of ${k}`)
  say(`loading ${k}…`)
  const sks: Skeleton[] = []
  for (const [name, L] of Object.entries(d0.layouts)) {
    const sk = { ...await api<Skeleton>(url(L.skeleton)), entry: L.skeleton }
    const glb = await gltf.loadAsync(url(L.skin))
    const skin = skinned(THREE, scene, glb.scene, sk, L.skin)
    const dots = sk.bones.map(b => {
      const o = new THREE.Mesh(dotGeo, dotStill)
      o.userData = { layout: name, bone: b.name }
      o.renderOrder = 10
      scene.add(o)
      return o
    })
    sks.push(sk)
    layouts.push({ name, skin, dots })
  }
  ;({ drivers, blocks } = solvers(d0, table, sheet))
  rests = sks
  tops = {}
  pace = 0
  speed = 0
  row.data = {}
  for (const source of Object.values(d0.senses)) if (FIELDS[source]) row.data[FIELDS[source]] = 0
  standAgain()
  draw()
  const box = new THREE.Box3()
  for (const x of layouts) for (const j of x.skin.joints) box.expandByPoint(j.getWorldPosition(new THREE.Vector3()))
  size = Math.max(0.3, box.getSize(new THREE.Vector3()).length())
  middle = box.getCenter(new THREE.Vector3()).sub(new THREE.Vector3(row.pos[0], 0, row.pos[2]))
  reach = Math.max(2, size * 1.4)
  look('side')
  spanOf()
  animals()
  doing()
  // Opened on its first motion that is not a solver, else its first.
  const first = Object.keys(d0.layouts)[0], list = d0.layouts[first].drivers
  const i = list.findIndex(x => !('solver' in x))
  choose(first, i < 0 ? 0 : i)
  say('')
  status()
}

// The body stood again where the row is: every solver's body made anew from its block as it is now.
function standAgain() {
  for (const { x } of drivers) if (x.leap) { row.data[x.leap.count] ??= 0; row.data[x.leap.height] ??= 1 }
  try {
    body = stand(kind, d0, table, blocks, rests, row, flat, row.data)
    clearFail()
  } catch (e) { body = undefined; fail(e) }
}

// The clock's span on the bar under the view: the longest period any cue of the kind reads the clock
// round, ten seconds at least.
function spanOf() {
  const c = clockSense()
  let hi = 10
  for (const L of Object.values(def().layouts)) for (const x of L.drivers) {
    for (const q of x.weight) if (q.by === c && q.period) hi = Math.max(hi, q.period)
    for (const t of Object.values(sheetOf(x))) for (const a of AXES) for (const q of t[a]) if (q.by === c && q.period) hi = Math.max(hi, q.period)
  }
  span = hi
  $<HTMLInputElement>('#time').max = String(span)
}

// ---------------------------------------------------------------- what it's doing

// The paces the game goes at: a sheet's `gait.paces` on its feet or upright (`sheet`, `paces`), or a
// definition's `speeds`; standing first.
let pace = 0
function paces(): { name: string; speed: number }[] {
  const d = def(), out = [{ name: 'stand', speed: 0 }]
  if (d.sheet && d.paces) {
    const up = row.data.upright ? 1 : 0
    const list = sheet(d.sheet)[d.paces[up]]?.gait?.paces as { name: string; speed: number }[] | undefined
    if (list) out.push(...list.map(p => ({ name: p.name, speed: p.speed })))
  } else if (Array.isArray(d.speeds)) {
    for (const v of d.speeds as number[]) if (v > 0) out.push({ name: '', speed: v })
  }
  return out
}

function doing() {
  const box = $('#doing')
  box.innerHTML = ''
  const list = paces()
  if (pace >= list.length) pace = list.length - 1
  const buttons = el('div', { className: 'parts' })
  list.forEach((p, i) => buttons.append(el('button', {
    className: i === pace ? 'on' : '',
    textContent: p.speed ? `${p.name ? `${p.name} ` : ''}${round(p.speed, 2)} m/s` : 'stand still',
    onclick: () => { pace = i; speed = p.speed; doing() },
  })))
  box.append(buttons)
  box.append(el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'turning' }),
    field(deg(turning), 5, v => { turning = rad(v) }, 'degrees a second; 0 goes straight'), el('span', { className: 'unit', textContent: '° a second' })))
  const up = senseBy('rowUpright')
  if (up !== undefined) {
    const t = el('input', { type: 'checkbox', checked: !!row.data.upright })
    t.onchange = () => { row.data.upright = t.checked ? 1 : 0; const p = paces(); speed = p[Math.min(pace, p.length - 1)].speed; doing() }
    box.append(el('label', { className: 'line' }, t, 'on its hind legs'))
  }
  const leaper = drivers.find(d => d.x.leap)
  if (leaper) {
    const L = leaper.x.leap!
    box.append(el('div', { className: 'line' },
      el('button', { textContent: 'Leap', onclick: () => { row.data[L.count]++ } }), el('span', { className: 'unit', textContent: 'to' }),
      field(row.data[L.height], 0.1, v => { if (v > 0) row.data[L.height] = v }), el('span', { className: 'unit', textContent: 'm' })))
  }
  box.append(el('div', { className: 'line' }, el('button', { textContent: 'Back to the start', onclick: () => { row.pos = [0, 0, 0]; row.yaw = 0; row.vel = [0, 0, 0]; standAgain(); draw(); look('side') } })))
}

// ---------------------------------------------------------------- when a motion plays

// A motion's timing, its `weight`, in words and back: all the time; never; every so many seconds of the
// clock, for so long, easing in and out over so long, starting so far into the period; while standing,
// fading out by a speed; while moving, fading in by a speed; as it rears up (a sense read off the row's
// `upright`, 0 to 1). Anything else is told as written and kept.
type When =
  | { how: 'always' }
  | { how: 'never' }
  | { how: 'every'; period: number; start: number; ease: number; hold: number }
  | { how: 'standing'; by: number }
  | { how: 'moving'; by: number }
  | { how: 'rearing' }
  | { how: 'custom' }

function whenOf(list: Cue[]): When {
  if (list.length !== 1 || 'swing' in list[0]) return { how: 'custom' }
  const c = list[0], k = c.keys, src = d0.senses[c.by]
  if (k.length === 1 && c.period === undefined) return k[0][1] === 1 ? { how: 'always' } : k[0][1] === 0 ? { how: 'never' } : { how: 'custom' }
  if (src === 'clock' && c.period !== undefined && k.length === 5 && k[0][0] === 0 && k[0][1] === 0 && k[1][1] === 0 && k[2][1] === 1 && k[3][1] === 1 && k[4][1] === 0) {
    const ease = round(k[2][0] - k[1][0]), hold = round(k[3][0] - k[2][0])
    if (Math.abs(round(k[4][0] - k[3][0]) - ease) < 1e-6) return { how: 'every', period: c.period, start: k[1][0], ease, hold }
  }
  if (src === 'velocity' && c.period === undefined && k.length === 2 && k[0][0] === 0) {
    if (k[0][1] === 1 && k[1][1] === 0) return { how: 'standing', by: k[1][0] }
    if (k[0][1] === 0 && k[1][1] === 1) return { how: 'moving', by: k[1][0] }
  }
  if (src === 'rowUpright' && c.period === undefined && k.length === 2 && k[0][0] === 0 && k[0][1] === 0 && k[1][0] === 1 && k[1][1] === 1) return { how: 'rearing' }
  return { how: 'custom' }
}

function cuesOf(w: When): Cue[] {
  const clockBy = clockSense(), speedBy = senseBy('velocity')
  if (w.how === 'always') return [{ by: clockBy, keys: [[0, 1]] }]
  if (w.how === 'never') return [{ by: clockBy, keys: [[0, 0]] }]
  if (w.how === 'every') {
    const s = w.start, e = w.ease, h = w.hold
    return [{ by: clockBy, keys: [[0, 0], [s, 0], [round(s + e), 1], [round(s + e + h), 1], [round(s + 2 * e + h), 0]], period: w.period }]
  }
  if (w.how === 'standing') return [{ by: speedBy!, keys: [[0, 1], [w.by, 0]] }]
  if (w.how === 'moving') return [{ by: speedBy!, keys: [[0, 0], [w.by, 1]] }]
  throw new Error(`a timing of ${w.how} is not written from here`)
}

function told(w: When, list: Cue[]): string {
  switch (w.how) {
    case 'always': return 'plays all the time'
    case 'never': return 'never plays'
    case 'every': return `every ${w.period} s, for ${w.hold} s, easing in and out over ${w.ease} s`
    case 'standing': return `while standing, gone by ${round(w.by, 2)} m/s`
    case 'moving': return `while moving, full by ${round(w.by, 2)} m/s`
    case 'rearing': return 'as it rears onto its hind legs'
    case 'custom': return `follows ${[...new Set(list.map(c => c.by))].join(' and ')} as written`
  }
}

// ---------------------------------------------------------------- the motions

// `pick`, the motion: its layout and its driver's index. `part`, the body part picked in it.
let pick: { layout: string; driver: number } | undefined
let part: string | undefined
const driverOf = () => def().layouts[pick!.layout].drivers[pick!.driver]
const keyOf = (layout: string, i: number) => `${layout}:${i}`

const atPath = (root: any, path: Path) => path.reduce((o, k) => o?.[k], root)
const changed = (file: string, path: Path) => JSON.stringify(atPath(files[file], path)) !== JSON.stringify(atPath(saved[file], path))
const weightPath = (layout: string, i: number): Path => [kind, 'layouts', layout, 'drivers', i, 'weight']

function motions() {
  const box = $('#motions')
  box.innerHTML = ''
  const many = Object.keys(def().layouts).length > 1
  for (const [ln, L] of Object.entries(def().layouts)) {
    if (many) box.append(el('div', { className: 'say', textContent: L.on === 'world' ? `the ${ln}` : `the ${ln}, riding ${L.on.split(':')[1]}` }))
    L.drivers.forEach((x, i) => {
      const k = keyOf(ln, i), solver = 'solver' in x
      const moved = changed(place!.defs, weightPath(ln, i)) || changed(cueFile(x), []) || (solver && changed(place!.sheets[x.gait], []))
      const on = el('input', { type: 'checkbox', checked: !off.has(k), title: 'shown or left out here (not saved)' })
      on.onclick = e => e.stopPropagation()
      on.onchange = () => { if (on.checked) off.delete(k); else off.add(k); motions(); draw() }
      const drop = el('button', { textContent: '✕', title: 'take this motion off the animal' })
      drop.onclick = e => { e.stopPropagation(); if (confirm(`Take ${x.name} off the ${kind}?`)) void layer({ layout: ln, remove: i }) }
      const tools = el('span', { className: 'tools' }, on)
      if (!solver) tools.append(drop)
      const card = el('div', { className: 'motion' + (pick?.layout === ln && pick.driver === i ? ' sel' : '') + (off.has(k) ? ' off' : '') },
        el('b', { className: moved ? 'changed' : '', textContent: x.name + (moved ? ' •' : '') }), tools,
        el('div', { className: 'when', textContent: (solver ? `${x.solver === 'upright' ? 'stands it up' : 'its legs and body'}, ` : '') + told(whenOf(x.weight), x.weight) }))
      card.onclick = () => choose(ln, i)
      box.append(card)
    })
  }
  // A motion from the library put on the animal: each sheet of it not played yet that names a bone the
  // animal has.
  const lib = $('#library')
  lib.innerHTML = ''
  const ln = Object.keys(def().layouts)[0]
  const has = new Set(restOf(ln)?.bones.map(b => b.name) ?? [])
  const offered = Object.keys(library).filter(n => !Object.values(def().layouts).some(L => L.drivers.some(x => x.cues === n)) && library[n].some(b => has.has(b)))
  if (offered.length) {
    const which = el('select')
    which.innerHTML = offered.map(n => `<option>${n}</option>`).join('')
    lib.append(el('h3', { textContent: 'Give it another' }), el('div', { className: 'line' }, which, el('button', { textContent: 'Add', onclick: () => void layer({ layout: ln, add: which.value }) })))
  }
}

function choose(layout: string, driver: number, bone?: string) {
  pick = { layout, driver }
  const parts = [...partsOf(layout, driverOf())]
  part = bone ?? (part && parts.includes(part) ? part : parts[0])
  motions()
  shape()
  draw()
}

// ---------------------------------------------------------------- shaping a motion

// The angle held: the angle's keyed cue of one key and no period; its sway: its swung cue on the clock.
const heldOf = (list: Cue[]) => list.find(c => !('swing' in c) && c.keys.length === 1 && c.period === undefined) as Keyed | undefined
const swayOf = (list: Cue[]) => list.find(c => 'swing' in c) as Swung | undefined
const shapedOf = (list: Cue[]) => list.find(c => !('swing' in c) && (c.keys.length > 1 || c.period !== undefined)) as Keyed | undefined

// The part given cues in the motion's sheet when it has none: each angle held at 0, so the motion now
// holds it at its rest turn until it is turned.
function given(name: string): Turn {
  const s = sheetOf(driverOf()), by = clockSense()
  return s[name] ??= { bend: [{ by, keys: [[0, 0]] }], swing: [{ by, keys: [[0, 0]] }], twist: [{ by, keys: [[0, 0]] }] }
}

// Where the part is held on one angle, radians: its held cue, given one when it has none.
function hold(axis: Axis, value: number) {
  const list = given(part!)[axis], c = heldOf(list)
  if (c) c.keys[0][1] = round(value, 5)
  else list.push({ by: clockSense(), keys: [[0, round(value, 5)]] })
}
const heldAt = (axis: Axis) => { const t = sheetOf(driverOf())[part!]; return t ? heldOf(t[axis])?.keys[0][1] ?? 0 : 0 }

function sway(axis: Axis, amount: number, every: number) {
  const list = given(part!)[axis], c = swayOf(list)
  if (c) { c.swing = Math.sign(c.swing || 1) * round(amount, 5); c.period = every }
  else if (amount !== 0) list.push({ by: clockSense(), swing: round(amount, 5), period: every })
}

function shape() {
  const box = $('#shape')
  box.innerHTML = ''
  if (!pick) return
  const x = driverOf(), solver = 'solver' in x
  box.append(el('h3', { textContent: x.name }))
  // When it plays, in words; a full-weight preview unless it is to be seen as in the game.
  const w = whenOf(x.weight)
  const form = el('div', { className: 'when-form' })
  const writable = !['custom', 'rearing'].includes(w.how) && (senseBy('velocity') !== undefined || !['standing', 'moving'].includes(w.how))
  if (writable && !solver) {
    const how = el('select')
    const options: [When['how'], string][] = [['always', 'all the time'], ['every', 'every so often'], ['standing', 'while standing'], ['moving', 'while moving'], ['never', 'never']]
    how.innerHTML = options.filter(([h]) => senseBy('velocity') !== undefined || (h !== 'standing' && h !== 'moving')).map(([h, s]) => `<option value="${h}"${h === w.how ? ' selected' : ''}>${s}</option>`).join('')
    how.onchange = () => {
      const h = how.value as When['how']
      const next: When = h === 'every' ? { how: 'every', period: 10, start: 6, ease: 0.4, hold: 1.6 } : h === 'standing' ? { how: 'standing', by: 0.5 } : h === 'moving' ? { how: 'moving', by: 0.5 } : { how: h } as When
      setWhen(next)
    }
    form.append(el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'plays' }), how))
    if (w.how === 'every') {
      const put = (k: 'period' | 'start' | 'ease' | 'hold') => (v: number) => { if (v >= 0 && (k !== 'period' || v > 0)) setWhen({ ...w, [k]: v }) }
      form.append(
        el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'every' }), field(w.period, 0.5, put('period')), el('span', { className: 'unit', textContent: 's' })),
        el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'for' }), field(w.hold, 0.1, put('hold')), el('span', { className: 'unit', textContent: 's' })),
        el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'easing' }), field(w.ease, 0.1, put('ease')), el('span', { className: 'unit', textContent: 's in and out' })),
        el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'starting' }), field(w.start, 0.5, put('start')), el('span', { className: 'unit', textContent: 's into it' })))
    }
    if (w.how === 'standing' || w.how === 'moving') {
      form.append(el('div', { className: 'line' }, el('span', { className: 'lab', textContent: w.how === 'standing' ? 'gone by' : 'full by' }),
        field(w.by, 0.1, v => { if (v > 0) setWhen({ ...w, by: v }) }), el('span', { className: 'unit', textContent: 'm/s' })))
    }
  } else {
    const said = told(w, x.weight)
    form.append(el('div', { className: 'say', textContent: `${said[0].toUpperCase()}${said.slice(1)}.` }))
  }
  const seen = el('input', { type: 'checkbox', checked: asGame })
  seen.onchange = () => { asGame = seen.checked; draw() }
  form.append(el('label', { className: 'line' }, seen, 'show it as in the game, not in full'))
  box.append(form)

  // Its parts: every part of the layout, those it moves first, each a finer part folded under the part it
  // belongs to; a part picked here or on the animal.
  const moves = partsOf(pick.layout, x), ln = pick.layout
  const all = restOf(ln)?.bones.map(b => b.name) ?? []
  const tops = all.filter(n => topOf(ln, n) === n)
  const movesIn = (top: string) => all.some(n => topOf(ln, n) === top && moves.has(n))
  const top = part ? topOf(ln, part) : undefined
  const button = (n: string, cls: string) => el('button', { className: cls + (n === part ? ' on' : ''), textContent: n, onclick: () => { part = n; shape(); draw() } })
  box.append(el('h3', { textContent: 'Body parts it moves' }))
  const parts = el('div', { className: 'parts' })
  for (const n of tops.filter(movesIn)) parts.append(button(n, 'moves' + (n === top && n !== part ? ' on' : '')))
  if (!tops.some(movesIn)) parts.append(el('span', { className: 'unit', textContent: 'none yet: pick one below, or click a grey dot on the animal' }))
  box.append(parts)
  // A solver stands the parts its sheet does not carry, so only a sheet's motion is given new parts.
  const others = solver ? [] : tops.filter(n => !movesIn(n))
  if (others.length) {
    const fold = el('details')
    fold.append(el('summary', { textContent: `the other ${others.length}` }))
    const more = el('div', { className: 'parts' })
    for (const n of others) more.append(button(n, n === top && n !== part ? 'on' : ''))
    fold.append(more)
    if (top && others.includes(top)) fold.open = true
    box.append(fold)
  }
  // The finer parts of the part picked: its fingers, its tip.
  const finer = top ? all.filter(n => n !== top && topOf(ln, n) === top) : []
  if (finer.length) {
    box.append(el('h3', { textContent: `Finer parts of ${top}` }))
    const row = el('div', { className: 'parts' })
    for (const n of [top!, ...finer]) row.append(button(n, moves.has(n) ? 'moves' : ''))
    box.append(row)
  }
  if (part) partPanel(box, moves.has(part))
  if (solver) numbersPanel(box)
  // A motion the library has too, once saved, sent back to it so every game can take this one.
  if (!solver && x.cues in library) {
    const send = el('button', { textContent: 'Send to the library', title: 'this motion as saved, written over the library\'s', disabled: changed(cueFile(x), []) })
    send.onclick = async () => {
      try {
        const got = await api<{ written: string[] }>(`/api/puppet3d/${game}/library`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sheet: x.cues }) })
        say(`sent ${got.written.map(f => f.split('/').pop()).join(', ')} to the library`, 'ok')
      } catch (e) { fail(e) }
    }
    box.append(el('h3', { textContent: 'Every game' }), el('div', { className: 'line' }, send))
  }
}

function setWhen(w: When) {
  driverOf().weight = cuesOf(w)
  spanOf()
  touched()
}

// The part picked: each way it turns, where it is held, how far and how often it sways, and a note when
// the motion also shapes it by many keys (a clip's), which keeps playing under what is held here.
function partPanel(box: HTMLElement, moved: boolean) {
  box.append(el('h3', { textContent: part! }))
  if (!moved) box.append(el('div', { className: 'say', textContent: `${driverOf().name} does not move it yet. Turn it with a ring or a number and it will.` }))
  const t = sheetOf(driverOf())[part!]
  for (const a of AXES) {
    const list = t?.[a] ?? [], s = swayOf(list), shaped = shapedOf(list)
    const card = el('div', { className: 'angle' })
    card.append(el('div', { className: 'head' }, el('i', { style: `background:${COLOUR[a]}` } as object), el('b', { textContent: SAID[a] })))
    card.append(el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'held at' }),
      field(deg(heldAt(a)), 1, v => { hold(a, rad(v)); touched() }), el('span', { className: 'unit', textContent: '°' })))
    card.append(el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'sways' }),
      field(deg(Math.abs(s?.swing ?? 0)), 1, v => { if (v >= 0) { sway(a, rad(v), s?.period ?? 1); touched() } }), el('span', { className: 'unit', textContent: '° each way' })))
    if (s) card.append(el('div', { className: 'line' }, el('span', { className: 'lab', textContent: 'every' }),
      field(s.period, 0.05, v => { if (v > 0) { sway(a, Math.abs(s.swing), v); touched() } }), el('span', { className: 'unit', textContent: s.by === clockSense() ? 's' : `${s.by === 'stride' ? 'strides' : s.by}` })))
    if (shaped) {
      const ys = shaped.keys.map(k => Math.round(deg(k[1])))
      const how = shaped.keys.length > 4 ? `through a recorded ${shaped.by} cycle of ${shaped.keys.length} keys` : `with its ${shaped.by}, from ${Math.min(...ys)}° to ${Math.max(...ys)}°`
      card.append(el('div', { className: 'note', textContent: `Also moves ${how}; what is held here is added on top of it.` }))
    }
    box.append(card)
  }
  if (moved) box.append(el('div', { className: 'line' }, el('button', { textContent: `Stop moving ${part}`, title: 'the motion leaves this part to the motions under it', onclick: () => { delete sheetOf(driverOf())[part!]; touched() } })))
}

// A solver motion's numbers: every number of its block of the body's sheet, folded by the block's keys,
// each read by the solver on its next step; Stand again makes its body anew from them.
function numbers(v: unknown, path: Path, out: Path[] = []): Path[] {
  if (typeof v === 'number') out.push(path)
  else if (Array.isArray(v)) v.forEach((x, i) => numbers(x, [...path, i], out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) numbers(x, [...path, k], out)
  return out
}

function numbersPanel(box: HTMLElement) {
  const x = driverOf() as Extract<Driver, { solver: string }>
  const solved = drivers.find(d => d.key === `${pick!.layout}:${x.name}`)
  if (!solved) return
  const s = table[x.solver], file = place!.sheets[x.gait], block = blocks[solved.key]
  box.append(el('h3', { textContent: `How it ${x.solver === 'upright' ? 'stands up' : 'walks'}` }))
  if (block === undefined) { box.append(el('div', { className: 'say', textContent: `${x.gait} has no ${s.block} block.` })); return }
  const groups = new Map<string, Path[]>()
  for (const p of numbers(block, [s.block])) {
    const g = p.length > 2 ? String(p[1]) : ''
    groups.set(g, [...(groups.get(g) ?? []), p])
  }
  for (const [g, paths] of groups) {
    const fold = el('details')
    if (paths.some(p => changed(file, p))) fold.open = true
    fold.append(el('summary', { textContent: g || 'its numbers' }))
    for (const p of paths) {
      const r = el('div', { className: 'num' + (changed(file, p) ? ' changed' : '') }, el('span', { textContent: p.slice(g ? 2 : 1).join(' '), title: p.join('.') }))
      r.append(field(atPath(files[file], p), 0.01, v => { atPath(files[file], p.slice(0, -1))[p[p.length - 1]] = v; r.classList.toggle('changed', changed(file, p)); status(); motions() }))
      fold.append(r)
    }
    box.append(fold)
  }
  box.append(el('div', { className: 'line' }, el('button', { textContent: 'Stand again', title: 'its body made anew from these numbers where it is', onclick: () => { standAgain(); draw() } })))
}

// ---------------------------------------------------------------- the rings

// Three rings round the part picked, one for each way it turns, on the axes the plugin turns it about
// (`played`): the turn is twist about its length, then bend about its across, then swing about its up,
// in the frame its parent leaves it; so swing's axis is that frame's up, bend's its across after the
// swing, and twist's the part's length as it now lies.
const ringGeo = new THREE.TorusGeometry(1, 0.025, 6, 64)
function ring(a: Axis): THREE.Mesh {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLOUR[a], depthTest: false, transparent: true, opacity: 0.85 }))
  m.renderOrder = 20
  m.visible = false
  m.userData.axis = a
  scene.add(m)
  return m
}
const rings: Record<Axis, THREE.Mesh> = { bend: ring('bend'), swing: ring('swing'), twist: ring('twist') }
const axisOf: Record<Axis, THREE.Vector3> = { bend: new THREE.Vector3(), swing: new THREE.Vector3(), twist: new THREE.Vector3() }

// The frame a bone lies in: its across (x), its up (y), its length (z).
function frameOf(b: Bone): THREE.Matrix4 {
  const f = new THREE.Vector3(...b.tail).sub(new THREE.Vector3(...b.head)).normalize()
  const a = new THREE.Vector3(...b.across)
  a.addScaledVector(f, -a.dot(f)).normalize()
  const u = new THREE.Vector3().crossVectors(f, a)
  return new THREE.Matrix4().makeBasis(a, u, f)
}

function placeRings() {
  for (const m of Object.values(rings)) m.visible = false
  if (!pick || !part || dragging) return
  const posed = bones[pick.layout]?.find(b => b.name === part)
  if (!posed) return
  // The part's own turn, as the motion has it now; the frame before it, the posed frame undone by it.
  const t = sheetOf(driverOf())[part]
  const angle = (a: Axis) => t ? cued(a, t[a], senses) : 0
  const b = angle('bend'), s = angle('swing'), tw = angle('twist')
  const P = frameOf(posed)
  const Ry = new THREE.Matrix4().makeRotationY(s), Rx = new THREE.Matrix4().makeRotationX(-b), Rz = new THREE.Matrix4().makeRotationZ(tw)
  const T = Ry.clone().multiply(Rx).multiply(Rz)
  const R = P.clone().multiply(T.clone().invert())
  axisOf.swing.set(0, 1, 0).applyMatrix4(R).normalize()
  axisOf.bend.set(1, 0, 0).applyMatrix4(R.clone().multiply(Ry)).normalize()
  axisOf.twist.set(0, 0, 1).applyMatrix4(P).normalize()
  const head = new THREE.Vector3(...posed.head)
  const r = Math.max(size * 0.07, new THREE.Vector3(...posed.tail).distanceTo(head) * 0.6)
  for (const a of AXES) {
    const m = rings[a]
    m.position.copy(head)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisOf[a])
    m.scale.setScalar(a === 'twist' ? r * 0.8 : a === 'bend' ? r : r * 0.9)
    m.visible = true
  }
}

// A ring dragged: the pointer's angle round the ring's axis on its plane, each move's change in it added to
// where that angle is held. bend turns the other way round its axis (`played` turns by -bend about x).
let dragging: { axis: Axis; centre: THREE.Vector3; normal: THREE.Vector3; e1: THREE.Vector3; e2: THREE.Vector3; last: number; sign: number } | undefined
const ray = new THREE.Raycaster()
function rayAt(e: PointerEvent) {
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
}
function angleOn(d: NonNullable<typeof dragging>): number | undefined {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(d.normal, d.centre), p = new THREE.Vector3()
  if (!ray.ray.intersectPlane(plane, p)) return undefined
  p.sub(d.centre)
  return Math.atan2(p.dot(d.e2), p.dot(d.e1))
}
let down = { x: 0, y: 0 }
renderer.domElement.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY }
  rayAt(e)
  const hit = ray.intersectObjects(Object.values(rings).filter(m => m.visible), false)[0]
  if (!hit) return
  const axis = hit.object.userData.axis as Axis, normal = axisOf[axis].clone(), centre = hit.object.position.clone()
  // Seen edge on, the ring is turned by the pointer's height on the screen instead: its plane is then the
  // one facing the camera.
  const facing = Math.abs(normal.dot(camera.getWorldDirection(new THREE.Vector3()))) < 0.15
  const n = facing ? camera.getWorldDirection(new THREE.Vector3()).negate() : normal
  const e1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
  const e2 = new THREE.Vector3().crossVectors(n, e1)
  // Turning on the camera-facing plane goes the ring's way round when the ring's axis faces the camera.
  dragging = { axis, centre, normal: n, e1, e2, last: 0, sign: facing ? Math.sign(normal.dot(n)) || 1 : 1 }
  dragging.last = angleOn(dragging) ?? 0
  orbit.enabled = false
  renderer.domElement.setPointerCapture(e.pointerId)
  for (const [a, m] of Object.entries(rings)) m.visible = a === axis
  e.stopPropagation()
})
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragging) return
  rayAt(e)
  const now = angleOn(dragging)
  if (now === undefined) return
  let d = now - dragging.last
  d -= 2 * Math.PI * Math.round(d / (2 * Math.PI))
  dragging.last = now
  const sign = dragging.sign * (dragging.axis === 'bend' ? -1 : 1)
  hold(dragging.axis, heldAt(dragging.axis) + d * sign)
  draw()
  status()
})
renderer.domElement.addEventListener('pointerup', e => {
  if (dragging) {
    dragging = undefined
    orbit.enabled = true
    touched()
    return
  }
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !pick) return
  // A click on a dot picks that part.
  rayAt(e)
  const hit = ray.intersectObjects(layouts.flatMap(d => d.dots.filter(o => o.visible)), false)[0]
  if (!hit) return
  const { layout, bone } = hit.object.userData
  if (layout !== pick.layout) return
  part = bone
  shape()
  draw()
})

// ---------------------------------------------------------------- drawing

function draw() {
  if (!body) return
  const m = new THREE.Matrix4()
  try {
    senses = sensed(kind, d0, table, drivers, body, row.data, row, clock)
    // The mix: the motion picked at full, unless it is to be seen as in the game; the motions left out
    // left out.
    const mix: Def = !pick || asGame ? d0 : { ...d0, layouts: { ...d0.layouts, [pick.layout]: { ...d0.layouts[pick.layout], drivers: d0.layouts[pick.layout].drivers.map((x, i) => i === pick!.driver ? { ...x, weight: [{ by: clockSense(), keys: [[0, 1]] }] } : x) } } }
    const done = stood(kind, mix, table, blocks, cueSheets(), body, senses, row, off)
    const moves = pick ? partsOf(pick.layout, driverOf()) : new Set<string>()
    for (const x of layouts) {
      const own = done[x.name]
      if (own.length !== x.skin.joints.length) throw new Error(`${kind}'s ${x.name} poses ${own.length} bones and its skeleton has ${x.skin.joints.length}`)
      posed(THREE, x.skin.joints, own, m)
      bones[x.name] = own
      own.forEach((b, i) => {
        const o = x.dots[i], mine = pick?.layout === x.name, on = mine && b.name === part
        o.position.set(b.head[0], b.head[1], b.head[2])
        o.material = on ? dotOn : moves.has(b.name) ? dotMoves : dotStill
        o.scale.setScalar(size * (on ? 0.012 : moves.has(b.name) ? 0.009 : 0.006))
        // A finer part's dot only while the part it belongs to is picked.
        const t = mine ? topOf(x.name, b.name) : ''
        o.visible = mine && (t === b.name || (part !== undefined && t === topOf(x.name, part)))
      })
    }
    clearFail()
  } catch (e) { fail(e) }
  placeRings()
}

// ---------------------------------------------------------------- saving

// Every edit, by file: in the definitions file each motion's timing changed; in each cue sheet each
// angle's list of cues changed, or the whole sheet when it has been given a part or let one go; in each
// solver's sheet each number changed.
function edits() {
  const out: Record<string, { path: Path; value: unknown }[]> = {}
  const add = (file: string, path: Path, value = atPath(files[file], path)) => (out[file] ??= []).push({ path, value })
  const D = files[place!.defs] as Record<string, Def>
  const cueFiles = new Set<string>()
  for (const k of Object.keys(D)) {
    const d = D[k]
    if (!d?.layouts || !saved[place!.defs][k]) continue
    for (const [ln, L] of Object.entries(d.layouts)) L.drivers.forEach((x, i) => {
      const w = [k, 'layouts', ln, 'drivers', i, 'weight']
      if (changed(place!.defs, w)) add(place!.defs, w)
      const f = place!.sheets[x.cues]
      if (f !== undefined) cueFiles.add(f)
    })
  }
  for (const f of cueFiles) {
    const now = files[f] as BoneCues
    if (Object.keys(now).join('\n') !== Object.keys(saved[f]).join('\n')) { add(f, [], now); continue }
    for (const bone of Object.keys(now)) for (const a of AXES) if (changed(f, [bone, a])) add(f, [bone, a])
  }
  for (const f of new Set(Object.values(place!.sheets))) {
    if (cueFiles.has(f)) continue
    for (const p of numbers(files[f], [])) if (changed(f, p)) add(f, p)
  }
  return out
}
const editCount = () => Object.values(edits()).reduce((n, l) => n + l.length, 0)
function status() {
  const n = editCount()
  if (n) say(`${n} change${n === 1 ? '' : 's'} not saved`, 'dirty')
  else if ($('#state').className === 'dirty') say('')
  ;($('#save') as HTMLButtonElement).disabled = !n
}
function touched() {
  draw()
  status()
  motions()
  shape()
}

async function save() {
  const all = edits()
  if (!Object.keys(all).length || !place) return
  ;($('#save') as HTMLButtonElement).disabled = true
  say('saving…')
  const written: string[] = []
  try {
    for (const [file, list] of Object.entries(all)) {
      const got = await api<{ written: string[] }>(`/api/puppet3d/${game}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file, edits: list }) })
      written.push(...got.written)
      saved[file] = structuredClone(files[file])
    }
    touched()
    say(written.length ? `saved ${written.map(f => f.split('/').pop()).join(', ')}` : 'nothing to save', 'ok')
  } catch (e) {
    say(written.length ? 'saved some; the rest not saved' : 'not saved', 'bad')
    fail(e)
    status()
  }
}
$('#save').onclick = () => void save()

$('#revert').onclick = async () => {
  try {
    const p = pick, q = part
    await readFiles()
    await loadKind(kind)
    if (p) choose(p.layout, p.driver, q)
    say('back to what is saved', 'ok')
  } catch (e) { fail(e) }
}
addEventListener('beforeunload', e => { if (place && editCount()) e.preventDefault() })

// ---------------------------------------------------------------- each frame

// Each frame: the clock on while playing, the row stepped every whole `dt` of time owed at the speed
// picked (its `stride` round once every `stride` metres for a body that keeps one), the body posed, the
// camera and the grid carried along with it.
const clockBar = $<HTMLInputElement>('#time')
let last = performance.now()
function frame(now: number) {
  const real = Math.min(0.1, (now - last) / 1000)
  last = now
  if (body && place) {
    const was = [row.pos[0], row.pos[2]]
    if (playing) clock = (clock + real) % span
    owed += playing ? real : 0
    while (owed >= place.dt) {
      const dt = place.dt
      row.yaw += turning * dt
      row.vel = [Math.sin(row.yaw) * speed, 0, Math.cos(row.yaw) * speed]
      row.pos = [row.pos[0] + row.vel[0] * dt, 0, row.pos[2] + row.vel[2] * dt]
      if ('stride' in row.data && typeof def().stride === 'number') row.data.stride = (row.data.stride + speed * dt / def().stride) % 1
      try { stepped(table, drivers, blocks, body, row.data, row, dt, flat) } catch (e) { fail(e) }
      owed -= dt
    }
    draw()
    const dx = row.pos[0] - was[0], dz = row.pos[2] - was[1]
    camera.position.x += dx; camera.position.z += dz
    orbit.target.x += dx; orbit.target.z += dz
    orbit.update()
    grid.position.set(Math.round(row.pos[0] * 4) / 4, 0, Math.round(row.pos[2] * 4) / 4)
    if (document.activeElement !== clockBar) clockBar.value = String(clock)
    $('#clock').textContent = `${clock.toFixed(2)} s`
  }
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

function playButton() { $('#play').textContent = playing ? 'Pause' : 'Play' }
$('#play').onclick = () => { playing = !playing; playButton() }
clockBar.oninput = () => { clock = Number(clockBar.value); playing = false; playButton(); draw() }
addEventListener('keydown', e => {
  if (e.code !== 'Space' || ['INPUT', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName)) return
  e.preventDefault()
  playing = !playing
  playButton()
})

// ---------------------------------------------------------------- the animals

function animals() {
  const box = $('#animals')
  box.innerHTML = ''
  for (const k of [...new Set(scenes.flatMap(x => x.kinds))]) box.append(el('button', { className: k === kind ? 'on' : '', textContent: k, onclick: () => void openKind(k) }))
}

async function openKind(k: string) {
  if (k === kind) return
  if (editCount() && !confirm('Leave the changes not saved?')) return
  try {
    const next = scenes.find(x => x.kinds.includes(k))!
    if (next !== place) await openScene(next, k)
    else await loadKind(k)
    const q = new URLSearchParams(location.search); q.set('kind', k); history.replaceState(null, '', `?${q}`)
  } catch (err) { fail(err) }
}

// A motion from the library put on or taken off (`POST /api/puppet3d/<game>/layer`), then the game read
// again and the animal opened anew. Changes not saved stop it first: reading again would drop them.
async function layer(b: { layout: string; add?: string; remove?: number }) {
  if (editCount()) { say('save or revert your changes first', 'dirty'); return }
  try {
    const got = await api<{ written: string[] }>(`/api/puppet3d/${game}/layer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scene: place!.name, kind, ...b }) })
    ;({ scenes, library } = await api<{ scenes: Scene[]; library: Record<string, string[]> }>(`/api/puppet3d/${game}`))
    await openScene(scenes.find(x => x.kinds.includes(kind))!, kind)
    if (b.add) {
      const L = def().layouts[b.layout]
      choose(b.layout, L.drivers.findIndex(x => x.cues === b.add))
    }
    say(`saved ${got.written.map(f => f.split('/').pop()).join(', ')}`, 'ok')
  } catch (e) { fail(e) }
}

async function openScene(s: Scene, k: string) {
  place = s
  await readTable()
  await readFiles()
  row.pos = [0, 0, 0]; row.yaw = 0; row.vel = [0, 0, 0]
  kind = ''
  await loadKind(k)
}

async function openGame(g: string) {
  clearFail()
  clear()
  game = g
  ;({ scenes, library } = await api<{ scenes: Scene[]; library: Record<string, string[]> }>(`/api/puppet3d/${g}`))
  const kinds = [...new Set(scenes.flatMap(x => x.kinds))]
  if (!kinds.length) { say(`${g} has no puppet3d animals`); $('#animals').innerHTML = ''; return }
  const want = new URLSearchParams(location.search).get('kind')
  const k = want && kinds.includes(want) ? want : kinds[0]
  await openScene(scenes.find(x => x.kinds.includes(k))!, k)
}

resize()
try {
  const games = await api<string[]>('/api/games')
  const g = $<HTMLSelectElement>('#game')
  g.innerHTML = games.map(x => `<option>${x}</option>`).join('')
  const first = new URLSearchParams(location.search).get('game') ?? games[0]
  g.value = first
  g.onchange = async () => {
    if (place && editCount() && !confirm('Leave the changes not saved?')) { g.value = game; return }
    const q = new URLSearchParams(); q.set('game', g.value); history.replaceState(null, '', `?${q}`)
    try { await openGame(g.value) } catch (err) { fail(err) }
  }
  await openGame(first)
} catch (e) { fail(e) }
requestAnimationFrame(frame)
