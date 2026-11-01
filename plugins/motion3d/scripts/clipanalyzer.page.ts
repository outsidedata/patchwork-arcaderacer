// The clip analyzer's page (`clipanalyzer.html`, served by `clipanalyzer.ts`): one clip of a rig played
// on its body, raw, held to nothing, with what the bake measured of it over it and along the bottom.
//
// The body is the rig's glb, posed as motion3d's browser half poses it (`motion3d.plugin.ts`): its clip's
// tracks moved to start at 0, a mirrored clip built from its source, the mixer scrubbed, never run, and
// the hips pinned (Pinning: a one-shot that carries travel at their rest across the ground, a loop at
// their rest plus their sway about its steady progress, a one-shot that keeps its turn turned back by
// its curve). Carried, the body's root stands where the clip carries its measured travel and turn
// (`motion3d.clip.ts`'s `rootIn`); held in place, it stays where the clip starts. The clip's frame at its
// start is the world's: its root at the middle, facing +z, its left +x.
//
// The rig is the rig file with what the bake measured laid over it; each clip's `held` and offsets
// are motion3d's bake's (its sidecar's, `<clip>.motion3d.json`).
//
// Over it: the root's path, the spot's path (the bones the clip's `held` names, as they are
// draws them, `spotIn`; the root with none) with its place at the playhead and at each end, each plant of the
// clip's touches where it is held (brighter while it is), and the wall its touches measured
// (`things.face`), its normal out of it. The panel says, and nothing on it changes: the clip's measures;
// its `held` and the offsets the rig stores for the body, which motion3d places a held body by, or that
// it gives no `held`, which stops the bake; and whether the same worked out again from the measures (`rigOffsets`) agree, which
// they do unless the rig was not baked again since. Along the bottom, against the clip's time:
// when each hand and foot is planted, then the heights of the hips, the hands, the lowest toe and the
// spot, then the root's travel ahead and to the left and its turn; a drag on it scrubs the clip.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { at as curveAt, carries, clipOf, type Rig } from '#plugins/motion3d/motion3d.play.ts'
import { drawnAt, endsOf, faceOf, rigOffsets, rootIn, spotIn, type Held, type Offsets } from '#plugins/motion3d/motion3d.clip.ts'

type Source = { game: string; scene: string; kind: string; body: string; rig: string; baked?: string; motion?: string; model: string; anim: { moves: number; turns: number }; label?: string }
// motion3d's bake of a rig: each clip's `held` and each body's offsets.
type Motion = { held: Record<string, Held>; offsets: Record<string, Record<string, Offsets>> }
type Loaded = { source: Source; rig: Rig; motion: Motion; root: THREE.Object3D; animations: THREE.AnimationClip[]; hips: THREE.Object3D | undefined; bind: [THREE.Vector3, THREE.Quaternion] | undefined; mixer: THREE.AnimationMixer }

const DEG = Math.PI / 180
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = {
  rig: $<HTMLSelectElement>('rig'), clip: $<HTMLSelectElement>('clip'), play: $<HTMLButtonElement>('play'), speed: $<HTMLInputElement>('speed'),
  carry: $<HTMLInputElement>('carry'), loop: $<HTMLInputElement>('loop'),
  offsets: $<HTMLPreElement>('offsets'), measures: $<HTMLPreElement>('measures'), find: $<HTMLInputElement>('find'),
  troupe: $<HTMLSelectElement>('troupe'), bake: $<HTMLButtonElement>('bake'), status: $<HTMLDivElement>('status'),
  view: $<HTMLDivElement>('view'), timeline: $<HTMLDivElement>('timeline'), legend: $<HTMLDivElement>('legend'),
}
const say = (text: string, error = false) => { el.status.textContent = text; el.status.className = error ? 'error' : '' }

// ---------------------------------------------------------------- the scene

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(devicePixelRatio)
renderer.shadowMap.enabled = true
renderer.toneMapping = THREE.NeutralToneMapping
el.view.prepend(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x14171d)
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200)
camera.position.set(3.2, 1.8, 3.2)
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 1, 0)
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x30281e, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 2.2)
sun.position.set(4, 8, 3)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 })
scene.add(sun)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.95 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)
const grid = new THREE.GridHelper(40, 80, 0x3a4250, 0x2a303a)
grid.position.y = 0.001
scene.add(grid)
// The clip's frame at its start: ahead, +z, and left, +x.
scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.002, 0), 0.6, 0x6fb3ff, 0.12, 0.06))
scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.002, 0), 0.4, 0xff9f6f, 0.1, 0.05))
const overlay = new THREE.Group()
scene.add(overlay)

