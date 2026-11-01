// scatter3d's mod for terrain3d (`addons/scenemanager`'s mods). A scene with
// `world.terrain3d.mods: { ready: ['scatter3d'] }` counts a place terrain3d prepares as done only once
// the scatter on it is placed too, so a preloading scene's land and its trees and grass arrive in the
// same frame, and a game waiting on `prepared().done` waits for both.
//
// `ready(plugins)` is scatter3d's browser half's `ready()`: whether every pack is built and every cell
// in reach of the prepared place is placed.
import type { Plugins } from '#engine/browser.ts'

export const ready = (plugins: Plugins): boolean => plugins.scatter3d.ready()
