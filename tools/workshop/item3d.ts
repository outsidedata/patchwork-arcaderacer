// The item3d workshop's page (`/item3d?game=<game>`): a game's own scene run in the page, each body of its
// bodies sheet (`plugins/item3d/item3d.bodies.ts`) looked at with what it holds, what it wears and its capsules,
// every number tuned as the game draws it and saved into the sheet, and a garment's pins and numbers into the
// scene's fabrics file.
//
// What it reads. The server's summary (`/api/item3d/<game>`): each bodies sheet a scene of the game names
// (`world.item3d.bodies`), the sheet as it is on disk, the scene the page boots, the items a hold may name, and
// that scene's fabrics file where it lists fabric3d. `&file=<repo path>` opens one of several sheets and
// `&body=<name>` one body; the page keeps them in its address.
//
// The stage is the game. The page boots the game's manager on the summary's scene and makes one page on it over
// a loopback, as the game's `index.html` does, stepped on the page's clock, so every body is drawn by the plugin
// that draws it in the game (anim, motion3d or crowd3d), holding its items through item3d's mods, wearing its
// fabrics through fabric3d and met as its capsules through gpgpu3d. Nothing stands in for any of it. The page
// sends the seat no input, and takes three things over, each by wrapping one function of a plugin of the page's:
//   the camera   render3d's `afterTick` is run after the page has put render3d's camera where its own orbit is,
//                round the body shown, which it goes with
//   the clip     for a body anim draws, anim's `tick` is followed by anim's own `pose(id, clip, t)` at the
//                playhead, so the body plays the clip picked in place of what its row asks; for a body crowd3d
//                draws, its rows' `clip` is set before crowd3d's `tick`. A body motion3d draws is moved by its
//                row's own state and is drawn as the game plays it.
//   what is seen the body, what it holds and what it wears are each hidden or shown
// The game's clock is the page's to hold. It runs until the cloth of the body shown is first made, and is held
// there with that cloth laid again, so the first thing seen is the cloth as it is laid, before it has moved.
// **Step** moves the clock one substep of the cloth (`world.fabric3d.substep`), **Play** lets it run, and **Lay
// again** puts the cloth back as its garment was cut. While it is held every plugin still ticks and draws.
//
// A number changed is the file written, as far as the game knows: the page hands the loader the sheet or the
// fabrics file as edited here (`loader.sim.ts`'s `written`, then the page's loader's `written`), so item3d checks
// the sheet again and anim, motion3d, crowd3d and fabric3d each draw from it on the next frame, as they do when
// the file is written while the game runs. A fabric whose file is written is laid again as its garment was cut.
//
// The right column is the body shown:
//   Holds     each thing it holds: its bone, or its place for a body of crowd3d's, its `at` and its `turn`. A
//             hold picked on a body with bones has a gizmo on it, Move or Rotate, in its bone's frame.
//   Wears     each fabric it wears: the garment's pins, each a piece of its pattern held on a bone, added and
//             taken away; and the fabric's numbers.
//   Capsules  the body as cloth meets it: each capsule's two bones and radius, each ball's bone, place and
//             radius, added and taken away, drawn over the body in the view, the one picked in another colour.
// The left column's readout is each garment the body wears as its bake left it, against the capsules where the
// body stood in that bake (the sidecar's `stood`): for each piece, how many of its points a capsule pushes on the
// first frame (nearer it than the fabric's `thick`), the furthest any is pushed, and the middle gap from the
// cloth to the nearest capsule. A pinned piece is held and is not pushed.
//
// **Save to game** sends each list changed and each fabric number changed (`POST /api/item3d/<game>`), each file
// checked by its own plugin before either is written; **Revert** reads the files again. A file written on disk
// by anything else is read again when nothing here is unsaved.
//
// `window.__workshop` is `{ plugins, truth, page, edited, cloth, frame }`, for driving the page from a console:
// `frame()` is one frame, which a window behind others, given none by the browser, is stepped with.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { boot } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { carried } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { PLACES } from '#plugins/crowd3d/crowd3d.plugin.ts'
import { heldName, type Bodies, type Capsule, type Hold } from '#plugins/item3d/item3d.bodies.ts'

type Json = any
type Path = (string | number)[]
type Cloth = { fabrics: Record<string, Json> }
type Found = { file: string; url: string; scene: string; scenes: string[]; sheet: Bodies; items: string[]; fabrics?: { file: string; url: string; fabrics: Cloth } }
type Summary = { game: string; sheets: Found[] }
// Which plugin draws a body: the one whose numbers have it by its name.
type By = 'anim' | 'motion3d' | 'crowd3d'

const DEG = Math.PI / 180
const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector(q) as T
const view3d = $('#view')
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
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b)
const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(6))
const cm = (m: number) => `${(m * 100).toFixed(1)} cm`

// ---------------------------------------------------------------- what is open

const query = new URLSearchParams(location.search)
const game = query.get('game') ?? ''
let found: Found | undefined
// The sheet and the fabrics file as they are on disk, and as edited here.
let disk: Bodies | undefined
let edited: Bodies | undefined
let diskCloth: Cloth | undefined
let cloth: Cloth | undefined
let body = ''
// The clip picked for the body shown, '' as the game plays it; its playhead, seconds; and whether it is held.
let clip = ''
let clipT = 0
let paused = false
// The hold and the capsule picked in the right column, by their place in the body's lists, or -1.
let hold = -1
let capsule = -1
// The game's clock: whether it runs, the seconds a Step has asked for that it has not yet taken, the seconds
// it has gone since the cloth was last laid, and whether the page has yet held it on the frame the cloth of
// the body shown was first laid.
let running = true
let asked = 0
let since = 0
let heldFirst = false