const COLOURS = { root: 0x6fb3ff, spot: 0xffd166, begin: 0x7ee081, end: 0xff6b6b, handL: 0xf28fff, handR: 0xb07cff, footL: 0x5ee0d0, footR: 0x4aa3a0, face: 0xffa94d }
el.legend.innerHTML = [
  ['root', 'the root\'s path'], ['spot', 'the spot\'s path, and where it is at the playhead'], ['begin', 'the spot at the first frame'], ['end', 'the spot at the last frame'],
  ['handL', 'the left hand held'], ['handR', 'the right hand held'], ['footL', 'the left foot held'], ['footR', 'the right foot held'], ['face', 'the wall the clip touches, its normal out of it'],
].map(([k, text]) => `<div><span style="background:#${COLOURS[k as keyof typeof COLOURS].toString(16).padStart(6, '0')}"></span>${text}</div>`).join('')

function resize() {
  const w = el.view.clientWidth, h = el.view.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
  const c = timeline, r = el.timeline.getBoundingClientRect()
  c.width = Math.round(r.width * devicePixelRatio)
  c.height = Math.round(r.height * devicePixelRatio)
}

// ---------------------------------------------------------------- the body, as motion3d draws it

const gltf = new GLTFLoader()
gltf.setMeshoptDecoder(MeshoptDecoder)
let loaded: Loaded | undefined
let drawn: { clip: string; action: THREE.AnimationAction; pos?: THREE.Interpolant; quat?: THREE.Interpolant; start: THREE.Vector3; end: THREE.Vector3; dur: number } | undefined
const swap = (name: string) => name.replace(/Left|Right/g, s => (s === 'Left' ? 'Right' : 'Left'))

async function load(source: Source) {
  say(`loading ${source.label ?? source.rig} ...`)
  const get = (url: string | undefined, none: unknown) => (url ? fetch(url).then(r => r.json()) : Promise.resolve(none))
  const [written, measured, motion, model] = await Promise.all([get(source.rig, {}), get(source.baked, {}), get(source.motion, { held: {}, offsets: {} }) as Promise<Motion>, gltf.loadAsync(source.model)])
  const rig = { ...written, ...measured } as Rig
  if (loaded) scene.remove(loaded.root)
  const root = model.scene
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false } })
  scene.add(root)
  // The hips: the bone the clips key with no bone above it.
  let hips: THREE.Object3D | undefined
  for (const clip of model.animations) for (const t of clip.tracks) {
    if (hips) break
    const node = THREE.PropertyBinding.findNode(root, THREE.PropertyBinding.parseTrackName(t.name).nodeName) as THREE.Object3D | null
    if (node && (node as THREE.Bone).isBone && !(node.parent as THREE.Bone | null)?.isBone) hips = node
  }
  loaded = { source, rig, motion, root, animations: model.animations, hips, bind: hips && [hips.position.clone(), hips.quaternion.clone()], mixer: new THREE.AnimationMixer(root) }
  drawn = undefined
  el.clip.innerHTML = Object.keys(rig.clips).map(n => `<option>${n}</option>`).join('')
  say('')
}

// The clip's tracks moved to start at 0, a mirrored clip built from its source (as `motion3d.plugin.ts` builds it).
function choose(name: string) {
  const L = loaded!
  const c = clipOf(L.rig, name)
  const src = L.animations.find(a => a.name === c.source)
  if (!src) throw new Error(`the model has no animation ${c.source}`)
  const first = Math.min(...src.tracks.map(t => t.times[0]))
  const tracks = src.tracks.map(t => {
    const m = t.clone()
    m.shift(-first)
    if (!c.mirrored) return m
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name)
    m.name = `${swap(nodeName)}.${propertyName}`
    const v = m.values
    if (propertyName === 'position') for (let i = 0; i < v.length; i += 3) v[i] = -v[i]
    if (propertyName === 'quaternion') for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2] }
    return m
  })
  L.mixer.stopAllAction()
  L.mixer.uncacheRoot(L.root)
  L.mixer = new THREE.AnimationMixer(L.root)
  const clip = new THREE.AnimationClip(name, -1, tracks)
  const action = L.mixer.clipAction(clip)
  action.play()
  // The hips' tracks, sampled as the mixer samples them.
  const track = (prop: string) => (L.hips ? tracks.find(t => t.name === `${L.hips!.name}.${prop}`) : undefined) as (THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }) | undefined
  const pos = track('position')?.createInterpolant(), quat = track('quaternion')?.createInterpolant()
  const sample = (t: number) => (pos ? new THREE.Vector3().fromArray(pos.evaluate(t)) : new THREE.Vector3())
  drawn = { clip: name, action, pos, quat, start: sample(0), end: sample(clip.duration), dur: c.dur }
  playhead = 0
  measure()
}

