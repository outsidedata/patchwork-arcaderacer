// shapes3d's mod for box3d (`addons/scenemanager`'s mods). A scene with `world.box3d.mods: { fixed:
// ['shapes3d'] }` has every shape of shapes3d's a thing in box3d's world that never moves: the bodies
// stand on it and run into it, and box3d names it by its row's id.
//
// `fixed(w)` is each shape (`shapes`, which leaves out the spaces) as a box3d Static at its row's
// `pos`, turned by its row's `yaw` about up, its shape its kind's `surface` (Box3D's b3SurfaceMaterial
// fields, `{ friction, restitution, rollingResistance, … }`, Box3D's own where left out), and the
// row's id, each by its word as solids draws it (`shapes3d.solids.ts`), so a body meets what is drawn:
//   box       a box `x` across, `y` tall and `z` long, its foot's middle at `pos`.
//   cylinder  the prism of its look's `sides` standing on `pos`, each side `radius` from its middle and
//             its corners out past it, `height` tall: Box3D's cylinder hull, its corners at the
//             prism's, turned half a side round so a flat side faces x, as solids draws it.
//   plane     the slab its look's `thick` deep under its surface, `x` across and as long as its
//             surface runs over its `z`, tilted up along its length by its `tilt`, its surface's middle
//             at `pos`.
//   hyperplane  the slab its look's `thick` deep under its face, `x` across and `z` long, turned by its
//             row's `rot`, its face's middle at `pos`.
// A cylinder's kind with no look's `sides`, and a plane's or a hyperplane's with no look's `thick`,
// throws, naming the kind: box3d stands each as the solid solids draws of those.
import type { W } from '#engine/engine.ts'
import type { Fixed, Material, Quat } from '#plugins/box3d/box3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { rotate, shapes, type Box, type Cylinder, type Hyperplane, type Kind, type Plane } from './shapes3d.sim.ts'

// A turn of `a` radians about up, as a quaternion.
const aboutY = (a: number): Quat => [0, math.sin(a / 2), 0, math.cos(a / 2)]
// A turn of `a` radians about x, then of `yaw` about up.
const aboutXY = (a: number, yaw: number): Quat => {
  const sx = math.sin(a / 2), cx = math.cos(a / 2), sy = math.sin(yaw / 2), cy = math.cos(yaw / 2)
  return [cy * sx, cx * sy, -sy * sx, cy * cx]
}

// Each word's Static, from the shape in the world, its kind and the row's yaw.
const stood: Record<string, (s: any, k: Kind, kind: string, yaw: number) => Omit<Fixed, 'id'>> = {
  box: (b: Box, k) => ({
    pos: [b.pos[0], b.pos[1] + b.size[1] / 2, b.pos[2]], rot: aboutY(b.yaw),
    shapes: [{ box: [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2], ...surfaced(k) }],
  }),
  cylinder(c: Cylinder, k, kind, yaw) {
    const sides = k.look?.sides
    if (sides === undefined) throw new Error(`shapes3d kind ${kind} is a cylinder, which box3d stands as the prism solids draws of its look's sides, and it gives no look with sides`)
    const corner = c.radius / math.cos(Math.PI / sides)
    return {
      pos: [c.pos[0], c.pos[1], c.pos[2]], rot: aboutY(yaw),
      shapes: [{ cylinder: { height: c.height, radius: corner, yOffset: 0, sides }, rot: aboutY(Math.PI / sides), ...surfaced(k) }],
    }
  },
  plane(p: Plane, k, kind) {
    const thick = k.look?.thick
    if (thick === undefined) throw new Error(`shapes3d kind ${kind} is a plane, which box3d stands as the slab solids draws of its look's thick, and it gives no look with thick`)
    const tilt = k.shape.plane.tilt ?? 0, h = thick / 2
    // The slab's middle, half its depth under the surface's middle along the surface's normal.
    const down = [h * math.sin(tilt) * math.sin(p.yaw), -h * math.cos(tilt), h * math.sin(tilt) * math.cos(p.yaw)]
    return {
      pos: [p.pos[0] + down[0], p.pos[1] + down[1], p.pos[2] + down[2]], rot: aboutXY(-tilt, p.yaw),
      shapes: [{ box: [p.size[0] / 2, h, p.size[1] / 2 / math.cos(tilt)], ...surfaced(k) }],
    }
  },
  hyperplane(p: Hyperplane, k, kind) {
    const thick = k.look?.thick
    if (thick === undefined) throw new Error(`shapes3d kind ${kind} is a hyperplane, which box3d stands as the slab solids draws of its look's thick, and it gives no look with thick`)
    const h = thick / 2
    // The slab's middle, half its depth under the face's middle along the face's normal.
    const down = rotate(p.rot, [0, -h, 0])
    return {
      pos: [p.pos[0] + down[0], p.pos[1] + down[1], p.pos[2] + down[2]], rot: [p.rot[0], p.rot[1], p.rot[2], p.rot[3]],
      shapes: [{ box: [p.size[0] / 2, h, p.size[1] / 2], ...surfaced(k) }],
    }
  },
}

const surfaced = (k: Kind): { baseMaterial?: Partial<Material> } => (k.surface ? { baseMaterial: k.surface } : {})

export function fixed(w: W): Fixed[] {
  const kinds = w.world.shapes3d.kinds as Record<string, Kind>
  return shapes(w).map(p => ({ id: p.id, ...stood[p.word](p.shape[p.word], kinds[p.kind], p.kind, w.get(p.id).data.yaw ?? 0) }))
}
