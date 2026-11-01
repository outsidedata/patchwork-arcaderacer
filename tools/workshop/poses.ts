// The pose lab (`/poses` of the workshop's server): a body posed by hand, a pose at a time, and the poses
// written as one clip, a frame a pose, as every clip of the packs is one clip of an FBX. A pose is a clip
// and a frame: this makes a clip whose every frame is a pose, and a game holds any frame of any clip
// the same way.
//
// The body is one of the library's rigged characters (`/api/characters`), its FBX loaded by three as it
// stands at the origin. Its poses are listed on the left, each a name; the one chosen is drawn. A joint
// clicked is chosen and turned by the gizmo, about its own axes; the hips are moved too. Each pose holds
// every bone's turn in its parent's frame and the hips' place, as the body's bones hold them. A pose is
// added at rest, as a copy of the one chosen, or from a frame of any clip of the packs (`/api/packs`),
// laid on this body as anim's export lays a clip (`retarget.ts`); a frame is a key of the clip's hips.
//
// The tween draws two poses mixed: each bone's turn slerped from the one to the other, the hips' place
// straight between them, by the slider, or played to and fro over a second. That is what anim, motion3d
// and crowd3d draw while they fade from one clip to another.
//
// Save writes the clip, `poses/<name>.fbx` of the packs folder, and its sidecar, `<name>.poses.json`,
// frame to pose name (`POST /api/poses`, `poses.export.py`): each pose as each bone's turn in the world
// and the hips' place, and the body at rest the same, which the export carries into Blender's world on
// the same character. A clip the lab made is opened again from the clip list: each of its named frames,
// laid on the body chosen, is a pose under its name.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { boneName, restOf, retarget } from './retarget.ts'

type Pose = { name: string; q: Record<string, number[]>; hips: number[] } // each bone's turn in its parent's frame, and the hips' place
type Character = { name: string; fbx: string }
type Saved = { name: string; fbx: string; poses: Record<string, string> }

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const view = $('#view')
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `${url}: ${r.status}`)
  return j
}
function fail(e: unknown) {
  console.error(e)
  const el = $('#error')
  el.textContent = String((e as Error)?.message ?? e)
  el.style.display = 'block'
}
const clearFail = () => { $('#error').style.display = 'none' }
function say(text: string, how: '' | 'ok' | 'bad' = '') {
  const el = $('#state')
  el.textContent = text
  el.className = how
}

// ---------------------------------------------------------------- the stage

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(devicePixelRatio)
renderer.toneMapping = THREE.NeutralToneMapping
view.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1b1d21')
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
const sun = new THREE.DirectionalLight('#ffffff', 1.6)
sun.position.set(2, 4, 3)
scene.add(sun, new THREE.HemisphereLight('#cfd8ff', '#3a3228', 0.6))
const grid = new THREE.GridHelper(4, 8, '#3d4048', '#2a2c31')
scene.add(grid)
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100)
camera.position.set(1.6, 1.4, 3.2)
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 0.9, 0)
orbit.update()
const gizmo = new TransformControls(camera, renderer.domElement)
gizmo.setSpace('local')
gizmo.setSize(0.7)
scene.add(gizmo.getHelper())
gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value })

