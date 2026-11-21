// The hair workshop's test subjects: plain shapes for hair3d to grow a hair on, each carried by one bone,
// its anchor, which is moved, turned and run forward by numbers the page sets while it draws. It is a
// plugin of the workshop's own, listed by the workshop's stage as a game lists its own (`shipped`), and
// `subjects.hair3d.ts` beside it hands hair3d the subject as its one wearer.
//
// `world.subjects`:
//   subjects  name to a subject:
//               shape   one word and its numbers: `{ sphere: { radius } }`, `{ capsule: { radius, length,
//                       along } }` (`length` between its round ends, lying along `x`, `y` or `z`) or
//                       `{ plane: { size: [x, z] } }`, facing up. Metres, about the anchor.
//               height  metres the anchor stands over the ground at rest
//               on      where a hair grows on it: a hair's `on` (`hair3d.sim.ts`), which the workshop gives
//                       the hair it shows in place of the hair's own. Its one bone is `anchor`; +y is up
//                       and +z ahead.
//               ties    optional, `{ origin }`: the subject carries a hair's ties (`hair3d.sim.ts`, `ties`) on its
//                       one bone, as a head does. A tie names the bone of the game's body that carries it, a
//                       head bone whose origin is at the neck; `origin` is where that origin is in the
//                       anchor's frame, metres, and every place a tie gives is moved by it. A subject with
//                       none shows a hair with ties hanging loose
//               solids  `[{ bone, at, radius }]`, the balls the hair is kept out of, each `radius` metres
//                       round, `at` metres in the anchor's frame, which gpgpu3d holds (`subjects.gpgpu3d.ts`)
//   lap       metres the subject runs forward before it is put back where it began
//   skin      `{ colour, roughness }`, how every subject is drawn
//   subject   the subject shown, one of `subjects`
//   motion    how its anchor moves, read every frame:
//               forward  metres a second it runs ahead, toward +z
//               moves    waves, each `{ amplitude: [x, y, z], rate }`: the anchor is `amplitude` metres
//                        either way of its place, `rate` times a second, every wave added
//               turns    waves, each `{ amplitude: [x, y, z], rate }`: it is turned `amplitude` degrees
//                        either way about x (a nod), y (a shake) and z (a tilt), `rate` times a second
//               spin     [x, y, z] degrees a second it turns without end
//
// Each frame, on this page's clock, a frame never longer than a thirtieth of a second (hair3d's own): the
// subject named is built when it is another than the one drawn, a three SkinnedMesh of the one bone
// `anchor`, bound with the anchor at the skin's origin; then the anchor is placed `height` up, as far
// ahead as it has run, moved by its waves, and turned by its spin so far and its waves.
//
// It hands out `wearers()` (the subject as hair3d's wearer: its id `subject`, its kind its name, its skin
// its mesh under the word `skinned`), `at()` (where its place at rest is now, [x, y, z]), `mesh()` and
// `close()`.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Hair, Wearer } from '#plugins/hair3d/hair3d.sim.ts'

export type Wave = { amplitude: [number, number, number]; rate: number }
export type Motion = { forward: number; moves: Wave[]; turns: Wave[]; spin: [number, number, number] }
export type Shape = { sphere: { radius: number } } | { capsule: { radius: number; length: number; along: 'x' | 'y' | 'z' } } | { plane: { size: [number, number] } }
export type Solid = { bone: string; at: [number, number, number]; radius: number }
export type Subject = { shape: Shape; height: number; on: Hair['on']; solids: Solid[]; ties?: { origin: [number, number, number] } }
export type Numbers = {
  subjects: Record<string, Subject>
  lap: number
  skin: { colour: string; roughness: number }
  subject: string
  motion: Motion
}

// The longest frame the anchor is moved by, seconds: hair3d's.
const LONGEST = 1 / 30

// Every wave added, `t` seconds in: [x, y, z].
export function waved(waves: Wave[], t: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0]
  for (const w of waves) {
    const s = Math.sin(2 * Math.PI * w.rate * t)
    for (let a = 0; a < 3; a++) out[a] += w.amplitude[a] * s
  }
  return out
}