let P: Json
let truth: Json
let page: Json

const world = (): Json => P.wire.scene.world
const byOf = (name: string): By | undefined => {
  const w = world()
  return w.anim?.kinds?.[name] ? 'anim' : w.motion3d?.kinds?.[name] ? 'motion3d' : w.crowd3d?.bodies?.[name] ? 'crowd3d' : undefined
}
// The first row the game draws as the body.
const rowOf = (name: string): Json | undefined => {
  const by = byOf(name), rows: Json[] = P.wire.rows
  if (by === 'crowd3d') return rows.find(r => world().crowd3d.kinds.includes(r.kind) && r.data.body === name)
  return by ? rows.find(r => (typeof r.data.as === 'string' ? r.data.as : r.kind) === name) : undefined
}
// The body's bones, by their names less Mixamo's prefix, once its model is made.
const bonesOf = (name: string): string[] => {
  const by = byOf(name), row = rowOf(name)
  if (!row || !by || by === 'crowd3d') return []
  const root: THREE.Object3D | undefined = P[by].model(row.id)
  const out: string[] = []
  root?.traverse(o => { if ((o as THREE.Bone).isBone) out.push(o.name.replace(/^mixamorig\d*:?/, '')) })
  return [...new Set(out)]
}
// A garment a fabric is cut from: its sidecar and its model, once both have landed.
const garmentOf = (fabric: string): { side: Json; model: { scene: THREE.Object3D } } | undefined => {
  const g = cloth?.fabrics[fabric]?.garment
  if (!g) return undefined
  const side = P.loader.get(g.file), model = P.loader.get(g.model)
  return side && model ? { side, model } : undefined
}

function dirty() { return !same(disk, edited) || !same(diskCloth, cloth) }
function told() {
  if (dirty()) say('changed, not saved', 'dirty')
  else say('as the files are', 'ok')
  $<HTMLButtonElement>('#save').disabled = !dirty()
  $<HTMLButtonElement>('#revert').disabled = !dirty()
  for (const b of $('#bodies').children) {
    const name = (b as HTMLElement).dataset.name!
    b.classList.toggle('changed', !same(disk?.bodies[name], edited?.bodies[name]))
  }
}
function address() {
  const q = new URLSearchParams({ game })
  if (found) q.set('file', found.file)
  if (body) q.set('body', body)
  history.replaceState(null, '', `${location.pathname}?${q}`)
}

// ---------------------------------------------------------------- an edit, drawn

// The sheet or the fabrics file handed to the game as edited here, as a file written while it runs.
const stale = { sheet: false, cloth: false }
let flushing = false
async function flush() {
  if (flushing || !found) return
  flushing = true
  try {
    while (stale.sheet || stale.cloth) {
      if (stale.sheet) {
        stale.sheet = false
        written(found.url, JSON.stringify(edited))
        await P.loader.written(found.url)
      }
      if (stale.cloth && found.fabrics) {
        stale.cloth = false
        written(found.fabrics.url, JSON.stringify(cloth))
        await P.loader.written(found.fabrics.url)
        // every fabric of the file is laid again: no time has gone by since
        since = 0
      }
      stale.cloth = false
    }
  } finally {
    flushing = false
  }
  measure()
}
function changed(which: 'sheet' | 'cloth') {
  stale[which] = true
  told()
  flush().catch(fail)
}

// ---------------------------------------------------------------- the readout: cloth against capsules, at rest

