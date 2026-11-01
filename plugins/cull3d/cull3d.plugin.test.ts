// cull3d on render3d with no canvas, in node: the copies it writes into a crowd's meshes as three calls
// the scene's `onBeforeRender`, read back off the meshes and checked against every copy tested on its
// own, its sphere against the camera's view and the views shadows are drawn through, its level by its
// distance; and the pieces `split` cuts a geometry into.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { cull3d, type Settings } from './cull3d.plugin.ts'

const SET: Settings = { cell: 40, tile: 100 }

function page(world: Record<string, unknown> = { cull3d: SET }) {
  const plugins: any = { wire: { rows: [], scene: { world, prefabs: {} } }, render3d: render3d() }
  const me = cull3d()
  me.tick(plugins)
  const scene = plugins.render3d.scene as THREE.Scene
  const renderer = {} as THREE.WebGLRenderer
  // the scene drawn through `camera`, as three calls the hook before it projects a thing
  const draw = (camera: THREE.Camera) => {
    scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    scene.onBeforeRender(renderer, scene, camera, null as never, undefined as never, undefined as never)
  }
  return { plugins, me, scene, draw }
}

// A seeded roll, so the copies stand the same every run.
const roll = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const camera = (reversed = false) => {
  const c = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 12000)
  // render3d's renderer draws with a reversed depth buffer, and three turns its cameras so
  if (reversed) Object.assign(c, { _reversedDepth: true })
  c.updateProjectionMatrix()
  c.position.set(20, 3, -10)
  c.lookAt(120, 2, 80)
  c.updateMatrixWorld()
  return c
}

// `n` copies strewn over a square `size` metres across round the origin, each turned and scaled
// by the roll, their colours by it too.
function strew(n: number, seed: number, size = 1600) {
  const die = roll(seed)
  const matrices: THREE.Matrix4[] = [], colours: THREE.Color[] = []
  for (let k = 0; k < n; k++) {
    const s = 0.5 + die() * 2
    matrices.push(new THREE.Matrix4().compose(
      new THREE.Vector3((die() - 0.5) * size, die() * 4, (die() - 0.5) * size),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), die() * 6.28),
      new THREE.Vector3(s, s * (0.5 + die()), s),
    ))
    colours.push(new THREE.Color(die(), die(), die()))
  }
  return { matrices, colours }
}

// A level's meshes: a box and a cone drawing each copy, made with a count of their own.
const meshes = (scene: THREE.Scene, h: number) => {
  const made = [new THREE.InstancedMesh(new THREE.BoxGeometry(4, h, 4).translate(0, h / 2, 0), new THREE.MeshStandardMaterial(), 7), new THREE.InstancedMesh(new THREE.ConeGeometry(2, 3).translate(0, h + 1.5, 0), new THREE.MeshStandardMaterial(), 7)]
  scene.add(...made)
  return made
}

// The copies a level's mesh draws, by where each stands, in its order.
function drawn(mesh: THREE.InstancedMesh) {
  const m = new THREE.Matrix4(), out: string[] = []
  for (let j = 0; j < mesh.count; j++) {
    mesh.getMatrixAt(j, m)
    out.push(key(m))
  }
  return out
}
const key = (m: THREE.Matrix4) => m.elements.map(x => Math.fround(x).toFixed(4)).join()

// Each copy as cull3d should draw it, tested on its own: its sphere (round every level's meshes, set
// on its matrix) against the view and the shadows' views, its level the first its distance is within.
function expected(matrices: THREE.Matrix4[], levels: { meshes: THREE.InstancedMesh[]; within: number }[], cam: THREE.Camera, shadows: { frustum?: THREE.Frustum; reach?: THREE.Sphere }[] = []) {
  const local = new THREE.Sphere().makeEmpty()
  for (const l of levels) for (const m of l.meshes) local.union(m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere!))
  const view = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), cam.coordinateSystem, cam.reversedDepth)
  const eye = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld)
  const by = levels.map(() => new Set<string>())
  for (const m of matrices) {
    const d = new THREE.Vector3().setFromMatrixPosition(m).distanceTo(eye)
    const level = levels.findIndex(l => d < l.within)
    if (level < 0) continue
    const s = local.clone().applyMatrix4(m)
    const cast = levels[level].meshes.some(x => x.castShadow)
    if (view.intersectsSphere(s) || (cast && shadows.some(f => (f.reach ? f.reach.intersectsSphere(s) : f.frustum!.intersectsSphere(s))))) by[level].add(key(m))
  }
  return by
}

