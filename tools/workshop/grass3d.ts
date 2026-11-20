// The grass workshop's page (`/grass3d?game=<game>`): a game's grasses grown by core's own grass3d on test
// grounds, with no game running, every number tuned as it draws and saved into the game's grasses file.
//
// What it reads. The server's summary (`/api/grass3d/<game>`): each grasses file a scene of the game names
// (`world.grass3d.grasses`), the file as it is on disk, that scene's render3d prefab and step, the metres
// between the lattice points of that scene's land (`cell`), and the workshop's stage file
// (`grass3d.stage.json`): the field, the test grounds, the treaders, the views and the stage's light.
// `&file=<repo path>` opens one of several grasses files, `&grass=<name>` one grass, `&together=1` grows
// the file's other grasses with it, `&ground=<name>` one test ground, `&treader=<name>` one of the stage's
// treaders and `&view=<name>` one of its views; the page keeps them in its address. A view is where the
// camera stands and the point it turns round, each so high over the ground there; one `with` the treader
// is laid out from the treader's place and goes with it.
//
// The stage. A scene of the loader, the workshop's own `grounds` plugin (`plugins/grounds/`, listed as a
// game lists its own), gpgpu3d, grass3d and render3d with the game's prefab (its tone, exposure and
// shadows), under the stage's own sky and sun. grass3d's mods are `{ land: 'grounds', keeper: 'gpgpu3d',
// pressed: 'gpgpu3d', behaviors: ['walker', 'box3dvehicle'] }`, and gpgpu3d's `ops` names grass3d, so a grass's
// program is compiled as a game compiles it: the land is the test ground shown, its lattice the game's
// land's where the summary gives one, and gpgpu3d holds the treader's parts, a cylinder pressing the grass
// as a walking body does and a box as a car's body or wheel does. With no `wind` mod the file's own wind
// blows. grass3d is handed the page's own copy of the grasses file, made again every frame: every number
// of the file as edited here, and the grass shown, or every grass of the file, each with no rules (where a
// grass grows on a test ground is the ground's; where it grows in the game is not shown or changed here).
// So a number changed is drawn that frame, and what is made again when it changes is what the game makes
// again.
//
// The treader is `world.grounds.treader`, which the grounds plugin reads every frame: its parts, the
// circle it goes round and how fast. A button for each treader of the stage file sets it; the circle and
// the speed are fields. It is the page's alone and is never saved.
//
// The numbers. The right column is every number of the grass shown and of the file (`plugins/grass3d/
// grass3d.sim.ts` says what each is) and of its program's nodes (`plugins/gpgpu3d/gpgpu3d.ops.ts`; the ops,
// the wiring and the outputs are written in the file), a slider and a field each; a number changed since the file was read
// is amber. **Save to game** sends each changed number (`POST /api/grass3d/<game>`), set in place in the
// file and checked by grass3d's own `check`; **Revert** reads the file again. The file written on disk by
// anything else is read again when nothing here is unsaved.
//
// `window.__workshop` is `{ plugins, world, shown, frame, look }`, for driving the page from a console:
// `frame()` is one frame, which a window behind others, given none by the browser, is stepped with, and
// `look(name)` one of the stage's views.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { grass3d } from '#plugins/grass3d/grass3d.plugin.ts'
import { gpgpu3d } from '#plugins/gpgpu3d/gpgpu3d.plugin.ts'
import { opsOf, rangeOf, type OpTable, type Param } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'
import type { Grass, Grass3d } from '#plugins/grass3d/grass3d.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { grounds } from './plugins/grounds/grounds.plugin.ts'
import type { Test, Treader } from './plugins/grounds/grounds.sim.ts'

type Json = any
type Path = (string | number)[]
type Found = { file: string; scenes: string[]; grasses: Grass3d; render3d: Json; dt: number; cell: number | null }
type Stage = {
  field: { size: number; cell: number; grid: number }
  colours: { ground: string; bare: string; line: string; treader: string }
  sky: { colour: string; ground: string; power: number; background: string }
  sun: { colour: string; power: number; at: [number, number, number]; half: number; map: number }
  camera: { fov: number; near: number; far: number }
  views: Record<string, { at: [number, number, number]; look: [number, number, number]; with?: 'treader' }>
  grounds: Record<string, Test>
  treaders: Record<string, Treader>
}
type Summary = { game: string; files: Found[]; stage: Stage }