// Each piece of a garment's model as its points at rest, in the body's model's frame.
const rests = new WeakMap<object, Record<string, Float32Array>>()
function restOf(model: { scene: THREE.Object3D }) {
  let had = rests.get(model)
  if (!had) {
    had = {}
    model.scene.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    model.scene.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const p = mesh.geometry.getAttribute('position')
      const out = new Float32Array(p.count * 3)
      for (let k = 0; k < p.count; k++) v.fromBufferAttribute(p, k).applyMatrix4(mesh.matrixWorld).toArray(out, k * 3)
      had![mesh.name] = out
    })
    rests.set(model, had)
  }
  return had
}
// A capsule's ends where the body stood as its garment was draped, by the sidecar's `stood`.
function stoodEnds(stood: Record<string, number[]>, c: Capsule): { a: number[]; b: number[]; r: number } | undefined {
  const frame = (bone: string) => { const k = Object.keys(stood).find(n => n.endsWith(bone)); return k ? stood[k] : undefined }
  if ('bone' in c) {
    const f = frame(c.bone)
    if (!f) return undefined
    const a = carried(f, c.at)
    return { a, b: a, r: c.radius }
  }
  const f = frame(c.from), t = frame(c.to)
  return f && t ? { a: carried(f, [0, 0, 0]), b: carried(t, [0, 0, 0]), r: c.radius } : undefined
}
// How far a point is outside a capsule's skin, negative inside it.
function outside(p: Float32Array, k: number, c: { a: number[]; b: number[]; r: number }) {
  const ax = c.a[0], ay = c.a[1], az = c.a[2]
  const bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az
  const px = p[k] - ax, py = p[k + 1] - ay, pz = p[k + 2] - az
  const len2 = bx * bx + by * by + bz * bz
  const t = len2 > 0 ? Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / len2)) : 0
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - c.r
}
function measure() {
  const box = $('#fit')
  box.replaceChildren()
  const b = edited?.bodies[body]
  if (!b || !P) return
  if (!b.wears?.length) { box.textContent = `${body} wears nothing.`; return }
  for (const name of b.wears) {
    const f = cloth?.fabrics[name]
    if (!f) { box.append(el('div', { className: 'bad', textContent: `${name}: the fabrics file has no fabric of that name` })); continue }
    if (!f.garment) { box.append(el('div', { textContent: `${name}: cut as a grid, which is laid from its pins and not draped on the body` })); continue }
    const g = garmentOf(name)
    if (!g) { box.append(el('div', { textContent: `${name}: its garment has not landed yet` })); continue }
    const caps = (b.capsules ?? []).map(c => stoodEnds(g.side.stood, c)).filter(c => !!c)
    const pinned = new Set<string>((f.pins ?? []).map((p: Json) => p.piece))
    const pieces = restOf(g.model)
    let pushedAll = 0, all = 0, deepest = 0
    const lines: HTMLElement[] = []
    for (const piece of g.side.pieces as string[]) {
      const pts = pieces[piece]
      if (!pts) continue
      const gaps: number[] = []
      let pushed = 0, deep = 0
      for (let k = 0; k < pts.length; k += 3) {
        let d = Infinity
        for (const c of caps) d = Math.min(d, outside(pts, k, c))
        gaps.push(d)
        if (d < f.thick) { pushed++; deep = Math.max(deep, f.thick - d) }
      }
      gaps.sort((x, y) => x - y)
      const middle = gaps.length && caps.length ? cm(gaps[gaps.length >> 1]) : 'no capsule'
      if (pinned.has(piece)) lines.push(el('div', { textContent: `${piece}  pinned, ${gaps.length} points held` }))
      else {
        pushedAll += pushed; all += gaps.length; deepest = Math.max(deepest, deep)
        lines.push(el('div', { className: pushed ? 'bad' : 'ok', textContent: `${piece}  ${pushed} of ${gaps.length} pushed${pushed ? `, furthest ${cm(deep)}` : ''}; middle gap ${middle}` }))
      }
    }
    box.append(
      el('div', { className: pushedAll ? 'bad' : 'ok', textContent: `${name}: ${pushedAll} of ${all} loose points pushed${pushedAll ? `, the furthest ${cm(deepest)}` : ''}` }),
      ...lines,
    )
  }
}

// ---------------------------------------------------------------- the right column

type Num = { label: string; unit: string; min: number; max: number; step: number }
// One line: a number's name, its slider and its box, written into `root` at `path`; `from` is what it is
// compared with to show it changed.
function line(root: Json, from: Json | undefined, path: Path, n: Num, which: 'sheet' | 'cloth', after?: () => void): HTMLElement {
  const row = el('div', { className: 'line' })
  const mark = () => row.classList.toggle('changed', !same(at(from, path), at(root, path)))
  const v = at(root, path) as number
  const slide = el('input', { type: 'range', min: String(n.min), max: String(n.max), step: String(n.step), value: String(v) })
  const box = el('input', { type: 'number', step: String(n.step), value: String(v) })
  const set = (x: number) => { put(root, path, round(x, n.step)); mark(); changed(which); after?.() }
  slide.oninput = () => { set(Number(slide.value)); box.value = String(at(root, path)) }
  box.onfocus = () => box.select()
  box.onchange = () => {
    const x = Number(box.value)
    if (box.value.trim() === '' || !Number.isFinite(x)) { box.value = String(at(root, path)); return }
    set(x)
    slide.value = String(at(root, path))
  }
  row.append(el('span', { className: 'lab', textContent: n.label }), slide, box, el('span', { className: 'unit', textContent: n.unit }))
  mark()
  return row
}
// One line: a name picked from a list, written into `root` at `path`.
function pick(root: Json, from: Json | undefined, path: Path, label: string, names: string[], which: 'sheet' | 'cloth'): HTMLElement {
  const row = el('div', { className: 'line' })
  const now = at(root, path) as string
  const all = names.includes(now) ? names : [now, ...names]
  const list = el('select', {}, ...all.map(n => el('option', { value: n, textContent: n, selected: n === now })))
  list.onchange = () => { put(root, path, list.value); row.classList.toggle('changed', !same(at(from, path), at(root, path))); changed(which) }
  row.classList.toggle('changed', !same(at(from, path), now))
  row.append(el('span', { className: 'lab', textContent: label }), list)
  return row
}