test('every copy in view and within reach is drawn once, at the level its distance picks; none other is', () => {
  for (const reversed of [false, true]) {
    const { me, scene, draw } = page()
    const { matrices, colours } = strew(3000, 7)
    const levels = [{ meshes: meshes(scene, 6), within: 120 }, { meshes: meshes(scene, 6), within: 400 }, { meshes: meshes(scene, 6), within: 900 }]
    const crowd = me.crowd({ matrices, colours, levels })
    const cam = camera(reversed)
    draw(cam)
    const want = expected(matrices, levels, cam)
    levels.forEach((l, i) => {
      for (const mesh of l.meshes) {
        const got = drawn(mesh)
        expect(new Set(got).size).toBe(got.length)
        expect(new Set(got)).toEqual(want[i])
      }
    })
    const total = want.reduce((n, s) => n + s.size, 0)
    // a share of them: the view takes a slice of the square, the levels a disc of it
    expect(total).toBeGreaterThan(50)
    expect(total).toBeLessThan(3000 / 4)
    expect(crowd.drawn).toEqual(want.map(s => s.size))
    expect([crowd.copies, me.drawn]).toEqual([3000, total])
  }
})

test('a copy\'s colour goes with it, every mesh of a level is handed the same matrices and colours, and the meshes are ordered by level and bounded round what they draw', () => {
  const { me, scene, draw } = page()
  const { matrices, colours } = strew(1500, 3)
  const levels = [{ meshes: meshes(scene, 5), within: 200 }, { meshes: meshes(scene, 5), within: 700 }]
  me.crowd({ matrices, colours, levels })
  const cam = camera()
  draw(cam)
  const byKey = new Map(matrices.map((m, k) => [key(m), colours[k]]))
  const c = new THREE.Color(), m = new THREE.Matrix4()
  levels.forEach((l, i) => {
    const [a, b] = l.meshes
    expect(a.instanceMatrix).toBe(b.instanceMatrix)
    expect(a.instanceColor).toBe(b.instanceColor)
    expect(a.count).toBe(b.count)
    for (const mesh of l.meshes) {
      expect([mesh.renderOrder, mesh.frustumCulled]).toEqual([i, true])
      for (let j = 0; j < mesh.count; j++) {
        mesh.getMatrixAt(j, m)
        mesh.getColorAt(j, c)
        const want = byKey.get(key(m))!
        expect([c.r, c.g, c.b]).toEqual([want.r, want.g, want.b].map(Math.fround))
        // inside the bounds three culls and sorts the mesh by
        const s = a.geometry.boundingSphere!.clone().union(b.geometry.boundingSphere!).applyMatrix4(m)
        expect(mesh.boundingSphere!.distanceToPoint(s.center) + s.radius).toBeLessThanOrEqual(mesh.boundingSphere!.radius * 1.000001 + 1e-6)
      }
    }
  })
})

test('the copies are drawn nearest first, square by square', () => {
  const { me, scene, draw } = page()
  const { matrices } = strew(2500, 11)
  const levels = [{ meshes: meshes(scene, 6), within: 1000 }]
  me.crowd({ matrices, levels })
  const cam = camera()
  draw(cam)
  const eye = cam.position
  const mesh = levels[0].meshes[0], m = new THREE.Matrix4(), at = new THREE.Vector3()
  const far: number[] = []
  for (let j = 0; j < mesh.count; j++) {
    mesh.getMatrixAt(j, m)
    far.push(at.setFromMatrixPosition(m).distanceTo(eye))
  }
  expect(far.length).toBeGreaterThan(100)
  // by squares `cell` across (the copies' spheres a few metres more): none drawn after one farther than
  // a square's diagonal and two spheres past it
  const slack = SET.cell * Math.SQRT2 + 2 * 12
  for (let j = 1; j < far.length; j++) expect(far[j]).toBeGreaterThan(Math.max(...far.slice(0, j)) - slack - 2 * SET.cell * Math.SQRT2)
  // and on the whole near to far: the first tenth nearer than the last
  const tenth = Math.floor(far.length / 10)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  expect(mean(far.slice(0, tenth))).toBeLessThan(mean(far.slice(-tenth)) / 2)
})

