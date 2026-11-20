// render3d's mod of the loader: how many things render3d is still compiling shaders for, so the loader's
// loading screen waits on them and says so. A scene names it in `world.loader.mods.shaders: 'render3d'`
// and lists render3d in its `plugins`.
import type { Plugins } from '#engine/browser.ts'

export const shaders = (plugins: Plugins): number => plugins.render3d.compiling()