const AT: Num[] = ['x', 'y', 'z'].map(a => ({ label: `at ${a}`, unit: 'm', min: -0.6, max: 0.6, step: 0.0001 }))
const TURN: Num[] = ['x', 'y', 'z'].map(a => ({ label: `turn ${a}`, unit: '°', min: -180, max: 180, step: 0.1 }))
const RADIUS: Num = { label: 'radius', unit: 'm', min: 0.01, max: 0.4, step: 0.001 }
const FABRIC: [string, Num][] = [
  ['weight', { label: 'weight', unit: 'kg/m²', min: 0.02, max: 2, step: 0.01 }],
  ['stretch', { label: 'stretch', unit: '', min: 0, max: 1, step: 0.01 }],
  ['bend', { label: 'bend', unit: '', min: 0, max: 1, step: 0.01 }],
  ['drag', { label: 'drag', unit: '/s', min: 0, max: 5, step: 0.05 }],
  ['catch', { label: 'catch', unit: '', min: 0, max: 2, step: 0.01 }],
  ['friction', { label: 'friction', unit: '', min: 0, max: 1, step: 0.01 }],
  ['thick', { label: 'thick', unit: 'm', min: 0, max: 0.08, step: 0.001 }],
]

function numbers() {
  const col = $('#numbers')
  const top = col.scrollTop
  col.replaceChildren()
  const b = edited?.bodies[body], was = disk?.bodies[body] ?? {}
  if (!b || !P) return
  const by = byOf(body)
  const bones = bonesOf(body)
  col.append(el('h3', { textContent: `${body}: ${by ? `drawn by ${by}` : 'drawn by no plugin of this scene'}` }))

  // what it holds
  col.append(el('h3', { textContent: 'Holds' }))
  if (!b.holds?.length) col.append(el('div', { className: 'say', textContent: 'It holds nothing.' }))
  else if (by !== 'crowd3d') {
    col.append(el('div', { className: 'say', textContent: 'A hold picked has a gizmo on it in the view, in its bone\'s frame.' }))
    const modes = el('div', { className: 'picks' })
    for (const [mode, label] of [['translate', 'Move'], ['rotate', 'Rotate']] as const)
      modes.append(el('button', { textContent: label, className: gizmoMode === mode ? 'on' : '', onclick: () => { gizmoMode = mode; gizmo?.setMode(mode); numbers() } }))
    col.append(modes)
  }
  ;(b.holds ?? []).forEach((h: Hold, i: number) => {
    const row = el('div', { className: `row${i === hold ? ' on' : ''}${same(was.holds?.[i], h) ? '' : ' changed'}` })
    row.append(el('h4', { textContent: `${heldName(h)}, ${'item' in h ? 'an item' : 'a model'}` }))
    row.onclick = e => { if ((e.target as HTMLElement).closest('input, select, button')) return; hold = hold === i ? -1 : i; numbers() }
    if ('place' in h) row.append(pick(b, was, ['holds', i, 'place'], 'place', Object.keys(PLACES), 'sheet'))
    else row.append(pick(b, was, ['holds', i, 'bone'], 'bone', bones, 'sheet'))
    AT.forEach((n, k) => row.append(line(b, was, ['holds', i, 'at', k], n, 'sheet')))
    TURN.forEach((n, k) => row.append(line(b, was, ['holds', i, 'turn', k], n, 'sheet')))
    col.append(row)
  })

  // what it wears
  col.append(el('h3', { textContent: 'Wears' }))
  if (!b.wears?.length) col.append(el('div', { className: 'say', textContent: 'It wears nothing.' }))
  for (const name of b.wears ?? []) {
    const f = cloth?.fabrics[name], fWas = diskCloth?.fabrics[name] ?? {}
    col.append(el('h4', { textContent: name }))
    if (!f) { col.append(el('div', { className: 'say', textContent: 'The fabrics file has no fabric of this name.' })); continue }
    const g = garmentOf(name)
    if (f.garment) {
      const pieces: string[] = g?.side.pieces ?? []
      col.append(el('div', { className: 'say', textContent: 'Pins. Each holds a whole piece of the garment stiff on a bone, where it lay from that bone as it was draped. Everything else is cloth.' }))
      ;(f.pins ?? []).forEach((_p: Json, i: number) => {
        const row = el('div', { className: `row${same(fWas.pins?.[i], f.pins[i]) ? '' : ' changed'}` })
        row.append(
          pick(f, fWas, ['pins', i, 'piece'], 'piece', pieces, 'cloth'),
          pick(f, fWas, ['pins', i, 'on'], 'on bone', bones, 'cloth'),
          el('div', { className: 'line' }, el('button', { className: 'small', textContent: 'Take this pin off', onclick: () => { f.pins.splice(i, 1); changed('cloth'); numbers() } })),
        )
        col.append(row)
      })
      const free = pieces.filter(p => !(f.pins ?? []).some((q: Json) => q.piece === p))
      col.append(el('div', { className: 'line' }, el('button', {
        className: 'small', textContent: '+ Pin a piece', disabled: !free.length || !bones.length,
        onclick: () => { (f.pins ??= []).push({ on: bones.includes('Spine2') ? 'Spine2' : bones[0], piece: free[0] }); changed('cloth'); numbers() },
      })))
    }
    col.append(el('div', { className: 'say', textContent: 'The fabric\'s numbers, the fabrics file\'s.' }))
    for (const [key, n] of FABRIC) col.append(line(f, fWas, [key], n, 'cloth'))
  }

  // its capsules
  col.append(el('h3', { textContent: 'Capsules' }))
  if (by === 'crowd3d') col.append(el('div', { className: 'say', textContent: 'A body crowd3d draws has no capsules: its people are posed on the GPU, and cloth is held to bodies anim and motion3d draw.' }))
  else {
    col.append(el('div', { className: 'say', textContent: 'The body as cloth meets it: a capsule between two bones, or a ball on one. Each is drawn over the body, the one picked in amber.' }))
    ;(b.capsules ?? []).forEach((c: Capsule, i: number) => {
      const row = el('div', { className: `row${i === capsule ? ' on' : ''}${same(was.capsules?.[i], c) ? '' : ' changed'}` })
      row.onclick = e => { if ((e.target as HTMLElement).closest('input, select, button')) return; capsule = capsule === i ? -1 : i; numbers() }
      row.append(el('h4', { textContent: 'bone' in c ? `${i + 1}. a ball on ${c.bone}` : `${i + 1}. ${c.from} to ${c.to}` }))
      if ('bone' in c) {
        row.append(pick(b, was, ['capsules', i, 'bone'], 'bone', bones, 'sheet'))
        AT.forEach((n, k) => row.append(line(b, was, ['capsules', i, 'at', k], n, 'sheet')))
      } else row.append(pick(b, was, ['capsules', i, 'from'], 'from', bones, 'sheet'), pick(b, was, ['capsules', i, 'to'], 'to', bones, 'sheet'))
      row.append(
        line(b, was, ['capsules', i, 'radius'], RADIUS, 'sheet'),
        el('div', { className: 'line' }, el('button', { className: 'small', textContent: 'Take it away', onclick: () => { b.capsules!.splice(i, 1); capsule = -1; changed('sheet'); numbers() } })),
      )
      col.append(row)
    })
    const first = bones.includes('Spine2') ? 'Spine2' : bones[0], second = bones.includes('Neck') ? 'Neck' : bones[1]
    col.append(el('div', { className: 'line' },
      el('button', { className: 'small', textContent: '+ Capsule', disabled: bones.length < 2, onclick: () => { capsule = (b.capsules ??= []).push({ from: first, to: second, radius: 0.08 }) - 1; changed('sheet'); numbers() } }),
      el('button', { className: 'small', textContent: '+ Ball', disabled: !bones.length, onclick: () => { capsule = (b.capsules ??= []).push({ bone: first, at: [0, 0, 0], radius: 0.08 }) - 1; changed('sheet'); numbers() } }),
    ))
  }
  col.scrollTop = top
}