// The body posed `t` seconds in, its hips pinned as `motion3d.plugin.ts`'s `pin` pins them, and its
// root where the clip carries it, or where it starts.
function pose(t: number) {
  const L = loaded!, D = drawn!
  const c = clipOf(L.rig, D.clip)
  const anim = L.source.anim
  D.action.time = t
  L.mixer.update(0)
  if (L.hips && L.bind) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(L.hips.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize()
    const vert = (v: THREE.Vector3) => up.clone().multiplyScalar(v.dot(up))
    const flat = (v: THREE.Vector3) => v.clone().sub(vert(v))
    const h = D.pos ? new THREE.Vector3().fromArray(D.pos.evaluate(t)) : L.bind[0].clone()
    const how = carries(c, anim)
    let x = h
    if (c.loop) x = flat(L.bind[0]).add(flat(h.clone().sub(D.start.clone().lerp(D.end, t / D.dur)))).add(vert(h))
    else if (how.carries) x = flat(L.bind[0]).add(vert(h))
    // Written every frame from the sampled tracks, since the mixer writes a bone only when its value moved.
    let q = D.quat ? new THREE.Quaternion().fromArray(D.quat.evaluate(t)) : L.bind[1].clone()
    if (how.turns) q = new THREE.Quaternion().setFromAxisAngle(up, -curveAt(c.measure, t)[2] * DEG).multiply(q)
    L.hips.position.copy(x)
    L.hips.quaternion.copy(q)
  }
  const r = el.carry.checked ? rootIn(L.rig, anim, D.clip, t) : { at: [0, 0, 0], turn: 0 }
  L.root.position.set(r.at[0], r.at[1], r.at[2])
  L.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.turn)
  L.root.updateMatrixWorld(true)
}

// ---------------------------------------------------------------- what the bake measured

const STEPS = 160
type Series = { t: number[]; hips: number[]; hands: number[]; toe: number[]; spot: number[]; forward: number[]; left: number[]; turn: number[] }
let series: Series | undefined
let spotPath: number[][] = []
const fmt = (v: number[]) => `[${v.map(x => x.toFixed(3)).join(', ')}]`
const same = (a: Offsets, b: Offsets) => JSON.stringify(a) === JSON.stringify(b)

