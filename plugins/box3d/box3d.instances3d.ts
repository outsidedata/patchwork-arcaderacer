// box3d's mod for instances3d (`addons/scenemanager`'s mods). A scene with
//
//   "instances3d": { "mods": { "instances": ["box3d"], "behaviors": ["box3d"] },
//                    "kinds": { "crate": { "body": {}, "colour": "#b07a43", "roughness": 0.8, "lods": [0], "shadow": 1, "leaf": 0 } } }
//
// has every row of a kind instances3d names drawn as one instance of that kind's body, where box3d has it.
//
// `instances(plugins)` is `{ kind, at, rot }` for every row this page has of a kind `world.box3d.kinds`
// lists: its `pos` and `rot`.
// `behaviors()` is `{ body }`: the geometry of a look that gives `body` is its row's kind's shapes in
// `world.box3d.kinds`, each as Box3D holds it: a box as a box of its half extents, a sphere and a capsule
// as themselves, and a hull, a cylinder, a cone and a rock as the convex hull of the vertices Box3D gives
// that hull, so a cylinder of 24 sides is drawn with its 24 flat sides and a rock is the very rock Box3D
// collides. A shape's `pos`, `rot` and `scale` place it in the body. A kind box3d does not list, or a
// mesh, height field or compound shape, throws naming it.
import type { Plugins } from '#engine/browser.ts'
import type { Geometry, Part, Tools } from '#plugins/instances3d/instances3d.sim.ts'
import type { Placed } from '#plugins/instances3d/instances3d.plugin.ts'
import { b3, type Shape, type World } from './box3d.sim.ts'

export function instances(plugins: Plugins): Placed[] {
  const kinds = (plugins.wire.scene.world!.box3d as World).kinds
  return plugins.wire.rows.filter(r => kinds[r.kind]).map(r => ({ kind: r.kind, at: r.data.pos, rot: r.data.rot }))
}

// The vertices of the hull Box3D makes of a hull-shaped geometry, as [x, y, z] points.
function hullPoints(s: Shape): number[][] {
  const hull = 'hull' in s ? b3.b3CreateHull(s.hull.points)
    : 'cylinder' in s ? b3.b3CreateCylinder(s.cylinder.height, s.cylinder.radius, s.cylinder.yOffset, s.cylinder.sides)
    : 'cone' in s ? b3.b3CreateCone(s.cone.height, s.cone.radius1, s.cone.radius2, s.cone.slices)
    : 'rock' in s ? b3.b3CreateRock(s.rock.radius)
    : undefined
  if (!hull) throw new Error(`box3d made no hull of ${JSON.stringify(s)}`)
  const flat = [...b3.b3GetHullVertices(hull)] as number[]
  b3.b3DestroyHull(hull)
  const out: number[][] = []
  for (let k = 0; k + 2 < flat.length; k += 3) out.push([flat[k], flat[k + 1], flat[k + 2]])
  return out
}

function part(s: Shape, { THREE, convex }: Tools, kind: string): Part {
  if ('box' in s) { const [x, y, z] = s.box; return { geometry: new THREE.BoxGeometry(2 * x, 2 * y, 2 * z), at: s.pos, turn: s.rot, size: s.scale } }
  if ('sphere' in s) return { geometry: new THREE.SphereGeometry(s.sphere.radius, 32, 16), at: s.sphere.center }
  if ('capsule' in s) {
    const { center1: a, center2: b, radius } = s.capsule
    const along = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const length = along.length()
    const turn = length > 0 ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize()) : new THREE.Quaternion()
    return { geometry: new THREE.CapsuleGeometry(radius, length, 12, 24), at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], turn: turn.toArray() }
  }
  if ('hull' in s || 'cylinder' in s || 'cone' in s || 'rock' in s) return { geometry: convex(hullPoints(s)), at: s.pos, turn: s.rot, size: s.scale }
  throw new Error(`box3d draws ${kind}'s boxes, spheres, capsules and hulls for instances3d, and no ${Object.keys(s).find(k => ['mesh', 'heightField', 'compound'].includes(k))}`)
}

export function behaviors(): Record<string, Geometry> {
  return {
    body: {
      parts(_data, kind, tools, world) {
        const body = (world.box3d as World | undefined)?.kinds?.[kind]
        if (!body) throw new Error(`instances3d draws ${kind}'s body, and world.box3d.kinds lists no ${kind}`)
        return body.shapes.map(s => part(s, tools, kind))
      },
    },
  }
}