function resize() {
  const { clientWidth: w, clientHeight: h } = view
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// ---------------------------------------------------------------- the body

const fbx = new FBXLoader()
let model: THREE.Group | undefined
let body: Character | undefined
let bones = new Map<string, THREE.Bone>() // by name without the prefix, each the first of its name
let hipsName = ''
let rest: Pose = { name: '', q: {}, hips: [0, 0, 0] }
const joints = new THREE.Group()
scene.add(joints)
const dot = new THREE.SphereGeometry(1, 12, 8)
const dim = new THREE.MeshBasicMaterial({ color: '#5bbf7a', depthTest: false, transparent: true, opacity: 0.8 })
const lit = new THREE.MeshBasicMaterial({ color: '#e0a33a', depthTest: false })

// Every bone's turn and the hips' place, as the body holds them now.
function read(name: string): Pose {
  const q: Record<string, number[]> = {}
  for (const [n, b] of bones) q[n] = b.quaternion.toArray()
  return { name, q, hips: bones.get(hipsName)!.position.toArray() }
}
// The body put in a pose: each bone it turns, the rest at rest.
function apply(p: Pose) {
  for (const [n, b] of bones) b.quaternion.fromArray(p.q[n] ?? rest.q[n])
  bones.get(hipsName)!.position.fromArray(p.hips)
  model!.updateMatrixWorld(true)
}

async function load(c: Character) {
  clearFail()
  say(`loading ${c.name}…`)
  const g = await fbx.loadAsync('/library/' + c.fbx.split('/').map(encodeURIComponent).join('/'))
  if (model) scene.remove(model)
  gizmo.detach()
  joints.clear()
  model = g
  body = c
  // A Mixamo character is drawn in centimetres: the lab draws it in metres.
  const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3())
  if (size.y > 10) g.scale.setScalar(0.01)
  g.traverse(o => {
    const m = o as THREE.Mesh
    if (m.isMesh) { m.castShadow = true; m.frustumCulled = false }
  })
  scene.add(g)
  bones = new Map()
  g.traverse(o => { if ((o as THREE.Bone).isBone && !bones.has(boneName(o.name))) bones.set(boneName(o.name), o as THREE.Bone) })
  const hips = [...bones.values()].find(b => !(b.parent as THREE.Bone | null)?.isBone)
  if (!hips) throw new Error(`${c.name} has no skeleton`)
  hipsName = boneName(hips.name)
  rest = read('rest')
  for (const [n, b] of bones) {
    const j = new THREE.Mesh(dot, dim)
    j.scale.setScalar(n === hipsName ? 0.035 : 0.018)
    j.userData.bone = n
    j.renderOrder = 10
    joints.add(j)
    b.userData.joint = j
  }
  g.updateMatrixWorld(true)
  say(`${c.name}: ${bones.size} bones`)
}

// ---------------------------------------------------------------- the poses

let poses: Pose[] = []
let chosen = -1
let bone: string | undefined
let tweening = false, playing = false
let mix = 0

const nameOf = (base: string) => {
  let n = base, i = 2
  while (poses.some(p => p.name === n)) n = `${base}${i++}`
  return n
}

function choose(i: number) {
  chosen = i
  tweening = false
  $('[data-act=tween]').classList.remove('on')
  if (poses[i]) apply(poses[i])
  else if (model) apply(rest)
  attach()
  list()
}

function add(p: Pose) {
  poses.push(p)
  choose(poses.length - 1)
}

function list() {
  const el = $('#poses')
  el.innerHTML = ''
  if (!poses.length) el.innerHTML = '<div class="say">No poses yet.</div>'
  poses.forEach((p, i) => {
    const row = document.createElement('div')
    row.className = 'pose' + (i === chosen ? ' sel' : '')
    row.innerHTML = `<span class="at">${i}</span><input type="text" spellcheck="false"><button data-up>↑</button><button data-down>↓</button><button data-drop>×</button>`
    const input = row.querySelector('input')!
    input.value = p.name
    input.onchange = () => { p.name = input.value.trim() || p.name; list(); tweens() }
    row.onclick = e => { if (e.target === row || (e.target as HTMLElement).classList.contains('at')) choose(i) }
    input.onfocus = () => { if (chosen !== i) choose(i) }
    const move = (to: number) => {
      if (to < 0 || to >= poses.length) return
      ;[poses[i], poses[to]] = [poses[to], poses[i]]
      choose(to)
    }
    ;(row.querySelector('[data-up]') as HTMLElement).onclick = () => move(i - 1)
    ;(row.querySelector('[data-down]') as HTMLElement).onclick = () => move(i + 1)
    ;(row.querySelector('[data-drop]') as HTMLElement).onclick = () => {
      poses.splice(i, 1)
      choose(Math.min(i, poses.length - 1))
    }
    el.appendChild(row)
  })
  tweens()
}

function tweens() {
  for (const id of ['#from', '#to']) {
    const s = $<HTMLSelectElement>(id)
    const was = s.value
    s.innerHTML = poses.map((p, i) => `<option value="${i}">${i} ${p.name}</option>`).join('')
    if (was && Number(was) < poses.length) s.value = was
    else if (id === '#to' && poses.length > 1) s.value = '1'
  }
}

