// terrain3d's mod of the loader (`addons/scenemanager`'s mods). A scene with `world.loader.mods: { ready:
// ['terrain3d'] }` keeps the loader's loading screen up until the land where the camera starts is on the
// scene, so the game never starts in a world with no ground.
//
// `ready(plugins)` is terrain3d's browser half's `shown()`. With `world.terrain3d.preload`, that is false
// until the camera's first place is done: every ring built, every map landed or failed, and every plugin
// `world.terrain3d.mods.ready` names done with its share (lod3d's tiles through `lod3d.terrain3d.ts`), so
// one line here waits on the trees too. Without `preload` the land is on the scene from the first frame
// and the screen does not wait on it.
import type { Plugins } from '#engine/browser.ts'

export const ready = (plugins: Plugins): boolean => plugins.terrain3d.shown()