const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector(q) as T
const view = $('#view')
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}
function say(text: string, how: '' | 'ok' | 'bad' | 'dirty' = '') {
  const s = $('#state')
  s.textContent = text
  s.className = how
}
const fail = (e: unknown) => { const b = $('#error'); b.textContent = e instanceof Error ? e.message : String(e); b.style.display = 'block' }
const clearFail = () => { $('#error').style.display = 'none' }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const body = await r.json()
  if (!r.ok) throw new Error(body.error ?? `${url}: ${r.status}`)
  return body as T
}
const at = (root: Json, path: Path): Json => path.reduce((o, k) => o?.[k], root)
const put = (root: Json, path: Path, v: Json) => { at(root, path.slice(0, -1))[path[path.length - 1]] = v }

// ---------------------------------------------------------------- the fields

type Field =
  | { is: 'number'; path: Path; label: string; unit: string; min: number; max: number; step: number }
  | { is: 'colour'; path: Path; label: string }
const num = (path: Path, label: string, unit: string, min: number, max: number, step: number): Field => ({ is: 'number', path, label, unit, min, max, step })

// The ops this page's scene delivers (`gpgpu3d.ops.ts`), which say what each number of a program is.
let ops: OpTable = {}
// The slider of one number of a program's node, in the range its op gives it (`rangeOf`).
function sliderOf(path: Path, label: string, p: Param, v: number): Field {
  const r = rangeOf(p, v)
  return num(path, label, '', r.min, r.max, r.step)
}
// A field for each number a grass's program gives its nodes, one for each of a vec3's three.
function programFields(g: Grass): Field[] {
  return (g.program?.nodes ?? []).flatMap((node, k) => Object.entries(ops[node.op]?.params ?? {}).flatMap(([key, p]): Field[] => {
    const v = node[key]
    if (p.type === 'whole' || p.type === 'number') return typeof v === 'number' ? [sliderOf(['program', 'nodes', k, key], `${node.id} ${key}`, p, v)] : []
    if (p.type === 'vec3' && Array.isArray(v)) return v.map((n, i) => sliderOf(['program', 'nodes', k, key, i], `${node.id} ${key} ${'xyz'[i]}`, { type: 'number' }, n as number))
    return []
  }))
}

// Every number of a grass, in the groups the right column shows them in, each path from the grass. Its
// segments are a field for each level its list names.
const groups = (g: Grass): { title: string; note: string; fields: Field[] }[] => [
  {
    title: 'How much', note: '',
    fields: [
      num(['density'], 'density', '/m²', 10, 800, 1),
      num(['full'], 'that dense within', 'm', 1, 30, 0.5),
      num(['reach'], 'reach', 'm', 10, 300, 1),
      num(['fade'], 'fades over', 'm', 0, 100, 1),
      num(['tile'], 'tile', 'm', 0.5, 8, 0.25),
      num(['chunks'], 'chunks a side', '', 1, 8, 1),
      ...g.segments.map((_, k) => num(['segments', k], k === g.segments.length - 1 && k > 0 ? `segments, level ${k} on` : `segments, level ${k}`, '', 1, 12, 1)),
      num(['shadow'], 'casts shadows within', 'm', 0, 60, 1),
    ],
  },
  {
    title: 'Its blades', note: '',
    fields: [
      num(['height', 0], 'height', 'm', 0.05, 2, 0.01),
      num(['height', 1], 'height spread', '', 0, 2, 0.01),
      num(['width', 0], 'width', 'm', 0.005, 0.3, 0.001),
      num(['width', 1], 'width spread', '', 0, 2, 0.01),
      num(['widen'], 'widens far off', '', 0, 1.5, 0.01),
      num(['widest'], 'widest', '×', 1, 16, 0.1),
      num(['lean'], 'lean', '', 0, 0.85, 0.01),
    ],
  },
  {
    title: 'Its colour', note: '',
    fields: [
      { is: 'colour', path: ['colours', 'root'], label: 'root' },
      { is: 'colour', path: ['colours', 'tip'], label: 'tip' },
      { is: 'colour', path: ['colours', 'dry'], label: 'dry' },
      num(['dry', 'amount'], 'dry amount', '', 0, 1, 0.01),
      num(['dry', 'scale'], 'dry patches', 'm', 1, 80, 0.5),
      num(['vary'], 'vary', '', 0, 1, 0.01),
      num(['ao'], 'darker at root', '', 0, 1, 0.01),
      num(['roughness'], 'roughness', '', 0, 1, 0.01),
      num(['translucency'], 'translucency', '', 0, 3, 0.01),
    ],
  },
  ...(g.program ? [{ title: 'Its program', note: 'The numbers of its nodes, by node. The ops, the wiring and the outputs are written in the file.', fields: programFields(g) }] : []),
]
// The file's own numbers, each path from the file.
const FILE: Field[] = [
  num(['wind', 'toward'], 'blows toward', '°', 0, 360, 1),
  num(['wind', 'speed'], 'speed', 'm/s', 0, 20, 0.1),
  num(['gust', 'scale'], 'gust size', 'm', 1, 80, 0.5),
  num(['gust', 'strength'], 'gust strength', '', 0, 1, 0.01),
  num(['gust', 'flutter'], 'flutter', '', 0, 0.5, 0.005),
  num(['gust', 'rate'], 'flutter rate', 'rad/s', 0, 12, 0.05),
  num(['bend'], 'bend', '/(m/s)', 0, 0.85, 0.005),
  num(['trample', 'recover'], 'stands back up in', 's', 0.5, 120, 0.5),
  num(['trample', 'reach'], 'bends away within', 'm', 0, 2, 0.01),
  num(['budget'], 'fill budget', 'ms', 0.5, 16, 0.5),
]

