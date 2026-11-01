// shapes3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with `world.hitscan3d.mods: {
// solids: 'shapes3d', behaviors: 'shapes3d' }` has a shot stopped, and a sight blocked, by shapes3d's
// shapes.
//
// `solids(w, from, dir, far)` is every shape whose footprint the line's path over the ground passes
// (`along`), as hitscan3d's words take it. `behaviors()` delivers hitscan3d `box`, where a line meets a
// box (`lineBox`), `plane`, where a line meets a plane (`linePlane`), and `hyperplane`, where a line
// meets a hyperplane (`lineHyperplane`); hitscan3d has `cylinder` of its own.
import type { W } from '#engine/engine.ts'
import type { Behavior } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { along, lineBox, lineHyperplane, linePlane } from './shapes3d.sim.ts'

export const solids = (w: W, from: number[], dir: number[], far: number) => along(w, from, dir, far).map(p => p.shape)

export const behaviors = (): Record<string, Behavior> => ({ box: lineBox, plane: linePlane, hyperplane: lineHyperplane })
