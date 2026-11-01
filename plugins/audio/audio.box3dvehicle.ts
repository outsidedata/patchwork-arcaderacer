// audio's mod for box3dvehicle (`addons/scenemanager`'s mods). A scene with
// `world.box3dvehicle.mods: { sound: 'audio' }` plays each car's engine through audio: its volume, its
// listener and its context.
//
// `sound(plugins)` is how this page plays an engine's loops: `decode(bytes)`, a file's bytes decoded on
// audio's context into an AudioBuffer, and `hold(buffer, holding)`, audio's `hold` (`audio.plugin.ts`),
// `buffer` repeated from now, as `holding` starts it, until the car stops it. It is undefined where the
// page has no Web Audio, as in node, so a car there reads no loop it could not decode.
import type { Plugins } from '#engine/browser.ts'
import type { Held, Holding } from './audio.plugin.ts'

export type Sounding = { decode(bytes: ArrayBuffer): Promise<AudioBuffer>; hold(buffer: AudioBuffer, holding: Holding): Held }

export const sound = (plugins: Plugins): Sounding | undefined => {
  const context: AudioContext | undefined = plugins.audio.context
  if (!context) return undefined
  return {
    decode: bytes => context.decodeAudioData(bytes),
    hold: (buffer, holding) => plugins.audio.hold(plugins, buffer, holding)!,
  }
}