function picks() {
  $('#bodies').replaceChildren(...Object.keys(edited!.bodies).map(name => {
    const b = el('button', { textContent: name, className: name === body ? 'on' : '', onclick: () => show(name) })
    b.dataset.name = name
    return b
  }))
}

// The clips the body shown may be played in: its rig's, for a body anim draws; `world.crowd3d.clips`, for one
// crowd3d draws.
function clipsOf(): Record<string, number> {
  const by = byOf(body), w = world()
  if (by === 'anim') {
    const rig = P.loader.get(w.anim.kinds[body].rig)
    return rig ? Object.fromEntries(Object.keys(rig.clips).map(c => [c, rig.table?.[c]?.dur ?? 0])) : {}
  }
  if (by === 'crowd3d') return Object.fromEntries((w.crowd3d.clips as string[]).map(c => [c, 0]))
  return {}
}
function clips() {
  const by = byOf(body), all = clipsOf()
  $('#clipsay').textContent = by === 'motion3d' ? 'motion3d moves this body by its row, so it is drawn as the game plays it.'
    : by === 'crowd3d' ? 'A clip of crowd3d\'s, played on the body\'s own clock.'
    : by === 'anim' ? 'A clip of the body\'s rig, played in place of what its row asks.' : ''
  const names = by === 'motion3d' || !by ? [] : ['', ...Object.keys(all)]
  $('#clips').replaceChildren(...names.map(name =>
    el('button', { textContent: name || 'as the game plays it', className: name === clip ? 'on' : '', onclick: () => { clip = name; clipT = 0; clips() } })))
  const timed = by === 'anim' && !!clip
  $<HTMLButtonElement>('#pause').disabled = !timed
  $<HTMLInputElement>('#time').disabled = !timed
  $('#pause').textContent = paused ? 'Play' : 'Pause'
}

// The solve's buttons as the clock stands.
function solving() {
  const run = $('#run')
  run.textContent = running ? 'Pause' : 'Play'
  run.classList.toggle('on', running)
}

function show(name: string) {
  body = name
  clip = ''
  clipT = 0
  hold = capsule = -1
  framed = false
  // the clock is held again on the frame this body's cloth is laid
  heldFirst = false
  picks()
  clips()
  numbers()
  measure()
  address()
  told()
}

// ---------------------------------------------------------------- the stage: the game's own scene

// The page's own eye: where its orbit has it, which render3d's camera is put at before each frame is drawn.
const eye = new THREE.PerspectiveCamera()
let orbit: OrbitControls | undefined
let framed = false
const was = new THREE.Vector3()
// The capsules drawn over the body: a tube and two balls each, in lines, drawn over everything.
const tubes: { group: THREE.Group; tube: THREE.Mesh; ends: THREE.Mesh[] }[] = []
const LINES = new THREE.MeshBasicMaterial({ color: 0x5bbf7a, wireframe: true, depthTest: false, transparent: true, opacity: 0.55 })
const PICKED = new THREE.MeshBasicMaterial({ color: 0xe0a33a, wireframe: true, depthTest: false, transparent: true, opacity: 0.95 })
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)
const BALL = new THREE.SphereGeometry(1, 16, 10)
// The gizmo on the hold picked: a frame at its bone, the bone's scale taken off, and a proxy in it at the
// hold's `at`, turned by its `turn`.
let gizmo: TransformControls | undefined
let gizmoMode: 'translate' | 'rotate' = 'translate'
const boneFrame = new THREE.Group()
const proxy = new THREE.Object3D()
boneFrame.add(proxy)
let seen = ''
let size = [0, 0]