// The gizmo on the joint chosen, while a pose is drawn by itself.
function attach() {
  for (const j of joints.children) (j as THREE.Mesh).material = j.userData.bone === bone ? lit : dim
  $('#bone').textContent = bone ?? 'none'
  const b = bone && bones.get(bone)
  if (!b || tweening || !poses[chosen]) return gizmo.detach()
  if (gizmo.mode === 'translate' && bone !== hipsName) gizmo.setMode('rotate')
  modes()
  gizmo.attach(b)
}
function modes() {
  for (const m of document.querySelectorAll<HTMLElement>('[data-mode]')) {
    m.classList.toggle('on', m.dataset.mode === gizmo.mode)
    if (m.dataset.mode === 'translate') (m as HTMLButtonElement).disabled = bone !== hipsName
  }
}
gizmo.addEventListener('objectChange', () => {
  const p = poses[chosen]
  if (!p || !bone) return
  const b = bones.get(bone)!
  p.q[bone] = b.quaternion.toArray()
  if (bone === hipsName) p.hips = b.position.toArray()
})

// Two poses mixed, as the plugins fade one clip into another: each bone slerped, the hips straight between.
function drawMix(a: Pose, b: Pose, u: number) {
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion()
  for (const [n, bn] of bones) bn.quaternion.slerpQuaternions(qa.fromArray(a.q[n] ?? rest.q[n]), qb.fromArray(b.q[n] ?? rest.q[n]), u)
  bones.get(hipsName)!.position.fromArray(a.hips).lerp(new THREE.Vector3().fromArray(b.hips), u)
  model!.updateMatrixWorld(true)
}

// ---------------------------------------------------------------- a pose from a clip's frame

let packs: { pack: string; clips: string[] }[] = []
const clipCache = new Map<string, Promise<THREE.Group>>()
const fbxOf = (url: string) => {
  let got = clipCache.get(url)
  if (!got) {
    got = fbx.loadAsync(url)
    clipCache.set(url, got)
    got.catch(() => clipCache.delete(url))
  }
  return got
}
const packUrl = (rel: string) => '/packs/' + rel.split('/').map(encodeURIComponent).join('/')

// A clip of the packs laid on the body, and the time of each of its frames: 30 a second from its first
// key, as anim's export samples a clip.
const FPS = 30
async function laid(rel: string) {
  const g = await fbxOf(packUrl(rel))
  const raw = g.animations[0]
  if (!raw) throw new Error(`${rel} holds no clip`)
  const clip = retarget(raw, restOf(g), restOf(model!), rel)
  if (!clip.tracks.length) throw new Error(`${rel} turns none of ${body!.name}'s bones`)
  const first = Math.min(...clip.tracks.map(t => t.times[0]))
  const n = Math.round((clip.duration - first) * FPS) + 1
  return { clip, times: Array.from({ length: n }, (_, f) => first + f / FPS) }
}

// The body as the clip draws it at each time given, each read as a pose, its hips held over their rest
// across the ground (a pose stands where its row stands, as a clip's travel is the row's); the body put
// back after.
function sampled(clip: THREE.AnimationClip, at: number[], names: string[]): Pose[] {
  const mixer = new THREE.AnimationMixer(model!)
  const action = mixer.clipAction(clip)
  action.play()
  const out = at.map((t, i) => {
    apply(rest)
    action.time = t
    mixer.update(0)
    const p = read(names[i])
    p.hips = [rest.hips[0], p.hips[1], rest.hips[2]]
    return p
  })
  mixer.stopAllAction()
  mixer.uncacheRoot(model!)
  if (poses[chosen]) apply(poses[chosen])
  else apply(rest)
  return out
}

async function frames() {
  const rel = `${$<HTMLSelectElement>('#pack').value}/${$<HTMLSelectElement>('#clip').value}`
  $('#frames').textContent = ''
  if (!model || !$<HTMLSelectElement>('#clip').value) return
  try {
    const { times } = await laid(rel)
    $('#frames').textContent = `0 to ${times.length - 1}`
    $<HTMLInputElement>('#frame').max = String(times.length - 1)
  } catch (e) { fail(e) }
}

function fillPacks() {
  const p = $<HTMLSelectElement>('#pack')
  p.innerHTML = packs.map(x => `<option>${x.pack}</option>`).join('')
  fillClips()
}
function fillClips() {
  const pack = packs.find(x => x.pack === $<HTMLSelectElement>('#pack').value)
  $<HTMLSelectElement>('#clip').innerHTML = (pack?.clips ?? []).map(c => `<option>${c}</option>`).join('')
  void frames()
}