function measure() {
  const L = loaded!, D = drawn!
  const { rig, source: { body, anim } } = L
  const c = clipOf(rig, D.clip)
  let held: Held | undefined, missing = ''
  const judge = (clip: string): Held => {
    const h = L.motion.held[clip]
    if (!h) throw new Error(`motion3d's bake gives no held of ${clip}: its clip has no sidecar (<clip>.motion3d.json beside its FBX)`)
    return h
  }
  try { held = judge(D.clip) } catch (e) { missing = (e as Error).message }
  const spot = held?.spot ?? []
  const s: Series = { t: [], hips: [], hands: [], toe: [], spot: [], forward: [], left: [], turn: [] }
  spotPath = []
  const rootPath: number[][] = []
  for (let i = 0; i <= STEPS; i++) {
    const t = (c.dur * i) / STEPS
    s.t.push(t)
    s.hips.push(drawnAt(rig, body, anim, D.clip, 'torso', t)[1])
    s.hands.push((drawnAt(rig, body, anim, D.clip, 'handL', t)[1] + drawnAt(rig, body, anim, D.clip, 'handR', t)[1]) / 2)
    s.toe.push(Math.min(endsOf(rig, body, D.clip, 'footL', t)[4], endsOf(rig, body, D.clip, 'footR', t)[4]))
    const p = spotIn(rig, body, anim, D.clip, spot, t)
    spotPath.push(p)
    s.spot.push(p[1])
    const [f, l, turn] = curveAt(c.measure, t)
    s.forward.push(f * c.scale)
    s.left.push(l * c.scale)
    s.turn.push(turn)
    rootPath.push(rootIn(rig, anim, D.clip, t).at)
  }
  series = s
  // The overlay: the root's path, the spot's path and its ends, the plants and the wall.
  overlay.clear()
  const line = (pts: number[][], colour: number) => overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], p[1] + 0.003, p[2]))), new THREE.LineBasicMaterial({ color: colour })))
  const ball = (p: number[], colour: number, r: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9 }))
    m.position.set(p[0], p[1], p[2])
    overlay.add(m)
    return m
  }
  line(rootPath, COLOURS.root)
  line(spotPath, COLOURS.spot)
  ball(spotPath[0], COLOURS.begin, 0.035)
  ball(spotPath[spotPath.length - 1], COLOURS.end, 0.035)
  now = ball(spotPath[0], COLOURS.spot, 0.03)
  plants = []
  const touch = rig.touches?.[body]?.[c.source]
  for (const p of touch?.plants ?? []) {
    if (p.on === 'still') continue
    // A mirrored clip's plants are its source's, the left's the right's.
    const side = /L$/.test(p.point) !== c.mirrored ? 'L' : 'R'
    const limb = `${/^(hand|grip|palm)/.test(p.point) ? 'hand' : 'foot'}${side}` as 'handL' | 'handR' | 'footL' | 'footR'
    const at = c.mirrored ? [-p.at[0], p.at[1], p.at[2]] : p.at
    plants.push({ mesh: ball(at, COLOURS[limb], 0.022), from: p.from, to: p.to })
  }
  const face = faceOf(rig, body, D.clip)
  if (face) {
    const n = new THREE.Vector3(Math.sin(face.normal * DEG), 0, Math.cos(face.normal * DEG))
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 3.5), new THREE.MeshBasicMaterial({ color: COLOURS.face, transparent: true, opacity: 0.18, side: THREE.DoubleSide }))
    wall.position.set(face.at[0], 1.75, face.at[1])
    wall.lookAt(wall.position.clone().add(n))
    overlay.add(wall)
    overlay.add(new THREE.ArrowHelper(n, new THREE.Vector3(face.at[0], 1.2, face.at[1]), 0.6, COLOURS.face, 0.12, 0.06))
  }
  // The panel.
  const how = carries(c, anim)
  const m = c.measure
  el.measures.textContent = [
    `${D.clip}${c.mirrored ? ` (mirrors ${c.source})` : ''}: ${c.dur.toFixed(3)} s, ${c.loop ? 'a loop' : 'a one-shot'}`,
    `it ${how.carries ? 'carries its travel' : 'carries no travel'}${how.turns ? ' and keeps its turn' : ''}`,
    `travel: ${(m.forward * c.scale).toFixed(3)} m ahead, ${(m.left * c.scale).toFixed(3)} m left, turned ${m.yaw.toFixed(1)}°`,
    m.rise !== undefined ? `hips: ${m.height?.toFixed(3)} m high at the start, rise ${m.rise.toFixed(3)} m, dip ${m.low?.toFixed(3)} m` : '',
    `planted: ${(touch?.plants ?? []).filter(p => p.on !== 'still').map(p => `${p.point} ${p.from.toFixed(2)}–${p.to.toFixed(2)} s on ${p.on}`).join('; ') || 'nothing'}`,
    face ? `touches a wall at [${face.at.map(v => v.toFixed(3)).join(', ')}], its normal ${face.normal.toFixed(1)}°` : 'touches no wall',
  ].filter(Boolean).join('\n')
  // The truth: the clip's `held` and the offsets the rig stores for this body, which motion3d places a
  // held body by; then the same worked out again from the measures here, which differ only when the rig
  // was not baked again since its measures or its `held` changed.
  const moves = `the spot moves ${fmt(spotPath[spotPath.length - 1].map((v, i) => v - spotPath[0][i]))} m from its first frame to its last`
  if (!held) {
    el.offsets.textContent = [missing, 'the bake stops on it, and motion3d places nothing by it', '', 'the spot drawn is the root', moves].join('\n')
  } else {
    const stored = L.motion.offsets[body]?.[D.clip]
    let fresh: Offsets | undefined, error = ''
    try { fresh = rigOffsets(rig, anim, judge)[body]?.[D.clip] } catch (e) { error = (e as Error).message }
    const show = (o: Offsets) => [
      `beginOffset ${fmt(o.beginOffset)}`,
      `endOffset   ${fmt(o.endOffset)}`,
      `beginTurn   ${o.beginTurn.toFixed(2)}°`,
      o.normal ? `normal      ${fmt(o.normal)}` : 'normal      straight up',
    ]
    el.offsets.textContent = [
      `held: ${JSON.stringify(held)}`,
      `the spot: ${spot.length ? spot.join(', ') : 'the root'}`,
      '',
      ...(stored ? show(stored) : ['the rig stores no offsets for this clip on this body: motion3d stops on it; bake it again']),
      '',
      error ? `worked out again from the measures: ${error}`
        : !fresh ? 'worked out again from the measures: none'
        : stored && same(stored, fresh) ? 'worked out again from the measures: the same'
        : ['worked out again from the measures, NOT what the rig stores: bake it again', ...show(fresh)].join('\n'),
      '',
      moves,
    ].join('\n')
  }
}
let now: THREE.Mesh | undefined
let plants: { mesh: THREE.Mesh; from: number; to: number }[] = []