// ---------------------------------------------------------------- what is open

const query = new URLSearchParams(location.search)
let game = query.get('game') ?? ''
let found: Found | undefined
let stageFile: Stage | undefined
// The file as it is on disk, and as edited here.
let disk: Grass3d | undefined
let edited: Grass3d | undefined
let grass = ''
let together = query.get('together') === '1'
let ground = ''
let treader: Treader | undefined
let treaderName = ''
let viewName = ''

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b)
// Each number changed since the file was read: its path from the file and its value now.
function edits(): { path: Path; value: Json }[] {
  if (!disk || !edited) return []
  const out: { path: Path; value: Json }[] = []
  for (const f of FILE) if (!same(at(disk, f.path), at(edited, f.path))) out.push({ path: f.path, value: at(edited, f.path) })
  for (const name of Object.keys(edited.grasses)) {
    for (const g of groups(edited.grasses[name])) for (const f of g.fields) {
      const path = ['grasses', name, ...f.path]
      if (!same(at(disk, path), at(edited, path))) out.push({ path, value: at(edited, path) })
    }
  }
  return out
}
function told() {
  const n = edits().length
  if (n) say(`${n} number${n === 1 ? '' : 's'} changed`, 'dirty')
  else say('as the file is', 'ok')
  $<HTMLButtonElement>('#save').disabled = !n
  $<HTMLButtonElement>('#revert').disabled = !n
  for (const b of $('#grasses').children) {
    const name = (b as HTMLElement).dataset.name!
    b.classList.toggle('changed', !!disk && !!edited && !same(disk.grasses[name], edited.grasses[name]))
  }
}
function address() {
  const q = new URLSearchParams({ game })
  if (found) q.set('file', found.file)
  if (grass) q.set('grass', grass)
  if (together) q.set('together', '1')
  if (ground) q.set('ground', ground)
  if (treaderName) q.set('treader', treaderName)
  if (viewName) q.set('view', viewName)
  history.replaceState(null, '', `${location.pathname}?${q}`)
}

// ---------------------------------------------------------------- the columns

// One line of a column: a field's name, its slider and its box, written into `root` at `path`; `from` is
// what it is compared with to show it changed.
function line(root: Json, from: Json, f: Field): HTMLElement {
  const row = el('div', { className: 'line' })
  const mark = () => row.classList.toggle('changed', !same(at(from, f.path), at(root, f.path)))
  const changed = () => { mark(); told() }
  const lab = el('span', { className: 'lab', textContent: f.label })
  if (f.is === 'colour') {
    const c = el('input', { type: 'color', value: at(root, f.path) })
    c.oninput = () => { put(root, f.path, c.value); changed() }
    row.append(lab, c)
  } else {
    const v = at(root, f.path) as number
    const slide = el('input', { type: 'range', min: String(f.min), max: String(f.max), step: String(f.step), value: String(v) })
    const box = el('input', { type: 'number', step: String(f.step), value: String(v) })
    slide.oninput = () => { const n = Number(slide.value); put(root, f.path, n); box.value = String(n); changed() }
    box.onfocus = () => box.select()
    box.onchange = () => {
      const n = Number(box.value)
      if (box.value.trim() === '' || !Number.isFinite(n)) { box.value = String(at(root, f.path)); return }
      put(root, f.path, n)
      slide.value = String(n)
      changed()
    }
    row.append(lab, slide, box, el('span', { className: 'unit', textContent: f.unit }))
  }
  mark()
  return row
}

