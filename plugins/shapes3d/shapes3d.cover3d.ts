// shapes3d's mod for cover3d (`addons/scenemanager`'s mods). A scene with `world.cover3d.mods: { solids:
// 'shapes3d', behaviors: 'shapes3d' }` has a body take cover behind shapes3d's shapes.
//
// `solids(w, x, z, r)` is every shape whose footprint reaches within r of (x, z) (`near`).
// `behaviors()` delivers cover3d `box`, where a body stands hidden behind a box (`behind`); cover3d has
// `cylinder` of its own.
import type { W } from '#engine/engine.ts'
import type { Behavior } from '#plugins/cover3d/cover3d.sim.ts'
import { behind, near } from './shapes3d.sim.ts'

export const solids = (w: W, x: number, z: number, r: number) => near(w, x, z, r).map(p => p.shape)

export const behaviors = (): Record<string, Behavior> => ({ box: behind })
