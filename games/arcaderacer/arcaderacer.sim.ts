// The manager. One row, naming every scene of the game and the one every connection enters.
import type { Sim } from '#engine/engine.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'

export const sim: Sim = { scenemanager }