// ---------------------------------------------------------------- the timeline

const timeline = document.createElement('canvas')
el.timeline.append(timeline)
const LANES: [string, keyof typeof COLOURS][] = [['left hand', 'handL'], ['right hand', 'handR'], ['left foot', 'footL'], ['right foot', 'footR']]

function drawTimeline() {
  const g = timeline.getContext('2d')!
  const W = timeline.width, H = timeline.height, k = devicePixelRatio
  g.clearRect(0, 0, W, H)
  if (!loaded || !drawn || !series) return
  const c = clipOf(loaded.rig, drawn.clip)
  const left = 120 * k, right = W - 12 * k
  const x = (t: number) => left + ((right - left) * t) / c.dur
  g.font = `${11 * k}px ui-monospace, monospace`
  g.textBaseline = 'middle'
  // The plants, a lane each.
  const touch = loaded.rig.touches?.[loaded.source.body]?.[c.source]
  const lane = 14 * k
  LANES.forEach(([name, limb], i) => {
    const y = 8 * k + i * lane
    g.fillStyle = '#8a93a3'
    g.fillText(name, 8 * k, y + lane / 2)
    g.fillStyle = '#1b2029'
    g.fillRect(left, y + 2 * k, right - left, lane - 4 * k)
    for (const p of touch?.plants ?? []) {
      if (p.on === 'still') continue
      const side = /L$/.test(p.point) !== c.mirrored ? 'L' : 'R'
      const kind = /^(hand|grip|palm)/.test(p.point) ? 'hand' : 'foot'
      if (`${kind}${side}` !== limb) continue
      g.fillStyle = `#${COLOURS[limb].toString(16).padStart(6, '0')}`
      g.fillRect(x(p.from), y + 2 * k, Math.max(2 * k, x(p.to) - x(p.from)), lane - 4 * k)
    }
  })
  // The curves: heights, then travel and turn, each on its own scale.
  const plot = (top: number, height: number, curves: [string, number[], string][], unit: string) => {
    const all = curves.flatMap(([, v]) => v)
    let lo = Math.min(0, ...all), hi = Math.max(...all)
    if (hi - lo < 1e-6) hi = lo + 1
    const y = (v: number) => top + height - ((v - lo) / (hi - lo)) * height
    g.strokeStyle = '#2a303b'
    g.beginPath(); g.moveTo(left, y(0)); g.lineTo(right, y(0)); g.stroke()
    g.fillStyle = '#8a93a3'
    g.fillText(`${hi.toFixed(2)} ${unit}`, 8 * k, top + 6 * k)
    g.fillText(`${lo.toFixed(2)} ${unit}`, 8 * k, top + height - 6 * k)
    curves.forEach(([name, v, colour], i) => {
      g.strokeStyle = colour
      g.lineWidth = 1.5 * k
      g.beginPath()
      v.forEach((val, j) => (j ? g.lineTo(x(series!.t[j]), y(val)) : g.moveTo(x(series!.t[j]), y(val))))
      g.stroke()
      g.fillStyle = colour
      g.fillText(name, 8 * k, top + (18 + i * 13) * k)
    })
  }
  const top = 8 * k + LANES.length * lane + 6 * k
  const rest = H - top - 8 * k
  plot(top, rest * 0.58, [['hips', series.hips, '#d7dce4'], ['hands', series.hands, '#f28fff'], ['lowest toe', series.toe, '#5ee0d0'], ['spot', series.spot, '#ffd166']], 'm')
  plot(top + rest * 0.62, rest * 0.38, [['ahead', series.forward, '#6fb3ff'], ['left', series.left, '#ff9f6f'], ['turn /100°', series.turn.map(v => v / 100), '#7ee081']], '')
  // The playhead.
  g.strokeStyle = '#ffffff'
  g.lineWidth = 1 * k
  g.beginPath(); g.moveTo(x(playhead), 0); g.lineTo(x(playhead), H); g.stroke()
  g.fillStyle = '#ffffff'
  g.fillText(`${playhead.toFixed(3)} s`, Math.min(x(playhead) + 4 * k, right - 60 * k), H - 8 * k)
}

