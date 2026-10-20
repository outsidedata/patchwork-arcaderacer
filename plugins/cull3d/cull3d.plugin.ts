// cull3d: what render3d's scene holds many copies of, drawn only where the camera can see them, at the
// level of detail each one's distance picks, nearest first. Three culls a mesh whole, by one sphere
// round all of it: an InstancedMesh of a city's buildings or a forest's trees stands all round the
// camera, so it is drawn whole, every copy behind the camera with the ones before it, and its copies
// in the order they were made, so a far one is shaded and then painted over by a near one. This hands
// each copy to the GPU only when it can reach a pixel, nearest first. It has no row and no server half:
// its numbers are the scene's `world.cull3d`, read on its first tick:
//   cell     metres: the side of the squares the copies are sorted into across the ground, x and z.
//            Each square is tested whole against the view first, and only the copies of a square that
//            passes are tested one by one.
//   tile     metres: the side of the squares `split` cuts a mesh into.
//
// `crowd({ matrices, colours?, levels })` hands it copies to draw: `matrices`, each copy's matrix in
// the world; `colours`, each copy's colour, as an InstancedMesh's `setColorAt`; `levels`, nearest
// first, each { meshes, within }: the meshes that draw a copy standing (its matrix's own place) less
// than `within` metres from the camera, and no nearer level's. A copy past the last level's `within`
// is not drawn at all. Every mesh of a level draws the same copies, each its part of it (a model's
// materials, a tree's trunk and crown). The meshes are the caller's, made with any count and put on
// the scene by it at the world's origin, unturned and unscaled, so a copy's matrix is where it stands
// (a mesh standing elsewhere throws, naming it); from then on cull3d writes their
// matrices, colours and count: the meshes of a level are handed one matrix and one colour attribute,
// so each copy is written once for all of them. Its `renderOrder` is its level's place in `levels`, so the near
// level is drawn with the scene and the farther ones after it, behind what is already there. Each
// mesh's `boundingSphere` is set round the copies it draws, so three culls a level none of whose
// copies is in view whole, and sorts it by them. It hands back { copies, drawn, forget }: `copies` how
// many it was handed, `drawn` how many of them each level drew the last time the scene was drawn, and
// `forget()`, after which it writes those meshes no more.
//
// Each time the scene is drawn, as three calls the scene's `onBeforeRender` with the camera it draws
// through (render3d's own, and any other camera a pass draws the scene with), each copy's sphere, the sphere round every level's meshes set on the copy's
// matrix, is tested against that camera's view. A level any of whose meshes casts a shadow also draws
// each copy whose sphere is in the view of a light whose shadow is drawn, a directional or a spot
// light's shadow camera, or a point light's reach (all of it, of none), since a shadow cast by
// something out of view may fall in it. A draw through the same camera, the same lights and the same
// copies as the last one writes nothing.
//
// `split(geometry)` hands back the geometry cut into the `tile`-metre squares its triangles stand in
// (by each triangle's middle), every attribute with them, each piece's bounding sphere made: a mesh
// of each piece is culled whole by three, and drawn nearest first. The geometry is triangles of plain
// attributes, indexed or not; one with groups or morph targets, which a piece could not carry, throws.
// The geometry handed is let go of.
//
// It hands out `drawn`, the copies drawn the last time the scene was drawn, and `crowds`, every crowd
// it draws. It needs render3d, and is listed before whatever hands it crowds or asks it to split, which
// throw `cull3d has not ticked yet` otherwise; its work is done as the scene is drawn. `close` forgets
// every crowd and gives the scene its hook back. One of these per client, as render3d is.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'

export type Settings = { cell: number; tile: number }
export type Level = { meshes: THREE.InstancedMesh[]; within: number }
export type Copies = { matrices: THREE.Matrix4[]; colours?: THREE.Color[]; levels: Level[] }
export type Crowd = { copies: number; drawn: number[]; forget: () => void }

// Throws naming the first number of `s` it cannot cut the ground by.
function checked(s: Settings | undefined): Settings {
  if (!s) throw new Error('the scene names cull3d but gives no world.cull3d')
  for (const key of ['cell', 'tile'] as const) {
    if (!(typeof s[key] === 'number' && Number.isFinite(s[key]) && s[key] > 0)) throw new Error(`cull3d ${key} ${s[key]} is not a number of metres above 0`)
  }
  return s
}

// One crowd as it is drawn: each copy's matrix (16 numbers), the place it is measured from (its
// matrix's own), its sphere's middle and radius, its colour; each level's shared attributes and what
// it drew.
type Held = {
  n: number
  source: Float32Array
  colours?: Float32Array
  origin: Float64Array
  centre: Float64Array
  radius: Float64Array
  levels: { meshes: THREE.InstancedMesh[]; within: number; matrix: THREE.InstancedBufferAttribute; colour?: THREE.InstancedBufferAttribute; count: number; box: THREE.Box3 }[]
  last: number
  handle: Crowd
}