test('a level that casts a shadow also draws the copies out of view whose shadows may fall in it: a directional light\'s shadow camera, a point light\'s reach', () => {
  const { me, scene, draw } = page()
  const { matrices } = strew(3000, 5, 600)
  const casting = meshes(scene, 8), plain = meshes(scene, 8)
  for (const m of casting) m.castShadow = true
  const levels = [{ meshes: casting, within: 150 }, { meshes: plain, within: 500 }]
  me.crowd({ matrices, levels })
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  sun.castShadow = true
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -90
  sc.right = sc.top = 90
  sc.near = 1
  sc.far = 600
  sc.updateProjectionMatrix()
  const cam = camera()
  sun.position.set(cam.position.x + 150, 40, cam.position.z - 200)
  sun.target.position.copy(cam.position)
  scene.add(sun, sun.target)
  draw(cam)
  sun.shadow.updateMatrices(sun)
  const want = expected(matrices, levels, cam, [{ frustum: sun.shadow.getFrustum().clone() }])
  expect(new Set(drawn(casting[0]))).toEqual(want[0])
  expect(new Set(drawn(plain[0]))).toEqual(want[1])
  // more than the view alone: copies behind the camera in the sun's shadow box
  const alone = expected(matrices, levels, cam)
  expect(want[0].size).toBeGreaterThan(alone[0].size)
  expect(want[1]).toEqual(alone[1])
  // the shadow box made bigger, the camera unmoved: drawn again through it
  sc.left = sc.bottom = -140
  sc.right = sc.top = 140
  sc.updateProjectionMatrix()
  draw(cam)
  sun.shadow.updateMatrices(sun)
  const wider = expected(matrices, levels, cam, [{ frustum: sun.shadow.getFrustum().clone() }])
  expect(wider[0].size).toBeGreaterThan(want[0].size)
  expect(new Set(drawn(casting[0]))).toEqual(wider[0])
  // a point light that casts: every copy its reach touches, one of no reach every copy
  sun.castShadow = false
  const lamp = new THREE.PointLight(0xffffff, 10, 60)
  lamp.castShadow = true
  lamp.position.set(cam.position.x - 40, 5, cam.position.z - 40)
  scene.add(lamp)
  draw(cam)
  const reach = new THREE.Sphere(lamp.position.clone(), 60)
  expect(new Set(drawn(casting[0]))).toEqual(expected(matrices, levels, cam, [{ reach }])[0])
  lamp.distance = 0
  draw(cam)
  expect(new Set(drawn(casting[0]))).toEqual(expected(matrices, levels, cam, [{ reach: new THREE.Sphere(lamp.position.clone(), Infinity) }])[0])
})

test('it follows the camera the scene is drawn through; drawn again through the same one, it writes nothing', () => {
  const { me, scene, draw } = page()
  const { matrices } = strew(2000, 9)
  const levels = [{ meshes: meshes(scene, 6), within: 300 }, { meshes: meshes(scene, 6), within: 900 }]
  me.crowd({ matrices, levels })
  const cam = camera()
  draw(cam)
  const version = levels.map(l => l.meshes[0].instanceMatrix.version)
  draw(cam)
  expect(levels.map(l => l.meshes[0].instanceMatrix.version)).toEqual(version)
  // turned and moved, and narrowed: what it sees now
  cam.position.set(-300, 20, 200)
  cam.lookAt(0, 0, -400)
  cam.fov = 35
  cam.updateProjectionMatrix()
  draw(cam)
  const want = expected(matrices, levels, cam)
  levels.forEach((l, i) => expect(new Set(drawn(l.meshes[0]))).toEqual(want[i]))
  expect(levels.map(l => l.meshes[0].instanceMatrix.version)).not.toEqual(version)
  // the upload covers the copies drawn and no more
  expect(levels[0].meshes[0].instanceMatrix.updateRanges).toEqual([{ start: 0, count: want[0].size * 16 }])
})

test('a forgotten crowd is written no more; one handed later is drawn with the rest', () => {
  const { me, scene, draw } = page()
  const a = strew(800, 1), b = strew(800, 2)
  const la = [{ meshes: meshes(scene, 6), within: 900 }], lb = [{ meshes: meshes(scene, 6), within: 900 }]
  const ca = me.crowd({ matrices: a.matrices, levels: la })
  const cam = camera()
  draw(cam)
  const was = la[0].meshes[0].count
  expect(was).toBeGreaterThan(0)
  me.crowd({ matrices: b.matrices, levels: lb })
  ca.forget()
  expect(me.crowds.length).toBe(1)
  cam.position.x += 200
  draw(cam)
  expect(la[0].meshes[0].count).toBe(was)
  expect(new Set(drawn(lb[0].meshes[0]))).toEqual(expected(b.matrices, lb, cam)[0])
})