let dragging = false
const scrub = (e: PointerEvent) => {
  if (!loaded || !drawn) return
  const r = timeline.getBoundingClientRect()
  const c = clipOf(loaded.rig, drawn.clip)
  playhead = Math.max(0, Math.min(c.dur, ((e.clientX - r.left - 120) / (r.width - 132)) * c.dur))
  playing = false
  el.play.textContent = 'Play'
}
timeline.addEventListener('pointerdown', e => { dragging = true; timeline.setPointerCapture(e.pointerId); scrub(e) })
timeline.addEventListener('pointermove', e => { if (dragging) scrub(e) })
timeline.addEventListener('pointerup', () => { dragging = false })

// ---------------------------------------------------------------- the panel and the loop

let sources: Source[] = []
let troupe: string[] = []
let playhead = 0, playing = true

function listTroupe() {
  const words = el.find.value.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = troupe.filter(p => words.every(w => p.toLowerCase().includes(w))).slice(0, 400)
  el.troupe.innerHTML = shown.map(p => `<option value="${p.replace(/"/g, '&quot;')}">${p.replace(/^packs\//, '')}</option>`).join('')
}

function listRigs(select?: number) {
  el.rig.innerHTML = sources.map((s, i) => `<option value="${i}">${s.label ?? `${s.game} / ${s.scene}: ${s.kind}`}</option>`).join('')
  if (select !== undefined) el.rig.value = String(select)
}

async function pick(i: number, clip?: string) {
  try {
    await load(sources[i])
    if (clip) el.clip.value = clip
    choose(el.clip.value)
  } catch (e) {
    say((e as Error).message, true)
  }
}

el.rig.addEventListener('change', () => pick(Number(el.rig.value)))
el.clip.addEventListener('change', () => { try { choose(el.clip.value) } catch (e) { say((e as Error).message, true) } })
el.play.addEventListener('click', () => { playing = !playing; el.play.textContent = playing ? 'Pause' : 'Play' })
el.find.addEventListener('input', listTroupe)
el.bake.addEventListener('click', async () => {
  const clip = el.troupe.value
  const from = sources[Number(el.rig.value)]
  if (!clip || !from) return say('pick a clip from the troupe collection, and the body to bake it onto', true)
  say(`baking ${clip} onto ${from.body} (Blender) ...`)
  el.bake.disabled = true
  try {
    const r = await fetch('/@clipanalyzer/bake', { method: 'POST', body: JSON.stringify({ rig: from.rig, baked: from.baked, body: from.body, clip }) })
    const got = await r.json()
    if (!r.ok) throw new Error(got.error)
    sources.push({ ...from, rig: got.rig, baked: undefined, motion: got.motion, model: got.model, label: `baked: ${clip.replace(/^packs\//, '')} on ${from.body}` })
    listRigs(sources.length - 1)
    await pick(sources.length - 1, got.clip)
    say(`baked ${clip}`)
  } catch (e) {
    say((e as Error).message, true)
  } finally {
    el.bake.disabled = false
  }
})

let last = performance.now()
function frame(now_: number) {
  const dt = Math.min(0.1, (now_ - last) / 1000)
  last = now_
  if (loaded && drawn) {
    const c = clipOf(loaded.rig, drawn.clip)
    if (playing) {
      playhead += dt * Math.max(0.05, Number(el.speed.value) || 1) * c.rate
      if (playhead > c.dur) playhead = el.loop.checked ? playhead % c.dur : c.dur
    }
    pose(playhead)
    const i = Math.round((playhead / c.dur) * STEPS)
    if (now && spotPath[i]) now.position.set(spotPath[i][0], spotPath[i][1], spotPath[i][2])
    for (const p of plants) (p.mesh.material as THREE.MeshBasicMaterial).opacity = playhead >= p.from && playhead <= p.to ? 1 : 0.25
  }
  orbit.update()
  renderer.render(scene, camera)
  drawTimeline()
  requestAnimationFrame(frame)
}

addEventListener('resize', resize)
resize()
const got = await fetch('/@clipanalyzer/sources').then(r => r.json())
sources = got.rigs
troupe = got.troupe
listRigs()
listTroupe()
if (sources.length) await pick(0)
else say('no game draws a body', true)
requestAnimationFrame(frame)