// Before each frame is drawn: the canvas fitted, the camera put, what is hidden hidden, the capsules and the
// gizmo placed where the bones are drawn.
function before() {
  const r3 = P.render3d
  const cam: THREE.PerspectiveCamera | undefined = r3.camera
  if (!cam || !r3.renderer) return
  const scene: THREE.Scene = r3.scene
  const w = view3d.clientWidth, h = view3d.clientHeight
  if (w && h && (w !== size[0] || h !== size[1])) {
    size = [w, h]
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    r3.renderer.setSize(w, h)
    r3.composer?.setSize(w, h)
  }
  const by = byOf(body), row = rowOf(body)
  // the camera, round the body, going with it
  if (row && orbit) {
    const [x, y, z] = row.data.pos as number[]
    const mid = new THREE.Vector3(x, y + 1.05, z)
    if (!framed) {
      framed = true
      const yaw = typeof row.data.yaw === 'number' ? row.data.yaw : 0
      eye.position.set(mid.x + Math.sin(yaw) * 2.4, mid.y + 0.25, mid.z + Math.cos(yaw) * 2.4)
      orbit.target.copy(mid)
    } else {
      eye.position.add(mid).sub(was)
      orbit.target.add(mid).sub(was)
    }
    was.copy(mid)
    orbit.update()
  }
  cam.position.copy(eye.position)
  cam.quaternion.copy(eye.quaternion)
  cam.updateMatrixWorld(true)

  // what is seen
  const on = (id: string) => $<HTMLInputElement>(id).checked
  const boned = by === 'anim' || by === 'motion3d'
  const root: THREE.Object3D | undefined = row && boned ? P[by].model(row.id) : undefined
  if (root) root.visible = on('#showBody')
  if (row && boned) for (const p of P[by].props(row.id) as THREE.Object3D[]) if (!on('#showHeld')) p.visible = false
  for (const f of (P.fabric3d?.fabrics ?? []) as { of?: string; thing?: string; mesh: THREE.Mesh }[]) if (f.of === body) f.mesh.visible = on('#showWorn')

  // the capsules, where the bones are drawn
  const list: Capsule[] = (row && boned && on('#showCapsules') && edited?.bodies[body]?.capsules) || []
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), way = new THREE.Vector3()
  list.forEach((c, i) => {
    let t = tubes[i]
    if (!t) {
      const group = new THREE.Group(), tube = new THREE.Mesh(TUBE, LINES), ends = [new THREE.Mesh(BALL, LINES), new THREE.Mesh(BALL, LINES)]
      group.add(tube, ...ends)
      group.renderOrder = 10
      for (const m of [tube, ...ends]) m.renderOrder = 10
      tubes[i] = t = { group, tube, ends }
    }
    const end = (bone: string, off: number[]) => {
      const o: THREE.Object3D | undefined = P[by!].socket(row.id, bone)
      return o ? carried(o.matrixWorld.elements, off) : undefined
    }
    const ea = 'bone' in c ? end(c.bone, c.at) : end(c.from, [0, 0, 0]), eb = 'bone' in c ? ea : end(c.to, [0, 0, 0])
    if (!ea || !eb) { t.group.removeFromParent(); return }
    a.fromArray(ea); b.fromArray(eb)
    const len = a.distanceTo(b)
    t.group.position.copy(a).add(b).multiplyScalar(0.5)
    if (len > 1e-6) t.group.quaternion.setFromUnitVectors(up, way.copy(b).sub(a).normalize())
    t.tube.visible = len > 1e-6
    t.tube.scale.set(c.radius, len || 1, c.radius)
    t.ends[0].position.set(0, -len / 2, 0)
    t.ends[1].position.set(0, len / 2, 0)
    for (const e of t.ends) e.scale.setScalar(c.radius)
    t.ends[1].visible = len > 1e-6
    const material = i === capsule ? PICKED : LINES
    for (const m of [t.tube, ...t.ends]) m.material = material
    if (t.group.parent !== scene) scene.add(t.group)
  })
  for (let i = list.length; i < tubes.length; i++) tubes[i].group.removeFromParent()

  // the gizmo, on the hold picked
  const held: Hold | undefined = boned && row ? edited?.bodies[body]?.holds?.[hold] : undefined
  const bone: THREE.Object3D | undefined = held && 'bone' in held ? P[by!].socket(row.id, held.bone) : undefined
  if (held && bone) {
    if (!gizmo) {
      gizmo = new TransformControls(cam, r3.renderer.domElement)
      gizmo.space = 'local'
      gizmo.setSize(0.6)
      gizmo.setMode(gizmoMode)
      gizmo.addEventListener('dragging-changed', e => { if (orbit) orbit.enabled = !e.value; if (!e.value) numbers() })
      gizmo.addEventListener('objectChange', () => {
        const now: Hold | undefined = edited?.bodies[body]?.holds?.[hold]
        if (!now) return
        now.at = proxy.position.toArray().map(v => round(v, 0.0001))
        now.turn = [proxy.rotation.x, proxy.rotation.y, proxy.rotation.z].map(v => round(v / DEG, 0.1))
        changed('sheet')
      })
    }
    const p = new THREE.Vector3(), q = new THREE.Quaternion()
    bone.matrixWorld.decompose(p, q, new THREE.Vector3())
    boneFrame.position.copy(p)
    boneFrame.quaternion.copy(q)
    if (!gizmo.dragging) {
      proxy.position.fromArray(held.at)
      proxy.rotation.set(held.turn[0] * DEG, held.turn[1] * DEG, held.turn[2] * DEG, 'XYZ')
    }
    if (boneFrame.parent !== scene) scene.add(boneFrame)
    boneFrame.updateMatrixWorld(true)
    const helper = gizmo.getHelper()
    if (helper.parent !== scene) scene.add(helper)
    if (gizmo.object !== proxy) gizmo.attach(proxy)
  } else if (gizmo) {
    gizmo.detach()
    gizmo.getHelper().removeFromParent()
    boneFrame.removeFromParent()
  }

  // what has landed since the columns were last built: the body's bones, its garments' pieces
  const landed = `${bonesOf(body).length} ${(edited?.bodies[body]?.wears ?? []).map(n => (garmentOf(n) ? 1 : 0)).join('')} ${Object.keys(clipsOf()).length}`
  if (landed !== seen) {
    seen = landed
    const busy = document.activeElement && $('#numbers').contains(document.activeElement)
    if (!busy) numbers()
    clips()
    measure()
  }
  const d = clipsOf()[clip] ?? 0
  const range = $<HTMLInputElement>('#time')
  if (document.activeElement !== range) range.value = String(d > 0 ? clipT / d : 0)
  $('#clock').textContent = by === 'anim' && clip ? `${clipT.toFixed(2)} s` : ''
  const sub: number | undefined = world().fabric3d?.substep
  $('#solve').textContent = `${running ? 'running' : 'held'}, ${since.toFixed(3)} s since the cloth was laid${sub ? `, ${Math.round(since / sub)} substeps` : ''}`
  $('#hud').textContent = row ? `${body}, row ${row.id}, drawn by ${by}\n${found!.scene} of ${game}, step ${truth.n}` : `${body}: no row of the scene ${found!.scene} is drawn as it`
}