// A light three draws a shadow for.
type Caster = THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight

// A square of the ground: the box round every sphere in it, the farthest any of its copies is drawn,
// and its copies, by crowd.
type Cell = { box: THREE.Box3; reach: number; members: { held: Held; copies: number[] }[] }

export function cull3d() {
  let built: {
    T: typeof THREE
    s: Settings
    scene: THREE.Scene
    before: THREE.Scene['onBeforeRender']
    hook: THREE.Scene['onBeforeRender']
  } | undefined
  let on = false
  const held: Held[] = []
  // the cells of every crowd, made again when a crowd is handed or forgotten
  let cells: Cell[] = []
  let version = 0, made = -1
  // what the last draw was drawn through: the camera's matrices, each shadow light's, and `version`
  let last = new Float64Array(0)

  const me = {
    drawn: 0,
    get crowds() { return held.map(h => h.handle) },
    tick(plugins: Plugins) {
      if (built) return
      const render3d = plugins.render3d
      if (!render3d) throw new Error('cull3d needs render3d, which this scene does not name')
      const s = checked(plugins.wire.scene.world?.cull3d as Settings | undefined)
      const T = render3d.THREE as typeof THREE
      const scene = render3d.scene as THREE.Scene
      const before = scene.onBeforeRender
      const hook: THREE.Scene['onBeforeRender'] = function (this: THREE.Scene, renderer, s3, camera, target, material, group) {
        before.call(this, renderer, s3, camera, target, material, group)
        if (on) draw(camera)
      }
      scene.onBeforeRender = hook
      built = { T, s, scene, before, hook }
      on = true
    },
    crowd(c: Copies): Crowd {
      const b = ready('crowd')
      const T = b.T
      const n = c.matrices.length
      if (c.colours && c.colours.length !== n) throw new Error(`cull3d: a crowd of ${n} copies handed ${c.colours.length} colours`)
      if (!c.levels.length) throw new Error('cull3d: a crowd handed no levels')
      for (const l of c.levels) for (const m of l.meshes) {
        m.updateWorldMatrix(true, false)
        if (!isIdentity(m.matrixWorld)) throw new Error(`cull3d: the mesh ${m.name || m.uuid} of a crowd does not stand at the world's origin, unturned and unscaled`)
      }
      const source = new Float32Array(n * 16)
      c.matrices.forEach((m, k) => source.set(m.elements, k * 16))
      const colours = c.colours ? new Float32Array(n * 3) : undefined
      if (colours) c.colours!.forEach((col, k) => { colours[k * 3] = col.r; colours[k * 3 + 1] = col.g; colours[k * 3 + 2] = col.b })
      // the sphere round every level's every mesh, so a copy is in view at any level as soon as at one
      const local = new T.Sphere()
      local.makeEmpty()
      for (const l of c.levels) for (const m of l.meshes) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
        local.union(m.geometry.boundingSphere!)
      }
      const origin = new Float64Array(n * 3), centre = new Float64Array(n * 3), radius = new Float64Array(n)
      const v = new T.Vector3()
      c.matrices.forEach((m, k) => {
        v.setFromMatrixPosition(m)
        origin[k * 3] = v.x; origin[k * 3 + 1] = v.y; origin[k * 3 + 2] = v.z
        v.copy(local.center).applyMatrix4(m)
        centre[k * 3] = v.x; centre[k * 3 + 1] = v.y; centre[k * 3 + 2] = v.z
        radius[k] = local.radius * m.getMaxScaleOnAxis()
      })
      const levels = c.levels.map((l, i) => {
        const matrix = new T.InstancedBufferAttribute(new Float32Array(n * 16), 16)
        matrix.setUsage(T.DynamicDrawUsage)
        const colour = colours ? new T.InstancedBufferAttribute(new Float32Array(n * 3), 3) : undefined
        colour?.setUsage(T.DynamicDrawUsage)
        for (const m of l.meshes) {
          m.instanceMatrix = matrix
          if (colour) m.instanceColor = colour
          m.count = 0
          m.frustumCulled = true
          m.boundingSphere = new T.Sphere()
          m.boundingSphere.makeEmpty()
          m.renderOrder = i
        }
        return { meshes: l.meshes, within: l.within, matrix, colour, count: 0, box: new T.Box3() }
      })
      const handle: Crowd = {
        copies: n,
        drawn: levels.map(() => 0),
        forget() {
          const k = held.indexOf(h)
          if (k < 0) return
          held.splice(k, 1)
          version++
        },
      }
      const h: Held = { n, source, colours, origin, centre, radius, levels, last: c.levels[c.levels.length - 1].within, handle }
      held.push(h)
      version++
      return handle
    },
    split(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
      const b = ready('split')
      const T = b.T, tile = b.s.tile
      if (geometry.groups.length || Object.keys(geometry.morphAttributes).length) throw new Error(`cull3d cannot split ${geometry.name || 'a geometry'} of groups or morph targets`)
      const flat = geometry.index ? geometry.toNonIndexed() : geometry
      const pos = flat.getAttribute('position')
      const squares = new Map<string, number[]>()
      for (let t = 0; t < pos.count / 3; t++) {
        const x = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3
        const z = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3
        const key = `${Math.floor(x / tile)},${Math.floor(z / tile)}`
        let list = squares.get(key)
        if (!list) squares.set(key, (list = []))
        list.push(t)
      }
      const pieces = [...squares.values()].map(list => {
        const g = new T.BufferGeometry()
        for (const [name, a] of Object.entries(flat.attributes)) {
          // each attribute in an array of its own kind
          const from = a.array as Float32Array, size = a.itemSize
          const to = new (from.constructor as Float32ArrayConstructor)(list.length * 3 * size)
          list.forEach((t, j) => { for (let q = 0; q < 3 * size; q++) to[j * 3 * size + q] = from[t * 3 * size + q] })
          g.setAttribute(name, new T.BufferAttribute(to, size, a.normalized))
        }
        g.computeBoundingSphere()
        return g
      })
      if (flat !== geometry) flat.dispose()
      geometry.dispose()
      return pieces
    },
    close() {
      if (!built) return
      on = false
      // the hook given back where it is still the scene's; under another plugin's it stays, doing nothing
      if (built.scene.onBeforeRender === built.hook) built.scene.onBeforeRender = built.before
      held.length = 0
      cells = []
      built = undefined
    },
  }

  function ready(what: string) {
    if (!built) throw new Error(`cull3d has not ticked yet: list it before what hands it a ${what}`)
    return built
  }

  // Every copy sorted into the squares of the ground it stands in, each square's box round its spheres.
  function sortCells() {
    const T = built!.T, cell = built!.s.cell
    const map = new Map<string, Cell>()
    const sphere = new T.Sphere()
    for (const h of held) for (let k = 0; k < h.n; k++) {
      const x = h.centre[k * 3], z = h.centre[k * 3 + 2]
      const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`
      let c = map.get(key)
      if (!c) map.set(key, (c = { box: new T.Box3(), reach: 0, members: [] }))
      sphere.center.set(x, h.centre[k * 3 + 1], z)
      sphere.radius = h.radius[k]
      c.box.union(sphere.getBoundingBox(new T.Box3()))
      c.reach = Math.max(c.reach, h.last)
      let m = c.members.find(e => e.held === h)
      if (!m) c.members.push((m = { held: h, copies: [] }))
      m.copies.push(k)
    }
    cells = [...map.values()]
    made = version
  }

  // What the draw is drawn through, as numbers: the camera, and each light whose shadow is drawn: which
  // light it is, where it stands, the place it aims at, its shadow camera's projection and its reach;
  // and the crowds' version. False when it is what the last draw was drawn through.
  const PER = 1 + 16 + 16 + 16 + 1
  function changed(camera: THREE.Camera, lights: Caster[]) {
    const n = 32 + lights.length * PER + 1
    const now = new Float64Array(n)
    now.set(camera.matrixWorld.elements, 0)
    now.set(camera.projectionMatrix.elements, 16)
    lights.forEach((l, i) => {
      const o = 32 + i * PER
      now[o] = l.id
      now.set(l.matrixWorld.elements, o + 1)
      if (!(l as THREE.PointLight).isPointLight) now.set((l as THREE.DirectionalLight | THREE.SpotLight).target.matrixWorld.elements, o + 17)
      now.set(l.shadow.camera.projectionMatrix.elements, o + 33)
      now[o + 49] = (l as THREE.PointLight).isPointLight ? (l as THREE.PointLight).distance : 0
    })
    now[n - 1] = version
    if (now.length === last.length && now.every((x, i) => x === last[i])) return false
    last = now
    return true
  }

  // A view a shadow is drawn through: a directional or spot light's shadow camera, or a point light's
  // reach.
  type Shadow = { frustum?: THREE.Frustum; reach?: THREE.Sphere }

  function draw(camera: THREE.Camera) {
    const b = built!, T = b.T
    if (!held.length) { me.drawn = 0; return }
    // the lights three draws a shadow for
    const lights: Caster[] = []
    b.scene.traverseVisible(o => {
      const l = o as THREE.Object3D & { isDirectionalLight?: boolean; isSpotLight?: boolean; isPointLight?: boolean }
      if ((l.isDirectionalLight || l.isSpotLight || l.isPointLight) && l.castShadow) lights.push(o as Caster)
    })
    if (!changed(camera, lights)) return
    if (made !== version) sortCells()
    const view = new T.Frustum().setFromProjectionMatrix(
      new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      camera.coordinateSystem,
      camera.reversedDepth,
    )
    const shadows: Shadow[] = lights.map(l => {
      if ((l as THREE.PointLight).isPointLight) {
        const p = l as THREE.PointLight
        return { reach: new T.Sphere(new T.Vector3().setFromMatrixPosition(p.matrixWorld), p.distance > 0 ? p.distance : Infinity) }
      }
      // as three's shadow map places it, before it draws the shadow
      const d = l as THREE.DirectionalLight | THREE.SpotLight
      d.shadow.updateMatrices(d)
      return { frustum: d.shadow.getFrustum().clone() }
    })
    const shaded = (s: THREE.Sphere) => shadows.some(f => (f.reach ? f.reach.intersectsSphere(s) : f.frustum!.intersectsSphere(s)))
    const shadedBox = (box: THREE.Box3) => shadows.some(f => (f.reach ? f.reach.intersectsBox(box) : f.frustum!.intersectsBox(box)))
    const eye = new T.Vector3().setFromMatrixPosition(camera.matrixWorld)
    // the squares in view, or in a shadow's, and near enough, nearest first
    const near: { cell: Cell; d: number }[] = []
    for (const cell of cells) {
      const d = cell.box.distanceToPoint(eye)
      if (d >= cell.reach) continue
      if (!view.intersectsBox(cell.box) && !(shadows.length && shadedBox(cell.box))) continue
      near.push({ cell, d })
    }
    near.sort((a, c) => a.d - c.d)
    for (const h of held) for (const l of h.levels) { l.count = 0; l.box.makeEmpty() }
    const casts = new Map<Held, boolean[]>(held.map(h => [h, h.levels.map(l => l.meshes.some(m => m.castShadow))]))
    const sphere = new T.Sphere(), corner = new T.Vector3()
    let total = 0
    for (const { cell } of near) for (const { held: h, copies } of cell.members) {
      const cast = casts.get(h)!
      for (const k of copies) {
        const dx = h.origin[k * 3] - eye.x, dy = h.origin[k * 3 + 1] - eye.y, dz = h.origin[k * 3 + 2] - eye.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        let level = -1
        for (let i = 0; i < h.levels.length; i++) if (d < h.levels[i].within) { level = i; break }
        if (level < 0) continue
        sphere.center.set(h.centre[k * 3], h.centre[k * 3 + 1], h.centre[k * 3 + 2])
        sphere.radius = h.radius[k]
        if (!view.intersectsSphere(sphere) && !(cast[level] && shadows.length && shaded(sphere))) continue
        const l = h.levels[level], j = l.count++
        const to = l.matrix.array as Float32Array
        for (let q = 0; q < 16; q++) to[j * 16 + q] = h.source[k * 16 + q]
        if (l.colour) {
          const c = l.colour.array as Float32Array
          c[j * 3] = h.colours![k * 3]; c[j * 3 + 1] = h.colours![k * 3 + 1]; c[j * 3 + 2] = h.colours![k * 3 + 2]
        }
        l.box.expandByPoint(corner.copy(sphere.center).subScalar(sphere.radius))
        l.box.expandByPoint(corner.copy(sphere.center).addScalar(sphere.radius))
        total++
      }
    }
    for (const h of held) h.levels.forEach((l, i) => {
      h.handle.drawn[i] = l.count
      l.matrix.clearUpdateRanges()
      l.matrix.addUpdateRange(0, l.count * 16)
      l.matrix.needsUpdate = true
      if (l.colour) {
        l.colour.clearUpdateRanges()
        l.colour.addUpdateRange(0, l.count * 3)
        l.colour.needsUpdate = true
      }
      for (const m of l.meshes) {
        m.count = l.count
        if (l.count) l.box.getBoundingSphere(m.boundingSphere!)
        else m.boundingSphere!.makeEmpty()
      }
    })
    me.drawn = total
  }

  return me
}

function isIdentity(m: THREE.Matrix4) {
  const e = m.elements
  for (let i = 0; i < 16; i++) if (e[i] !== (i % 5 === 0 ? 1 : 0)) return false
  return true
}
