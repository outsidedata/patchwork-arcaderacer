// lod3d's mod for cover3d (`addons/scenemanager`'s mods). A scene with `world.cover3d.mods: { solids:
// 'lod3d' }` has a body take cover behind lod3d's solid instances, each as tall as its row's `tall` times
// its size, or without end.
//
// `solids(w, x, z, r)` is `lod3d.walker.ts`'s `solids` there.
import type { W } from '#engine/engine.ts'
import { solids as over } from './lod3d.walker.ts'

export const solids = (w: W, x: number, z: number, r: number) => over(w, x, z, r)