test('split cuts a geometry into the tiles its triangles stand in, every triangle and attribute kept', () => {
  const { me } = page()
  const g = new THREE.PlaneGeometry(1000, 600, 50, 30).rotateX(-Math.PI / 2).translate(130, 0, -70)
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.getAttribute('position').count * 3 }, (_, i) => (i % 7) / 7), 3))
  const flat = g.toNonIndexed()
  const freed = vi.fn()
  g.addEventListener('dispose', freed)
  const pieces = me.split(g)
  expect(freed).toHaveBeenCalledTimes(1)
  // each triangle of the whole in one piece, the piece of its middle's tile, its attributes as they were
  const triangle = (geom: THREE.BufferGeometry, t: number) => ['position', 'normal', 'uv', 'color'].map(n => {
    const a = geom.getAttribute(n)
    return Array.from(a.array.slice(t * 3 * a.itemSize, (t + 1) * 3 * a.itemSize))
  })
  const all = new Map<string, number>()
  for (let t = 0; t < flat.getAttribute('position').count / 3; t++) all.set(JSON.stringify(triangle(flat, t)), (all.get(JSON.stringify(triangle(flat, t))) ?? 0) + 1)
  let count = 0
  for (const p of pieces) {
    const pos = p.getAttribute('position')
    const tiles = new Set<string>()
    for (let t = 0; t < pos.count / 3; t++) {
      const id = JSON.stringify(triangle(p, t))
      expect(all.get(id)).toBeGreaterThan(0)
      all.set(id, all.get(id)! - 1)
      const x = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3, z = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3
      tiles.add(`${Math.floor(x / SET.tile)},${Math.floor(z / SET.tile)}`)
      count++
    }
    expect(tiles.size).toBe(1)
    expect(p.boundingSphere).not.toBeNull()
  }
  expect(count).toBe(flat.getAttribute('position').count / 3)
  // a thousand by six hundred over hundred-metre tiles, off the grid: 11 by 7
  expect(pieces.length).toBe(11 * 7)
  const grouped = new THREE.BoxGeometry(1, 1, 1)
  expect(() => me.split(grouped)).toThrow('cull3d cannot split a geometry of groups or morph targets')
})

test('the scene\'s own hook still runs; closing gives it back, and under another plugin\'s hook leaves its own doing nothing', () => {
  const plugins: any = { wire: { rows: [], scene: { world: { cull3d: SET }, prefabs: {} } }, render3d: render3d() }
  const scene = plugins.render3d.scene as THREE.Scene
  const before = vi.fn()
  scene.onBeforeRender = before
  const me = cull3d()
  me.tick(plugins)
  const levels = [{ meshes: meshes(scene, 6), within: 900 }]
  me.crowd({ matrices: strew(500, 4).matrices, levels })
  const cam = camera()
  scene.onBeforeRender({} as never, scene, cam, null as never, undefined as never, undefined as never)
  expect(before).toHaveBeenCalledTimes(1)
  expect(levels[0].meshes[0].count).toBeGreaterThan(0)
  me.close()
  expect(scene.onBeforeRender).toBe(before)
  // under another's: its own hook stays and does nothing once closed
  const again = cull3d()
  again.tick(plugins)
  const ours = scene.onBeforeRender
  const theirs = vi.fn(function (this: THREE.Scene, ...a: Parameters<THREE.Scene['onBeforeRender']>) { ours.apply(this, a) })
  scene.onBeforeRender = theirs
  const late = [{ meshes: meshes(scene, 6), within: 900 }]
  again.crowd({ matrices: strew(500, 6).matrices, levels: late })
  again.close()
  expect(scene.onBeforeRender).toBe(theirs)
  scene.onBeforeRender({} as never, scene, cam, null as never, undefined as never, undefined as never)
  expect(late[0].meshes[0].count).toBe(0)
  expect(before).toHaveBeenCalledTimes(2)
})

test('what it cannot work with throws, naming it', () => {
  const bad = (s: unknown) => () => page({ cull3d: s })
  expect(bad(undefined)).toThrow('the scene names cull3d but gives no world.cull3d')
  expect(bad({ cell: 0, tile: 100 })).toThrow('cull3d cell 0 is not a number of metres above 0')
  expect(bad({ cell: 40, tile: -1 })).toThrow('cull3d tile -1 is not a number of metres above 0')
  expect(() => cull3d().tick({ wire: { scene: { world: { cull3d: SET } } } } as never)).toThrow('cull3d needs render3d, which this scene does not name')
  expect(() => cull3d().crowd({ matrices: [], levels: [] })).toThrow('cull3d has not ticked yet: list it before what hands it a crowd')
  expect(() => cull3d().split(new THREE.PlaneGeometry())).toThrow('cull3d has not ticked yet: list it before what hands it a split')
  const { me, scene } = page()
  const moved = meshes(scene, 4)
  moved[1].name = 'cones'
  moved[1].position.x = 3
  expect(() => me.crowd({ matrices: strew(10, 1).matrices, levels: [{ meshes: moved, within: 100 }] })).toThrow('cull3d: the mesh cones of a crowd does not stand at the world\'s origin, unturned and unscaled')
  expect(() => me.crowd({ matrices: strew(10, 1).matrices, colours: [], levels: [{ meshes: meshes(scene, 4), within: 100 }] })).toThrow('cull3d: a crowd of 10 copies handed 0 colours')
  expect(() => me.crowd({ matrices: [], levels: [] })).toThrow('cull3d: a crowd handed no levels')
})