type Three = typeof import('three')
const shapes: Record<string, (T: Three, n: any) => THREE.BufferGeometry> = {
  sphere: (T, n: { radius: number }) => new T.SphereGeometry(n.radius, 48, 32),
  capsule: (T, n: { radius: number; length: number; along: 'x' | 'y' | 'z' }) => {
    const g = new T.CapsuleGeometry(n.radius, n.length, 16, 32)
    if (n.along === 'z') g.rotateX(Math.PI / 2)
    if (n.along === 'x') g.rotateZ(Math.PI / 2)
    return g
  },
  plane: (T, n: { size: [number, number] }) => new T.PlaneGeometry(n.size[0], n.size[1], 16, 16).rotateX(-Math.PI / 2),
}

export function subjects() {
  let drawn: { name: string; mesh: THREE.SkinnedMesh; bone: THREE.Bone; spun: THREE.Quaternion } | undefined
  let last = -1
  let clock = 0
  let run = 0
  let height = 0

  function drop() {
    if (!drawn) return
    drawn.mesh.removeFromParent()
    drawn.mesh.geometry.dispose()
    ;(drawn.mesh.material as THREE.Material).dispose()
    drawn.mesh.skeleton.dispose()
    drawn = undefined
  }

  function build(plugins: Plugins, n: Numbers) {
    const T = plugins.render3d.THREE as Three
    const s = n.subjects[n.subject]
    if (!s) throw new Error(`subjects: world.subjects.subject ${JSON.stringify(n.subject)} is none of ${Object.keys(n.subjects).join(', ')}`)
    const words = Object.keys(s.shape)
    const shape = words.length === 1 ? shapes[words[0]] : undefined
    if (!shape) throw new Error(`subjects: the subject ${n.subject}'s shape ${JSON.stringify(s.shape)} is not one of ${Object.keys(shapes).join(', ')} with its numbers`)
    const geometry = shape(T, (s.shape as Record<string, unknown>)[words[0]])
    const count = geometry.getAttribute('position').count
    const held = new Uint16Array(count * 4), share = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) share[i * 4] = 1
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(held, 4))
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(share, 4))
    const material = plugins.render3d.dress(new T.MeshStandardMaterial({ color: n.skin.colour, roughness: n.skin.roughness, metalness: 0, side: T.DoubleSide }))
    const mesh = new T.SkinnedMesh(geometry, material)
    const bone = new T.Bone()
    bone.name = 'anchor'
    mesh.add(bone)
    mesh.bind(new T.Skeleton([bone]))
    mesh.name = n.subject
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    ;(plugins.render3d.scene as THREE.Scene).add(mesh)
    drawn = { name: n.subject, mesh, bone, spun: new T.Quaternion() }
    height = s.height
    run = 0
  }

  return {
    wearers: (): Wearer[] => (drawn ? [{ id: 'subject', kind: drawn.name, skins: [{ skinned: drawn.mesh }] }] : []),
    at: (): [number, number, number] => [0, height, run],
    mesh: () => drawn?.mesh,

    tick(plugins: Plugins) {
      const n = plugins.wire.scene.world?.subjects as Numbers | undefined
      if (!n) return
      if (!plugins.render3d) throw new Error('subjects draws through render3d, and this scene does not list render3d')
      if (drawn && drawn.name !== n.subject) drop()
      if (!drawn) build(plugins, n)
      const T = plugins.render3d.THREE as Three
      const now = performance.now() / 1000
      const dt = last < 0 ? LONGEST : Math.min(LONGEST, Math.max(1e-4, now - last))
      last = now
      clock += dt
      const m = n.motion, d = drawn!
      run += m.forward * dt
      if (Math.abs(run) > n.lap) run = 0
      const rad = Math.PI / 180
      d.spun.multiply(new T.Quaternion().setFromEuler(new T.Euler(m.spin[0] * rad * dt, m.spin[1] * rad * dt, m.spin[2] * rad * dt, 'YXZ'))).normalize()
      const moved = waved(m.moves, clock), turned = waved(m.turns, clock)
      d.bone.position.set(moved[0], height + moved[1], run + moved[2])
      d.bone.quaternion.copy(d.spun).multiply(new T.Quaternion().setFromEuler(new T.Euler(turned[0] * rad, turned[1] * rad, turned[2] * rad, 'YXZ')))
    },

    close() {
      drop()
      last = -1
      clock = 0
      run = 0
    },
  }
}
