// audio's mod for the cutscene (`addons/scenemanager`'s mods). A scene with
// `world.cutscene.mods: { play: 'audio' }` sounds the cutscene's sound and voice cues through audio's
// ledger.
//
// `play(w, cue, at?, from?)` raises the cue on the ledger row through its act `play`, reached with
// `w.call` as another plugin's row is: at the point `at`, or from the row `from`, or with no place
// given neither (`audio.sim.ts`'s `sound`).
import type { W } from '#engine/engine.ts'

export const play = (w: W, cue: string, at?: number[], from?: number) =>
  w.call(w.find('audio'), 'play', -1, cue, at?.[0] ?? null, at?.[1] ?? null, at?.[2] ?? null, from ?? null)
