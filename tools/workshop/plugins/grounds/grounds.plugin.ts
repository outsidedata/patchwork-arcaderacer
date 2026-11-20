// The grass workshop's test grounds: a field of plain ground for grass3d to grow a grass on, and a treader
// that goes round it treading the grass down. It is a plugin of the workshop's own, listed by the
// workshop's stage as a game lists its own (`shipped`); `grounds.grass3d.ts` beside it hands grass3d the
// ground as its land, and `grounds.gpgpu3d.ts` hands gpgpu3d the treader. The arithmetic, and what a test
// ground and a treader are, is `grounds.sim.ts`.
//
// `world.grounds`:
//   field     `{ size, cell, grid }`: the field is `size` metres a side about the origin, its lattice points
//             `cell` metres apart, and a line is drawn on it every `grid` metres, on the lattice line
//             nearest that
//   colours   `{ ground, bare, line, treader }`: the ground under the grass, a bare patch, the lines and
//             the treader
//   grounds   name to a test ground
//   ground    the test ground shown, one of `grounds`
//   treader   the treader, read every frame
//
// Each frame, on this page's clock, a frame never longer than a thirtieth of a second: the ground named is
// built when it is another than the one drawn, one mesh through every lattice point on the triangles
// grass3d stands its blades on (each square cut from its corner at the least x and z to the one at the
// most), coloured from `ground` to `bare` by how much of it is grass, with the lines over it; then the
// treader is put where it stands now, a cylinder or a box for each part.
//
// It hands out `land()` (the ground shown as `grounds.grass3d.ts` hands it on, undefined until it is
// drawn), `things()` (the treader's parts as gpgpu3d's things), `height(x, z)` (the ground shown at a
// point), `at()` (the treader's middle on the ground now, [x, y, z]), `squares()` (the metres between the
// lines drawn) and `close()`.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from '#plugins/grass3d/grass3d.sim.ts'
import type { Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { groundOf, half, middleOf, treading, type Field, type Test, type Treader } from './grounds.sim.ts'

export type Numbers = {
  field: Field & { grid: number }
  colours: { ground: string; bare: string; line: string; treader: string }
  grounds: Record<string, Test>
  ground: string
  treader: Treader
}

// The longest frame the treader is moved by, seconds.
const LONGEST = 1 / 30

type Three = typeof import('three')
type Drawn = { key: string; ground: Ground; test: Test; field: Field; mesh: THREE.Mesh; lines: THREE.LineSegments; squares: number }

export function grounds() {
  let drawn: Drawn | undefined
  let parts: { key: string; meshes: THREE.Mesh[] } | undefined
  let standing: Thing[] = []
  let middle: [number, number, number] = [0, 0, 0]
  let last = -1
  let clock = 0

  function drop() {
    if (!drawn) return
    for (const o of [drawn.mesh, drawn.lines]) {
      o.removeFromParent()
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    drawn = undefined
  }
  function dropParts() {
    for (const m of parts?.meshes ?? []) {
      m.removeFromParent()
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    parts = undefined
  }

  function build(plugins: Plugins, n: Numbers, key: string) {
    const T = plugins.render3d.THREE as Three
    const test = n.grounds[n.ground]
    if (!test) throw new Error(`grounds: world.grounds.ground ${JSON.stringify(n.ground)} is none of ${Object.keys(n.grounds).join(', ')}`)
    const field = { size: n.field.size, cell: n.field.cell }
    const ground = groundOf(test, field)
    const H = half(field), side = 2 * H + 1, c = field.cell
    const position = new Float32Array(side * side * 3), colour = new Float32Array(side * side * 3)
    const grassy = new T.Color(n.colours.ground), bare = new T.Color(n.colours.bare), mixed = new T.Color()
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const x = (i - H) * c, z = (j - H) * c, v = (j * side + i) * 3
        position[v] = x; position[v + 1] = ground.height(x, z); position[v + 2] = z
        mixed.copy(bare).lerp(grassy, ground.cover(x, z))
        colour[v] = mixed.r; colour[v + 1] = mixed.g; colour[v + 2] = mixed.b
      }
    }
    const index = new Uint32Array(2 * H * 2 * H * 6)
    let k = 0
    for (let j = 0; j < 2 * H; j++) {
      for (let i = 0; i < 2 * H; i++) {
        const a = j * side + i, b = a + 1, d = a + side, e = d + 1
        index[k++] = a; index[k++] = e; index[k++] = b
        index[k++] = a; index[k++] = d; index[k++] = e
      }
    }
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.BufferAttribute(position, 3))
    geometry.setAttribute('color', new T.BufferAttribute(colour, 3))
    geometry.setIndex(new T.BufferAttribute(index, 1))
    geometry.computeVertexNormals()
    const mesh = new T.Mesh(geometry, plugins.render3d.dress(new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })))
    mesh.receiveShadow = true
    mesh.name = `grounds ${n.ground}`
    // the lines, through the ground's own points: every `every`-th lattice line each way
    const every = Math.max(1, Math.round(n.field.grid / c))
    const along: number[] = []
    for (let a = 0; a < side; a++) {
      if ((a - H) % every) continue
      for (let b = 0; b < 2 * H; b++) {
        along.push(a * side + b, a * side + b + 1)
        along.push(b * side + a, (b + 1) * side + a)
      }
    }
    const lined = new T.BufferGeometry()
    lined.setAttribute('position', geometry.getAttribute('position'))
    lined.setIndex(new T.BufferAttribute(new Uint32Array(along), 1))
    const lines = new T.LineSegments(lined, new T.LineBasicMaterial({ color: n.colours.line }))
    lines.name = 'grounds lines'
    const scene = plugins.render3d.scene as THREE.Scene
    scene.add(mesh, lines)
    drawn = { key, ground, test, field, mesh, lines, squares: every * c }
  }

  // A mesh for each part of the treader, in the order `treading` hands them back.
  function shape(plugins: Plugins, n: Numbers, key: string) {
    const T = plugins.render3d.THREE as Three
    const meshes = n.treader.parts.map(p => {
      const geometry = 'cylinder' in p
        ? new T.CylinderGeometry(p.cylinder.radius, p.cylinder.radius, p.cylinder.height, 32).translate(0, p.cylinder.height / 2, 0)
        : new T.BoxGeometry(2 * p.box.half[0], 2 * p.box.half[1], 2 * p.box.half[2])
      const mesh = new T.Mesh(geometry, plugins.render3d.dress(new T.MeshStandardMaterial({ color: n.colours.treader, roughness: 0.8, metalness: 0 })))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.name = 'grounds treader'
      ;(plugins.render3d.scene as THREE.Scene).add(mesh)
      return mesh
    })
    parts = { key, meshes }
  }

  return {
    land: () => drawn && { ground: drawn.ground, version: drawn.key, cell: drawn.field.cell, held: { test: drawn.test, field: drawn.field } },
    things: (): Thing[] => standing,
    height: (x: number, z: number) => (drawn ? drawn.ground.height(x, z) : 0),
    at: (): [number, number, number] => middle,
    squares: () => drawn?.squares ?? 0,

    tick(plugins: Plugins) {
      const n = plugins.wire.scene.world?.grounds as Numbers | undefined
      if (!n) return
      if (!plugins.render3d) throw new Error('grounds draws through render3d, and this scene does not list render3d')
      const key = `${n.ground} ${JSON.stringify([n.grounds[n.ground], n.field, n.colours])}`
      if (drawn && drawn.key !== key) drop()
      if (!drawn) build(plugins, n, key)
      const now = performance.now() / 1000
      const dt = last < 0 ? LONGEST : Math.min(LONGEST, Math.max(1e-4, now - last))
      last = now
      clock += dt
      const shaped = JSON.stringify([n.treader.parts, n.colours.treader])
      if (parts && parts.key !== shaped) dropParts()
      if (!parts) shape(plugins, n, shaped)
      // a part off the field is no thing, and its mesh is hidden
      const placed = treading(n.treader, drawn!.ground.height, clock)
      placed.forEach((thing, i) => {
        const mesh = parts!.meshes[i]
        mesh.visible = !!thing
        if (!thing) return
        if (thing.cylinder) mesh.position.fromArray(thing.cylinder.pos)
        else { mesh.position.fromArray(thing.hyperbox.at); mesh.quaternion.fromArray(thing.hyperbox.rot) }
      })
      standing = placed.filter(t => t !== undefined)
      const [x, z] = middleOf(n.treader, clock)
      middle = [x, drawn!.ground.height(x, z), z]
    },

    close() {
      drop()
      dropParts()
      standing = []
      middle = [0, 0, 0]
      last = -1
      clock = 0
    },
  }
}
