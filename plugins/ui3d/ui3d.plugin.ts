// ui3d: things in 3D over the game, in render3d's overlay, which the pointer and the keys select and
// press. A game hands it the things it draws; ui3d alone puts them in the overlay, places them, hit-tests
// them and takes them out. No packet carries any of it: it is the page's.
//
// Showing a thing. An actor shows a thing with `show(key, make, look)` in its `tick`, every frame it
// wants it shown, as it shows a thing on a `ui` panel: `make` runs the first frame, handing back the
// THREE object to show (or undefined while it cannot yet, a model still coming, and is asked again
// the next frame), and the same object comes back every frame after. A key shown twice in one frame
// throws. After a frame in which nobody showed a key, its thing is taken out of the overlay; the object
// stays the game's, which made it and lets it go. A thing shown again after that is new: its clock
// starts again.
//
// Looks by name. `world.ui3d.looks` names an entry of the scene's loader catalogue, a json file of looks
// by name: `{ "<name>": look, ... }`. A look of the file may give `model`, the name of a `model` entry of
// the catalogue. `show(key, name)` shows the file's look of that name, its thing made by ui3d from that
// model: a copy of the loader's model with copies of its materials, so what a word does to them touches
// this thing alone; it is shown from the first frame the file and the model have landed, ui3d asking the
// loader for each until then. `show(key, make, name)` shows the file's look of that name on the thing
// `make` hands back. A name the file has no look of throws, and so does `show(key, name)` of a look with
// no `model`. The file written while the game runs (the loader refills it in place) is shown as it now is
// from the next frame. So a scene's looks are data the game names in one place: a game shows its title by
// name, and the particle workshop finds every look of a game's scenes and shows it on its stage
// (`tools/workshop`, its ui3d mode).
//
// Where a thing stands. Each thing hangs in a holder of ui3d's, and the holder, every frame, stands in
// the camera's frame: `look.at` is metres right, up and ahead (−z) of render3d's camera, its turn the
// camera's, so it faces the camera, and its size `look.scale` (1 when left out). The thing itself is put
// back each frame where it stood in its holder when it was made; what moves it after that is its words.
//
// Words. Every field of a look but `at`, `scale`, `select` and `model` is a word, and its value that word's
// numbers. ui3d keeps a table from word to the function that does that word to a thing, and runs, each
// frame, for each thing, the function of each of its words in the order the look gives them, handed the
// word's numbers and the thing: `{ key, holder, object, selected, chosen, age, camera, T, plugins }`,
// where `selected` is whether it is the selected thing, `chosen` whether any thing is, `age` the seconds
// since it was first shown, `camera` the camera's place `p` and turn `q`, and `T` THREE. A word moves the
// holder to move the thing and its hit box with it (a sway, a thing flying in), or the object to move
// the thing alone (a thing that grows when selected, whose box stays its size), or touches the object's
// materials. ui3d's own words:
//   grow   { scale }                       the selected thing's object `scale` times its size.
//   glow   { colour, power, materials? }   the selected thing's materials give off `colour` × `power`.
//   dim    { by, materials? }              while a thing is selected, every other thing's materials'
//                                          colour `by` times itself.
// `materials` names the materials touched, by their `name`; left out, every material of the object.
// Every other word comes from a mod: `<a>.ui3d.ts` exporting `behaviors()`, `{ <word>: Behavior }`, which a
// scene names in `world.ui3d.mods.behaviors: ['<a>', ...]`; a delivered word takes the place of ui3d's own
// of that name, and a later one's of an earlier one's. A look giving a word nothing delivers throws,
// naming the thing, the word and `world.ui3d.mods.behaviors`. Each material's `color`, `emissive`,
// `emissiveIntensity` and `opacity` are put back, at the start of the next frame, as they were before
// the words ran, so a word changes them for one frame and the game's own setting of them stands.
//
// Selecting. A look with `select: true` is a thing that can be selected; the things that can be, in the
// order they were shown that frame, are the menu. One of them is selected whenever there is one: the
// first, until the pointer or a key moves it, and the first again when the selected thing is no longer
// shown. Every thing that can be selected has an invisible box around it, made from the object as it
// stands in its holder the first frame it has geometry (an empty group a model is put in once it has
// come is in the menu, and is hit once the model is in it), which hangs in the holder: it moves, turns and sways with
// the thing, and is never sized by a word that touches the object. Each frame ui3d casts a ray from the
// pointer through the overlay's camera, as the overlay was last drawn, into the boxes of the things shown
// and visible (the holder, its object and every one above them visible): the first box hit is the thing
// under the pointer. When the thing under the pointer becomes another thing, that thing is selected;
// when it becomes none, the selection stays. A key moves it, so the pointer resting on a thing does not
// take it back until it moves onto another. A press and a release of the pointer over one thing press
// it, and select it. `world.ui3d.keys` names, each as one key or a list of them as `plugins/player`
// names keys (`keyOf`), the ones that select the `next` thing of the menu, the `previous` one (stopping
// at either end) and `press` the selected one. While the menu has things, its keys' defaults are
// cancelled; while `plugins/player` listens for a key to rebind, ui3d takes none. While the pointer is
// over a thing, the cursor is the pointer's.
//
// What it hands back. `show`, above. `look(name)` is the looks file's look of that name, or undefined
// while the file has not landed. `selected()` is the selected thing's key, or undefined; `pressed()` the key pressed
// this frame, or undefined, read by an actor in its `tick`. `select(key)` selects a thing of the menu.
// `environment(texture)` is what the overlay's things reflect, a PMREM texture or null.
//
// The overlay. `world.ui3d.overlay` is `[near, far]`, the overlay camera's own, in metres
// (`plugins/render3d`, The overlay).
//
// Order. ui3d is listed before `render3d` in the scene's `plugins`: its `afterTick` places what render3d's
// draws that frame, and it throws when listed after. It ticks before the actors, so a press and a
// selection are read the frame they happen. Its words run in its `afterTick`, after every actor has
// ticked, so a game sets a thing's finish in its `tick` and a word changes it for the draw.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { keyOf, type Keys } from '#plugins/player/player.plugin.ts'
import { listed, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'

export type Look = { at: number[]; scale?: number; select?: boolean; model?: string } & Record<string, unknown>
export type Placed = {
  key: string
  holder: THREE.Group
  object: THREE.Object3D
  selected: boolean
  chosen: boolean
  age: number
  camera: { p: THREE.Vector3; q: THREE.Quaternion }
  T: typeof THREE
  plugins: Plugins
}
export type Behavior = (numbers: any, it: Placed) => void
export type Behaviors = Record<string, Behavior>
export type Table = { overlay: [number, number]; keys: Record<'next' | 'previous' | 'press', Keys>; looks?: string; mods?: Record<string, string | string[]> }

// The fields of a look that place it, and the model it is made from; every other field is a word.
const PLACE = new Set(['at', 'scale', 'select', 'model'])

// Each material of `object` named in `names`, or every one when `names` is left out.
function materials(object: THREE.Object3D, names: string[] | undefined, f: (m: THREE.MeshStandardMaterial) => void) {
  object.traverse(o => {
    const m = (o as THREE.Mesh).material
    if (!m) return
    for (const one of Array.isArray(m) ? m : [m]) if (!names || names.includes(one.name)) f(one as THREE.MeshStandardMaterial)
  })
}

// ui3d's own words.
const OWN: Behaviors = {
  grow(n: { scale: number }, it) {
    if (it.selected) it.object.scale.multiplyScalar(n.scale)
  },
  glow(n: { colour: string; power: number; materials?: string[] }, it) {
    if (!it.selected) return
    materials(it.object, n.materials, m => { m.emissive?.set(n.colour).multiplyScalar(n.power) })
  },
  dim(n: { by: number; materials?: string[] }, it) {
    if (!it.chosen || it.selected) return
    materials(it.object, n.materials, m => { m.color?.multiplyScalar(n.by) })
  },
}

type Item = {
  key: string
  holder: THREE.Group
  object: THREE.Object3D
  rest: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }
  box?: THREE.Mesh
  look: Look
  born: number
}
type Kept = { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity: number }