// ---------------------------------------------------------------- saving and opening

let saved: Saved[] = []

// Each pose as each bone's turn in the world and the hips' place, the body at rest the same.
function worldOf(p: Pose) {
  apply(p)
  const out: Record<string, number[]> = {}
  const q = new THREE.Quaternion()
  for (const [n, b] of bones) out[n] = b.getWorldQuaternion(q).toArray()
  return { bones: out, hips: bones.get(hipsName)!.getWorldPosition(new THREE.Vector3()).toArray() }
}

async function save() {
  clearFail()
  const name = $<HTMLInputElement>('#name').value.trim()
  if (!model || !body) return
  if (!poses.length) return say('nothing to save: add a pose', 'bad')
  if (!/^[\w-]+$/.test(name)) return say('name the clip: letters, digits, _ and -', 'bad')
  const bad = poses.find(p => !/^[A-Za-z]\w*$/.test(p.name))
  if (bad) return say(`${bad.name}: a pose's name is a word that starts with a letter`, 'bad')
  const restWorld = worldOf(rest)
  const all = poses.map(p => ({ name: p.name, ...worldOf(p) }))
  if (tweening) drawMix(poses[Number($<HTMLSelectElement>('#from').value)], poses[Number($<HTMLSelectElement>('#to').value)], mix)
  else apply(poses[chosen] ?? rest)
  say(`writing ${name}.fbx…`)
  const btn = $<HTMLButtonElement>('#save')
  btn.disabled = true
  try {
    const got = await api<Saved>('/api/poses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, body: body.fbx, rest: restWorld, poses: all }) })
    clipCache.delete(packUrl(got.fbx))
    saved = await api<Saved[]>('/api/poses')
    files(got.name)
    say(`wrote poses/${got.name}.fbx and ${got.name}.poses.json, ${Object.keys(got.poses).length} poses`, 'ok')
  } catch (e) {
    say('not saved', 'bad')
    fail(e)
  } finally {
    btn.disabled = false
  }
}

function files(now = '') {
  const f = $<HTMLSelectElement>('#file')
  f.innerHTML = '<option value="">new</option>' + saved.map(s => `<option>${s.name}</option>`).join('')
  f.value = now
}

// A clip the lab made, each of its named frames laid on the body as a pose of that name.
async function open(name: string) {
  clearFail()
  const s = saved.find(x => x.name === name)
  if (!s || !model) return
  try {
    const { clip, times } = await laid(s.fbx)
    const at = Object.keys(s.poses).map(Number).sort((a, b) => a - b)
    const far = at.find(f => f >= times.length)
    if (far !== undefined) throw new Error(`${s.name}.poses.json names frame ${far}, and the clip has ${times.length}`)
    poses = sampled(clip, at.map(f => times[f]), at.map(f => s.poses[String(f)]))
    $<HTMLInputElement>('#name').value = s.name
    choose(0)
    say(`opened ${s.name}: ${poses.length} poses`, 'ok')
  } catch (e) { fail(e) }
}

// ---------------------------------------------------------------- the panel

document.addEventListener('click', async e => {
  const t = (e.target as HTMLElement).closest('[data-act], [data-mode]') as HTMLElement | null
  if (!t || !model) return
  const act = t.dataset.act
  if (t.dataset.mode) {
    if (t.dataset.mode === 'translate' && bone !== hipsName) return
    gizmo.setMode(t.dataset.mode as 'rotate' | 'translate')
    modes()
    return
  }
  if (act === 'rest') add({ ...structuredClone(rest), name: nameOf('pose') })
  if (act === 'copy' && poses[chosen]) add({ ...structuredClone(poses[chosen]), name: nameOf(poses[chosen].name) })
  if (act === 'take') {
    const pack = $<HTMLSelectElement>('#pack').value, file = $<HTMLSelectElement>('#clip').value
    if (!file) return
    try {
      const { clip, times } = await laid(`${pack}/${file}`)
      const f = Math.round(Number($<HTMLInputElement>('#frame').value))
      if (!(f >= 0 && f < times.length)) throw new Error(`${file} has frames 0 to ${times.length - 1}`)
      const base = file.replace(/\.fbx$/i, '').replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^[^A-Za-z]+/, '') || 'pose'
      add(sampled(clip, [times[f]], [nameOf(base[0].toLowerCase() + base.slice(1) + f)])[0])
    } catch (err) { fail(err) }
  }
  if (act === 'bone-rest' && bone && poses[chosen]) {
    poses[chosen].q[bone] = rest.q[bone]
    if (bone === hipsName) poses[chosen].hips = rest.hips.slice()
    apply(poses[chosen])
  }
  if (act === 'pose-rest' && poses[chosen]) {
    poses[chosen] = { ...structuredClone(rest), name: poses[chosen].name }
    apply(poses[chosen])
  }
  if (act === 'tween') {
    if (poses.length < 1) return
    tweening = !tweening
    t.classList.toggle('on', tweening)
    if (!tweening) { playing = false; $('[data-act=play]').classList.remove('on'); choose(chosen) }
    attach()
  }
  if (act === 'play') {
    if (!tweening) $<HTMLElement>('[data-act=tween]').click()
    playing = !playing
    t.classList.toggle('on', playing)
  }
})
$('#save').onclick = () => void save()
$<HTMLSelectElement>('#file').onchange = e => {
  const v = (e.target as HTMLSelectElement).value
  if (v) void open(v)
  else { poses = []; $<HTMLInputElement>('#name').value = ''; choose(-1) }
}
$<HTMLSelectElement>('#pack').onchange = fillClips
$<HTMLSelectElement>('#clip').onchange = () => void frames()
$<HTMLInputElement>('#mix').oninput = e => { mix = Number((e.target as HTMLInputElement).value); playing = false; $('[data-act=play]').classList.remove('on') }
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  if (e.key === 'r') { gizmo.setMode('rotate'); modes() }
  if (e.key === 'g' && bone === hipsName) { gizmo.setMode('translate'); modes() }
})

