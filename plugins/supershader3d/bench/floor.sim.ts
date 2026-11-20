// The bench's one scene: the floor and the swatch lying on it (`bench.html`). Its catalogue is
// written by the page before the boot, from the looks file it is asked to measure.
import type { Scene, Sim } from '#engine/engine.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { loader } from '#plugins/loader/loader.sim.ts'
import { swatch } from './swatch.sim.ts'
import file from './floor.scene.json' with { type: 'json' }

export const sim: Sim = { scenemanager, loader, swatch }

export const scene = file as Scene