function numbers() {
  const col = $('#numbers')
  col.replaceChildren()
  if (!edited || !disk) return
  for (const g of groups(edited.grasses[grass])) {
    col.append(el('h3', { textContent: `${grass}: ${g.title}` }))
    if (g.note) col.append(el('div', { className: 'say', textContent: g.note }))
    for (const f of g.fields) col.append(line(edited.grasses[grass], disk.grasses[grass], f))
  }
  col.append(el('h3', { textContent: 'The file\'s wind and trampling' }), el('div', { className: 'say', textContent: 'Every grass of the file blows and is trodden by these.' }))
  for (const f of FILE) col.append(line(edited, disk, f))
}

function picks() {
  const list = $('#grasses')
  list.replaceChildren(...Object.keys(edited!.grasses).map(name => {
    const b = el('button', { textContent: name, className: name === grass ? 'on' : '', onclick: () => { grass = name; picks(); numbers(); address(); told() } })
    b.dataset.name = name
    return b
  }))
  $('#grounds').replaceChildren(...Object.keys(stageFile!.grounds).map(name =>
    el('button', { textContent: name, className: name === ground ? 'on' : '', onclick: () => { ground = name; world.grounds.ground = name; picks(); address() } })))
  $('#treaders').replaceChildren(...Object.keys(stageFile!.treaders).map(name =>
    el('button', { textContent: name, className: name === treaderName ? 'on' : '', onclick: () => treading(name) })))
}

// The treader set to one of the stage file's, and its fields shown.
function treading(name: string) {
  treaderName = name
  treader = structuredClone(stageFile!.treaders[name])
  world.grounds.treader = treader
  const col = $('#treader')
  col.replaceChildren()
  const t = treader
  // a number typed makes the treader the page's own, none of the stage file's
  const own = () => { treaderName = ''; for (const b of $('#treaders').children) b.classList.remove('on'); address() }
  const one = (label: string, key: 'circle' | 'speed', step: number, unit: string) => {
    const box = el('input', { type: 'number', step: String(step), min: '0', value: String(t[key]) })
    box.onfocus = () => box.select()
    box.onchange = () => {
      const n = Number(box.value)
      if (box.value.trim() === '' || !Number.isFinite(n) || n < 0) { box.value = String(t[key]); return }
      t[key] = n
      own()
    }
    return el('div', { className: 'line' }, el('span', { className: 'lab', textContent: label }), box, el('span', { className: 'unit', textContent: unit }))
  }
  if (t.parts.length) {
    col.append(
      el('div', { className: 'say', textContent: 'It goes round the middle of the field: how far out, and how fast. A circle of 0 stands it there.' }),
      one('circle', 'circle', 0.5, 'm'),
      one('speed', 'speed', 0.1, 'm/s'),
    )
  }
  for (const b of $('#treaders').children) b.classList.toggle('on', b.textContent === name)
  address()
}

// ---------------------------------------------------------------- the stage

// The grasses file as grass3d is handed it, made again each frame from what is shown.
const shown = {} as Grass3d
function show() {
  const e = edited!
  shown.budget = e.budget
  shown.wind = e.wind
  shown.gust = e.gust
  shown.bend = e.bend
  shown.trample = e.trample
  const names = together ? Object.keys(e.grasses) : [grass]
  shown.grasses = Object.fromEntries(names.map(n => [n, { ...e.grasses[n], rules: [] }]))
}

let world: Json
let P: Json
let orbit: OrbitControls
let sun: THREE.DirectionalLight

