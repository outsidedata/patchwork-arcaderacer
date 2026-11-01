// The title: the lobby, a plain seat on the course select, and the title.scene.json file next to this
// one. It is played on Tokyo's circuit and land (its `world.seed` and `world.course` are Tokyo's), and
// its own catalogue holds only what that course draws, so a page has the whole set before it is shown.
//
// First the intro: core's cutscene, its cue file the scene's `world.cutscene.script`
// (`assets/intro.json`, written by `assets/intro.ts` from the race itself): the camera's cuts and
// sweeps, the bars and the fades, and no words. Its cast are the scene's eight `rival` rows, a race of
// CPU drivers alone on the grid, each driving by its own pilot as it would on the course; the cutscene
// only films them. The `curtain` starts the intro and flags the race off in the same step, once the
// page has its models and textures, or after its wait (`curtain.sim.ts`), so the cars are where the cue
// file was written for them. The set is flat at height 0 for the cutscene (`cutscene(() => 0)`): every
// point the cue file gives is a world point, its height written in it.
//
// After it, the title: the `titlecard` is the game's name and the course select, each course's word,
// in 3D over the race, which runs on behind them for as long as the scene runs, its camera carrying on
// from the intro's last shot.
// The `match` row is the match plugin's, which the match addon keeps.
import type { Scene, Sim } from '#engine/engine.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { loader } from '#plugins/loader/loader.sim.ts'
import { cutscene } from '#plugins/cutscene/cutscene.sim.ts'
import { circuit } from './circuit.sim.ts'
import { scenery } from './scenery.sim.ts'
import { race } from './race.sim.ts'
import { rival } from './rival.sim.ts'
import { curtain } from './curtain.sim.ts'
import { titlecard } from './titlecard.sim.ts'
import { match } from './plugins/match/match.sim.ts'
import file from './title.scene.json' with { type: 'json' }

export const sim: Sim = { scenemanager, loader, circuit, scenery, race, rival, curtain, titlecard, match, cutscene: cutscene(() => 0) }

export const scene = file as Scene
