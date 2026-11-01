// The music's look: the song the course's file names (`music`, a loader `json` entry holding an
// audiodaw project, written by `assets/music/jungle.song.ts`) loaded into audiodaw on its first frame
// with its loop turned on, and played from the start once the page has had a key or a click, since a
// browser lets audio start only after one. Tone's timing for it is the scene's `world.audiodaw`.
// Leaving the scene stops the song and throws its Tone objects away.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Project } from '#plugins/audiodaw/audiodaw.sim.ts'
import type { audiodaw as Daw } from '#plugins/audiodaw/audiodaw.plugin.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { courseOf } from './plugins/track/track.sim.ts'

type Audio = ReturnType<typeof Daw>

let loaded = false
let started = false

export function setup() {
  loaded = false
  started = false
}

export function tick(_row: Row, plugins: Plugins) {
  const daw = plugins.audiodaw as Audio
  if (!loaded) {
    loaded = true
    daw.load(json(plugins.wire, courseOf(plugins.wire).music) as Project)
    daw.cycle(true)
  }
  if (started || !navigator.userActivation.hasBeenActive) return
  started = true
  void daw.start().then(() => daw.play(0))
}

export function remove(plugins: Plugins) {
  const daw = plugins.audiodaw as Audio
  daw.stop()
  daw.dispose()
}