// One of the stage's views: the camera and the point it turns round, each as high over the ground there
// as the view says. A view `with` the treader is laid out from where the treader is, and goes with it
// from then on.
let riding = false
const was = new THREE.Vector3()
function look(name: string) {
  const v = stageFile!.views[name]
  riding = v.with === 'treader'
  was.set(...(P.grounds.at() as [number, number, number]))
  const from = riding ? was : new THREE.Vector3()
  const up = (p: [number, number, number]) => [from.x + p[0], p[1] + P.grounds.height(from.x + p[0], from.z + p[2]), from.z + p[2]] as [number, number, number]
  const cam = P.render3d.camera as THREE.PerspectiveCamera
  cam.position.set(...up(v.at))
  orbit.target.set(...up(v.look))
  orbit.update()
  viewName = name
  for (const b of $('#views').children) b.classList.toggle('on', b.textContent === name)
  address()
}

async function build(f: Found, stage: Stage) {
  world = {
    loader: { assets: {} },
    shipped: { plugins: ['grounds'] },
    scenemanager: { home: new URL('/tools/workshop/', location.href).href },
    grounds: { field: { ...stage.field, cell: f.cell ?? stage.field.cell }, colours: stage.colours, grounds: stage.grounds, ground, treader },
    gpgpu3d: { reach: stage.camera.far, mods: { things: ['grounds'], behaviors: ['shapes3d', 'box3dvehicle'], ops: ['grass3d'] } },
    grass3d: { grasses: 'grasses', mods: { land: 'grounds', keeper: 'gpgpu3d', pressed: 'gpgpu3d', behaviors: ['walker', 'box3dvehicle'] } },
  }
  const first = stage.views[viewName]
  const scene = {
    plugins: ['loader', 'shipped', 'gpgpu3d', 'grass3d', 'render3d'],
    world,
    prefabs: {
      engine: { width: view.clientWidth, height: view.clientHeight, dt: f.dt },
      render3d: { ...f.render3d, camera: { fov: stage.camera.fov, near: stage.camera.near, far: stage.camera.far, at: first.at, look: first.look } },
    },
  }
  await prepare({}, [], world)
  ops = opsOf(world)
  const real = loader()
  // The loader as grass3d is handed it: the grasses file the page's own copy.
  const handed = new Proxy(real, {
    get(t, k) {
      if (k === 'get') return (name: string) => (name === 'grasses' ? shown : t.get(name))
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  P = { wire: { n: 1, rows: [], scene, between: 1 }, loader: handed, grounds: grounds(), gpgpu3d: gpgpu3d(), grass3d: grass3d(), render3d: render3d() }
  const canvas = document.createElement('canvas')
  view.prepend(canvas)
  P.render3d.mount(canvas)
  real.tick(P)
  P.render3d.tick(P)
  P.render3d.ratio(devicePixelRatio)
  P.render3d.claim('workshop')
  const three = P.render3d.scene as THREE.Scene
  three.background = new THREE.Color(stage.sky.background)
  three.add(new THREE.HemisphereLight(stage.sky.colour, stage.sky.ground, stage.sky.power))
  sun = new THREE.DirectionalLight(stage.sun.colour, stage.sun.power)
  sun.castShadow = true
  sun.shadow.mapSize.set(stage.sun.map, stage.sun.map)
  const c = sun.shadow.camera
  c.left = -stage.sun.half; c.right = stage.sun.half; c.top = stage.sun.half; c.bottom = -stage.sun.half
  c.near = 0.1; c.far = 4 * Math.hypot(...stage.sun.at)
  c.updateProjectionMatrix()
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.02
  three.add(sun, sun.target)
  orbit = new OrbitControls(P.render3d.camera, canvas)
  P.grounds.tick(P)
  for (const name of Object.keys(stage.views)) $('#views').append(el('button', { textContent: name, onclick: () => look(name) }))
  look(viewName)
  const fit = () => {
    const w = view.clientWidth, h = view.clientHeight
    if (!w || !h) return
    const cam = P.render3d.camera as THREE.PerspectiveCamera
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    P.render3d.renderer.setSize(w, h)
    P.render3d.composer?.setSize(w, h)
  }
  addEventListener('resize', fit)
  const frame = () => {
    try {
      show()
      real.tick(P)
      P.grounds.tick(P)
      P.render3d.tick(P)
      if (riding) {
        const now = new THREE.Vector3(...(P.grounds.at() as [number, number, number])), moved = now.clone().sub(was)
        ;(P.render3d.camera as THREE.PerspectiveCamera).position.add(moved)
        orbit.target.add(moved)
        was.copy(now)
      }
      orbit.update()
      // the sun goes with the point the camera turns round, so its shadows are drawn where it looks
      sun.target.position.copy(orbit.target)
      sun.position.set(orbit.target.x + stageFile!.sun.at[0], orbit.target.y + stageFile!.sun.at[1], orbit.target.z + stageFile!.sun.at[2])
      P.gpgpu3d.afterTick(P)
      P.grass3d.afterTick(P)
      clearFail()
    } catch (e) {
      fail(e)
    }
    P.render3d.afterTick()
    const b = P.grass3d.blocks() as { held: number; of: number }
    const chunks = (P.grass3d.chunks() as { levels: { chunks: { visible: boolean; castShadow: boolean; count: number }[] }[] }[]).flatMap(g => g.levels.flatMap(l => l.chunks))
    const drawn = chunks.filter(c => c.visible)
    $('#hud').textContent = `ground ${b.held}/${b.of} blocks\n${drawn.length} chunks drawn, ${drawn.filter(c => c.castShadow).length} casting shadows\nlines every ${P.grounds.squares()} m`
  }
  ;(window as Json).__workshop = { plugins: P, world, shown, frame, look }
  const loop = () => { requestAnimationFrame(loop); frame() }
  requestAnimationFrame(loop)
}

// ---------------------------------------------------------------- reading, saving

async function read() {
  const s = await api<Summary>(`/api/grass3d/${game}`)
  stageFile = s.stage
  found = s.files.find(f => f.file === (found?.file ?? query.get('file'))) ?? s.files[0]
  disk = found.grasses
  edited = structuredClone(disk)
  if (!edited.grasses[grass]) grass = Object.keys(edited.grasses)[0]
  const files = $<HTMLSelectElement>('#file')
  files.replaceChildren(...s.files.map(f => el('option', { value: f.file, textContent: f.file.replace(`games/${game}/`, ''), selected: f.file === found!.file })))
  return s
}

$<HTMLButtonElement>('#save').onclick = async () => {
  const list = edits()
  if (!list.length || !found) return
  try {
    await api(`/api/grass3d/${game}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: found.file, edits: list }) })
    disk = structuredClone(edited!)
    numbers()
    told()
  } catch (e) {
    say((e as Error).message, 'bad')
  }
}
$<HTMLButtonElement>('#revert').onclick = async () => {
  await read()
  picks()
  numbers()
  told()
}
$<HTMLInputElement>('#together').checked = together
$<HTMLInputElement>('#together').onchange = e => { together = (e.target as HTMLInputElement).checked; address() }
$<HTMLSelectElement>('#game').onchange = e => { location.search = `?game=${(e.target as HTMLSelectElement).value}` }
$<HTMLSelectElement>('#file').onchange = e => { location.search = `?${new URLSearchParams({ game, file: (e.target as HTMLSelectElement).value })}` }
addEventListener('beforeunload', e => { if (edits().length) e.preventDefault() })

const games = await api<string[]>('/api/games')
$<HTMLSelectElement>('#game').replaceChildren(el('option', { value: '', textContent: 'game…' }), ...games.map(g => el('option', { value: g, textContent: g, selected: g === game })))
if (!game) say('pick a game')
else {
  try {
    const s = await read()
    grass = edited!.grasses[query.get('grass') ?? ''] ? query.get('grass')! : grass
    ground = s.stage.grounds[query.get('ground') ?? ''] ? query.get('ground')! : Object.keys(s.stage.grounds)[0]
    const named = query.get('treader') ?? ''
    treaderName = s.stage.treaders[named] ? named : Object.keys(s.stage.treaders)[0]
    treader = structuredClone(s.stage.treaders[treaderName])
    viewName = s.stage.views[query.get('view') ?? ''] ? query.get('view')! : Object.keys(s.stage.views)[0]
    show()
    await build(found!, s.stage)
    picks()
    treading(treaderName)
    numbers()
    told()
    // the file written on disk by anything else is read again when nothing here is unsaved
    new EventSource('/api/events').onmessage = async m => {
      if (m.data !== `changed ${found!.file}`) return
      if (edits().length) return
      await read()
      picks()
      numbers()
      told()
    }
  } catch (e) {
    say((e as Error).message, 'bad')
    fail(e)
  }
}