// A joint clicked is chosen.
const ray = new THREE.Raycaster()
let down = { x: 0, y: 0 }
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY } })
renderer.domElement.addEventListener('pointerup', e => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || gizmo.dragging) return
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
  const hit = ray.intersectObjects(joints.children, false)[0]
  if (!hit) return
  bone = hit.object.userData.bone
  attach()
})

// ---------------------------------------------------------------- each frame

function frame(now: number) {
  if (model && tweening && poses.length) {
    const a = poses[Number($<HTMLSelectElement>('#from').value)] ?? poses[0], b = poses[Number($<HTMLSelectElement>('#to').value)] ?? poses[0]
    if (playing) {
      const t = (now / 1000) % 2
      mix = t < 1 ? t : 2 - t
      $<HTMLInputElement>('#mix').value = String(mix)
    }
    drawMix(a, b, mix)
    $('#mix-at').textContent = mix.toFixed(2)
  }
  const p = new THREE.Vector3()
  for (const [, b] of bones) (b.userData.joint as THREE.Object3D).position.copy(b.getWorldPosition(p))
  $('#hud').textContent = !model ? 'no body' : [
    `${body!.name}`,
    tweening ? `tween ${mix.toFixed(2)}` : poses[chosen] ? `pose ${chosen} ${poses[chosen].name}` : 'rest',
    `${poses.length} poses`,
  ].join('\n')
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- start

try {
  const chars = await api<Character[]>('/api/characters')
  if (!chars.length) throw new Error('the library has no characters: characters/<name>/<name>.fbx')
  const b = $<HTMLSelectElement>('#body')
  b.innerHTML = chars.map(c => `<option>${c.name}</option>`).join('')
  const first = new URLSearchParams(location.search).get('body') ?? (chars.some(c => c.name === 'ybot') ? 'ybot' : chars[0].name)
  b.value = first
  b.onchange = async () => {
    try {
      await load(chars.find(c => c.name === b.value)!)
      const f = $<HTMLSelectElement>('#file').value
      if (f) await open(f)
      else choose(-1)
      void frames()
    } catch (e) { fail(e) }
  }
  await load(chars.find(c => c.name === first)!)
  ;[packs, saved] = await Promise.all([api<typeof packs>('/api/packs'), api<Saved[]>('/api/poses')])
  fillPacks()
  files()
  list()
  const open0 = new URLSearchParams(location.search).get('clip')
  if (open0 && saved.some(s => s.name === open0)) { files(open0); await open(open0) }
} catch (e) { fail(e) }
requestAnimationFrame(frame)