// The plugins of the page's client, three of their functions wrapped (the header, The stage).
let enter = () => {}
const entered = new Promise<void>(done => { enter = done })
function hook(plugins: Json) {
  P = plugins
  enter()
  const r3 = plugins.render3d, draw = r3.afterTick.bind(r3)
  r3.afterTick = (...args: unknown[]) => {
    try { before() } catch (e) { fail(e) }
    return draw(...args)
  }
  if (plugins.anim) {
    const anim = plugins.anim, tick = anim.tick.bind(anim)
    anim.tick = (p: Json) => {
      const out = tick(p)
      const row = byOf(body) === 'anim' && clip ? rowOf(body) : undefined
      if (row && anim.model(row.id)) anim.pose(row.id, clip, clipT)
      return out
    }
  }
  if (plugins.crowd3d) {
    const crowd = plugins.crowd3d, tick = crowd.tick.bind(crowd)
    crowd.tick = (p: Json) => {
      if (byOf(body) === 'crowd3d' && clip) for (const r of p.wire.rows as Json[]) if (world().crowd3d.kinds.includes(r.kind) && r.data.body === body) r.data.clip = clip
      return tick(p)
    }
  }
}

async function build(f: Found) {
  const base = new URL(`/games/${game}/`, location.href).href
  const top = await (await fetch(`${base}${game}.scene.json`)).json()
  if (top.prefabs?.scenemanager?.scenes) top.prefabs.scenemanager.entry = f.scene
  const { sim } = await import(/* @vite-ignore */ `${base}${game}.sim.ts`)
  truth = boot(top, sim)
  await load(truth, base)
  const dt = top.prefabs.engine.dt as number
  page = view(link(loopback(accept(manager(truth)))), top, base, (me: Json) => {
    const canvas = document.createElement('canvas')
    view3d.prepend(canvas)
    me.plugins.render3d.mount(canvas)
    orbit?.dispose()
    orbit = new OrbitControls(eye, canvas)
    framed = false
    size = [0, 0]
    hook(me.plugins)
  })
  for (const [name, d] of Object.entries({ front: [0, 0.1, 1], side: [1, 0.1, 0], back: [0, 0.1, -1], above: [0.001, 1, 0] }))
    $('#views').append(el('button', { textContent: name, onclick: () => {
      if (!orbit) return
      // front is the way the body faces
      const row = rowOf(body), yaw = typeof row?.data.yaw === 'number' ? row.data.yaw : 0
      const far = eye.position.distanceTo(orbit.target)
      const way = new THREE.Vector3(...d).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      eye.position.copy(orbit.target).addScaledVector(way, far)
      orbit.update()
    } }))
  let last = performance.now(), owed = 0
  const frame = async (now = performance.now()) => {
    // the seconds the game's clock goes on this frame: the page's own while it runs, else what Step asked for
    const passed = running ? Math.min((now - last) / 1000, 0.25) : asked
    asked = 0
    owed += passed
    since += passed
    last = now
    try {
      const d = P?.wire ? clipsOf()[clip] ?? 0 : 0
      if (!paused && d > 0) clipT = (clipT + passed) % d
      while (owed >= dt) { truth.step(dt); owed -= dt }
      await page.frame(owed / dt)
      // The clock is held once, on the frame the cloth of the body shown is first made, and that cloth laid
      // again there, so the first thing seen is the cloth as it is laid, before any of it has moved.
      if (!heldFirst && P?.wire && rowOf(body)) {
        const wears = edited?.bodies[body]?.wears ?? []
        const made = (P.fabric3d?.fabrics ?? []) as { fabric: string; of?: string }[]
        if (wears.every(name => made.some(f => f.of === body && f.fabric === name))) {
          heldFirst = true
          running = false
          if (wears.length) { stale.cloth = true; flush().catch(fail) }
          solving()
        }
      }
      clearFail()
    } catch (e) {
      fail(e)
    }
  }
  ;(window as Json).__workshop = { get plugins() { return P }, truth, page, get edited() { return edited }, get cloth() { return cloth }, frame }
  const loop = async (now: number) => { await frame(now); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  // the frames go on until the scene is entered and its plugins are the page's
  await entered
}

// ---------------------------------------------------------------- reading, saving

async function read() {
  const s = await api<Summary>(`/api/item3d/${game}`)
  found = s.sheets.find(f => f.file === (found?.file ?? query.get('file'))) ?? s.sheets[0]
  disk = found.sheet
  edited = structuredClone(disk)
  diskCloth = found.fabrics?.fabrics
  cloth = structuredClone(diskCloth)
  if (!edited.bodies[body]) body = Object.keys(edited.bodies)[0] ?? ''
  $<HTMLSelectElement>('#file').replaceChildren(...s.sheets.map(f => el('option', { value: f.file, textContent: f.file.replace(`games/${game}/`, ''), selected: f.file === found!.file })))
  return s
}
// The files read again and handed to the game as they are.
async function reread() {
  await read()
  stale.sheet = true
  stale.cloth = !!found!.fabrics
  await flush()
  picks()
  numbers()
  told()
}

$<HTMLButtonElement>('#save').onclick = async () => {
  if (!found || !edited || !disk) return
  const lists: { path: Path; items: Json[] }[] = []
  for (const [name, b] of Object.entries(edited.bodies))
    for (const k of ['holds', 'capsules', 'wears'] as const) if (b[k] && !same(disk.bodies[name]?.[k], b[k])) lists.push({ path: ['bodies', name, k], items: b[k]! })
  const fabricLists: { path: Path; items: Json[] }[] = [], edits: { path: Path; value: Json }[] = []
  for (const [name, f] of Object.entries(cloth?.fabrics ?? {})) {
    const fWas = diskCloth!.fabrics[name]
    if (f.pins && !same(fWas.pins, f.pins)) fabricLists.push({ path: ['fabrics', name, 'pins'], items: f.pins })
    for (const [key] of FABRIC) if (!same(fWas[key], f[key])) edits.push({ path: ['fabrics', name, key], value: f[key] })
  }
  try {
    await api(`/api/item3d/${game}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: found.file, lists, ...(fabricLists.length || edits.length ? { fabrics: { lists: fabricLists, edits } } : {}) }),
    })
    disk = structuredClone(edited)
    diskCloth = structuredClone(cloth)
    numbers()
    told()
  } catch (e) {
    say((e as Error).message, 'bad')
  }
}
$<HTMLButtonElement>('#revert').onclick = () => { reread().catch(fail) }
$<HTMLButtonElement>('#drape').onclick = () => { stale.cloth = true; flush().catch(fail) }
$<HTMLButtonElement>('#run').onclick = () => { running = !running; solving() }
// one substep of the cloth, `world.fabric3d.substep` seconds; a scene with no cloth, one step of the game
$<HTMLButtonElement>('#step').onclick = () => {
  running = false
  asked += world().fabric3d?.substep ?? P.wire.scene.prefabs.engine.dt
  solving()
}
$<HTMLButtonElement>('#pause').onclick = () => { paused = !paused; clips() }
$<HTMLInputElement>('#time').oninput = e => { paused = true; clipT = Number((e.target as HTMLInputElement).value) * (clipsOf()[clip] ?? 0); clips() }
$<HTMLSelectElement>('#game').onchange = e => { location.search = `?game=${(e.target as HTMLSelectElement).value}` }
$<HTMLSelectElement>('#file').onchange = e => { location.search = `?${new URLSearchParams({ game, file: (e.target as HTMLSelectElement).value })}` }
addEventListener('beforeunload', e => { if (dirty()) e.preventDefault() })

const games = await api<string[]>('/api/games')
$<HTMLSelectElement>('#game').replaceChildren(el('option', { value: '', textContent: 'game…' }), ...games.map(g => el('option', { value: g, textContent: g, selected: g === game })))
if (!game) say('pick a game')
else {
  try {
    await read()
    body = edited!.bodies[query.get('body') ?? ''] ? query.get('body')! : body
    await build(found!)
    show(body)
    // a file written on disk by anything else is read again when nothing here is unsaved
    new EventSource('/api/events').onmessage = m => {
      if (m.data !== `changed ${found!.file}` && m.data !== `changed ${found!.fabrics?.file}`) return
      if (dirty()) return
      reread().catch(fail)
    }
  } catch (e) {
    say((e as Error).message, 'bad')
    fail(e)
  }
}
