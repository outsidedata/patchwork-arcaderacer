// The kinds of a course, and the forest.scene.json file next to this one. Every course shares these
// kinds: tokyo.sim.ts and paris.sim.ts hand this `sim` out with their own scene files. Every number of
// a kind that never changes is its definition in `assets/arcaderacer.json`, which the manager's
// `world.defs` names; a course's own numbers are its course file, which its scene's `world.course`
// names. Each seat is its `player` row, the driver, and a racer's holds its `car`; where a racer's car
// starts is a `start` actor of the scene file, one per slot. The `match` row is the match plugin's,
// which the match addon keeps. A course that plays a song behind the race has a `music` actor.
import type { Scene, Sim } from '#engine/engine.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { loader } from '#plugins/loader/loader.sim.ts'
import { player } from './player.sim.ts'
import { car } from './car.sim.ts'
import { start } from './start.sim.ts'
import { circuit } from './circuit.sim.ts'
import { scenery } from './scenery.sim.ts'
import { race } from './race.sim.ts'
import { rival } from './rival.sim.ts'
import { match } from './plugins/match/match.sim.ts'
import { music } from './music.sim.ts'
import file from './forest.scene.json' with { type: 'json' }

export const sim: Sim = { scenemanager, loader, player, car, start, circuit, scenery, race, rival, match, music }

export const scene = file as Scene