export function ui3d() {
  const items = new Map<string, Item>()
  let shown: string[] = [] // the keys shown this frame, in order
  let menu: string[] = [] // the keys that can be selected, as last placed
  let selected: string | undefined
  let pressed: string | undefined
  let hovered: string | undefined // the thing under the pointer last frame
  let pointer: { x: number; y: number } | undefined // the pointer, in the page's pixels
  let downOn: string | undefined // the thing under the pointer when it went down
  let tapped: string | undefined // a press of the pointer waiting for the tick
  let moves: ('next' | 'previous' | 'press')[] = []
  const kept = new Map<THREE.Material, Kept>()
  let table: Behaviors | undefined
  let checked = false
  let listening = false
  let cursor = false
  let plugins: Plugins | undefined

  const world = (): Table => {
    const t = plugins?.wire.scene.world?.ui3d as Table | undefined
    if (!t) throw new Error('ui3d needs world.ui3d: its overlay and its keys')
    return t
  }

  // Whether `world.ui3d.keys` names this key for `what`.
  const is = (what: 'next' | 'previous' | 'press', key: string) => {
    const k = world().keys?.[what]
    if (k === undefined) throw new Error(`world.ui3d has no keys.${what}`)
    return typeof k === 'string' ? k === key : k.includes(key)
  }

  // The thing whose box is under the page's point (x, y), as the overlay was last drawn.
  const under = (x: number, y: number): string | undefined => {
    const r3 = plugins?.render3d
    const canvas = r3?.canvas as HTMLCanvasElement | undefined
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    if (x < box.left || x > box.right || y < box.top || y > box.bottom || !box.width || !box.height) return
    const T = r3.THREE as typeof THREE
    const scene = r3.overlay.scene as THREE.Scene
    const seen = (o: THREE.Object3D | null): boolean => {
      for (; o && o !== scene; o = o.parent) if (!o.visible) return false
      return o === scene
    }
    const boxes = new Map<THREE.Object3D, string>()
    for (const k of menu) {
      const it = items.get(k)
      if (it?.box && seen(it.holder) && seen(it.object)) boxes.set(it.box, k)
    }
    if (!boxes.size) return
    const ray = new T.Raycaster()
    ray.setFromCamera(new T.Vector2(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1), r3.overlay.camera)
    const hit = ray.intersectObjects([...boxes.keys()], false)[0]
    return hit && boxes.get(hit.object)
  }

  const onMove = (e: PointerEvent) => { pointer = { x: e.clientX, y: e.clientY } }
  const onDown = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY }
    downOn = under(e.clientX, e.clientY)
  }
  const onUp = (e: PointerEvent) => {
    const k = under(e.clientX, e.clientY)
    if (k !== undefined && k === downOn) tapped = k
    downOn = undefined
  }
  const onKey = (e: KeyboardEvent) => {
    if (plugins?.player?.listening || !menu.length) return
    const key = keyOf(e)
    const what = is('next', key) ? 'next' : is('previous', key) ? 'previous' : is('press', key) ? 'press' : undefined
    if (!what) return
    e.preventDefault()
    if (what === 'press' && e.repeat) return
    moves.push(what)
  }

  const listen = () => {
    if (listening) return
    listening = true
    addEventListener('pointermove', onMove)
    addEventListener('pointerdown', onDown)
    addEventListener('pointerup', onUp)
    addEventListener('keydown', onKey)
  }

  // The cursor the page shows over the game: the pointer's while it is over a thing.
  const point = (on: boolean) => {
    if (on === cursor) return
    cursor = on
    const at = (plugins?.render3d?.canvas as HTMLCanvasElement | undefined)?.parentElement
    if (at) at.style.cursor = on ? 'pointer' : ''
  }

  // The box round the object as it stands in its holder.
  const boxOf = (it: Item) => {
    const T = plugins!.render3d.THREE as typeof THREE
    it.holder.position.set(0, 0, 0)
    it.holder.quaternion.identity()
    it.holder.scale.set(1, 1, 1)
    const was = it.holder.parent
    it.holder.removeFromParent()
    it.holder.updateMatrixWorld(true)
    const b = new T.Box3().setFromObject(it.object, true)
    was?.add(it.holder)
    if (b.isEmpty()) return
    const size = b.getSize(new T.Vector3())
    const mesh = new T.Mesh(new T.BoxGeometry(size.x, size.y, size.z), new T.MeshBasicMaterial({ visible: false }))
    mesh.name = `${it.key}.box`
    b.getCenter(mesh.position)
    it.holder.add(mesh)
    it.box = mesh
  }

  const drop = (it: Item) => {
    it.holder.removeFromParent()
    it.holder.remove(it.object)
    if (it.box) {
      it.box.geometry.dispose()
      ;(it.box.material as THREE.Material).dispose()
    }
    items.delete(it.key)
  }

  // The looks file, or undefined while it has not landed, the loader asked for it until it has.
  const looksFile = (): Record<string, Look> | undefined => {
    const name = world().looks
    if (name === undefined) throw new Error('ui3d is asked for a look by name, and the scene gives no world.ui3d.looks')
    const { loader } = plugins!
    if (!loader) throw new Error('ui3d reads world.ui3d.looks through loader, which this scene does not name')
    if (!loader.ready(name)) {
      loader.load(name).catch(() => {})
      return undefined
    }
    return loader.get(name)
  }
  // The file's look of `name`, which it throws for when it has none.
  const named = (name: string): Look | undefined => {
    const file = looksFile()
    if (!file) return undefined
    const look = file[name]
    if (!look) throw new Error(`ui3d's looks file ${world().looks} has no look ${name}: its looks are ${Object.keys(file).join(', ')}`)
    return look
  }
  // A copy of the loader's model, with copies of its materials; undefined until it has landed.
  const made = (model: string): THREE.Object3D | undefined => {
    const { loader } = plugins!
    if (!loader.ready(model)) {
      loader.load(model).catch(() => {})
      return undefined
    }
    const object = loader.model(model).scene as THREE.Object3D
    object.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
    })
    return object
  }

  const me = {
    show(key: string, makeOrName: (() => THREE.Object3D | undefined) | string, given?: Look | string): THREE.Object3D | undefined {
      if (shown.includes(key)) throw new Error(`ui3d showed ${key} twice in one frame`)
      const name = typeof makeOrName === 'string' ? makeOrName : typeof given === 'string' ? given : undefined
      const look = name === undefined ? given as Look : named(name)
      if (!look) return undefined
      let make: () => THREE.Object3D | undefined
      if (typeof makeOrName === 'string') {
        if (look.model === undefined) throw new Error(`ui3d shows ${key} as the look ${name}, which gives no model`)
        make = () => made(look.model!)
      } else make = makeOrName
      let it = items.get(key)
      if (!it) {
        const object = make()
        if (!object) return undefined
        const T = plugins!.render3d.THREE as typeof THREE
        const holder = new T.Group()
        holder.name = key
        holder.add(object)
        it = { key, holder, object, rest: { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone() }, look, born: performance.now() }
        items.set(key, it)
        plugins!.render3d.overlay.scene.add(holder)
      }
      it.look = look
      shown.push(key)
      return it.object
    },
    look(name: string): Look | undefined { return named(name) },
    selected(): string | undefined { return selected },
    pressed(): string | undefined { return pressed },
    select(key: string) {
      if (!menu.includes(key)) throw new Error(`ui3d cannot select ${key}: it is not a thing of the menu`)
      selected = key
    },
    environment(texture: THREE.Texture | null) {
      plugins!.render3d.overlay.scene.environment = texture
    },
    tick(p: Plugins) {
      plugins = p
      listen()
      // a frame something threw in never reached `afterTick`: what it showed is forgotten
      shown = []
      for (const [m, k] of kept) {
        const s = m as THREE.MeshStandardMaterial
        if (k.color) s.color.copy(k.color)
        if (k.emissive) s.emissive.copy(k.emissive)
        if (k.emissiveIntensity !== undefined) s.emissiveIntensity = k.emissiveIntensity
        s.opacity = k.opacity
      }
      kept.clear()
      pressed = undefined
      const now = pointer ? under(pointer.x, pointer.y) : undefined
      if (now !== hovered) {
        hovered = now
        if (now !== undefined) selected = now
      }
      point(now !== undefined)
      for (const m of moves) {
        if (!menu.length) break
        const i = Math.max(0, selected === undefined ? 0 : menu.indexOf(selected))
        if (m === 'next') selected = menu[Math.min(menu.length - 1, i + 1)]
        else if (m === 'previous') selected = menu[Math.max(0, i - 1)]
        else pressed = menu[i]
      }
      moves = []
      if (tapped !== undefined && menu.includes(tapped)) selected = pressed = tapped
      tapped = undefined
    },
    afterTick(p: Plugins) {
      plugins = p
      const { render3d, wire } = p
      if (!checked) {
        const order = listed(wire.scene)
        if (order.indexOf('ui3d') > order.indexOf('render3d')) throw new Error('ui3d is listed after render3d, which draws what ui3d places that frame')
        provided(wire.scene, 'ui3d', 'behaviors')
        checked = true
      }
      const words: Behaviors = (table ??= Object.assign({}, OWN, ...modsOf<() => Behaviors>(wire.scene.world!, 'ui3d', 'behaviors').map(b => b())))
      for (const it of [...items.values()]) if (!shown.includes(it.key)) drop(it)
      menu = shown.filter(k => items.get(k)!.look.select === true)
      if (!menu.length) selected = undefined
      else if (selected === undefined || !menu.includes(selected)) selected = menu[0]
      if (hovered !== undefined && !menu.includes(hovered)) hovered = undefined
      const W = world()
      const T = render3d.THREE as typeof THREE
      const over = render3d.overlay.camera as THREE.PerspectiveCamera
      if (over.near !== W.overlay[0] || over.far !== W.overlay[1]) {
        over.near = W.overlay[0]
        over.far = W.overlay[1]
        over.updateProjectionMatrix()
      }
      const cam = render3d.camera as THREE.PerspectiveCamera | undefined
      const camera = { p: new T.Vector3(), q: new T.Quaternion() }
      if (cam) {
        cam.updateMatrixWorld()
        cam.matrixWorld.decompose(camera.p, camera.q, new T.Vector3())
      }
      const now = performance.now()
      for (const key of shown) {
        const it = items.get(key)!
        const { holder, object, look } = it
        if (look.select === true && !it.box) boxOf(it)
        holder.visible = !!cam
        holder.position.fromArray(look.at).applyQuaternion(camera.q).add(camera.p)
        holder.quaternion.copy(camera.q)
        holder.scale.setScalar(look.scale ?? 1)
        object.position.copy(it.rest.p)
        object.quaternion.copy(it.rest.q)
        object.scale.copy(it.rest.s)
        materials(object, undefined, m => {
          if (kept.has(m)) return
          kept.set(m, { color: m.color?.clone(), emissive: m.emissive?.clone(), emissiveIntensity: m.emissiveIntensity, opacity: m.opacity })
        })
        const placed: Placed = { key, holder, object, selected: key === selected, chosen: selected !== undefined, age: (now - it.born) / 1000, camera, T, plugins: p }
        for (const [word, numbers] of Object.entries(look)) {
          if (PLACE.has(word)) continue
          const f = words[word]
          if (!f) throw new Error(`ui3d has no behavior for ${key}, of the word ${word}: no plugin world.ui3d.mods.behaviors names delivers it`)
          f(numbers, placed)
        }
        holder.updateMatrixWorld(true)
      }
      shown = []
    },
    close() {
      if (listening) {
        removeEventListener('pointermove', onMove)
        removeEventListener('pointerdown', onDown)
        removeEventListener('pointerup', onUp)
        removeEventListener('keydown', onKey)
        listening = false
      }
      point(false)
      for (const it of [...items.values()]) drop(it)
      if (plugins?.render3d?.overlay) plugins.render3d.overlay.scene.environment = null
    },
  }
  return me
}
